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

const EDIT_SCOPE_OPTIONS = [
  { value: "single", label: "This only" },
  { value: "future", label: "This and next" },
  { value: "all", label: "All in series" }
];

const DAY_KEYS_SET = new Set(DAY_ITEMS.map((item) => item.key));
const DAY_NUM_TO_KEY = Object.freeze(
  DAY_ITEMS.reduce((acc, item, index) => {
    acc[index + 1] = item.key;
    return acc;
  }, {})
);
const MAX_REPEAT_RANGE_DAYS = 366;
const APPOINTMENT_SPECIALIST_STORAGE_KEY = "crm_appointment_selected_specialist_id";
const APPOINTMENT_VIP_CLIENT_STORAGE_KEY = "crm_appointment_selected_vip_client_id";
const ACTIVE_SCHEDULE_STATUSES = new Set(["pending", "confirmed"]);
const FULL_CELL_BREAK_TYPES = new Set(["lunch", "meeting", "training", "other"]);
const DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 18;
const MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 12;
const MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 72;
const DEFAULT_APPOINTMENT_SERVICE_NAME = "Consultation";
const VIP_AUTO_ROLLING_REPEAT_WINDOW_DAYS = 30;

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

function normalizeBreakTypeKey(value) {
  const normalizedType = String(value || "").trim().toLowerCase();
  if (normalizedType === "launch") {
    return "lunch";
  }
  return normalizedType;
}

function getSchedulerSelectionStorageKey(vipOnly = false) {
  return vipOnly
    ? APPOINTMENT_VIP_CLIENT_STORAGE_KEY
    : APPOINTMENT_SPECIALIST_STORAGE_KEY;
}

function readStoredSchedulerSelectionId(vipOnly = false) {
  if (typeof window === "undefined") {
    return "";
  }
  const storageKey = getSchedulerSelectionStorageKey(vipOnly);
  return String(window.localStorage.getItem(storageKey) || "").trim();
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
    lastName: ""
  };
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
  const phone = String(client?.phone || "").trim();
  return phone ? `${displayName} (${phone})` : displayName;
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

function formatServiceLine(serviceName, durationMinutes) {
  const serviceLabel = truncateWithEllipsis(serviceName, 20);
  const bookingDuration = formatBookingDurationLabel(durationMinutes);
  if (!bookingDuration) {
    return serviceLabel;
  }
  return serviceLabel ? `${serviceLabel} • ${bookingDuration}` : bookingDuration;
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

function formatVipServiceLine(specialistPosition, serviceName, durationMinutes, fallbackPosition = "") {
  const positionText = truncateWithEllipsis(specialistPosition, 24);
  const fallbackPositionText = truncateWithEllipsis(fallbackPosition, 24);
  const serviceText = truncateWithEllipsis(serviceName, 20);
  const primaryText = !isGenericVipPrimaryLabel(positionText)
    ? positionText
    : (!isGenericVipPrimaryLabel(fallbackPositionText)
      ? fallbackPositionText
      : (!isGenericVipServiceLabel(serviceText) ? serviceText : "Specialist"));
  const bookingDuration = formatBookingDurationLabel(durationMinutes);
  if (!bookingDuration) {
    return primaryText;
  }
  return primaryText ? `${primaryText} • ${bookingDuration}` : bookingDuration;
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

function getEndOfNextWeek(date) {
  const baseDate = date instanceof Date && !Number.isNaN(date.getTime())
    ? new Date(date)
    : new Date();
  baseDate.setHours(0, 0, 0, 0);
  const dayNum = baseDate.getDay();
  const daysToEndNextWeek = ((7 - dayNum) % 7) + 7;
  return addDays(baseDate, daysToEndNextWeek);
}

function getVipAutoRollingRepeatUntil() {
  const baseDate = new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return "";
  }
  baseDate.setHours(0, 0, 0, 0);
  return formatDateYmd(addDays(baseDate, Math.max(0, VIP_AUTO_ROLLING_REPEAT_WINDOW_DAYS - 1)));
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
  return {
    id: String(item?.id || ""),
    specialistId: String(item?.specialistId || "").trim(),
    specialist: String(item?.specialistName || "").trim()
      || (String(item?.specialistId || "").trim() ? `Specialist #${String(item?.specialistId || "").trim()}` : "Specialist"),
    specialistPosition: String(item?.specialistPosition || "").trim(),
    clientId: String(item?.clientId || ""),
    time: startTime,
    endTime: String(item?.endTime || "").trim(),
    durationMinutes: String(item?.durationMinutes || "").trim() || getDurationMinutesFromTimes(startTime, item?.endTime),
    client: getClientCardName({
      id: item?.clientId,
      firstName: item?.clientFirstName,
      lastName: item?.clientLastName
    }),
    clientFirstName: String(item?.clientFirstName || "").trim(),
    clientLastName: String(item?.clientLastName || "").trim(),
    clientMiddleName: String(item?.clientMiddleName || "").trim(),
    isVip: Boolean(item?.isVip),
    service: String(item?.serviceName || "").trim(),
    status: String(item?.status || "pending").trim().toLowerCase(),
    note: String(item?.note || "").trim(),
    repeatType: String(item?.repeatType || "none").trim().toLowerCase(),
    repeatGroupKey: String(item?.repeatGroupKey || "").trim(),
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

function alwaysFalse() {
  return false;
}

function normalizePlannerBreakItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
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
    dayKey: String(item?.dayKey || "").trim().toLowerCase(),
    dayOfWeek: Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10) || 0,
    startTime: String(item?.startTime || "").trim(),
    endTime: String(item?.endTime || "").trim(),
    reason: String(item?.reason || "").trim(),
    isActive: item?.isActive !== false
  }));
}

