import { randomUUID } from "node:crypto";
import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { getProfileByAuthContext } from "../profile/profile.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import {
  createAppointmentSchedule,
  deleteAppointmentSchedulesByIds,
  getAppointmentBreaksBySpecialist,
  getAppointmentBreaksBySpecialistAndDays,
  getAppointmentClientNoShowSummary,
  getAppointmentDayKeys,
  getAppointmentScheduleTargetsByScope,
  getAppointmentSchedulesByRange,
  getAppointmentSettingsByOrganization,
  getAppointmentSpecialistsByOrganization,
  hasAppointmentScheduleConflict,
  saveAppointmentSettings,
  toAppointmentDayNum,
  replaceAppointmentBreaksBySpecialist,
  updateAppointmentScheduleByIdWithRepeatMeta,
  updateAppointmentSchedulesByIds,
  withAppointmentTransaction
} from "./appointment-settings.service.js";

const DAY_KEYS = getAppointmentDayKeys();
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const APPOINTMENT_STATUS_SET = new Set(["pending", "confirmed", "cancelled", "no-show"]);
const MAX_RECURRING_RANGE_DAYS = 366;
const SCHEDULE_SCOPE_SET = new Set(["single", "future", "all"]);
const APPOINTMENT_HISTORY_LOCK_DAYS = 10;
const REMINDER_CHANNEL_SET = new Set(["sms", "email", "telegram"]);
const BREAK_TYPE_SET = new Set(["lunch", "meeting", "training", "other"]);
const DAY_NUM_TO_KEY = Object.freeze({
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
  7: "sun"
});

function parsePositiveIntegerOr(value, fallback = 1) {
  return parsePositiveInteger(value) ?? fallback;
}

function parseNullableBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function normalizeVisibleWeekDays(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = Array.from(
    new Set(
      value
        .map((dayKey) => String(dayKey || "").trim().toLowerCase())
        .filter((dayKey) => DAY_KEYS.includes(dayKey))
    )
  );

  return normalized.sort((a, b) => toAppointmentDayNum(a) - toAppointmentDayNum(b));
}

function normalizeDurationOptions(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(",");

  return Array.from(
    new Set(
      source
        .map((item) => Number.parseInt(String(item ?? "").trim(), 10))
        .filter((item) => Number.isInteger(item) && item > 0 && item <= 1440)
    )
  );
}

function normalizeReminderChannels(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || "").trim().toLowerCase())
        .filter((item) => REMINDER_CHANNEL_SET.has(item))
    )
  );
}

function normalizeBreakType(value) {
  const normalized = String(value || "lunch").trim().toLowerCase();
  return BREAK_TYPE_SET.has(normalized) ? normalized : "";
}

function normalizeBreakItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const dayOfWeekRaw = Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10);
    const dayOfWeek = Number.isInteger(dayOfWeekRaw) && dayOfWeekRaw >= 1 && dayOfWeekRaw <= 7
      ? dayOfWeekRaw
      : toAppointmentDayNum(item?.dayKey);
    return {
      dayOfWeek,
      breakType: normalizeBreakType(item?.breakType),
      title: String(item?.title || "").trim(),
      note: String(item?.note || "").trim(),
      startTime: String(item?.startTime || "").trim(),
      endTime: String(item?.endTime || "").trim(),
      isActive: item?.isActive !== false
    };
  });
}

function normalizeWorkingHours(value) {
  const workingHours = {};

  DAY_KEYS.forEach((dayKey) => {
    const dayValue = (value && typeof value === "object") ? value[dayKey] : null;
    const start = String(dayValue?.start || "").trim();
    const end = String(dayValue?.end || "").trim();
    workingHours[dayKey] = { start, end };
  });

  return workingHours;
}

function normalizeAppointmentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeScheduleScope(value) {
  const normalized = String(value || "single").trim().toLowerCase();
  if (!SCHEDULE_SCOPE_SET.has(normalized)) {
    return "";
  }
  return normalized;
}

function normalizeAppointmentSettingsScope(value) {
  return String(value || "").trim().toLowerCase() === "vip" ? "vip" : "default";
}

function getHistoryLockCutoffDateYmd() {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  todayUtc.setUTCDate(todayUtc.getUTCDate() - APPOINTMENT_HISTORY_LOCK_DAYS);
  return formatUtcDateYmd(todayUtc);
}

function findLockedHistoryDate(value) {
  const cutoffDate = getHistoryLockCutoffDateYmd();
  const dates = Array.isArray(value) ? value : [value];
  for (const dateValue of dates) {
    const normalized = String(dateValue || "").trim();
    if (!DATE_REGEX.test(normalized)) {
      continue;
    }
    if (normalized <= cutoffDate) {
      return {
        date: normalized,
        cutoffDate
      };
    }
  }
  return null;
}

function getHistoryLockErrorForRequester(requester, appointmentDates) {
  if (Boolean(requester?.is_admin)) {
    return null;
  }
  const locked = findLockedHistoryDate(appointmentDates);
  if (!locked) {
    return null;
  }
  return {
    field: "appointmentDate",
    message: `History is locked for non-admin users on or before ${locked.cutoffDate}. Requested date: ${locked.date}.`
  };
}

function createRouteError(statusCode, payload) {
  const error = new Error(payload?.message || "Request failed.");
  error.statusCode = statusCode;
  error.payload = payload;
  return error;
}

function isUniqueOrExclusionConflict(error) {
  return error?.code === "23505" || error?.code === "23P01";
}

function parseDateYmdToUtcDate(value) {
  const raw = String(value || "").trim();
  if (!DATE_REGEX.test(raw)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = raw.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatUtcDateYmd(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }
  const year = String(value.getUTCFullYear());
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDayKeyFromUtcDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }
  const dayNum = value.getUTCDay() === 0 ? 7 : value.getUTCDay();
  return DAY_NUM_TO_KEY[dayNum] || "";
}

function toDayNumFromUtcDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return 0;
  }
  return value.getUTCDay() === 0 ? 7 : value.getUTCDay();
}

function toDayNumFromDateYmd(value) {
  return toDayNumFromUtcDate(parseDateYmdToUtcDate(value));
}

function toTimeMinutes(value) {
  const raw = String(value || "").trim();
  if (!TIME_REGEX.test(raw)) {
    return null;
  }
  const [hoursRaw, minutesRaw] = raw.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  return (hours * 60) + minutes;
}

function getDurationMinutesFromTimes(startTime, endTime) {
  const start = toTimeMinutes(startTime);
  const end = toTimeMinutes(endTime);
  if (start === null || end === null || end <= start) {
    return 0;
  }
  return end - start;
}

function collectDayNumsFromDates(dates) {
  return Array.from(
    new Set(
      (Array.isArray(dates) ? dates : [])
        .map((dateValue) => toDayNumFromDateYmd(dateValue))
        .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7)
    )
  );
}

function buildBreakRangesByDay(rows) {
  const byDay = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const dayNum = Number.parseInt(String(row?.dayOfWeek ?? row?.day_of_week ?? "").trim(), 10);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 7) {
      return;
    }
    const start = toTimeMinutes(row?.startTime ?? row?.start_time);
    const end = toTimeMinutes(row?.endTime ?? row?.end_time);
    if (start === null || end === null || start >= end) {
      return;
    }
    const title = String(row?.title || "").trim();
    const breakTypeRaw = String(row?.breakType ?? row?.break_type ?? "").trim().toLowerCase();
    const breakTypeLabel = breakTypeRaw
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ")
      .trim();
    const reason = title || breakTypeLabel || "Break";

    const list = byDay.get(dayNum) || [];
    list.push({ start, end, reason });
    byDay.set(dayNum, list);
  });
  return byDay;
}

function hasSpecialistBreakConflict({
  breakRangesByDay,
  appointmentDate,
  startTime,
  endTime
}) {
  const dayNum = toDayNumFromDateYmd(appointmentDate);
  if (!Number.isInteger(dayNum) || dayNum <= 0) {
    return false;
  }
  const ranges = breakRangesByDay instanceof Map ? (breakRangesByDay.get(dayNum) || []) : [];
  if (ranges.length === 0) {
    return false;
  }
  const start = toTimeMinutes(startTime);
  const end = toTimeMinutes(endTime);
  if (start === null || end === null || start >= end) {
    return null;
  }
  const conflict = ranges.find((range) => start < range.end && range.start < end);
  if (!conflict) {
    return null;
  }
  return {
    start: conflict.start,
    end: conflict.end,
    reason: String(conflict.reason || "Break").trim() || "Break"
  };
}

function buildBreakConflictMessage({
  conflict,
  appointmentDate = ""
}) {
  const reason = String(conflict?.reason || "Break").trim() || "Break";
  const dateValue = String(appointmentDate || "").trim();
  if (dateValue) {
    return `Break conflict on ${dateValue}: ${reason}.`;
  }
  return `Selected time conflicts with specialist break: ${reason}.`;
}

function validateSlotAgainstWorkingHours({
  settings,
  appointmentDate,
  startTime,
  endTime
}) {
  const date = parseDateYmdToUtcDate(appointmentDate);
  if (!date) {
    return { field: "appointmentDate", message: "Invalid appointment date." };
  }
  const dayKey = toDayKeyFromUtcDate(date);
  if (!dayKey) {
    return { field: "appointmentDate", message: "Invalid appointment date." };
  }

  const normalizedVisibleWeekDays = normalizeVisibleWeekDays(settings?.visibleWeekDays);
  const effectiveVisibleWeekDays = normalizedVisibleWeekDays.length > 0
    ? normalizedVisibleWeekDays
    : DAY_KEYS;
  if (!effectiveVisibleWeekDays.includes(dayKey)) {
    return { field: "appointmentDate", message: `Selected day ${dayKey} is not available.` };
  }

  const dayHours = settings?.workingHours?.[dayKey] || {};
  const dayStart = String(dayHours.start || "").trim();
  const dayEnd = String(dayHours.end || "").trim();
  if (!TIME_REGEX.test(dayStart) || !TIME_REGEX.test(dayEnd) || dayStart >= dayEnd) {
    return {
      field: `workingHours.${dayKey}`,
      message: `Working hours are not configured for ${dayKey}.`
    };
  }

  if (startTime < dayStart || endTime > dayEnd) {
    return {
      field: "startTime",
      message: `Selected time is outside working hours for ${dayKey}.`
    };
  }

  return null;
}

function normalizeScheduleRepeatPayload(value) {
  const repeat = (value && typeof value === "object") ? value : {};
  const enabled = Boolean(repeat.enabled);
  const type = String(repeat.type || "weekly").trim().toLowerCase();
  const untilDate = String(repeat.untilDate || "").trim();
  const dayKeys = normalizeVisibleWeekDays(Array.isArray(repeat.dayKeys) ? repeat.dayKeys : []);
  const skipConflicts = repeat.skipConflicts !== false;

  return {
    enabled,
    type,
    untilDate,
    dayKeys,
    skipConflicts
  };
}

function validateScheduleRepeatPayload(repeat, appointmentDate) {
  if (!repeat.enabled) {
    return null;
  }
  if (repeat.type !== "weekly") {
    return { field: "repeat", message: "Only weekly repeat is supported." };
  }
  if (!DATE_REGEX.test(repeat.untilDate)) {
    return { field: "repeatUntil", message: "Invalid repeat end date." };
  }
  if (repeat.untilDate < appointmentDate) {
    return { field: "repeatUntil", message: "Repeat end date must be on or after appointment date." };
  }
  if (!Array.isArray(repeat.dayKeys) || repeat.dayKeys.length === 0) {
    return { field: "repeatDays", message: "Select at least one repeat day." };
  }

  const startDate = parseDateYmdToUtcDate(appointmentDate);
  const endDate = parseDateYmdToUtcDate(repeat.untilDate);
  if (!startDate || !endDate) {
    return { field: "repeatUntil", message: "Invalid repeat date range." };
  }

  const rangeDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (rangeDays > MAX_RECURRING_RANGE_DAYS) {
    return {
      field: "repeatUntil",
      message: "Repeat range is too long (max 366 days)."
    };
  }

  return null;
}

