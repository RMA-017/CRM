import { randomUUID } from "node:crypto";
import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { getProfileByAuthContext } from "../profile/profile.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import {
  DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS,
  DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  getAppointmentDayKeys,
  getAppointmentHistoryLockDaysByOrganization,
  getAppointmentSettingsByOrganization,
  saveAppointmentSettings
} from "./services/appointment-settings-config.service.js";
import {
  getAppointmentBreaksBySpecialist,
  getAppointmentBreaksBySpecialistAndDays,
  replaceAppointmentBreaksBySpecialist
} from "./services/appointment-breaks.service.js";
import {
  createAppointmentSchedule,
  deleteAppointmentSchedulesByIds,
  getAppointmentClientNoShowSummary,
  getAppointmentScheduleTargetsByScope,
  getAppointmentSchedulesByRange,
  getAppointmentSpecialistsByOrganization,
  hasAppointmentScheduleConflict,
  toAppointmentDayNum,
  updateAppointmentScheduleByIdWithRepeatMeta,
  updateAppointmentSchedulesByIds,
  withAppointmentTransaction
} from "./services/appointment-schedules.service.js";
import { publishAppointmentEvent, subscribeAppointmentEvents } from "./appointment-events.js";
import { isNotificationsSchemaMissing, persistNotificationEvent } from "../notifications/notifications.service.js";
import { isAllowedCorsOrigin } from "../../plugins/security.js";
import { registerAppointmentBreakRoutes } from "./routes/breaks.routes.js";
import { registerAppointmentEventRoutes } from "./routes/events.routes.js";
import { registerAppointmentReferenceRoutes } from "./routes/reference.routes.js";
import { registerAppointmentScheduleRoutes } from "./routes/schedules.routes.js";
import { registerAppointmentSettingsConfigRoutes } from "./routes/settings.routes.js";

const DAY_KEYS = getAppointmentDayKeys();
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const APPOINTMENT_STATUS_SET = new Set(["pending", "confirmed", "cancelled", "no-show"]);
const MAX_RECURRING_RANGE_DAYS = 366;
const SCHEDULE_SCOPE_SET = new Set(["single", "future", "all"]);
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

function parseOptionalOrganizationId(value) {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }
  const parsed = parsePositiveInteger(value);
  if (!parsed) {
    return {
      error: {
        field: "organizationId",
        message: "Invalid organization id."
      }
    };
  }
  return { value: parsed };
}

