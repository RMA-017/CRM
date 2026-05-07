import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../lib/api.js";

const DAY_ITEMS = [
  { key: "mon", label: "Monday", offset: 0 },
  { key: "tue", label: "Tuesday", offset: 1 },
  { key: "wed", label: "Wednesday", offset: 2 },
  { key: "thu", label: "Thursday", offset: 3 },
  { key: "fri", label: "Friday", offset: 4 },
  { key: "sat", label: "Saturday", offset: 5 },
  { key: "sun", label: "Sunday", offset: 6 }
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no-show", label: "No Show" }
];

const BREAK_TYPE_OPTIONS = [
  { value: "lunch", label: "Lunch" },
  { value: "meeting", label: "Meeting" },
  { value: "training", label: "Training" },
  { value: "other", label: "Other" }
];

const PLANNER_MODAL_TABS = Object.freeze({
  appointment: "appointment",
  break: "break",
  workSchedule: "work-schedule"
});

const DAY_KEYS_SET = new Set(DAY_ITEMS.map((item) => item.key));
const DAY_NUM_TO_KEY = Object.freeze(
  DAY_ITEMS.reduce((acc, item, index) => {
    acc[index + 1] = item.key;
    return acc;
  }, {})
);
const MAX_REPEAT_RANGE_DAYS = 366;
const APPOINTMENT_SPECIALIST_STORAGE_KEY = "crm_appointment_selected_specialist_id";
const APPOINTMENT_PLANNER_CLIENT_STORAGE_KEY = "crm_appointment_selected_client_id";
const APPOINTMENT_PLANNER_CLIENT_SNAPSHOT_STORAGE_KEY = "crm_appointment_selected_client_snapshot";
const APPOINTMENT_PLANNER_FILTER_MODE_STORAGE_KEY = "crm_appointment_selected_filter_mode";
const APPOINTMENT_VIP_CLIENT_STORAGE_KEY = "crm_appointment_selected_vip_client_id";
const ACTIVE_SCHEDULE_STATUSES = new Set(["pending", "confirmed"]);
const FULL_CELL_BREAK_TYPES = new Set(["lunch", "meeting", "training", "other"]);
const DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 18;
const MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 12;
const MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 72;
const COMPACT_APPOINTMENT_CARD_MAX_HEIGHT_PX = 24;
const DEFAULT_APPOINTMENT_SERVICE_NAME = "Consultation";
const SKEL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SKEL_ROWS = [
  { t: true,  c: [0, 1, 0, 0, 0, 0, 0] },
  { t: false, c: [0, 0, 0, 1, 0, 0, 0] },
  { t: true,  c: [0, 0, 0, 0, 1, 0, 0] },
  { t: false, c: [1, 0, 0, 0, 0, 0, 0] },
  { t: true,  c: [0, 0, 1, 0, 0, 0, 0] },
  { t: false, c: [0, 0, 0, 0, 0, 1, 0] },
  { t: true,  c: [0, 1, 0, 0, 0, 0, 0] },
  { t: false, c: [0, 0, 0, 1, 0, 0, 1] },
  { t: true,  c: [0, 0, 1, 0, 0, 0, 0] },
  { t: false, c: [1, 0, 0, 0, 1, 0, 0] },
  { t: true,  c: [0, 0, 0, 0, 0, 1, 0] },
  { t: false, c: [0, 1, 0, 1, 0, 0, 0] },
  { t: true,  c: [0, 0, 0, 0, 1, 0, 0] },
  { t: false, c: [0, 0, 1, 0, 0, 0, 1] },
  { t: true,  c: [0, 1, 0, 0, 0, 0, 0] },
  { t: false, c: [0, 0, 0, 0, 0, 0, 0] },
];

const VIP_SKEL_ROWS = [
  { c: [1, 1, 0, 1, 0, 0, 1] },
  { c: [0, 1, 1, 0, 1, 0, 0] },
  { c: [1, 0, 0, 1, 0, 1, 0] },
  { c: [0, 1, 1, 0, 0, 1, 0] },
];

function normalizeEditScopeValue(value) {
  return String(value || "").trim().toLowerCase() === "future" ? "future" : "single";
}

function normalizeRepeatDayKeys(value) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((day) => String(day || "").trim().toLowerCase())
            .filter((day) => DAY_KEYS_SET.has(day))
        )
      )
    : [];
}

function normalizeBreakTypeKey(value) {
  const normalizedType = String(value || "").trim().toLowerCase();
  if (normalizedType === "launch") {
    return "lunch";
  }
  return normalizedType;
}

function getUserScopedSchedulerStorageKey(baseKey, currentUserId = "") {
  const normalizedCurrentUserId = String(currentUserId || "").trim();
  return normalizedCurrentUserId ? `${baseKey}:${normalizedCurrentUserId}` : baseKey;
}

function getSchedulerSelectionStorageKey(vipOnly = false, currentUserId = "") {
  const baseKey = vipOnly
    ? APPOINTMENT_VIP_CLIENT_STORAGE_KEY
    : APPOINTMENT_SPECIALIST_STORAGE_KEY;
  return getUserScopedSchedulerStorageKey(baseKey, currentUserId);
}

function getPlannerClientSelectionStorageKey(currentUserId = "") {
  return getUserScopedSchedulerStorageKey(APPOINTMENT_PLANNER_CLIENT_STORAGE_KEY, currentUserId);
}

function getPlannerFilterModeStorageKey(currentUserId = "") {
  return getUserScopedSchedulerStorageKey(APPOINTMENT_PLANNER_FILTER_MODE_STORAGE_KEY, currentUserId);
}

function readScopedOrLegacyStorageValue(baseKey, currentUserId = "") {
  if (typeof window === "undefined") {
    return "";
  }

  const scopedKey = getUserScopedSchedulerStorageKey(baseKey, currentUserId);
  const scopedValue = String(window.localStorage.getItem(scopedKey) || "").trim();
  if (scopedValue) {
    return scopedValue;
  }

  const normalizedCurrentUserId = String(currentUserId || "").trim();
  if (!normalizedCurrentUserId) {
    return "";
  }

  return String(window.localStorage.getItem(baseKey) || "").trim();
}

function removeScopedAndLegacyStorageValue(baseKey, currentUserId = "") {
  if (typeof window === "undefined") {
    return;
  }

  const scopedKey = getUserScopedSchedulerStorageKey(baseKey, currentUserId);
  window.localStorage.removeItem(scopedKey);
  if (scopedKey !== baseKey) {
    window.localStorage.removeItem(baseKey);
  }
}

function readStoredSchedulerSelectionId(vipOnly = false, currentUserId = "") {
  const baseKey = vipOnly
    ? APPOINTMENT_VIP_CLIENT_STORAGE_KEY
    : APPOINTMENT_SPECIALIST_STORAGE_KEY;
  return readScopedOrLegacyStorageValue(baseKey, currentUserId);
}

function readStoredPlannerClientSelectionId(currentUserId = "") {
  return readScopedOrLegacyStorageValue(APPOINTMENT_PLANNER_CLIENT_STORAGE_KEY, currentUserId);
}

function normalizePlannerStoredClientSnapshot(value) {
  const source = value && typeof value === "object" ? value : {};
  const id = String(source.id || "").trim();
  if (!id) {
    return null;
  }

  return {
    id,
    firstName: String(source.firstName || "").trim(),
    lastName: String(source.lastName || "").trim(),
    middleName: String(source.middleName || "").trim(),
    displayName: String(source.displayName || source.name || "").trim()
  };
}

function arePlannerClientSnapshotsEqual(left, right) {
  const normalizedLeft = normalizePlannerStoredClientSnapshot(left);
  const normalizedRight = normalizePlannerStoredClientSnapshot(right);
  if (!normalizedLeft && !normalizedRight) {
    return true;
  }
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return (
    normalizedLeft.id === normalizedRight.id
    && normalizedLeft.firstName === normalizedRight.firstName
    && normalizedLeft.lastName === normalizedRight.lastName
    && normalizedLeft.middleName === normalizedRight.middleName
    && normalizedLeft.displayName === normalizedRight.displayName
  );
}

function hasPlannerClientSnapshotDisplay(value) {
  const normalizedValue = normalizePlannerStoredClientSnapshot(value);
  if (!normalizedValue) {
    return false;
  }
  return Boolean(
    normalizedValue.firstName
    || normalizedValue.lastName
    || normalizedValue.middleName
    || normalizedValue.displayName
  );
}

function getPlannerClientSnapshotStorageKey(currentUserId = "") {
  return getUserScopedSchedulerStorageKey(APPOINTMENT_PLANNER_CLIENT_SNAPSHOT_STORAGE_KEY, currentUserId);
}

function readStoredPlannerClientSelectionSnapshot(currentUserId = "") {
  const rawValue = readScopedOrLegacyStorageValue(APPOINTMENT_PLANNER_CLIENT_SNAPSHOT_STORAGE_KEY, currentUserId);
  if (!rawValue) {
    return null;
  }

  try {
    return normalizePlannerStoredClientSnapshot(JSON.parse(rawValue));
  } catch {
    return null;
  }
}

function readStoredPlannerFilterMode(currentUserId = "") {
  const normalizedMode = readScopedOrLegacyStorageValue(
    APPOINTMENT_PLANNER_FILTER_MODE_STORAGE_KEY,
    currentUserId
  ).toLowerCase();
  return ["specialist", "client"].includes(normalizedMode) ? normalizedMode : "";
}

function createEmptyClientForm({
  appointmentDate = "",
  startTime = "",
  durationMinutes = "30",
  repeatEnabled = false,
  repeatUntil = "",
  repeatDays = []
} = {}) {
  return {
    clientId: "",
    appointmentDate,
    startTime,
    durationMinutes: String(durationMinutes || "30"),
    service: DEFAULT_APPOINTMENT_SERVICE_NAME,
    status: "pending",
    note: "",
    editScope: "single",
    repeatEnabled: Boolean(repeatEnabled),
    repeatUntil: String(repeatUntil || "").trim(),
    repeatDays: Array.isArray(repeatDays)
      ? Array.from(new Set(repeatDays.map((day) => String(day || "").trim().toLowerCase()).filter((day) => DAY_KEYS_SET.has(day))))
      : []
  };
}

function createEmptyClientSearchForm() {
  return {
    firstName: "",
    lastName: "",
    middleName: "",
    clientId: ""
  };
}

function createEmptyPlannerBreakForm({
  startTime = "",
  endTime = "",
  breakType = "lunch",
  note = ""
} = {}) {
  return {
    startTime: String(startTime || "").trim(),
    endTime: String(endTime || "").trim(),
    breakType: BREAK_TYPE_OPTIONS.some((option) => option.value === String(breakType || "").trim().toLowerCase())
      ? String(breakType || "").trim().toLowerCase()
      : "lunch",
    note: String(note || "").trim()
  };
}

function createEmptyPlannerWorkScheduleForm({
  startTime = "",
  endTime = "",
  reason = ""
} = {}) {
  return {
    startTime: String(startTime || "").trim(),
    endTime: String(endTime || "").trim(),
    reason: String(reason || "").trim()
  };
}

function isPlannerClientSearchNumeric(value) {
  return /^\d+$/.test(String(value || "").trim());
}

function shouldRunPlannerClientSearch(value) {
  const query = String(value || "").trim();
  return Boolean(query) && (isPlannerClientSearchNumeric(query) || query.length >= 3);
}

function getDayOfWeekNumberFromDayKey(dayKey) {
  const normalizedDayKey = String(dayKey || "").trim().toLowerCase();
  const index = DAY_ITEMS.findIndex((item) => item.key === normalizedDayKey);
  return index >= 0 ? index + 1 : 0;
}

function getDayKeyFromDayOfWeekNumber(dayOfWeek) {
  const normalizedDayOfWeek = Number.parseInt(String(dayOfWeek ?? "").trim(), 10);
  return DAY_NUM_TO_KEY[normalizedDayOfWeek] || "";
}

function getDefaultPlannerBlockEndTime(startTime, timeOptions, fallbackMinutes = 30) {
  const normalizedStartTime = String(startTime || "").trim();
  if (!normalizedStartTime) {
    return "";
  }

  const optionIndex = Array.isArray(timeOptions)
    ? timeOptions.findIndex((option) => String(option?.value || "").trim() === normalizedStartTime)
    : -1;
  if (optionIndex >= 0 && optionIndex + 1 < timeOptions.length) {
    return String(timeOptions[optionIndex + 1]?.value || "").trim();
  }

  const startMinutes = normalizeTimeToMinutes(normalizedStartTime);
  const parsedFallbackMinutes = Number.parseInt(String(fallbackMinutes || "").trim(), 10);
  const safeFallbackMinutes = Number.isInteger(parsedFallbackMinutes) && parsedFallbackMinutes > 0
    ? parsedFallbackMinutes
    : 30;
  return startMinutes === null ? "" : minutesToTime(startMinutes + safeFallbackMinutes);
}

function getPlannerClientSearchEmptyText(value) {
  return shouldRunPlannerClientSearch(value)
    ? "No clients found."
    : "Type at least 3 letters or enter ID";
}

function getClientDisplayName(client) {
  const firstName = String(client?.firstName || "").trim();
  const lastName = String(client?.lastName || "").trim();
  const middleName = String(client?.middleName || "").trim();
  const displayName = String(client?.displayName || client?.name || "").trim();
  const fullName = [firstName, lastName, middleName].filter(Boolean).join(" ");
  return fullName || displayName || `Client #${String(client?.id || "").trim()}`;
}

function formatClientOptionLabel(client) {
  const displayName = getClientDisplayName(client);
  const clientId = String(client?.id || "").trim();
  return clientId ? `${displayName} (ID ${clientId})` : displayName;
}

function getClientCardName(client) {
  const firstName = String(client?.firstName || "").trim();
  const lastName = String(client?.lastName || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  if (fullName) {
    return fullName;
  }
  const clientId = String(client?.id || "").trim();
  return clientId ? `Client #${clientId}` : "Client";
}

function formatBookingDurationLabel(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return "";
  }
  return `${parsed}min`;
}

function truncateWithEllipsis(value, maxLength = 20) {
  const raw = String(value || "").trim();
  if (!raw || raw.length <= maxLength) {
    return raw;
  }
  return `${raw.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function isGenericVipPrimaryLabel(value) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  return (
    normalized === ""
    || normalized === "specialist"
    || normalized === "spetsialist"
    || /^\d+$/.test(raw)
  );
}

function isGenericVipServiceLabel(value) {
  const raw = String(value || "").trim();
  return raw === "" || /^\d+$/.test(raw);
}

function formatBreakReason(item) {
  const title = String(item?.title || "").trim();
  if (title) {
    return {
      full: title,
      short: truncateWithEllipsis(title, 16)
    };
  }

  const breakType = normalizeBreakTypeKey(item?.breakType || "break");
  if (!breakType) {
    return { full: "Break", short: "Break" };
  }

  const full = breakType
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
    .trim() || "Break";

  return {
    full,
    short: truncateWithEllipsis(full, 16)
  };
}

function getStartOfWeek(baseDate) {
  const date = new Date(baseDate);
  const currentDay = date.getDay();
  const diffToMonday = (currentDay + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDefaultRepeatUntilDate(appointmentDate = "") {
  const normalizedAppointmentDate = String(appointmentDate || "").trim();
  const baseDate = isValidDateYmd(normalizedAppointmentDate)
    ? new Date(`${normalizedAppointmentDate}T00:00:00`)
    : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return normalizedAppointmentDate;
  }
  baseDate.setHours(0, 0, 0, 0);
  return formatDateYmd(addDays(baseDate, MAX_REPEAT_RANGE_DAYS - 1));
}

function ensureAnchoredRepeatDayKeys(appointmentDate = "", repeatDays = [], visibleDayKeys = []) {
  const visibleDayKeySet = new Set(
    (Array.isArray(visibleDayKeys) && visibleDayKeys.length > 0 ? visibleDayKeys : DAY_ITEMS.map((item) => item.key))
      .map((day) => String(day || "").trim().toLowerCase())
      .filter((day) => DAY_KEYS_SET.has(day))
  );
  const currentRepeatDays = normalizeRepeatDayKeys(repeatDays)
    .filter((day) => visibleDayKeySet.size === 0 || visibleDayKeySet.has(day));
  if (currentRepeatDays.length === 0) {
    return currentRepeatDays;
  }
  const appointmentDayKey = getDayKeyFromDateYmd(appointmentDate);
  if (!appointmentDayKey || (visibleDayKeySet.size > 0 && !visibleDayKeySet.has(appointmentDayKey))) {
    return currentRepeatDays;
  }
  if (currentRepeatDays.includes(appointmentDayKey)) {
    return currentRepeatDays;
  }
  return normalizeRepeatDayKeys([...currentRepeatDays, appointmentDayKey]);
}

function formatHeaderDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDayMonth(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

function formatDateYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateYmd(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return false;
  }
  const [yearRaw, monthRaw, dayRaw] = raw.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(year, month - 1, day);
  return (
    !Number.isNaN(date.getTime())
    && date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
  );
}

function getHistoryLockCutoffDateYmd(historyLockDays) {
  const parsedHistoryLockDays = Number.parseInt(String(historyLockDays ?? ""), 10);
  if (!Number.isInteger(parsedHistoryLockDays) || parsedHistoryLockDays < 0) {
    return "";
  }
  const cutoffDate = new Date();
  cutoffDate.setHours(0, 0, 0, 0);
  cutoffDate.setDate(cutoffDate.getDate() - parsedHistoryLockDays);
  return formatDateYmd(cutoffDate);
}

function isHistoryLockedDateYmd(value, historyLockDays) {
  if (!isValidDateYmd(value)) {
    return false;
  }
  const cutoffDate = getHistoryLockCutoffDateYmd(historyLockDays);
  return Boolean(cutoffDate) && String(value || "").trim() < cutoffDate;
}

function isFutureDateYmd(value) {
  if (!isValidDateYmd(value)) {
    return false;
  }
  const targetDate = new Date(`${String(value || "").trim()}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return targetDate > today;
}

function isPendingAppointmentStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-") === "pending";
}

function getDayKeyFromDateYmd(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "";
  }
  const [yearRaw, monthRaw, dayRaw] = raw.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[date.getDay()] || "";
}

function formatWeekRange(days, { compact = false } = {}) {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!(first instanceof Date) || !(last instanceof Date)) {
    return "";
  }
  if (compact) {
    return `${formatDayMonth(first)} - ${formatDayMonth(last)}`;
  }
  return `${first.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} - ${last.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
}

function isSameDate(left, right) {
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  );
}

function normalizeTimeToMinutes(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return (hours * 60) + minutes;
}

function isInsideWorkingHoursByMinutes(slotMinutes, dayMinutes) {
  return (
    slotMinutes !== null
    && dayMinutes?.start !== null
    && dayMinutes?.end !== null
    && slotMinutes >= dayMinutes.start
    && slotMinutes < dayMinutes.end
  );
}

function rangesOverlap(startMinutes, endMinutes, rangeStartMinutes, rangeEndMinutes) {
  return (
    startMinutes !== null
    && endMinutes !== null
    && rangeStartMinutes !== null
    && rangeEndMinutes !== null
    && endMinutes > startMinutes
    && rangeEndMinutes > rangeStartMinutes
    && startMinutes < rangeEndMinutes
    && rangeStartMinutes < endMinutes
  );
}

function getPlannerRangeDayKey(item) {
  const dayKeyFromField = String(item?.dayKey || "").trim().toLowerCase();
  if (DAY_KEYS_SET.has(dayKeyFromField)) {
    return dayKeyFromField;
  }
  const dayOfWeek = Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10);
  return DAY_NUM_TO_KEY[dayOfWeek] || "";
}

function findPlannerBreakConflict(items, appointmentDate, startTime, endTime) {
  const targetDayKey = getDayKeyFromDateYmd(appointmentDate);
  const startMinutes = normalizeTimeToMinutes(startTime);
  const endMinutes = normalizeTimeToMinutes(endTime);
  if (!targetDayKey || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  const hit = (Array.isArray(items) ? items : []).find((item) => {
    if (item?.isActive === false || getPlannerRangeDayKey(item) !== targetDayKey) {
      return false;
    }
    return rangesOverlap(
      startMinutes,
      endMinutes,
      normalizeTimeToMinutes(item?.startTime),
      normalizeTimeToMinutes(item?.endTime)
    );
  });
  if (!hit) {
    return null;
  }
  const reason = formatBreakReason(hit);
  return String(reason?.full || "").trim() || "Break";
}

function findPlannerBlockedTimeConflict(items, appointmentDate, startTime, endTime) {
  const targetDayKey = getDayKeyFromDateYmd(appointmentDate);
  const startMinutes = normalizeTimeToMinutes(startTime);
  const endMinutes = normalizeTimeToMinutes(endTime);
  if (!targetDayKey || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  const hit = (Array.isArray(items) ? items : []).find((item) => {
    if (item?.isActive === false || getPlannerRangeDayKey(item) !== targetDayKey) {
      return false;
    }
    return rangesOverlap(
      startMinutes,
      endMinutes,
      normalizeTimeToMinutes(item?.startTime),
      normalizeTimeToMinutes(item?.endTime)
    );
  });
  if (!hit) {
    return null;
  }
  return String(hit?.reason || "").trim() || "Blocked";
}

function findPlannerAbsenceConflict(items, appointmentDate, startTime, endTime) {
  const targetDate = String(appointmentDate || "").trim();
  const startMinutes = normalizeTimeToMinutes(startTime);
  const endMinutes = normalizeTimeToMinutes(endTime);
  if (!targetDate || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  const hit = (Array.isArray(items) ? items : []).find((item) => {
    if (String(item?.absenceDate || "").trim() !== targetDate) {
      return false;
    }
    const absenceStartMinutes = normalizeTimeToMinutes(item?.startTime);
    const absenceEndMinutes = normalizeTimeToMinutes(item?.endTime);
    if (absenceStartMinutes === null || absenceEndMinutes === null || absenceEndMinutes <= absenceStartMinutes) {
      return true;
    }
    return rangesOverlap(startMinutes, endMinutes, absenceStartMinutes, absenceEndMinutes);
  });
  if (!hit) {
    return null;
  }
  return String(hit?.reason || "").trim() || "Specialist absent";
}

function getPlannerWorkingHoursConflictMessage(settings, appointmentDate, startTime, endTime) {
  const targetDayKey = getDayKeyFromDateYmd(appointmentDate);
  const startMinutes = normalizeTimeToMinutes(startTime);
  const endMinutes = normalizeTimeToMinutes(endTime);
  if (!targetDayKey || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return "";
  }
  const dayHours = settings?.workingHours?.[targetDayKey] || {};
  const dayStartMinutes = normalizeTimeToMinutes(dayHours?.start);
  const dayEndMinutes = normalizeTimeToMinutes(dayHours?.end);
  if (dayStartMinutes === null || dayEndMinutes === null || dayEndMinutes <= dayStartMinutes) {
    return "Specialist is unavailable on this day.";
  }
  if (startMinutes < dayStartMinutes || endMinutes > dayEndMinutes) {
    return "Selected time is outside specialist working hours.";
  }
  return "";
}

function isEligibleBreakTypeForFullCell(breakType) {
  const normalizedType = normalizeBreakTypeKey(breakType);
  return FULL_CELL_BREAK_TYPES.has(normalizedType);
}

function getDurationMinutesFromTimes(startTime, endTime) {
  const start = normalizeTimeToMinutes(startTime);
  const end = normalizeTimeToMinutes(endTime);
  if (start === null || end === null || end <= start) {
    return "";
  }
  return String(end - start);
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatAppointmentTimeRangeLabel(startTime, endTime, durationMinutes = "") {
  const startMinutes = normalizeTimeToMinutes(startTime);
  if (startMinutes === null) {
    return "";
  }

  let endMinutes = normalizeTimeToMinutes(endTime);
  if (endMinutes === null || endMinutes <= startMinutes) {
    const duration = Number.parseInt(String(durationMinutes || "").trim(), 10);
    if (Number.isInteger(duration) && duration > 0) {
      endMinutes = startMinutes + duration;
    }
  }

  if (endMinutes === null || endMinutes <= startMinutes) {
    return minutesToTime(startMinutes);
  }
  return `${minutesToTime(startMinutes)} - ${minutesToTime(endMinutes)}`;
}

function formatAppointmentStatusLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const match = STATUS_OPTIONS.find((option) => option.value === normalized);
  if (match) {
    return match.label;
  }
  return normalized ? `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}` : "-";
}

function formatVipDailyRoutineActivityLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "lesson") {
    return "Group lesson";
  }
  if (normalized === "breakfast") {
    return "Breakfast";
  }
  if (normalized === "lunch") {
    return "Lunch";
  }
  if (normalized === "afternoon-snack") {
    return "Afternoon snack";
  }
  if (normalized === "sleep") {
    return "Sleep time";
  }
  if (normalized === "other") {
    return "Other";
  }
  return "Daily routine";
}

function compareVipWeeklyItems(left, right) {
  const leftStart = Number.isInteger(left?.startMinutes) ? left.startMinutes : Number.MAX_SAFE_INTEGER;
  const rightStart = Number.isInteger(right?.startMinutes) ? right.startMinutes : Number.MAX_SAFE_INTEGER;
  if (leftStart !== rightStart) {
    return leftStart - rightStart;
  }

  const leftTypeRank = String(left?.itemType || "").trim().toLowerCase() === "daily-routine" ? 0 : 1;
  const rightTypeRank = String(right?.itemType || "").trim().toLowerCase() === "daily-routine" ? 0 : 1;
  if (leftTypeRank !== rightTypeRank) {
    return leftTypeRank - rightTypeRank;
  }

  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function showImmediateAlert(text) {
  const message = String(text || "").trim();
  if (!message || typeof window === "undefined" || typeof window.alert !== "function") {
    return;
  }
  window.alert(message);
}

function createDefaultWorkingHours() {
  return {
    mon: { start: "09:00", end: "18:00" },
    tue: { start: "09:00", end: "18:00" },
    wed: { start: "09:00", end: "18:00" },
    thu: { start: "09:00", end: "18:00" },
    fri: { start: "09:00", end: "18:00" },
    sat: { start: "10:00", end: "16:00" },
    sun: { start: "", end: "" }
  };
}

function normalizeVisibleDays(days) {
  if (!Array.isArray(days)) {
    return ["mon", "tue", "wed", "thu", "fri", "sat"];
  }

  const validKeys = new Set(DAY_ITEMS.map((item) => item.key));
  const normalized = Array.from(
    new Set(
      days
        .map((day) => String(day || "").trim().toLowerCase())
        .filter((day) => validKeys.has(day))
    )
  );

  if (normalized.length === 0) {
    return ["mon", "tue", "wed", "thu", "fri", "sat"];
  }

  return DAY_ITEMS
    .map((item) => item.key)
    .filter((key) => normalized.includes(key));
}

function mapSchedulerSettingsFromApiItem(item) {
  const normalizedItem = item && typeof item === "object" ? item : {};
  const visibleWeekDays = normalizeVisibleDays(normalizedItem.visibleWeekDays);
  const nextWorkingHours = createDefaultWorkingHours();
  if (normalizedItem.workingHours && typeof normalizedItem.workingHours === "object") {
    DAY_ITEMS.forEach((day) => {
      nextWorkingHours[day.key] = {
        start: String(normalizedItem.workingHours?.[day.key]?.start || ""),
        end: String(normalizedItem.workingHours?.[day.key]?.end || "")
      };
    });
  }

  return {
    slotInterval: String(normalizedItem.slotInterval || "30"),
    slotSubDivisions: String(normalizedItem.slotSubDivisions || "1"),
    appointmentDurationOptions: Array.isArray(normalizedItem.appointmentDurationOptions)
      && normalizedItem.appointmentDurationOptions.length > 0
      ? normalizedItem.appointmentDurationOptions.map((value) => String(value))
      : [String(normalizedItem.appointmentDuration || "30")],
    visibleWeekDays,
    workingHours: nextWorkingHours,
    slotCellHeightPx: String(normalizedItem.slotCellHeightPx || DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX),
    historyLockDays: String(normalizedItem.historyLockDays ?? ""),
    blockedTimes: normalizePlannerBlockedTimeItems(normalizedItem.blockedTimes)
  };
}

function buildTimeSlots({ visibleDays, workingHours, slotIntervalMinutes }) {
  const interval = Number.isInteger(slotIntervalMinutes) && slotIntervalMinutes > 0
    ? slotIntervalMinutes
    : 30;

  let minStart = null;
  let maxEnd = null;

  visibleDays.forEach((dayKey) => {
    const dayHours = workingHours?.[dayKey] || {};
    const start = normalizeTimeToMinutes(dayHours.start);
    const end = normalizeTimeToMinutes(dayHours.end);

    if (start === null || end === null || start >= end) {
      return;
    }

    if (minStart === null || start < minStart) {
      minStart = start;
    }
    if (maxEnd === null || end > maxEnd) {
      maxEnd = end;
    }
  });

  if (minStart === null || maxEnd === null || minStart >= maxEnd) {
    minStart = 8 * 60;
    maxEnd = 18 * 60;
  }

  const slots = [];
  for (let minute = minStart; minute < maxEnd; minute += interval) {
    slots.push(minutesToTime(minute));
  }
  return slots;
}

function buildPlannerEndTimeOptions(timeSlots, workingHours, visibleDayKeys = []) {
  const values = new Set(Array.isArray(timeSlots) ? timeSlots : []);
  const visibleKeys = normalizeVisibleDays(visibleDayKeys);

  visibleKeys.forEach((dayKey) => {
    const endTime = String(workingHours?.[dayKey]?.end || "").trim();
    if (normalizeTimeToMinutes(endTime) !== null) {
      values.add(endTime);
    }
  });

  return Array.from(values)
    .sort((left, right) => normalizeTimeToMinutes(left) - normalizeTimeToMinutes(right))
    .map((value) => ({ value, label: value }));
}

function buildPlannerWeekDays(weekStartDate, visibleWeekDays = []) {
  const visibleDays = normalizeVisibleDays(visibleWeekDays);
  return DAY_ITEMS
    .filter((day) => visibleDays.includes(day.key))
    .map((day) => ({
      key: day.key,
      label: day.label,
      date: addDays(weekStartDate, day.offset)
    }));
}

function buildEmptyAppointmentsByDay(weekDays = []) {
  return (Array.isArray(weekDays) ? weekDays : []).reduce((acc, day) => {
    const dayKey = String(day?.key || "").trim();
    if (dayKey) {
      acc[dayKey] = [];
    }
    return acc;
  }, {});
}

function mapScheduleItemToPlannerCard(item) {
  const startTime = String(item?.startTime || "").trim();
  const itemType = String(item?.itemType || "").trim().toLowerCase();
  const isRoutineItem = itemType === "daily-routine";
  const repeatDays = Array.isArray(item?.repeatDays)
    ? Array.from(
        new Set(
          item.repeatDays
            .map((day) => String(day || "").trim().toLowerCase())
            .filter((day) => DAY_KEYS_SET.has(day))
        )
      )
    : [];
  return {
    id: String(item?.id || ""),
    itemType,
    specialistId: String(item?.specialistId || "").trim(),
    specialist: String(item?.specialistName || "").trim()
      || (String(item?.specialistId || "").trim() ? `Specialist #${String(item?.specialistId || "").trim()}` : "Specialist"),
    specialistPosition: String(item?.specialistPosition || "").trim(),
    clientId: String(item?.clientId || ""),
    time: startTime,
    endTime: String(item?.endTime || "").trim(),
    durationMinutes: String(item?.durationMinutes || "").trim() || getDurationMinutesFromTimes(startTime, item?.endTime),
    client: isRoutineItem
      ? (
        String(item?.className || "").trim()
        || String(item?.serviceName || "").trim()
        || "VIP Daily Routine"
      )
      : getClientCardName({
          id: item?.clientId,
          firstName: item?.clientFirstName,
          lastName: item?.clientLastName
        }),
    clientFirstName: String(item?.clientFirstName || "").trim(),
    clientLastName: String(item?.clientLastName || "").trim(),
    clientMiddleName: String(item?.clientMiddleName || "").trim(),
    service: isRoutineItem
      ? (
        String(item?.serviceName || "").trim()
        || String(item?.note || "").trim()
        || "Daily routine"
      )
      : String(item?.serviceName || "").trim(),
    status: isRoutineItem
      ? "routine"
      : String(item?.status || "pending").trim().toLowerCase(),
    note: String(item?.note || "").trim(),
    activityType: String(item?.activityType || "").trim().toLowerCase(),
    className: String(item?.className || "").trim(),
    repeatType: String(item?.repeatType || "none").trim().toLowerCase(),
    repeatGroupKey: String(item?.repeatGroupKey || "").trim(),
    repeatUntilDate: String(item?.repeatUntilDate || "").trim(),
    repeatDays,
    repeatAnchorDate: String(item?.repeatAnchorDate || "").trim(),
    isRepeatRoot: Boolean(item?.isRepeatRoot),
    isAutoRollingRepeat: Boolean(item?.isAutoRollingRepeat || item?.is_auto_rolling_repeat)
  };
}

function buildPlannerAppointmentsByDay(items, weekDays = []) {
  const byDay = buildEmptyAppointmentsByDay(weekDays);
  (Array.isArray(items) ? items : []).forEach((item) => {
    const dayKey = getDayKeyFromDateYmd(item?.appointmentDate);
    if (!dayKey || !Array.isArray(byDay[dayKey])) {
      return;
    }
    const startTime = String(item?.startTime || "").trim();
    if (!startTime) {
      return;
    }
    byDay[dayKey].push(mapScheduleItemToPlannerCard(item));
  });

  Object.keys(byDay).forEach((dayKey) => {
    byDay[dayKey].sort((left, right) => String(left.time || "").localeCompare(String(right.time || "")));
  });
  return byDay;
}

function getClientFocusedPlannerGroupMeta(item, index = 0) {
  const itemType = String(item?.itemType || "").trim().toLowerCase();
  const isRoutineItem = itemType === "daily-routine";
  const specialistId = String(item?.specialistId || "").trim();
  if (specialistId) {
    return {
      id: specialistId,
      name: String(item?.specialistName || "").trim() || `Specialist #${specialistId}`
    };
  }
  if (isRoutineItem) {
    const classId = String(item?.classId || "").trim();
    const className = String(item?.className || "").trim();
    return {
      id: classId ? `routine-class-${classId}` : `routine-${index}`,
      name: className ? `Class routine: ${className}` : "Class routine"
    };
  }
  return {
    id: "",
    name: ""
  };
}

function shouldIncludeClientFocusedPlannerItem(item, selectedClientId = "") {
  const itemType = String(item?.itemType || "").trim().toLowerCase();
  if (itemType === "daily-routine") {
    return true;
  }
  return String(item?.clientId || "").trim() === String(selectedClientId || "").trim();
}

function normalizePlannerBreakItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    specialistId: String(item?.specialistId || "").trim(),
    dayKey: String(item?.dayKey || "").trim().toLowerCase(),
    dayOfWeek: Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10) || 0,
    breakType: normalizeBreakTypeKey(item?.breakType || ""),
    title: String(item?.title || "").trim(),
    note: String(item?.note || "").trim(),
    startTime: String(item?.startTime || "").trim(),
    endTime: String(item?.endTime || "").trim(),
    isActive: item?.isActive !== false
  }));
}

function normalizePlannerBlockedTimeItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    userId: String(item?.userId || item?.user_id || "").trim(),
    dayKey: String(item?.dayKey || "").trim().toLowerCase(),
    dayOfWeek: Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10) || 0,
    startTime: String(item?.startTime || "").trim(),
    endTime: String(item?.endTime || "").trim(),
    reason: String(item?.reason || "").trim(),
    isActive: item?.isActive !== false
  }));
}

function buildPlannerBlockOverlayItemsByDay({ weekDays, breaks = [], blockedTimes = [], overlayLabel = "Specialist" }) {
  const byDay = buildEmptyAppointmentsByDay(weekDays);

  (Array.isArray(breaks) ? breaks : []).forEach((item) => {
    if (item?.isActive === false) {
      return;
    }
    const dayKey = getPlannerRangeDayKey(item);
    if (!dayKey || !Array.isArray(byDay[dayKey])) {
      return;
    }
    const startTime = String(item?.startTime || "").trim();
    const endTime = String(item?.endTime || "").trim();
    const reason = formatBreakReason(item);
    byDay[dayKey].push({
      id: `overlay-break-${String(item?.id || `${dayKey}-${startTime}-${endTime}`).trim()}`,
      time: startTime,
      startTime,
      endTime,
      status: "break",
      specialist: overlayLabel,
      service: String(reason?.full || "").trim() || "Break"
    });
  });

  normalizePlannerBlockedTimeItems(blockedTimes).forEach((item) => {
    if (item?.isActive === false) {
      return;
    }
    const dayKey = getPlannerRangeDayKey(item);
    if (!dayKey || !Array.isArray(byDay[dayKey])) {
      return;
    }
    const startTime = String(item?.startTime || "").trim();
    const endTime = String(item?.endTime || "").trim();
    byDay[dayKey].push({
      id: `overlay-work-${String(item?.id || `${dayKey}-${startTime}-${endTime}`).trim()}`,
      time: startTime,
      startTime,
      endTime,
      status: "blocked",
      specialist: overlayLabel,
      service: String(item?.reason || "").trim() || "Work schedule"
    });
  });

  Object.keys(byDay).forEach((dayKey) => {
    byDay[dayKey].sort((left, right) => String(left?.time || "").localeCompare(String(right?.time || "")));
  });

  return byDay;
}