function validateRepeatDaysAgainstVisibleWeekDays({
  repeatDayKeys,
  visibleWeekDayKeys
}) {
  const requested = normalizeVisibleWeekDays(Array.isArray(repeatDayKeys) ? repeatDayKeys : []);
  const visible = normalizeVisibleWeekDays(Array.isArray(visibleWeekDayKeys) ? visibleWeekDayKeys : []);
  const allowedVisible = visible.length > 0 ? visible : DAY_KEYS;
  const allowedSet = new Set(allowedVisible);
  const invalid = requested.filter((dayKey) => !allowedSet.has(dayKey));

  if (invalid.length > 0) {
    return {
      error: {
        field: "repeatDays",
        message: "Repeat days must match Appointment Settings visible week days."
      },
      normalizedDayKeys: []
    };
  }

  return {
    error: null,
    normalizedDayKeys: requested
  };
}

function buildWeeklyRecurringDates({
  startDate,
  untilDate,
  dayKeys
}) {
  const start = parseDateYmdToUtcDate(startDate);
  const end = parseDateYmdToUtcDate(untilDate);
  if (!start || !end || end < start) {
    return [];
  }

  const activeDayKeys = new Set(
    (Array.isArray(dayKeys) ? dayKeys : [])
      .map((day) => String(day || "").trim().toLowerCase())
      .filter((day) => DAY_KEYS.includes(day))
  );
  if (activeDayKeys.size === 0) {
    return [];
  }

  const dates = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const dayKey = toDayKeyFromUtcDate(cursor);
    if (activeDayKeys.has(dayKey)) {
      dates.push(formatUtcDateYmd(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function validateSchedulePayload({
  specialistId,
  clientId,
  appointmentDate,
  startTime,
  endTime,
  durationMinutes,
  serviceName,
  status,
  note
}) {
  const errors = {};

  if (!Number.isInteger(specialistId) || specialistId <= 0) {
    errors.specialistId = "Specialist is required.";
  }
  if (!Number.isInteger(clientId) || clientId <= 0) {
    errors.clientId = "Client is required.";
  }
  if (!DATE_REGEX.test(appointmentDate)) {
    errors.appointmentDate = "Invalid appointment date.";
  }
  if (!TIME_REGEX.test(startTime)) {
    errors.startTime = "Invalid start time.";
  }
  if (!TIME_REGEX.test(endTime)) {
    errors.endTime = "Invalid end time.";
  }
  if (TIME_REGEX.test(startTime) && TIME_REGEX.test(endTime) && startTime >= endTime) {
    errors.endTime = "End time must be after start time.";
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    errors.durationMinutes = "Invalid duration.";
  }
  if (TIME_REGEX.test(startTime) && TIME_REGEX.test(endTime) && startTime < endTime && Number.isInteger(durationMinutes) && durationMinutes > 0) {
    const diffMinutes = getDurationMinutesFromTimes(startTime, endTime);
    if (diffMinutes !== durationMinutes) {
      errors.durationMinutes = "Duration must match start and end time.";
    }
  }
  if (!serviceName) {
    errors.service = "Service is required.";
  } else if (serviceName.length > 128) {
    errors.service = "Service is too long (max 128).";
  }
  if (!APPOINTMENT_STATUS_SET.has(status)) {
    errors.status = "Invalid status.";
  }
  if (note.length > 255) {
    errors.note = "Note is too long (max 255).";
  }

  return errors;
}

function validateSettingsPayload({
  slotIntervalMinutes,
  appointmentDurationMinutes,
  appointmentDurationOptionsMinutes,
  noShowThreshold,
  reminderHours,
  reminderChannels,
  visibleWeekDays,
  workingHours
}) {
  if (slotIntervalMinutes <= 0 || slotIntervalMinutes > 1440) {
    return { field: "slotInterval", message: "Slot interval must be between 1 and 1440 minutes." };
  }
  if (appointmentDurationMinutes <= 0 || appointmentDurationMinutes > 1440) {
    return { field: "appointmentDuration", message: "Appointment duration must be between 1 and 1440 minutes." };
  }
  if (!Array.isArray(appointmentDurationOptionsMinutes) || appointmentDurationOptionsMinutes.length === 0) {
    return { field: "appointmentDurationOptions", message: "At least one appointment duration is required." };
  }
  if (appointmentDurationOptionsMinutes.length > 20) {
    return { field: "appointmentDurationOptions", message: "Maximum 20 duration options are allowed." };
  }
  if (appointmentDurationOptionsMinutes.some((value) => value <= 0 || value > 1440)) {
    return { field: "appointmentDurationOptions", message: "Each duration must be between 1 and 1440 minutes." };
  }
  if (noShowThreshold < 1 || noShowThreshold > 1000) {
    return { field: "noShowThreshold", message: "No-show threshold must be between 1 and 1000." };
  }
  if (reminderHours < 1 || reminderHours > 1000) {
    return { field: "reminderHours", message: "Reminder hours must be between 1 and 1000." };
  }
  if (!Array.isArray(reminderChannels) || reminderChannels.length === 0) {
    return { field: "reminderChannels", message: "Select at least one reminder channel." };
  }
  if (reminderChannels.some((item) => !REMINDER_CHANNEL_SET.has(item))) {
    return { field: "reminderChannels", message: "Invalid reminder channel." };
  }
  if (!Array.isArray(visibleWeekDays) || visibleWeekDays.length === 0) {
    return { field: "visibleWeekDays", message: "At least one visible week day is required." };
  }

  for (const dayKey of DAY_KEYS) {
    const start = String(workingHours?.[dayKey]?.start || "").trim();
    const end = String(workingHours?.[dayKey]?.end || "").trim();
    const hasStart = Boolean(start);
    const hasEnd = Boolean(end);

    if (hasStart && !TIME_REGEX.test(start)) {
      return { field: `workingHours.${dayKey}.start`, message: `Invalid start time for ${dayKey}.` };
    }
    if (hasEnd && !TIME_REGEX.test(end)) {
      return { field: `workingHours.${dayKey}.end`, message: `Invalid end time for ${dayKey}.` };
    }
    if (hasStart !== hasEnd) {
      return { field: `workingHours.${dayKey}`, message: `Start and end time must both be set for ${dayKey}.` };
    }
    if (hasStart && hasEnd && start >= end) {
      return { field: `workingHours.${dayKey}`, message: `End time must be after start time for ${dayKey}.` };
    }

    if (visibleWeekDays.includes(dayKey) && !(hasStart && hasEnd)) {
      return { field: `workingHours.${dayKey}`, message: `Working hours are required for visible day ${dayKey}.` };
    }
  }

  return null;
}

function validateBreaksPayload({ specialistId, items }) {
  if (!Number.isInteger(specialistId) || specialistId <= 0) {
    return { field: "specialistId", message: "Specialist is required." };
  }
  if (!Array.isArray(items)) {
    return { field: "items", message: "Break items are required." };
  }
  if (items.length > 200) {
    return { field: "items", message: "Too many break items (max 200)." };
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const dayOfWeek = Number.parseInt(String(item.dayOfWeek ?? "").trim(), 10);
    const breakType = normalizeBreakType(item.breakType);
    const startTime = String(item.startTime || "").trim();
    const endTime = String(item.endTime || "").trim();
    const title = String(item.title || "").trim();
    const note = String(item.note || "").trim();

    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      return { field: `items.${index}.dayOfWeek`, message: "Invalid break day." };
    }
    if (!breakType) {
      return { field: `items.${index}.breakType`, message: "Invalid break type." };
    }
    if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
      return { field: `items.${index}.time`, message: "Invalid break time." };
    }
    if (startTime >= endTime) {
      return { field: `items.${index}.time`, message: "Break end time must be after start time." };
    }
    if (title.length > 120) {
      return { field: `items.${index}.title`, message: "Break title is too long (max 120)." };
    }
    if (note.length > 255) {
      return { field: `items.${index}.note`, message: "Break note is too long (max 255)." };
    }
  }

  return null;
}

async function requireAppointmentsAccess(request, reply, requiredPermission = PERMISSIONS.APPOINTMENTS_READ) {
  const authContext = request.authContext;

  const requester = await getProfileByAuthContext(authContext);
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }

  if (!(await hasPermission(requester.role_id, requiredPermission))) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }

  return { authContext, requester };
}

