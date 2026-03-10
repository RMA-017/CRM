import { toBoundedInteger } from "../../lib/bounded-integer.js";
import { normalizeDateYmd } from "../../lib/date.js";
import {
  normalizeWorkScheduleDayOfWeek,
  normalizeWorkScheduleScope
} from "./work-schedule.js";
import {
  normalizeDurationOptions,
  normalizeReminderChannels
} from "./schedule-normalizers.js";

const DAY_KEY_TO_NUM = Object.freeze({
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7
});

const DAY_NUM_TO_KEY = Object.freeze({
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
  7: "sun"
});

const DAY_KEYS = Object.freeze(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export const DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS = 10;
export const MIN_APPOINTMENT_HISTORY_LOCK_DAYS = 0;
export const MAX_APPOINTMENT_HISTORY_LOCK_DAYS = 3650;
export const DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 18;
export const MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 12;
export const MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 72;

export function getAppointmentDayKeys() {
  return DAY_KEYS;
}

export function toAppointmentDayKey(dayNum) {
  return DAY_NUM_TO_KEY[Number(dayNum)] || "";
}

export function toAppointmentDayNum(dayKey) {
  return DAY_KEY_TO_NUM[String(dayKey || "").trim().toLowerCase()] || 0;
}

function mapVisibleWeekDays(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((dayNum) => toAppointmentDayKey(dayNum))
    .filter(Boolean);
}

export function normalizeHistoryLockDays(
  value,
  fallback = DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS
) {
  return toBoundedInteger(
    value,
    fallback,
    MIN_APPOINTMENT_HISTORY_LOCK_DAYS,
    MAX_APPOINTMENT_HISTORY_LOCK_DAYS
  );
}

export function normalizeSlotCellHeightPx(
  value,
  fallback = DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX
) {
  return toBoundedInteger(
    value,
    fallback,
    MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
    MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX
  );
}

function createEmptyWorkingHours() {
  return DAY_KEYS.reduce((acc, dayKey) => {
    acc[dayKey] = { start: "", end: "" };
    return acc;
  }, {});
}

export function createDefaultSettings() {
  const workingHours = createEmptyWorkingHours();
  workingHours.mon = { start: "09:00", end: "18:00" };
  workingHours.tue = { start: "09:00", end: "18:00" };
  workingHours.wed = { start: "09:00", end: "18:00" };
  workingHours.thu = { start: "09:00", end: "18:00" };
  workingHours.fri = { start: "09:00", end: "18:00" };
  workingHours.sat = { start: "10:00", end: "16:00" };

  return {
    slotInterval: "30",
    slotSubDivisions: "1",
    appointmentDuration: "30",
    appointmentDurationOptions: ["30"],
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    workingHours,
    noShowThreshold: "3",
    reminderHours: "24",
    reminderChannels: ["sms", "email", "telegram"],
    historyLockDays: String(DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS),
    slotCellHeightPx: String(DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX)
  };
}

export function createEmptySettings() {
  return {
    slotInterval: "",
    slotSubDivisions: "1",
    appointmentDuration: "",
    appointmentDurationOptions: [],
    visibleWeekDays: [],
    workingHours: createEmptyWorkingHours(),
    noShowThreshold: "",
    reminderHours: "",
    reminderChannels: [],
    historyLockDays: String(DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS),
    slotCellHeightPx: String(DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX)
  };
}

export function mapWorkingHours(rows) {
  const workingHours = createEmptyWorkingHours();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const dayKey = toAppointmentDayKey(row.day_of_week);
    if (!dayKey) {
      return;
    }
    workingHours[dayKey] = {
      start: row.start_time ? String(row.start_time).slice(0, 5) : "",
      end: row.end_time ? String(row.end_time).slice(0, 5) : ""
    };
  });
  return workingHours;
}

export function mapSettingsRow(row, workingHourRows) {
  if (!row) {
    return null;
  }

  const mappedOptions = normalizeDurationOptions(row.appointment_duration_options_minutes);
  const fallbackDuration = Number.parseInt(String(row.appointment_duration_minutes || "30"), 10);
  const fallbackOptions = Number.isInteger(fallbackDuration) && fallbackDuration > 0
    ? [fallbackDuration]
    : [30];
  const appointmentDurationOptions = (mappedOptions.length > 0 ? mappedOptions : fallbackOptions)
    .map((value) => String(value));

  return {
    slotInterval: String(row.slot_interval_minutes ?? ""),
    slotSubDivisions: String(row.slot_sub_divisions || 1),
    appointmentDuration: appointmentDurationOptions[0] || "",
    appointmentDurationOptions,
    visibleWeekDays: mapVisibleWeekDays(row.visible_week_days),
    workingHours: mapWorkingHours(workingHourRows),
    noShowThreshold: String(row.no_show_threshold ?? ""),
    reminderHours: String(row.reminder_hours ?? ""),
    reminderChannels: normalizeReminderChannels(row.reminder_channels),
    historyLockDays: String(normalizeHistoryLockDays(row.history_lock_days)),
    slotCellHeightPx: String(normalizeSlotCellHeightPx(row.slot_cell_height_px))
  };
}

export function normalizeTimeHm(value) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 5) : "";
}

export function normalizeWorkScheduleDate(value) {
  return normalizeDateYmd(value);
}

export function mapWorkScheduleItem(row) {
  const dayOfWeekNum = normalizeWorkScheduleDayOfWeek(row?.day_of_week);
  const ruleScope = normalizeWorkScheduleScope(row?.rule_scope) || "weekly";
  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    userId: String(row?.user_id || "").trim(),
    userName: String(row?.user_name || "").trim(),
    userUsername: String(row?.user_username || "").trim(),
    ruleScope,
    dayOfWeek: dayOfWeekNum ? String(dayOfWeekNum) : "",
    dayKey: dayOfWeekNum ? (toAppointmentDayKey(dayOfWeekNum) || "") : "",
    workDate: normalizeWorkScheduleDate(row?.work_date),
    isActive: Boolean(row?.is_active),
    startTime: normalizeTimeHm(row?.start_time),
    endTime: normalizeTimeHm(row?.end_time),
    reason: String(row?.reason || "").trim(),
    createdBy: String(row?.created_by || "").trim(),
    updatedBy: String(row?.updated_by || "").trim(),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

export function mapRepeatDayNumsToKeys(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const mapped = value
    .map((dayNum) => toAppointmentDayKey(dayNum))
    .filter(Boolean);
  return Array.from(new Set(mapped)).sort(
    (left, right) => toAppointmentDayNum(left) - toAppointmentDayNum(right)
  );
}

export function normalizeRepeatType(value) {
  const normalized = String(value || "none").trim().toLowerCase();
  return normalized === "weekly" ? "weekly" : "none";
}

export function normalizeScheduleIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((id) => Number.parseInt(String(id ?? "").trim(), 10))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
}