function AppointmentPlannerGrid({
  sectionTitle = "",
  ariaLabel = "",
  weekStartDate,
  settings,
  rawAppointmentsByDay = {},
  overlayAppointmentsByDay = {},
  overlayLabel = "",
  selectedClientId = "",
  breaksForSpecialist = [],
  blockedTimesForSpecialist = [],
  absencesForSpecialist = [],
  slotCellHeightPx = DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  now = new Date(),
  canCreateOnSpecialist = false,
  canUpdateAppointments = true,
  canDeleteAppointments = true,
  canUpdateAppointmentBreaks = false,
  canUpdateAppointmentWorkSchedule = false,
  canDeleteAppointmentWorkSchedule = false,
  canMutatePlannerSpecialist = false,
  canMutateAppointmentSpecialist = () => false,
  onOpenCreateModal = null,
  onMoveAppointment = null,
  onMovePlannerBreak = null,
  onOpenDayBulkModal = null,
  onOpenPlannerBlockModal = null,
  cardDisplayMode = "specialist",
  wrapperClassName = ""
}) {
  const weekDays = useMemo(
    () => buildPlannerWeekDays(weekStartDate, settings?.visibleWeekDays),
    [settings?.visibleWeekDays, weekStartDate]
  );
  const slotRowHeightStyle = useMemo(() => ({
    height: `${slotCellHeightPx}px`,
    minHeight: `${slotCellHeightPx}px`
  }), [slotCellHeightPx]);
  const timeSlots = useMemo(() => {
    const interval = Number.parseInt(String(settings?.slotInterval || "30"), 10) || 30;
    const subDivisions = Math.max(1, Number.parseInt(String(settings?.slotSubDivisions || "1"), 10) || 1);
    const effectiveInterval = Math.max(1, Math.floor(interval / subDivisions));
    return buildTimeSlots({
      visibleDays: weekDays.map((day) => day.key),
      workingHours: settings?.workingHours,
      slotIntervalMinutes: effectiveInterval
    });
  }, [settings?.slotInterval, settings?.slotSubDivisions, settings?.workingHours, weekDays]);
  const appointmentsByDay = useMemo(() => {
    const normalizedClientId = String(selectedClientId || "").trim();
    if (!normalizedClientId) {
      return rawAppointmentsByDay && typeof rawAppointmentsByDay === "object" ? rawAppointmentsByDay : {};
    }

    return weekDays.reduce((acc, day) => {
      const dayItems = Array.isArray(rawAppointmentsByDay?.[day.key]) ? rawAppointmentsByDay[day.key] : [];
      acc[day.key] = dayItems.filter(
        (item) => shouldIncludeClientFocusedPlannerItem(item, normalizedClientId)
      );
      return acc;
    }, {});
  }, [rawAppointmentsByDay, selectedClientId, weekDays]);
  const slotMinutesByValue = useMemo(() => (
    timeSlots.reduce((acc, slot) => {
      acc[slot] = normalizeTimeToMinutes(slot);
      return acc;
    }, {})
  ), [timeSlots]);
  const slotIndexByValue = useMemo(() => (
    timeSlots.reduce((acc, slot, index) => {
      acc[slot] = index;
      return acc;
    }, {})
  ), [timeSlots]);
  const workingHoursMinutesByDay = useMemo(() => (
    DAY_ITEMS.reduce((acc, day) => {
      const dayHours = settings?.workingHours?.[day.key] || {};
      acc[day.key] = {
        start: normalizeTimeToMinutes(dayHours.start),
        end: normalizeTimeToMinutes(dayHours.end)
      };
      return acc;
    }, {})
  ), [settings?.workingHours]);
  const appointmentSpecialistAbsenceSlotsByDay = useMemo(() => (
    weekDays.reduce((acc, day) => {
      const blockedByTime = {};
      const dayDate = formatDateYmd(day.date);
      const dayAbsenceItems = (Array.isArray(absencesForSpecialist) ? absencesForSpecialist : []).filter(
        (item) => String(item?.absenceDate || "").trim() === dayDate
      );
      if (dayAbsenceItems.length === 0) {
        acc[day.key] = blockedByTime;
        return acc;
      }

      const dayMinutes = workingHoursMinutesByDay[day.key] || { start: null, end: null };
      const slotIntervalMinutes = Number.parseInt(String(settings?.slotInterval || "30"), 10) || 30;
      const slotSubDivisionsNum = Math.max(1, Number.parseInt(String(settings?.slotSubDivisions || "1"), 10) || 1);
      const effectiveSlotMinutes = Math.max(1, Math.floor(slotIntervalMinutes / slotSubDivisionsNum));
      timeSlots.forEach((slot) => {
        const slotMinutes = slotMinutesByValue[slot];
        if (
          slotMinutes === null
          || dayMinutes.start === null
          || dayMinutes.end === null
          || slotMinutes < dayMinutes.start
          || slotMinutes >= dayMinutes.end
        ) {
          return;
        }
        const slotEndMinutes = slotMinutes + effectiveSlotMinutes;
        const blockingAbsence = dayAbsenceItems.find((item) => {
          const startMinutes = normalizeTimeToMinutes(item?.startTime);
          const endMinutes = normalizeTimeToMinutes(item?.endTime);
          if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
            return true;
          }
          return slotMinutes < endMinutes && startMinutes < slotEndMinutes;
        });
        if (!blockingAbsence) {
          return;
        }
        const reasonBase = String(blockingAbsence?.reason || "").trim() || "Specialist absent";
        const absenceStartTime = String(blockingAbsence?.startTime || "").trim();
        const absenceEndTime = String(blockingAbsence?.endTime || "").trim();
        const reasonFull = absenceStartTime && absenceEndTime
          ? `${reasonBase} (${absenceStartTime}-${absenceEndTime})`
          : reasonBase;
        const reasonShort = truncateWithEllipsis(reasonBase, 18) || "Absent";
        blockedByTime[slot] = {
          reasonShort,
          reasonFull
        };
      });

      acc[day.key] = blockedByTime;
      return acc;
    }, {})
  ), [absencesForSpecialist, settings?.slotInterval, settings?.slotSubDivisions, slotMinutesByValue, timeSlots, weekDays, workingHoursMinutesByDay]);
  const appointmentLookupByDay = useMemo(() => (
    weekDays.reduce((acc, day) => {
      const dayItems = Array.isArray(appointmentsByDay[day.key]) ? appointmentsByDay[day.key] : [];
      const byTime = {};
      dayItems.forEach((event) => {
        const time = String(event?.time || "").trim();
        if (time && !byTime[time]) {
          byTime[time] = event;
        }
      });
      acc[day.key] = byTime;
      return acc;
    }, {})
  ), [appointmentsByDay, weekDays]);
  const appointmentRowSpanByDay = useMemo(() => {
    const interval = Number.parseInt(String(settings?.slotInterval || "30"), 10) || 30;
    const subDivisions = Math.max(1, Number.parseInt(String(settings?.slotSubDivisions || "1"), 10) || 1);
    const effectiveInterval = Math.max(1, Math.floor(interval / subDivisions));
    return weekDays.reduce((acc, day) => {
      const byTime = appointmentLookupByDay[day.key] || {};
      const spanMap = {};
      timeSlots.forEach((slot) => {
        if (spanMap[slot] === 0) {
          return;
        }
        const apptItem = byTime[slot];
        if (!apptItem) {
          return;
        }
        const duration = Number.parseInt(String(apptItem?.durationMinutes || "30"), 10) || 30;
        const span = Math.max(1, Math.round(duration / effectiveInterval));
        spanMap[slot] = span;
        const startIndex = slotIndexByValue[slot];
        if (Number.isInteger(startIndex)) {
          for (let i = startIndex + 1; i < startIndex + span && i < timeSlots.length; i += 1) {
            if (!spanMap[timeSlots[i]]) {
              spanMap[timeSlots[i]] = 0;
            }
          }
        }
      });
      acc[day.key] = spanMap;
      return acc;
    }, {});
  }, [appointmentLookupByDay, settings?.slotInterval, settings?.slotSubDivisions, slotIndexByValue, timeSlots, weekDays]);
  const appointmentBlockedSlotsByDay = useMemo(() => (
    weekDays.reduce((acc, day) => {
      const dayItems = Array.isArray(rawAppointmentsByDay?.[day.key]) ? rawAppointmentsByDay[day.key] : [];
      const startSlots = new Set(
        dayItems
          .map((event) => String(event?.time || "").trim())
          .filter(Boolean)
      );
      const blockedByTime = {};
      const normalizedClientId = String(selectedClientId || "").trim();

      dayItems.forEach((event) => {
        const startSlot = String(event?.time || "").trim();
        const startMinutes = normalizeTimeToMinutes(event?.time);
        const endMinutes = normalizeTimeToMinutes(event?.endTime);
        if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
          return;
        }

        const status = String(event?.status || "pending").trim().toLowerCase();
        const isVisibleForSelectedClient = shouldIncludeClientFocusedPlannerItem(event, normalizedClientId);
        const isHiddenByClientFilter = Boolean(normalizedClientId) && !isVisibleForSelectedClient;
        const blockedPayload = isHiddenByClientFilter
          ? { status, hiddenByFilter: true }
          : { status, hiddenByFilter: false };
        if (isHiddenByClientFilter && startSlot && !blockedByTime[startSlot]) {
          blockedByTime[startSlot] = blockedPayload;
        }
        const startIndex = slotIndexByValue[startSlot];
        if (Number.isInteger(startIndex) && startIndex >= 0) {
          for (let index = startIndex + 1; index < timeSlots.length; index += 1) {
            const slot = timeSlots[index];
            const slotMinutes = slotMinutesByValue[slot];
            if (slotMinutes === null || slotMinutes >= endMinutes) {
              break;
            }
            if (startSlots.has(slot) || blockedByTime[slot]) {
              continue;
            }
            blockedByTime[slot] = blockedPayload;
          }
          return;
        }

        timeSlots.forEach((slot) => {
          const slotMinutes = slotMinutesByValue[slot];
          if (slotMinutes === null || slotMinutes <= startMinutes || slotMinutes >= endMinutes) {
            return;
          }
          if (startSlots.has(slot) || blockedByTime[slot]) {
            return;
          }
          blockedByTime[slot] = blockedPayload;
        });
      });

      acc[day.key] = blockedByTime;
      return acc;
    }, {})
  ), [rawAppointmentsByDay, selectedClientId, slotIndexByValue, slotMinutesByValue, timeSlots, weekDays]);
  const overlayBusySlotsByDay = useMemo(() => (
    weekDays.reduce((acc, day) => {
      const dayItems = Array.isArray(overlayAppointmentsByDay?.[day.key]) ? overlayAppointmentsByDay[day.key] : [];
      const busyByTime = {};
      const ranges = dayItems.reduce((items, event) => {
        const startSlot = String(event?.time || event?.startTime || "").trim();
        const startMinutes = normalizeTimeToMinutes(event?.time || event?.startTime);
        const endMinutes = normalizeTimeToMinutes(event?.endTime);
        if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
          return items;
        }

        const clientText = String(event?.client || "").trim();
        const specialistText = String(event?.specialist || "").trim();
        const serviceText = String(event?.service || "").trim();
        const title = [
          overlayLabel || "Overlay",
          formatAppointmentTimeRangeLabel(startSlot, event?.endTime, event?.durationMinutes),
          specialistText,
          clientText,
          serviceText
        ].filter(Boolean).join(" - ");
        items.push({
          startMinutes,
          endMinutes,
          payload: {
            isStart: false,
            isEnd: false,
            rangePosition: "middle",
            startMinutes,
            endMinutes,
            title,
            status: String(event?.status || "pending").trim().toLowerCase().replace(/_/g, "-"),
            label: overlayLabel || "Busy"
          }
        });
        return items;
      }, []).sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

      const mergedRanges = ranges.reduce((items, range) => {
        const previous = items[items.length - 1];
        if (previous && range.startMinutes <= previous.endMinutes) {
          previous.endMinutes = Math.max(previous.endMinutes, range.endMinutes);
          previous.payload.endMinutes = previous.endMinutes;
          previous.payload.title = [previous.payload.title, range.payload.title]
            .filter(Boolean)
            .filter((value, index, array) => array.indexOf(value) === index)
            .join(" / ");
          return items;
        }
        items.push({
          startMinutes: range.startMinutes,
          endMinutes: range.endMinutes,
          payload: {
            ...range.payload
          }
        });
        return items;
      }, []);

      mergedRanges.forEach((range) => {
        const occupiedSlots = timeSlots.filter((slot) => {
          const slotMinutes = slotMinutesByValue[slot];
          return Number.isInteger(slotMinutes)
            && slotMinutes >= range.startMinutes
            && slotMinutes < range.endMinutes;
        });
        if (!occupiedSlots.length) {
          return;
        }

        occupiedSlots.forEach((slot, index) => {
          const isStart = index === 0;
          const isEnd = index === occupiedSlots.length - 1;
          const rangePosition = isStart && isEnd
            ? "single"
            : (isStart ? "start" : (isEnd ? "end" : "middle"));
          busyByTime[slot] = {
            ...range.payload,
            isStart,
            isEnd,
            rangePosition,
            startMinutes: range.startMinutes,
            endMinutes: range.endMinutes,
            title: range.payload.title,
            status: String(range.payload.status || "pending").trim().toLowerCase().replace(/_/g, "-"),
            label: range.payload.label || "Busy"
          };
        });
      });

      acc[day.key] = busyByTime;
      return acc;
    }, {})
  ), [overlayAppointmentsByDay, overlayLabel, slotMinutesByValue, timeSlots, weekDays]);
  const appointmentBreakSlotsByDay = useMemo(() => (
    weekDays.reduce((acc, day) => {
      const blockedByTime = {};
      const ranges = [];
      const slotStepMinutes = (() => {
        for (let index = 1; index < timeSlots.length; index += 1) {
          const prev = slotMinutesByValue[timeSlots[index - 1]];
          const next = slotMinutesByValue[timeSlots[index]];
          if (Number.isInteger(prev) && Number.isInteger(next) && next > prev) {
            return next - prev;
          }
        }
        return 30;
      })();

      (Array.isArray(breaksForSpecialist) ? breaksForSpecialist : []).forEach((item) => {
        if (item?.isActive === false) {
          return;
        }
        const dayKeyFromField = String(item?.dayKey || "").trim().toLowerCase();
        const dayOfWeek = Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10);
        const dayKey = DAY_KEYS_SET.has(dayKeyFromField)
          ? dayKeyFromField
          : (DAY_NUM_TO_KEY[dayOfWeek] || "");
        if (!dayKey || dayKey !== day.key) {
          return;
        }

        const start = normalizeTimeToMinutes(item?.startTime);
        const end = normalizeTimeToMinutes(item?.endTime);
        if (start === null || end === null || start >= end) {
          return;
        }
        ranges.push({
          id: String(item?.id || "").trim(),
          specialistId: String(item?.specialistId || "").trim(),
          dayKey,
          dayOfWeek,
          start,
          end,
          startTime: String(item?.startTime || "").trim(),
          endTime: String(item?.endTime || "").trim(),
          breakType: normalizeBreakTypeKey(item?.breakType || "break"),
          title: String(item?.title || "").trim(),
          note: String(item?.note || "").trim(),
          reason: formatBreakReason(item)
        });
      });

      if (ranges.length > 0) {
        timeSlots.forEach((slot, slotIndex) => {
          const slotMinutes = slotMinutesByValue[slot];
          if (slotMinutes === null) {
            return;
          }
          const nextSlot = timeSlots[slotIndex + 1];
          const nextSlotMinutes = nextSlot ? slotMinutesByValue[nextSlot] : null;
          const slotEndMinutes = (
            Number.isInteger(nextSlotMinutes) && nextSlotMinutes > slotMinutes
              ? nextSlotMinutes
              : (slotMinutes + slotStepMinutes)
          );
          const hit = ranges.find((range) => slotMinutes < range.end && slotEndMinutes > range.start);
          if (hit) {
            blockedByTime[slot] = {
              id: hit.id,
              specialistId: hit.specialistId,
              dayKey: hit.dayKey,
              dayOfWeek: hit.dayOfWeek,
              startTime: hit.startTime,
              endTime: hit.endTime,
              breakType: hit.breakType,
              title: hit.title,
              note: hit.note,
              reasonShort: String(hit.reason?.short || "").trim() || "Break",
              reasonFull: String(hit.reason?.full || "").trim() || "Break"
            };
          }
        });
      }

      acc[day.key] = blockedByTime;
      return acc;
    }, {})
  ), [breaksForSpecialist, slotMinutesByValue, timeSlots, weekDays]);
  const appointmentWorkScheduleBlockedSlotsByDay = useMemo(() => (
    weekDays.reduce((acc, day) => {
      const blockedByTime = {};
      const ranges = [];
      const slotStepMinutes = (() => {
        for (let index = 1; index < timeSlots.length; index += 1) {
          const prev = slotMinutesByValue[timeSlots[index - 1]];
          const next = slotMinutesByValue[timeSlots[index]];
          if (Number.isInteger(prev) && Number.isInteger(next) && next > prev) {
            return next - prev;
          }
        }
        return 30;
      })();

      (Array.isArray(blockedTimesForSpecialist) ? blockedTimesForSpecialist : []).forEach((item) => {
        if (item?.isActive === false) {
          return;
        }
        const dayKeyFromField = String(item?.dayKey || "").trim().toLowerCase();
        const dayOfWeek = Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10);
        const dayKey = DAY_KEYS_SET.has(dayKeyFromField)
          ? dayKeyFromField
          : (DAY_NUM_TO_KEY[dayOfWeek] || "");
        if (!dayKey || dayKey !== day.key) {
          return;
        }

        const start = normalizeTimeToMinutes(item?.startTime);
        const end = normalizeTimeToMinutes(item?.endTime);
        if (start === null || end === null || start >= end) {
          return;
        }
        const reasonFull = String(item?.reason || "").trim() || "Blocked";
        ranges.push({
          id: String(item?.id || "").trim(),
          userId: String(item?.userId || "").trim(),
          start,
          end,
          startTime: String(item?.startTime || "").trim(),
          endTime: String(item?.endTime || "").trim(),
          reasonFull,
          reasonShort: truncateWithEllipsis(reasonFull, 16) || "Blocked"
        });
      });

      if (ranges.length > 0) {
        timeSlots.forEach((slot, slotIndex) => {
          const slotMinutes = slotMinutesByValue[slot];
          if (slotMinutes === null) {
            return;
          }
          const nextSlot = timeSlots[slotIndex + 1];
          const nextSlotMinutes = nextSlot ? slotMinutesByValue[nextSlot] : null;
          const slotEndMinutes = (
            Number.isInteger(nextSlotMinutes) && nextSlotMinutes > slotMinutes
              ? nextSlotMinutes
              : (slotMinutes + slotStepMinutes)
          );
          const hit = ranges.find((range) => slotMinutes < range.end && slotEndMinutes > range.start);
          if (hit) {
            blockedByTime[slot] = {
              id: hit.id,
              userId: hit.userId,
              startTime: hit.startTime,
              endTime: hit.endTime,
              reasonShort: hit.reasonShort,
              reasonFull: hit.reasonFull
            };
          }
        });
      }

      acc[day.key] = blockedByTime;
      return acc;
    }, {})
  ), [blockedTimesForSpecialist, slotMinutesByValue, timeSlots, weekDays]);
  const specialCellRowSpanByDay = useMemo(() => {
    const subDivisions = Math.max(1, Number.parseInt(String(settings?.slotSubDivisions || "1"), 10) || 1);

    return weekDays.reduce((acc, day) => {
      const spanMap = {};
      const appointmentSpanMap = appointmentRowSpanByDay[day.key] || {};
      const dayAppointments = appointmentLookupByDay[day.key] || {};
      const dayBlockedSlots = appointmentBlockedSlotsByDay[day.key] || {};
      const dayBreakSlots = appointmentBreakSlotsByDay[day.key] || {};
      const dayAbsenceSlots = appointmentSpecialistAbsenceSlotsByDay[day.key] || {};
      const dayWorkScheduleBlockedSlots = appointmentWorkScheduleBlockedSlotsByDay[day.key] || {};
      const dayOverlaySlots = overlayBusySlotsByDay[day.key] || {};
      const dayMinutes = workingHoursMinutesByDay[day.key] || { start: null, end: null };

      if (subDivisions > 1) {
        for (let startIndex = 0; startIndex < timeSlots.length; startIndex += subDivisions) {
          const groupEnd = Math.min(startIndex + subDivisions, timeSlots.length);
          const groupSlots = timeSlots.slice(startIndex, groupEnd);
          if (groupSlots.length <= 1) {
            continue;
          }

          const firstSlot = groupSlots[0];
          if (appointmentSpanMap[firstSlot] === 0 || dayAppointments[firstSlot]) {
            continue;
          }

          const canMergeOffSlots = groupSlots.every((groupSlot) => {
            if (appointmentSpanMap[groupSlot] === 0) {
              return false;
            }
            if (
              dayAppointments[groupSlot]
              || dayBlockedSlots[groupSlot]
              || dayBreakSlots[groupSlot]
              || dayAbsenceSlots[groupSlot]
              || dayWorkScheduleBlockedSlots[groupSlot]
            ) {
              return false;
            }
            const slotMinutes = slotMinutesByValue[groupSlot];
            return !isInsideWorkingHoursByMinutes(slotMinutes, dayMinutes);
          });

          if (canMergeOffSlots) {
            spanMap[firstSlot] = groupSlots.length;
            groupSlots.slice(1).forEach((groupSlot) => {
              spanMap[groupSlot] = 0;
            });
          }
        }
      }

      for (let startIndex = 0; startIndex < timeSlots.length; startIndex += 1) {
        const firstSlot = timeSlots[startIndex];
        const firstOverlay = dayOverlaySlots[firstSlot];
        if (!firstSlot || spanMap[firstSlot] === 0 || !firstOverlay?.isStart) {
          continue;
        }
        if (
          appointmentSpanMap[firstSlot] === 0
          || dayAppointments[firstSlot]
          || dayBlockedSlots[firstSlot]
          || dayBreakSlots[firstSlot]
          || dayAbsenceSlots[firstSlot]
          || dayWorkScheduleBlockedSlots[firstSlot]
        ) {
          continue;
        }

        let span = 1;
        for (let nextIndex = startIndex + 1; nextIndex < timeSlots.length; nextIndex += 1) {
          const nextSlot = timeSlots[nextIndex];
          const nextOverlay = dayOverlaySlots[nextSlot];
          if (
            !nextSlot
            || !nextOverlay
            || nextOverlay.isStart
            || appointmentSpanMap[nextSlot] === 0
            || dayAppointments[nextSlot]
            || dayBlockedSlots[nextSlot]
            || dayBreakSlots[nextSlot]
            || dayAbsenceSlots[nextSlot]
            || dayWorkScheduleBlockedSlots[nextSlot]
          ) {
            break;
          }
          span += 1;
        }

        if (span > 1) {
          spanMap[firstSlot] = span;
          for (let offset = 1; offset < span; offset += 1) {
            const coveredSlot = timeSlots[startIndex + offset];
            if (coveredSlot) {
              spanMap[coveredSlot] = 0;
            }
          }
          startIndex += span - 1;
        }
      }

      for (let startIndex = 0; startIndex < timeSlots.length; startIndex += 1) {
        const firstSlot = timeSlots[startIndex];
        if (!firstSlot || spanMap[firstSlot] === 0) {
          continue;
        }
        if (
          appointmentSpanMap[firstSlot] === 0
          || dayAppointments[firstSlot]
          || dayBlockedSlots[firstSlot]
          || dayAbsenceSlots[firstSlot]
          || dayWorkScheduleBlockedSlots[firstSlot]
        ) {
          continue;
        }

        const firstBreakType = normalizeBreakTypeKey(dayBreakSlots[firstSlot]?.breakType || "");
        if (!isEligibleBreakTypeForFullCell(firstBreakType)) {
          continue;
        }

        let span = 1;
        for (let nextIndex = startIndex + 1; nextIndex < timeSlots.length; nextIndex += 1) {
          const nextSlot = timeSlots[nextIndex];
          if (
            !nextSlot
            || appointmentSpanMap[nextSlot] === 0
            || dayAppointments[nextSlot]
            || dayBlockedSlots[nextSlot]
            || dayAbsenceSlots[nextSlot]
          ) {
            break;
          }
          const nextBreakType = normalizeBreakTypeKey(dayBreakSlots[nextSlot]?.breakType || "");
          if (!isEligibleBreakTypeForFullCell(nextBreakType) || nextBreakType !== firstBreakType) {
            break;
          }
          span += 1;
        }

        if (span > 1) {
          spanMap[firstSlot] = span;
          for (let offset = 1; offset < span; offset += 1) {
            const coveredSlot = timeSlots[startIndex + offset];
            if (coveredSlot) {
              spanMap[coveredSlot] = 0;
            }
          }
          startIndex += span - 1;
        }
      }

      for (let startIndex = 0; startIndex < timeSlots.length; startIndex += 1) {
        const firstSlot = timeSlots[startIndex];
        if (!firstSlot || spanMap[firstSlot] === 0) {
          continue;
        }
        if (appointmentSpanMap[firstSlot] === 0 || dayAppointments[firstSlot] || dayBlockedSlots[firstSlot] || dayBreakSlots[firstSlot]) {
          continue;
        }

        const firstReason = String(dayAbsenceSlots[firstSlot]?.reasonFull || "").trim();
        if (!firstReason) {
          continue;
        }

        let span = 1;
        for (let nextIndex = startIndex + 1; nextIndex < timeSlots.length; nextIndex += 1) {
          const nextSlot = timeSlots[nextIndex];
          if (!nextSlot || appointmentSpanMap[nextSlot] === 0 || dayAppointments[nextSlot] || dayBlockedSlots[nextSlot] || dayBreakSlots[nextSlot]) {
            break;
          }
          const nextReason = String(dayAbsenceSlots[nextSlot]?.reasonFull || "").trim();
          if (!nextReason || nextReason !== firstReason) {
            break;
          }
          span += 1;
        }

        if (span > 1) {
          spanMap[firstSlot] = span;
          for (let offset = 1; offset < span; offset += 1) {
            const coveredSlot = timeSlots[startIndex + offset];
            if (coveredSlot) {
              spanMap[coveredSlot] = 0;
            }
          }
          startIndex += span - 1;
        }
      }

      for (let startIndex = 0; startIndex < timeSlots.length; startIndex += 1) {
        const firstSlot = timeSlots[startIndex];
        if (!firstSlot || spanMap[firstSlot] === 0) {
          continue;
        }
        if (
          appointmentSpanMap[firstSlot] === 0
          || dayAppointments[firstSlot]
          || dayBlockedSlots[firstSlot]
          || dayBreakSlots[firstSlot]
          || dayAbsenceSlots[firstSlot]
        ) {
          continue;
        }

        const firstReason = String(dayWorkScheduleBlockedSlots[firstSlot]?.reasonFull || "").trim();
        if (!firstReason) {
          continue;
        }

        let span = 1;
        for (let nextIndex = startIndex + 1; nextIndex < timeSlots.length; nextIndex += 1) {
          const nextSlot = timeSlots[nextIndex];
          if (!nextSlot || appointmentSpanMap[nextSlot] === 0 || dayAppointments[nextSlot] || dayBlockedSlots[nextSlot] || dayBreakSlots[nextSlot]) {
            break;
          }
          const nextReason = String(dayWorkScheduleBlockedSlots[nextSlot]?.reasonFull || "").trim();
          if (!nextReason || nextReason !== firstReason) {
            break;
          }
          span += 1;
        }

        if (span > 1) {
          spanMap[firstSlot] = span;
          for (let offset = 1; offset < span; offset += 1) {
            const coveredSlot = timeSlots[startIndex + offset];
            if (coveredSlot) {
              spanMap[coveredSlot] = 0;
            }
          }
          startIndex += span - 1;
        }
      }

      acc[day.key] = spanMap;
      return acc;
    }, {});
  }, [
    appointmentBlockedSlotsByDay,
    appointmentBreakSlotsByDay,
    appointmentSpecialistAbsenceSlotsByDay,
    appointmentWorkScheduleBlockedSlotsByDay,
    appointmentLookupByDay,
    appointmentRowSpanByDay,
    overlayBusySlotsByDay,
    settings?.slotSubDivisions,
    slotMinutesByValue,
    timeSlots,
    weekDays,
    workingHoursMinutesByDay
  ]);
  const mouseDragStateRef = useRef(null);
  const mouseDragDropTargetRef = useRef(null);
  const suppressNextCardClickRef = useRef(false);
  const [mouseDragPreview, setMouseDragPreview] = useState(null);

  useEffect(() => {
    function findDropCellFromPoint(clientX, clientY, selector) {
      const directElement = document.elementFromPoint(clientX, clientY);
      const directCell = directElement?.closest?.(selector);
      if (directCell) {
        return directCell;
      }

      if (typeof document.elementsFromPoint !== "function") {
        return null;
      }

      const elements = document.elementsFromPoint(clientX, clientY);
      for (const element of elements) {
        const cell = element?.closest?.(selector);
        if (cell) {
          return cell;
        }
      }
      return null;
    }

    function handleDocumentMouseMove(event) {
      const dragState = mouseDragStateRef.current;
      if (!dragState) {
        return;
      }
      const movedEnough = (
        Math.abs(event.clientX - dragState.startX) > 4
        || Math.abs(event.clientY - dragState.startY) > 4
      );
      if (!movedEnough) {
        return;
      }
      const dropSelector = dragState.type === "break"
        ? "[data-break-drop-slot='true']"
        : "[data-appointment-drop-slot='true']";
      const dropCell = findDropCellFromPoint(event.clientX, event.clientY, dropSelector);
      const targetSlot = String(dropCell?.getAttribute("data-drop-slot") || "").trim();
      const dropCellRect = dropCell?.getBoundingClientRect?.() || null;
      mouseDragDropTargetRef.current = dropCell ? {
        date: String(dropCell.getAttribute("data-drop-date") || "").trim(),
        dayKey: String(dropCell.getAttribute("data-drop-day-key") || "").trim(),
        dayLabel: String(dropCell.getAttribute("data-drop-day-label") || "").trim(),
        slot: targetSlot
      } : null;
      setMouseDragPreview({
        status: dragState.status,
        statusCellClassName: dragState.statusCellClassName,
        canDrop: Boolean(dropCell),
        targetSlot,
        targetX: dropCellRect ? dropCellRect.left : 0,
        targetY: dropCellRect ? dropCellRect.top : 0,
        targetWidth: dropCellRect ? dropCellRect.width : 0,
        targetHeight: dropCellRect ? Math.max(dropCellRect.height, dragState.height) : 0
      });
    }

    function handleDocumentMouseUp(event) {
      const dragState = mouseDragStateRef.current;
      const fallbackDropTarget = mouseDragDropTargetRef.current;
      mouseDragStateRef.current = null;
      mouseDragDropTargetRef.current = null;
      setMouseDragPreview(null);
      if (!dragState) {
        return;
      }

      const movedEnough = (
        Math.abs(event.clientX - dragState.startX) > 4
        || Math.abs(event.clientY - dragState.startY) > 4
      );
      if (!movedEnough) {
        return;
      }

      suppressNextCardClickRef.current = true;
      window.setTimeout(() => {
        suppressNextCardClickRef.current = false;
      }, 0);

      const dropSelector = dragState.type === "break"
        ? "[data-break-drop-slot='true']"
        : "[data-appointment-drop-slot='true']";
      const dropCell = findDropCellFromPoint(event.clientX, event.clientY, dropSelector);
      if (!dropCell && !fallbackDropTarget) {
        return;
      }
      if (dragState.type === "break" && typeof onMovePlannerBreak !== "function") {
        return;
      }
      if (dragState.type !== "break" && typeof onMoveAppointment !== "function") {
        return;
      }

      const targetDate = dropCell
        ? String(dropCell.getAttribute("data-drop-date") || "").trim()
        : String(fallbackDropTarget?.date || "").trim();
      const targetDayKey = dropCell
        ? String(dropCell.getAttribute("data-drop-day-key") || "").trim()
        : String(fallbackDropTarget?.dayKey || "").trim();
      const targetDayLabel = dropCell
        ? String(dropCell.getAttribute("data-drop-day-label") || "").trim()
        : String(fallbackDropTarget?.dayLabel || "").trim();
      const targetSlot = dropCell
        ? String(dropCell.getAttribute("data-drop-slot") || "").trim()
        : String(fallbackDropTarget?.slot || "").trim();
      if (!targetDate || !targetDayKey || !targetSlot) {
        return;
      }

      const targetDay = {
        key: targetDayKey,
        label: targetDayLabel,
        date: new Date(`${targetDate}T00:00:00`)
      };
      if (dragState.type === "break") {
        onMovePlannerBreak(dragState.item, dragState.sourceDay, targetDay, targetSlot);
      } else {
        onMoveAppointment(dragState.item, dragState.sourceDay, targetDay, targetSlot);
      }
    }

    document.addEventListener("mousemove", handleDocumentMouseMove);
    document.addEventListener("mouseup", handleDocumentMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
      document.removeEventListener("mouseup", handleDocumentMouseUp);
    };
  }, [onMoveAppointment, onMovePlannerBreak]);

  return (
    <div className="appointment-client-focused-section">
      {sectionTitle ? (
        <div className="appointment-client-focused-section-head">
          <p className="appointment-client-focused-section-title">{sectionTitle}</p>
        </div>
      ) : null}
      <div className={["appointment-grid-wrap", mouseDragPreview ? "appointment-grid-dragging" : "", wrapperClassName].filter(Boolean).join(" ") || undefined}>
        <table className="appointment-grid" aria-label={ariaLabel || sectionTitle || "Appointment week table"}>
          <thead>
            <tr>
              <th className="appointment-time-col">Time</th>
              {weekDays.map((day) => {
                const rawDayAppointments = (Array.isArray(rawAppointmentsByDay?.[day.key]) ? rawAppointmentsByDay[day.key] : [])
                  .filter((item) => String(item?.itemType || "").trim().toLowerCase() !== "daily-routine")
                  .filter((item) => canMutatePlannerSpecialist || canMutateAppointmentSpecialist(item));
                const visibleDayAppointments = (Array.isArray(appointmentsByDay?.[day.key]) ? appointmentsByDay[day.key] : [])
                  .filter((item) => String(item?.itemType || "").trim().toLowerCase() !== "daily-routine")
                  .filter((item) => canMutatePlannerSpecialist || canMutateAppointmentSpecialist(item));
                const canOpenDayBulkActions = Boolean(
                  rawDayAppointments.length > 0
                  && (canUpdateAppointments || canDeleteAppointments)
                  && typeof onOpenDayBulkModal === "function"
                );
                const dayHeaderClassName = [
                  "appointment-day-head-col-gap",
                  canOpenDayBulkActions ? "appointment-day-head-bulk-enabled" : "",
                  isSameDate(day.date, now) ? "appointment-day-is-today" : ""
                ].filter(Boolean).join(" ") || undefined;

                return (
                  <th key={day.key} className={dayHeaderClassName}>
                    {canOpenDayBulkActions ? (
                      <button
                        type="button"
                        className="appointment-day-bulk-btn"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onOpenDayBulkModal(day, rawDayAppointments.length > 0 ? rawDayAppointments : visibleDayAppointments);
                        }}
                        aria-label={`Manage appointments for ${day.label}`}
                      >
                        <span>{day.label}</span>
                        <small>{formatHeaderDate(day.date)}</small>
                        <strong>Day Planner</strong>
                      </button>
                    ) : (
                      <div className="appointment-day-head">
                        <span>{day.label}</span>
                        <small>{formatHeaderDate(day.date)}</small>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((slot) => {
              const slotMinutes = slotMinutesByValue[slot];
              const slotSubDivisionsNum = Math.max(1, Number.parseInt(String(settings?.slotSubDivisions || "1"), 10) || 1);
              const slotIndex = slotIndexByValue[slot];
              const isMajorSlot = slotSubDivisionsNum <= 1 || slotIndex % slotSubDivisionsNum === 0;
              const timeColRowSpan = isMajorSlot && slotSubDivisionsNum > 1
                ? Math.min(slotSubDivisionsNum, timeSlots.length - slotIndex)
                : 1;

              return (
                <tr
                  key={slot}
                  className={isMajorSlot ? (slotSubDivisionsNum > 1 ? "appointment-row-major-slot" : undefined) : "appointment-row-sub-slot"}
                  style={slotRowHeightStyle}
                >
                  {isMajorSlot ? (
                    <th
                      className="appointment-time-col"
                      scope="row"
                      rowSpan={timeColRowSpan > 1 ? timeColRowSpan : undefined}
                    >
                      {slot}
                    </th>
                  ) : null}
                  {weekDays.map((day) => {
                    const dayMinutes = workingHoursMinutesByDay[day.key] || { start: null, end: null };
                    const isInsideWorkingHours = (
                      slotMinutes !== null
                      && dayMinutes.start !== null
                      && dayMinutes.end !== null
                      && slotMinutes >= dayMinutes.start
                      && slotMinutes < dayMinutes.end
                    );
                    const item = appointmentLookupByDay[day.key]?.[slot] || null;
                    const blockedItem = appointmentBlockedSlotsByDay[day.key]?.[slot] || null;
                    const overlayBusyItem = overlayBusySlotsByDay[day.key]?.[slot] || null;
                    const breakBlockedItem = appointmentBreakSlotsByDay[day.key]?.[slot] || null;
                    const absenceBlockedItem = appointmentSpecialistAbsenceSlotsByDay[day.key]?.[slot] || null;
                    const workScheduleBlockedItem = appointmentWorkScheduleBlockedSlotsByDay[day.key]?.[slot] || null;
                    const appointmentRowSpan = appointmentRowSpanByDay[day.key]?.[slot];
                    const specialCellRowSpan = specialCellRowSpanByDay[day.key]?.[slot];

                    if (appointmentRowSpan === 0 || specialCellRowSpan === 0) {
                      return null;
                    }

                    const effectiveRowSpan = (
                      appointmentRowSpan && appointmentRowSpan > 1
                        ? appointmentRowSpan
                        : (specialCellRowSpan && specialCellRowSpan > 1 ? specialCellRowSpan : 1)
                    );
                    const tdRowSpan = effectiveRowSpan > 1 ? effectiveRowSpan : undefined;
                    const appointmentCardHeightPx = effectiveRowSpan * slotCellHeightPx;
                    const isCompactAppointmentCard = appointmentCardHeightPx <= COMPACT_APPOINTMENT_CARD_MAX_HEIGHT_PX;
                    const reachesBottom = Boolean(
                      tdRowSpan
                      && Number.isInteger(slotIndex)
                      && (slotIndex + effectiveRowSpan >= timeSlots.length)
                    );
                    const isClientCardMode = cardDisplayMode === "client";
                    const isRoutineCard = String(item?.itemType || "").trim().toLowerCase() === "daily-routine";
                    const isPendingAppointment = isPendingAppointmentStatus(item?.status);
                    const dayDateYmd = formatDateYmd(day.date);
                    const isHistoryLockedDayCell = isHistoryLockedDateYmd(dayDateYmd, settings?.historyLockDays);
                    const cardTimeRangeLabel = item
                      ? formatAppointmentTimeRangeLabel(item?.time || slot, item?.endTime, item?.durationMinutes)
                      : "";
                    const cardPrimaryText = isClientCardMode
                      ? (
                        isRoutineCard
                          ? (String(item?.service || "").trim() || "Daily routine")
                          : (String(item?.specialist || "").trim() || "Specialist")
                      )
                      : (String(item?.client || "").trim() || "Client");
                    const cardSecondaryText = isClientCardMode
                      ? (
                        isRoutineCard
                          ? (cardTimeRangeLabel || "Daily routine")
                          : (
                            String(item?.secondaryText || "").trim()
                            || String(item?.specialistPosition || "").trim()
                            || "Specialist"
                          )
                      )
                      : (String(item?.service || "").trim() || "Service");
                    const cardDurationLabel = item
                      ? (
                        formatBookingDurationLabel(item?.durationMinutes)
                        || formatBookingDurationLabel(getDurationMinutesFromTimes(item?.time || slot, item?.endTime))
                      )
                      : "";
                    const timeHoverCellClassName = cardTimeRangeLabel
                      ? (
                        isCompactAppointmentCard
                          ? "appointment-booked-time-td appointment-booked-time-td-compact"
                          : "appointment-booked-time-td"
                      )
                      : "";
                    const isOffSlotCell = !isInsideWorkingHours;
                    const blockedStatus = (
                      blockedItem && blockedItem.hiddenByFilter !== true
                        ? String(blockedItem.status || "")
                        : ""
                    );
                    const normalizedStatus = String(item?.status ?? blockedStatus ?? "").trim().toLowerCase();
                    const statusKey = normalizedStatus === "no_show" ? "no-show" : normalizedStatus;
                    const statusCellClassName = (
                      statusKey === "confirmed"
                      || statusKey === "pending"
                      || statusKey === "cancelled"
                      || statusKey === "no-show"
                      || statusKey === "routine"
                    )
                      ? `appointment-status-cell-${statusKey}`
                      : "";
                    const canOpenCreateFromCell = (
                      isInsideWorkingHours
                      && !item
                      && !blockedItem
                      && !absenceBlockedItem
                      && !workScheduleBlockedItem
                      && !breakBlockedItem
                      && !overlayBusyItem
                      && !isHistoryLockedDayCell
                      && canCreateOnSpecialist
                      && typeof onOpenCreateModal === "function"
                    );
                    const canDropAppointmentToCell = (
                      isInsideWorkingHours
                      && !item
                      && !blockedItem
                      && !absenceBlockedItem
                      && !workScheduleBlockedItem
                      && !breakBlockedItem
                      && !overlayBusyItem
                      && !isHistoryLockedDayCell
                      && canUpdateAppointments
                      && canMutatePlannerSpecialist
                      && typeof onMoveAppointment === "function"
                    );
                    const canDropBreakToCell = (
                      isInsideWorkingHours
                      && !item
                      && !blockedItem
                      && !absenceBlockedItem
                      && !workScheduleBlockedItem
                      && !breakBlockedItem
                      && !overlayBusyItem
                      && !isHistoryLockedDayCell
                      && canUpdateAppointmentBreaks
                      && canMutatePlannerSpecialist
                      && typeof onMovePlannerBreak === "function"
                    );
                    const canDropAnyToCell = canDropAppointmentToCell || canDropBreakToCell;
                    const canOpenBreakBlockFromCell = Boolean(
                      isInsideWorkingHours
                      && breakBlockedItem
                      && canUpdateAppointmentBreaks
                      && canMutatePlannerSpecialist
                      && typeof onOpenPlannerBlockModal === "function"
                    );
                    const canDragBreakFromCell = Boolean(
                      canOpenBreakBlockFromCell
                      && typeof onMovePlannerBreak === "function"
                    );
                    const canOpenWorkScheduleBlockFromCell = Boolean(
                      isInsideWorkingHours
                      && workScheduleBlockedItem
                      && canMutatePlannerSpecialist
                      && (canUpdateAppointmentWorkSchedule || canDeleteAppointmentWorkSchedule)
                      && typeof onOpenPlannerBlockModal === "function"
                    );
                    const editableBlockType = canOpenBreakBlockFromCell
                      ? PLANNER_MODAL_TABS.break
                      : (canOpenWorkScheduleBlockFromCell ? PLANNER_MODAL_TABS.workSchedule : "");
                    const editableBlockItem = canOpenBreakBlockFromCell
                      ? breakBlockedItem
                      : (canOpenWorkScheduleBlockFromCell ? workScheduleBlockedItem : null);
                    const canOpenEditableBlockFromCell = Boolean(editableBlockType && editableBlockItem);
                    const tdClassName = [
                      "appointment-day-col-gap",
                      canOpenCreateFromCell ? "appointment-create-slot-td" : "",
                      canDropAppointmentToCell ? "appointment-drop-slot-td" : "",
                      canDropBreakToCell ? "appointment-break-drop-slot-td" : "",
                      canOpenEditableBlockFromCell ? "appointment-editable-block-slot-td" : "",
                      timeHoverCellClassName,
                      tdRowSpan ? "appointment-td-multi-slot" : "",
                      reachesBottom ? "appointment-td-reaches-bottom" : "",
                      isOffSlotCell ? "appointment-off-slot-td" : "",
                      statusCellClassName,
                      (absenceBlockedItem || workScheduleBlockedItem) ? "appointment-work-schedule-blocked-td" : "",
                      breakBlockedItem ? `appointment-break-type-${breakBlockedItem.breakType}-td` : "",
                      overlayBusyItem ? "appointment-shadow-overlay-td" : "",
                      overlayBusyItem?.isStart ? "appointment-shadow-overlay-start-td" : "",
                      overlayBusyItem?.rangePosition ? `appointment-shadow-overlay-${overlayBusyItem.rangePosition}-td` : "",
                    ].filter(Boolean).join(" ") || undefined;

                    return (
                      <td
                        key={`${day.key}-${slot}`}
                        rowSpan={tdRowSpan}
                        className={tdClassName}
                        data-slot-label={(canOpenCreateFromCell || canDropAnyToCell) ? slot : undefined}
                        data-time-range={cardTimeRangeLabel || undefined}
                        data-duration-label={cardDurationLabel || undefined}
                        data-appointment-drop-slot={canDropAppointmentToCell ? "true" : undefined}
                        data-break-drop-slot={canDropBreakToCell ? "true" : undefined}
                        data-drop-day-key={canDropAnyToCell ? day.key : undefined}
                        data-drop-day-label={canDropAnyToCell ? day.label : undefined}
                        data-drop-date={canDropAnyToCell ? formatDateYmd(day.date) : undefined}
                        data-drop-slot={canDropAnyToCell ? slot : undefined}
                        onDragOver={canDropAnyToCell ? (event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        } : undefined}
                        onDrop={canDropAnyToCell ? (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const rawPayload = (
                            event.dataTransfer.getData("application/json")
                            || event.dataTransfer.getData("text/plain")
                          );
                          if (!rawPayload) {
                            return;
                          }
                          try {
                            const payload = JSON.parse(rawPayload);
                            if (payload?.type === "break") {
                              if (canDropBreakToCell && typeof onMovePlannerBreak === "function") {
                                mouseDragStateRef.current = null;
                                mouseDragDropTargetRef.current = null;
                                setMouseDragPreview(null);
                                onMovePlannerBreak(payload.item, payload.sourceDay, day, slot);
                              }
                              return;
                            }
                            if (canDropAppointmentToCell && typeof onMoveAppointment === "function") {
                              onMoveAppointment(payload.item, payload.sourceDay, day, slot);
                            }
                          } catch {
                            // Ignore malformed drag payloads from outside the planner.
                          }
                        } : undefined}
                        onClick={
                          canOpenCreateFromCell
                            ? (event) => {
                                if (suppressNextCardClickRef.current) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  suppressNextCardClickRef.current = false;
                                  return;
                                }
                                onOpenCreateModal(day, slot);
                              }
                            : (
                                canOpenEditableBlockFromCell
                                  ? (event) => {
                                      if (suppressNextCardClickRef.current) {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        suppressNextCardClickRef.current = false;
                                        return;
                                      }
                                      onOpenPlannerBlockModal(day, slot, editableBlockType, editableBlockItem);
                                    }
                                  : undefined
                              )
                        }
                      >
                        {!isInsideWorkingHours ? (
                          null
                        ) : item ? (
                          (!isRoutineCard && canMutateAppointmentSpecialist(item) && (canUpdateAppointments || canDeleteAppointments)) ? (
                            <button
                              type="button"
                              className={`appointment-card${tdRowSpan ? " appointment-card-multi-slot" : ""}${isCompactAppointmentCard ? " appointment-card-compact" : ""}${isPendingAppointment && !isHistoryLockedDayCell ? " appointment-card-btn" : ""} appointment-status-${item.status}`}
                              onMouseDown={(event) => {
                                if (event.button !== 0 || !isPendingAppointment || isHistoryLockedDayCell || typeof onMoveAppointment !== "function") {
                                  return;
                                }
                                event.preventDefault();
                                const slotCell = event.currentTarget.closest("td");
                                const cardRect = (slotCell || event.currentTarget).getBoundingClientRect();
                                mouseDragStateRef.current = {
                                  item,
                                  sourceDay: {
                                    key: day.key,
                                    label: day.label,
                                    date: formatDateYmd(day.date)
                                  },
                                  startX: event.clientX,
                                  startY: event.clientY,
                                  offsetX: event.clientX - cardRect.left,
                                  offsetY: event.clientY - cardRect.top,
                                  originLeft: cardRect.left,
                                  originTop: cardRect.top,
                                  width: cardRect.width,
                                  height: cardRect.height,
                                  status: item.status,
                                  statusCellClassName,
                                  isCompact: isCompactAppointmentCard
                                };
                              }}
                              onClick={(event) => {
                                if (suppressNextCardClickRef.current) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  suppressNextCardClickRef.current = false;
                                  return;
                                }
                                onOpenCreateModal(day, slot, item);
                              }}
                              aria-label={`Edit appointment on ${day.label} at ${slot}`}
                            >
                              <p className="appointment-client">{cardPrimaryText}</p>
                              {!isCompactAppointmentCard ? <p className="appointment-service">{cardSecondaryText}</p> : null}
                            </button>
                          ) : (
                            <div
                              className={`appointment-card${tdRowSpan ? " appointment-card-multi-slot" : ""}${isCompactAppointmentCard ? " appointment-card-compact" : ""} appointment-status-${item.status}`}
                              aria-label={isRoutineCard ? `Daily routine on ${day.label} at ${slot}` : `Appointment on ${day.label} at ${slot}`}
                            >
                              <p className="appointment-client">{cardPrimaryText}</p>
                              {!isCompactAppointmentCard ? <p className="appointment-service">{cardSecondaryText}</p> : null}
                            </div>
                          )
                        ) : (blockedItem && blockedItem.hiddenByFilter !== true) ? (
                          <span
                            className={`appointment-occupied-slot appointment-status-${blockedItem.status}`}
                            aria-label={`Booked slot on ${day.label} at ${slot}`}
                          />
                        ) : absenceBlockedItem ? (
                          <span
                            className="appointment-break-text-only appointment-work-schedule-blocked-text"
                            aria-label={`Specialist absent on ${day.label} at ${slot}`}
                            title={String(absenceBlockedItem.reasonFull || "").trim() || undefined}
                          >
                            <span className="appointment-break-slot-text">{absenceBlockedItem.reasonShort}</span>
                          </span>
                        ) : workScheduleBlockedItem ? (
                          <span
                            className="appointment-break-text-only appointment-work-schedule-blocked-text"
                            aria-label={`Blocked slot on ${day.label} at ${slot}`}
                            title={String(workScheduleBlockedItem.reasonFull || "").trim() || undefined}
                          >
                            <span className="appointment-break-slot-text">{workScheduleBlockedItem.reasonShort}</span>
                          </span>
                        ) : breakBlockedItem ? (
                          <span
                            className={`appointment-break-text-only${canDragBreakFromCell ? " appointment-break-draggable" : ""}`}
                            draggable={canDragBreakFromCell ? true : undefined}
                            aria-label={`Break slot on ${day.label} at ${slot}`}
                            title={String(breakBlockedItem.reasonFull || "").trim() || undefined}
                            onDragStart={canDragBreakFromCell ? (event) => {
                              const sourceDay = {
                                key: day.key,
                                label: day.label,
                                date: formatDateYmd(day.date)
                              };
                              const payload = JSON.stringify({
                                type: "break",
                                item: breakBlockedItem,
                                sourceDay
                              });
                              mouseDragStateRef.current = null;
                              mouseDragDropTargetRef.current = null;
                              setMouseDragPreview(null);
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("application/json", payload);
                              event.dataTransfer.setData("text/plain", payload);
                            } : undefined}
                            onDragEnd={canDragBreakFromCell ? () => {
                              mouseDragStateRef.current = null;
                              mouseDragDropTargetRef.current = null;
                              setMouseDragPreview(null);
                            } : undefined}
                            onMouseDown={canDragBreakFromCell ? (event) => {
                              if (event.button !== 0) {
                                return;
                              }
                              event.preventDefault();
                              event.stopPropagation();
                              const slotCell = event.currentTarget.closest("td");
                              const cellRect = (slotCell || event.currentTarget).getBoundingClientRect();
                              mouseDragStateRef.current = {
                                type: "break",
                                item: breakBlockedItem,
                                sourceDay: {
                                  key: day.key,
                                  label: day.label,
                                  date: formatDateYmd(day.date)
                                },
                                startX: event.clientX,
                                startY: event.clientY,
                                offsetX: event.clientX - cellRect.left,
                                offsetY: event.clientY - cellRect.top,
                                originLeft: cellRect.left,
                                originTop: cellRect.top,
                                width: cellRect.width,
                                height: cellRect.height,
                                status: "break",
                                statusCellClassName: `appointment-break-type-${breakBlockedItem.breakType}-td`,
                                isCompact: true
                              };
                            } : undefined}
                          >
                            <span className="appointment-break-slot-text">{breakBlockedItem.reasonShort}</span>
                          </span>
                        ) : null}
                        {overlayBusyItem ? (
                          <span
                            className={`appointment-shadow-overlay is-${overlayBusyItem.rangePosition || "middle"} appointment-shadow-overlay-${overlayBusyItem.status || "pending"}`}
                            title={String(overlayBusyItem.title || "").trim() || undefined}
                            aria-label={`${overlayBusyItem.label || "Overlay"} busy on ${day.label} at ${slot}`}
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {mouseDragPreview?.canDrop && mouseDragPreview.targetWidth > 0 && mouseDragPreview.targetHeight > 0 ? (
        typeof document !== "undefined"
          ? createPortal(
              <div
                className={`appointment-drop-orienter ${mouseDragPreview.statusCellClassName || ""} appointment-status-${mouseDragPreview.status}`}
                style={{
                  left: `${mouseDragPreview.targetX}px`,
                  top: `${mouseDragPreview.targetY}px`,
                  width: `${mouseDragPreview.targetWidth}px`,
                  height: `${mouseDragPreview.targetHeight}px`
                }}
                aria-hidden="true"
              >
                <span className="appointment-drop-orienter-time">{mouseDragPreview.targetSlot}</span>
              </div>,
              document.body
            )
          : null
      ) : null}
    </div>
  );
}

function AppointmentScheduler({
  canReadAppointments = true,
  canReadAppointmentBreaks = true,
  canViewAppointmentSpecialistAbsenceBlocks = true,
  canReadStatisticsPlannerReport = false,
  canCreateAppointments = true,
  canUpdateAppointments = true,
  canDeleteAppointments = true,
  canUpdateAppointmentBreaks = false,
  canCreateAppointmentWorkSchedule = false,
  canUpdateAppointmentWorkSchedule = false,
  canDeleteAppointmentWorkSchedule = false,
  currentUserId = "",
  restrictCreateToOwnSpecialist = false,
  specialistLimitedEdit = false,
  vipOnly = false,
  recurringOnly = false,
  showWeekSwitcher = true,
  vipClassDailyRoutines = [],
  onNotification = null
}) {
  const specialistLabel = vipOnly ? "Class" : "Specialist";
  const specialistSelectPlaceholder = vipOnly ? "Select class" : "Select specialist";
  const specialistSearchPlaceholder = vipOnly ? "Search class" : "Search specialist";
  const canReadPlannerBreaks = canReadAppointments || canReadAppointmentBreaks;
  const [message, setMessage] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [compactWeekRange, setCompactWeekRange] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(max-width: 860px)").matches;
  });
  const [isSchedulerInitialized, setIsSchedulerInitialized] = useState(false);
  const [vipSchedulesReady, setVipSchedulesReady] = useState(!vipOnly);
  const [specialists, setSpecialists] = useState([]);
  const [specialistRoleById, setSpecialistRoleById] = useState(() => ({}));
  const [vipClientsByClassId, setVipClientsByClassId] = useState(() => ({}));
  const [vipSchedulesByClass, setVipSchedulesByClass] = useState(() => ({}));
  const [vipSchedulesWeekKeyByClass, setVipSchedulesWeekKeyByClass] = useState(() => ({}));
  const [vipConfirmingByAppointmentId, setVipConfirmingByAppointmentId] = useState(() => ({}));
  const [plannerPrimaryFilterMode, setPlannerPrimaryFilterMode] = useState(() => {
    if (vipOnly) {
      return "specialist";
    }
    const storedMode = readStoredPlannerFilterMode(currentUserId);
    return storedMode === "client" ? "client" : "specialist";
  });
  const [selectedPlannerClientFilterId, setSelectedPlannerClientFilterId] = useState(() => (
    !vipOnly && readStoredPlannerFilterMode(currentUserId) === "client"
      ? readStoredPlannerClientSelectionId(currentUserId)
      : ""
  ));
  const [storedPlannerClientSnapshot, setStoredPlannerClientSnapshot] = useState(() => (
    !vipOnly
      ? readStoredPlannerClientSelectionSnapshot(currentUserId)
      : null
  ));
  const [plannerFilterClients, setPlannerFilterClients] = useState([]);
  const [plannerClientSearch, setPlannerClientSearch] = useState("");
  const [plannerClientSearchOptions, setPlannerClientSearchOptions] = useState([]);
  const [plannerClientSearchMap, setPlannerClientSearchMap] = useState(() => ({}));
  const [clientFocusedPlannerSpecialists, setClientFocusedPlannerSpecialists] = useState([]);
  const [clientFocusedSchedulesBySpecialist, setClientFocusedSchedulesBySpecialist] = useState(() => ({}));
  const [clientFocusedPlannerWeekKey, setClientFocusedPlannerWeekKey] = useState("");
  const [selectedVipClientFilterId, setSelectedVipClientFilterId] = useState("");
  const [selectedSpecialistId, setSelectedSpecialistId] = useState(
    () => readStoredSchedulerSelectionId(vipOnly, currentUserId)
  );
  const hydratedPlannerStorageUserKeyRef = useRef("");
  const [hydratedPlannerStorageKey, setHydratedPlannerStorageKey] = useState("");
  const [specialistSelectError, setSpecialistSelectError] = useState(false);
  const [appointmentsBySpecialist, setAppointmentsBySpecialist] = useState(() => ({}));
  const [appointmentsWeekKeyBySpecialist, setAppointmentsWeekKeyBySpecialist] = useState(() => ({}));
  const [breaksBySpecialist, setBreaksBySpecialist] = useState(() => ({}));
  const [absencesBySpecialist, setAbsencesBySpecialist] = useState(() => ({}));
  const [absencesWeekKeyBySpecialist, setAbsencesWeekKeyBySpecialist] = useState(() => ({}));
  const [createModal, setCreateModal] = useState({
    open: false,
    mode: "create",
    appointmentId: "",
    specialistId: "",
    dayKey: "",
    dayLabel: "",
    date: null,
    time: "",
    repeatType: "none",
    repeatGroupKey: "",
    originalRepeatDays: [],
    originalStatus: "",
    plannerBlockType: "",
    plannerBlockOriginal: null
  });
  const [createForm, setCreateForm] = useState(createEmptyClientForm);
  const [activePlannerModalTab, setActivePlannerModalTab] = useState(PLANNER_MODAL_TABS.appointment);
  const [plannerBreakForm, setPlannerBreakForm] = useState(() => createEmptyPlannerBreakForm());
  const [plannerWorkScheduleForm, setPlannerWorkScheduleForm] = useState(() => createEmptyPlannerWorkScheduleForm());
  const [createErrors, setCreateErrors] = useState({});
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createDeleting, setCreateDeleting] = useState(false);
  const [dayBulkModal, setDayBulkModal] = useState({
    open: false,
    dayKey: "",
    dayLabel: "",
    appointmentDate: "",
    displayMode: "client",
    items: [],
    selectedIds: [],
    status: "cancelled",
    note: "",
    submitting: false,
    deleting: false,
    error: ""
  });
  const [clientSearch, setClientSearch] = useState(createEmptyClientSearchForm);
  const [clientSearchMessage, setClientSearchMessage] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [clientMap, setClientMap] = useState({});
  const [settings, setSettings] = useState({
    slotInterval: "30",
    slotSubDivisions: "1",
    appointmentDurationOptions: ["30"],
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    workingHours: createDefaultWorkingHours(),
    slotCellHeightPx: String(DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX),
    historyLockDays: "",
    blockedTimes: []
  });
  const schedulesRequestIdRef = useRef(0);
  const breaksRequestIdRef = useRef(0);
  const absencesRequestIdRef = useRef(0);
  const clientFocusedRequestIdRef = useRef(0);
  const clientFocusedPreviewRequestIdRef = useRef(0);
  const comparisonOverlaySpecialistRequestIdRef = useRef(0);
  const recurringPatternDraftRef = useRef({
    repeatUntil: "",
    repeatDays: []
  });
  const [clientFocusedPreviewAppointmentsByDay, setClientFocusedPreviewAppointmentsByDay] = useState(() => ({}));
  const [clientFocusedPreviewSettings, setClientFocusedPreviewSettings] = useState(null);
  const [clientFocusedPreviewBreaks, setClientFocusedPreviewBreaks] = useState([]);
  const [clientFocusedPreviewAbsences, setClientFocusedPreviewAbsences] = useState([]);
  const [clientFocusedPreviewWeekKey, setClientFocusedPreviewWeekKey] = useState("");
  const [comparisonOverlaySpecialistSettings, setComparisonOverlaySpecialistSettings] = useState(null);
  const [comparisonOverlaySpecialistBreaks, setComparisonOverlaySpecialistBreaks] = useState([]);
  const normalizedCurrentUserId = String(currentUserId || "").trim();
  const normalizedSelectedPlannerClientFilterId = String(selectedPlannerClientFilterId || "").trim();
  const currentPlannerStorageHydrationKey = normalizedCurrentUserId
    ? `${vipOnly ? "vip" : "planner"}:${normalizedCurrentUserId}`
    : "";
  useEffect(() => {
    if (!normalizedCurrentUserId) {
      return;
    }

    const hydrationKey = currentPlannerStorageHydrationKey;
    if (hydratedPlannerStorageUserKeyRef.current === hydrationKey) {
      return;
    }
    hydratedPlannerStorageUserKeyRef.current = hydrationKey;

    if (vipOnly) {
      const persistedVipSelectionId = readStoredSchedulerSelectionId(true, normalizedCurrentUserId);
      if (persistedVipSelectionId) {
        setSelectedSpecialistId(persistedVipSelectionId);
      }
      setHydratedPlannerStorageKey(hydrationKey);
      return;
    }

    const persistedPlannerFilterMode = readStoredPlannerFilterMode(normalizedCurrentUserId);
    const persistedPlannerClientId = readStoredPlannerClientSelectionId(normalizedCurrentUserId);
    const persistedPlannerClientSnapshot = readStoredPlannerClientSelectionSnapshot(normalizedCurrentUserId);
    const persistedSpecialistId = readStoredSchedulerSelectionId(false, normalizedCurrentUserId);

    if (persistedPlannerFilterMode === "client" && persistedPlannerClientId) {
      setPlannerPrimaryFilterMode("client");
      setSelectedPlannerClientFilterId(persistedPlannerClientId);
      setStoredPlannerClientSnapshot(
        String(persistedPlannerClientSnapshot?.id || "").trim() === persistedPlannerClientId
          ? persistedPlannerClientSnapshot
          : null
      );
      setSelectedSpecialistId("");
      setHydratedPlannerStorageKey(hydrationKey);
      return;
    }

    setPlannerPrimaryFilterMode("specialist");
    setSelectedPlannerClientFilterId("");
    setStoredPlannerClientSnapshot(null);
    if (persistedSpecialistId) {
      setSelectedSpecialistId(persistedSpecialistId);
    }
    setHydratedPlannerStorageKey(hydrationKey);
  }, [currentPlannerStorageHydrationKey, normalizedCurrentUserId, vipOnly]);
  const canMutateSpecialistId = useCallback((value) => {
    if (!restrictCreateToOwnSpecialist) {
      return true;
    }
    return Boolean(normalizedCurrentUserId) && normalizedCurrentUserId === String(value || "").trim();
  }, [normalizedCurrentUserId, restrictCreateToOwnSpecialist]);
  const canMutateAppointmentSpecialist = useCallback(
    (item) => canMutateSpecialistId(item?.specialistId),
    [canMutateSpecialistId]
  );
  const canCreateOnPlannerSpecialist = useCallback((specialistId) => (
    !vipOnly
    && canCreateAppointments
    && canMutateSpecialistId(specialistId)
  ), [canCreateAppointments, canMutateSpecialistId, vipOnly]);
  const persistPlannerToolbarSelectionSync = useCallback(({
    specialistId = "",
    clientId = "",
    clientSnapshot = null
  } = {}) => {
    if (typeof window === "undefined" || !normalizedCurrentUserId) {
      return;
    }

    if (vipOnly) {
      const vipStorageKey = getSchedulerSelectionStorageKey(true, currentUserId);
      const normalizedVipSpecialistId = String(specialistId || "").trim();
      if (normalizedVipSpecialistId) {
        window.localStorage.setItem(vipStorageKey, normalizedVipSpecialistId);
      }
      return;
    }

    const specialistStorageKey = getSchedulerSelectionStorageKey(false, currentUserId);
    const clientStorageKey = getPlannerClientSelectionStorageKey(currentUserId);
    const clientSnapshotStorageKey = getPlannerClientSnapshotStorageKey(currentUserId);
    const normalizedSpecialistId = String(specialistId || "").trim();
    const normalizedClientId = String(clientId || "").trim();
    const normalizedClientSnapshot = normalizePlannerStoredClientSnapshot(clientSnapshot);

    if (normalizedSpecialistId) {
      window.localStorage.setItem(specialistStorageKey, normalizedSpecialistId);
      return;
    }

    if (normalizedClientId) {
      window.localStorage.setItem(clientStorageKey, normalizedClientId);
      if (normalizedClientSnapshot) {
        window.localStorage.setItem(clientSnapshotStorageKey, JSON.stringify(normalizedClientSnapshot));
      }
    }
  }, [currentUserId, normalizedCurrentUserId, vipOnly]);
  const clearPlannerSpecialistSelection = useCallback(() => {
    if (typeof window !== "undefined" && normalizedCurrentUserId) {
      removeScopedAndLegacyStorageValue(
        vipOnly ? APPOINTMENT_VIP_CLIENT_STORAGE_KEY : APPOINTMENT_SPECIALIST_STORAGE_KEY,
        currentUserId
      );
      if (!vipOnly && !String(selectedPlannerClientFilterId || "").trim()) {
        removeScopedAndLegacyStorageValue(APPOINTMENT_PLANNER_CLIENT_STORAGE_KEY, currentUserId);
        removeScopedAndLegacyStorageValue(APPOINTMENT_PLANNER_CLIENT_SNAPSHOT_STORAGE_KEY, currentUserId);
        removeScopedAndLegacyStorageValue(APPOINTMENT_PLANNER_FILTER_MODE_STORAGE_KEY, currentUserId);
      }
    }
    setSelectedSpecialistId("");
    setSelectedVipClientFilterId("");
    if (!vipOnly && String(selectedPlannerClientFilterId || "").trim()) {
      setPlannerPrimaryFilterMode("client");
    }
    setSpecialistSelectError(false);
    setWeekOffset(0);
  }, [currentUserId, normalizedCurrentUserId, selectedPlannerClientFilterId, vipOnly]);
  const clearPlannerClientSelection = useCallback(() => {
    if (typeof window !== "undefined" && normalizedCurrentUserId) {
      removeScopedAndLegacyStorageValue(APPOINTMENT_PLANNER_CLIENT_STORAGE_KEY, currentUserId);
      removeScopedAndLegacyStorageValue(APPOINTMENT_PLANNER_CLIENT_SNAPSHOT_STORAGE_KEY, currentUserId);
      if (!String(selectedSpecialistId || "").trim()) {
        removeScopedAndLegacyStorageValue(APPOINTMENT_SPECIALIST_STORAGE_KEY, currentUserId);
        removeScopedAndLegacyStorageValue(APPOINTMENT_PLANNER_FILTER_MODE_STORAGE_KEY, currentUserId);
      }
    }
    setSelectedPlannerClientFilterId("");
    setStoredPlannerClientSnapshot(null);
    setPlannerClientSearch("");
    if (String(selectedSpecialistId || "").trim()) {
      setPlannerPrimaryFilterMode("specialist");
    }
    setWeekOffset(0);
  }, [currentUserId, normalizedCurrentUserId, selectedSpecialistId]);
  const isClientFocusedMode = (
    !vipOnly
    && Boolean(normalizedSelectedPlannerClientFilterId)
    && (!String(selectedSpecialistId || "").trim() || plannerPrimaryFilterMode === "client")
  );
  const hasPlannerComparisonOverlay = (
    !vipOnly
    && Boolean(normalizedSelectedPlannerClientFilterId)
    && Boolean(String(selectedSpecialistId || "").trim())
  );
  const hasSelectedPlannerClientFilter = !vipOnly && Boolean(normalizedSelectedPlannerClientFilterId);
  const weekStartDate = useMemo(() => addDays(getStartOfWeek(new Date()), weekOffset * 7), [weekOffset]);
  const weekEndDate = useMemo(() => addDays(weekStartDate, 6), [weekStartDate]);
  const clientFocusedPlannerDataKey = useMemo(() => (
    `${normalizedSelectedPlannerClientFilterId}:${formatDateYmd(weekStartDate)}:${formatDateYmd(weekEndDate)}:${recurringOnly ? "1" : "0"}`
  ), [normalizedSelectedPlannerClientFilterId, recurringOnly, weekEndDate, weekStartDate]);
  const loadAppointmentSettings = useCallback(async ({ silent = false } = {}) => {
    try {
      const settingsQuery = new URLSearchParams();
      if (
        !vipOnly
        && !isClientFocusedMode
        && String(selectedSpecialistId || "").trim()
      ) {
        settingsQuery.set("specialistId", String(selectedSpecialistId || "").trim());
      }
      const settingsUrl = settingsQuery.size > 0
        ? `/api/appointments/settings?${settingsQuery.toString()}`
        : "/api/appointments/settings";
      const response = await apiFetch(settingsUrl, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (!silent) {
          setMessage(data?.message || "Failed to load appointment settings.");
        }
        return;
      }

      setSettings(mapSchedulerSettingsFromApiItem(data?.item));
    } catch {
      if (!silent) {
        setMessage("Failed to load appointment settings.");
      }
    }
  }, [isClientFocusedMode, selectedSpecialistId, vipOnly]);

  useEffect(() => {
    void loadAppointmentSettings();
  }, [loadAppointmentSettings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 860px)");
    const handleCompactWeekRange = () => {
      setCompactWeekRange(mediaQuery.matches);
    };

    handleCompactWeekRange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleCompactWeekRange);
      return () => {
        mediaQuery.removeEventListener("change", handleCompactWeekRange);
      };
    }

    mediaQuery.addListener(handleCompactWeekRange);
    return () => {
      mediaQuery.removeListener(handleCompactWeekRange);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setMessage("");
        const [specialistsResponse, specialistRolesResponse, plannerFiltersResponse] = await Promise.all([
          apiFetch(vipOnly ? "/api/clients/vip-tutor-assignments?limit=500" : "/api/appointments/specialists", {
            method: "GET",
            cache: "no-store"
          }),
          vipOnly && canReadAppointments
            ? apiFetch("/api/appointments/specialists", {
                method: "GET",
                cache: "no-store"
              })
            : Promise.resolve(null),
          !vipOnly && canReadStatisticsPlannerReport
            ? apiFetch("/api/appointments/report/filters?includeAllClients=true", {
                method: "GET",
                cache: "no-store"
              })
            : Promise.resolve(null)
        ]);

        let specialistsData = await readApiResponseData(specialistsResponse);
        const specialistRolesData = specialistRolesResponse
          ? await readApiResponseData(specialistRolesResponse)
          : null;
        const plannerFiltersData = plannerFiltersResponse
          ? await readApiResponseData(plannerFiltersResponse)
          : null;

        if (!active) {
          return;
        }

        if (!specialistsResponse.ok) {
          if (!vipOnly) {
            setMessage(specialistsData?.message || "Failed to load specialists.");
            return;
          }
          try {
            const fallbackResponse = await apiFetch("/api/clients/search?isVip=true&limit=100", {
              method: "GET",
              cache: "no-store"
            });
            const fallbackData = await readApiResponseData(fallbackResponse);
            if (!fallbackResponse.ok) {
              setMessage(specialistsData?.message || fallbackData?.message || "Failed to load VIP classes.");
              return;
            }
            specialistsData = {
              items: Array.isArray(fallbackData?.items) ? fallbackData.items : [],
              classes: []
            };
          } catch {
            setMessage(specialistsData?.message || "Failed to load VIP classes.");
            return;
          }
        }

        const nextVipClientsByClassId = {};
        const fallbackClassLabelById = {};
        const nextSpecialists = (
          vipOnly
            ? (Array.isArray(specialistsData?.classes) ? specialistsData.classes : []).map((itemValue) => ({
                id: String(itemValue?.id || itemValue?.classId || "").trim(),
                className: String(itemValue?.className || itemValue?.class_name || "").trim(),
                teacherId: String(itemValue?.teacherId || itemValue?.teacher_id || "").trim(),
                teacherName: String(itemValue?.teacherName || itemValue?.teacher_name || "").trim()
              }))
            : (Array.isArray(specialistsData?.items) ? specialistsData.items : []).map((itemValue) => ({
                id: String(itemValue?.id || ""),
                name: String(itemValue?.name || "").trim() || "Specialist",
                role: String(itemValue?.role || "").trim() || "Specialist"
            }))
        ).filter((itemValue) => Boolean(itemValue.id));

        if (vipOnly && nextSpecialists.length === 0) {
          const fallbackItems = Array.isArray(specialistsData?.items) ? specialistsData.items : [];
          fallbackItems.forEach((itemValue) => {
            const className = String(itemValue?.className || itemValue?.class_name || "").trim();
            if (!className) {
              return;
            }
            const classId = `class-name:${className.toLowerCase()}`;
            if (!fallbackClassLabelById[classId]) {
              fallbackClassLabelById[classId] = className;
            }
          });

          Object.keys(fallbackClassLabelById).forEach((classId) => {
            nextSpecialists.push({
              id: classId,
              className: fallbackClassLabelById[classId],
              teacherId: "",
              teacherName: ""
            });
          });
        }

        if (vipOnly) {
          nextSpecialists.sort((left, right) => (
            String(left?.className || "").localeCompare(String(right?.className || ""))
          ));
        }

        if (vipOnly) {
          nextSpecialists.forEach((itemValue) => {
            const classId = String(itemValue?.id || "").trim();
            if (classId && !Array.isArray(nextVipClientsByClassId[classId])) {
              nextVipClientsByClassId[classId] = [];
            }
          });

          const assignmentItems = Array.isArray(specialistsData?.items) ? specialistsData.items : [];
          assignmentItems.forEach((itemValue) => {
            const directClassId = String(itemValue?.classId || itemValue?.class_id || "").trim();
            const className = String(itemValue?.className || itemValue?.class_name || "").trim();
            const fallbackClassId = className ? `class-name:${className.toLowerCase()}` : "";
            const classId = directClassId || fallbackClassId;
            const clientId = String(itemValue?.id || itemValue?.clientId || itemValue?.client_id || "").trim();
            const teacherId = String(itemValue?.teacherId || itemValue?.teacher_id || "").trim();
            const tutorId = String(itemValue?.tutorId || itemValue?.tutor_id || "").trim();
            if (!classId || !clientId) {
              return;
            }
            if (!Array.isArray(nextVipClientsByClassId[classId])) {
              nextVipClientsByClassId[classId] = [];
            }
            const existingClient = nextVipClientsByClassId[classId]
              .find((clientItem) => String(clientItem?.id || "").trim() === clientId);
            if (existingClient) {
              if (!String(existingClient?.teacherId || "").trim() && teacherId) {
                existingClient.teacherId = teacherId;
              }
              if (!String(existingClient?.tutorId || "").trim() && tutorId) {
                existingClient.tutorId = tutorId;
              }
              return;
            }

            nextVipClientsByClassId[classId].push({
              id: clientId,
              firstName: String(itemValue?.firstName || itemValue?.first_name || "").trim(),
              lastName: String(itemValue?.lastName || itemValue?.last_name || "").trim(),
              middleName: String(itemValue?.middleName || itemValue?.middle_name || "").trim(),
              teacherId,
              tutorId
            });
          });

          Object.keys(nextVipClientsByClassId).forEach((classId) => {
            nextVipClientsByClassId[classId].sort((left, right) => (
              getClientDisplayName(left).localeCompare(getClientDisplayName(right))
            ));
          });
        }

        const nextSpecialistRoleById = (
          vipOnly
          && specialistRolesResponse
          && specialistRolesResponse.ok
          && Array.isArray(specialistRolesData?.items)
        )
          ? specialistRolesData.items.reduce((acc, itemValue) => {
              const id = String(itemValue?.id || "").trim();
              const roleLabel = String(itemValue?.role || "").trim();
              if (id && roleLabel) {
                acc[id] = roleLabel;
              }
              return acc;
            }, {})
          : {};

        const nextPlannerClients = !vipOnly && plannerFiltersResponse?.ok
          ? (Array.isArray(plannerFiltersData?.clients) ? plannerFiltersData.clients : [])
            .map((client) => ({
              id: String(client?.id || "").trim(),
              firstName: String(client?.firstName || "").trim(),
              lastName: String(client?.lastName || "").trim(),
              middleName: String(client?.middleName || "").trim()
            }))
            .filter((client) => Boolean(client.id))
            .sort((left, right) => getClientDisplayName(left).localeCompare(getClientDisplayName(right)))
          : [];

        const persistedSpecialistId = readStoredSchedulerSelectionId(vipOnly, currentUserId);
        const preferredSpecialistId = String(persistedSpecialistId || selectedSpecialistId || "").trim();
        const nextSelectedSpecialistId = (() => {
          if (preferredSpecialistId && nextSpecialists.some((itemValue) => itemValue.id === preferredSpecialistId)) {
            return preferredSpecialistId;
          }
          if (vipOnly) {
            return nextSpecialists[0]?.id || "";
          }
          if (
            !vipOnly
            && restrictCreateToOwnSpecialist
            && normalizedCurrentUserId
            && nextSpecialists.some((itemValue) => itemValue.id === normalizedCurrentUserId)
          ) {
            return normalizedCurrentUserId;
          }
          return "";
        })();

        const persistedPlannerFilterMode = !vipOnly ? readStoredPlannerFilterMode(currentUserId) : "";
        const persistedPlannerClientId = !vipOnly ? readStoredPlannerClientSelectionId(currentUserId) : "";
        const persistedPlannerClientSnapshot = !vipOnly
          ? readStoredPlannerClientSelectionSnapshot(currentUserId)
          : null;
        const preferredClientId = String(persistedPlannerClientId || selectedPlannerClientFilterId || "").trim();
        const shouldRestoreClientFocus = (
          !vipOnly
          && preferredClientId
          && (
            Boolean(selectedPlannerClientFilterId)
            || (
              persistedPlannerFilterMode === "client"
              && (
                nextPlannerClients.some((client) => client.id === preferredClientId)
                || String(persistedPlannerClientSnapshot?.id || "").trim() === preferredClientId
              )
            )
          )
        );

        setSpecialists(nextSpecialists);
        setSpecialistRoleById(nextSpecialistRoleById);
        if (!vipOnly) {
          setPlannerFilterClients(nextPlannerClients);
        }
        setVipClientsByClassId(vipOnly ? nextVipClientsByClassId : {});
        if (vipOnly) {
          setVipSchedulesByClass({});
          setVipSchedulesWeekKeyByClass({});
        }
        setPlannerPrimaryFilterMode(shouldRestoreClientFocus ? "client" : "specialist");
        if (shouldRestoreClientFocus) {
          setSelectedPlannerClientFilterId(preferredClientId);
          setStoredPlannerClientSnapshot(
            String(persistedPlannerClientSnapshot?.id || "").trim() === preferredClientId
              ? persistedPlannerClientSnapshot
              : null
          );
          setSelectedSpecialistId("");
        } else {
          if (!vipOnly) {
            setSelectedPlannerClientFilterId("");
            setStoredPlannerClientSnapshot(null);
          }
          setSelectedSpecialistId(nextSelectedSpecialistId);
        }
      } catch {
        if (active) {
          setMessage("Failed to load appointment planner.");
        }
      } finally {
        if (active) {
          setIsSchedulerInitialized(true);
        }
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [
    canReadAppointments,
    canReadStatisticsPlannerReport,
    currentUserId,
    normalizedCurrentUserId,
    restrictCreateToOwnSpecialist,
    vipOnly
  ]);

  const selectedPlannerFilterClient = useMemo(() => (
    (Array.isArray(plannerFilterClients) ? plannerFilterClients : []).find(
      (client) => String(client?.id || "").trim() === normalizedSelectedPlannerClientFilterId
    )
    || plannerClientSearchMap[normalizedSelectedPlannerClientFilterId]
    || (
      String(storedPlannerClientSnapshot?.id || "").trim() === normalizedSelectedPlannerClientFilterId
        ? storedPlannerClientSnapshot
        : null
    )
    || null
  ), [
    normalizedSelectedPlannerClientFilterId,
    plannerFilterClients,
    plannerClientSearchMap,
    storedPlannerClientSnapshot
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!normalizedCurrentUserId) {
      return;
    }
    if (hydratedPlannerStorageKey !== currentPlannerStorageHydrationKey) {
      return;
    }

    if (vipOnly) {
      const storageKey = getSchedulerSelectionStorageKey(true, currentUserId);
      const specialistId = String(selectedSpecialistId || "").trim();
      if (!specialistId) {
        removeScopedAndLegacyStorageValue(APPOINTMENT_VIP_CLIENT_STORAGE_KEY, currentUserId);
        return;
      }

      window.localStorage.setItem(storageKey, specialistId);
      return;
    }

    const specialistStorageKey = getSchedulerSelectionStorageKey(false, currentUserId);
    const clientStorageKey = getPlannerClientSelectionStorageKey(currentUserId);
    const clientSnapshotStorageKey = getPlannerClientSnapshotStorageKey(currentUserId);
    const modeStorageKey = getPlannerFilterModeStorageKey(currentUserId);
    const specialistId = String(selectedSpecialistId || "").trim();
    const clientId = String(selectedPlannerClientFilterId || "").trim();
    const normalizedStoredPlannerClientSnapshot = (
      String(storedPlannerClientSnapshot?.id || "").trim() === clientId
        ? normalizePlannerStoredClientSnapshot(storedPlannerClientSnapshot)
        : null
    );
    const selectedClientSnapshot = clientId
      ? normalizePlannerStoredClientSnapshot(
          (() => {
            const matchedSelectedClient = (
              String(selectedPlannerFilterClient?.id || "").trim() === clientId
                ? normalizePlannerStoredClientSnapshot(selectedPlannerFilterClient)
                : null
            );
            if (hasPlannerClientSnapshotDisplay(matchedSelectedClient)) {
              return matchedSelectedClient;
            }
            if (hasPlannerClientSnapshotDisplay(normalizedStoredPlannerClientSnapshot)) {
              return normalizedStoredPlannerClientSnapshot;
            }
            return matchedSelectedClient || normalizedStoredPlannerClientSnapshot || { id: clientId };
          })()
        )
      : null;

    if (specialistId) {
      window.localStorage.setItem(specialistStorageKey, specialistId);
    } else {
      removeScopedAndLegacyStorageValue(APPOINTMENT_SPECIALIST_STORAGE_KEY, currentUserId);
    }
    if (clientId) {
      window.localStorage.setItem(clientStorageKey, clientId);
      if (selectedClientSnapshot) {
        window.localStorage.setItem(clientSnapshotStorageKey, JSON.stringify(selectedClientSnapshot));
      }
    } else {
      removeScopedAndLegacyStorageValue(APPOINTMENT_PLANNER_CLIENT_STORAGE_KEY, currentUserId);
      removeScopedAndLegacyStorageValue(APPOINTMENT_PLANNER_CLIENT_SNAPSHOT_STORAGE_KEY, currentUserId);
    }

    if (clientId && (!specialistId || plannerPrimaryFilterMode === "client")) {
      window.localStorage.setItem(modeStorageKey, "client");
    } else if (clientId || specialistId) {
      window.localStorage.setItem(modeStorageKey, "specialist");
    } else {
      removeScopedAndLegacyStorageValue(APPOINTMENT_PLANNER_FILTER_MODE_STORAGE_KEY, currentUserId);
    }
    setStoredPlannerClientSnapshot((prev) => (
      arePlannerClientSnapshotsEqual(prev, selectedClientSnapshot)
        ? prev
        : selectedClientSnapshot
    ));
  }, [
    currentUserId,
    normalizedCurrentUserId,
    currentPlannerStorageHydrationKey,
    hydratedPlannerStorageKey,
    plannerPrimaryFilterMode,
    selectedPlannerFilterClient,
    selectedPlannerClientFilterId,
    selectedSpecialistId,
    storedPlannerClientSnapshot,
    vipOnly
  ]);

  const weekDays = useMemo(() => {
    const visibleDays = normalizeVisibleDays(settings.visibleWeekDays);

    return DAY_ITEMS
      .filter((day) => visibleDays.includes(day.key))
      .map((day) => ({
        key: day.key,
        label: day.label,
        date: addDays(weekStartDate, day.offset)
      }));
  }, [settings.visibleWeekDays, weekStartDate]);
  const weekDataKey = useMemo(() => (
    weekDays.map((day) => `${day.key}:${formatDateYmd(day.date)}`).join("|")
  ), [weekDays]);
  const clientFocusedModalPreviewSpecialistId = (
    !vipOnly
    && isClientFocusedMode
    && createModal.open
  )
    ? String(createModal.specialistId || "").trim()
    : "";
  const clientFocusedPreviewDataKey = useMemo(() => (
    clientFocusedModalPreviewSpecialistId
      ? `${clientFocusedModalPreviewSpecialistId}:${weekDataKey}`
      : ""
  ), [clientFocusedModalPreviewSpecialistId, weekDataKey]);
  const comparisonOverlaySpecialistId = (
    !vipOnly
    && isClientFocusedMode
    && hasPlannerComparisonOverlay
  )
    ? String(selectedSpecialistId || "").trim()
    : "";
  const canUseClientFocusedAvailabilityPreview = (
    Boolean(clientFocusedModalPreviewSpecialistId)
    && clientFocusedPreviewWeekKey === clientFocusedPreviewDataKey
    && String(createModal.specialistId || "").trim() === clientFocusedModalPreviewSpecialistId
  );
  const weekRenderKey = useMemo(() => (
    `${String(selectedSpecialistId || "").trim()}:${weekDays.map((day) => `${day.key}:${formatDateYmd(day.date)}`).join("|")}`
  ), [selectedSpecialistId, weekDays]);
  const slotCellHeightPx = useMemo(() => {
    const parsed = Number.parseInt(String(settings.slotCellHeightPx || "").trim(), 10);
    if (
      Number.isInteger(parsed)
      && parsed >= MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX
      && parsed <= MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX
    ) {
      return parsed;
    }
    return DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX;
  }, [settings.slotCellHeightPx]);
  const timeSlots = useMemo(() => {
    const interval = Number.parseInt(String(settings.slotInterval), 10) || 30;
    const subDivisions = Math.max(1, Number.parseInt(String(settings.slotSubDivisions), 10) || 1);
    const effectiveInterval = Math.max(1, Math.floor(interval / subDivisions));
    return buildTimeSlots({
      visibleDays: weekDays.map((day) => day.key),
      workingHours: settings.workingHours,
      slotIntervalMinutes: effectiveInterval
    });
  }, [settings.slotInterval, settings.slotSubDivisions, settings.workingHours, weekDays]);

  const rawAppointmentsByDay = (
    appointmentsWeekKeyBySpecialist[selectedSpecialistId] === weekDataKey
      ? (appointmentsBySpecialist[selectedSpecialistId] || {})
      : {}
  );
  const nonVipSchedulesReady = (
    !String(selectedSpecialistId || "").trim()
    || appointmentsWeekKeyBySpecialist[selectedSpecialistId] === weekDataKey
  );
  const vipWeekDataReady = (
    !String(selectedSpecialistId || "").trim()
    || vipSchedulesWeekKeyByClass[selectedSpecialistId] === weekDataKey
  );
  const clientFocusedPlannerReady = (
    !hasSelectedPlannerClientFilter
    || clientFocusedPlannerWeekKey === clientFocusedPlannerDataKey
  );
  const canRenderPlannerData = (
    isSchedulerInitialized
    && (
      vipOnly
        ? (!String(selectedSpecialistId || "").trim() || (vipSchedulesReady && vipWeekDataReady))
        : (
            isClientFocusedMode
              ? clientFocusedPlannerReady
              : (nonVipSchedulesReady && clientFocusedPlannerReady)
          )
    )
  );
  const plannerClientFilterOptions = useMemo(() => {
    if (vipOnly) {
      return [];
    }

    const optionMap = new Map();
    (Array.isArray(plannerFilterClients) ? plannerFilterClients : []).forEach((client) => {
      const clientId = String(client?.id || "").trim();
      if (!clientId || optionMap.has(clientId)) {
        return;
      }
      optionMap.set(clientId, getClientDisplayName(client));
    });
    weekDays.forEach((day) => {
      const dayItems = Array.isArray(rawAppointmentsByDay[day.key]) ? rawAppointmentsByDay[day.key] : [];
      dayItems.forEach((item) => {
        const clientId = String(item?.clientId || "").trim();
        if (!clientId || optionMap.has(clientId)) {
          return;
        }
        optionMap.set(clientId, String(item?.client || "").trim() || `Client #${clientId}`);
      });
    });

    return [...optionMap.entries()]
      .sort((left, right) => left[1].localeCompare(right[1], undefined, { sensitivity: "base" }))
      .map(([value, label]) => ({ value, label }));
  }, [plannerFilterClients, rawAppointmentsByDay, vipOnly, weekDays]);
  const plannerClientActiveOptions = useMemo(() => {
    const query = String(plannerClientSearch || "").trim();
    const base = shouldRunPlannerClientSearch(query) ? plannerClientSearchOptions : [];
    const selectedClientOption = normalizedSelectedPlannerClientFilterId
      ? (
          selectedPlannerFilterClient
            ? {
                value: normalizedSelectedPlannerClientFilterId,
                label: formatClientOptionLabel({
                  ...selectedPlannerFilterClient,
                  id: normalizedSelectedPlannerClientFilterId
                })
              }
            : (
                plannerClientFilterOptions.find(
                  (option) => String(option?.value || "").trim() === normalizedSelectedPlannerClientFilterId
                ) || null
              )
        )
      : null;
    if (
      selectedClientOption
      && !base.some((o) => String(o?.value || "").trim() === normalizedSelectedPlannerClientFilterId)
    ) {
      return [selectedClientOption, ...base];
    }
    return base;
  }, [
    normalizedSelectedPlannerClientFilterId,
    plannerClientFilterOptions,
    plannerClientSearch,
    plannerClientSearchOptions,
    selectedPlannerFilterClient
  ]);
  useEffect(() => {
    if (vipOnly) {
      if (selectedPlannerClientFilterId) {
        setSelectedPlannerClientFilterId("");
      }
      return;
    }
    if (!isSchedulerInitialized) {
      return;
    }

    const normalizedClientId = String(selectedPlannerClientFilterId || "").trim();
    if (!normalizedClientId) {
      return;
    }

    if (plannerClientSearchMap[normalizedClientId]) {
      return;
    }

    const hasClientValidationSource = (
      plannerClientFilterOptions.length > 0
      || Boolean(plannerClientSearchMap[normalizedClientId])
    );
    if (!hasClientValidationSource) {
      return;
    }

    const isStillVisible = plannerClientFilterOptions.some(
      (option) => String(option?.value || "").trim() === normalizedClientId
    );
    if (!isStillVisible) {
      setSelectedPlannerClientFilterId("");
    }
  }, [isSchedulerInitialized, plannerClientFilterOptions, plannerClientSearchMap, selectedPlannerClientFilterId, vipOnly]);
  useEffect(() => {
    if (vipOnly) {
      return;
    }
    const query = String(plannerClientSearch || "").trim();
    if (!shouldRunPlannerClientSearch(query)) {
      setPlannerClientSearchOptions([]);
      return;
    }
    const params = new URLSearchParams({
      limit: "50",
      q: query
    });
    let active = true;
    const timerId = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/clients/search?${params.toString()}`);
        const data = await readApiResponseData(response);
        if (active && Array.isArray(data?.items)) {
          const nextMap = {};
          const nextOptions = [];
          data.items.forEach((c) => {
            const clientId = String(c?.id || "").trim();
            if (!clientId) {
              return;
            }
            const client = {
              id: clientId,
              firstName: String(c?.firstName || "").trim(),
              lastName: String(c?.lastName || "").trim(),
              middleName: String(c?.middleName || "").trim(),
              phone: String(c?.phone || "").trim()
            };
            nextMap[clientId] = client;
            nextOptions.push({ value: clientId, label: formatClientOptionLabel(client) });
          });
          setPlannerClientSearchMap((prev) => ({ ...prev, ...nextMap }));
          setPlannerClientSearchOptions(nextOptions);
        }
      } catch {
        if (active) {
          setPlannerClientSearchOptions([]);
        }
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timerId);
    };
  }, [plannerClientSearch, vipOnly]);
  const breaksForSpecialist = vipOnly || isClientFocusedMode
    ? []
    : (breaksBySpecialist[selectedSpecialistId] || []);
  const absencesForSpecialist = (
    vipOnly
    || isClientFocusedMode
    || !selectedSpecialistId
    || absencesWeekKeyBySpecialist[selectedSpecialistId] !== weekDataKey
  )
    ? []
    : (absencesBySpecialist[selectedSpecialistId] || []);
  const blockedTimesForSpecialist = useMemo(() => (
    (vipOnly || isClientFocusedMode) ? [] : normalizePlannerBlockedTimeItems(settings.blockedTimes)
  ), [isClientFocusedMode, settings.blockedTimes, vipOnly]);
  const findLocalScheduleConflict = useCallback(({
    appointmentDate,
    startTime,
    endTime,
    excludeAppointmentId = "",
    appointmentsByDay = rawAppointmentsByDay
  }) => {
    const dayKey = getDayKeyFromDateYmd(appointmentDate);
    if (!dayKey) {
      return null;
    }
    const rangeStart = normalizeTimeToMinutes(startTime);
    const rangeEnd = normalizeTimeToMinutes(endTime);
    if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) {
      return null;
    }

    const excludedId = String(excludeAppointmentId || "").trim();
    const dayItems = Array.isArray(appointmentsByDay?.[dayKey]) ? appointmentsByDay[dayKey] : [];
    const hit = dayItems.find((item) => {
      const itemId = String(item?.id || "").trim();
      if (excludedId && itemId && itemId === excludedId) {
        return false;
      }

      const status = String(item?.status || "pending").trim().toLowerCase();
      if (!ACTIVE_SCHEDULE_STATUSES.has(status)) {
        return false;
      }

      const itemStart = normalizeTimeToMinutes(item?.time);
      const itemEnd = normalizeTimeToMinutes(item?.endTime);
      if (itemStart === null || itemEnd === null || itemEnd <= itemStart) {
        return false;
      }

      return rangeStart < itemEnd && itemStart < rangeEnd;
    });

    if (!hit) {
      return null;
    }

    return {
      startTime: String(hit?.time || "").trim(),
      endTime: String(hit?.endTime || "").trim(),
      client: String(hit?.client || "").trim()
    };
  }, [rawAppointmentsByDay]);
  const specialistOptions = useMemo(() => (
    specialists.map((specialist) => ({
      value: specialist.id,
      label: vipOnly
        ? (
          String(specialist?.teacherName || "").trim()
            ? `${String(specialist?.className || "").trim() || `Class #${String(specialist?.id || "").trim()}`} (${String(specialist?.teacherName || "").trim()})`
            : (String(specialist?.className || "").trim() || `Class #${String(specialist?.id || "").trim()}`)
        )
        : `${specialist.name} (${specialist.role})`
    }))
  ), [specialists, vipOnly]);
  const clientFocusedCreateSpecialistOptions = useMemo(() => (
    specialistOptions.filter((option) => canCreateOnPlannerSpecialist(option.value))
  ), [canCreateOnPlannerSpecialist, specialistOptions]);
  const canOpenClientFocusedCreateModal = (
    !vipOnly
    && canCreateAppointments
    && clientFocusedCreateSpecialistOptions.length > 0
  );
  const visibleRepeatDayKeys = useMemo(
    () => normalizeVisibleDays(settings.visibleWeekDays),
    [settings.visibleWeekDays]
  );
  const visibleRepeatDayItems = useMemo(
    () => DAY_ITEMS.filter((day) => visibleRepeatDayKeys.includes(day.key)),
    [visibleRepeatDayKeys]
  );
  const clientSelectNotFound = clientSearchMessage === "No clients found.";
  const clientSelectHasError = Boolean(createErrors.clientId) || (clientSelectNotFound && !createForm.clientId);
  useEffect(() => {
    if (clientSelectNotFound && clientSearchMessage && createModal.open) {
      showImmediateAlert(clientSearchMessage);
    }
  }, [clientSearchMessage, clientSelectNotFound, createModal.open]);
  const selectedClient = createForm.clientId ? (clientMap[createForm.clientId] || null) : null;
  const clientSelectOptions = useMemo(() => {
    const currentId = String(createForm.clientId || "").trim();
    if (!currentId || !selectedClient) {
      return clientOptions;
    }
    if (clientOptions.some((option) => option.value === currentId)) {
      return clientOptions;
    }
    return [
      { value: currentId, label: formatClientOptionLabel(selectedClient) },
      ...clientOptions
    ];
  }, [clientOptions, createForm.clientId, selectedClient]);
  const timeSelectOptions = useMemo(() => (
    timeSlots.map((slot) => ({ value: slot, label: slot }))
  ), [timeSlots]);
  const endTimeSelectOptions = useMemo(() => (
    buildPlannerEndTimeOptions(timeSlots, settings.workingHours, visibleRepeatDayKeys)
  ), [settings.workingHours, timeSlots, visibleRepeatDayKeys]);
  const durationSelectOptions = useMemo(() => {
    const mapped = Array.isArray(settings.appointmentDurationOptions)
      ? settings.appointmentDurationOptions
          .map((value) => String(value || "").trim())
          .filter((value) => /^\d+$/.test(value))
      : [];
    const unique = Array.from(new Set(mapped));
    if (unique.length === 0) {
      return [{ value: "30", label: "30 min" }];
    }
    return unique.map((value) => ({ value, label: `${value} min` }));
  }, [settings.appointmentDurationOptions]);
  useEffect(() => {
    if (!createModal.open) {
      return;
    }
    if (durationSelectOptions.some((option) => option.value === String(createForm.durationMinutes || "").trim())) {
      return;
    }
    setCreateForm((prev) => ({ ...prev, durationMinutes: durationSelectOptions[0]?.value || "30" }));
  }, [createForm.durationMinutes, createModal.open, durationSelectOptions]);
  const isEditMode = createModal.mode === "edit";
  const isSpecialistLimitedEditMode = !vipOnly && specialistLimitedEdit && isEditMode;
  const normalizedPlannerBlockType = String(createModal.plannerBlockType || "").trim();
  const isPlannerBlockEditMode = (
    createModal.open
    && (
      normalizedPlannerBlockType === PLANNER_MODAL_TABS.break
      || normalizedPlannerBlockType === PLANNER_MODAL_TABS.workSchedule
    )
  );
  const isPlannerAppointmentEditMode = createModal.open && isEditMode && !isPlannerBlockEditMode;
  const canOpenPlannerBreakTab = !vipOnly && !isSpecialistLimitedEditMode && canUpdateAppointmentBreaks;
  const canOpenPlannerWorkScheduleTab = (
    !vipOnly
    && !isSpecialistLimitedEditMode
    && (canCreateAppointmentWorkSchedule || canUpdateAppointmentWorkSchedule || canDeleteAppointmentWorkSchedule)
  );
  const plannerModalTabOptions = useMemo(() => {
    if (isPlannerBlockEditMode) {
      return [
        { value: PLANNER_MODAL_TABS.appointment, label: "To Planner", disabled: true },
        {
          value: PLANNER_MODAL_TABS.break,
          label: "Breaks",
          disabled: normalizedPlannerBlockType !== PLANNER_MODAL_TABS.break
        },
        {
          value: PLANNER_MODAL_TABS.workSchedule,
          label: "Work",
          disabled: normalizedPlannerBlockType !== PLANNER_MODAL_TABS.workSchedule
        }
      ];
    }
    if (isPlannerAppointmentEditMode) {
      return [
        { value: PLANNER_MODAL_TABS.appointment, label: "To Planner", disabled: false },
        { value: PLANNER_MODAL_TABS.break, label: "Breaks", disabled: true },
        { value: PLANNER_MODAL_TABS.workSchedule, label: "Work", disabled: true }
      ];
    }

    const tabs = [
      { value: PLANNER_MODAL_TABS.appointment, label: "To Planner", disabled: false }
    ];
    if (canOpenPlannerBreakTab) {
      tabs.push({ value: PLANNER_MODAL_TABS.break, label: "Breaks", disabled: false });
    }
    if (canOpenPlannerWorkScheduleTab) {
      tabs.push({ value: PLANNER_MODAL_TABS.workSchedule, label: "Work", disabled: false });
    }
    return tabs;
  }, [
    canOpenPlannerBreakTab,
    canOpenPlannerWorkScheduleTab,
    isPlannerAppointmentEditMode,
    isPlannerBlockEditMode,
    normalizedPlannerBlockType
  ]);
  const isPlannerAppointmentTab = activePlannerModalTab === PLANNER_MODAL_TABS.appointment;
  const isPlannerBreakTab = activePlannerModalTab === PLANNER_MODAL_TABS.break;
  const isPlannerWorkScheduleTab = activePlannerModalTab === PLANNER_MODAL_TABS.workSchedule;
  const isClientFocusedCreateMode = (
    createModal.open
    && !vipOnly
    && !isEditMode
    && isClientFocusedMode
  );
  const plannerModalSpecialistOptions = useMemo(() => (
    specialistOptions.filter((option) => canMutateSpecialistId(option.value))
  ), [canMutateSpecialistId, specialistOptions]);
  const plannerModalSpecialistLabel = useMemo(() => {
    const selectedValue = String(createModal.specialistId || "").trim();
    if (!selectedValue) {
      return "";
    }
    return String(
      plannerModalSpecialistOptions.find((option) => String(option?.value || "").trim() === selectedValue)?.label
      || specialistOptions.find((option) => String(option?.value || "").trim() === selectedValue)?.label
      || selectedValue
    ).trim();
  }, [createModal.specialistId, plannerModalSpecialistOptions, specialistOptions]);
  const plannerBlockRepeatDayKeys = useMemo(() => {
    const normalizedDays = normalizeRepeatDayKeys(createForm.repeatDays)
      .filter((dayKey) => visibleRepeatDayKeys.includes(dayKey));
    if (normalizedDays.length > 0) {
      return normalizedDays;
    }
    const fallbackDayKey = String(createModal.dayKey || "").trim().toLowerCase();
    return fallbackDayKey && visibleRepeatDayKeys.includes(fallbackDayKey)
      ? [fallbackDayKey]
      : [];
  }, [createForm.repeatDays, createModal.dayKey, visibleRepeatDayKeys]);
  const plannerBlockRepeatDaySet = useMemo(
    () => new Set(plannerBlockRepeatDayKeys),
    [plannerBlockRepeatDayKeys]
  );
  const plannerBlockRepeatDayNumbers = useMemo(
    () => plannerBlockRepeatDayKeys
      .map((dayKey) => getDayOfWeekNumberFromDayKey(dayKey))
      .filter((dayOfWeek) => Number.isInteger(dayOfWeek) && dayOfWeek >= 1 && dayOfWeek <= 7),
    [plannerBlockRepeatDayKeys]
  );
  const isEditRecurring = isEditMode
    && createModal.repeatType === "weekly"
    && Boolean(String(createModal.repeatGroupKey || "").trim());
  const normalizedEditScope = normalizeEditScopeValue(createForm.editScope);
  const showRecurringEditNextToggle = createModal.mode === "edit" && isEditRecurring;
  const shouldShowRecurringEditNextToggle = showRecurringEditNextToggle && !isSpecialistLimitedEditMode;
  const canEditRecurringSeriesPattern = !isEditRecurring || normalizedEditScope !== "single";
  const shouldLockEditDate = isEditRecurring && normalizedEditScope !== "single";
  const isSingleEntryMode = !createForm.repeatEnabled;
  const isSeriesOneMode = isEditRecurring ? normalizedEditScope === "single" : isSingleEntryMode;
  const canToggleSingleEntryMode = !isEditRecurring || normalizedEditScope === "single";
  const sourceRecurringEditDayKey = String(createModal.dayKey || "").trim().toLowerCase();
  const originalRecurringEditRepeatDays = normalizeRepeatDayKeys(createModal.originalRepeatDays);
  const allowedSingleRecurringEditDayKeys = isEditRecurring && normalizedEditScope === "single"
    ? normalizeRepeatDayKeys(
        originalRecurringEditRepeatDays.length > 0
          ? originalRecurringEditRepeatDays
          : [sourceRecurringEditDayKey]
      )
    : [];
  const displayedRepeatDayKeys = useMemo(() => {
    const normalizedFormRepeatDays = normalizeRepeatDayKeys(createForm.repeatDays);
    if (!isEditRecurring || normalizedEditScope !== "single") {
      return normalizedFormRepeatDays;
    }
    if (normalizedFormRepeatDays.length > 0) {
      return normalizedFormRepeatDays;
    }
    return DAY_KEYS_SET.has(sourceRecurringEditDayKey) ? [sourceRecurringEditDayKey] : normalizedFormRepeatDays;
  }, [createForm.repeatDays, isEditRecurring, normalizedEditScope, sourceRecurringEditDayKey]);
  const selectedSingleRecurringEditDayKey = useMemo(() => {
    if (!isEditRecurring || normalizedEditScope !== "single") {
      return "";
    }
    const normalizedFormRepeatDays = normalizeRepeatDayKeys(createForm.repeatDays);
    if (
      normalizedFormRepeatDays.length === 1
      && allowedSingleRecurringEditDayKeys.includes(normalizedFormRepeatDays[0])
    ) {
      return normalizedFormRepeatDays[0];
    }
    if (
      DAY_KEYS_SET.has(sourceRecurringEditDayKey)
      && allowedSingleRecurringEditDayKeys.includes(sourceRecurringEditDayKey)
    ) {
      return sourceRecurringEditDayKey;
    }
    return allowedSingleRecurringEditDayKeys[0] || "";
  }, [
    allowedSingleRecurringEditDayKeys,
    createForm.repeatDays,
    isEditRecurring,
    normalizedEditScope,
    sourceRecurringEditDayKey
  ]);
  const selectedVipClassClients = useMemo(() => {
    if (!vipOnly) {
      return [];
    }
    const classId = String(selectedSpecialistId || "").trim();
    if (!classId) {
      return [];
    }
    return Array.isArray(vipClientsByClassId[classId]) ? vipClientsByClassId[classId] : [];
  }, [selectedSpecialistId, vipClientsByClassId, vipOnly]);
  const selectedVipClassTeacherId = useMemo(() => {
    if (!vipOnly) {
      return "";
    }
    const classId = String(selectedSpecialistId || "").trim();
    if (!classId) {
      return "";
    }
    const selectedClass = specialists.find((item) => String(item?.id || "").trim() === classId);
    return String(selectedClass?.teacherId || "").trim();
  }, [selectedSpecialistId, specialists, vipOnly]);
  const vipClientFilterOptions = useMemo(() => {
    if (!vipOnly) {
      return [];
    }
    const classClientOptions = selectedVipClassClients.map((client) => ({
      value: String(client?.id || "").trim(),
      label: getClientDisplayName(client)
    })).filter((option) => Boolean(option.value));

    return [
      { value: "", label: "All" },
      ...classClientOptions
    ];
  }, [selectedVipClassClients, vipOnly]);

  useEffect(() => {
    if (!vipOnly) {
      if (selectedVipClientFilterId) {
        setSelectedVipClientFilterId("");
      }
      return;
    }

    const normalizedClientId = String(selectedVipClientFilterId || "").trim();
    if (!normalizedClientId) {
      return;
    }

    const isStillVisible = selectedVipClassClients.some(
      (client) => String(client?.id || "").trim() === normalizedClientId
    );
    if (!isStillVisible) {
      setSelectedVipClientFilterId("");
    }
  }, [selectedVipClassClients, selectedVipClientFilterId, vipOnly]);

  useEffect(() => {
    if (!createModal.open || !createForm.repeatEnabled) {
      return;
    }
    recurringPatternDraftRef.current = {
      repeatUntil: String(createForm.repeatUntil || "").trim(),
      repeatDays: normalizeRepeatDayKeys(createForm.repeatDays)
    };
  }, [createForm.repeatDays, createForm.repeatEnabled, createForm.repeatUntil, createModal.open]);
  const specialistLimitedClientLabel = useMemo(() => {
    if (selectedClient) {
      return formatClientOptionLabel(selectedClient);
    }
    const clientId = String(createForm.clientId || "").trim();
    return clientId ? `Client #${clientId}` : "";
  }, [createForm.clientId, selectedClient]);

  const vipWeeklyClientRows = useMemo(() => {
    if (!vipOnly) {
      return [];
    }

    const classId = String(selectedSpecialistId || "").trim();
    const schedulesByClient = (
      classId
      && vipSchedulesWeekKeyByClass[classId] === weekDataKey
      && vipSchedulesByClass[classId]
      && typeof vipSchedulesByClass[classId] === "object"
    )
      ? vipSchedulesByClass[classId]
      : {};
    const routineItemsByDay = weekDays.reduce((acc, day) => {
      acc[day.key] = [];
      return acc;
    }, {});

    if (classId) {
      const classRoutines = Array.isArray(vipClassDailyRoutines) ? vipClassDailyRoutines : [];
      classRoutines.forEach((routine, index) => {
        const routineClassId = String(routine?.classId || routine?.class_assignment_id || "").trim();
        if (!routineClassId || routineClassId !== classId) {
          return;
        }
        const dayOfWeek = Number.parseInt(String(routine?.dayOfWeek ?? routine?.day_of_week ?? "").trim(), 10);
        const dayKey = DAY_NUM_TO_KEY[dayOfWeek] || "";
        if (!dayKey || !Array.isArray(routineItemsByDay[dayKey])) {
          return;
        }
        const startTime = String(routine?.startTime || routine?.start_time || "").trim();
        const endTime = String(routine?.endTime || routine?.end_time || "").trim();
        if (!startTime) {
          return;
        }

        const routineId = String(routine?.id || "").trim() || `${classId}-${dayKey}-${startTime}-${index}`;
        const activityLabel = formatVipDailyRoutineActivityLabel(routine?.activityType || routine?.activity_type);
        const note = String(routine?.note || "").trim();
        const timeLabel = formatAppointmentTimeRangeLabel(startTime, endTime) || startTime;
        const startMinutes = normalizeTimeToMinutes(startTime);

        routineItemsByDay[dayKey].push({
          id: `routine-${routineId}`,
          itemType: "daily-routine",
          appointmentId: "",
          startMinutes,
          timeLabel,
          primaryText: activityLabel,
          secondaryText: note || "Daily routine",
          status: "routine",
          specialistId: "",
          clientId: "",
          appointmentDate: "",
          startTime,
          endTime,
          durationMinutes: getDurationMinutesFromTimes(startTime, endTime),
          serviceName: activityLabel,
          note
        });
      });
    }

    Object.keys(routineItemsByDay).forEach((dayKey) => {
      routineItemsByDay[dayKey].sort(compareVipWeeklyItems);
    });

    const rows = selectedVipClassClients
      .filter((client) => {
        const normalizedClientId = String(selectedVipClientFilterId || "").trim();
        if (!normalizedClientId) {
          return true;
        }
        return String(client?.id || "").trim() === normalizedClientId;
      })
      .map((client) => {
        const clientId = String(client?.id || "").trim();
        if (!clientId) {
          return null;
        }
        const clientSchedules = (
          schedulesByClient[clientId]
          && typeof schedulesByClient[clientId] === "object"
        )
          ? schedulesByClient[clientId]
          : {};
        const dayItemsByKey = {};
        weekDays.forEach((day) => {
          const dayKey = String(day?.key || "").trim().toLowerCase();
          const scheduledDayItems = Array.isArray(clientSchedules[dayKey]) ? clientSchedules[dayKey] : [];
          const routineDayItems = Array.isArray(routineItemsByDay[dayKey]) ? routineItemsByDay[dayKey] : [];
          const dayItems = [...scheduledDayItems, ...routineDayItems];
          dayItems.sort(compareVipWeeklyItems);
          dayItemsByKey[dayKey] = dayItems;
        });
        return {
          clientId,
          clientName: getClientDisplayName(client),
          teacherId: String(client?.teacherId || "").trim(),
          tutorId: String(client?.tutorId || "").trim(),
          dayItemsByKey
        };
      })
      .filter(Boolean);

    return rows;
  }, [
    selectedSpecialistId,
    selectedVipClassClients,
    selectedVipClientFilterId,
    vipOnly,
    vipClassDailyRoutines,
    vipSchedulesByClass,
    vipSchedulesWeekKeyByClass,
    weekDataKey,
    weekDays
  ]);
  const clientFocusedAppointmentsByDay = useMemo(() => {
    if (!hasSelectedPlannerClientFilter) {
      return {};
    }

    const dayItemsByKey = buildEmptyAppointmentsByDay(weekDays);

    (Array.isArray(clientFocusedPlannerSpecialists) ? clientFocusedPlannerSpecialists : []).forEach((specialist) => {
      const specialistId = String(specialist?.id || "").trim();
      const specialistName = String(specialist?.name || "").trim() || `Specialist #${specialistId}`;
      weekDays.forEach((day) => {
        const rawDayItems = Array.isArray(clientFocusedSchedulesBySpecialist?.[specialistId]?.[day.key])
          ? clientFocusedSchedulesBySpecialist[specialistId][day.key]
          : [];
        rawDayItems.forEach((item) => {
          if (!shouldIncludeClientFocusedPlannerItem(item, normalizedSelectedPlannerClientFilterId)) {
            return;
          }
          dayItemsByKey[day.key].push({
            ...item,
            specialist: specialistName || String(item?.specialist || "").trim() || "Specialist",
            client: selectedPlannerFilterClient
              ? getClientDisplayName(selectedPlannerFilterClient)
              : (String(item?.client || "").trim() || "Client")
          });
        });
        dayItemsByKey[day.key].sort((left, right) => String(left?.time || "").localeCompare(String(right?.time || "")));
      });
    });

    return dayItemsByKey;
  }, [
    clientFocusedPlannerSpecialists,
    clientFocusedSchedulesBySpecialist,
    hasSelectedPlannerClientFilter,
    normalizedSelectedPlannerClientFilterId,
    selectedPlannerFilterClient,
    weekDays
  ]);
  const clientFocusedSelectedClientLabel = useMemo(() => (
    selectedPlannerFilterClient
      ? getClientDisplayName(selectedPlannerFilterClient)
      : (plannerClientFilterOptions.find((option) => String(option?.value || "").trim() === normalizedSelectedPlannerClientFilterId)?.label || "Client")
  ), [
    normalizedSelectedPlannerClientFilterId,
    plannerClientFilterOptions,
    selectedPlannerFilterClient
  ]);
  const currentVisibleAppointmentsByDay = isClientFocusedMode
    ? clientFocusedAppointmentsByDay
    : rawAppointmentsByDay;
  const comparisonOverlaySpecialistBlocksByDay = useMemo(() => (
    comparisonOverlaySpecialistId
      ? buildPlannerBlockOverlayItemsByDay({
          weekDays,
          breaks: comparisonOverlaySpecialistBreaks,
          blockedTimes: comparisonOverlaySpecialistSettings?.blockedTimes,
          overlayLabel: "Specialist"
        })
      : buildEmptyAppointmentsByDay(weekDays)
  ), [
    comparisonOverlaySpecialistBreaks,
    comparisonOverlaySpecialistId,
    comparisonOverlaySpecialistSettings?.blockedTimes,
    weekDays
  ]);
  const comparisonOverlayAppointmentsByDay = hasPlannerComparisonOverlay
    ? (
        isClientFocusedMode
          ? weekDays.reduce((acc, day) => {
              const appointments = Array.isArray(rawAppointmentsByDay?.[day.key])
                ? rawAppointmentsByDay[day.key]
                : [];
              const blocks = Array.isArray(comparisonOverlaySpecialistBlocksByDay?.[day.key])
                ? comparisonOverlaySpecialistBlocksByDay[day.key]
                : [];
              acc[day.key] = [...appointments, ...blocks].sort((left, right) => (
                String(left?.time || left?.startTime || "").localeCompare(String(right?.time || right?.startTime || ""))
              ));
              return acc;
            }, {})
          : clientFocusedAppointmentsByDay
      )
    : {};
  const comparisonOverlayLabel = hasPlannerComparisonOverlay
    ? (isClientFocusedMode ? "Specialist" : "Client")
    : "";
  const inferCurrentSeriesRepeatDayKeys = useCallback((existingItem, fallbackDays = []) => {
    const normalizedFallbackDays = normalizeRepeatDayKeys(fallbackDays);
    const repeatGroupKey = String(existingItem?.repeatGroupKey || "").trim();
    if (!repeatGroupKey) {
      return normalizedFallbackDays;
    }

    const specialistId = String(existingItem?.specialistId || "").trim();
    const clientId = String(existingItem?.clientId || "").trim();
    const currentSeriesDayKeys = normalizeRepeatDayKeys(
      weekDays
        .filter((day) => {
          const dayItems = Array.isArray(currentVisibleAppointmentsByDay?.[day.key])
            ? currentVisibleAppointmentsByDay[day.key]
            : [];
          return dayItems.some((item) => (
            String(item?.repeatGroupKey || "").trim() === repeatGroupKey
            && String(item?.repeatType || "").trim().toLowerCase() === "weekly"
            && String(item?.specialistId || "").trim() === specialistId
            && String(item?.clientId || "").trim() === clientId
          ));
        })
        .map((day) => day.key)
    );

    return currentSeriesDayKeys.length > 0 ? currentSeriesDayKeys : normalizedFallbackDays;
  }, [currentVisibleAppointmentsByDay, weekDays]);
  const clientFocusedPlannerAriaLabel = useMemo(() => {
    const clientLabel = String(clientFocusedSelectedClientLabel || "").trim();
    return clientLabel ? `${clientLabel} weekly schedule table` : "Client weekly schedule table";
  }, [clientFocusedSelectedClientLabel]);

  const loadClientFocusedPlannerView = useCallback(async () => {
    if (!isSchedulerInitialized || !hasSelectedPlannerClientFilter) {
      return;
    }

    const dateFrom = formatDateYmd(weekStartDate);
    const dateTo = formatDateYmd(weekEndDate);
    if (!dateFrom || !dateTo) {
      return;
    }

    const requestId = clientFocusedRequestIdRef.current + 1;
    clientFocusedRequestIdRef.current = requestId;

    try {
      const queryParams = new URLSearchParams({
        clientId: normalizedSelectedPlannerClientFilterId,
        dateFrom,
        dateTo
      });
      if (recurringOnly) {
        queryParams.set("recurringOnly", "true");
      }

      const response = await apiFetch(`/api/appointments/schedules?${queryParams.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (requestId !== clientFocusedRequestIdRef.current) {
        return;
      }
      if (!response.ok) {
        setClientFocusedPlannerSpecialists([]);
        setClientFocusedSchedulesBySpecialist({});
        setClientFocusedPlannerWeekKey(clientFocusedPlannerDataKey);
        setMessage(String(data?.message || "Failed to load client planner view.").trim());
        return;
      }

      const scheduleItems = Array.isArray(data?.items) ? data.items : [];
      const specialistsById = new Map();
      const clientSchedulesBySpecialist = {};
      scheduleItems.forEach((item, index) => {
        const groupMeta = getClientFocusedPlannerGroupMeta(item, index);
        const specialistId = String(groupMeta.id || "").trim();
        if (!specialistId) {
          return;
        }
        if (!specialistsById.has(specialistId)) {
          specialistsById.set(specialistId, {
            id: specialistId,
            name: String(groupMeta.name || "").trim() || `Specialist #${specialistId}`
          });
        }
        if (!Array.isArray(clientSchedulesBySpecialist[specialistId])) {
          clientSchedulesBySpecialist[specialistId] = [];
        }
        clientSchedulesBySpecialist[specialistId].push(item);
      });

      const relevantSpecialists = [...specialistsById.values()]
        .sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || ""), undefined, { sensitivity: "base" }));

      if (relevantSpecialists.length === 0) {
        setClientFocusedPlannerSpecialists([]);
        setClientFocusedSchedulesBySpecialist({});
        setClientFocusedPlannerWeekKey(clientFocusedPlannerDataKey);
        setMessage("");
        return;
      }

      const nextSchedulesBySpecialist = {};
      relevantSpecialists.forEach((specialist) => {
        const specialistId = String(specialist?.id || "").trim();
        if (!specialistId) {
          return;
        }
        nextSchedulesBySpecialist[specialistId] = buildPlannerAppointmentsByDay(
          clientSchedulesBySpecialist[specialistId] || [],
          weekDays
        );
      });

      setClientFocusedPlannerSpecialists(relevantSpecialists);
      setClientFocusedSchedulesBySpecialist(nextSchedulesBySpecialist);
      setClientFocusedPlannerWeekKey(clientFocusedPlannerDataKey);
      setMessage("");
    } catch {
      if (requestId !== clientFocusedRequestIdRef.current) {
        return;
      }
      setClientFocusedPlannerSpecialists([]);
      setClientFocusedSchedulesBySpecialist({});
      setClientFocusedPlannerWeekKey(clientFocusedPlannerDataKey);
      setMessage("Failed to load client planner view.");
    }
  }, [
    clientFocusedPlannerDataKey,
    hasSelectedPlannerClientFilter,
    isSchedulerInitialized,
    normalizedSelectedPlannerClientFilterId,
    recurringOnly,
    weekEndDate,
    weekStartDate,
    weekDays
  ]);
  const now = new Date();

  const loadSchedulesForCurrentWeek = useCallback(async () => {
    if (!isSchedulerInitialized || !selectedSpecialistId || weekDays.length === 0) {
      return;
    }

    const dateFrom = formatDateYmd(weekDays[0].date);
    const dateTo = formatDateYmd(weekDays[weekDays.length - 1].date);
    if (!dateFrom || !dateTo) {
      return;
    }
    const requestId = schedulesRequestIdRef.current + 1;
    schedulesRequestIdRef.current = requestId;
    const selectedId = String(selectedSpecialistId || "").trim();
    const buildEmptyByDay = () => weekDays.reduce((acc, day) => {
      acc[day.key] = [];
      return acc;
    }, {});

    try {
      if (vipOnly) {
        const classClients = Array.isArray(vipClientsByClassId[selectedId]) ? vipClientsByClassId[selectedId] : [];
        if (classClients.length === 0) {
          setVipSchedulesByClass((prev) => ({
            ...prev,
            [selectedId]: {}
          }));
          setVipSchedulesWeekKeyByClass((prev) => ({
            ...prev,
            [selectedId]: weekDataKey
          }));
          setMessage("");
          setVipSchedulesReady(true);
          return;
        }

        const queryParams = new URLSearchParams({
          dateFrom,
          dateTo,
          classId: selectedId,
          vipOnly: "true"
        });
        if (recurringOnly) {
          queryParams.set("recurringOnly", "true");
        }

        let scheduleItems = [];
        try {
          const response = await apiFetch(`/api/appointments/schedules?${queryParams.toString()}`, {
            method: "GET",
            cache: "no-store"
          });
          const data = await readApiResponseData(response);
          if (!response.ok) {
            if (requestId !== schedulesRequestIdRef.current) {
              return;
            }
            setVipSchedulesByClass((prev) => ({
              ...prev,
              [selectedId]: {}
            }));
            setVipSchedulesWeekKeyByClass((prev) => ({
              ...prev,
              [selectedId]: weekDataKey
            }));
            setMessage(String(data?.message || "Failed to load appointments.").trim());
            setVipSchedulesReady(true);
            return;
          }
          scheduleItems = Array.isArray(data?.items) ? data.items : [];
        } catch {
          if (requestId !== schedulesRequestIdRef.current) {
            return;
          }
          setVipSchedulesByClass((prev) => ({
            ...prev,
            [selectedId]: {}
          }));
          setVipSchedulesWeekKeyByClass((prev) => ({
            ...prev,
            [selectedId]: weekDataKey
          }));
          setMessage("Failed to load appointments.");
          setVipSchedulesReady(true);
          return;
        }

        if (requestId !== schedulesRequestIdRef.current) {
          return;
        }

        const schedulesByClient = {};
        classClients.forEach((client) => {
          const clientId = String(client?.id || "").trim();
          if (clientId) {
            schedulesByClient[clientId] = buildEmptyByDay();
          }
        });

        scheduleItems.forEach((item, index) => {
          const clientId = String(item?.clientId || "").trim();
          if (!clientId) {
            return;
          }
          if (!schedulesByClient[clientId]) {
            schedulesByClient[clientId] = buildEmptyByDay();
          }

          const dayKey = getDayKeyFromDateYmd(item?.appointmentDate);
          const byDay = schedulesByClient[clientId];
          if (!dayKey || !Array.isArray(byDay[dayKey])) {
            return;
          }
          const startTime = String(item?.startTime || "").trim();
          if (!startTime) {
            return;
          }
          const specialistId = String(item?.specialistId || "").trim();
          const specialistRoleFallback = String(specialistRoleById[specialistId] || "").trim();
          const specialistPositionText = truncateWithEllipsis(
            String(item?.specialistPosition || "").trim()
              || specialistRoleFallback
              || "Specialist",
            24
          );
          const timeLabel = formatAppointmentTimeRangeLabel(startTime, item?.endTime, item?.durationMinutes) || startTime;

          byDay[dayKey].push({
            id: String(item?.id || "").trim() || `${dayKey}-${startTime}-${index}`,
            itemType: "appointment",
            appointmentId: String(item?.id || "").trim(),
            startMinutes: normalizeTimeToMinutes(startTime),
            timeLabel,
            primaryText: String(item?.specialistName || "").trim()
              || (specialistId ? `Specialist #${specialistId}` : "Specialist"),
            secondaryText: specialistPositionText,
            status: String(item?.status || "").trim().toLowerCase().replace(/_/g, "-"),
            specialistId,
            clientId,
            appointmentDate: String(item?.appointmentDate || "").trim(),
            startTime,
            endTime: String(item?.endTime || "").trim(),
            durationMinutes: String(item?.durationMinutes || "").trim(),
            serviceName: String(item?.serviceName || "").trim(),
            note: String(item?.note || "").trim()
          });
        });

        Object.keys(schedulesByClient).forEach((clientId) => {
          const byDay = schedulesByClient[clientId];
          Object.keys(byDay).forEach((dayKey) => {
            byDay[dayKey].sort(compareVipWeeklyItems);
          });
        });

        setVipSchedulesByClass((prev) => ({
          ...prev,
          [selectedId]: schedulesByClient
        }));
        setVipSchedulesWeekKeyByClass((prev) => ({
          ...prev,
          [selectedId]: weekDataKey
        }));
        setMessage("");
        setVipSchedulesReady(true);
        return;
      }

      const queryParams = new URLSearchParams({
        dateFrom,
        dateTo,
        specialistId: selectedId
      });
      if (recurringOnly) {
        queryParams.set("recurringOnly", "true");
      }

      const response = await apiFetch(`/api/appointments/schedules?${queryParams.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (requestId !== schedulesRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        setMessage(data?.message || "Failed to load appointments.");
        setAppointmentsBySpecialist((prev) => ({
          ...prev,
          [selectedId]: {}
        }));
        setAppointmentsWeekKeyBySpecialist((prev) => ({
          ...prev,
          [selectedId]: weekDataKey
        }));
        return;
      }

      const byDay = buildEmptyByDay();
      const items = Array.isArray(data?.items) ? data.items : [];
      items.forEach((item) => {
        const dayKey = getDayKeyFromDateYmd(item?.appointmentDate);
        if (!dayKey || !Array.isArray(byDay[dayKey])) {
          return;
        }

        const startTime = String(item?.startTime || "").trim();
        if (!startTime) {
          return;
        }

        const nextCard = mapScheduleItemToPlannerCard(item);

        byDay[dayKey].push(nextCard);
      });

      Object.keys(byDay).forEach((dayKey) => {
        byDay[dayKey].sort((left, right) => String(left.time || "").localeCompare(String(right.time || "")));
      });

      setAppointmentsBySpecialist((prev) => ({
        ...prev,
        [selectedId]: byDay
      }));
      setAppointmentsWeekKeyBySpecialist((prev) => ({
        ...prev,
        [selectedId]: weekDataKey
      }));
    } catch {
      if (requestId !== schedulesRequestIdRef.current) {
        return;
      }
      setMessage("Failed to load appointments.");
      if (vipOnly) {
        setVipSchedulesByClass((prev) => ({
          ...prev,
          [selectedId]: {}
        }));
        setVipSchedulesWeekKeyByClass((prev) => ({
          ...prev,
          [selectedId]: weekDataKey
        }));
        setVipSchedulesReady(true);
      } else {
        setAppointmentsBySpecialist((prev) => ({
          ...prev,
          [selectedId]: {}
        }));
        setAppointmentsWeekKeyBySpecialist((prev) => ({
          ...prev,
          [selectedId]: weekDataKey
        }));
      }
    }
  }, [
    isSchedulerInitialized,
    recurringOnly,
    selectedSpecialistId,
    specialistRoleById,
    vipClientsByClassId,
    vipOnly,
    weekDataKey,
    weekDays
  ]);

  const loadBreaksForSelectedSpecialist = useCallback(async () => {
    if (vipOnly || isClientFocusedMode || !selectedSpecialistId || !canReadPlannerBreaks) {
      if (!vipOnly && selectedSpecialistId) {
        setBreaksBySpecialist((prev) => ({
          ...prev,
          [selectedSpecialistId]: []
        }));
      }
      return;
    }

    const requestId = breaksRequestIdRef.current + 1;
    breaksRequestIdRef.current = requestId;

    try {
      const queryParams = new URLSearchParams({
        specialistId: selectedSpecialistId
      });
      const response = await apiFetch(`/api/appointments/breaks?${queryParams.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (requestId !== breaksRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        setMessage(data?.message || "Failed to load appointment breaks.");
        setBreaksBySpecialist((prev) => ({
          ...prev,
          [selectedSpecialistId]: []
        }));
        return;
      }

      const normalizedItems = normalizePlannerBreakItems(Array.isArray(data?.items) ? data.items : []);

      setBreaksBySpecialist((prev) => ({
        ...prev,
        [selectedSpecialistId]: normalizedItems
      }));
    } catch {
      if (requestId !== breaksRequestIdRef.current) {
        return;
      }
      setMessage("Failed to load appointment breaks.");
      setBreaksBySpecialist((prev) => ({
        ...prev,
        [selectedSpecialistId]: []
      }));
    }
  }, [canReadPlannerBreaks, isClientFocusedMode, selectedSpecialistId, vipOnly]);

  const loadAbsencesForSelectedSpecialist = useCallback(async () => {
    if (
      vipOnly
      || isClientFocusedMode
      || !selectedSpecialistId
      || weekDays.length === 0
      || !canViewAppointmentSpecialistAbsenceBlocks
    ) {
      if (!vipOnly && selectedSpecialistId) {
        setAbsencesBySpecialist((prev) => ({
          ...prev,
          [selectedSpecialistId]: []
        }));
        setAbsencesWeekKeyBySpecialist((prev) => ({
          ...prev,
          [selectedSpecialistId]: weekDataKey
        }));
      }
      return;
    }

    const requestId = absencesRequestIdRef.current + 1;
    absencesRequestIdRef.current = requestId;

    try {
      const response = await apiFetch(`/api/appointments/absences?${new URLSearchParams({
        specialistId: String(selectedSpecialistId || "").trim(),
        dateFrom: formatDateYmd(weekStartDate),
        dateTo: formatDateYmd(weekEndDate)
      }).toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (requestId !== absencesRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        setMessage(data?.message || "Failed to load specialist absences.");
        setAbsencesBySpecialist((prev) => ({
          ...prev,
          [selectedSpecialistId]: []
        }));
        setAbsencesWeekKeyBySpecialist((prev) => ({
          ...prev,
          [selectedSpecialistId]: weekDataKey
        }));
        return;
      }

      const normalizedItems = (Array.isArray(data?.items) ? data.items : []).map((item) => ({
        id: String(item?.id || "").trim(),
        absenceDate: String(item?.absenceDate || "").trim(),
        startTime: String(item?.startTime || "").trim(),
        endTime: String(item?.endTime || "").trim(),
        reason: String(item?.reason || "").trim()
      })).filter((item) => Boolean(item.id) && Boolean(item.absenceDate));

      setAbsencesBySpecialist((prev) => ({
        ...prev,
        [selectedSpecialistId]: normalizedItems
      }));
      setAbsencesWeekKeyBySpecialist((prev) => ({
        ...prev,
        [selectedSpecialistId]: weekDataKey
      }));
    } catch {
      if (requestId !== absencesRequestIdRef.current) {
        return;
      }
      setMessage("Failed to load specialist absences.");
      setAbsencesBySpecialist((prev) => ({
        ...prev,
        [selectedSpecialistId]: []
      }));
      setAbsencesWeekKeyBySpecialist((prev) => ({
        ...prev,
        [selectedSpecialistId]: weekDataKey
      }));
    }
  }, [
    canViewAppointmentSpecialistAbsenceBlocks,
    isClientFocusedMode,
    selectedSpecialistId,
    vipOnly,
    weekDataKey,
    weekDays.length,
    weekEndDate,
    weekStartDate
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleExternalAppointmentChange = () => {
      loadSchedulesForCurrentWeek();
      loadBreaksForSelectedSpecialist();
      loadAbsencesForSelectedSpecialist();
      void loadClientFocusedPlannerView();
      void loadAppointmentSettings({ silent: true });
    };

    window.addEventListener("crm:appointment-change", handleExternalAppointmentChange);
    return () => {
      window.removeEventListener("crm:appointment-change", handleExternalAppointmentChange);
    };
  }, [
    loadAbsencesForSelectedSpecialist,
    loadAppointmentSettings,
    loadBreaksForSelectedSpecialist,
    loadClientFocusedPlannerView,
    loadSchedulesForCurrentWeek
  ]);

  const refreshPlannerServerState = useCallback(async () => {
    await Promise.all([
      loadAppointmentSettings({ silent: true }),
      loadSchedulesForCurrentWeek(),
      loadBreaksForSelectedSpecialist(),
      loadAbsencesForSelectedSpecialist(),
      loadClientFocusedPlannerView()
    ]);
  }, [
    loadAbsencesForSelectedSpecialist,
    loadAppointmentSettings,
    loadBreaksForSelectedSpecialist,
    loadClientFocusedPlannerView,
    loadSchedulesForCurrentWeek
  ]);

  useEffect(() => {
    loadSchedulesForCurrentWeek();
  }, [loadSchedulesForCurrentWeek]);

  useEffect(() => {
    if (!hasSelectedPlannerClientFilter) {
      setClientFocusedPlannerSpecialists([]);
      setClientFocusedSchedulesBySpecialist({});
      setClientFocusedPlannerWeekKey("");
      return;
    }
    void loadClientFocusedPlannerView();
  }, [hasSelectedPlannerClientFilter, loadClientFocusedPlannerView]);

  useEffect(() => {
    if (vipOnly && canRenderPlannerData && selectedSpecialistId && vipWeeklyClientRows.length === 0) {
      window.alert("No VIP clients found in selected class.");
    }
  }, [canRenderPlannerData, selectedSpecialistId, vipOnly, vipWeeklyClientRows.length]);

  useEffect(() => {
    loadBreaksForSelectedSpecialist();
  }, [loadBreaksForSelectedSpecialist]);

  useEffect(() => {
    loadAbsencesForSelectedSpecialist();
  }, [loadAbsencesForSelectedSpecialist]);

  useEffect(() => {
    if (!clientFocusedModalPreviewSpecialistId || weekDays.length === 0) {
      setClientFocusedPreviewAppointmentsByDay({});
      setClientFocusedPreviewSettings(null);
      setClientFocusedPreviewBreaks([]);
      setClientFocusedPreviewAbsences([]);
      setClientFocusedPreviewWeekKey("");
      return;
    }

    const dateFrom = formatDateYmd(weekStartDate);
    const dateTo = formatDateYmd(weekEndDate);
    if (!dateFrom || !dateTo) {
      return;
    }

    const requestId = clientFocusedPreviewRequestIdRef.current + 1;
    clientFocusedPreviewRequestIdRef.current = requestId;

    async function loadClientFocusedPreview() {
      try {
        const [settingsResponse, schedulesResponse, breaksResponse, absencesResponse] = await Promise.all([
          apiFetch(`/api/appointments/settings?${new URLSearchParams({
            specialistId: clientFocusedModalPreviewSpecialistId
          }).toString()}`, {
            method: "GET",
            cache: "no-store"
          }),
          apiFetch(`/api/appointments/schedules?${new URLSearchParams({
            specialistId: clientFocusedModalPreviewSpecialistId,
            dateFrom,
            dateTo
          }).toString()}`, {
            method: "GET",
            cache: "no-store"
          }),
          canReadPlannerBreaks
            ? apiFetch(`/api/appointments/breaks?${new URLSearchParams({
                specialistId: clientFocusedModalPreviewSpecialistId
              }).toString()}`, {
                method: "GET",
                cache: "no-store"
              })
            : Promise.resolve(null),
          canViewAppointmentSpecialistAbsenceBlocks
            ? apiFetch(`/api/appointments/absences?${new URLSearchParams({
                specialistId: clientFocusedModalPreviewSpecialistId,
                dateFrom,
                dateTo
              }).toString()}`, {
                method: "GET",
                cache: "no-store"
              })
            : Promise.resolve(null)
        ]);
        const [settingsData, schedulesData, breaksData, absencesData] = await Promise.all([
          readApiResponseData(settingsResponse),
          readApiResponseData(schedulesResponse),
          breaksResponse ? readApiResponseData(breaksResponse) : Promise.resolve(null),
          absencesResponse ? readApiResponseData(absencesResponse) : Promise.resolve(null)
        ]);

        if (requestId !== clientFocusedPreviewRequestIdRef.current) {
          return;
        }

        setClientFocusedPreviewSettings(
          settingsResponse.ok
            ? mapSchedulerSettingsFromApiItem(settingsData?.item)
            : null
        );
        setClientFocusedPreviewAppointmentsByDay(
          schedulesResponse.ok
            ? buildPlannerAppointmentsByDay(
                Array.isArray(schedulesData?.items) ? schedulesData.items : [],
                weekDays
              )
            : {}
        );
        setClientFocusedPreviewBreaks(
          breaksResponse?.ok
            ? normalizePlannerBreakItems(Array.isArray(breaksData?.items) ? breaksData.items : [])
            : []
        );
        setClientFocusedPreviewAbsences(
          absencesResponse?.ok
            ? (Array.isArray(absencesData?.items) ? absencesData.items : []).map((item) => ({
                id: String(item?.id || "").trim(),
                absenceDate: String(item?.absenceDate || "").trim(),
                startTime: String(item?.startTime || "").trim(),
                endTime: String(item?.endTime || "").trim(),
                reason: String(item?.reason || "").trim()
              })).filter((item) => Boolean(item.id) && Boolean(item.absenceDate))
            : []
        );
        setClientFocusedPreviewWeekKey(clientFocusedPreviewDataKey);
      } catch {
        if (requestId !== clientFocusedPreviewRequestIdRef.current) {
          return;
        }
        setClientFocusedPreviewAppointmentsByDay({});
        setClientFocusedPreviewSettings(null);
        setClientFocusedPreviewBreaks([]);
        setClientFocusedPreviewAbsences([]);
        setClientFocusedPreviewWeekKey(clientFocusedPreviewDataKey);
      }
    }

    void loadClientFocusedPreview();
  }, [
    canReadPlannerBreaks,
    canViewAppointmentSpecialistAbsenceBlocks,
    clientFocusedModalPreviewSpecialistId,
    clientFocusedPreviewDataKey,
    weekDays,
    weekEndDate,
    weekStartDate
  ]);

  useEffect(() => {
    if (!comparisonOverlaySpecialistId) {
      comparisonOverlaySpecialistRequestIdRef.current += 1;
      setComparisonOverlaySpecialistSettings(null);
      setComparisonOverlaySpecialistBreaks([]);
      return;
    }

    const requestId = comparisonOverlaySpecialistRequestIdRef.current + 1;
    comparisonOverlaySpecialistRequestIdRef.current = requestId;

    async function loadComparisonOverlaySpecialistBlocks() {
      try {
        const [settingsResponse, breaksResponse] = await Promise.all([
          apiFetch(`/api/appointments/settings?${new URLSearchParams({
            specialistId: comparisonOverlaySpecialistId
          }).toString()}`, {
            method: "GET",
            cache: "no-store"
          }),
          canReadPlannerBreaks
            ? apiFetch(`/api/appointments/breaks?${new URLSearchParams({
                specialistId: comparisonOverlaySpecialistId
              }).toString()}`, {
                method: "GET",
                cache: "no-store"
              })
            : Promise.resolve(null)
        ]);
        const [settingsData, breaksData] = await Promise.all([
          readApiResponseData(settingsResponse),
          breaksResponse ? readApiResponseData(breaksResponse) : Promise.resolve(null)
        ]);

        if (requestId !== comparisonOverlaySpecialistRequestIdRef.current) {
          return;
        }

        setComparisonOverlaySpecialistSettings(
          settingsResponse.ok
            ? mapSchedulerSettingsFromApiItem(settingsData?.item)
            : null
        );
        setComparisonOverlaySpecialistBreaks(
          breaksResponse?.ok
            ? normalizePlannerBreakItems(Array.isArray(breaksData?.items) ? breaksData.items : [])
            : []
        );
      } catch {
        if (requestId !== comparisonOverlaySpecialistRequestIdRef.current) {
          return;
        }
        setComparisonOverlaySpecialistSettings(null);
        setComparisonOverlaySpecialistBreaks([]);
      }
    }

    void loadComparisonOverlaySpecialistBlocks();
  }, [canReadPlannerBreaks, comparisonOverlaySpecialistId]);

  function closeCreateModal() {
    recurringPatternDraftRef.current = {
      repeatUntil: "",
      repeatDays: []
    };
    setActivePlannerModalTab(PLANNER_MODAL_TABS.appointment);
    setCreateModal({
      open: false,
      mode: "create",
      appointmentId: "",
      specialistId: "",
      dayKey: "",
      dayLabel: "",
      date: null,
      time: "",
      repeatType: "none",
      repeatGroupKey: "",
      originalRepeatDays: [],
      originalStatus: "",
      plannerBlockType: "",
      plannerBlockOriginal: null
    });
    setCreateForm(createEmptyClientForm());
    setPlannerBreakForm(createEmptyPlannerBreakForm());
    setPlannerWorkScheduleForm(createEmptyPlannerWorkScheduleForm());
    setCreateErrors({});
    setCreateSubmitting(false);
    setCreateDeleting(false);
    setClientSearch(createEmptyClientSearchForm());
    setClientSearchMessage("");
    setClientOptions([]);
  }

  function closeDayBulkModal() {
    if (dayBulkModal.submitting || dayBulkModal.deleting) {
      return;
    }
    setDayBulkModal({
      open: false,
      dayKey: "",
      dayLabel: "",
      appointmentDate: "",
      displayMode: "client",
      items: [],
      selectedIds: [],
      status: "cancelled",
      note: "",
      submitting: false,
      deleting: false,
      error: ""
    });
  }

  function openDayBulkModal(day, items = []) {
    if (vipOnly) {
      return;
    }
    const appointmentDate = formatDateYmd(day?.date);
    if (!appointmentDate || isHistoryLockedDateYmd(appointmentDate, settings?.historyLockDays)) {
      setMessage("History is locked for this date.");
      return;
    }
    const normalizedItems = (Array.isArray(items) ? items : [])
      .filter((item) => String(item?.itemType || "").trim().toLowerCase() !== "daily-routine")
      .filter((item) => canMutateSpecialistId(String(item?.specialistId || selectedSpecialistId || "").trim()))
      .map((item) => ({
        ...item,
        id: String(item?.id || item?.appointmentId || "").trim(),
        specialistId: String(item?.specialistId || selectedSpecialistId || "").trim(),
        clientId: String(item?.clientId || "").trim(),
        specialist: String(item?.specialist || item?.specialistName || "").trim(),
        client: String(item?.client || item?.clientName || "").trim(),
        appointmentDate: String(item?.appointmentDate || appointmentDate).trim(),
        startTime: String(item?.time || item?.startTime || "").trim(),
        endTime: String(item?.endTime || "").trim(),
        durationMinutes: String(
          item?.durationMinutes
          || getDurationMinutesFromTimes(item?.time || item?.startTime, item?.endTime)
          || ""
        ).trim(),
        service: String(item?.service || item?.serviceName || DEFAULT_APPOINTMENT_SERVICE_NAME).trim(),
        status: String(item?.status || "pending").trim().toLowerCase(),
        note: String(item?.note || "").trim()
      }))
      .filter((item) => item.id && item.specialistId && item.clientId && item.appointmentDate && item.startTime);
    if (normalizedItems.length === 0) {
      setMessage("No appointments to manage for this day.");
      return;
    }
    setDayBulkModal({
      open: true,
      dayKey: String(day?.key || "").trim().toLowerCase(),
      dayLabel: String(day?.label || "").trim(),
      appointmentDate,
      displayMode: isClientFocusedMode ? "specialist" : "client",
      items: normalizedItems,
      selectedIds: normalizedItems.map((item) => item.id),
      status: "cancelled",
      note: "",
      submitting: false,
      deleting: false,
      error: ""
    });
  }

  function openCreateModal(day, slot, existingItem = null, specialistIdOverride = "") {
    const isEditMode = Boolean(existingItem);
    const isClientFocusedCreateContext = !isEditMode && isClientFocusedMode;
    const slotSpecialistId = isEditMode
      ? String(existingItem?.specialistId || "").trim()
      : String(specialistIdOverride || selectedSpecialistId || "").trim();
    const fallbackCreateSpecialistId = String(clientFocusedCreateSpecialistOptions[0]?.value || "").trim();
    const preferredCreateSpecialistId = (
      slotSpecialistId
      && clientFocusedCreateSpecialistOptions.some((option) => String(option?.value || "").trim() === slotSpecialistId)
    )
      ? slotSpecialistId
      : fallbackCreateSpecialistId;
    if (isEditMode) {
      if (!canMutateSpecialistId(slotSpecialistId)) {
        setMessage("You can only edit appointments in your own planner.");
        return;
      }
      if (!canUpdateAppointments && !canDeleteAppointments) {
        setMessage("You do not have permission to edit appointments.");
        return;
      }
    } else if (vipOnly) {
      return;
    } else if (isClientFocusedCreateContext) {
      if (!canOpenClientFocusedCreateModal) {
        setMessage("You do not have permission to create appointments.");
        return;
      }
    } else if (!canCreateOnPlannerSpecialist(slotSpecialistId)) {
      setMessage(
        canCreateAppointments
          ? "You can only create appointments in your own planner."
          : "You do not have permission to create appointments."
      );
      return;
    }

    if (!slotSpecialistId && !isClientFocusedCreateContext) {
      setSpecialistSelectError(true);
      return;
    }
    setSpecialistSelectError(false);
    setMessage("");
    const appointmentDate = formatDateYmd(day.date);
    const startTime = String(slot || "").trim();
    const defaultDuration = durationSelectOptions[0]?.value || "30";
    const defaultBlockEndTime = String(
      existingItem?.endTime
      || getDefaultPlannerBlockEndTime(
        startTime,
        endTimeSelectOptions,
        Number.parseInt(defaultDuration, 10) || Number.parseInt(String(settings.slotInterval || "").trim(), 10) || 30
      )
    ).trim();
    const existingDuration = String(existingItem?.durationMinutes || "").trim()
      || getDurationMinutesFromTimes(existingItem?.time, existingItem?.endTime);
    const nextDuration = isEditMode && existingDuration
      ? existingDuration
      : defaultDuration;
    const preselectedClientId = isEditMode
      ? String(existingItem?.clientId || "").trim()
      : String(selectedPlannerClientFilterId || "").trim();
    if (isEditMode && preselectedClientId) {
      setClientMap((prev) => {
        const previousClient = prev?.[preselectedClientId] && typeof prev[preselectedClientId] === "object"
          ? prev[preselectedClientId]
          : {};
        return {
          ...prev,
          [preselectedClientId]: {
            ...previousClient,
            id: preselectedClientId,
            firstName: String(existingItem?.clientFirstName || previousClient?.firstName || "").trim(),
            lastName: String(existingItem?.clientLastName || previousClient?.lastName || "").trim(),
            middleName: String(existingItem?.clientMiddleName || previousClient?.middleName || "").trim(),
            displayName: String(existingItem?.client || previousClient?.displayName || "").trim(),
            phone: String(previousClient?.phone || "").trim(),
            tgMail: String(previousClient?.tgMail || "").trim(),
            birthday: String(previousClient?.birthday || "").trim(),
            note: String(previousClient?.note || "").trim()
          }
        };
      });
    }
    if (!isEditMode && isClientFocusedCreateContext && preselectedClientId) {
      setClientMap((prev) => {
        const previousClient = prev?.[preselectedClientId] && typeof prev[preselectedClientId] === "object"
          ? prev[preselectedClientId]
          : {};
        return {
          ...prev,
          [preselectedClientId]: {
            ...previousClient,
            id: preselectedClientId,
            firstName: String(selectedPlannerFilterClient?.firstName || previousClient?.firstName || "").trim(),
            lastName: String(selectedPlannerFilterClient?.lastName || previousClient?.lastName || "").trim(),
            middleName: String(selectedPlannerFilterClient?.middleName || previousClient?.middleName || "").trim(),
            displayName: String(
              selectedPlannerFilterClient
                ? getClientDisplayName(selectedPlannerFilterClient)
                : (previousClient?.displayName || clientFocusedSelectedClientLabel || "")
            ).trim(),
            phone: String(previousClient?.phone || "").trim(),
            tgMail: String(previousClient?.tgMail || "").trim(),
            birthday: String(previousClient?.birthday || "").trim(),
            note: String(previousClient?.note || "").trim()
          }
        };
      });
    }

    const isExistingRecurring = Boolean(
      String(existingItem?.repeatType || "").trim().toLowerCase() === "weekly"
      && String(existingItem?.repeatGroupKey || "").trim()
    );
    const existingRepeatDays = inferCurrentSeriesRepeatDayKeys(
      existingItem,
      Array.isArray(existingItem?.repeatDays) ? existingItem.repeatDays : []
    );
    const defaultEditDayKeys = existingRepeatDays.length > 0
      ? existingRepeatDays
      : (DAY_KEYS_SET.has(day.key) ? [day.key] : []);
    setCreateModal({
      open: true,
      mode: existingItem ? "edit" : "create",
      appointmentId: String(existingItem?.id || ""),
      specialistId: isClientFocusedCreateContext ? preferredCreateSpecialistId : slotSpecialistId,
      dayKey: day.key,
      dayLabel: day.label,
      date: day.date,
      time: slot,
      repeatType: String(existingItem?.repeatType || "none").trim().toLowerCase(),
      repeatGroupKey: String(existingItem?.repeatGroupKey || "").trim(),
      originalRepeatDays: existingRepeatDays,
      originalStatus: String(existingItem?.status || "").trim(),
      plannerBlockType: "",
      plannerBlockOriginal: null
    });
    if (existingItem) {
      recurringPatternDraftRef.current = {
        repeatUntil: isExistingRecurring
          ? String(existingItem?.repeatUntilDate || appointmentDate || "").trim()
          : getDefaultRepeatUntilDate(appointmentDate),
        repeatDays: defaultEditDayKeys
      };
      setCreateForm({
        clientId: preselectedClientId,
        appointmentDate,
        startTime,
        durationMinutes: nextDuration,
        service: String(existingItem?.service || DEFAULT_APPOINTMENT_SERVICE_NAME),
        status: String(existingItem?.status || "pending"),
        note: String(existingItem?.note || ""),
        editScope: isExistingRecurring ? "future" : "single",
        repeatEnabled: isExistingRecurring,
        repeatUntil: isExistingRecurring
          ? String(existingItem?.repeatUntilDate || appointmentDate || "").trim()
          : appointmentDate,
        repeatDays: defaultEditDayKeys
      });
    } else {
      const shouldDefaultToRecurring = recurringOnly || !vipOnly;
      const defaultRepeatUntil = shouldDefaultToRecurring
        ? getDefaultRepeatUntilDate(appointmentDate)
        : "";
      const defaultRepeatDays = DAY_KEYS_SET.has(day.key) ? [day.key] : [];
      recurringPatternDraftRef.current = {
        repeatUntil: defaultRepeatUntil || getDefaultRepeatUntilDate(appointmentDate),
        repeatDays: defaultRepeatDays
      };
      const nextCreateForm = createEmptyClientForm({
        appointmentDate,
        startTime,
        durationMinutes: nextDuration,
        repeatEnabled: shouldDefaultToRecurring,
        repeatUntil: defaultRepeatUntil,
        repeatDays: defaultRepeatDays
      });
      nextCreateForm.clientId = preselectedClientId;
      setCreateForm(nextCreateForm);
    }
    setActivePlannerModalTab(PLANNER_MODAL_TABS.appointment);
    setPlannerBreakForm(createEmptyPlannerBreakForm({
      startTime,
      endTime: defaultBlockEndTime
    }));
    setPlannerWorkScheduleForm(createEmptyPlannerWorkScheduleForm({
      startTime,
      endTime: defaultBlockEndTime
    }));
    setCreateErrors({});
  }

  function openPlannerBlockModal(day, slot, blockType, blockItem = {}) {
    if (vipOnly || isClientFocusedMode) {
      return;
    }
    const normalizedBlockType = String(blockType || "").trim();
    const specialistId = String(selectedSpecialistId || "").trim();
    if (!specialistId) {
      setSpecialistSelectError(true);
      return;
    }
    if (!canMutateSpecialistId(specialistId)) {
      setMessage("You can only manage blocks in your own planner.");
      return;
    }
    if (normalizedBlockType === PLANNER_MODAL_TABS.break && !canUpdateAppointmentBreaks) {
      setMessage("You do not have permission to update appointment breaks.");
      return;
    }
    if (
      normalizedBlockType === PLANNER_MODAL_TABS.workSchedule
      && !canUpdateAppointmentWorkSchedule
      && !canDeleteAppointmentWorkSchedule
    ) {
      setMessage("You do not have permission to manage work schedule blocks.");
      return;
    }
    if (![PLANNER_MODAL_TABS.break, PLANNER_MODAL_TABS.workSchedule].includes(normalizedBlockType)) {
      return;
    }

    setSpecialistSelectError(false);
    setMessage("");
    const appointmentDate = formatDateYmd(day.date);
    const startTime = String(blockItem?.startTime || slot || "").trim();
    const endTime = String(blockItem?.endTime || getDefaultPlannerBlockEndTime(
      startTime,
      endTimeSelectOptions,
      Number.parseInt(String(settings.slotInterval || "").trim(), 10) || 30
    )).trim();
    const dayOfWeek = getDayOfWeekNumberFromDayKey(day.key);
    const plannerBlockOriginal = normalizedBlockType === PLANNER_MODAL_TABS.break
      ? {
          type: PLANNER_MODAL_TABS.break,
          id: String(blockItem?.id || "").trim(),
          specialistId,
          dayKey: day.key,
          dayOfWeek,
          startTime,
          endTime,
          breakType: normalizeBreakTypeKey(blockItem?.breakType || "lunch"),
          note: String(blockItem?.note || "").trim(),
          title: String(blockItem?.title || "").trim()
        }
      : {
          type: PLANNER_MODAL_TABS.workSchedule,
          id: String(blockItem?.id || "").trim(),
          specialistId,
          dayKey: day.key,
          dayOfWeek,
          startTime,
          endTime,
          reason: String(blockItem?.reasonFull || blockItem?.reason || "").trim()
        };

    setCreateModal({
      open: true,
      mode: "create",
      appointmentId: "",
      specialistId,
      dayKey: day.key,
      dayLabel: day.label,
      date: day.date,
      time: startTime,
      repeatType: "none",
      repeatGroupKey: "",
      originalRepeatDays: [],
      originalStatus: "",
      plannerBlockType: normalizedBlockType,
      plannerBlockOriginal
    });
    setCreateForm(createEmptyClientForm({
      appointmentDate,
      startTime,
      durationMinutes: getDurationMinutesFromTimes(startTime, endTime) || durationSelectOptions[0]?.value || "30",
      repeatEnabled: false,
      repeatUntil: "",
      repeatDays: DAY_KEYS_SET.has(day.key) ? [day.key] : []
    }));
    setActivePlannerModalTab(normalizedBlockType);
    setPlannerBreakForm(createEmptyPlannerBreakForm({
      startTime,
      endTime,
      breakType: blockItem?.breakType || "lunch",
      note: blockItem?.note || ""
    }));
    setPlannerWorkScheduleForm(createEmptyPlannerWorkScheduleForm({
      startTime,
      endTime,
      reason: blockItem?.reasonFull || blockItem?.reason || ""
    }));
    setCreateErrors({});
    setCreateSubmitting(false);
    setCreateDeleting(false);
    setClientSearch(createEmptyClientSearchForm());
    setClientSearchMessage("");
    setClientOptions([]);
  }

  async function moveAppointmentToSlot(item, sourceDay, targetDay, targetSlot) {
    if (vipOnly) {
      return;
    }
    const appointmentId = String(item?.id || item?.appointmentId || "").trim();
    const specialistId = String(item?.specialistId || selectedSpecialistId || "").trim();
    const targetAppointmentDate = formatDateYmd(targetDay?.date);
    const sourceAppointmentDate = String(sourceDay?.date || item?.appointmentDate || "").trim();
    const targetStartTime = String(targetSlot || "").trim();
    const durationMinutes = Number.parseInt(
      String(item?.durationMinutes || getDurationMinutesFromTimes(item?.time, item?.endTime) || "30").trim(),
      10
    );
    const targetStartMinutes = normalizeTimeToMinutes(targetStartTime);
    if (!appointmentId || !specialistId || !targetAppointmentDate || targetStartMinutes === null) {
      setMessage("Invalid appointment move target.");
      return;
    }
    if (!isPendingAppointmentStatus(item?.status)) {
      setMessage("Only pending appointments can be moved.");
      return;
    }
    if (
      isHistoryLockedDateYmd(sourceAppointmentDate, settings?.historyLockDays)
      || isHistoryLockedDateYmd(targetAppointmentDate, settings?.historyLockDays)
    ) {
      setMessage("Appointments cannot be moved outside the history lock window.");
      return;
    }
    const targetWeekStart = formatDateYmd(getStartOfWeek(new Date(`${targetAppointmentDate}T00:00:00`)));
    const visibleWeekStart = formatDateYmd(weekStartDate);
    if (targetWeekStart !== visibleWeekStart) {
      setMessage("Appointments can only be moved within the visible week.");
      return;
    }
    if (!canUpdateAppointments || !canMutateSpecialistId(specialistId)) {
      setMessage("You do not have permission to move this appointment.");
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setMessage("Invalid appointment duration.");
      return;
    }
    if (sourceAppointmentDate === targetAppointmentDate && String(item?.time || "").trim() === targetStartTime) {
      return;
    }

    const targetEndTime = minutesToTime(targetStartMinutes + durationMinutes);
    const normalizedStatus = String(item?.status || "pending").trim().toLowerCase();
    const shouldShowImmediateAlert = typeof onNotification === "function";
    if (ACTIVE_SCHEDULE_STATUSES.has(normalizedStatus)) {
      const shouldCheckSpecialistLocalAvailability = !isClientFocusedMode;
      if (shouldCheckSpecialistLocalAvailability) {
        const workingHoursConflictMessage = getPlannerWorkingHoursConflictMessage(
          settings,
          targetAppointmentDate,
          targetStartTime,
          targetEndTime
        );
        if (workingHoursConflictMessage) {
          setMessage(workingHoursConflictMessage);
          if (shouldShowImmediateAlert) {
            showImmediateAlert(workingHoursConflictMessage);
          }
          return;
        }

        const blockedTimeConflictReason = findPlannerBlockedTimeConflict(
          blockedTimesForSpecialist,
          targetAppointmentDate,
          targetStartTime,
          targetEndTime
        );
        if (blockedTimeConflictReason) {
          const blockedTimeConflictMessage = `Selected time overlaps blocked time: ${blockedTimeConflictReason}.`;
          setMessage(blockedTimeConflictMessage);
          if (shouldShowImmediateAlert) {
            showImmediateAlert(blockedTimeConflictMessage);
          }
          return;
        }

        const breakConflictReason = findPlannerBreakConflict(
          breaksForSpecialist,
          targetAppointmentDate,
          targetStartTime,
          targetEndTime
        );
        if (breakConflictReason) {
          const breakConflictMessage = `Selected time overlaps specialist break: ${breakConflictReason}.`;
          setMessage(breakConflictMessage);
          if (shouldShowImmediateAlert) {
            showImmediateAlert(breakConflictMessage);
          }
          return;
        }

        const absenceConflictReason = findPlannerAbsenceConflict(
          absencesForSpecialist,
          targetAppointmentDate,
          targetStartTime,
          targetEndTime
        );
        if (absenceConflictReason) {
          const absenceConflictMessage = `Selected time overlaps specialist absence: ${absenceConflictReason}.`;
          setMessage(absenceConflictMessage);
          if (shouldShowImmediateAlert) {
            showImmediateAlert(absenceConflictMessage);
          }
          return;
        }
      }

      const localConflict = findLocalScheduleConflict({
        appointmentDate: targetAppointmentDate,
        startTime: targetStartTime,
        endTime: targetEndTime,
        excludeAppointmentId: appointmentId,
        appointmentsByDay: isClientFocusedMode ? clientFocusedAppointmentsByDay : rawAppointmentsByDay
      });
      if (localConflict) {
        const localConflictTime = [localConflict.startTime, localConflict.endTime].filter(Boolean).join(" - ");
        const localConflictClient = localConflict.client ? ` (${localConflict.client})` : "";
        const conflictMessage = localConflictTime
          ? `This slot is already occupied at ${localConflictTime}${localConflictClient}.`
          : "This slot is already occupied.";
        setMessage(conflictMessage);
        if (shouldShowImmediateAlert) {
          showImmediateAlert(conflictMessage);
        }
        return;
      }
    }

    const queryParams = new URLSearchParams({ scope: "single" });
    const sourceDayKey = String(sourceDay?.key || "").trim().toLowerCase();
    if (
      String(item?.repeatType || "").trim().toLowerCase() === "weekly"
      && String(item?.repeatGroupKey || "").trim()
      && DAY_KEYS_SET.has(sourceDayKey)
    ) {
      queryParams.set("dayKeys", sourceDayKey);
    }

    try {
      const response = await apiFetch(
        `/api/appointments/schedules/${encodeURIComponent(appointmentId)}?${queryParams.toString()}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            specialistId,
            clientId: String(item?.clientId || "").trim(),
            appointmentDate: targetAppointmentDate,
            startTime: targetStartTime,
            endTime: targetEndTime,
            durationMinutes: String(durationMinutes),
            service: String(item?.service || DEFAULT_APPOINTMENT_SERVICE_NAME).trim() || DEFAULT_APPOINTMENT_SERVICE_NAME,
            status: normalizedStatus || "pending",
            note: String(item?.note || "").trim()
          })
        }
      );
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const serverMessage = String(data?.message || "Failed to move appointment.").trim();
        setMessage(serverMessage);
        if (response.status === 409 && shouldShowImmediateAlert) {
          showImmediateAlert(serverMessage);
        }
        return;
      }

      await refreshPlannerServerState();
      setMessage("");
    } catch {
      setMessage("Failed to move appointment.");
    }
  }

  async function movePlannerBreakToSlot(item, sourceDay, targetDay, targetSlot) {
    if (vipOnly || isClientFocusedMode) {
      return;
    }
    const specialistId = String(item?.specialistId || selectedSpecialistId || "").trim();
    const targetStartTime = String(targetSlot || "").trim();
    const targetStartMinutes = normalizeTimeToMinutes(targetStartTime);
    const sourceStartTime = String(item?.startTime || "").trim();
    const sourceEndTime = String(item?.endTime || "").trim();
    const durationMinutes = getDurationMinutesFromTimes(sourceStartTime, sourceEndTime);
    const targetDayKey = String(targetDay?.key || "").trim().toLowerCase();
    const targetDayOfWeek = getDayOfWeekNumberFromDayKey(targetDayKey);

    if (!specialistId || targetStartMinutes === null || !Number.isInteger(durationMinutes) || durationMinutes <= 0 || !targetDayOfWeek) {
      setMessage("Invalid break move target.");
      return;
    }
    if (!canUpdateAppointmentBreaks || !canMutateSpecialistId(specialistId)) {
      setMessage("You do not have permission to move this break.");
      return;
    }

    const targetEndTime = minutesToTime(targetStartMinutes + durationMinutes);
    const targetDateYmd = formatDateYmd(targetDay?.date);
    const workingHoursConflictMessage = getPlannerWorkingHoursConflictMessage(
      settings,
      targetDateYmd,
      targetStartTime,
      targetEndTime
    );
    if (workingHoursConflictMessage) {
      setMessage(workingHoursConflictMessage);
      return;
    }

    const localConflict = findLocalScheduleConflict({
      appointmentDate: targetDateYmd,
      startTime: targetStartTime,
      endTime: targetEndTime
    });
    if (localConflict) {
      const conflictTime = localConflict.startTime && localConflict.endTime
        ? `${localConflict.startTime}-${localConflict.endTime}`
        : "selected time";
      setMessage(`Selected time overlaps existing appointment (${conflictTime}).`);
      return;
    }

    const blockedTimeConflictReason = findPlannerBlockedTimeConflict(
      blockedTimesForSpecialist,
      targetDateYmd,
      targetStartTime,
      targetEndTime
    );
    if (blockedTimeConflictReason) {
      setMessage(`Selected time overlaps blocked time: ${blockedTimeConflictReason}.`);
      return;
    }

    const absenceConflictReason = findPlannerAbsenceConflict(
      absencesForSpecialist,
      targetDateYmd,
      targetStartTime,
      targetEndTime
    );
    if (absenceConflictReason) {
      setMessage(`Selected time overlaps specialist absence: ${absenceConflictReason}.`);
      return;
    }

    const breakId = String(item?.id || "").trim();
    const sourceDayKey = String(sourceDay?.key || item?.dayKey || "").trim().toLowerCase();
    const sourceDayOfWeek = Number.parseInt(String(item?.dayOfWeek ?? getDayOfWeekNumberFromDayKey(sourceDayKey)).trim(), 10) || 0;
    const sourceBreakType = normalizeBreakTypeKey(item?.breakType || "lunch");
    const sourceNote = String(item?.note || "").trim();
    const sourceTitle = String(item?.title || "").trim();
    const currentBreaks = Array.isArray(breaksForSpecialist) ? breaksForSpecialist : [];

    let didMove = false;
    const nextItems = currentBreaks.map((breakItem) => {
      const normalizedId = String(breakItem?.id || "").trim();
      const isTarget = breakId
        ? normalizedId === breakId
        : (
            Number.parseInt(String(breakItem?.dayOfWeek ?? "").trim(), 10) === sourceDayOfWeek
            && String(breakItem?.startTime || "").trim() === sourceStartTime
            && String(breakItem?.endTime || "").trim() === sourceEndTime
            && normalizeBreakTypeKey(breakItem?.breakType || "") === sourceBreakType
          );
      if (!isTarget || didMove) {
        return breakItem;
      }
      didMove = true;
      return {
        ...breakItem,
        dayKey: targetDayKey,
        dayOfWeek: targetDayOfWeek,
        startTime: targetStartTime,
        endTime: targetEndTime,
        breakType: sourceBreakType,
        title: sourceTitle,
        note: sourceNote
      };
    });

    if (!didMove) {
      setMessage("Break was not found.");
      return;
    }

    try {
      const response = await apiFetch("/api/appointments/breaks", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          specialistId,
          items: nextItems.map((breakItem) => {
            const dayOfWeek = Number.parseInt(String(breakItem?.dayOfWeek ?? "").trim(), 10) || getDayOfWeekNumberFromDayKey(breakItem?.dayKey);
            return {
              dayKey: String(breakItem?.dayKey || getDayKeyFromDayOfWeekNumber(dayOfWeek)).trim(),
              dayOfWeek,
              breakType: normalizeBreakTypeKey(breakItem?.breakType || "lunch"),
              title: String(breakItem?.title || "").trim(),
              note: String(breakItem?.note || "").trim(),
              startTime: String(breakItem?.startTime || "").trim(),
              endTime: String(breakItem?.endTime || "").trim(),
              isActive: breakItem?.isActive !== false
            };
          })
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(String(data?.message || "Failed to move break.").trim());
        return;
      }

      await refreshPlannerServerState();
      setMessage("");
    } catch {
      setMessage("Failed to move break.");
    }
  }

  useEffect(() => {
    if (!createModal.open) {
      return;
    }
    if (isPlannerBlockEditMode) {
      if (activePlannerModalTab !== normalizedPlannerBlockType) {
        setActivePlannerModalTab(normalizedPlannerBlockType);
      }
      return;
    }
    if (plannerModalTabOptions.some((tab) => tab.value === activePlannerModalTab)) {
      return;
    }
    setActivePlannerModalTab(PLANNER_MODAL_TABS.appointment);
  }, [
    activePlannerModalTab,
    createModal.open,
    isPlannerBlockEditMode,
    normalizedPlannerBlockType,
    plannerModalTabOptions
  ]);

  useEffect(() => {
    if (!createModal.open) {
      return;
    }
    if (!isPlannerAppointmentTab) {
      setClientSearchMessage("");
      setClientOptions([]);
      return;
    }
    if (vipOnly) {
      setClientSearchMessage("");
      setClientOptions([]);
      return;
    }
    if (isClientFocusedCreateMode) {
      setClientSearchMessage("");
      setClientOptions([]);
      return;
    }
    const trimmedFirstName = String(clientSearch.firstName || "").trim();
    const trimmedLastName = String(clientSearch.lastName || "").trim();
    const trimmedMiddleName = String(clientSearch.middleName || "").trim();
    const trimmedClientId = String(clientSearch.clientId || "").trim();
    const combinedLength = `${trimmedFirstName}${trimmedLastName}${trimmedMiddleName}`.length;
    if (combinedLength === 0 && !trimmedClientId) {
      setClientSearchMessage("");
      setClientOptions([]);
      return;
    }
    if (!trimmedClientId && combinedLength < 3) {
      setClientSearchMessage("Type at least 3 letters or enter client ID.");
      setClientOptions([]);
      return;
    }

    let active = true;
    const timerId = window.setTimeout(async () => {
      try {
        setClientSearchMessage("");

        const queryParams = new URLSearchParams({
          limit: "50"
        });
        if (trimmedFirstName) {
          queryParams.set("firstName", trimmedFirstName);
        }
        if (trimmedLastName) {
          queryParams.set("lastName", trimmedLastName);
        }
        if (trimmedMiddleName) {
          queryParams.set("middleName", trimmedMiddleName);
        }
        if (trimmedClientId) {
          queryParams.set("clientId", trimmedClientId);
        }

        const response = await apiFetch(`/api/clients/search?${queryParams.toString()}`, {
          method: "GET",
          cache: "no-store"
        });
        const data = await readApiResponseData(response);

        if (!active) {
          return;
        }

        if (!response.ok) {
          setClientOptions([]);
          setClientSearchMessage(data?.message || "Failed to load clients.");
          return;
        }

        const items = Array.isArray(data?.items) ? data.items : [];
        const nextMap = {};
        const nextOptions = items
          .map((item) => {
            const id = String(item?.id || "").trim();
            if (!id) {
              return null;
            }
            const normalized = {
              id,
              firstName: String(item?.firstName || "").trim(),
              lastName: String(item?.lastName || "").trim(),
              middleName: String(item?.middleName || "").trim(),
              phone: String(item?.phone || "").trim(),
              tgMail: String(item?.tgMail || item?.telegramOrEmail || "").trim(),
              birthday: String(item?.birthday || "").trim(),
              note: String(item?.note || "").trim()
            };
            nextMap[id] = normalized;
            return {
              value: id,
              label: formatClientOptionLabel(normalized)
            };
          })
          .filter(Boolean);

        setClientMap((prev) => ({ ...prev, ...nextMap }));
        setClientOptions(nextOptions);
        if (nextOptions.length === 0) {
          setClientSearchMessage("No clients found.");
        } else {
          setClientSearchMessage("");
        }
      } catch {
        if (active) {
          setClientOptions([]);
          setClientSearchMessage("Failed to load clients.");
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [
    clientSearch.clientId,
    clientSearch.firstName,
    clientSearch.lastName,
    clientSearch.middleName,
    createModal.open,
    isPlannerAppointmentTab,
    isClientFocusedCreateMode,
    vipOnly
  ]);

  useEffect(() => {
    if (!createModal.open || createModal.mode === "edit") {
      return;
    }
    if (!Array.isArray(visibleRepeatDayKeys) || visibleRepeatDayKeys.length === 0) {
      return;
    }

    setCreateForm((prev) => {
      const currentDays = Array.isArray(prev.repeatDays)
        ? prev.repeatDays
            .map((day) => String(day || "").trim().toLowerCase())
            .filter((day) => DAY_KEYS_SET.has(day))
        : [];
      const appointmentDayKey = getDayKeyFromDateYmd(prev.appointmentDate);
      const nextDays = !prev.repeatEnabled
        ? (
          appointmentDayKey && visibleRepeatDayKeys.includes(appointmentDayKey)
            ? [appointmentDayKey]
            : []
        )
        : (
          currentDays.length > 0
            ? ensureAnchoredRepeatDayKeys(prev.appointmentDate, currentDays, visibleRepeatDayKeys)
            : visibleRepeatDayKeys.filter((day) => currentDays.includes(day))
        );

      const isSame = (
        nextDays.length === currentDays.length
        && nextDays.every((day, index) => day === currentDays[index])
      );
      if (isSame) {
        return prev;
      }

      return {
        ...prev,
        repeatDays: nextDays
      };
    });
  }, [createForm.appointmentDate, createForm.repeatEnabled, createModal.mode, createModal.open, visibleRepeatDayKeys]);

  function updatePlannerModalSpecialist(nextValue) {
    const normalizedValue = String(nextValue || "").trim();
    setCreateModal((prev) => ({ ...prev, specialistId: normalizedValue }));
    setCreateErrors({});
  }

  function handlePlannerModalTabChange(nextTab) {
    const normalizedValue = String(nextTab || "").trim();
    if (isPlannerBlockEditMode && normalizedValue !== normalizedPlannerBlockType) {
      return;
    }
    const targetTab = plannerModalTabOptions.find((tab) => tab.value === normalizedValue);
    if (!targetTab || targetTab.disabled) {
      return;
    }
    setActivePlannerModalTab(normalizedValue);
    setCreateErrors({});
  }

  function setPlannerModalFormError(message) {
    const text = String(message || "").trim() || "Request failed.";
    setCreateErrors({ form: text });
    setMessage(text);
  }

  function validatePlannerBreakForm(value) {
    const errors = {};
    const startTime = String(value?.startTime || "").trim();
    const endTime = String(value?.endTime || "").trim();
    const breakType = normalizeBreakTypeKey(value?.breakType || "");
    const note = String(value?.note || "").trim();
    const startMinutes = normalizeTimeToMinutes(startTime);
    const endMinutes = normalizeTimeToMinutes(endTime);

    if (startMinutes === null) {
      errors.startTime = "Invalid start time.";
    }
    if (endMinutes === null) {
      errors.endTime = "Invalid end time.";
    }
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      errors.endTime = "End time must be after start time.";
    }
    if (!BREAK_TYPE_OPTIONS.some((option) => option.value === breakType)) {
      errors.breakType = "Break type is required.";
    }
    if (note.length > 255) {
      errors.note = "Note is too long.";
    }

    return errors;
  }

  function validatePlannerWorkScheduleForm(value) {
    const errors = {};
    const startTime = String(value?.startTime || "").trim();
    const endTime = String(value?.endTime || "").trim();
    const reason = String(value?.reason || "").trim();
    const startMinutes = normalizeTimeToMinutes(startTime);
    const endMinutes = normalizeTimeToMinutes(endTime);

    if (startMinutes === null) {
      errors.startTime = "Invalid start time.";
    }
    if (endMinutes === null) {
      errors.endTime = "Invalid end time.";
    }
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      errors.endTime = "End time must be after start time.";
    }
    if (reason.length > 120) {
      errors.reason = "Reason is too long.";
    }

    return errors;
  }

  async function handlePlannerBreakSubmit() {
    const specialistId = String(createModal.specialistId || "").trim();
    if (!specialistId) {
      setCreateErrors({ specialistId: "Specialist is required." });
      return;
    }
    if (!canUpdateAppointmentBreaks) {
      setPlannerModalFormError("You do not have permission to update appointment breaks.");
      return;
    }
    if (!canMutateSpecialistId(specialistId)) {
      setCreateErrors({ specialistId: "You can only manage breaks in your own planner." });
      return;
    }
    if (plannerBlockRepeatDayNumbers.length === 0) {
      setCreateErrors({ repeatDays: "Select at least one repeat day." });
      return;
    }

    const nextPayload = {
      startTime: String(plannerBreakForm.startTime || "").trim(),
      endTime: String(plannerBreakForm.endTime || "").trim(),
      breakType: normalizeBreakTypeKey(plannerBreakForm.breakType || ""),
      note: String(plannerBreakForm.note || "").trim()
    };
    const errors = validatePlannerBreakForm(nextPayload);
    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }

    for (const dayKey of plannerBlockRepeatDayKeys) {
      const day = weekDays.find((item) => item.key === dayKey);
      const appointmentDate = day?.date ? formatDateYmd(day.date) : "";
      if (!appointmentDate) {
        continue;
      }

      const workingHoursConflictMessage = getPlannerWorkingHoursConflictMessage(
        settings,
        appointmentDate,
        nextPayload.startTime,
        nextPayload.endTime
      );
      if (workingHoursConflictMessage) {
        setPlannerModalFormError(workingHoursConflictMessage);
        return;
      }

      const localConflict = findLocalScheduleConflict({
        appointmentDate,
        startTime: nextPayload.startTime,
        endTime: nextPayload.endTime
      });
      if (localConflict) {
        const conflictTime = localConflict.startTime && localConflict.endTime
          ? `${localConflict.startTime}-${localConflict.endTime}`
          : nextPayload.startTime;
        setPlannerModalFormError(`Selected time overlaps existing appointment (${conflictTime}).`);
        return;
      }

      const blockedTimeConflictReason = findPlannerBlockedTimeConflict(
        blockedTimesForSpecialist,
        appointmentDate,
        nextPayload.startTime,
        nextPayload.endTime
      );
      if (blockedTimeConflictReason) {
        setPlannerModalFormError(`Selected time overlaps blocked time: ${blockedTimeConflictReason}.`);
        return;
      }

      const absenceConflictReason = findPlannerAbsenceConflict(
        absencesForSpecialist,
        appointmentDate,
        nextPayload.startTime,
        nextPayload.endTime
      );
      if (absenceConflictReason) {
        setPlannerModalFormError(`Selected time overlaps specialist absence: ${absenceConflictReason}.`);
        return;
      }
    }

    try {
      setCreateSubmitting(true);
      setCreateErrors({});

      const currentResponse = await apiFetch(`/api/appointments/breaks?${new URLSearchParams({
        specialistId
      }).toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const currentData = await readApiResponseData(currentResponse);
      if (!currentResponse.ok) {
        setPlannerModalFormError(currentData?.message || "Failed to load existing breaks.");
        return;
      }

      const currentItems = (Array.isArray(currentData?.items) ? currentData.items : []).map((item) => ({
        dayOfWeek: Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10) || 0,
        dayKey: String(item?.dayKey || "").trim().toLowerCase(),
        breakType: normalizeBreakTypeKey(item?.breakType || ""),
        title: String(item?.title || "").trim(),
        note: String(item?.note || "").trim(),
        startTime: String(item?.startTime || "").trim(),
        endTime: String(item?.endTime || "").trim(),
        isActive: item?.isActive !== false
      }));

      const originalBreak = (
        String(createModal.plannerBlockType || "").trim() === PLANNER_MODAL_TABS.break
        && createModal.plannerBlockOriginal
        && typeof createModal.plannerBlockOriginal === "object"
      )
        ? createModal.plannerBlockOriginal
        : null;
      const currentItemsExcludingOriginal = originalBreak
        ? currentItems.filter((item) => !(
            String(item?.dayKey || "").trim().toLowerCase() === String(originalBreak.dayKey || "").trim().toLowerCase()
            && String(item?.startTime || "").trim() === String(originalBreak.startTime || "").trim()
            && String(item?.endTime || "").trim() === String(originalBreak.endTime || "").trim()
            && normalizeBreakTypeKey(item?.breakType || "") === normalizeBreakTypeKey(originalBreak.breakType || "")
          ))
        : currentItems;

      const selectedDaySet = new Set(plannerBlockRepeatDayKeys);
      const currentItemsExcludingTargets = currentItemsExcludingOriginal.filter((item) => {
        const itemDayKey = String(item?.dayKey || getDayKeyFromDayOfWeekNumber(item?.dayOfWeek)).trim().toLowerCase();
        return !(
          selectedDaySet.has(itemDayKey)
          && String(item?.startTime || "").trim() === nextPayload.startTime
          && String(item?.endTime || "").trim() === nextPayload.endTime
          && normalizeBreakTypeKey(item?.breakType || "") === nextPayload.breakType
        );
      });
      const nextBreakItems = [
        ...currentItemsExcludingTargets,
        ...plannerBlockRepeatDayNumbers.map((dayOfWeek) => {
          const dayKey = getDayKeyFromDayOfWeekNumber(dayOfWeek);
          return {
            dayOfWeek,
            dayKey,
            breakType: nextPayload.breakType,
            note: nextPayload.note,
            startTime: nextPayload.startTime,
            endTime: nextPayload.endTime,
            isActive: true
          };
        })
      ];

      const response = await apiFetch("/api/appointments/breaks", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          specialistId,
          items: nextBreakItems
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setPlannerModalFormError(data?.message || "Failed to save break.");
        return;
      }

      await refreshPlannerServerState();
      closeCreateModal();
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handlePlannerWorkScheduleSubmit() {
    const specialistId = String(createModal.specialistId || "").trim();
    if (!specialistId) {
      setCreateErrors({ specialistId: "Specialist is required." });
      return;
    }
    if (!canCreateAppointmentWorkSchedule && !canUpdateAppointmentWorkSchedule) {
      setPlannerModalFormError("You do not have permission to update work schedule.");
      return;
    }
    if (!canMutateSpecialistId(specialistId)) {
      setCreateErrors({ specialistId: "You can only manage work schedule in your own planner." });
      return;
    }
    if (plannerBlockRepeatDayNumbers.length === 0) {
      setCreateErrors({ repeatDays: "Select at least one repeat day." });
      return;
    }

    const nextPayload = {
      startTime: String(plannerWorkScheduleForm.startTime || "").trim(),
      endTime: String(plannerWorkScheduleForm.endTime || "").trim(),
      reason: String(plannerWorkScheduleForm.reason || "").trim()
    };
    const errors = validatePlannerWorkScheduleForm(nextPayload);
    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }

    for (const dayKey of plannerBlockRepeatDayKeys) {
      const day = weekDays.find((item) => item.key === dayKey);
      const appointmentDate = day?.date ? formatDateYmd(day.date) : "";
      if (!appointmentDate) {
        continue;
      }

      const workingHoursConflictMessage = getPlannerWorkingHoursConflictMessage(
        settings,
        appointmentDate,
        nextPayload.startTime,
        nextPayload.endTime
      );
      if (workingHoursConflictMessage) {
        setPlannerModalFormError(workingHoursConflictMessage);
        return;
      }

      const localConflict = findLocalScheduleConflict({
        appointmentDate,
        startTime: nextPayload.startTime,
        endTime: nextPayload.endTime
      });
      if (localConflict) {
        const conflictTime = localConflict.startTime && localConflict.endTime
          ? `${localConflict.startTime}-${localConflict.endTime}`
          : nextPayload.startTime;
        setPlannerModalFormError(`Selected time overlaps existing appointment (${conflictTime}).`);
        return;
      }

      const breakConflictReason = findPlannerBreakConflict(
        breaksForSpecialist,
        appointmentDate,
        nextPayload.startTime,
        nextPayload.endTime
      );
      if (breakConflictReason) {
        setPlannerModalFormError(`Selected time overlaps specialist break: ${breakConflictReason}.`);
        return;
      }

      const absenceConflictReason = findPlannerAbsenceConflict(
        absencesForSpecialist,
        appointmentDate,
        nextPayload.startTime,
        nextPayload.endTime
      );
      if (absenceConflictReason) {
        setPlannerModalFormError(`Selected time overlaps specialist absence: ${absenceConflictReason}.`);
        return;
      }
    }

    try {
      setCreateSubmitting(true);
      setCreateErrors({});

      const currentResponse = await apiFetch(`/api/appointments/work-schedule?${new URLSearchParams({
        userId: specialistId,
        ruleScope: "weekly"
      }).toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const currentData = await readApiResponseData(currentResponse);
      if (!currentResponse.ok) {
        setPlannerModalFormError(currentData?.message || "Failed to load current work schedule.");
        return;
      }

      const currentItems = Array.isArray(currentData?.items) ? currentData.items : [];
      for (const dayOfWeek of plannerBlockRepeatDayNumbers) {
        const existingEntry = currentItems.find((item) => (
          String(item?.ruleScope || "").trim().toLowerCase() === "weekly"
          && String(item?.userId || "").trim() === specialistId
          && Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10) === dayOfWeek
        )) || null;

        const requestBody = {
          userId: specialistId,
          ruleScope: "weekly",
          dayOfWeek,
          isActive: true,
          startTime: nextPayload.startTime,
          endTime: nextPayload.endTime,
          reason: nextPayload.reason
        };
        const response = await apiFetch(
          existingEntry
            ? `/api/appointments/work-schedule/${encodeURIComponent(String(existingEntry?.id || "").trim())}`
            : "/api/appointments/work-schedule",
          {
            method: existingEntry ? "PATCH" : "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
          }
        );
        const data = await readApiResponseData(response);
        if (!response.ok) {
          setPlannerModalFormError(data?.message || "Failed to save work schedule.");
          return;
        }
      }

      await refreshPlannerServerState();
      closeCreateModal();
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handlePlannerBreakDelete() {
    const specialistId = String(createModal.specialistId || "").trim();
    if (!specialistId) {
      setCreateErrors({ specialistId: "Specialist is required." });
      return;
    }
    if (!canUpdateAppointmentBreaks) {
      setPlannerModalFormError("You do not have permission to update appointment breaks.");
      return;
    }
    if (!canMutateSpecialistId(specialistId)) {
      setCreateErrors({ specialistId: "You can only manage breaks in your own planner." });
      return;
    }

    const originalBreak = (
      String(createModal.plannerBlockType || "").trim() === PLANNER_MODAL_TABS.break
      && createModal.plannerBlockOriginal
      && typeof createModal.plannerBlockOriginal === "object"
    )
      ? createModal.plannerBlockOriginal
      : null;
    const targetDayKey = String(originalBreak?.dayKey || createModal.dayKey || "").trim().toLowerCase();
    const targetStartTime = String(originalBreak?.startTime || plannerBreakForm.startTime || "").trim();
    const targetEndTime = String(originalBreak?.endTime || plannerBreakForm.endTime || "").trim();
    const targetBreakType = normalizeBreakTypeKey(originalBreak?.breakType || plannerBreakForm.breakType || "");
    if (plannerBlockRepeatDaySet.size === 0) {
      setCreateErrors({ repeatDays: "Select at least one repeat day." });
      return;
    }
    if (!targetDayKey || !targetStartTime || !targetEndTime) {
      setPlannerModalFormError("Select a valid break time range first.");
      return;
    }

    try {
      setCreateDeleting(true);
      setCreateErrors({});

      const currentResponse = await apiFetch(`/api/appointments/breaks?${new URLSearchParams({
        specialistId
      }).toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const currentData = await readApiResponseData(currentResponse);
      if (!currentResponse.ok) {
        setPlannerModalFormError(currentData?.message || "Failed to load existing breaks.");
        return;
      }

      const currentItems = Array.isArray(currentData?.items) ? currentData.items : [];
      const nextItems = currentItems.filter((item) => !(
        plannerBlockRepeatDaySet.has(String(item?.dayKey || getDayKeyFromDayOfWeekNumber(item?.dayOfWeek)).trim().toLowerCase())
        && String(item?.startTime || "").trim() === targetStartTime
        && String(item?.endTime || "").trim() === targetEndTime
        && (!targetBreakType || normalizeBreakTypeKey(item?.breakType || "") === targetBreakType)
      ));

      if (nextItems.length === currentItems.length) {
        setPlannerModalFormError("No matching break found for the selected specialist and time.");
        return;
      }

      const response = await apiFetch("/api/appointments/breaks", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          specialistId,
          items: nextItems
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setPlannerModalFormError(data?.message || "Failed to delete break.");
        return;
      }

      await refreshPlannerServerState();
      closeCreateModal();
    } finally {
      setCreateDeleting(false);
    }
  }

  async function handlePlannerWorkScheduleDelete() {
    const specialistId = String(createModal.specialistId || "").trim();
    if (!specialistId) {
      setCreateErrors({ specialistId: "Specialist is required." });
      return;
    }
    if (!canDeleteAppointmentWorkSchedule) {
      setPlannerModalFormError("You do not have permission to delete work schedule.");
      return;
    }
    if (!canMutateSpecialistId(specialistId)) {
      setCreateErrors({ specialistId: "You can only manage work schedule in your own planner." });
      return;
    }
    if (plannerBlockRepeatDayNumbers.length === 0) {
      setCreateErrors({ repeatDays: "Select at least one repeat day." });
      return;
    }

    try {
      setCreateDeleting(true);
      setCreateErrors({});

      const currentResponse = await apiFetch(`/api/appointments/work-schedule?${new URLSearchParams({
        userId: specialistId,
        ruleScope: "weekly"
      }).toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const currentData = await readApiResponseData(currentResponse);
      if (!currentResponse.ok) {
        setPlannerModalFormError(currentData?.message || "Failed to load current work schedule.");
        return;
      }

      const existingEntries = (Array.isArray(currentData?.items) ? currentData.items : []).filter((item) => (
        String(item?.ruleScope || "").trim().toLowerCase() === "weekly"
        && String(item?.userId || "").trim() === specialistId
        && plannerBlockRepeatDayNumbers.includes(Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10))
      ));

      if (existingEntries.length === 0) {
        setPlannerModalFormError("No matching work schedule found for the selected specialist and day.");
        return;
      }

      for (const existingEntry of existingEntries) {
        const response = await apiFetch(
          `/api/appointments/work-schedule/${encodeURIComponent(String(existingEntry?.id || "").trim())}`,
          {
            method: "DELETE"
          }
        );
        const data = await readApiResponseData(response);
        if (!response.ok) {
          setPlannerModalFormError(data?.message || "Failed to delete work schedule.");
          return;
        }
      }

      await refreshPlannerServerState();
      closeCreateModal();
    } finally {
      setCreateDeleting(false);
    }
  }

  function validateCreateForm(value, {
    isEditMode = false,
    allowRepeatValidationInEdit = false,
    requireRepeat = false
  } = {}) {
    const errors = {};
    const visibleRepeatDayKeySet = new Set(visibleRepeatDayKeys);
    const clientId = String(value.clientId || "").trim();
    const appointmentDate = String(value.appointmentDate || "").trim();
    const startTime = String(value.startTime || "").trim();
    const durationMinutes = Number.parseInt(String(value.durationMinutes || "").trim(), 10);
    const service = String(value.service || "").trim();
    const status = String(value.status || "pending").trim().toLowerCase();
    const note = String(value.note || "").trim();
    const repeatUntil = String(value.repeatUntil || "").trim();
    const repeatDays = Array.isArray(value.repeatDays)
      ? Array.from(
          new Set(
            value.repeatDays
              .map((day) => String(day || "").trim().toLowerCase())
              .filter((day) => visibleRepeatDayKeySet.has(day))
          )
        )
      : [];

    if (!clientId) {
      errors.clientId = "Client is required.";
    }
    if (!isValidDateYmd(appointmentDate)) {
      errors.appointmentDate = "Invalid appointment date.";
    }
    if (normalizeTimeToMinutes(startTime) === null) {
      errors.startTime = "Invalid start time.";
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      errors.durationMinutes = "Invalid duration.";
    }
    if (status === "confirmed" && isFutureDateYmd(appointmentDate)) {
      errors.status = "Future appointments cannot be confirmed.";
    }
    if (note.length > 255) {
      errors.note = "Note is too long.";
    }
    const shouldValidateRepeat = !isEditMode || allowRepeatValidationInEdit;
    if (shouldValidateRepeat) {
      const wantsRepeat = repeatDays.length > 0;
      if (requireRepeat && !wantsRepeat) {
        errors.repeatDays = "Select at least one repeat day.";
      }
      if (wantsRepeat) {
        if (!isValidDateYmd(repeatUntil)) {
          errors.repeatUntil = "Invalid repeat end date.";
        } else if (isValidDateYmd(appointmentDate) && repeatUntil < appointmentDate) {
          errors.repeatUntil = "Repeat end date must be on or after appointment date.";
        } else if (isValidDateYmd(appointmentDate)) {
          const start = new Date(`${appointmentDate}T00:00:00`);
          const end = new Date(`${repeatUntil}T00:00:00`);
          const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
          if (days > MAX_REPEAT_RANGE_DAYS) {
            errors.repeatUntil = "Repeat range is too long (max 366 days).";
          }
        }
      }
    }

    return errors;
  }

  async function handleCreateSubmit(event) {
    event.preventDefault();

    if (isPlannerBreakTab) {
      await handlePlannerBreakSubmit();
      return;
    }
    if (isPlannerWorkScheduleTab) {
      await handlePlannerWorkScheduleSubmit();
      return;
    }

    if (!createModal.open) {
      return;
    }
    const specialistId = String(createModal.specialistId || "").trim();
    if (!specialistId) {
      setCreateErrors({ specialistId: "Specialist is required." });
      return;
    }
    if (!isEditMode && !canCreateOnPlannerSpecialist(specialistId)) {
      setCreateErrors({
        form: canCreateAppointments
          ? "You can only create appointments in your own planner."
          : "You do not have permission to create appointments."
      });
      return;
    }
    if (isEditMode && !canUpdateAppointments) {
      setCreateErrors({ form: "You do not have permission to update appointments." });
      return;
    }
    try {
      setCreateSubmitting(true);
      setCreateErrors({});
      const visibleRepeatDayKeySet = new Set(visibleRepeatDayKeys);

      const nextPayload = {
        clientId: String(createForm.clientId || "").trim(),
        appointmentDate: String(createForm.appointmentDate || "").trim(),
        startTime: String(createForm.startTime || "").trim(),
        durationMinutes: String(createForm.durationMinutes || "").trim(),
        service: String(createForm.service || "").trim(),
        status: String(createForm.status || "pending").trim().toLowerCase(),
        note: String(createForm.note || "").trim(),
        editScope: isSpecialistLimitedEditMode ? "single" : normalizeEditScopeValue(createForm.editScope),
        repeatEnabled: Boolean(createForm.repeatEnabled),
        repeatUntil: String(createForm.repeatUntil || "").trim(),
        repeatDays: Array.isArray(createForm.repeatDays)
          ? Array.from(
              new Set(
                createForm.repeatDays
                  .map((day) => String(day || "").trim().toLowerCase())
                  .filter((day) => visibleRepeatDayKeySet.has(day))
              )
            )
          : []
      };
      if (!nextPayload.repeatEnabled) {
        if (!isEditMode) {
          nextPayload.repeatUntil = "";
        }
        nextPayload.repeatDays = [];
      } else if (nextPayload.repeatDays.length > 0) {
        nextPayload.repeatDays = ensureAnchoredRepeatDayKeys(
          nextPayload.appointmentDate,
          nextPayload.repeatDays,
          visibleRepeatDayKeys
        );
      }

      const allowRepeatValidationInEdit = isEditMode && (!isEditRecurring || nextPayload.editScope !== "single");
      const errors = validateCreateForm(nextPayload, {
        isEditMode,
        allowRepeatValidationInEdit,
        requireRepeat: (
          nextPayload.repeatEnabled
          && (!isEditMode || !isEditRecurring || nextPayload.editScope !== "single")
        )
      });
      if (Object.keys(errors).length > 0) {
        setCreateErrors(errors);
        return;
      }

      if (!canMutateSpecialistId(specialistId)) {
        setCreateErrors({
          specialistId: isEditMode
            ? "You can only edit appointments in your own planner."
            : "You can only create appointments in your own planner."
        });
        return;
      }
      if (!nextPayload.clientId) {
        setCreateErrors({ clientId: "Client is required." });
        return;
      }

      const appointmentDate = nextPayload.appointmentDate;
      const startTime = nextPayload.startTime;
      const startMinutes = normalizeTimeToMinutes(startTime);
      const durationMinutes = Number.parseInt(String(nextPayload.durationMinutes || "").trim(), 10);
      if (!appointmentDate || startMinutes === null) {
        setCreateErrors({ form: "Invalid slot. Please try again." });
        return;
      }
      if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
        setCreateErrors({ durationMinutes: "Invalid duration." });
        return;
      }
      const endTime = minutesToTime(startMinutes + durationMinutes);
      const shouldShowImmediateAlert = typeof onNotification === "function";
      const normalizedStatus = String(nextPayload.status || "").trim().toLowerCase();
      const shouldUseClientFocusedPreview = (
        isClientFocusedMode
        && canUseClientFocusedAvailabilityPreview
        && clientFocusedModalPreviewSpecialistId === specialistId
      );
      const localConflictAppointmentsByDay = shouldUseClientFocusedPreview
        ? clientFocusedPreviewAppointmentsByDay
        : rawAppointmentsByDay;
      const shouldCheckLocalConflict = (
        !isClientFocusedMode
        || String(selectedSpecialistId || "").trim() === specialistId
        || shouldUseClientFocusedPreview
      );
      if (ACTIVE_SCHEDULE_STATUSES.has(normalizedStatus) && shouldCheckLocalConflict) {
        if (shouldUseClientFocusedPreview) {
          const workingHoursConflictMessage = getPlannerWorkingHoursConflictMessage(
            clientFocusedPreviewSettings,
            appointmentDate,
            startTime,
            endTime
          );
          if (workingHoursConflictMessage) {
            setCreateErrors({ form: workingHoursConflictMessage });
            setMessage(workingHoursConflictMessage);
            if (shouldShowImmediateAlert) {
              showImmediateAlert(workingHoursConflictMessage);
            }
            return;
          }

          const blockedTimeConflictReason = findPlannerBlockedTimeConflict(
            clientFocusedPreviewSettings?.blockedTimes,
            appointmentDate,
            startTime,
            endTime
          );
          if (blockedTimeConflictReason) {
            const blockedTimeConflictMessage = `Selected time overlaps blocked time: ${blockedTimeConflictReason}.`;
            setCreateErrors({ form: blockedTimeConflictMessage });
            setMessage(blockedTimeConflictMessage);
            if (shouldShowImmediateAlert) {
              showImmediateAlert(blockedTimeConflictMessage);
            }
            return;
          }

          const breakConflictReason = findPlannerBreakConflict(
            clientFocusedPreviewBreaks,
            appointmentDate,
            startTime,
            endTime
          );
          if (breakConflictReason) {
            const breakConflictMessage = `Selected time overlaps specialist break: ${breakConflictReason}.`;
            setCreateErrors({ form: breakConflictMessage });
            setMessage(breakConflictMessage);
            if (shouldShowImmediateAlert) {
              showImmediateAlert(breakConflictMessage);
            }
            return;
          }

          const absenceConflictReason = findPlannerAbsenceConflict(
            clientFocusedPreviewAbsences,
            appointmentDate,
            startTime,
            endTime
          );
          if (absenceConflictReason) {
            const absenceConflictMessage = `Selected time overlaps specialist absence: ${absenceConflictReason}.`;
            setCreateErrors({ form: absenceConflictMessage });
            setMessage(absenceConflictMessage);
            if (shouldShowImmediateAlert) {
              showImmediateAlert(absenceConflictMessage);
            }
            return;
          }
        }

        const localConflict = findLocalScheduleConflict({
          appointmentDate,
          startTime,
          endTime,
          excludeAppointmentId: isEditMode ? String(createModal.appointmentId || "").trim() : "",
          appointmentsByDay: localConflictAppointmentsByDay
        });
        if (localConflict) {
          const localConflictTime = [localConflict.startTime, localConflict.endTime].filter(Boolean).join(" - ");
          const localConflictClient = localConflict.client ? ` (${localConflict.client})` : "";
          const conflictMessage = localConflictTime
            ? `This slot is already occupied at ${localConflictTime}${localConflictClient}.`
            : "This slot is already occupied.";
          setCreateErrors({ form: conflictMessage });
          setMessage(conflictMessage);
          if (shouldShowImmediateAlert) {
            showImmediateAlert(conflictMessage);
          }
          return;
        }
      }

      const requestPayload = {
        specialistId,
        clientId: nextPayload.clientId,
        appointmentDate,
        startTime,
        endTime,
        durationMinutes: String(durationMinutes),
        service: nextPayload.service || DEFAULT_APPOINTMENT_SERVICE_NAME,
        status: nextPayload.status,
        note: nextPayload.note
      };
      const shouldSendRepeat = (
        nextPayload.repeatEnabled
        && nextPayload.repeatDays.length > 0
        && (!isEditMode || !isEditRecurring || nextPayload.editScope !== "single")
      );
      if (shouldSendRepeat) {
        requestPayload.repeat = {
          enabled: true,
          type: "weekly",
          untilDate: nextPayload.repeatUntil,
          dayKeys: nextPayload.repeatDays,
          skipConflicts: true,
          autoRolling: true
        };
      }

      let requestUrl = "/api/appointments/schedules";
      if (isEditMode) {
        const queryParams = new URLSearchParams({
          scope: String(nextPayload.editScope || "single")
        });
        if (isEditRecurring && nextPayload.editScope === "single") {
          const singleDayKeys = normalizeRepeatDayKeys([selectedSingleRecurringEditDayKey]);
          if (singleDayKeys.length > 0) {
            queryParams.set("dayKeys", singleDayKeys.join(","));
          }
        }
        requestUrl = `/api/appointments/schedules/${encodeURIComponent(String(createModal.appointmentId || ""))}?${queryParams.toString()}`;
      }
      const requestMethod = isEditMode ? "PATCH" : "POST";

      const response = await apiFetch(requestUrl, {
        method: requestMethod,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestPayload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        const serverMessage = String(data?.message || "").trim();
        if (response.status === 409 && serverMessage) {
          setMessage(serverMessage);
          if (shouldShowImmediateAlert) {
            showImmediateAlert(serverMessage);
          }
        }
        if (data?.errors && typeof data.errors === "object") {
          setCreateErrors(data.errors);
        } else if (data?.field) {
          setCreateErrors({ [data.field]: data.message || "Invalid value." });
        } else {
          setCreateErrors({ form: data?.message || "Failed to save appointment." });
        }
        return;
      }

      await refreshPlannerServerState();
      setMessage("");
      closeCreateModal();
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleDeleteAppointment() {
    if (!createModal.open || createModal.mode !== "edit") {
      return;
    }
    const targetSpecialistId = String(createModal.specialistId || "").trim();
    if (!canMutateSpecialistId(targetSpecialistId)) {
      setCreateErrors({ form: "You can only edit appointments in your own planner." });
      return;
    }
    if (!canDeleteAppointments) {
      setCreateErrors({ form: "You do not have permission to delete appointments." });
      return;
    }

    const appointmentId = String(createModal.appointmentId || "").trim();
    if (!appointmentId) {
      setCreateErrors({ form: "Invalid appointment id." });
      return;
    }

    try {
      setCreateDeleting(true);
      setCreateErrors({});

      const deleteScope = isSpecialistLimitedEditMode ? "single" : normalizeEditScopeValue(createForm.editScope);
      const queryParams = new URLSearchParams({ scope: deleteScope });
      if (isEditRecurring && (deleteScope === "future" || deleteScope === "single")) {
        const deleteDayKeys = deleteScope === "single"
          ? normalizeRepeatDayKeys([selectedSingleRecurringEditDayKey])
          : normalizeRepeatDayKeys(createForm.repeatDays);
        if (deleteDayKeys.length > 0) {
          queryParams.set("dayKeys", deleteDayKeys.join(","));
        }
      }
      const query = queryParams.toString();
      const response = await apiFetch(`/api/appointments/schedules/${encodeURIComponent(appointmentId)}?${query}`, {
        method: "DELETE"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        setCreateErrors({ form: data?.message || "Failed to delete appointment." });
        return;
      }

      await refreshPlannerServerState();
      setMessage("");
      closeCreateModal();
    } catch {
      setCreateErrors({ form: "Failed to delete appointment." });
    } finally {
      setCreateDeleting(false);
    }
  }

  function updateDayBulkSelectedIds(nextSelectedIds) {
    setDayBulkModal((prev) => ({
      ...prev,
      selectedIds: Array.from(new Set((Array.isArray(nextSelectedIds) ? nextSelectedIds : []).map((id) => String(id || "").trim()).filter(Boolean))),
      error: ""
    }));
  }

  function toggleDayBulkItem(itemId) {
    const normalizedId = String(itemId || "").trim();
    if (!normalizedId) {
      return;
    }
    setDayBulkModal((prev) => {
      const selectedSet = new Set(prev.selectedIds);
      if (selectedSet.has(normalizedId)) {
        selectedSet.delete(normalizedId);
      } else {
        selectedSet.add(normalizedId);
      }
      return {
        ...prev,
        selectedIds: Array.from(selectedSet),
        error: ""
      };
    });
  }

  function getDayBulkSelectedItems() {
    const selectedSet = new Set(dayBulkModal.selectedIds);
    return dayBulkModal.items.filter((item) => selectedSet.has(String(item?.id || "").trim()));
  }

  async function handleDayBulkEditSubmit(event) {
    event.preventDefault();
    const selectedItems = getDayBulkSelectedItems();
    if (selectedItems.length === 0) {
      setDayBulkModal((prev) => ({ ...prev, error: "Select at least one appointment." }));
      return;
    }
    if (!canUpdateAppointments) {
      setDayBulkModal((prev) => ({ ...prev, error: "You do not have permission to update appointments." }));
      return;
    }

    const nextStatus = String(dayBulkModal.status || "cancelled").trim().toLowerCase();
    const nextNote = String(dayBulkModal.note || "").trim();
    if (nextNote.length > 255) {
      setDayBulkModal((prev) => ({ ...prev, error: "Note is too long." }));
      return;
    }

    try {
      setDayBulkModal((prev) => ({ ...prev, submitting: true, error: "" }));
      for (const item of selectedItems) {
        const startTime = String(item?.startTime || item?.time || "").trim();
        const durationMinutes = Number.parseInt(String(item?.durationMinutes || "").trim(), 10)
          || getDurationMinutesFromTimes(startTime, item?.endTime)
          || 30;
        const startMinutes = normalizeTimeToMinutes(startTime);
        const endTime = String(item?.endTime || (startMinutes === null ? "" : minutesToTime(startMinutes + durationMinutes))).trim();
        const queryParams = new URLSearchParams({ scope: "single" });
        const dayKey = getDayKeyFromDateYmd(item?.appointmentDate);
        if (String(item?.repeatType || "").trim().toLowerCase() === "weekly" && dayKey) {
          queryParams.set("dayKeys", dayKey);
        }
        const response = await apiFetch(
          `/api/appointments/schedules/${encodeURIComponent(String(item.id || "").trim())}?${queryParams.toString()}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              specialistId: String(item.specialistId || "").trim(),
              clientId: String(item.clientId || "").trim(),
              appointmentDate: String(item.appointmentDate || dayBulkModal.appointmentDate || "").trim(),
              startTime,
              endTime,
              durationMinutes: String(durationMinutes),
              service: String(item.service || DEFAULT_APPOINTMENT_SERVICE_NAME).trim() || DEFAULT_APPOINTMENT_SERVICE_NAME,
              status: nextStatus,
              note: nextNote || String(item.note || "").trim()
            })
          }
        );
        const data = await readApiResponseData(response);
        if (!response.ok) {
          throw new Error(String(data?.message || "Failed to update selected appointments.").trim());
        }
      }
      await refreshPlannerServerState();
      closeDayBulkModal();
    } catch (error) {
      setDayBulkModal((prev) => ({
        ...prev,
        submitting: false,
        error: String(error?.message || "Failed to update selected appointments.").trim()
      }));
    }
  }

  async function handleDayBulkDelete() {
    const selectedItems = getDayBulkSelectedItems();
    if (selectedItems.length === 0) {
      setDayBulkModal((prev) => ({ ...prev, error: "Select at least one appointment." }));
      return;
    }
    if (!canDeleteAppointments) {
      setDayBulkModal((prev) => ({ ...prev, error: "You do not have permission to delete appointments." }));
      return;
    }

    try {
      setDayBulkModal((prev) => ({ ...prev, deleting: true, error: "" }));
      for (const item of selectedItems) {
        const queryParams = new URLSearchParams({ scope: "single" });
        const dayKey = getDayKeyFromDateYmd(item?.appointmentDate);
        if (String(item?.repeatType || "").trim().toLowerCase() === "weekly" && dayKey) {
          queryParams.set("dayKeys", dayKey);
        }
        const response = await apiFetch(
          `/api/appointments/schedules/${encodeURIComponent(String(item.id || "").trim())}?${queryParams.toString()}`,
          { method: "DELETE" }
        );
        const data = await readApiResponseData(response);
        if (!response.ok) {
          throw new Error(String(data?.message || "Failed to delete selected appointments.").trim());
        }
      }
      await refreshPlannerServerState();
      closeDayBulkModal();
    } catch (error) {
      setDayBulkModal((prev) => ({
        ...prev,
        deleting: false,
        error: String(error?.message || "Failed to delete selected appointments.").trim()
      }));
    }
  }

  function toggleRepeatDay(dayKey) {
    const normalizedDayKey = String(dayKey || "").trim().toLowerCase();
    if (!visibleRepeatDayKeys.includes(normalizedDayKey)) {
      return;
    }
    const appointmentDayKey = getDayKeyFromDateYmd(createForm.appointmentDate);
    if (isEditRecurring && normalizedEditScope === "single") {
      if (
        allowedSingleRecurringEditDayKeys.length > 0
        && !allowedSingleRecurringEditDayKeys.includes(normalizedDayKey)
      ) {
        return;
      }
      setCreateForm((prev) => ({ ...prev, repeatDays: [normalizedDayKey] }));
      if (createErrors.repeatDays) {
        setCreateErrors((prev) => ({ ...prev, repeatDays: "" }));
      }
      return;
    }

    setCreateForm((prev) => {
      const currentDays = Array.isArray(prev.repeatDays)
        ? prev.repeatDays.map((day) => String(day || "").trim().toLowerCase()).filter((day) => DAY_KEYS_SET.has(day))
        : [];
      const daySet = new Set(currentDays);
      if (daySet.has(normalizedDayKey)) {
        if (!isEditMode && normalizedDayKey === appointmentDayKey && currentDays.length > 1) {
          return prev;
        }
        daySet.delete(normalizedDayKey);
      } else {
        daySet.add(normalizedDayKey);
        if (!isEditMode && appointmentDayKey && normalizedDayKey !== appointmentDayKey) {
          daySet.add(appointmentDayKey);
        }
      }

      return {
        ...prev,
        repeatEnabled: prev.repeatEnabled,
        repeatDays: visibleRepeatDayKeys.filter((key) => daySet.has(key))
      };
    });

    if (createErrors.repeatDays) {
      setCreateErrors((prev) => ({ ...prev, repeatDays: "" }));
    }
  }

  function handleSingleEntryModeToggle(nextSingleEntryMode) {
    if (!canToggleSingleEntryMode) {
      return;
    }

    setCreateForm((prev) => {
      const appointmentDate = String(prev.appointmentDate || "").trim();
      if (nextSingleEntryMode) {
        recurringPatternDraftRef.current = {
          repeatUntil: String(prev.repeatUntil || "").trim(),
          repeatDays: normalizeRepeatDayKeys(prev.repeatDays)
        };
        return {
          ...prev,
          repeatEnabled: false
        };
      }

      const appointmentDayKey = getDayKeyFromDateYmd(appointmentDate);
      const snapshotRepeatDays = normalizeRepeatDayKeys(recurringPatternDraftRef.current?.repeatDays);
      const restoredRepeatDaysBase = snapshotRepeatDays.length > 0
        ? snapshotRepeatDays
        : (appointmentDayKey && visibleRepeatDayKeys.includes(appointmentDayKey) ? [appointmentDayKey] : []);
      const restoredRepeatDays = restoredRepeatDaysBase.length > 0
        ? ensureAnchoredRepeatDayKeys(appointmentDate, restoredRepeatDaysBase, visibleRepeatDayKeys)
        : [];
      let restoredRepeatUntil = String(recurringPatternDraftRef.current?.repeatUntil || "").trim();
      if (
        !isValidDateYmd(restoredRepeatUntil)
        || (isValidDateYmd(appointmentDate) && restoredRepeatUntil < appointmentDate)
      ) {
        restoredRepeatUntil = getDefaultRepeatUntilDate(appointmentDate);
      }

      return {
        ...prev,
        repeatEnabled: true,
        repeatUntil: restoredRepeatUntil,
        repeatDays: restoredRepeatDays
      };
    });

    if (createErrors.repeatDays || createErrors.repeatUntil) {
      setCreateErrors((prev) => ({ ...prev, repeatDays: "", repeatUntil: "" }));
    }
  }

  useEffect(() => {
    document.body.style.overflow = (createModal.open || dayBulkModal.open) ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [createModal.open, dayBulkModal.open]);

  useEffect(() => {
    if (!createModal.open) {
      return;
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        if (createSubmitting || createDeleting) {
          return;
        }
        closeCreateModal();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [createDeleting, createModal.open, createSubmitting]);

  const canMutateModalSpecialist = canMutateSpecialistId(createModal.specialistId);

  useEffect(() => {
    const text = String(message || "").trim();
    if (!text) {
      return;
    }

    if (typeof onNotification === "function") {
      onNotification(text);
      setMessage("");
      return;
    }

    setMessage("");
  }, [message, onNotification]);
  const canCurrentUserConfirmVipPending = useCallback((row) => {
    if (!vipOnly || !canUpdateAppointments) {
      return false;
    }
    const userId = String(normalizedCurrentUserId || "").trim();
    if (!userId) {
      return false;
    }
    const teacherId = String(row?.teacherId || selectedVipClassTeacherId || "").trim();
    const tutorId = String(row?.tutorId || "").trim();
    const isAssignedTeacherOrTutor = (teacherId && teacherId === userId) || (tutorId && tutorId === userId);
    if (isAssignedTeacherOrTutor) {
      return true;
    }

    // Admin-level users can confirm when they have update access.
    return !restrictCreateToOwnSpecialist;
  }, [
    canUpdateAppointments,
    normalizedCurrentUserId,
    restrictCreateToOwnSpecialist,
    selectedVipClassTeacherId,
    vipOnly
  ]);

  const confirmVipPendingAppointment = useCallback(async (item, row) => {
    if (!canCurrentUserConfirmVipPending(row)) {
      return;
    }
    if (String(item?.status || "").trim().toLowerCase() !== "pending") {
      return;
    }

    const appointmentId = String(item?.appointmentId || item?.id || "").trim();
    const specialistId = String(item?.specialistId || "").trim();
    const clientId = String(item?.clientId || "").trim();
    const appointmentDate = String(item?.appointmentDate || "").trim();
    const startTime = String(item?.startTime || "").trim();
    const endTime = String(item?.endTime || "").trim();
    const serviceName = String(item?.serviceName || "").trim() || "Service";
    const durationMinutes = String(item?.durationMinutes || "").trim() || getDurationMinutesFromTimes(startTime, endTime);
    const note = String(item?.note || "").trim();

    if (!appointmentId || !specialistId || !clientId || !appointmentDate || !startTime || !endTime || !durationMinutes) {
      setMessage("Failed to confirm lesson.");
      return;
    }
    if (vipConfirmingByAppointmentId[appointmentId]) {
      return;
    }

    try {
      setVipConfirmingByAppointmentId((prev) => ({
        ...prev,
        [appointmentId]: true
      }));

      const response = await apiFetch(
        `/api/appointments/schedules/${encodeURIComponent(appointmentId)}?scope=single`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            specialistId,
            clientId,
            appointmentDate,
            startTime,
            endTime,
            durationMinutes,
            service: serviceName,
            status: "confirmed",
            note
          })
        }
      );
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(String(data?.message || "Failed to confirm lesson.").trim());
        return;
      }

      await loadSchedulesForCurrentWeek();
      setMessage(String(data?.message || "Lesson confirmed.").trim());
    } catch {
      setMessage("Failed to confirm lesson.");
    } finally {
      setVipConfirmingByAppointmentId((prev) => {
        const next = { ...prev };
        delete next[appointmentId];
        return next;
      });
    }
  }, [canCurrentUserConfirmVipPending, loadSchedulesForCurrentWeek, vipConfirmingByAppointmentId]);

  return (
    <section className={`appointment-scheduler${vipOnly ? " is-vip-schedule" : ""}`} aria-label="Appointment planner">
      <div className="appointment-toolbar">
        <div className="appointment-toolbar-block">
          <div className="appointment-specialist-control">
            <span className="appointment-toolbar-label">{specialistLabel}</span>
            <div className="appointment-specialist-select-wrap">
              <CustomSelect
                id="appointmentSpecialistSelect"
                placeholder={specialistSelectPlaceholder}
                value={selectedSpecialistId}
                options={specialistOptions}
                searchable
                searchPlaceholder={specialistSearchPlaceholder}
                searchThreshold={20}
                maxVisibleOptions={10}
                error={specialistSelectError}
                onChange={(nextValue) => {
                  const nextSpecialistId = String(nextValue || "").trim();
                  persistPlannerToolbarSelectionSync({ specialistId: nextSpecialistId });
                  setWeekOffset(0);
                  if (nextSpecialistId) {
                    setPlannerPrimaryFilterMode("specialist");
                  } else if (!nextSpecialistId && String(selectedPlannerClientFilterId || "").trim()) {
                    setPlannerPrimaryFilterMode("client");
                  }
                  setSelectedSpecialistId(nextSpecialistId);
                  if (specialistSelectError) {
                    setSpecialistSelectError(false);
                  }
                }}
              />
              <button
                type="button"
                className="appointment-toolbar-clear-btn"
                aria-label={`Clear ${specialistLabel}`}
                title={`Clear ${specialistLabel}`}
                disabled={!selectedSpecialistId}
                onClick={clearPlannerSpecialistSelection}
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {!vipOnly ? (
          <div className="appointment-toolbar-block">
            <div className="appointment-specialist-control">
              <span className="appointment-toolbar-label">Client</span>
              <div className="appointment-specialist-select-wrap">
                <CustomSelect
                  id="appointmentPlannerClientFilterSelect"
                  placeholder="Select client"
                  value={selectedPlannerClientFilterId}
                  options={plannerClientActiveOptions}
                  searchable
                  searchPlaceholder="Search by name or ID"
                  searchThreshold={0}
                  maxVisibleOptions={10}
                  onSearchChange={setPlannerClientSearch}
                  emptyText={getPlannerClientSearchEmptyText(plannerClientSearch)}
                  onChange={(nextValue) => {
                    const nextClientId = String(nextValue || "").trim();
                    const matchedClientOption = plannerClientActiveOptions.find(
                      (option) => String(option?.value || "").trim() === nextClientId
                    );
                    const nextClientSnapshot = nextClientId
                      ? normalizePlannerStoredClientSnapshot(
                          plannerClientSearchMap[nextClientId]
                          || (Array.isArray(plannerFilterClients) ? plannerFilterClients : []).find(
                            (client) => String(client?.id || "").trim() === nextClientId
                          )
                          || (
                            matchedClientOption
                              ? {
                                  id: nextClientId,
                                  displayName: String(matchedClientOption?.label || "").trim()
                                }
                              : null
                          )
                        )
                      : null;
                    persistPlannerToolbarSelectionSync({
                      clientId: nextClientId,
                      clientSnapshot: nextClientSnapshot
                    });
                    setWeekOffset(0);
                    if (nextClientId) {
                      setPlannerPrimaryFilterMode("client");
                    } else if (!nextClientId && String(selectedSpecialistId || "").trim()) {
                      setPlannerPrimaryFilterMode("specialist");
                    }
                    setSelectedPlannerClientFilterId(nextClientId);
                    setStoredPlannerClientSnapshot(nextClientSnapshot);
                  }}
                />
                <button
                  type="button"
                  className="appointment-toolbar-clear-btn"
                  aria-label="Clear client"
                  title="Clear client"
                  disabled={!normalizedSelectedPlannerClientFilterId}
                  onClick={clearPlannerClientSelection}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {vipOnly ? (
          <div className="appointment-toolbar-block">
            <div className="appointment-specialist-control">
              <span className="appointment-toolbar-label">Child</span>
              <div className="appointment-specialist-select-wrap">
                <CustomSelect
                  id="appointmentVipClientFilterSelect"
                  placeholder="All"
                  value={selectedVipClientFilterId}
                  options={vipClientFilterOptions}
                  searchable
                  searchPlaceholder="Search child"
                  searchThreshold={8}
                  maxVisibleOptions={10}
                  disabled={!selectedSpecialistId || vipClientFilterOptions.length <= 1}
                  onChange={(nextValue) => {
                    setSelectedVipClientFilterId(String(nextValue || "").trim());
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {showWeekSwitcher ? (
          <div className="appointment-toolbar-block appointment-week-switcher">
            <button type="button" className="header-btn" onClick={() => setWeekOffset((prev) => prev - 1)}>
              Prev
            </button>
            <p className="appointment-week-range">{formatWeekRange(weekDays, { compact: compactWeekRange })}</p>
            <button type="button" className="header-btn" onClick={() => setWeekOffset((prev) => prev + 1)}>
              Next
            </button>
          </div>
        ) : null}

      </div>

      {canRenderPlannerData ? (
        vipOnly ? (
          <>
            <div
              className="appointment-vip-weekly-grid-wrap"
              key={weekRenderKey}
              hidden={!selectedSpecialistId || vipWeeklyClientRows.length === 0}
            >
              <table
                className="appointment-vip-weekly-grid"
                aria-label="VIP class weekly schedule table"
                style={{ minWidth: `${Math.max(900, Math.max(1, weekDays.length) * 180)}px` }}
              >
                <thead>
                  <tr>
                    {weekDays.map((day) => {
                      const dayHeaderClassName = isSameDate(day.date, now) ? "appointment-day-is-today" : undefined;
                      return (
                        <th key={day.key} className={dayHeaderClassName}>
                          <div className="appointment-day-head">
                            <span>{day.label}</span>
                            <small>{formatHeaderDate(day.date)}</small>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {vipWeeklyClientRows.map((row) => (
                    <tr key={row.clientId}>
                      <td className="appointment-vip-client-wrap-cell" colSpan={weekDays.length}>
                        <div className="appointment-vip-client-wrap">
                          <p className="appointment-vip-client-name">{row.clientName || "-"}</p>
                          <div
                            className="appointment-vip-client-days-grid"
                            style={{ gridTemplateColumns: `repeat(${Math.max(1, weekDays.length)}, minmax(0, 1fr))` }}
                          >
                            {weekDays.map((day) => {
                              const dayItems = Array.isArray(row?.dayItemsByKey?.[day.key])
                                ? row.dayItemsByKey[day.key]
                                : [];
                              const dayCellClassName = [
                                "appointment-vip-client-day",
                                isSameDate(day.date, now) ? "appointment-day-is-today" : ""
                              ].filter(Boolean).join(" ") || undefined;

                              return (
                                <div key={`${row.clientId}-${day.key}`} className={dayCellClassName}>
                                  {dayItems.length > 0 ? (
                                    <div className="appointment-vip-weekly-list">
                                      {dayItems.map((item) => {
                                        const cardStatusClassName = (
                                          item.status === "confirmed"
                                          || item.status === "pending"
                                          || item.status === "cancelled"
                                          || item.status === "no-show"
                                        )
                                          ? `appointment-status-${item.status}`
                                          : "";
                                        const statusLabel = formatAppointmentStatusLabel(item.status);
                                        const isPending = item.status === "pending";
                                        const canConfirmPending = isPending && canCurrentUserConfirmVipPending(row);
                                        const itemIdKey = String(item?.appointmentId || item?.id || "").trim();
                                        const isConfirming = Boolean(itemIdKey && vipConfirmingByAppointmentId[itemIdKey]);
                                        const cardClassName = [
                                          "appointment-vip-weekly-card",
                                          cardStatusClassName,
                                          canConfirmPending ? "appointment-vip-pending-confirmable" : "",
                                          isConfirming ? "is-loading" : ""
                                        ].filter(Boolean).join(" ");
                                        const statusClassName = [
                                          "appointment-vip-weekly-status",
                                          cardStatusClassName ? `appointment-vip-weekly-status-${item.status}` : ""
                                        ].filter(Boolean).join(" ");
                                        return (
                                          <article
                                            key={item.id}
                                            className={cardClassName}
                                            onDoubleClick={canConfirmPending && !isConfirming ? () => confirmVipPendingAppointment(item, row) : undefined}
                                            title={canConfirmPending ? "Double-click to confirm attendance" : undefined}
                                          >
                                            <div className="appointment-vip-weekly-row appointment-vip-weekly-row-top">
                                              <p className="appointment-vip-weekly-primary">{item.primaryText || "-"}</p>
                                              <p className={statusClassName}>{isConfirming ? "Saving..." : statusLabel}</p>
                                            </div>
                                            <div className="appointment-vip-weekly-row appointment-vip-weekly-row-bottom">
                                              <p className="appointment-vip-weekly-time">{item.timeLabel || "-"}</p>
                                              <p className="appointment-vip-weekly-secondary">{item.secondaryText || "-"}</p>
                                            </div>
                                          </article>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="appointment-vip-weekly-empty">-</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
        isClientFocusedMode ? (
          <>
            <AppointmentPlannerGrid
              sectionTitle=""
              ariaLabel={clientFocusedPlannerAriaLabel}
              weekStartDate={weekStartDate}
              settings={settings}
              rawAppointmentsByDay={clientFocusedAppointmentsByDay}
              overlayAppointmentsByDay={comparisonOverlayAppointmentsByDay}
              overlayLabel={comparisonOverlayLabel}
              selectedClientId={normalizedSelectedPlannerClientFilterId}
              breaksForSpecialist={breaksForSpecialist}
              blockedTimesForSpecialist={blockedTimesForSpecialist}
              absencesForSpecialist={absencesForSpecialist}
              slotCellHeightPx={slotCellHeightPx}
              now={now}
              canCreateOnSpecialist={canOpenClientFocusedCreateModal}
              canUpdateAppointments={canUpdateAppointments}
              canDeleteAppointments={canDeleteAppointments}
              canUpdateAppointmentBreaks={canUpdateAppointmentBreaks}
              canUpdateAppointmentWorkSchedule={canUpdateAppointmentWorkSchedule}
              canDeleteAppointmentWorkSchedule={canDeleteAppointmentWorkSchedule}
              canMutatePlannerSpecialist={canUpdateAppointments || canDeleteAppointments}
              canMutateAppointmentSpecialist={canMutateAppointmentSpecialist}
              onOpenCreateModal={openCreateModal}
              onMoveAppointment={moveAppointmentToSlot}
              onOpenDayBulkModal={openDayBulkModal}
              onOpenPlannerBlockModal={openPlannerBlockModal}
              cardDisplayMode="client"
              wrapperClassName="appointment-grid-wrap-client"
            />
          </>
        ) : (
          <AppointmentPlannerGrid
            key={weekRenderKey}
            sectionTitle=""
            ariaLabel="Appointment week table"
            weekStartDate={weekStartDate}
            settings={settings}
            rawAppointmentsByDay={rawAppointmentsByDay}
            overlayAppointmentsByDay={comparisonOverlayAppointmentsByDay}
            overlayLabel={comparisonOverlayLabel}
            breaksForSpecialist={breaksForSpecialist}
            blockedTimesForSpecialist={blockedTimesForSpecialist}
            absencesForSpecialist={absencesForSpecialist}
            slotCellHeightPx={slotCellHeightPx}
            now={now}
            canCreateOnSpecialist={canCreateOnPlannerSpecialist(selectedSpecialistId)}
            canUpdateAppointments={canUpdateAppointments}
            canDeleteAppointments={canDeleteAppointments}
            canUpdateAppointmentBreaks={canUpdateAppointmentBreaks}
            canUpdateAppointmentWorkSchedule={canUpdateAppointmentWorkSchedule}
            canDeleteAppointmentWorkSchedule={canDeleteAppointmentWorkSchedule}
            canMutatePlannerSpecialist={canMutateSpecialistId(selectedSpecialistId)}
            canMutateAppointmentSpecialist={canMutateAppointmentSpecialist}
            onOpenCreateModal={openCreateModal}
            onMoveAppointment={moveAppointmentToSlot}
            onMovePlannerBreak={movePlannerBreakToSlot}
            onOpenDayBulkModal={openDayBulkModal}
            onOpenPlannerBlockModal={openPlannerBlockModal}
          />
        )
        )
      ) : (
        vipOnly ? (
          <div className="appointment-vip-weekly-grid-wrap" aria-hidden="true">
            <table
              className="appointment-vip-weekly-grid"
              style={{ minWidth: `${Math.max(900, SKEL_DAYS.length * 180)}px` }}
            >
              <thead>
                <tr>
                  {SKEL_DAYS.map((d) => (
                    <th key={d}>
                      <div className="appointment-day-head">
                        <div className="skel skel-day-name" />
                        <div className="skel skel-day-date" />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {VIP_SKEL_ROWS.map((row, i) => (
                  <tr key={i}>
                    <td className="appointment-vip-client-wrap-cell" colSpan={SKEL_DAYS.length}>
                      <div className="appointment-vip-client-wrap">
                        <div className="skel skel-vip-client-name" />
                        <div
                          className="appointment-vip-client-days-grid"
                          style={{ gridTemplateColumns: `repeat(${SKEL_DAYS.length}, minmax(0, 1fr))` }}
                        >
                          {row.c.map((has, j) => (
                            <div key={j} className="appointment-vip-client-day">
                              {has ? (
                                <div className="appointment-vip-weekly-list">
                                  <div className="skel skel-vip-card" />
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="appointment-grid-wrap" aria-hidden="true">
            <table className="appointment-grid">
              <thead>
                <tr>
                  <th className="appointment-time-col">
                    <div className="skel skel-time-head" />
                  </th>
                  {SKEL_DAYS.map((d) => (
                    <th key={d} className="appointment-day-head-col-gap">
                      <div className="appointment-day-head">
                        <div className="skel skel-day-name" />
                        <div className="skel skel-day-date" />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SKEL_ROWS.map((row, i) => (
                  <tr key={i}>
                    <th className="appointment-time-col">
                      {row.t ? <div className="skel skel-time" /> : null}
                    </th>
                    {row.c.map((has, j) => (
                      <td key={j} className="appointment-day-col-gap skel-cell">
                        {has ? <div className="skel skel-appt" /> : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {dayBulkModal.open && !vipOnly && (() => {
        const selectedSet = new Set(dayBulkModal.selectedIds);
        const allSelected = dayBulkModal.items.length > 0 && dayBulkModal.items.every((item) => selectedSet.has(String(item.id || "").trim()));
        const modalContent = (
          <>
          <section className="logout-confirm-modal appointment-create-modal appointment-day-bulk-modal">
            <div className="appointment-create-head appointment-day-bulk-head">
              <h2>{dayBulkModal.dayLabel || "Day"} appointments</h2>
              <button
                type="button"
                className="header-btn panel-close-btn appointment-create-close-btn"
                aria-label="Close Day Planner"
                onClick={closeDayBulkModal}
                disabled={dayBulkModal.submitting || dayBulkModal.deleting}
              >
                ×
              </button>
            </div>
            <form className="auth-form appointment-create-form" noValidate onSubmit={handleDayBulkEditSubmit}>
              <div className="appointment-modal-section appointment-day-bulk-list-section">
                <div className="appointment-day-bulk-toolbar">
                  <label className="appointment-day-bulk-check-all">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={dayBulkModal.submitting || dayBulkModal.deleting}
                      onChange={(event) => {
                        updateDayBulkSelectedIds(
                          event.currentTarget.checked
                            ? dayBulkModal.items.map((item) => item.id)
                            : []
                        );
                      }}
                    />
                    <span>All</span>
                  </label>
                  <span className="appointment-day-bulk-count">
                    {dayBulkModal.selectedIds.length} / {dayBulkModal.items.length}
                  </span>
                </div>
                <div className="appointment-day-bulk-list">
                  {dayBulkModal.items.map((item) => {
                    const itemId = String(item.id || "").trim();
                    const checked = selectedSet.has(itemId);
                    const timeText = formatAppointmentTimeRangeLabel(item.startTime || item.time, item.endTime, item.durationMinutes);
                    const participantText = String(
                      dayBulkModal.displayMode === "specialist"
                        ? (item.specialist || item.specialistName || `Specialist #${item.specialistId || ""}`)
                        : (item.client || item.clientName || `Client #${item.clientId || ""}`)
                    ).trim();
                    const serviceText = String(item.service || DEFAULT_APPOINTMENT_SERVICE_NAME).trim();
                    return (
                      <label key={itemId} className={`appointment-day-bulk-item${checked ? " is-selected" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={dayBulkModal.submitting || dayBulkModal.deleting}
                          onChange={() => toggleDayBulkItem(itemId)}
                        />
                        <span className={`appointment-day-bulk-status appointment-status-cell-${String(item.status || "pending").replace(/_/g, "-")}`} />
                        <span className="appointment-day-bulk-main">
                          <strong>{timeText || item.startTime}</strong>
                          <span>{participantText}</span>
                        </span>
                        <span className="appointment-day-bulk-meta">{serviceText}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="appointment-modal-section appointment-day-bulk-edit-section">
                <div className="appointment-create-date-time-row">
                  <div className="field">
                    <label htmlFor="appointmentDayBulkStatus">Status</label>
                    <CustomSelect
                      id="appointmentDayBulkStatus"
                      value={dayBulkModal.status}
                      options={STATUS_OPTIONS}
                      menuPortal
                      forceOpenUp={compactWeekRange}
                      disabled={dayBulkModal.submitting || dayBulkModal.deleting}
                      onChange={(nextValue) => {
                        setDayBulkModal((prev) => ({
                          ...prev,
                          status: String(nextValue || "cancelled").trim().toLowerCase(),
                          error: ""
                        }));
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="appointmentDayBulkNote">Note</label>
                    <input
                      id="appointmentDayBulkNote"
                      type="text"
                      value={dayBulkModal.note}
                      disabled={dayBulkModal.submitting || dayBulkModal.deleting}
                      onInput={(event) => {
                        const nextValue = event.currentTarget.value;
                        setDayBulkModal((prev) => ({ ...prev, note: nextValue, error: "" }));
                      }}
                    />
                  </div>
                </div>
                {dayBulkModal.error ? (
                  <small className="field-error appointment-form-error">{dayBulkModal.error}</small>
                ) : null}
              </div>
              <div className="edit-actions appointment-create-actions">
                <button
                  className="btn"
                  type="submit"
                  disabled={dayBulkModal.submitting || dayBulkModal.deleting || dayBulkModal.selectedIds.length === 0 || !canUpdateAppointments}
                >
                  {dayBulkModal.submitting ? "Saving..." : "Save"}
                </button>
                <button
                  className="header-btn logout-confirm-yes"
                  type="button"
                  disabled={dayBulkModal.submitting || dayBulkModal.deleting || dayBulkModal.selectedIds.length === 0 || !canDeleteAppointments}
                  onClick={handleDayBulkDelete}
                >
                  {dayBulkModal.deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </form>
          </section>
          <div
            id="appointmentDayBulkOverlay"
            className="login-overlay"
            onClick={dayBulkModal.submitting || dayBulkModal.deleting ? undefined : closeDayBulkModal}
          />
          </>
        );
        return typeof document !== "undefined" ? createPortal(modalContent, document.body) : modalContent;
      })()}

      {createModal.open && !vipOnly && (() => {
        const modalContent = (
          <>
          <section id="appointmentCreateClientModal" className="logout-confirm-modal appointment-create-modal">
            <div className="appointment-create-head">
              <div className="appointment-create-head-main">
                <div className="appointment-planner-modal-tabs" role="tablist" aria-label="Planner modal sections">
                  {plannerModalTabOptions.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      className={`appointment-planner-modal-tab${activePlannerModalTab === tab.value ? " is-active" : ""}`}
                      aria-selected={activePlannerModalTab === tab.value}
                      onClick={() => handlePlannerModalTabChange(tab.value)}
                      disabled={createSubmitting || createDeleting || Boolean(tab.disabled)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                id="appointmentCreateCloseBtn"
                type="button"
                className="header-btn panel-close-btn appointment-create-close-btn"
                aria-label="Close planner modal"
                onClick={closeCreateModal}
                disabled={createSubmitting || createDeleting}
              >
                ×
              </button>
            </div>
            <form className="auth-form appointment-create-form" noValidate onSubmit={handleCreateSubmit}>
              <div className="appointment-create-fields">
              {isPlannerAppointmentTab ? (
                <>

              {/* ── Client ── */}
              <div className="appointment-modal-section">
                {!vipOnly ? (
                  isSpecialistLimitedEditMode ? (
                    <div className="appointment-client-search-row appointment-client-search-row-single">
                      <div className="field">
                        <label htmlFor="appointmentEditClientReadonly">Client</label>
                        <input
                          id="appointmentEditClientReadonly"
                          type="text"
                          value={specialistLimitedClientLabel}
                          readOnly
                        />
                      </div>
                    </div>
                  ) : isClientFocusedCreateMode ? (
                    <div className="appointment-client-search-row appointment-client-search-row-single">
                      <div className="field">
                        <label htmlFor="appointmentCreateSpecialistSelect">Specialist</label>
                        <CustomSelect
                          id="appointmentCreateSpecialistSelect"
                          placeholder="Select specialist"
                          value={createModal.specialistId}
                          options={clientFocusedCreateSpecialistOptions}
                          searchable
                          searchPlaceholder="Search specialist"
                          searchThreshold={20}
                          maxVisibleOptions={6}
                          menuPortal
                          menuHeightScale={0.72}
                          error={Boolean(createErrors.specialistId)}
                          disabled={createSubmitting || createDeleting}
                          onChange={(nextValue) => {
                            setCreateModal((prev) => ({ ...prev, specialistId: nextValue }));
                            if (createErrors.specialistId) {
                              setCreateErrors((prev) => ({ ...prev, specialistId: "" }));
                            }
                          }}
                        />
                        <small className="field-error">{createErrors.specialistId || ""}</small>
                      </div>
                    </div>
                  ) : (
                    <div className="appointment-client-search-row">
                      <div className="field">
                        <input
                          id="appointmentClientSearchFirst"
                          aria-label="First name"
                          type="text"
                          placeholder="First name"
                          value={clientSearch.firstName}
                          onInput={(event) => {
                            const nextValue = event.currentTarget.value;
                            setClientSearch((prev) => ({ ...prev, firstName: nextValue }));
                          }}
                        />
                      </div>
                      <div className="field">
                        <input
                          id="appointmentClientSearchLast"
                          aria-label="Last name"
                          type="text"
                          placeholder="Last name"
                          value={clientSearch.lastName}
                          onInput={(event) => {
                            const nextValue = event.currentTarget.value;
                            setClientSearch((prev) => ({ ...prev, lastName: nextValue }));
                          }}
                        />
                      </div>
                      <div className="field">
                        <input
                          id="appointmentClientSearchMiddle"
                          aria-label="Middle name"
                          type="text"
                          placeholder="Middle name"
                          value={clientSearch.middleName}
                          onInput={(event) => {
                            const nextValue = event.currentTarget.value;
                            setClientSearch((prev) => ({ ...prev, middleName: nextValue }));
                          }}
                        />
                      </div>
                      <div className="field">
                        <input
                          id="appointmentClientSearchId"
                          aria-label="Client ID"
                          type="text"
                          inputMode="numeric"
                          placeholder="Client ID"
                          value={clientSearch.clientId}
                          onInput={(event) => {
                            const nextValue = event.currentTarget.value.replace(/\D+/g, "");
                            setClientSearch((prev) => ({ ...prev, clientId: nextValue }));
                          }}
                        />
                      </div>
                    </div>
                  )
                ) : null}

                {!vipOnly && !isSpecialistLimitedEditMode ? (
                  <div className="appointment-client-select-row">
                    <div className="field">
                      {isClientFocusedCreateMode ? (
                        <input
                          id="appointmentCreateClientReadonly"
                          aria-label="Client"
                          type="text"
                          value={clientFocusedSelectedClientLabel}
                          readOnly
                          disabled
                        />
                      ) : (
                        <CustomSelect
                          id="appointmentCreateClientSelect"
                          aria-label="Client"
                          placeholder="Select client"
                          value={createForm.clientId}
                          options={clientSelectOptions}
                          maxVisibleOptions={10}
                          menuPortal
                          error={clientSelectHasError}
                          emptyText={!createForm.clientId && !clientSearchMessage ? "Search by name or client ID above" : "No options found."}
                          onChange={(nextValue) => {
                            setCreateForm((prev) => ({ ...prev, clientId: nextValue }));
                            if (createErrors.clientId) {
                              setCreateErrors((prev) => ({ ...prev, clientId: "" }));
                            }
                          }}
                        />
                      )}
                      <small className="field-error">{createErrors.clientId || ""}</small>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── Date / Time / Service ── */}
              <div className="appointment-modal-section">
                {isSpecialistLimitedEditMode ? (
                  <div className="appointment-create-date-time-row appointment-create-date-time-row-specialist-lite">
                    <div className="field">
                      <label htmlFor="appointmentCreateTime">Start Time</label>
                      <CustomSelect
                        id="appointmentCreateTime"
                        placeholder="Select start time"
                        value={createForm.startTime}
                        options={timeSelectOptions}
                        menuPortal
                        forceOpenDown={!compactWeekRange}
                        forceOpenUp={compactWeekRange}
                        menuHeightScale={0.85}
                        error={Boolean(createErrors.startTime)}
                        onChange={(nextValue) => {
                          setCreateForm((prev) => ({ ...prev, startTime: nextValue }));
                          if (createErrors.startTime) {
                            setCreateErrors((prev) => ({ ...prev, startTime: "" }));
                          }
                        }}
                      />
                      <small className="field-error">{createErrors.startTime || ""}</small>
                    </div>

                    <div className="field">
                      <label htmlFor="appointmentCreateService">Service</label>
                      <input
                        id="appointmentCreateService"
                        type="text"
                        className={createErrors.service ? "input-error" : ""}
                        value={createForm.service}
                        disabled={createSubmitting || createDeleting}
                        onInput={(event) => {
                          const nextValue = event.currentTarget.value;
                          setCreateForm((prev) => ({ ...prev, service: nextValue }));
                          if (createErrors.service) {
                            setCreateErrors((prev) => ({ ...prev, service: "" }));
                          }
                        }}
                      />
                      <small className="field-error">{createErrors.service || ""}</small>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="appointment-create-date-time-row"
                    >
                      <div className="field">
                        <label htmlFor="appointmentCreateDate">Date</label>
                          <input
                            id="appointmentCreateDate"
                            type="date"
                            className={createErrors.appointmentDate ? "input-error" : ""}
                          value={createForm.appointmentDate}
                          disabled={shouldLockEditDate}
                            onInput={(event) => {
                              const nextValue = event.currentTarget.value;
                              setCreateForm((prev) => {
                                const nextForm = { ...prev, appointmentDate: nextValue };
                                if (prev.repeatEnabled) {
                                  nextForm.repeatUntil = getDefaultRepeatUntilDate(nextValue);
                                } else {
                                  const nextMinimumRepeatUntil = nextValue;
                                  if (!prev.repeatUntil || prev.repeatUntil < nextMinimumRepeatUntil) {
                                    nextForm.repeatUntil = nextMinimumRepeatUntil;
                                  }
                                }
                                return nextForm;
                              });
                              if (createErrors.appointmentDate || createErrors.repeatUntil) {
                                setCreateErrors((prev) => ({ ...prev, appointmentDate: "", repeatUntil: "" }));
                              }
                            }}
                        />
                        <small className="field-error">{createErrors.appointmentDate || ""}</small>
                      </div>

                      <div className="field">
                        <label htmlFor="appointmentCreateTime">Start Time</label>
                        <CustomSelect
                          id="appointmentCreateTime"
                          placeholder="Select start time"
                          value={createForm.startTime}
                          options={timeSelectOptions}
                          menuPortal
                          forceOpenDown={!compactWeekRange}
                          forceOpenUp={compactWeekRange}
                          menuHeightScale={0.85}
                          error={Boolean(createErrors.startTime)}
                          onChange={(nextValue) => {
                            setCreateForm((prev) => ({ ...prev, startTime: nextValue }));
                            if (createErrors.startTime) {
                              setCreateErrors((prev) => ({ ...prev, startTime: "" }));
                            }
                          }}
                        />
                        <small className="field-error">{createErrors.startTime || ""}</small>
                      </div>

                      <div className="field">
                        <label htmlFor="appointmentCreateDuration">Duration</label>
                        <CustomSelect
                          id="appointmentCreateDuration"
                          placeholder="Select duration"
                          value={createForm.durationMinutes}
                          options={durationSelectOptions}
                          menuPortal
                          forceOpenDown={!compactWeekRange}
                          forceOpenUp={compactWeekRange}
                          error={Boolean(createErrors.durationMinutes)}
                          onChange={(nextValue) => {
                            setCreateForm((prev) => ({ ...prev, durationMinutes: nextValue }));
                            if (createErrors.durationMinutes) {
                              setCreateErrors((prev) => ({ ...prev, durationMinutes: "" }));
                            }
                          }}
                        />
                        <small className="field-error">{createErrors.durationMinutes || ""}</small>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="appointmentCreateService">Service</label>
                      <input
                        id="appointmentCreateService"
                        type="text"
                        className={createErrors.service ? "input-error" : ""}
                        value={createForm.service}
                        disabled={createSubmitting || createDeleting}
                        onInput={(event) => {
                          const nextValue = event.currentTarget.value;
                          setCreateForm((prev) => ({ ...prev, service: nextValue }));
                          if (createErrors.service) {
                            setCreateErrors((prev) => ({ ...prev, service: "" }));
                          }
                        }}
                      />
                      <small className="field-error">{createErrors.service || ""}</small>
                    </div>
                  </>
                )}
              </div>

              {/* ── Repeat ── */}
              {!isSpecialistLimitedEditMode ? (
                <div className="appointment-modal-section">
                  <div className="appointment-repeat-block">
                    <div className="appointment-create-date-time-row appointment-repeat-head-row">
                      {shouldShowRecurringEditNextToggle ? (
                        <div className="field appointment-repeat-mode-field appointment-edit-scope-toggle-field">
                          <label htmlFor="appointmentEditScopeOne">Series</label>
                          <label
                            className={`appointment-client-vip-toggle appointment-repeat-mode-toggle${isSeriesOneMode ? " is-active" : ""}`}
                            htmlFor="appointmentEditScopeOne"
                          >
                            <input
                              id="appointmentEditScopeOne"
                              type="checkbox"
                              checked={isSeriesOneMode}
                              disabled={createSubmitting || createDeleting}
                              onChange={(event) => {
                                const oneChecked = event.currentTarget.checked;
                                setCreateForm((prev) => ({
                                  ...prev,
                                  editScope: oneChecked ? "single" : "future",
                                  repeatDays: (() => {
                                    const currentDays = normalizeRepeatDayKeys(prev.repeatDays);
                                    const stillMatchesOriginal = (
                                      currentDays.length === originalRecurringEditRepeatDays.length
                                      && currentDays.every((day, index) => day === originalRecurringEditRepeatDays[index])
                                    );
                                    if (oneChecked) {
                                      if (
                                        DAY_KEYS_SET.has(sourceRecurringEditDayKey)
                                        && (stillMatchesOriginal || currentDays.length === 0)
                                      ) {
                                        return [sourceRecurringEditDayKey];
                                      }
                                      return currentDays.length > 0
                                        ? currentDays
                                        : (sourceRecurringEditDayKey ? [sourceRecurringEditDayKey] : []);
                                    }
                                    if (
                                      originalRecurringEditRepeatDays.length > 0
                                      && (currentDays.length <= 1 || stillMatchesOriginal)
                                    ) {
                                      return originalRecurringEditRepeatDays;
                                    }
                                    return currentDays;
                                  })()
                                }));
                              }}
                            />
                            <span>One</span>
                          </label>
                        </div>
                      ) : (
                        <div className="field appointment-repeat-mode-field">
                          <label htmlFor="appointmentCreateSeriesOneMode">Series</label>
                          <label
                            className={`appointment-client-vip-toggle appointment-repeat-mode-toggle${isSeriesOneMode ? " is-active" : ""}`}
                            htmlFor="appointmentCreateSeriesOneMode"
                          >
                            <input
                              id="appointmentCreateSeriesOneMode"
                              type="checkbox"
                              checked={isSeriesOneMode}
                              disabled={!canToggleSingleEntryMode || createSubmitting || createDeleting}
                              onChange={(event) => {
                                handleSingleEntryModeToggle(event.currentTarget.checked);
                              }}
                            />
                            <span>One</span>
                          </label>
                        </div>
                      )}
                      <div className={`field appointment-repeat-title-field${createErrors.repeatDays ? " has-error" : ""}${isSingleEntryMode ? " is-disabled" : ""}`}>
                        <label>Repeat weekly</label>
                        <div className="appointment-repeat-days" role="group" aria-label="Repeat weekdays">
                          {visibleRepeatDayItems.map((day) => {
                            const checked = displayedRepeatDayKeys.includes(day.key);
                            const isDisabledForSingleRecurringEdit = (
                              isEditRecurring
                              && normalizedEditScope === "single"
                              && allowedSingleRecurringEditDayKeys.length > 0
                              && !allowedSingleRecurringEditDayKeys.includes(day.key)
                            );
                            return (
                              <label
                                key={day.key}
                                className={`appointment-repeat-day-chip${checked ? " is-active" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={(
                                    isSingleEntryMode
                                    || createSubmitting
                                    || createDeleting
                                    || (
                                      normalizedEditScope !== "single"
                                        ? !canEditRecurringSeriesPattern
                                        : isDisabledForSingleRecurringEdit
                                    )
                                  )}
                                  onChange={() => toggleRepeatDay(day.key)}
                                />
                                <span>{day.label.slice(0, 3)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <small className="field-error">{createErrors.repeatDays || ""}</small>
                  </div>
                </div>
              ) : null}

              {/* ── Status / Note ── */}
              <div className="appointment-modal-section">
                <div className="appointment-status-note-row">
                  <div className="field">
                    <label htmlFor="appointmentCreateStatus">Status</label>
                    <div className="appointment-status-inline-select">
                      <CustomSelect
                        id="appointmentCreateStatus"
                        placeholder="Select status"
                        value={createForm.status}
                        options={STATUS_OPTIONS}
                        menuPortal
                        forceOpenDown={!compactWeekRange}
                        forceOpenUp={compactWeekRange}
                        onChange={(nextValue) => {
                          setCreateForm((prev) => ({ ...prev, status: nextValue }));
                          if (createErrors.status) {
                            setCreateErrors((prev) => ({ ...prev, status: "" }));
                          }
                        }}
                      />
                    </div>
                    <small className="field-error">{createErrors.status || ""}</small>
                  </div>

                  <div className="field">
                    <label htmlFor="appointmentCreateNote">Note</label>
                    <input
                      id="appointmentCreateNote"
                      type="text"
                      className={createErrors.note ? "input-error" : ""}
                      value={createForm.note}
                      onInput={(event) => {
                        const nextValue = event.currentTarget.value;
                        setCreateForm((prev) => ({ ...prev, note: nextValue }));
                        if (createErrors.note) {
                          setCreateErrors((prev) => ({ ...prev, note: "" }));
                        }
                      }}
                    />
                    <small className="field-error">{createErrors.note || ""}</small>
                  </div>
                </div>

                {createErrors.form ? (
                  <small className="field-error appointment-form-error">{createErrors.form}</small>
                ) : null}
              </div>
                </>
              ) : null}

              {isPlannerBreakTab ? (
                <>
                  <div className="appointment-modal-section">
                    {isClientFocusedCreateMode ? (
                      <div className="appointment-client-search-row appointment-client-search-row-single">
                        <div className="field">
                          <label htmlFor="appointmentBreakSpecialistSelect">Specialist</label>
                          <CustomSelect
                            id="appointmentBreakSpecialistSelect"
                            placeholder="Select specialist"
                            value={createModal.specialistId}
                            options={plannerModalSpecialistOptions}
                            searchable
                            searchPlaceholder="Search specialist"
                            searchThreshold={20}
                            maxVisibleOptions={6}
                            menuPortal
                            menuHeightScale={0.72}
                            error={Boolean(createErrors.specialistId)}
                            disabled={createSubmitting || createDeleting}
                            onChange={updatePlannerModalSpecialist}
                          />
                          <small className="field-error">{createErrors.specialistId || ""}</small>
                        </div>
                      </div>
                    ) : (
                      <div className="appointment-client-search-row appointment-client-search-row-single">
                        <div className="field">
                          <label htmlFor="appointmentBreakSpecialistReadonly">Specialist</label>
                          <input
                            id="appointmentBreakSpecialistReadonly"
                            type="text"
                            value={plannerModalSpecialistLabel}
                            readOnly
                            disabled
                          />
                        </div>
                      </div>
                    )}

                    <div className="appointment-create-date-time-row">
                      <div className="field">
                        <label htmlFor="appointmentBreakType">Break Type</label>
                        <CustomSelect
                          id="appointmentBreakType"
                          placeholder="Select break type"
                          value={plannerBreakForm.breakType}
                          options={BREAK_TYPE_OPTIONS}
                          menuPortal
                          forceOpenDown={!compactWeekRange}
                          forceOpenUp={compactWeekRange}
                          error={Boolean(createErrors.breakType)}
                          onChange={(nextValue) => {
                            setPlannerBreakForm((prev) => ({ ...prev, breakType: String(nextValue || "") }));
                            if (createErrors.breakType) {
                              setCreateErrors((prev) => ({ ...prev, breakType: "" }));
                            }
                          }}
                        />
                        <small className="field-error">{createErrors.breakType || ""}</small>
                      </div>
                      <div className="field">
                        <label htmlFor="appointmentBreakStartTime">Start Time</label>
                        <CustomSelect
                          id="appointmentBreakStartTime"
                          placeholder="Select start time"
                          value={plannerBreakForm.startTime}
                          options={timeSelectOptions}
                          menuPortal
                          forceOpenDown={!compactWeekRange}
                          forceOpenUp={compactWeekRange}
                          menuHeightScale={0.85}
                          error={Boolean(createErrors.startTime)}
                          onChange={(nextValue) => {
                            setPlannerBreakForm((prev) => ({ ...prev, startTime: String(nextValue || "") }));
                            if (createErrors.startTime) {
                              setCreateErrors((prev) => ({ ...prev, startTime: "" }));
                            }
                          }}
                        />
                        <small className="field-error">{createErrors.startTime || ""}</small>
                      </div>
                      <div className="field">
                        <label htmlFor="appointmentBreakEndTime">End Time</label>
                        <CustomSelect
                          id="appointmentBreakEndTime"
                          placeholder="Select end time"
                          value={plannerBreakForm.endTime}
                          options={endTimeSelectOptions}
                          menuPortal
                          forceOpenDown={!compactWeekRange}
                          forceOpenUp={compactWeekRange}
                          menuHeightScale={0.85}
                          error={Boolean(createErrors.endTime)}
                          onChange={(nextValue) => {
                            setPlannerBreakForm((prev) => ({ ...prev, endTime: String(nextValue || "") }));
                            if (createErrors.endTime) {
                              setCreateErrors((prev) => ({ ...prev, endTime: "" }));
                            }
                          }}
                        />
                        <small className="field-error">{createErrors.endTime || ""}</small>
                      </div>
                    </div>

                    <div className={`field appointment-repeat-title-field${createErrors.repeatDays ? " has-error" : ""}`}>
                      <label>Repeat weekly</label>
                      <div className="appointment-repeat-days" role="group" aria-label="Break repeat weekdays">
                        {visibleRepeatDayItems.map((day) => {
                          const checked = plannerBlockRepeatDaySet.has(day.key);
                          return (
                            <label
                              key={day.key}
                              className={`appointment-repeat-day-chip${checked ? " is-active" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={createSubmitting || createDeleting}
                                onChange={() => toggleRepeatDay(day.key)}
                              />
                              <span>{day.label.slice(0, 3)}</span>
                            </label>
                          );
                        })}
                      </div>
                      <small className="field-error">{createErrors.repeatDays || ""}</small>
                    </div>

                    <div className="field">
                      <label htmlFor="appointmentBreakNote">Note</label>
                      <input
                        id="appointmentBreakNote"
                        type="text"
                        className={createErrors.note ? "input-error" : ""}
                        value={plannerBreakForm.note}
                        disabled={createSubmitting || createDeleting}
                        onInput={(event) => {
                          const nextValue = event.currentTarget.value;
                          setPlannerBreakForm((prev) => ({ ...prev, note: nextValue }));
                          if (createErrors.note) {
                            setCreateErrors((prev) => ({ ...prev, note: "" }));
                          }
                        }}
                      />
                      <small className="field-error">{createErrors.note || ""}</small>
                    </div>

                    {createErrors.form ? (
                      <small className="field-error appointment-form-error">{createErrors.form}</small>
                    ) : null}
                  </div>
                </>
              ) : null}

              {isPlannerWorkScheduleTab ? (
                <>
                  <div className="appointment-modal-section">
                    {isClientFocusedCreateMode ? (
                      <div className="appointment-client-search-row appointment-client-search-row-single">
                        <div className="field">
                          <label htmlFor="appointmentWorkScheduleSpecialistSelect">Specialist</label>
                          <CustomSelect
                            id="appointmentWorkScheduleSpecialistSelect"
                            placeholder="Select specialist"
                            value={createModal.specialistId}
                            options={plannerModalSpecialistOptions}
                            searchable
                            searchPlaceholder="Search specialist"
                            searchThreshold={20}
                            maxVisibleOptions={6}
                            menuPortal
                            menuHeightScale={0.72}
                            error={Boolean(createErrors.specialistId)}
                            disabled={createSubmitting || createDeleting}
                            onChange={updatePlannerModalSpecialist}
                          />
                          <small className="field-error">{createErrors.specialistId || ""}</small>
                        </div>
                      </div>
                    ) : (
                      <div className="appointment-client-search-row appointment-client-search-row-single">
                        <div className="field">
                          <label htmlFor="appointmentWorkScheduleSpecialistReadonly">Specialist</label>
                          <input
                            id="appointmentWorkScheduleSpecialistReadonly"
                            type="text"
                            value={plannerModalSpecialistLabel}
                            readOnly
                            disabled
                          />
                        </div>
                      </div>
                    )}

                    <div className="appointment-create-date-time-row">
                      <div className="field">
                        <label htmlFor="appointmentWorkScheduleReason">Reason</label>
                        <input
                          id="appointmentWorkScheduleReason"
                          type="text"
                          className={createErrors.reason ? "input-error" : ""}
                          value={plannerWorkScheduleForm.reason}
                          disabled={createSubmitting || createDeleting}
                          onInput={(event) => {
                            const nextValue = event.currentTarget.value;
                            setPlannerWorkScheduleForm((prev) => ({ ...prev, reason: nextValue }));
                            if (createErrors.reason) {
                              setCreateErrors((prev) => ({ ...prev, reason: "" }));
                            }
                          }}
                        />
                        <small className="field-error">{createErrors.reason || ""}</small>
                      </div>
                      <div className="field">
                        <label htmlFor="appointmentWorkScheduleStartTime">Start Time</label>
                        <CustomSelect
                          id="appointmentWorkScheduleStartTime"
                          placeholder="Select start time"
                          value={plannerWorkScheduleForm.startTime}
                          options={timeSelectOptions}
                          menuPortal
                          forceOpenDown={!compactWeekRange}
                          forceOpenUp={compactWeekRange}
                          menuHeightScale={0.85}
                          error={Boolean(createErrors.startTime)}
                          onChange={(nextValue) => {
                            setPlannerWorkScheduleForm((prev) => ({ ...prev, startTime: String(nextValue || "") }));
                            if (createErrors.startTime) {
                              setCreateErrors((prev) => ({ ...prev, startTime: "" }));
                            }
                          }}
                        />
                        <small className="field-error">{createErrors.startTime || ""}</small>
                      </div>
                      <div className="field">
                        <label htmlFor="appointmentWorkScheduleEndTime">End Time</label>
                        <CustomSelect
                          id="appointmentWorkScheduleEndTime"
                          placeholder="Select end time"
                          value={plannerWorkScheduleForm.endTime}
                          options={endTimeSelectOptions}
                          menuPortal
                          forceOpenDown={!compactWeekRange}
                          forceOpenUp={compactWeekRange}
                          menuHeightScale={0.85}
                          error={Boolean(createErrors.endTime)}
                          onChange={(nextValue) => {
                            setPlannerWorkScheduleForm((prev) => ({ ...prev, endTime: String(nextValue || "") }));
                            if (createErrors.endTime) {
                              setCreateErrors((prev) => ({ ...prev, endTime: "" }));
                            }
                          }}
                        />
                        <small className="field-error">{createErrors.endTime || ""}</small>
                      </div>
                    </div>

                    <div className={`field appointment-repeat-title-field${createErrors.repeatDays ? " has-error" : ""}`}>
                      <label>Repeat weekly</label>
                      <div className="appointment-repeat-days" role="group" aria-label="Work schedule repeat weekdays">
                        {visibleRepeatDayItems.map((day) => {
                          const checked = plannerBlockRepeatDaySet.has(day.key);
                          return (
                            <label
                              key={day.key}
                              className={`appointment-repeat-day-chip${checked ? " is-active" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={createSubmitting || createDeleting}
                                onChange={() => toggleRepeatDay(day.key)}
                              />
                              <span>{day.label.slice(0, 3)}</span>
                            </label>
                          );
                        })}
                      </div>
                      <small className="field-error">{createErrors.repeatDays || ""}</small>
                    </div>

                    {createErrors.form ? (
                      <small className="field-error appointment-form-error">{createErrors.form}</small>
                    ) : null}
                  </div>
                </>
              ) : null}
              </div>

              {/* ── Actions ── */}
              <div className="edit-actions appointment-create-actions">
                <button
                  className="btn"
                  type="submit"
                  disabled={
                    createSubmitting
                    || createDeleting
                    || (
                      isPlannerBreakTab
                        ? (!canUpdateAppointmentBreaks || !canMutateModalSpecialist)
                        : isPlannerWorkScheduleTab
                          ? ((!canCreateAppointmentWorkSchedule && !canUpdateAppointmentWorkSchedule) || !canMutateModalSpecialist)
                          : (
                      createModal.mode === "edit"
                        ? (!canUpdateAppointments || !canMutateModalSpecialist)
                        : !canCreateOnPlannerSpecialist(createModal.specialistId)
                    )
                    )
                  }
                >
                  {createSubmitting ? "Saving..." : "Save"}
                </button>
                {isPlannerAppointmentTab ? (
                  <button
                    className="header-btn logout-confirm-yes"
                    type="button"
                    disabled={createModal.mode !== "edit" || createSubmitting || createDeleting || !canDeleteAppointments || !canMutateModalSpecialist}
                    onClick={handleDeleteAppointment}
                  >
                    {createDeleting ? "Deleting..." : "Delete"}
                  </button>
                ) : isPlannerBreakTab ? (
                  <button
                    className="header-btn logout-confirm-yes"
                    type="button"
                    disabled={createSubmitting || createDeleting || !canUpdateAppointmentBreaks || !canMutateModalSpecialist}
                    onClick={handlePlannerBreakDelete}
                  >
                    {createDeleting ? "Deleting..." : "Delete"}
                  </button>
                ) : isPlannerWorkScheduleTab ? (
                  <button
                    className="header-btn logout-confirm-yes"
                    type="button"
                    disabled={createSubmitting || createDeleting || !canDeleteAppointmentWorkSchedule || !canMutateModalSpecialist}
                    onClick={handlePlannerWorkScheduleDelete}
                  >
                    {createDeleting ? "Deleting..." : "Delete"}
                  </button>
                ) : null}
              </div>

            </form>
          </section>
          <div
            id="appointmentCreateClientOverlay"
            className="login-overlay"
            onClick={closeCreateModal}
          />
          </>
        );
        if (typeof document !== "undefined") {
          return createPortal(modalContent, document.body);
        }
        return modalContent;
      })()}

    </section>
  );
}

export default AppointmentScheduler;