function resolveTargetOrganizationId(access, requestedOrganizationId) {
  const authOrganizationId = parsePositiveInteger(access?.authContext?.organizationId);
  if (!authOrganizationId) {
    return null;
  }
  if (!requestedOrganizationId || requestedOrganizationId === authOrganizationId) {
    return authOrganizationId;
  }
  if (!Boolean(access?.requester?.is_admin)) {
    return null;
  }
  return requestedOrganizationId;
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

function getHistoryLockCutoffDateYmd(historyLockDays = DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS) {
  const parsedHistoryLockDays = Number.parseInt(String(historyLockDays ?? ""), 10);
  const normalizedHistoryLockDays = Number.isInteger(parsedHistoryLockDays) && parsedHistoryLockDays >= 0
    ? parsedHistoryLockDays
    : DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS;
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  todayUtc.setUTCDate(todayUtc.getUTCDate() - normalizedHistoryLockDays);
  return formatUtcDateYmd(todayUtc);
}

function findLockedHistoryDate(value, historyLockDays) {
  const cutoffDate = getHistoryLockCutoffDateYmd(historyLockDays);
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

function getHistoryLockErrorForRequester(requester, appointmentDates, historyLockDays) {
  if (Boolean(requester?.is_admin)) {
    return null;
  }
  const locked = findLockedHistoryDate(appointmentDates, historyLockDays);
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

function normalizeRoleLabel(value) {
  return String(value || "").trim().toLowerCase();
}

function isManagerRole(requester) {
  if (Boolean(requester?.is_admin)) {
    return true;
  }
  const role = normalizeRoleLabel(requester?.role);
  return (
    role.includes("manager")
    || role.includes("menedj")
    || role.includes("meneger")
    || role.includes("menejer")
    || role.includes("менедж")
  );
}

function isSpecialistRole(requester) {
  const role = normalizeRoleLabel(requester?.role);
  return (
    role.includes("specialist")
    || role.includes("spetsialist")
    || role.includes("mutaxassis")
    || role.includes("специалист")
  );
}

function normalizeSpecialistIds(value) {
  const source = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      source
        .map((item) => parsePositiveInteger(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
}

function normalizeNotificationDates(value) {
  const source = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim())
        .filter((item) => DATE_REGEX.test(item))
    )
  ).sort((left, right) => left.localeCompare(right));
}

function formatNotificationDateYmd(value) {
  const raw = String(value || "").trim();
  if (!DATE_REGEX.test(raw)) {
    return raw;
  }
  const [year, month, day] = raw.split("-");
  return `${day}.${month}.${year}`;
}

function formatNotificationDateText(action, dates) {
  const normalizedDates = normalizeNotificationDates(dates);
  if (normalizedDates.length === 0) {
    return "-";
  }
  if (normalizedDates.length === 1) {
    return formatNotificationDateYmd(normalizedDates[0]);
  }

  const firstDate = normalizedDates[0];
  const lastDate = normalizedDates[normalizedDates.length - 1];
  const firstDateText = formatNotificationDateYmd(firstDate);
  const lastDateText = formatNotificationDateYmd(lastDate);
  if (action === "edit") {
    return `${firstDateText} - ${lastDateText}`;
  }
  if (normalizedDates.length <= 6) {
    return normalizedDates.map((item) => formatNotificationDateYmd(item)).join(", ");
  }
  return `${firstDateText} - ${lastDateText}`;
}

function formatNotificationClientName(item) {
  const firstName = String(item?.clientFirstName || item?.firstName || "").trim();
  const lastName = String(item?.clientLastName || item?.lastName || "").trim();
  const middleName = String(item?.clientMiddleName || item?.middleName || "").trim();
  const fullName = [firstName, lastName, middleName].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }
  const clientId = parsePositiveInteger(item?.clientId || item?.client_id);
  if (clientId) {
    return `Client #${clientId}`;
  }
  return "Client";
}

function formatNotificationClientText(items) {
  const source = Array.isArray(items) ? items : [];
  const names = Array.from(
    new Set(
      source
        .map((item) => formatNotificationClientName(item))
        .filter(Boolean)
    )
  );
  if (names.length === 0) {
    return "Client";
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names[0]} +${names.length - 1}`;
}

function formatNotificationActorInfo(actor) {
  let actorText = "";

  if (actor && typeof actor === "object") {
    const fullName = String(actor.full_name || actor.fullName || "").trim();
    if (fullName) {
      actorText = fullName;
    } else {
      const username = String(actor.username || "").trim();
      if (username) {
        actorText = username;
      } else {
        const userId = parsePositiveInteger(actor.userId || actor.id);
        if (userId) {
          actorText = `User #${userId}`;
        }
      }
    }
  } else {
    actorText = String(actor || "").trim();
  }

  const normalizedActorText = actorText || "Unknown";
  const firstName = normalizedActorText.split(/\s+/)[0] || normalizedActorText;
  return {
    fullName: normalizedActorText,
    firstName
  };
}

function formatNotificationActionLabel(action) {
  if (action === "create") {
    return "created";
  }
  if (action === "edit") {
    return "edited";
  }
  if (action === "delete") {
    return "deleted";
  }
  return String(action || "").trim().toLowerCase();
}