function AppointmentPlannerGrid({
  sectionTitle = "",
  ariaLabel = "",
  weekStartDate,
  settings,
  rawAppointmentsByDay = {},
  selectedClientId = "",
  breaksForSpecialist = [],
  blockedTimesForSpecialist = [],
  absencesForSpecialist = [],
  slotCellHeightPx = DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  now = new Date(),
  canCreateOnSpecialist = false,
  canUpdateAppointments = true,
  canDeleteAppointments = true,
  canMutateAppointmentSpecialist = () => false,
  onOpenCreateModal = null,
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
        (item) => String(item?.clientId || "").trim() === normalizedClientId
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
      const absenceItem = (Array.isArray(absencesForSpecialist) ? absencesForSpecialist : []).find(
        (item) => String(item?.absenceDate || "").trim() === dayDate
      );
      if (!absenceItem) {
        acc[day.key] = blockedByTime;
        return acc;
      }

      const dayMinutes = workingHoursMinutesByDay[day.key] || { start: null, end: null };
      const reasonFull = String(absenceItem?.reason || "").trim() || "Specialist absent";
      const reasonShort = truncateWithEllipsis(reasonFull, 18) || "Absent";
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
        blockedByTime[slot] = {
          reasonShort,
          reasonFull
        };
      });

      acc[day.key] = blockedByTime;
      return acc;
    }, {})
  ), [absencesForSpecialist, slotMinutesByValue, timeSlots, weekDays, workingHoursMinutesByDay]);
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
        const eventClientId = String(event?.clientId || "").trim();
        const isHiddenByClientFilter = Boolean(normalizedClientId) && eventClientId !== normalizedClientId;
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
          start,
          end,
          breakType: normalizeBreakTypeKey(item?.breakType || "break"),
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
              breakType: hit.breakType,
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
          start,
          end,
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
    settings?.slotSubDivisions,
    slotMinutesByValue,
    timeSlots,
    weekDays,
    workingHoursMinutesByDay
  ]);

  return (
    <div className="appointment-client-focused-section">
      {sectionTitle ? (
        <div className="appointment-client-focused-section-head">
          <p className="appointment-client-focused-section-title">{sectionTitle}</p>
        </div>
      ) : null}
      <div className={["appointment-grid-wrap", wrapperClassName].filter(Boolean).join(" ") || undefined}>
        <table className="appointment-grid" aria-label={ariaLabel || sectionTitle || "Appointment week table"}>
          <thead>
            <tr>
              <th className="appointment-time-col">Time</th>
              {weekDays.map((day) => {
                const dayHeaderClassName = [
                  "appointment-day-head-col-gap",
                  isSameDate(day.date, now) ? "appointment-day-is-today" : ""
                ].filter(Boolean).join(" ") || undefined;

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
                    const reachesBottom = Boolean(
                      tdRowSpan
                      && Number.isInteger(slotIndex)
                      && (slotIndex + effectiveRowSpan >= timeSlots.length)
                    );
                    const isClientCardMode = cardDisplayMode === "client";
                    const cardPrimaryText = isClientCardMode
                      ? (String(item?.specialist || "").trim() || "Specialist")
                      : (String(item?.client || "").trim() || "Client");
                    const cardSecondaryText = isClientCardMode
                      ? (
                        formatServiceLine(String(item?.service || "").trim(), item?.durationMinutes)
                        || String(item?.service || "").trim()
                        || "Service"
                      )
                      : (String(item?.service || "").trim() || "Service");
                    const cardTimeRangeLabel = item
                      ? formatAppointmentTimeRangeLabel(item?.time || slot, item?.endTime, item?.durationMinutes)
                      : "";
                    const cardDurationLabel = item
                      ? (
                        formatBookingDurationLabel(item?.durationMinutes)
                        || formatBookingDurationLabel(getDurationMinutesFromTimes(item?.time || slot, item?.endTime))
                      )
                      : "";
                    const timeHoverCellClassName = cardTimeRangeLabel
                      ? "appointment-booked-time-td"
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
                      && canCreateOnSpecialist
                      && typeof onOpenCreateModal === "function"
                    );
                    const tdClassName = [
                      "appointment-day-col-gap",
                      canOpenCreateFromCell ? "appointment-create-slot-td" : "",
                      timeHoverCellClassName,
                      tdRowSpan ? "appointment-td-multi-slot" : "",
                      reachesBottom ? "appointment-td-reaches-bottom" : "",
                      isOffSlotCell ? "appointment-off-slot-td" : "",
                      statusCellClassName,
                      (absenceBlockedItem || workScheduleBlockedItem) ? "appointment-work-schedule-blocked-td" : "",
                      breakBlockedItem ? `appointment-break-type-${breakBlockedItem.breakType}-td` : "",
                    ].filter(Boolean).join(" ") || undefined;

                    return (
                      <td
                        key={`${day.key}-${slot}`}
                        rowSpan={tdRowSpan}
                        className={tdClassName}
                        data-slot-label={canOpenCreateFromCell ? slot : undefined}
                        data-time-range={cardTimeRangeLabel || undefined}
                        data-duration-label={cardDurationLabel || undefined}
                        onClick={canOpenCreateFromCell ? () => onOpenCreateModal(day, slot) : undefined}
                      >
                        {!isInsideWorkingHours ? (
                          null
                        ) : item ? (
                          (canMutateAppointmentSpecialist(item) && (canUpdateAppointments || canDeleteAppointments)) ? (
                            <button
                              type="button"
                              className={`appointment-card${tdRowSpan ? " appointment-card-multi-slot" : ""} appointment-card-btn appointment-status-${item.status}`}
                              onClick={() => onOpenCreateModal(day, slot, item)}
                              aria-label={`Edit appointment on ${day.label} at ${slot}`}
                            >
                              <p className="appointment-client">{cardPrimaryText}</p>
                              <p className="appointment-service">{cardSecondaryText}</p>
                            </button>
                          ) : (
                            <div
                              className={`appointment-card${tdRowSpan ? " appointment-card-multi-slot" : ""} appointment-status-${item.status}`}
                              aria-label={`Appointment on ${day.label} at ${slot}`}
                            >
                              <p className="appointment-client">{cardPrimaryText}</p>
                              <p className="appointment-service">{cardSecondaryText}</p>
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
                            className="appointment-break-text-only"
                            aria-label={`Break slot on ${day.label} at ${slot}`}
                            title={String(breakBlockedItem.reasonFull || "").trim() || undefined}
                          >
                            <span className="appointment-break-slot-text">{breakBlockedItem.reasonShort}</span>
                          </span>
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
  currentUserId = "",
  restrictCreateToOwnSpecialist = false,
  vipOnly = false,
  recurringOnly = false,
  showWeekSwitcher = true,
  modalTitle = "To Planner",
  vipClassDailyRoutines = [],
  onNotification = null
}) {
  const isVipRecurringModal = vipOnly && recurringOnly;
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
  const [selectedPlannerClientFilterId, setSelectedPlannerClientFilterId] = useState("");
  const [plannerFilterClients, setPlannerFilterClients] = useState([]);
  const [clientFocusedPlannerSpecialists, setClientFocusedPlannerSpecialists] = useState([]);
  const [clientFocusedSchedulesBySpecialist, setClientFocusedSchedulesBySpecialist] = useState(() => ({}));
  const [clientFocusedPlannerWeekKey, setClientFocusedPlannerWeekKey] = useState("");
  const [selectedVipClientFilterId, setSelectedVipClientFilterId] = useState("");
  const [selectedSpecialistId, setSelectedSpecialistId] = useState(
    () => readStoredSchedulerSelectionId(vipOnly)
  );
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
    repeatGroupKey: ""
  });
  const [createForm, setCreateForm] = useState(createEmptyClientForm);
  const [createErrors, setCreateErrors] = useState({});
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createDeleting, setCreateDeleting] = useState(false);
  const [clientVipOnly, setClientVipOnly] = useState(Boolean(vipOnly));
  const [clientSearch, setClientSearch] = useState(createEmptyClientSearchForm);
  const [clientSearchMessage, setClientSearchMessage] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [clientMap, setClientMap] = useState({});
  const [clientNoShowSummary, setClientNoShowSummary] = useState(null);
  const [settings, setSettings] = useState({
    slotInterval: "30",
    slotSubDivisions: "1",
    appointmentDurationOptions: ["30"],
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    workingHours: createDefaultWorkingHours(),
    slotCellHeightPx: String(DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX),
    blockedTimes: []
  });
  const schedulesRequestIdRef = useRef(0);
  const breaksRequestIdRef = useRef(0);
  const absencesRequestIdRef = useRef(0);
  const clientFocusedRequestIdRef = useRef(0);
  const normalizedCurrentUserId = String(currentUserId || "").trim();
  const normalizedSelectedPlannerClientFilterId = String(selectedPlannerClientFilterId || "").trim();
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
  const isClientFocusedMode = !vipOnly && Boolean(normalizedSelectedPlannerClientFilterId);
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
        && !normalizedSelectedPlannerClientFilterId
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
  }, [normalizedSelectedPlannerClientFilterId, selectedSpecialistId, vipOnly]);

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

        const settingsQuery = new URLSearchParams();
        if (
          !vipOnly
          && !normalizedSelectedPlannerClientFilterId
          && String(selectedSpecialistId || "").trim()
        ) {
          settingsQuery.set("specialistId", String(selectedSpecialistId || "").trim());
        }
        const settingsUrl = settingsQuery.size > 0
          ? `/api/appointments/settings?${settingsQuery.toString()}`
          : "/api/appointments/settings";

        const [settingsResponse, specialistsResponse, specialistRolesResponse, plannerFiltersResponse] = await Promise.all([
          apiFetch(settingsUrl, {
            method: "GET",
            cache: "no-store"
          }),
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
            ? apiFetch("/api/appointments/report/filters", {
                method: "GET",
                cache: "no-store"
              })
            : Promise.resolve(null)
        ]);

        const settingsData = await readApiResponseData(settingsResponse);
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

        if (!settingsResponse.ok) {
          setMessage(settingsData?.message || "Failed to load appointment settings.");
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

        const item = settingsData?.item && typeof settingsData.item === "object"
          ? settingsData.item
          : {};

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

        setSettings(mapSchedulerSettingsFromApiItem(item));
        setSpecialists(nextSpecialists);
        setSpecialistRoleById(nextSpecialistRoleById);
        if (!vipOnly && plannerFiltersResponse?.ok) {
          const nextPlannerClients = (Array.isArray(plannerFiltersData?.clients) ? plannerFiltersData.clients : [])
            .map((client) => ({
              id: String(client?.id || "").trim(),
              firstName: String(client?.firstName || "").trim(),
              lastName: String(client?.lastName || "").trim(),
              middleName: String(client?.middleName || "").trim(),
              isVip: Boolean(client?.isVip)
            }))
            .filter((client) => Boolean(client.id))
            .sort((left, right) => getClientDisplayName(left).localeCompare(getClientDisplayName(right)));
          setPlannerFilterClients(nextPlannerClients);
        } else if (!vipOnly) {
          setPlannerFilterClients([]);
        }
        setVipClientsByClassId(vipOnly ? nextVipClientsByClassId : {});
        if (vipOnly) {
          setVipSchedulesByClass({});
          setVipSchedulesWeekKeyByClass({});
        }
        setSelectedSpecialistId((prev) => {
          if (!vipOnly && normalizedSelectedPlannerClientFilterId) {
            return "";
          }
          const persisted = readStoredSchedulerSelectionId(vipOnly);
          const preferredId = String(prev || persisted || "").trim();
          if (preferredId && nextSpecialists.some((itemValue) => itemValue.id === preferredId)) {
            return preferredId;
          }
          return nextSpecialists[0]?.id || "";
        });
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
    normalizedSelectedPlannerClientFilterId,
    selectedSpecialistId,
    vipOnly
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storageKey = getSchedulerSelectionStorageKey(vipOnly);
    const specialistId = String(selectedSpecialistId || "").trim();
    if (!specialistId) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, specialistId);
  }, [selectedSpecialistId, vipOnly]);

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
    !isClientFocusedMode
    || clientFocusedPlannerWeekKey === clientFocusedPlannerDataKey
  );
  const canRenderPlannerData = (
    isSchedulerInitialized
    && (
      vipOnly
        ? (!String(selectedSpecialistId || "").trim() || (vipSchedulesReady && vipWeekDataReady))
        : (isClientFocusedMode ? clientFocusedPlannerReady : nonVipSchedulesReady)
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
  useEffect(() => {
    if (vipOnly) {
      if (selectedPlannerClientFilterId) {
        setSelectedPlannerClientFilterId("");
      }
      return;
    }

    const normalizedClientId = String(selectedPlannerClientFilterId || "").trim();
    if (!normalizedClientId) {
      return;
    }

    const isStillVisible = plannerClientFilterOptions.some(
      (option) => String(option?.value || "").trim() === normalizedClientId
    );
    if (!isStillVisible) {
      setSelectedPlannerClientFilterId("");
    }
  }, [plannerClientFilterOptions, selectedPlannerClientFilterId, vipOnly]);
  const breaksForSpecialist = vipOnly
    ? []
    : (breaksBySpecialist[selectedSpecialistId] || []);
  const absencesForSpecialist = (
    vipOnly
    || !selectedSpecialistId
    || absencesWeekKeyBySpecialist[selectedSpecialistId] !== weekDataKey
  )
    ? []
    : (absencesBySpecialist[selectedSpecialistId] || []);
  const blockedTimesForSpecialist = useMemo(() => (
    vipOnly ? [] : normalizePlannerBlockedTimeItems(settings.blockedTimes)
  ), [settings.blockedTimes, vipOnly]);
  const findLocalScheduleConflict = useCallback(({
    appointmentDate,
    startTime,
    endTime,
    excludeAppointmentId = ""
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
    const dayItems = Array.isArray(rawAppointmentsByDay[dayKey]) ? rawAppointmentsByDay[dayKey] : [];
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
  const visibleRepeatDayKeys = useMemo(
    () => normalizeVisibleDays(settings.visibleWeekDays),
    [settings.visibleWeekDays]
  );
  const visibleRepeatDayItems = useMemo(
    () => DAY_ITEMS.filter((day) => visibleRepeatDayKeys.includes(day.key)),
    [visibleRepeatDayKeys]
  );
  const clientSelectNotFound = clientSearchMessage === "No clients found.";
  const clientSelectHasError = Boolean(createErrors.clientId) || clientSelectNotFound;
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
  const selectedSpecialistServiceName = useMemo(() => {
    const specialistId = String(createModal.specialistId || selectedSpecialistId || "").trim();
    if (!specialistId) {
      return "";
    }

    if (vipOnly) {
      const selectedClass = specialists.find((item) => String(item?.id || "").trim() === specialistId);
      const teacherId = String(selectedClass?.teacherId || "").trim();
      return String(
        specialistRoleById[teacherId]
        || specialistRoleById[specialistId]
        || ""
      ).trim();
    }

    const selectedSpecialist = specialists.find((item) => String(item?.id || "").trim() === specialistId);
    return String(
      selectedSpecialist?.role
      || specialistRoleById[specialistId]
      || ""
    ).trim();
  }, [createModal.specialistId, selectedSpecialistId, specialistRoleById, specialists, vipOnly]);
  const isEditMode = createModal.mode === "edit";
  const isEditRecurring = isEditMode
    && createModal.repeatType === "weekly"
    && Boolean(String(createModal.repeatGroupKey || "").trim());
  const normalizedEditScope = EDIT_SCOPE_OPTIONS.some((option) => option.value === createForm.editScope)
    ? createForm.editScope
    : "single";
  const shouldLockEditDate = isEditRecurring && normalizedEditScope !== "single";
  const lockedVipServiceName = String(selectedSpecialistServiceName || "").trim() || "Specialist";
  const isVipServiceLocked = Boolean(vipOnly);
  const isVipAutoRollingRepeat = Boolean(vipOnly || clientVipOnly);
  const unlockedServiceNameRef = useRef(String(createForm.service || "").trim());
  const unlockedRepeatUntilRef = useRef(String(createForm.repeatUntil || "").trim());
  const wasVipServiceLockedRef = useRef(isVipServiceLocked);
  useEffect(() => {
    if (!createModal.open || isEditRecurring) {
      return;
    }
    unlockedRepeatUntilRef.current = String(createForm.repeatUntil || "").trim();
  }, [createModal.open, isEditRecurring]);
  useEffect(() => {
    if (!createModal.open || isEditRecurring) {
      return;
    }
    if (isVipAutoRollingRepeat) {
      return;
    }
    unlockedRepeatUntilRef.current = String(createForm.repeatUntil || "").trim();
  }, [createForm.repeatUntil, createModal.open, isEditRecurring, isVipAutoRollingRepeat]);
  useEffect(() => {
    const wasVipServiceLocked = wasVipServiceLockedRef.current;
    wasVipServiceLockedRef.current = isVipServiceLocked;

    if (!createModal.open) {
      unlockedServiceNameRef.current = String(createForm.service || "").trim();
      return;
    }

    if (isVipServiceLocked) {
      if (!wasVipServiceLocked) {
        unlockedServiceNameRef.current = String(createForm.service || "").trim();
      }
      return;
    }

    if (!wasVipServiceLocked) {
      unlockedServiceNameRef.current = String(createForm.service || "").trim();
      return;
    }

    const restoredServiceName = String(unlockedServiceNameRef.current || "").trim();
    if (restoredServiceName === String(createForm.service || "").trim()) {
      return;
    }

    setCreateForm((prev) => ({ ...prev, service: restoredServiceName }));
    if (createErrors.service) {
      setCreateErrors((prev) => ({ ...prev, service: "" }));
    }
  }, [
    createErrors.service,
    createForm.service,
    createModal.open,
    isVipServiceLocked
  ]);
  useEffect(() => {
    if (!createModal.open || !isVipServiceLocked) {
      return;
    }

    setCreateForm((prev) => {
      if (String(prev.service || "").trim() === lockedVipServiceName) {
        return prev;
      }
      return {
        ...prev,
        service: lockedVipServiceName
      };
    });

    if (createErrors.service) {
      setCreateErrors((prev) => ({ ...prev, service: "" }));
    }
  }, [createErrors.service, createModal.open, isVipServiceLocked, lockedVipServiceName]);
  useEffect(() => {
    if (!createModal.open || isEditRecurring || !isVipAutoRollingRepeat || String(createForm.repeatUntil || "").trim()) {
      return;
    }
    const nextRepeatUntil = getVipAutoRollingRepeatUntil();
    if (!nextRepeatUntil || nextRepeatUntil === String(createForm.repeatUntil || "").trim()) {
      return;
    }

    setCreateForm((prev) => ({ ...prev, repeatUntil: nextRepeatUntil }));
    if (createErrors.repeatUntil) {
      setCreateErrors((prev) => ({ ...prev, repeatUntil: "" }));
    }
  }, [
    createErrors.repeatUntil,
    createForm.repeatUntil,
    createModal.open,
    isEditRecurring,
    isVipAutoRollingRepeat
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
  const selectedPlannerFilterClient = useMemo(() => (
    (Array.isArray(plannerFilterClients) ? plannerFilterClients : []).find(
      (client) => String(client?.id || "").trim() === normalizedSelectedPlannerClientFilterId
    ) || null
  ), [normalizedSelectedPlannerClientFilterId, plannerFilterClients]);
  const clientFocusedAppointmentsByDay = useMemo(() => {
    if (!isClientFocusedMode) {
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
          if (String(item?.clientId || "").trim() !== normalizedSelectedPlannerClientFilterId) {
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
    isClientFocusedMode,
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
  const clientFocusedPlannerAriaLabel = useMemo(() => {
    const clientLabel = String(clientFocusedSelectedClientLabel || "").trim();
    return clientLabel ? `${clientLabel} weekly schedule table` : "Client weekly schedule table";
  }, [clientFocusedSelectedClientLabel]);

  const loadClientFocusedPlannerView = useCallback(async () => {
    if (!isSchedulerInitialized || !isClientFocusedMode) {
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
      scheduleItems.forEach((item) => {
        const specialistId = String(item?.specialistId || "").trim();
        if (!specialistId) {
          return;
        }
        if (!specialistsById.has(specialistId)) {
          specialistsById.set(specialistId, {
            id: specialistId,
            name: String(item?.specialistName || "").trim() || `Specialist #${specialistId}`
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
    isClientFocusedMode,
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
          const serviceText = formatVipServiceLine(
            item?.specialistPosition,
            item?.serviceName,
            "",
            specialistRoleFallback
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
            secondaryText: serviceText || String(item?.serviceName || "").trim() || "Service",
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
    if (vipOnly || !selectedSpecialistId || !canReadPlannerBreaks) {
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

      const items = Array.isArray(data?.items) ? data.items : [];
      const normalizedItems = items.map((item) => ({
        dayKey: String(item?.dayKey || "").trim().toLowerCase(),
        dayOfWeek: Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10) || 0,
        breakType: normalizeBreakTypeKey(item?.breakType || ""),
        title: String(item?.title || "").trim(),
        note: String(item?.note || "").trim(),
        startTime: String(item?.startTime || "").trim(),
        endTime: String(item?.endTime || "").trim(),
        isActive: item?.isActive !== false
      }));

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
  }, [canReadPlannerBreaks, selectedSpecialistId, vipOnly]);

  const loadAbsencesForSelectedSpecialist = useCallback(async () => {
    if (vipOnly || !selectedSpecialistId || weekDays.length === 0 || !canViewAppointmentSpecialistAbsenceBlocks) {
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

  useEffect(() => {
    loadSchedulesForCurrentWeek();
  }, [loadSchedulesForCurrentWeek]);

  useEffect(() => {
    if (!isClientFocusedMode) {
      setClientFocusedPlannerSpecialists([]);
      setClientFocusedSchedulesBySpecialist({});
      setClientFocusedPlannerWeekKey("");
      return;
    }
    void loadClientFocusedPlannerView();
  }, [isClientFocusedMode, loadClientFocusedPlannerView]);

  useEffect(() => {
    loadBreaksForSelectedSpecialist();
  }, [loadBreaksForSelectedSpecialist]);

  useEffect(() => {
    loadAbsencesForSelectedSpecialist();
  }, [loadAbsencesForSelectedSpecialist]);

  function closeCreateModal() {
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
      repeatGroupKey: ""
    });
    setCreateForm(createEmptyClientForm());
    setCreateErrors({});
    setCreateSubmitting(false);
    setCreateDeleting(false);
    setClientVipOnly(Boolean(vipOnly));
    setClientSearch(createEmptyClientSearchForm());
    setClientSearchMessage("");
    setClientOptions([]);
    setClientNoShowSummary(null);
  }

  function openCreateModal(day, slot, existingItem = null, specialistIdOverride = "") {
    const isEditMode = Boolean(existingItem);
    const slotSpecialistId = isEditMode
      ? String(existingItem?.specialistId || "").trim()
      : String(specialistIdOverride || selectedSpecialistId || "").trim();
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
    } else if (!canCreateOnPlannerSpecialist(slotSpecialistId)) {
      setMessage(
        canCreateAppointments
          ? "You can only create appointments in your own planner."
          : "You do not have permission to create appointments."
      );
      return;
    }

    if (!slotSpecialistId) {
      setSpecialistSelectError(true);
      return;
    }
    setSpecialistSelectError(false);
    setMessage("");
    const appointmentDate = formatDateYmd(day.date);
    const startTime = String(slot || "").trim();
    const defaultDuration = durationSelectOptions[0]?.value || "30";
    const existingDuration = String(existingItem?.durationMinutes || "").trim()
      || getDurationMinutesFromTimes(existingItem?.time, existingItem?.endTime);
    const nextDuration = isEditMode && existingDuration
      ? existingDuration
      : defaultDuration;
    const preselectedClientId = isEditMode
      ? String(existingItem?.clientId || "").trim()
      : String(selectedPlannerClientFilterId || "").trim();
    const existingClientIsVip = Boolean(existingItem?.isVip);
    const existingAutoRollingRepeat = Boolean(existingItem?.isAutoRollingRepeat);

    setClientVipOnly(Boolean(vipOnly || existingAutoRollingRepeat));
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
            isVip: existingClientIsVip || Boolean(previousClient?.isVip),
            note: String(previousClient?.note || "").trim()
          }
        };
      });
    }

    setCreateModal({
      open: true,
      mode: existingItem ? "edit" : "create",
      appointmentId: String(existingItem?.id || ""),
      specialistId: slotSpecialistId,
      dayKey: day.key,
      dayLabel: day.label,
      date: day.date,
      time: slot,
      repeatType: String(existingItem?.repeatType || "none").trim().toLowerCase(),
      repeatGroupKey: String(existingItem?.repeatGroupKey || "").trim()
    });
    const isExistingRecurring = Boolean(
      String(existingItem?.repeatType || "").trim().toLowerCase() === "weekly"
      && String(existingItem?.repeatGroupKey || "").trim()
    );
    if (existingItem) {
      setCreateForm({
        clientId: preselectedClientId,
        appointmentDate,
        startTime,
        durationMinutes: nextDuration,
        service: String(existingItem?.service || DEFAULT_APPOINTMENT_SERVICE_NAME),
        status: String(existingItem?.status || "pending"),
        note: String(existingItem?.note || ""),
        editScope: "single",
        repeatEnabled: false,
        repeatUntil: isExistingRecurring ? "" : appointmentDate,
        repeatDays: []
      });
    } else {
      const defaultRepeatUntil = recurringOnly
        ? formatDateYmd(getEndOfNextWeek(day.date))
        : "";
      const defaultRepeatDays = recurringOnly ? [day.key] : [];
      const nextCreateForm = createEmptyClientForm({
        appointmentDate,
        startTime,
        durationMinutes: nextDuration,
        repeatEnabled: recurringOnly,
        repeatUntil: defaultRepeatUntil,
        repeatDays: defaultRepeatDays
      });
      nextCreateForm.clientId = preselectedClientId;
      setCreateForm(nextCreateForm);
    }
    setCreateErrors({});
  }

  useEffect(() => {
    if (!createModal.open) {
      return;
    }
    if (vipOnly) {
      setClientSearchMessage("");
      setClientOptions([]);
      return;
    }
    const trimmedFirstName = String(clientSearch.firstName || "").trim();
    const trimmedLastName = String(clientSearch.lastName || "").trim();
    const combinedLength = `${trimmedFirstName}${trimmedLastName}`.length;
    if (combinedLength === 0) {
      setClientSearchMessage("");
      setClientOptions([]);
      return;
    }
    if (combinedLength < 3) {
      setClientSearchMessage("Type at least 3 letters.");
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
              isVip: Boolean(item?.isVip),
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
  }, [clientSearch.firstName, clientSearch.lastName, createModal.open, vipOnly]);

  useEffect(() => {
    if (!createModal.open) {
      setClientNoShowSummary(null);
      return;
    }

    const clientId = String(createForm.clientId || "").trim();
    if (!clientId) {
      setClientNoShowSummary(null);
      return;
    }

    let active = true;
    const timerId = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ clientId }).toString();
        const response = await apiFetch(`/api/appointments/client-no-show-summary?${query}`, {
          method: "GET",
          cache: "no-store"
        });
        const data = await readApiResponseData(response);
        if (!active) {
          return;
        }
        if (!response.ok) {
          setClientNoShowSummary(null);
          return;
        }
        const item = data?.item;
        if (!item || typeof item !== "object") {
          setClientNoShowSummary(null);
          return;
        }

        const noShowCount = Number.parseInt(String(item.noShowCount), 10);
        const noShowThreshold = Number.parseInt(String(item.noShowThreshold), 10);
        setClientNoShowSummary({
          noShowCount: Number.isInteger(noShowCount) && noShowCount >= 0 ? noShowCount : 0,
          noShowThreshold: Number.isInteger(noShowThreshold) && noShowThreshold > 0 ? noShowThreshold : 1,
          isAtRisk: Boolean(item.isAtRisk)
        });
      } catch {
        if (active) {
          setClientNoShowSummary(null);
        }
      }
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [createForm.clientId, createModal.open]);

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
      const nextDays = visibleRepeatDayKeys.filter((day) => currentDays.includes(day));

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
    if (note.length > 255) {
      errors.note = "Note is too long.";
    }
    const shouldValidateRepeat = !isEditMode || allowRepeatValidationInEdit;
    if (shouldValidateRepeat) {
      const wantsRepeat = repeatDays.length > 0;
      if (requireRepeat && !wantsRepeat) {
        errors.repeatDays = "Select at least one repeat day.";
      }
      if (wantsRepeat || requireRepeat) {
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

    if (!createModal.open) {
      return;
    }
    if (!isEditMode && !canCreateOnPlannerSpecialist(createModal.specialistId)) {
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
        editScope: EDIT_SCOPE_OPTIONS.some((option) => option.value === createForm.editScope)
          ? createForm.editScope
          : "single",
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

      const allowRepeatValidationInEdit = isEditMode && !isEditRecurring;
      const errors = validateCreateForm(nextPayload, {
        isEditMode,
        allowRepeatValidationInEdit,
        requireRepeat: recurringOnly && !isEditMode
      });
      if (Object.keys(errors).length > 0) {
        setCreateErrors(errors);
        return;
      }

      const specialistId = String(createModal.specialistId || "");
      if (!specialistId) {
        setCreateErrors({ specialistId: "Specialist is required." });
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
      if (ACTIVE_SCHEDULE_STATUSES.has(normalizedStatus)) {
        const localConflict = findLocalScheduleConflict({
          appointmentDate,
          startTime,
          endTime,
          excludeAppointmentId: isEditMode ? String(createModal.appointmentId || "").trim() : ""
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

      // Pre-save norm check: warn before creating if weekly limit is exceeded
      if (!isEditMode) {
        try {
          const normCheckQuery = new URLSearchParams({
            specialistId: String(specialistId),
            clientId: String(nextPayload.clientId),
            date: appointmentDate
          }).toString();
          const normCheckResponse = await apiFetch(
            `/api/appointments/schedules/norm-check?${normCheckQuery}`
          );
          if (normCheckResponse.ok) {
            const normCheckData = await readApiResponseData(normCheckResponse);
            const violations = Array.isArray(normCheckData?.violations) ? normCheckData.violations : [];
            if (violations.length > 0) {
              const v = violations[0];
              const warnMsg = `Warning: ${v.positionLabel}: this client already has ${v.currentCount} sessions this week (max: ${v.maxPerWeek}).\n\nProceed anyway?`;
              if (!window.confirm(warnMsg)) {
                return;
              }
            }
          }
        } catch {
          // norm check failure must not prevent appointment creation
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
      const shouldSendRepeat = recurringOnly
        ? (!isEditMode || !isEditRecurring)
        : (
          nextPayload.repeatDays.length > 0
          && (!isEditMode || !isEditRecurring)
        );
      if (shouldSendRepeat) {
        requestPayload.repeat = {
          enabled: true,
          type: "weekly",
          untilDate: nextPayload.repeatUntil,
          dayKeys: nextPayload.repeatDays,
          skipConflicts: true,
          autoRolling: isVipAutoRollingRepeat
        };
      }

      const requestUrl = isEditMode
        ? `/api/appointments/schedules/${encodeURIComponent(String(createModal.appointmentId || ""))}?scope=${encodeURIComponent(nextPayload.editScope)}`
        : "/api/appointments/schedules";
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

      await loadSchedulesForCurrentWeek();
      await loadClientFocusedPlannerView();
      if (isEditMode) {
        setMessage("");
      } else {
        setMessage(String(data?.message || "Client added to planner."));
      }
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

      const deleteScope = EDIT_SCOPE_OPTIONS.some((option) => option.value === createForm.editScope)
        ? createForm.editScope
        : "single";
      const query = new URLSearchParams({ scope: deleteScope }).toString();
      const response = await apiFetch(`/api/appointments/schedules/${encodeURIComponent(appointmentId)}?${query}`, {
        method: "DELETE"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        setCreateErrors({ form: data?.message || "Failed to delete appointment." });
        return;
      }

      await loadSchedulesForCurrentWeek();
      await loadClientFocusedPlannerView();
      setMessage(String(data?.message || "Appointment deleted."));
      closeCreateModal();
    } catch {
      setCreateErrors({ form: "Failed to delete appointment." });
    } finally {
      setCreateDeleting(false);
    }
  }

  function toggleRepeatDay(dayKey) {
    const normalizedDayKey = String(dayKey || "").trim().toLowerCase();
    if (!visibleRepeatDayKeys.includes(normalizedDayKey)) {
      return;
    }

    setCreateForm((prev) => {
      const currentDays = Array.isArray(prev.repeatDays)
        ? prev.repeatDays.map((day) => String(day || "").trim().toLowerCase()).filter((day) => DAY_KEYS_SET.has(day))
        : [];
      const daySet = new Set(currentDays);
      if (daySet.has(normalizedDayKey)) {
        daySet.delete(normalizedDayKey);
      } else {
        daySet.add(normalizedDayKey);
      }

      return {
        ...prev,
        repeatDays: visibleRepeatDayKeys.filter((key) => daySet.has(key))
      };
    });

    if (createErrors.repeatDays) {
      setCreateErrors((prev) => ({ ...prev, repeatDays: "" }));
    }
  }

  useEffect(() => {
    document.body.style.overflow = createModal.open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [createModal.open]);

  useEffect(() => {
    if (!createModal.open) {
      return;
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        closeCreateModal();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [createModal.open]);

  const showNoShowWarning = Boolean(
    createForm.clientId
    && clientNoShowSummary
    && clientNoShowSummary.noShowCount >= clientNoShowSummary.noShowThreshold
  );
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

    window.alert(text);
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
                  setSelectedSpecialistId(nextValue);
                  if (selectedPlannerClientFilterId) {
                    setSelectedPlannerClientFilterId("");
                  }
                  if (specialistSelectError) {
                    setSpecialistSelectError(false);
                  }
                }}
              />
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
                  options={plannerClientFilterOptions}
                  searchable
                  searchPlaceholder="Search client"
                  searchThreshold={0}
                  maxVisibleOptions={10}
                  disabled={plannerClientFilterOptions.length <= 1}
                  onChange={(nextValue) => {
                    const nextClientId = String(nextValue || "").trim();
                    setSelectedPlannerClientFilterId(nextClientId);
                    if (nextClientId) {
                      setSelectedSpecialistId("");
                    }
                  }}
                />
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
            <p className="all-users-state" hidden={Boolean(selectedSpecialistId) && vipWeeklyClientRows.length > 0}>
              {selectedSpecialistId ? "No VIP clients found in selected class." : "Select class to view schedules."}
            </p>
            <div
              className="appointment-vip-weekly-grid-wrap"
              key={weekRenderKey}
              hidden={!selectedSpecialistId || vipWeeklyClientRows.length === 0}
            >
              <table className="appointment-vip-weekly-grid" aria-label="VIP class weekly schedule table">
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
              selectedClientId={normalizedSelectedPlannerClientFilterId}
              breaksForSpecialist={[]}
              blockedTimesForSpecialist={[]}
              absencesForSpecialist={[]}
              slotCellHeightPx={slotCellHeightPx}
              now={now}
              canCreateOnSpecialist={false}
              canUpdateAppointments={canUpdateAppointments}
              canDeleteAppointments={canDeleteAppointments}
              canMutateAppointmentSpecialist={canMutateAppointmentSpecialist}
              onOpenCreateModal={openCreateModal}
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
            breaksForSpecialist={breaksForSpecialist}
            blockedTimesForSpecialist={blockedTimesForSpecialist}
            absencesForSpecialist={absencesForSpecialist}
            slotCellHeightPx={slotCellHeightPx}
            now={now}
            canCreateOnSpecialist={canCreateOnPlannerSpecialist(selectedSpecialistId)}
            canUpdateAppointments={canUpdateAppointments}
            canDeleteAppointments={canDeleteAppointments}
            canMutateAppointmentSpecialist={canMutateAppointmentSpecialist}
            onOpenCreateModal={openCreateModal}
          />
        )
        )
      ) : (
        vipOnly ? (
          <div className="appointment-vip-weekly-grid-wrap" aria-hidden="true">
            <table className="appointment-vip-weekly-grid">
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

      {createModal.open && !vipOnly && (() => {
        const modalContent = (
          <>
          <section id="appointmentCreateClientModal" className="logout-confirm-modal appointment-create-modal">
            <div className="appointment-create-head">
              <h3>{modalTitle}</h3>
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

              {/* ── Client ── */}
              <div className="appointment-modal-section">
                {!vipOnly && !isVipRecurringModal ? (
                  <div className="appointment-client-search-row">
                    <div className="field">
                      <label htmlFor="appointmentClientSearchFirst">First name</label>
                      <input
                        id="appointmentClientSearchFirst"
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
                      <label htmlFor="appointmentClientSearchLast">Last name</label>
                      <input
                        id="appointmentClientSearchLast"
                        type="text"
                        placeholder="Last name"
                        value={clientSearch.lastName}
                        onInput={(event) => {
                          const nextValue = event.currentTarget.value;
                          setClientSearch((prev) => ({ ...prev, lastName: nextValue }));
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {!vipOnly ? (
                  <div className="appointment-client-select-row">
                    <div className="field appointment-client-vip-field">
                      <label htmlFor="appointmentClientVipOnly">Active</label>
                      <label
                        className={`appointment-client-vip-toggle${(vipOnly || clientVipOnly) ? " is-active" : ""}`}
                        htmlFor="appointmentClientVipOnly"
                      >
                        <input
                          id="appointmentClientVipOnly"
                          type="checkbox"
                          checked={vipOnly || clientVipOnly}
                          disabled={vipOnly || createSubmitting || createDeleting}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            const restoredRepeatUntil = String(unlockedRepeatUntilRef.current || "").trim();
                            if (checked) {
                              unlockedRepeatUntilRef.current = String(createForm.repeatUntil || "").trim();
                            }
                            setClientVipOnly(checked);
                            setCreateForm((prev) => {
                              if (checked) {
                                const nextRepeatUntil = getVipAutoRollingRepeatUntil();
                                if (!nextRepeatUntil) {
                                  return prev;
                                }
                                return { ...prev, repeatUntil: nextRepeatUntil };
                              }
                              if (String(prev.repeatUntil || "").trim() === restoredRepeatUntil) {
                                return prev;
                              }
                              return { ...prev, repeatUntil: restoredRepeatUntil };
                            });
                            if (createErrors.repeatUntil) {
                              setCreateErrors((prev) => ({ ...prev, repeatUntil: "" }));
                            }
                          }}
                        />
                      </label>
                    </div>
                    <div className="field">
                      <label htmlFor="appointmentCreateClientSelect">Client</label>
                      <CustomSelect
                        id="appointmentCreateClientSelect"
                        placeholder="Select client"
                        value={createForm.clientId}
                        options={clientSelectOptions}
                        maxVisibleOptions={10}
                        menuPortal
                        error={clientSelectHasError}
                        onChange={(nextValue) => {
                          setCreateForm((prev) => ({ ...prev, clientId: nextValue }));
                          if (createErrors.clientId) {
                            setCreateErrors((prev) => ({ ...prev, clientId: "" }));
                          }
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── Date / Time / Service ── */}
              <div className="appointment-modal-section">
                <div
                  className={`appointment-create-date-time-row${isVipRecurringModal ? " appointment-create-date-time-row-vip" : ""}`}
                >
                  {!isVipRecurringModal ? (
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
                            if (!prev.repeatUntil || prev.repeatUntil < nextValue) {
                              nextForm.repeatUntil = nextValue;
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
                  ) : null}

                  <div className="field">
                    <label htmlFor="appointmentCreateTime">Start Time</label>
                    <CustomSelect
                      id="appointmentCreateTime"
                      placeholder="Select start time"
                      value={createForm.startTime}
                      options={timeSelectOptions}
                      menuWidthScale={0.85}
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
                    disabled={isVipServiceLocked || createSubmitting || createDeleting}
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

              {/* ── Repeat ── */}
              {!isVipRecurringModal && !isEditRecurring ? (
                <div className="appointment-modal-section">
                  <div className="appointment-repeat-block">
                    <div className="appointment-create-date-time-row appointment-repeat-head-row">
                      <div className="field appointment-repeat-until-field">
                        <label htmlFor="appointmentCreateRepeatUntil">Repeat Until</label>
                        <input
                          id="appointmentCreateRepeatUntil"
                          type="date"
                          className={createErrors.repeatUntil ? "input-error" : ""}
                          value={createForm.repeatUntil}
                          min={createForm.appointmentDate || undefined}
                          onInput={(event) => {
                            const nextValue = event.currentTarget.value;
                            setCreateForm((prev) => ({ ...prev, repeatUntil: nextValue }));
                            if (createErrors.repeatUntil) {
                              setCreateErrors((prev) => ({ ...prev, repeatUntil: "" }));
                            }
                          }}
                        />
                      </div>
                      <div className="field appointment-repeat-title-field">
                        <label>Repeat weekly</label>
                        <div className="appointment-repeat-days" role="group" aria-label="Repeat weekdays">
                          {visibleRepeatDayItems.map((day) => {
                            const checked = Array.isArray(createForm.repeatDays) && createForm.repeatDays.includes(day.key);
                            return (
                              <label
                                key={day.key}
                                className={`appointment-repeat-day-chip${checked ? " is-active" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleRepeatDay(day.key)}
                                />
                                <span>{day.label.slice(0, 3)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <small className="field-error">{createErrors.repeatDays || createErrors.repeatUntil || ""}</small>
                  </div>
                </div>
              ) : null}

              {/* ── Edit scope (recurring only) ── */}
              {createModal.mode === "edit" && isEditRecurring ? (
                <div className="appointment-modal-section">
                  <div className="field appointment-edit-scope-field">
                    <label htmlFor="appointmentEditScope">Apply to</label>
                    <CustomSelect
                      id="appointmentEditScope"
                      placeholder="Select scope"
                      value={normalizedEditScope}
                      options={EDIT_SCOPE_OPTIONS}
                      menuPortal
                      forceOpenDown={!compactWeekRange}
                      forceOpenUp={compactWeekRange}
                      onChange={(nextValue) => {
                        const nextScope = EDIT_SCOPE_OPTIONS.some((option) => option.value === nextValue)
                          ? nextValue
                          : "single";
                        setCreateForm((prev) => ({ ...prev, editScope: nextScope }));
                      }}
                    />
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
                        }}
                      />
                    </div>
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

                {showNoShowWarning ? (
                  <p className="appointment-create-warning" role="status" aria-live="polite">
                    Warning: this client has {clientNoShowSummary.noShowCount} no-shows.
                  </p>
                ) : null}

                {createErrors.form ? (
                  <small className="field-error appointment-form-error">{createErrors.form}</small>
                ) : null}
              </div>
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
                      createModal.mode === "edit"
                        ? (!canUpdateAppointments || !canMutateModalSpecialist)
                        : !canCreateOnPlannerSpecialist(createModal.specialistId)
                    )
                  }
                >
                  {createSubmitting ? "Saving..." : "Save"}
                </button>
                <button
                  className="header-btn logout-confirm-yes"
                  type="button"
                  disabled={createModal.mode !== "edit" || createSubmitting || createDeleting || !canDeleteAppointments || !canMutateModalSpecialist}
                  onClick={handleDeleteAppointment}
                >
                  {createDeleting ? "Deleting..." : "Delete"}
                </button>
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
