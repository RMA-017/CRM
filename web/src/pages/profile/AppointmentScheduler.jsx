import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../components/CustomSelect.jsx";
import { apiFetch } from "../../lib/api.js";

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
const ACTIVE_SCHEDULE_STATUSES = new Set(["pending", "confirmed"]);
const FULL_CELL_BREAK_TYPES = new Set(["lunch", "meeting", "training", "other"]);

function readStoredSpecialistId() {
  if (typeof window === "undefined") {
    return "";
  }
  return String(window.localStorage.getItem(APPOINTMENT_SPECIALIST_STORAGE_KEY) || "").trim();
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
    service: "",
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
  const fullName = [firstName, lastName, middleName].filter(Boolean).join(" ");
  return fullName || `Client #${String(client?.id || "").trim()}`;
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

function formatBreakReason(item) {
  const title = String(item?.title || "").trim();
  if (title) {
    return {
      full: title,
      short: truncateWithEllipsis(title, 16)
    };
  }

  const breakType = String(item?.breakType || "break").trim().toLowerCase();
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
  const normalizedType = String(breakType || "").trim().toLowerCase();
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

function AppointmentScheduler({
  canCreateAppointments = true,
  canUpdateAppointments = true,
  canDeleteAppointments = true,
  currentUserId = "",
  restrictCreateToOwnSpecialist = false,
  vipOnly = false,
  recurringOnly = false,
  showWeekSwitcher = true,
  modalTitle = "To Schedule",
  onNotification = null
}) {
  const isVipRecurringModal = vipOnly && recurringOnly;
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [compactWeekRange, setCompactWeekRange] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(max-width: 860px)").matches;
  });
  const [specialists, setSpecialists] = useState([]);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState(readStoredSpecialistId);
  const [specialistSelectError, setSpecialistSelectError] = useState(false);
  const [appointmentsBySpecialist, setAppointmentsBySpecialist] = useState(() => ({}));
  const [breaksBySpecialist, setBreaksBySpecialist] = useState(() => ({}));
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
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [clientSearchMessage, setClientSearchMessage] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [clientMap, setClientMap] = useState({});
  const [clientNoShowSummary, setClientNoShowSummary] = useState(null);
  const [clientNoShowLoading, setClientNoShowLoading] = useState(false);
  const [settings, setSettings] = useState({
    slotInterval: "30",
    slotSubDivisions: "1",
    appointmentDurationOptions: ["30"],
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    workingHours: createDefaultWorkingHours()
  });
  const schedulesRequestIdRef = useRef(0);
  const breaksRequestIdRef = useRef(0);
  const normalizedCurrentUserId = String(currentUserId || "").trim();
  const normalizedSelectedSpecialistId = String(selectedSpecialistId || "").trim();
  const canMutateSelectedSpecialist = (
    !restrictCreateToOwnSpecialist
    || (Boolean(normalizedCurrentUserId) && normalizedCurrentUserId === normalizedSelectedSpecialistId)
  );
  const canCreateOnSelectedSpecialist = canCreateAppointments && (
    canMutateSelectedSpecialist
  );

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
        setLoading(true);
        setMessage("");

        const [settingsResponse, specialistsResponse] = await Promise.all([
          apiFetch("/api/appointments/settings", {
            method: "GET",
            cache: "no-store"
          }),
          apiFetch("/api/appointments/specialists", {
            method: "GET",
            cache: "no-store"
          })
        ]);

        const settingsData = await settingsResponse.json().catch(() => ({}));
        const specialistsData = await specialistsResponse.json().catch(() => ({}));

        if (!active) {
          return;
        }

        if (!settingsResponse.ok) {
          setMessage(settingsData?.message || "Failed to load appointment settings.");
          return;
        }

        if (!specialistsResponse.ok) {
          setMessage(specialistsData?.message || "Failed to load specialists.");
          return;
        }

        const item = settingsData?.item && typeof settingsData.item === "object"
          ? settingsData.item
          : {};

        const visibleWeekDays = normalizeVisibleDays(item.visibleWeekDays);
        const nextWorkingHours = createDefaultWorkingHours();
        if (item.workingHours && typeof item.workingHours === "object") {
          DAY_ITEMS.forEach((day) => {
            nextWorkingHours[day.key] = {
              start: String(item.workingHours?.[day.key]?.start || ""),
              end: String(item.workingHours?.[day.key]?.end || "")
            };
          });
        }

        const nextSpecialists = Array.isArray(specialistsData?.items)
          ? specialistsData.items.map((itemValue) => ({
              id: String(itemValue?.id || ""),
              name: String(itemValue?.name || "").trim() || "Specialist",
              role: String(itemValue?.role || "").trim() || "Specialist"
            })).filter((itemValue) => Boolean(itemValue.id))
          : [];

        setSettings({
          slotInterval: String(item.slotInterval || "30"),
          slotSubDivisions: String(item.slotSubDivisions || "1"),
          appointmentDurationOptions: Array.isArray(item.appointmentDurationOptions) && item.appointmentDurationOptions.length > 0
            ? item.appointmentDurationOptions.map((value) => String(value))
            : [String(item.appointmentDuration || "30")],
          visibleWeekDays,
          workingHours: nextWorkingHours
        });
        setSpecialists(nextSpecialists);
        setSelectedSpecialistId((prev) => {
          const persisted = readStoredSpecialistId();
          const preferredId = String(prev || persisted || "").trim();
          if (preferredId && nextSpecialists.some((itemValue) => itemValue.id === preferredId)) {
            return preferredId;
          }
          return nextSpecialists[0]?.id || "";
        });
      } catch {
        if (active) {
          setMessage("Failed to load appointment scheduler.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const specialistId = String(selectedSpecialistId || "").trim();
    if (!specialistId) {
      window.localStorage.removeItem(APPOINTMENT_SPECIALIST_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(APPOINTMENT_SPECIALIST_STORAGE_KEY, specialistId);
  }, [selectedSpecialistId]);

  const weekDays = useMemo(() => {
    const baseStart = getStartOfWeek(new Date());
    const targetStart = addDays(baseStart, weekOffset * 7);
    const visibleDays = normalizeVisibleDays(settings.visibleWeekDays);

    return DAY_ITEMS
      .filter((day) => visibleDays.includes(day.key))
      .map((day) => ({
        key: day.key,
        label: day.label,
        date: addDays(targetStart, day.offset)
      }));
  }, [settings.visibleWeekDays, weekOffset]);

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

  const appointmentsByDay = appointmentsBySpecialist[selectedSpecialistId] || {};
  const breaksForSpecialist = breaksBySpecialist[selectedSpecialistId] || [];
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
      const dayHours = settings.workingHours?.[day.key] || {};
      acc[day.key] = {
        start: normalizeTimeToMinutes(dayHours.start),
        end: normalizeTimeToMinutes(dayHours.end)
      };
      return acc;
    }, {})
  ), [settings.workingHours]);
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
    const interval = Number.parseInt(String(settings.slotInterval), 10) || 30;
    const subDivisions = Math.max(1, Number.parseInt(String(settings.slotSubDivisions), 10) || 1);
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
          for (let i = startIndex + 1; i < startIndex + span && i < timeSlots.length; i++) {
            if (!spanMap[timeSlots[i]]) {
              spanMap[timeSlots[i]] = 0;
            }
          }
        }
      });
      acc[day.key] = spanMap;
      return acc;
    }, {});
  }, [appointmentLookupByDay, settings.slotInterval, settings.slotSubDivisions, slotIndexByValue, timeSlots, weekDays]);
  const appointmentBlockedSlotsByDay = useMemo(() => (
    weekDays.reduce((acc, day) => {
      const dayItems = Array.isArray(appointmentsByDay[day.key]) ? appointmentsByDay[day.key] : [];
      const startSlots = new Set(
        dayItems
          .map((event) => String(event?.time || "").trim())
          .filter(Boolean)
      );
      const blockedByTime = {};

      dayItems.forEach((event) => {
        const startSlot = String(event?.time || "").trim();
        const startMinutes = normalizeTimeToMinutes(event?.time);
        const endMinutes = normalizeTimeToMinutes(event?.endTime);
        if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
          return;
        }

        const status = String(event?.status || "pending").trim().toLowerCase();
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
            blockedByTime[slot] = { status };
          }
          return;
        }

        // Fallback for unexpected non-aligned start times.
        timeSlots.forEach((slot) => {
          const slotMinutes = slotMinutesByValue[slot];
          if (slotMinutes === null || slotMinutes <= startMinutes || slotMinutes >= endMinutes) {
            return;
          }
          if (startSlots.has(slot) || blockedByTime[slot]) {
            return;
          }
          blockedByTime[slot] = { status };
        });
      });

      acc[day.key] = blockedByTime;
      return acc;
    }, {})
  ), [appointmentsByDay, slotIndexByValue, slotMinutesByValue, timeSlots, weekDays]);
  const appointmentBreakSlotsByDay = useMemo(() => (
    weekDays.reduce((acc, day) => {
      const blockedByTime = {};
      const ranges = [];

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
          breakType: String(item?.breakType || "break").trim().toLowerCase(),
          reason: formatBreakReason(item)
        });
      });

      if (ranges.length > 0) {
        timeSlots.forEach((slot) => {
          const slotMinutes = slotMinutesByValue[slot];
          if (slotMinutes === null) {
            return;
          }
          const hit = ranges.find((range) => slotMinutes >= range.start && slotMinutes < range.end);
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
  const specialCellRowSpanByDay = useMemo(() => {
    const subDivisions = Math.max(1, Number.parseInt(String(settings.slotSubDivisions), 10) || 1);
    if (subDivisions <= 1) {
      return weekDays.reduce((acc, day) => {
        acc[day.key] = {};
        return acc;
      }, {});
    }

    return weekDays.reduce((acc, day) => {
      const spanMap = {};
      const appointmentSpanMap = appointmentRowSpanByDay[day.key] || {};
      const dayAppointments = appointmentLookupByDay[day.key] || {};
      const dayBlockedSlots = appointmentBlockedSlotsByDay[day.key] || {};
      const dayBreakSlots = appointmentBreakSlotsByDay[day.key] || {};
      const dayMinutes = workingHoursMinutesByDay[day.key] || { start: null, end: null };

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
          if (dayAppointments[groupSlot] || dayBlockedSlots[groupSlot] || dayBreakSlots[groupSlot]) {
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
          continue;
        }

        const firstBreakType = String(dayBreakSlots[firstSlot]?.breakType || "").trim().toLowerCase();
        if (!isEligibleBreakTypeForFullCell(firstBreakType)) {
          continue;
        }

        const canMergeBreakSlots = groupSlots.every((groupSlot) => {
          if (appointmentSpanMap[groupSlot] === 0) {
            return false;
          }
          if (dayAppointments[groupSlot] || dayBlockedSlots[groupSlot]) {
            return false;
          }
          const breakType = String(dayBreakSlots[groupSlot]?.breakType || "").trim().toLowerCase();
          return isEligibleBreakTypeForFullCell(breakType) && breakType === firstBreakType;
        });

        if (canMergeBreakSlots) {
          spanMap[firstSlot] = groupSlots.length;
          groupSlots.slice(1).forEach((groupSlot) => {
            spanMap[groupSlot] = 0;
          });
        }
      }

      acc[day.key] = spanMap;
      return acc;
    }, {});
  }, [
    appointmentBlockedSlotsByDay,
    appointmentBreakSlotsByDay,
    appointmentLookupByDay,
    appointmentRowSpanByDay,
    settings.slotSubDivisions,
    slotMinutesByValue,
    timeSlots,
    weekDays,
    workingHoursMinutesByDay
  ]);
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
    const dayItems = Array.isArray(appointmentsByDay[dayKey]) ? appointmentsByDay[dayKey] : [];
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
  }, [appointmentsByDay]);
  const specialistOptions = useMemo(() => (
    specialists.map((specialist) => ({
      value: specialist.id,
      label: `${specialist.name} (${specialist.role})`
    }))
  ), [specialists]);
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
  const now = new Date();

  const loadSchedulesForCurrentWeek = useCallback(async () => {
    if (!selectedSpecialistId || weekDays.length === 0) {
      return;
    }

    const dateFrom = formatDateYmd(weekDays[0].date);
    const dateTo = formatDateYmd(weekDays[weekDays.length - 1].date);
    if (!dateFrom || !dateTo) {
      return;
    }
    const requestId = schedulesRequestIdRef.current + 1;
    schedulesRequestIdRef.current = requestId;

    try {
      const queryParams = new URLSearchParams({
        specialistId: selectedSpecialistId,
        dateFrom,
        dateTo
      });
      if (vipOnly) {
        queryParams.set("vipOnly", "true");
      }
      if (recurringOnly) {
        queryParams.set("recurringOnly", "true");
      }

      const response = await apiFetch(`/api/appointments/schedules?${queryParams.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (requestId !== schedulesRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        setMessage(data?.message || "Failed to load appointments.");
        setAppointmentsBySpecialist((prev) => ({
          ...prev,
          [selectedSpecialistId]: {}
        }));
        return;
      }

      const byDay = weekDays.reduce((acc, day) => {
        acc[day.key] = [];
        return acc;
      }, {});

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

        const nextCard = {
          id: String(item?.id || ""),
          clientId: String(item?.clientId || ""),
          time: startTime,
          endTime: String(item?.endTime || "").trim(),
          durationMinutes: String(item?.durationMinutes || "").trim() || getDurationMinutesFromTimes(startTime, item?.endTime),
          client: getClientCardName({
            id: item?.clientId,
            firstName: item?.clientFirstName,
            lastName: item?.clientLastName
          }),
          service: String(item?.serviceName || "").trim(),
          status: String(item?.status || "pending").trim().toLowerCase(),
          note: String(item?.note || "").trim(),
          repeatType: String(item?.repeatType || "none").trim().toLowerCase(),
          repeatGroupKey: String(item?.repeatGroupKey || "").trim()
        };

        byDay[dayKey].push(nextCard);
      });

      Object.keys(byDay).forEach((dayKey) => {
        byDay[dayKey].sort((left, right) => String(left.time || "").localeCompare(String(right.time || "")));
      });

      setAppointmentsBySpecialist((prev) => ({
        ...prev,
        [selectedSpecialistId]: byDay
      }));
    } catch {
      if (requestId !== schedulesRequestIdRef.current) {
        return;
      }
      setMessage("Failed to load appointments.");
    }
  }, [recurringOnly, selectedSpecialistId, vipOnly, weekDays]);

  const loadBreaksForSelectedSpecialist = useCallback(async () => {
    if (!selectedSpecialistId) {
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
      const data = await response.json().catch(() => ({}));
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
        breakType: String(item?.breakType || "").trim().toLowerCase(),
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
  }, [selectedSpecialistId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleExternalAppointmentChange = () => {
      loadSchedulesForCurrentWeek();
      loadBreaksForSelectedSpecialist();
    };

    window.addEventListener("crm:appointment-change", handleExternalAppointmentChange);
    return () => {
      window.removeEventListener("crm:appointment-change", handleExternalAppointmentChange);
    };
  }, [loadBreaksForSelectedSpecialist, loadSchedulesForCurrentWeek]);

  useEffect(() => {
    loadSchedulesForCurrentWeek();
  }, [loadSchedulesForCurrentWeek]);

  useEffect(() => {
    loadBreaksForSelectedSpecialist();
  }, [loadBreaksForSelectedSpecialist]);

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
    setClientSearchLoading(false);
    setClientSearchMessage("");
    setClientOptions([]);
    setClientNoShowSummary(null);
    setClientNoShowLoading(false);
  }

  function openCreateModal(day, slot, existingItem = null) {
    const isEditMode = Boolean(existingItem);
    if (isEditMode) {
      if (!canMutateSelectedSpecialist) {
        setMessage("You can only edit appointments in your own schedule.");
        return;
      }
      if (!canUpdateAppointments && !canDeleteAppointments) {
        setMessage("You do not have permission to edit appointments.");
        return;
      }
    } else if (!canCreateOnSelectedSpecialist) {
      setMessage(
        canCreateAppointments
          ? "You can only create appointments in your own schedule."
          : "You do not have permission to create appointments."
      );
      return;
    }

    if (!selectedSpecialistId) {
      setSpecialistSelectError(true);
      return;
    }
    setSpecialistSelectError(false);
    setMessage("");
    setClientVipOnly(Boolean(vipOnly));
    const appointmentDate = formatDateYmd(day.date);
    const startTime = String(slot || "").trim();
    const defaultDuration = durationSelectOptions[0]?.value || "30";
    const existingDuration = String(existingItem?.durationMinutes || "").trim()
      || getDurationMinutesFromTimes(existingItem?.time, existingItem?.endTime);
    const nextDuration = isEditMode && existingDuration
      ? existingDuration
      : defaultDuration;

    setCreateModal({
      open: true,
      mode: existingItem ? "edit" : "create",
      appointmentId: String(existingItem?.id || ""),
      specialistId: selectedSpecialistId,
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
        clientId: String(existingItem?.clientId || ""),
        appointmentDate,
        startTime,
        durationMinutes: nextDuration,
        service: String(existingItem?.service || ""),
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
      setCreateForm(createEmptyClientForm({
        appointmentDate,
        startTime,
        durationMinutes: nextDuration,
        repeatEnabled: recurringOnly,
        repeatUntil: defaultRepeatUntil,
        repeatDays: defaultRepeatDays
      }));
    }
    setCreateErrors({});
  }

  useEffect(() => {
    if (!createModal.open) {
      return;
    }
    const shouldFilterVipClients = isVipRecurringModal || vipOnly || clientVipOnly;
    const trimmedFirstName = String(clientSearch.firstName || "").trim();
    const trimmedLastName = String(clientSearch.lastName || "").trim();
    const combinedLength = `${trimmedFirstName}${trimmedLastName}`.length;
    if (!shouldFilterVipClients && combinedLength === 0) {
      setClientSearchLoading(false);
      setClientSearchMessage("");
      setClientOptions([]);
      return;
    }
    if (!shouldFilterVipClients && combinedLength < 3) {
      setClientSearchLoading(false);
      setClientSearchMessage("Type at least 3 letters.");
      setClientOptions([]);
      return;
    }

    let active = true;
    const timerId = window.setTimeout(async () => {
      try {
        setClientSearchLoading(true);
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
        if (shouldFilterVipClients) {
          queryParams.set("isVip", "true");
        }

        const response = await apiFetch(`/api/clients/search?${queryParams.toString()}`, {
          method: "GET",
          cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));

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
          setClientSearchMessage(shouldFilterVipClients ? "No VIP clients found." : "No clients found.");
        } else {
          setClientSearchMessage("");
        }
      } catch {
        if (active) {
          setClientOptions([]);
          setClientSearchMessage("Failed to load clients.");
        }
      } finally {
        if (active) {
          setClientSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [clientSearch.firstName, clientSearch.lastName, clientVipOnly, createModal.open, isVipRecurringModal, vipOnly]);

  useEffect(() => {
    if (!createModal.open) {
      setClientNoShowSummary(null);
      setClientNoShowLoading(false);
      return;
    }

    const clientId = String(createForm.clientId || "").trim();
    if (!clientId) {
      setClientNoShowSummary(null);
      setClientNoShowLoading(false);
      return;
    }

    let active = true;
    const timerId = window.setTimeout(async () => {
      try {
        setClientNoShowLoading(true);
        const query = new URLSearchParams({ clientId }).toString();
        const response = await apiFetch(`/api/appointments/client-no-show-summary?${query}`, {
          method: "GET",
          cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
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
      } finally {
        if (active) {
          setClientNoShowLoading(false);
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

  const isEditMode = createModal.mode === "edit";
  const isEditRecurring = isEditMode
    && createModal.repeatType === "weekly"
    && Boolean(String(createModal.repeatGroupKey || "").trim());
  const normalizedEditScope = EDIT_SCOPE_OPTIONS.some((option) => option.value === createForm.editScope)
    ? createForm.editScope
    : "single";
  const shouldLockEditDate = isEditRecurring && normalizedEditScope !== "single";

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
    if (!service) {
      errors.service = "Service is required.";
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
    if (!isEditMode && !canCreateOnSelectedSpecialist) {
      setCreateErrors({
        form: canCreateAppointments
          ? "You can only create appointments in your own schedule."
          : "You do not have permission to create appointments."
      });
      return;
    }
    if (isEditMode && !canUpdateAppointments) {
      setCreateErrors({ form: "You do not have permission to update appointments." });
      return;
    }
    if (isEditMode && !canMutateSelectedSpecialist) {
      setCreateErrors({ form: "You can only edit appointments in your own schedule." });
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
        setCreateErrors({ form: "Invalid slot. Please try again." });
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

      const requestPayload = {
        specialistId,
        clientId: nextPayload.clientId,
        appointmentDate,
        startTime,
        endTime,
        durationMinutes: String(durationMinutes),
        service: nextPayload.service,
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
          skipConflicts: true
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
      const data = await response.json().catch(() => ({}));

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
      if (isEditMode) {
        setMessage("");
      } else {
        setMessage(String(data?.message || "Client added to schedule."));
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
    if (!canMutateSelectedSpecialist) {
      setCreateErrors({ form: "You can only edit appointments in your own schedule." });
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
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCreateErrors({ form: data?.message || "Failed to delete appointment." });
        return;
      }

      await loadSchedulesForCurrentWeek();
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
    && !clientNoShowLoading
    && clientNoShowSummary
    && clientNoShowSummary.noShowCount >= clientNoShowSummary.noShowThreshold
  );

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

  return (
    <section className="appointment-scheduler" aria-label="Appointment scheduler">
      <div className="appointment-toolbar">
        <div className="appointment-toolbar-block">
          <div className="appointment-specialist-row">
            <span className="appointment-toolbar-label">Specialist</span>
            <div className="appointment-specialist-select-wrap">
              <CustomSelect
                id="appointmentSpecialistSelect"
                placeholder={loading ? "Loading specialists..." : "Select specialist"}
                value={selectedSpecialistId}
                options={specialistOptions}
                searchable
                searchPlaceholder="Search specialist"
                searchThreshold={20}
                maxVisibleOptions={10}
                error={specialistSelectError}
                onChange={(nextValue) => {
                  setSelectedSpecialistId(nextValue);
                  if (specialistSelectError) {
                    setSpecialistSelectError(false);
                  }
                }}
              />
            </div>
          </div>
        </div>

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

      {loading ? (
        null
      ) : (
        <div className="appointment-grid-wrap">
          <table className="appointment-grid" aria-label="Appointment week table">
            <thead>
              <tr>
                <th className="appointment-time-col">Time</th>
                {weekDays.map((day) => (
                  <th key={day.key} className={isSameDate(day.date, now) ? "appointment-day-is-today" : ""}>
                    <div className="appointment-day-head">
                      <span>{day.label}</span>
                      <small>{formatHeaderDate(day.date)}</small>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot) => {
                const slotMinutes = slotMinutesByValue[slot];
                const slotSubDivisionsNum = Math.max(1, Number.parseInt(String(settings.slotSubDivisions), 10) || 1);
                const slotIndex = slotIndexByValue[slot];
                const isMajorSlot = slotSubDivisionsNum <= 1 || slotIndex % slotSubDivisionsNum === 0;
                const timeColRowSpan = isMajorSlot && slotSubDivisionsNum > 1
                  ? Math.min(slotSubDivisionsNum, timeSlots.length - slotIndex)
                  : 1;

                return (
                  <tr key={slot} className={isMajorSlot ? (slotSubDivisionsNum > 1 ? "appointment-row-major-slot" : undefined) : "appointment-row-sub-slot"}>
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
                      const appointmentSpan = Number.parseInt(String(appointmentRowSpan || "1").trim(), 10) || 1;
                      const canShowAppointmentDetails = appointmentSpan > 1;
                      const isAddSlotCell = (
                        isInsideWorkingHours
                        && !item
                        && !blockedItem
                        && !breakBlockedItem
                      );
                      const isOffSlotCell = !isInsideWorkingHours;
                      const tdClassName = [
                        tdRowSpan ? "appointment-td-multi-slot" : "",
                        reachesBottom ? "appointment-td-reaches-bottom" : "",
                        isAddSlotCell ? "appointment-add-slot-td" : "",
                        isOffSlotCell ? "appointment-off-slot-td" : "",
                        breakBlockedItem ? `appointment-break-type-${breakBlockedItem.breakType}-td` : "",
                      ].filter(Boolean).join(" ") || undefined;

                      return (
                        <td key={`${day.key}-${slot}`} rowSpan={tdRowSpan} className={tdClassName}>
                          {!isInsideWorkingHours ? (
                            <span className="appointment-off-slot">o</span>
                          ) : item ? (
                            (canMutateSelectedSpecialist && (canUpdateAppointments || canDeleteAppointments)) ? (
                              <button
                                type="button"
                                className={`appointment-card${tdRowSpan ? " appointment-card-multi-slot" : ""}${canShowAppointmentDetails ? "" : " appointment-card-compact"} appointment-card-btn appointment-status-${item.status}`}
                                onClick={() => openCreateModal(day, slot, item)}
                                aria-label={`Edit appointment on ${day.label} at ${slot}`}
                              >
                                <p className="appointment-client">{item.client}</p>
                                {canShowAppointmentDetails ? (
                                  <p className="appointment-service">
                                    {formatServiceLine(item.service, item.durationMinutes)}
                                  </p>
                                ) : null}
                              </button>
                            ) : (
                              <div
                                className={`appointment-card${tdRowSpan ? " appointment-card-multi-slot" : ""}${canShowAppointmentDetails ? "" : " appointment-card-compact"} appointment-status-${item.status}`}
                                aria-label={`Appointment on ${day.label} at ${slot}`}
                              >
                                <p className="appointment-client">{item.client}</p>
                                {canShowAppointmentDetails ? (
                                  <p className="appointment-service">
                                    {formatServiceLine(item.service, item.durationMinutes)}
                                  </p>
                                ) : null}
                              </div>
                            )
                          ) : blockedItem ? (
                            <span
                              className={`appointment-occupied-slot appointment-status-${blockedItem.status}`}
                              aria-label={`Booked slot on ${day.label} at ${slot}`}
                            />
                          ) : breakBlockedItem ? (
                            <span
                              className={`appointment-break-slot appointment-break-type-${breakBlockedItem.breakType}`}
                              aria-label={`Break slot on ${day.label} at ${slot}`}
                              title={String(breakBlockedItem.reasonFull || "").trim() || undefined}
                            >
                              <span className="appointment-break-slot-text">{breakBlockedItem.reasonShort}</span>
                            </span>
                          ) : (
                            canCreateOnSelectedSpecialist ? (
                              <button
                                type="button"
                                className="appointment-add-slot"
                                aria-label={`Add appointment on ${day.label} at ${slot}`}
                                onClick={() => openCreateModal(day, slot)}
                              >
                                +
                              </button>
                            ) : (
                              <span className="appointment-add-slot appointment-add-slot-disabled">+</span>
                            )
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createModal.open && (() => {
        const modalContent = (
          <>
          <section id="appointmentCreateClientModal" className="logout-confirm-modal appointment-create-modal">
            <div className="appointment-create-head">
              <h3>{modalTitle}</h3>
              <button
                id="appointmentCreateCloseBtn"
                type="button"
                className="header-btn panel-close-btn appointment-create-close-btn"
                aria-label="Close to schedule modal"
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
                {!isVipRecurringModal ? (
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

                {!isVipRecurringModal ? (
                  <div className="appointment-client-select-row">
                    <div className="field appointment-client-vip-field">
                      <label htmlFor="appointmentClientVipOnly">VIP</label>
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
                            setClientVipOnly(checked);
                            if (checked) {
                              setCreateForm((prev) => ({ ...prev, clientId: "" }));
                              if (createErrors.clientId) {
                                setCreateErrors((prev) => ({ ...prev, clientId: "" }));
                              }
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
                ) : (
                  <div className="field">
                    <label htmlFor="appointmentCreateClientSelect">Client</label>
                    <CustomSelect
                      id="appointmentCreateClientSelect"
                      placeholder="Select client"
                      value={createForm.clientId}
                      options={clientSelectOptions}
                      maxVisibleOptions={10}
                      error={clientSelectHasError}
                      onChange={(nextValue) => {
                        setCreateForm((prev) => ({ ...prev, clientId: nextValue }));
                        if (createErrors.clientId) {
                          setCreateErrors((prev) => ({ ...prev, clientId: "" }));
                        }
                      }}
                    />
                  </div>
                )}
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
                    || (createModal.mode === "edit" ? (!canUpdateAppointments || !canMutateSelectedSpecialist) : !canCreateOnSelectedSpecialist)
                  }
                >
                  {createSubmitting ? "Saving..." : "Save"}
                </button>
                <button
                  className="header-btn logout-confirm-yes"
                  type="button"
                  disabled={createModal.mode !== "edit" || createSubmitting || createDeleting || !canDeleteAppointments || !canMutateSelectedSpecialist}
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