function buildScheduleNotification(action, items, actor) {
  const normalizedAction = String(action || "").trim().toLowerCase();
  const source = Array.isArray(items) ? items : [];
  const clientText = formatNotificationClientText(source);
  const dateText = formatNotificationDateText(
    normalizedAction,
    source.map((item) => item?.appointmentDate)
  );
  const actorInfo = formatNotificationActorInfo(actor);
  const actionLabel = formatNotificationActionLabel(normalizedAction);
  return {
    message: `Client ${actionLabel} by ${actorInfo.firstName}`,
    data: {
      action: normalizedAction,
      actionLabel,
      actorFirstName: actorInfo.firstName,
      actorFullName: actorInfo.fullName,
      clientName: clientText,
      appointmentDateText: dateText
    }
  };
}

async function resolveNotificationAudience(access, specialistIds) {
  const actorUserId = parsePositiveInteger(access?.authContext?.userId);
  const actorRoleId = parsePositiveInteger(access?.requester?.role_id || access?.requester?.roleId);
  const normalizedSpecialistIds = normalizeSpecialistIds(specialistIds);
  if (!actorUserId || !actorRoleId || normalizedSpecialistIds.length === 0) {
    return {
      targetUserIds: [],
      targetRoles: []
    };
  }

  if (isManagerRole(access?.requester)) {
    const canNotifySpecialists = await hasPermission(
      actorRoleId,
      PERMISSIONS.NOTIFICATIONS_NOTIFY_TO_SPECIALIST
    );
    if (!canNotifySpecialists) {
      return {
        targetUserIds: [],
        targetRoles: []
      };
    }

    const targetSpecialistIds = normalizedSpecialistIds.filter((id) => id !== actorUserId);
    if (targetSpecialistIds.length === 0) {
      return {
        targetUserIds: [],
        targetRoles: []
      };
    }

    return {
      targetUserIds: targetSpecialistIds,
      targetRoles: []
    };
  }

  if (isSpecialistRole(access?.requester) || normalizedSpecialistIds.includes(actorUserId)) {
    const canNotifyManagers = await hasPermission(
      actorRoleId,
      PERMISSIONS.NOTIFICATIONS_NOTIFY_TO_MANAGER
    );
    if (!canNotifyManagers) {
      return {
        targetUserIds: [],
        targetRoles: []
      };
    }

    return {
      targetUserIds: [],
      targetRoles: ["manager"]
    };
  }

  return {
    targetUserIds: [],
    targetRoles: []
  };
}