async function appointmentSettingsRoutes(fastify) {
  fastify.get(
    "/specialists",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_READ);
        if (!access) {
          return;
        }

        const items = await getAppointmentSpecialistsByOrganization(access.authContext.organizationId);
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment specialists");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/client-no-show-summary",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_READ);
        if (!access) {
          return;
        }

        const clientId = parsePositiveIntegerOr(request.query?.clientId, 0);
        if (!clientId) {
          return reply.status(400).send({ field: "clientId", message: "Client is required." });
        }

        const item = await getAppointmentClientNoShowSummary({
          organizationId: access.authContext.organizationId,
          clientId
        });

        return reply.send({ item });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment client no-show summary");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/breaks",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_READ);
        if (!access) {
          return;
        }

        const specialistId = parsePositiveIntegerOr(request.query?.specialistId, 0);
        if (!specialistId) {
          return reply.status(400).send({ field: "specialistId", message: "Specialist is required." });
        }

        const items = await getAppointmentBreaksBySpecialist({
          organizationId: access.authContext.organizationId,
          specialistId
        });

        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment breaks");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.put(
    "/breaks",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_UPDATE);
        if (!access) {
          return;
        }

        const specialistId = parsePositiveIntegerOr(request.body?.specialistId, 0);
        const items = normalizeBreakItems(request.body?.items);

        const validationError = validateBreaksPayload({ specialistId, items });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const savedItems = await replaceAppointmentBreaksBySpecialist({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId,
          specialistId,
          items
        });

        return reply.send({
          message: "Appointment breaks updated.",
          items: savedItems
        });
      } catch (error) {
        if (isUniqueOrExclusionConflict(error)) {
          return reply.status(409).send({ message: "Duplicate break slot for this specialist." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid specialist." });
        }
        if (error?.code === "23514") {
          return reply.status(400).send({ message: "Invalid break data." });
        }
        request.log.error({ err: error }, "Error updating appointment breaks");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/schedules",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_READ);
        if (!access) {
          return;
        }

        const specialistId = parsePositiveIntegerOr(request.query?.specialistId, 0);
        const dateFrom = String(request.query?.dateFrom || "").trim();
        const dateTo = String(request.query?.dateTo || "").trim();
        const vipOnly = parseNullableBoolean(request.query?.vipOnly ?? request.query?.vip_only) === true;
        const recurringOnly = parseNullableBoolean(
          request.query?.recurringOnly ?? request.query?.recurring_only
        ) === true;

        if (!specialistId) {
          return reply.status(400).send({ field: "specialistId", message: "Specialist is required." });
        }
        if (!DATE_REGEX.test(dateFrom) || !DATE_REGEX.test(dateTo)) {
          return reply.status(400).send({ field: "dateRange", message: "Invalid date range." });
        }
        if (dateFrom > dateTo) {
          return reply.status(400).send({ field: "dateRange", message: "Invalid date range." });
        }

        const items = await getAppointmentSchedulesByRange({
          organizationId: access.authContext.organizationId,
          specialistId,
          dateFrom,
          dateTo,
          vipOnly,
          recurringOnly
        });

        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment schedules");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/schedules",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_CREATE);
        if (!access) {
          return;
        }

        const specialistId = parsePositiveIntegerOr(request.body?.specialistId, 0);
        const clientId = parsePositiveIntegerOr(request.body?.clientId, 0);
        const appointmentDate = String(request.body?.appointmentDate || "").trim();
        const startTime = String(request.body?.startTime || "").trim();
        const endTime = String(request.body?.endTime || "").trim();
        const requestedDurationMinutes = parsePositiveIntegerOr(request.body?.durationMinutes, 0);
        const durationMinutes = requestedDurationMinutes || getDurationMinutesFromTimes(startTime, endTime);
        const serviceName = String(request.body?.service || request.body?.serviceName || "").trim();
        const status = normalizeAppointmentStatus(request.body?.status || "pending");
        const note = String(request.body?.note || "").trim();
        const repeat = normalizeScheduleRepeatPayload(request.body?.repeat);
        const settingsScope = normalizeAppointmentSettingsScope(
          request.body?.settingsScope ?? request.query?.settingsScope
        );

        const errors = validateSchedulePayload({
          specialistId,
          clientId,
          appointmentDate,
          startTime,
          endTime,
          durationMinutes,
          serviceName,
          status,
          note
        });
        if (Object.keys(errors).length > 0) {
          return reply.status(400).send({ errors });
        }

        const repeatError = validateScheduleRepeatPayload(repeat, appointmentDate);
        if (repeatError) {
          return reply.status(400).send(repeatError);
        }

        if (repeat.enabled) {
          const settingsForRepeat = await getAppointmentSettingsByOrganization(
            access.authContext.organizationId,
            { scope: settingsScope }
          );
          const repeatDaysValidation = validateRepeatDaysAgainstVisibleWeekDays({
            repeatDayKeys: repeat.dayKeys,
            visibleWeekDayKeys: settingsForRepeat?.visibleWeekDays
          });
          if (repeatDaysValidation.error) {
            return reply.status(400).send(repeatDaysValidation.error);
          }

          const repeatDayKeys = repeatDaysValidation.normalizedDayKeys;
          if (repeatDayKeys.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "Select at least one repeat day."
            });
          }

          const recurringDates = buildWeeklyRecurringDates({
            startDate: appointmentDate,
            untilDate: repeat.untilDate,
            dayKeys: repeatDayKeys
          });
          if (recurringDates.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "No matching week days in selected range."
            });
          }
          const historyLockError = getHistoryLockErrorForRequester(access.requester, recurringDates);
          if (historyLockError) {
            return reply.status(403).send(historyLockError);
          }

          const repeatDayNums = repeatDayKeys
            .map((dayKey) => toAppointmentDayNum(dayKey))
            .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
          const repeatGroupKey = randomUUID();
          const shouldEnforceAvailability = status === "pending" || status === "confirmed";
          const breakRangesByDay = shouldEnforceAvailability
            ? buildBreakRangesByDay(
                await getAppointmentBreaksBySpecialistAndDays({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  dayNums: collectDayNumsFromDates(recurringDates)
                })
              )
            : new Map();
          const { createdItems, skippedDates } = await withAppointmentTransaction(async (db) => {
            const nextCreatedItems = [];
            const nextSkippedDates = [];
            let rootAssigned = false;

            for (const recurringDate of recurringDates) {
              if (shouldEnforceAvailability) {
                const workingHoursError = validateSlotAgainstWorkingHours({
                  settings: settingsForRepeat,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (workingHoursError) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(400, workingHoursError);
                }

                const recurringBreakConflict = hasSpecialistBreakConflict({
                  breakRangesByDay,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (recurringBreakConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: buildBreakConflictMessage({
                      conflict: recurringBreakConflict,
                      appointmentDate: recurringDate
                    })
                  });
                }

                const hasConflict = await hasAppointmentScheduleConflict({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  db
                });
                if (hasConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, { message: `Slot conflict on ${recurringDate}.` });
                }
              }

              try {
                const isRepeatRoot = !rootAssigned;
                const createdItem = await createAppointmentSchedule({
                  organizationId: access.authContext.organizationId,
                  actorUserId: access.authContext.userId,
                  specialistId,
                  clientId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  durationMinutes,
                  serviceName,
                  status,
                  note,
                  repeatGroupKey,
                  repeatType: "weekly",
                  repeatUntilDate: repeat.untilDate,
                  repeatDays: repeatDayNums,
                  repeatAnchorDate: appointmentDate,
                  isRepeatRoot,
                  db
                });
                if (createdItem) {
                  nextCreatedItems.push(createdItem);
                  if (isRepeatRoot) {
                    rootAssigned = true;
                  }
                }
              } catch (error) {
                if (isUniqueOrExclusionConflict(error) && repeat.skipConflicts) {
                  nextSkippedDates.push(recurringDate);
                  continue;
                }
                throw error;
              }
            }

            return {
              createdItems: nextCreatedItems,
              skippedDates: nextSkippedDates
            };
          });

          if (createdItems.length === 0) {
            return reply.status(409).send({
              message: "No appointments were created. All selected slots conflict with existing appointments.",
              summary: {
                createdCount: 0,
                skippedCount: skippedDates.length,
                skippedDates
              }
            });
          }

          const createdCount = createdItems.length;
          const skippedCount = skippedDates.length;
          const message = skippedCount > 0
            ? `${createdCount} appointments created. ${skippedCount} conflicts skipped.`
            : `${createdCount} appointments created.`;

          return reply.status(201).send({
            message,
            item: createdItems[0],
            items: createdItems,
            summary: {
              createdCount,
              skippedCount,
              skippedDates
            }
          });
        }
        const historyLockError = getHistoryLockErrorForRequester(access.requester, [appointmentDate]);
        if (historyLockError) {
          return reply.status(403).send(historyLockError);
        }

        if (status === "pending" || status === "confirmed") {
          const settingsForSlot = await getAppointmentSettingsByOrganization(
            access.authContext.organizationId,
            { scope: settingsScope }
          );
          const workingHoursError = validateSlotAgainstWorkingHours({
            settings: settingsForSlot,
            appointmentDate,
            startTime,
            endTime
          });
          if (workingHoursError) {
            return reply.status(400).send(workingHoursError);
          }

          const breakRangesByDay = buildBreakRangesByDay(
            await getAppointmentBreaksBySpecialistAndDays({
              organizationId: access.authContext.organizationId,
              specialistId,
              dayNums: collectDayNumsFromDates([appointmentDate])
            })
          );
          const breakConflict = hasSpecialistBreakConflict({
            breakRangesByDay,
            appointmentDate,
            startTime,
            endTime
          });
          if (breakConflict) {
            return reply.status(409).send({
              message: buildBreakConflictMessage({ conflict: breakConflict })
            });
          }

          const hasConflict = await hasAppointmentScheduleConflict({
            organizationId: access.authContext.organizationId,
            specialistId,
            appointmentDate,
            startTime,
            endTime
          });
          if (hasConflict) {
            return reply.status(409).send({ message: "This slot conflicts with existing appointment." });
          }
        }

        const item = await createAppointmentSchedule({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId,
          specialistId,
          clientId,
          appointmentDate,
          startTime,
          endTime,
          durationMinutes,
          serviceName,
          status,
          note
        });

        return reply.status(201).send({
          message: "Appointment created.",
          item
        });
      } catch (error) {
        if (Number.isInteger(error?.statusCode) && error?.payload) {
          return reply.status(error.statusCode).send(error.payload);
        }
        if (isUniqueOrExclusionConflict(error)) {
          return reply.status(409).send({ message: "This slot is already occupied." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid specialist or client." });
        }
        if (error?.code === "23514") {
          return reply.status(400).send({ message: "Invalid appointment data." });
        }
        request.log.error({ err: error }, "Error creating appointment schedule");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/schedules/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_UPDATE);
        if (!access) {
          return;
        }

        const id = parsePositiveIntegerOr(request.params?.id, 0);
        if (!id) {
          return reply.status(400).send({ message: "Invalid appointment id." });
        }
        const scope = normalizeScheduleScope(request.query?.scope);
        if (!scope) {
          return reply.status(400).send({ field: "scope", message: "Invalid scope." });
        }

        const specialistId = parsePositiveIntegerOr(request.body?.specialistId, 0);
        const clientId = parsePositiveIntegerOr(request.body?.clientId, 0);
        const appointmentDate = String(request.body?.appointmentDate || "").trim();
        const startTime = String(request.body?.startTime || "").trim();
        const endTime = String(request.body?.endTime || "").trim();
        const requestedDurationMinutes = parsePositiveIntegerOr(request.body?.durationMinutes, 0);
        const durationMinutes = requestedDurationMinutes || getDurationMinutesFromTimes(startTime, endTime);
        const serviceName = String(request.body?.service || request.body?.serviceName || "").trim();
        const status = normalizeAppointmentStatus(request.body?.status || "pending");
        const note = String(request.body?.note || "").trim();
        const repeat = normalizeScheduleRepeatPayload(request.body?.repeat);
        const settingsScope = normalizeAppointmentSettingsScope(
          request.body?.settingsScope ?? request.query?.settingsScope
        );

        const errors = validateSchedulePayload({
          specialistId,
          clientId,
          appointmentDate,
          startTime,
          endTime,
          durationMinutes,
          serviceName,
          status,
          note
        });
        if (Object.keys(errors).length > 0) {
          return reply.status(400).send({ errors });
        }

        const target = await getAppointmentScheduleTargetsByScope({
          organizationId: access.authContext.organizationId,
          id,
          scope
        });
        if (!Array.isArray(target.items) || target.items.length === 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }
        const targetHistoryLockError = getHistoryLockErrorForRequester(
          access.requester,
          target.items.map((item) => item.appointmentDate)
        );
        if (targetHistoryLockError) {
          return reply.status(403).send(targetHistoryLockError);
        }
        if (target.scope === "single") {
          const requestDateHistoryLockError = getHistoryLockErrorForRequester(access.requester, [appointmentDate]);
          if (requestDateHistoryLockError) {
            return reply.status(403).send(requestDateHistoryLockError);
          }
        }

        const shouldConvertSingleToRepeat = repeat.enabled && target.scope === "single" && !target.isRecurring;
        if (shouldConvertSingleToRepeat) {
          const repeatError = validateScheduleRepeatPayload(repeat, appointmentDate);
          if (repeatError) {
            return reply.status(400).send(repeatError);
          }

          const settingsForRepeat = await getAppointmentSettingsByOrganization(
            access.authContext.organizationId,
            { scope: settingsScope }
          );
          const repeatDaysValidation = validateRepeatDaysAgainstVisibleWeekDays({
            repeatDayKeys: repeat.dayKeys,
            visibleWeekDayKeys: settingsForRepeat?.visibleWeekDays
          });
          if (repeatDaysValidation.error) {
            return reply.status(400).send(repeatDaysValidation.error);
          }

          let repeatDayKeys = repeatDaysValidation.normalizedDayKeys;
          const appointmentDayKey = toDayKeyFromUtcDate(parseDateYmdToUtcDate(appointmentDate));
          if (appointmentDayKey && !repeatDayKeys.includes(appointmentDayKey)) {
            repeatDayKeys = normalizeVisibleWeekDays([...repeatDayKeys, appointmentDayKey]);
          }
          if (repeatDayKeys.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "Select at least one repeat day."
            });
          }

          const recurringDates = buildWeeklyRecurringDates({
            startDate: appointmentDate,
            untilDate: repeat.untilDate,
            dayKeys: repeatDayKeys
          });
          if (recurringDates.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "No matching week days in selected range."
            });
          }
          if (!recurringDates.includes(appointmentDate)) {
            recurringDates.unshift(appointmentDate);
          }
          const repeatHistoryLockError = getHistoryLockErrorForRequester(access.requester, recurringDates);
          if (repeatHistoryLockError) {
            return reply.status(403).send(repeatHistoryLockError);
          }

          const shouldEnforceAvailability = status === "pending" || status === "confirmed";
          const repeatGroupKey = randomUUID();
          const repeatDayNums = repeatDayKeys
            .map((dayKey) => toAppointmentDayNum(dayKey))
            .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
          const breakRangesByDay = shouldEnforceAvailability
            ? buildBreakRangesByDay(
                await getAppointmentBreaksBySpecialistAndDays({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  dayNums: collectDayNumsFromDates(recurringDates)
                })
              )
            : new Map();
          const { anchorItem, createdItems, skippedDates } = await withAppointmentTransaction(async (db) => {
            if (shouldEnforceAvailability) {
              const anchorWorkingHoursError = validateSlotAgainstWorkingHours({
                settings: settingsForRepeat,
                appointmentDate,
                startTime,
                endTime
              });
              if (anchorWorkingHoursError) {
                throw createRouteError(400, anchorWorkingHoursError);
              }

              const anchorBreakConflict = hasSpecialistBreakConflict({
                breakRangesByDay,
                appointmentDate,
                startTime,
                endTime
              });
              if (anchorBreakConflict) {
                throw createRouteError(409, {
                  message: buildBreakConflictMessage({ conflict: anchorBreakConflict })
                });
              }

              const hasAnchorConflict = await hasAppointmentScheduleConflict({
                organizationId: access.authContext.organizationId,
                specialistId,
                appointmentDate,
                startTime,
                endTime,
                excludeId: id,
                db
              });
              if (hasAnchorConflict) {
                throw createRouteError(409, { message: "This slot conflicts with existing appointment." });
              }
            }

            const updatedAnchorItem = await updateAppointmentScheduleByIdWithRepeatMeta({
              organizationId: access.authContext.organizationId,
              actorUserId: access.authContext.userId,
              id,
              specialistId,
              clientId,
              appointmentDate,
              startTime,
              endTime,
              durationMinutes,
              serviceName,
              status,
              note,
              repeatGroupKey,
              repeatUntilDate: repeat.untilDate,
              repeatDays: repeatDayNums,
              repeatAnchorDate: appointmentDate,
              isRepeatRoot: true,
              db
            });
            if (!updatedAnchorItem) {
              throw createRouteError(404, { message: "Appointment not found." });
            }

            const nextCreatedItems = [];
            const nextSkippedDates = [];
            for (const recurringDate of recurringDates) {
              if (recurringDate === appointmentDate) {
                continue;
              }

              if (shouldEnforceAvailability) {
                const workingHoursError = validateSlotAgainstWorkingHours({
                  settings: settingsForRepeat,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (workingHoursError) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(400, workingHoursError);
                }

                const recurringBreakConflict = hasSpecialistBreakConflict({
                  breakRangesByDay,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (recurringBreakConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: buildBreakConflictMessage({
                      conflict: recurringBreakConflict,
                      appointmentDate: recurringDate
                    })
                  });
                }

                const hasConflict = await hasAppointmentScheduleConflict({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  db
                });
                if (hasConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, { message: `Slot conflict on ${recurringDate}.` });
                }
              }

              try {
                const createdItem = await createAppointmentSchedule({
                  organizationId: access.authContext.organizationId,
                  actorUserId: access.authContext.userId,
                  specialistId,
                  clientId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  durationMinutes,
                  serviceName,
                  status,
                  note,
                  repeatGroupKey,
                  repeatType: "weekly",
                  repeatUntilDate: repeat.untilDate,
                  repeatDays: repeatDayNums,
                  repeatAnchorDate: appointmentDate,
                  isRepeatRoot: false,
                  db
                });
                if (createdItem) {
                  nextCreatedItems.push(createdItem);
                }
              } catch (error) {
                if (isUniqueOrExclusionConflict(error) && repeat.skipConflicts) {
                  nextSkippedDates.push(recurringDate);
                  continue;
                }
                throw error;
              }
            }

            return {
              anchorItem: updatedAnchorItem,
              createdItems: nextCreatedItems,
              skippedDates: nextSkippedDates
            };
          });

          const items = [anchorItem, ...createdItems];
          const affectedCount = items.length;
          const message = skippedDates.length > 0
            ? `${affectedCount} appointments updated. ${skippedDates.length} conflicts skipped.`
            : `${affectedCount} appointments updated.`;

          return reply.send({
            message,
            item: anchorItem,
            items,
            summary: {
              scope: "single",
              affectedCount,
              skippedCount: skippedDates.length,
              skippedDates
            }
          });
        }

        const targetIds = target.items.map((item) => item.id);
        const applyAppointmentDate = target.scope === "single";

        if (status === "pending" || status === "confirmed") {
          const settingsForAvailability = await getAppointmentSettingsByOrganization(
            access.authContext.organizationId,
            { scope: settingsScope }
          );
          const validationDates = target.items.map((item) => (
            applyAppointmentDate ? appointmentDate : item.appointmentDate
          ));
          const breakRangesByDay = buildBreakRangesByDay(
            await getAppointmentBreaksBySpecialistAndDays({
              organizationId: access.authContext.organizationId,
              specialistId,
              dayNums: collectDayNumsFromDates(validationDates)
            })
          );

          for (const item of target.items) {
            const conflictDate = applyAppointmentDate ? appointmentDate : item.appointmentDate;
            const workingHoursError = validateSlotAgainstWorkingHours({
              settings: settingsForAvailability,
              appointmentDate: conflictDate,
              startTime,
              endTime
            });
            if (workingHoursError) {
              if (target.items.length > 1) {
                return reply.status(400).send({
                  field: workingHoursError.field,
                  message: `${workingHoursError.message} (${conflictDate}).`
                });
              }
              return reply.status(400).send(workingHoursError);
            }

            const breakConflict = hasSpecialistBreakConflict({
              breakRangesByDay,
              appointmentDate: conflictDate,
              startTime,
              endTime
            });
            if (breakConflict) {
              if (target.items.length > 1) {
                return reply.status(409).send({
                  message: buildBreakConflictMessage({
                    conflict: breakConflict,
                    appointmentDate: conflictDate
                  })
                });
              }
              return reply.status(409).send({
                message: buildBreakConflictMessage({ conflict: breakConflict })
              });
            }

            const hasConflict = await hasAppointmentScheduleConflict({
              organizationId: access.authContext.organizationId,
              specialistId,
              appointmentDate: conflictDate,
              startTime,
              endTime,
              excludeId: item.id
            });
            if (hasConflict) {
              if (target.items.length > 1) {
                return reply.status(409).send({ message: `Slot conflict on ${conflictDate}.` });
              }
              return reply.status(409).send({ message: "This slot conflicts with existing appointment." });
            }
          }
        }

        const items = await updateAppointmentSchedulesByIds({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId,
          ids: targetIds,
          specialistId,
          clientId,
          appointmentDate,
          startTime,
          endTime,
          durationMinutes,
          serviceName,
          status,
          note,
          applyAppointmentDate
        });

        if (!Array.isArray(items) || items.length === 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }

        const anchorItem = items.find((item) => Number.parseInt(String(item.id || ""), 10) === id) || items[0];
        const affectedCount = items.length;
        const message = target.scope === "single"
          ? "Appointment updated."
          : `${affectedCount} appointments updated.`;

        return reply.send({
          message,
          item: anchorItem,
          items,
          summary: {
            scope: target.scope,
            affectedCount
          }
        });
      } catch (error) {
        if (Number.isInteger(error?.statusCode) && error?.payload) {
          return reply.status(error.statusCode).send(error.payload);
        }
        if (isUniqueOrExclusionConflict(error)) {
          return reply.status(409).send({ message: "This slot is already occupied." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid specialist or client." });
        }
        if (error?.code === "23514") {
          return reply.status(400).send({ message: "Invalid appointment data." });
        }
        request.log.error({ err: error }, "Error updating appointment schedule");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/schedules/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_DELETE);
        if (!access) {
          return;
        }

        const id = parsePositiveIntegerOr(request.params?.id, 0);
        if (!id) {
          return reply.status(400).send({ message: "Invalid appointment id." });
        }
        const scope = normalizeScheduleScope(request.query?.scope);
        if (!scope) {
          return reply.status(400).send({ field: "scope", message: "Invalid scope." });
        }

        const target = await getAppointmentScheduleTargetsByScope({
          organizationId: access.authContext.organizationId,
          id,
          scope
        });
        if (!Array.isArray(target.items) || target.items.length === 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }
        const historyLockError = getHistoryLockErrorForRequester(
          access.requester,
          target.items.map((item) => item.appointmentDate)
        );
        if (historyLockError) {
          return reply.status(403).send(historyLockError);
        }

        const deletedCount = await deleteAppointmentSchedulesByIds({
          organizationId: access.authContext.organizationId,
          ids: target.items.map((item) => item.id)
        });

        if (deletedCount <= 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }

        const message = target.scope === "single"
          ? "Appointment deleted."
          : `${deletedCount} appointments deleted.`;
        return reply.send({
          message,
          summary: {
            scope: target.scope,
            deletedCount
          }
        });
      } catch (error) {
        request.log.error({ err: error }, "Error deleting appointment schedule");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/settings",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_READ);
        if (!access) {
          return;
        }

        const settingsScope = normalizeAppointmentSettingsScope(request.query?.scope);
        const settings = await getAppointmentSettingsByOrganization(
          access.authContext.organizationId,
          { scope: settingsScope }
        );
        return reply.send({
          item: settings || null
        });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment settings");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/settings",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_UPDATE);
        if (!access) {
          return;
        }

        const settingsScope = normalizeAppointmentSettingsScope(
          request.query?.scope ?? request.body?.scope
        );
        const slotIntervalMinutes = parsePositiveIntegerOr(request.body?.slotInterval, 0);
        const appointmentDurationOptionsMinutes = normalizeDurationOptions(request.body?.appointmentDurationOptions);
        const appointmentDurationMinutes = appointmentDurationOptionsMinutes[0]
          || parsePositiveIntegerOr(request.body?.appointmentDuration, 0);
        const noShowThreshold = parsePositiveIntegerOr(request.body?.noShowThreshold, 0);
        const reminderHours = parsePositiveIntegerOr(request.body?.reminderHours, 0);
        const reminderChannels = normalizeReminderChannels(request.body?.reminderChannels);
        const visibleWeekDays = normalizeVisibleWeekDays(request.body?.visibleWeekDays);
        const workingHours = normalizeWorkingHours(request.body?.workingHours);

        const validationError = validateSettingsPayload({
          slotIntervalMinutes,
          appointmentDurationMinutes,
          appointmentDurationOptionsMinutes,
          noShowThreshold,
          reminderHours,
          reminderChannels,
          visibleWeekDays,
          workingHours,
          settingsScope
        });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await saveAppointmentSettings({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId,
          slotIntervalMinutes,
          appointmentDurationMinutes,
          appointmentDurationOptionsMinutes,
          noShowThreshold,
          reminderHours,
          reminderChannels,
          visibleWeekDays,
          workingHours,
          settingsScope
        });

        return reply.send({
          message: "Appointment settings updated.",
          item
        });
      } catch (error) {
        if (error?.code === "MIGRATION_REQUIRED") {
          return reply.status(500).send({
            message: "DB migration required: appointment settings table is missing required columns."
          });
        }
        request.log.error({ err: error }, "Error updating appointment settings");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default appointmentSettingsRoutes;