async function broadcastAppointmentChange(access, {
  type,
  message,
  specialistIds,
  data = {}
}) {
  const normalizedSpecialistIds = normalizeSpecialistIds(specialistIds);
  const normalizedData = data && typeof data === "object" ? data : {};
  const payloadData = {
    specialistIds: normalizedSpecialistIds,
    ...normalizedData
  };
  const audience = await resolveNotificationAudience(access, specialistIds);
  if (audience.targetUserIds.length === 0 && audience.targetRoles.length === 0) {
    return;
  }

  const organizationId = parsePositiveInteger(access?.authContext?.organizationId);
  const sourceUserId = parsePositiveInteger(access?.authContext?.userId);
  const sourceUsername = String(access?.authContext?.username || "").trim();

  const publishFallbackEvent = () => {
    publishAppointmentEvent({
      organizationId,
      type,
      message,
      sourceUserId,
      sourceUsername,
      targetUserIds: audience.targetUserIds,
      targetRoles: audience.targetRoles,
      data: payloadData
    });
  };

  try {
    const persisted = await persistNotificationEvent({
      organizationId,
      sourceUserId,
      eventType: type,
      message,
      targetUserIds: audience.targetUserIds,
      targetRoles: audience.targetRoles,
      payload: payloadData
    });

    if (!Array.isArray(persisted?.recipientUserIds) || persisted.recipientUserIds.length === 0) {
      return;
    }

    publishAppointmentEvent({
      organizationId,
      type,
      message,
      sourceUserId,
      sourceUsername,
      targetUserIds: persisted.recipientUserIds,
      data: payloadData
    });
  } catch (error) {
    if (isNotificationsSchemaMissing(error)) {
      publishFallbackEvent();
      return;
    }
    publishFallbackEvent();
  }
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

function getTodayUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getEndOfNextWeekYmd(baseDate) {
  const source = baseDate instanceof Date ? baseDate : getTodayUtcDate();
  const normalized = new Date(Date.UTC(
    source.getUTCFullYear(),
    source.getUTCMonth(),
    source.getUTCDate()
  ));
  const dayNum = normalized.getUTCDay();
  const daysToEndNextWeek = ((7 - dayNum) % 7) + 7;
  normalized.setUTCDate(normalized.getUTCDate() + daysToEndNextWeek);
  return formatUtcDateYmd(normalized);
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
  if (serviceName.length > 128) {
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
  slotCellHeightPx,
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
  if (!Number.isInteger(slotCellHeightPx) || slotCellHeightPx < MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX || slotCellHeightPx > MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX) {
    return {
      field: "slotCellHeightPx",
      message: `Slot cell height must be between ${MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX} and ${MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX}.`
    };
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
  const routeContext = {
    randomUUID,
    setNoCacheHeaders,
    requireAppointmentsAccess,
    PERMISSIONS,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
    parsePositiveIntegerOr,
    parseNullableBoolean,
    parseOptionalOrganizationId,
    resolveTargetOrganizationId,
    normalizeBreakItems,
    normalizeDurationOptions,
    normalizeReminderChannels,
    normalizeAppointmentStatus,
    normalizeScheduleScope,
    normalizeScheduleRepeatPayload,
    normalizeVisibleWeekDays,
    normalizeWorkingHours,
    validateBreaksPayload,
    validateSchedulePayload,
    validateScheduleRepeatPayload,
    validateRepeatDaysAgainstVisibleWeekDays,
    validateSlotAgainstWorkingHours,
    validateSettingsPayload,
    getDurationMinutesFromTimes,
    getHistoryLockErrorForRequester,
    parseDateYmdToUtcDate,
    toDayKeyFromUtcDate,
    collectDayNumsFromDates,
    buildWeeklyRecurringDates,
    buildBreakRangesByDay,
    hasSpecialistBreakConflict,
    buildBreakConflictMessage,
    buildScheduleNotification,
    createRouteError,
    isUniqueOrExclusionConflict,
    getAppointmentSpecialistsByOrganization,
    getAppointmentClientNoShowSummary,
    getAppointmentBreaksBySpecialist,
    replaceAppointmentBreaksBySpecialist,
    subscribeAppointmentEvents,
    isAllowedCorsOrigin,
    getAppointmentSchedulesByRange,
    getAppointmentHistoryLockDaysByOrganization,
    getAppointmentSettingsByOrganization,
    getAppointmentBreaksBySpecialistAndDays,
    getAppointmentScheduleTargetsByScope,
    hasAppointmentScheduleConflict,
    createAppointmentSchedule,
    updateAppointmentScheduleByIdWithRepeatMeta,
    updateAppointmentSchedulesByIds,
    deleteAppointmentSchedulesByIds,
    withAppointmentTransaction,
    toAppointmentDayNum,
    saveAppointmentSettings,
    broadcastAppointmentChange,
    DATE_REGEX
  };

  registerAppointmentReferenceRoutes(fastify, routeContext);
  registerAppointmentBreakRoutes(fastify, routeContext);
  registerAppointmentEventRoutes(fastify, routeContext);
  registerAppointmentScheduleRoutes(fastify, routeContext);
  registerAppointmentSettingsConfigRoutes(fastify, routeContext);
}
export const __appointmentRouteContracts = Object.freeze({
  parsePositiveIntegerOr,
  parseNullableBoolean,
  parseOptionalOrganizationId,
  resolveTargetOrganizationId,
  normalizeVisibleWeekDays,
  normalizeDurationOptions,
  normalizeReminderChannels,
  normalizeScheduleScope
});

export default appointmentSettingsRoutes;
