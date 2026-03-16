import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, readApiResponseData } from "../../lib/api.js";
import CustomSelect from "../../components/CustomSelect.jsx";
import WorkSchedulePanel from "./WorkSchedulePanel.jsx";

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" }
];

const REMINDER_CHANNEL_OPTIONS = [
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
  { key: "telegram", label: "Telegram" }
];
const BREAK_TYPE_OPTIONS = [
  { value: "lunch", label: "Lunch" },
  { value: "meeting", label: "Meeting" },
  { value: "training", label: "Training" },
  { value: "other", label: "Other" }
];
const APPOINTMENT_BREAKS_PAGE_SIZE = 20;
const APPOINTMENT_SPECIALIST_STORAGE_KEY = "crm_appointment_selected_specialist_id";
const APPOINTMENT_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY = "crm_appointment_settings_selected_specialist_id";

function readStoredBreaksSpecialistId() {
  if (typeof window === "undefined") {
    return "";
  }

  const scopedValue = String(window.localStorage.getItem(APPOINTMENT_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY) || "").trim();
  if (scopedValue) {
    return scopedValue;
  }

  return String(window.localStorage.getItem(APPOINTMENT_SPECIALIST_STORAGE_KEY) || "").trim();
}

function createDefaultForm() {
  return {
    slotInterval: "",
    slotSubDivisions: "1",
    slotCellHeightPx: "18",
    historyLockDays: "10",
    outboxWorkerRetentionDays: "30",
    userNotificationsRetentionDays: "0",
    appointmentDurationOptions: "",
    visibleWeekDays: [],
    noShowThreshold: "",
    reminderHours: "",
    reminderChannels: []
  };
}

function mapWorkingHoursToDefaultWeeklyRows(workingHours) {
  return DAYS.map((day, index) => {
    const source = workingHours && typeof workingHours === "object"
      ? workingHours[day.key]
      : null;
    const startTime = String(source?.start || "").trim();
    const endTime = String(source?.end || "").trim();
    const isActive = Boolean(startTime && endTime && startTime < endTime);
    return {
      dayOfWeek: String(index + 1),
      dayKey: day.key,
      label: day.label,
      isActive,
      startTime: isActive ? startTime : "",
      endTime: isActive ? endTime : "",
      reason: ""
    };
  });
}

function mapSettingsItemToForm(source) {
  const normalizedSource = source && typeof source === "object"
    ? source
    : createDefaultForm();

  const nextVisibleWeekDays = Array.isArray(normalizedSource.visibleWeekDays)
    ? normalizedSource.visibleWeekDays
        .map((dayKey) => String(dayKey || "").trim().toLowerCase())
        .filter((dayKey) => DAYS.some((day) => day.key === dayKey))
    : [];

  return {
    slotInterval: String(normalizedSource.slotInterval ?? ""),
    slotSubDivisions: String(normalizedSource.slotSubDivisions ?? "1"),
    slotCellHeightPx: String(normalizedSource.slotCellHeightPx ?? "18"),
    historyLockDays: String(normalizedSource.historyLockDays ?? "10"),
    outboxWorkerRetentionDays: String(normalizedSource.outboxWorkerRetentionDays ?? "30"),
    userNotificationsRetentionDays: String(normalizedSource.userNotificationsRetentionDays ?? "0"),
    appointmentDurationOptions: Array.isArray(normalizedSource.appointmentDurationOptions)
      ? normalizedSource.appointmentDurationOptions.join(",")
      : String(normalizedSource.appointmentDuration ?? ""),
    visibleWeekDays: nextVisibleWeekDays,
    noShowThreshold: String(normalizedSource.noShowThreshold ?? ""),
    reminderHours: String(normalizedSource.reminderHours ?? ""),
    reminderChannels: normalizeReminderChannels(normalizedSource.reminderChannels)
  };
}

function parseDurationOptionsInput(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(",")
        .map((item) => Number.parseInt(String(item || "").trim(), 10))
        .filter((item) => Number.isInteger(item) && item > 0 && item <= 1440)
    )
  );
}

function parsePositiveIntegerField(value, {
  fieldLabel,
  min = 1,
  max = Number.POSITIVE_INFINITY,
  allowEmpty = false
}) {
  const text = String(value || "").trim();
  if (!text) {
    if (allowEmpty) {
      return { ok: true, value: null };
    }
    return { ok: false, message: `${fieldLabel} is required.` };
  }
  if (!/^[1-9]\d*$/.test(text)) {
    return { ok: false, message: `${fieldLabel} must be a whole number.` };
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    if (Number.isFinite(max)) {
      return { ok: false, message: `${fieldLabel} must be between ${min} and ${max}.` };
    }
    return { ok: false, message: `${fieldLabel} must be at least ${min}.` };
  }
  return { ok: true, value: parsed };
}

function parseNonNegativeIntegerField(value, {
  fieldLabel,
  max = Number.POSITIVE_INFINITY
}) {
  const text = String(value || "").trim();
  if (!text) {
    return { ok: false, message: `${fieldLabel} is required.` };
  }
  if (!/^\d+$/.test(text)) {
    return { ok: false, message: `${fieldLabel} must be a whole number.` };
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    if (Number.isFinite(max)) {
      return { ok: false, message: `${fieldLabel} must be between 0 and ${max}.` };
    }
    return { ok: false, message: `${fieldLabel} must be 0 or more.` };
  }
  return { ok: true, value: parsed };
}

function normalizeReminderChannels(value, { allowEmpty = false } = {}) {
  const normalized = Array.isArray(value)
    ? value
        .map((channel) => String(channel || "").trim().toLowerCase())
        .filter((channel) => REMINDER_CHANNEL_OPTIONS.some((option) => option.key === channel))
    : [];
  if (normalized.length > 0) {
    return normalized;
  }
  return [];
}

function normalizeBreakItem(value) {
  const breakType = String(value?.breakType || "lunch").trim().toLowerCase();
  const parsedDayOfWeek = Number.parseInt(String(value?.dayOfWeek ?? "").trim(), 10);
  const dayOfWeek = Number.isInteger(parsedDayOfWeek) && parsedDayOfWeek >= 1 && parsedDayOfWeek <= 7
    ? parsedDayOfWeek
    : null;
  const dayOfWeekLabel = dayOfWeek ? (DAYS[dayOfWeek - 1]?.label || String(dayOfWeek)) : "";
  return {
    id: value?.id ?? null,
    specialistId: String(value?.specialistId || "").trim(),
    specialistName: String(value?.specialistName || "").trim(),
    createdBy: String(value?.createdBy || value?.createdByName || "").trim(),
    dayOfWeek,
    dayOfWeekLabel,
    breakType: BREAK_TYPE_OPTIONS.some((option) => option.value === breakType) ? breakType : "lunch",
    startTime: String(value?.startTime || "").trim(),
    endTime: String(value?.endTime || "").trim(),
    title: String(value?.title || "").trim(),
    note: String(value?.note || "").trim(),
    isActive: value?.isActive !== false
  };
}

function compareBreakItems(a, b) {
  const specialistNameA = String(a?.specialistName || "").trim();
  const specialistNameB = String(b?.specialistName || "").trim();
  const specialistNameCompare = specialistNameA.localeCompare(specialistNameB, undefined, { sensitivity: "base" });
  if (specialistNameCompare !== 0) {
    return specialistNameCompare;
  }

  const dayA = Number.parseInt(String(a?.dayOfWeek ?? "").trim(), 10);
  const dayB = Number.parseInt(String(b?.dayOfWeek ?? "").trim(), 10);
  const normalizedDayA = Number.isInteger(dayA) ? dayA : 0;
  const normalizedDayB = Number.isInteger(dayB) ? dayB : 0;
  if (normalizedDayA !== normalizedDayB) {
    return normalizedDayA - normalizedDayB;
  }

  const startCompare = String(a?.startTime || "").trim().localeCompare(String(b?.startTime || "").trim());
  if (startCompare !== 0) {
    return startCompare;
  }

  const endCompare = String(a?.endTime || "").trim().localeCompare(String(b?.endTime || "").trim());
  if (endCompare !== 0) {
    return endCompare;
  }

  return String(a?.id ?? "").trim().localeCompare(String(b?.id ?? "").trim());
}

function buildBreakSearchText(item, breakTypeLabelByValue) {
  return [
    String(item?.id ?? "").trim(),
    String(item?.specialistName || "").trim(),
    String(breakTypeLabelByValue.get(String(item?.breakType || "").trim()) || item?.breakType || "").trim(),
    String(item?.dayOfWeekLabel || "").trim(),
    String(item?.startTime || "").trim(),
    String(item?.endTime || "").trim(),
    String(item?.createdBy || "").trim(),
    String(item?.title || "").trim(),
    String(item?.note || "").trim()
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function createAddBreakDraftLine() {
  return {
    dayOfWeek: "",
    breakType: "",
    startTime: "",
    endTime: ""
  };
}

function createAddBreakDraftItem({ specialistId = "" } = {}) {
  return {
    specialistId: String(specialistId || "").trim(),
    lines: [createAddBreakDraftLine()]
  };
}

function AppointmentSettingsPanel({
  canUpdateAppointments = true,
  canUpdateSettingsAppointments = canUpdateAppointments,
  canReadAppointmentBreaks = true,
  canCreateAppointmentBreaks = canUpdateAppointments,
  canUpdateAppointmentBreaks = canUpdateAppointments,
  canDeleteAppointmentBreaks = canUpdateAppointments,
  panelMode = "settings",
  profile = null
}) {
  const isBreaksMode = String(panelMode || "").trim().toLowerCase() === "breaks";
  const canCreateCurrentPanel = isBreaksMode ? canCreateAppointmentBreaks : canUpdateSettingsAppointments;
  const canUpdateCurrentPanel = isBreaksMode ? canUpdateAppointmentBreaks : canUpdateSettingsAppointments;
  const canDeleteCurrentPanel = isBreaksMode ? canDeleteAppointmentBreaks : canUpdateSettingsAppointments;
  const currentOrganizationId = String(profile?.organizationId || "").trim();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState(null);
  const [defaultWeeklyRows, setDefaultWeeklyRows] = useState([]);
  const [breakSpecialists, setBreakSpecialists] = useState([]);
  const [breakItems, setBreakItems] = useState([]);
  const [breaksLoading, setBreaksLoading] = useState(false);
  const [breaksSpecialistsLoaded, setBreaksSpecialistsLoaded] = useState(false);
  const [breaksMutating, setBreaksMutating] = useState(false);
  const [editingBreakIndex, setEditingBreakIndex] = useState(-1);
  const [editingBreakDraft, setEditingBreakDraft] = useState(null);
  const [isEditBreakModalOpen, setIsEditBreakModalOpen] = useState(false);
  const [isAddBreakModalOpen, setIsAddBreakModalOpen] = useState(false);
  const [deletingBreakItem, setDeletingBreakItem] = useState(null);
  const [addBreakDraftRows, setAddBreakDraftRows] = useState(() => [createAddBreakDraftItem()]);
  const [breaksSearchInput, setBreaksSearchInput] = useState("");
  const [breaksSearch, setBreaksSearch] = useState("");
  const [breaksPage, setBreaksPage] = useState(1);
  const breakSpecialistOptions = useMemo(() => (
    breakSpecialists.map((item) => ({
      value: String(item.id || "").trim(),
      label: item.name || "Specialist"
    }))
  ), [breakSpecialists]);
  const breakDayOfWeekOptions = useMemo(() => (
    DAYS.map((day, dayIndex) => ({
      value: String(dayIndex + 1),
      label: day.label
    }))
  ), []);
  const breakTypeSelectOptions = useMemo(() => (
    BREAK_TYPE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label
    }))
  ), []);
  const breakTypeLabelByValue = useMemo(() => (
    new Map(BREAK_TYPE_OPTIONS.map((option) => [option.value, option.label]))
  ), []);
  const filteredBreakItems = useMemo(() => {
    const normalizedSearch = String(breaksSearch || "").trim().toLowerCase();
    if (!normalizedSearch) {
      return Array.isArray(breakItems) ? breakItems : [];
    }
    return (Array.isArray(breakItems) ? breakItems : []).filter((item) => (
      buildBreakSearchText(item, breakTypeLabelByValue).includes(normalizedSearch)
    ));
  }, [breakItems, breakTypeLabelByValue, breaksSearch]);
  const breaksTotalPages = useMemo(() => (
    Math.max(1, Math.ceil(filteredBreakItems.length / APPOINTMENT_BREAKS_PAGE_SIZE) || 1)
  ), [filteredBreakItems.length]);
  const pagedBreakItems = useMemo(() => {
    const safePage = Math.min(Math.max(breaksPage, 1), breaksTotalPages);
    const startIndex = (safePage - 1) * APPOINTMENT_BREAKS_PAGE_SIZE;
    return filteredBreakItems.slice(startIndex, startIndex + APPOINTMENT_BREAKS_PAGE_SIZE);
  }, [breaksPage, breaksTotalPages, filteredBreakItems]);
  const totalAddBreakDraftLines = useMemo(() => (
    addBreakDraftRows.reduce((sum, row) => {
      const lineCount = Array.isArray(row?.lines) ? row.lines.length : 0;
      return sum + (lineCount > 0 ? lineCount : 1);
    }, 0)
  ), [addBreakDraftRows]);
  const initialDefaultWeeklyRows = useMemo(() => (
    mapWorkingHoursToDefaultWeeklyRows(form?.workingHours)
  ), [form?.workingHours]);
  const effectiveOrganizationId = currentOrganizationId;

  useEffect(() => {
    const text = String(message || "").trim();
    if (!text) {
      return;
    }

    window.alert(text);
    setMessage("");
  }, [message]);

  useEffect(() => {
    if (isBreaksMode) {
      return;
    }
    setBreaksSearchInput("");
    setBreaksSearch("");
    setBreaksPage(1);
    setIsEditBreakModalOpen(false);
    setEditingBreakIndex(-1);
    setEditingBreakDraft(null);
    setIsAddBreakModalOpen(false);
    setDeletingBreakItem(null);
  }, [isBreaksMode]);

  useEffect(() => {
    setBreaksPage((prev) => {
      if (prev < 1) {
        return 1;
      }
      if (prev > breaksTotalPages) {
        return breaksTotalPages;
      }
      return prev;
    });
  }, [breaksTotalPages]);

  useEffect(() => {
    if ((!isAddBreakModalOpen && !isEditBreakModalOpen && !deletingBreakItem) || typeof window === "undefined") {
      return undefined;
    }

    function handleEscClose(event) {
      if (event.key === "Escape" && !breaksMutating) {
        if (deletingBreakItem) {
          setDeletingBreakItem(null);
          return;
        }
        if (isEditBreakModalOpen) {
          setIsEditBreakModalOpen(false);
          setEditingBreakIndex(-1);
          setEditingBreakDraft(null);
          return;
        }
        setIsAddBreakModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscClose);
    return () => {
      window.removeEventListener("keydown", handleEscClose);
    };
  }, [breaksMutating, deletingBreakItem, isAddBreakModalOpen, isEditBreakModalOpen]);

  useEffect(() => {
    if (!isEditBreakModalOpen) {
      return;
    }
    if (editingBreakIndex < 0 || editingBreakIndex >= breakItems.length) {
      setIsEditBreakModalOpen(false);
      setEditingBreakIndex(-1);
      setEditingBreakDraft(null);
    }
  }, [breakItems, editingBreakIndex, isEditBreakModalOpen]);

  useEffect(() => {
    if (isBreaksMode) {
      setForm(null);
      return undefined;
    }

    let active = true;

    async function loadSettings() {
      try {
        setMessage("");
        setForm(null);

        const queryParams = new URLSearchParams();
        if (effectiveOrganizationId) {
          queryParams.set("organizationId", effectiveOrganizationId);
        }
        const requestPath = queryParams.toString()
          ? `/api/appointments/settings?${queryParams.toString()}`
          : "/api/appointments/settings";

        const response = await apiFetch(requestPath, {
          method: "GET",
          cache: "no-store"
        });
        const data = await readApiResponseData(response);

        if (!active) {
          return;
        }

        if (!response.ok) {
          setMessage(data?.message || "Failed to load appointment settings.");
          return;
        }

        setForm(mapSettingsItemToForm(data?.item));
      } catch {
        if (active) {
          setMessage("Failed to load appointment settings.");
        }
      }
    }

    loadSettings();
    return () => {
      active = false;
    };
  }, [effectiveOrganizationId, isBreaksMode]);

  useEffect(() => {
    if (!isBreaksMode) {
      setBreaksSpecialistsLoaded(false);
      return undefined;
    }

    let active = true;
    setBreaksSpecialistsLoaded(false);
    setBreaksLoading(true);

    async function loadSpecialists() {
      try {
        const response = await apiFetch("/api/appointments/specialists", {
          method: "GET",
          cache: "no-store"
        });
        const data = await readApiResponseData(response);
        if (!active) {
          return;
        }
        if (!response.ok) {
          setBreakSpecialists([]);
          setBreaksSpecialistsLoaded(true);
          return;
        }

        const items = Array.isArray(data?.items) ? data.items : [];
        const nextSpecialists = items
          .map((item) => ({
            id: String(item?.id || "").trim(),
            name: String(item?.name || "").trim() || "Specialist",
            role: String(item?.role || "").trim() || "Specialist"
          }))
          .filter((item) => Boolean(item.id))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
        setBreakSpecialists(nextSpecialists);
        if (typeof window !== "undefined") {
          const persisted = String(readStoredBreaksSpecialistId() || "").trim();
          const resolvedId = (persisted && nextSpecialists.some((item) => item.id === persisted))
            ? persisted
            : (nextSpecialists[0]?.id || "");
          if (resolvedId) {
            window.localStorage.setItem(APPOINTMENT_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY, resolvedId);
            window.localStorage.setItem(APPOINTMENT_SPECIALIST_STORAGE_KEY, resolvedId);
          } else {
            window.localStorage.removeItem(APPOINTMENT_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY);
          }
        }
        setBreaksSpecialistsLoaded(true);
      } catch {
        if (active) {
          setBreakSpecialists([]);
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(APPOINTMENT_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY);
          }
          setBreaksSpecialistsLoaded(true);
        }
      }
    }

    loadSpecialists();
    return () => {
      active = false;
    };
  }, [isBreaksMode]);

  useEffect(() => {
    if (!isBreaksMode) {
      return undefined;
    }
    if (!breaksSpecialistsLoaded) {
      return undefined;
    }

    const sourceSpecialists = Array.isArray(breakSpecialists) ? breakSpecialists : [];
    if (sourceSpecialists.length === 0) {
      setBreaksLoading(false);
      setBreakItems([]);
      setIsEditBreakModalOpen(false);
      setEditingBreakIndex(-1);
      setEditingBreakDraft(null);
      return;
    }

    let active = true;
    setBreaksLoading(true);

    async function loadBreaks() {
      try {
        const allItems = await Promise.all(sourceSpecialists.map(async (specialist) => {
          const specialistId = String(specialist?.id || "").trim();
          if (!specialistId) {
            return [];
          }

          const query = new URLSearchParams({ specialistId }).toString();
          const response = await apiFetch(`/api/appointments/breaks?${query}`, {
            method: "GET",
            cache: "no-store"
          });
          const data = await readApiResponseData(response);
          if (!response.ok) {
            throw new Error(data?.message || "Failed to load appointment breaks.");
          }

          const specialistName = String(specialist?.name || "").trim() || "Specialist";
          const items = Array.isArray(data?.items) ? data.items : [];
          return items.map((item) => {
            const normalized = normalizeBreakItem(item);
            return {
              ...normalized,
              specialistId: String(normalized.specialistId || specialistId).trim(),
              specialistName: String(normalized.specialistName || specialistName).trim()
            };
          });
        }));

        if (!active) {
          return;
        }

        setBreakItems(allItems.flat().sort(compareBreakItems));
        setIsEditBreakModalOpen(false);
        setEditingBreakIndex(-1);
        setEditingBreakDraft(null);
      } catch (error) {
        if (active) {
          setBreakItems([]);
          setIsEditBreakModalOpen(false);
          setEditingBreakIndex(-1);
          setEditingBreakDraft(null);
          setMessage(error instanceof Error
            ? (error.message || "Failed to load appointment breaks.")
            : "Failed to load appointment breaks.");
        }
      } finally {
        if (active) {
          setBreaksLoading(false);
        }
      }
    }

    loadBreaks();
    return () => {
      active = false;
    };
  }, [breakSpecialists, breaksSpecialistsLoaded, isBreaksMode]);

  function handleFormField(field, value) {
    if (!form) {
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleDayToggle(dayKey, checked) {
    if (!form) {
      return;
    }
    setForm((prev) => {
      const existing = new Set(prev.visibleWeekDays);
      if (checked) {
        existing.add(dayKey);
      } else {
        existing.delete(dayKey);
      }
      return { ...prev, visibleWeekDays: Array.from(existing) };
    });
  }

  function handleReminderChannelToggle(channelKey, checked) {
    if (!form) {
      return;
    }
    setForm((prev) => {
      const existing = new Set(Array.isArray(prev.reminderChannels) ? prev.reminderChannels : []);
      if (checked) {
        existing.add(channelKey);
      } else {
        existing.delete(channelKey);
      }
      return { ...prev, reminderChannels: Array.from(existing) };
    });
  }

  function handleBreaksSearchSubmit(event) {
    event.preventDefault();
    setBreaksPage(1);
    setBreaksSearch(String(breaksSearchInput || "").trim());
  }

  function toBreakPayloadItem(item) {
    const parsedDayOfWeek = Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10);
    const dayOfWeek = Number.isInteger(parsedDayOfWeek) && parsedDayOfWeek >= 1 && parsedDayOfWeek <= 7
      ? parsedDayOfWeek
      : 1;
    const breakTypeRaw = String(item?.breakType || "lunch").trim().toLowerCase();
    const breakType = BREAK_TYPE_OPTIONS.some((option) => option.value === breakTypeRaw)
      ? breakTypeRaw
      : "lunch";
    return {
      dayOfWeek,
      breakType,
      title: String(item?.title || "").trim(),
      note: String(item?.note || "").trim(),
      startTime: String(item?.startTime || "").trim(),
      endTime: String(item?.endTime || "").trim(),
      isActive: item?.isActive !== false
    };
  }

  function buildBreakSlotKey(item) {
    const normalized = toBreakPayloadItem(item);
    return `${normalized.dayOfWeek}|${normalized.breakType}|${normalized.startTime}|${normalized.endTime}`;
  }

  function buildBreakItemIdentity(item) {
    const id = String(item?.id ?? "").trim();
    if (id) {
      return `id:${id}`;
    }
    return `slot:${buildBreakSlotKey(item)}`;
  }

  function validateBreakDraft(draft) {
    const parsedDayOfWeek = Number.parseInt(String(draft?.dayOfWeek ?? "").trim(), 10);
    if (!Number.isInteger(parsedDayOfWeek) || parsedDayOfWeek < 1 || parsedDayOfWeek > 7) {
      return { ok: false, message: "Day of week is required." };
    }

    const breakType = String(draft?.breakType || "").trim().toLowerCase();
    if (!BREAK_TYPE_OPTIONS.some((option) => option.value === breakType)) {
      return { ok: false, message: "Break type is required." };
    }

    const nextDraft = toBreakPayloadItem({
      ...draft,
      dayOfWeek: parsedDayOfWeek,
      breakType
    });
    if (!nextDraft.startTime || !nextDraft.endTime) {
      return { ok: false, message: "Start and end time are required." };
    }
    if (nextDraft.startTime >= nextDraft.endTime) {
      return { ok: false, message: "Break end time must be after start time." };
    }
    return { ok: true, item: nextDraft };
  }

  function toTimeMinutes(value) {
    const normalized = String(value || "").trim();
    const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
    if (!match) {
      return null;
    }
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const seconds = Number.parseInt(match[3] || "0", 10);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || !Number.isInteger(seconds)) {
      return null;
    }
    return (hours * 60) + minutes + (seconds / 60);
  }

  function findBreakTimeOverlap(items) {
    const ranges = (Array.isArray(items) ? items : [])
      .map((item) => toBreakPayloadItem(item))
      .filter((item) => item.isActive !== false)
      .map((item) => {
        const dayOfWeek = Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10);
        const startMinutes = toTimeMinutes(item?.startTime);
        const endMinutes = toTimeMinutes(item?.endTime);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
          return null;
        }
        if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
          return null;
        }
        return {
          dayOfWeek,
          startMinutes,
          endMinutes,
          startTime: String(item?.startTime || "").trim(),
          endTime: String(item?.endTime || "").trim()
        };
      })
      .filter(Boolean)
      .sort((a, b) => (
        (a.dayOfWeek - b.dayOfWeek)
        || (a.startMinutes - b.startMinutes)
        || (a.endMinutes - b.endMinutes)
      ));

    const previousByDay = new Map();
    for (const current of ranges) {
      const previous = previousByDay.get(current.dayOfWeek);
      if (previous && current.startMinutes < previous.endMinutes) {
        return {
          dayOfWeek: current.dayOfWeek,
          startTime: current.startTime,
          endTime: current.endTime,
          conflictStartTime: previous.startTime,
          conflictEndTime: previous.endTime
        };
      }
      if (!previous || current.endMinutes > previous.endMinutes) {
        previousByDay.set(current.dayOfWeek, current);
      }
    }

    return null;
  }

  function buildBreakOverlapMessage(overlap) {
    const dayOfWeek = Number.parseInt(String(overlap?.dayOfWeek ?? "").trim(), 10);
    const dayLabel = Number.isInteger(dayOfWeek) && dayOfWeek >= 1 && dayOfWeek <= 7
      ? (DAYS[dayOfWeek - 1]?.label || `Day ${dayOfWeek}`)
      : "selected day";
    const currentRange = `${String(overlap?.startTime || "").trim()}-${String(overlap?.endTime || "").trim()}`;
    const conflictRange = `${String(overlap?.conflictStartTime || "").trim()}-${String(overlap?.conflictEndTime || "").trim()}`;
    return `Break times overlap on ${dayLabel}: ${currentRange} conflicts with ${conflictRange}.`;
  }

  async function saveBreakItems(specialistIdValue, nextItems) {
    const specialistId = String(specialistIdValue || "").trim();
    if (!specialistId) {
      setMessage("Specialist is required.");
      return false;
    }
    const normalizedItems = (Array.isArray(nextItems) ? nextItems : []).map((item) => toBreakPayloadItem(item));
    const overlap = findBreakTimeOverlap(normalizedItems);
    if (overlap) {
      setMessage(buildBreakOverlapMessage(overlap));
      return false;
    }

    try {
      setBreaksMutating(true);
      const payload = {
        specialistId,
        items: normalizedItems
      };
      const response = await apiFetch("/api/appointments/breaks", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(data?.message || "Failed to update appointment breaks.");
        return false;
      }

      const specialistNameFallback = String(
        breakSpecialists.find((item) => String(item?.id || "").trim() === specialistId)?.name || ""
      ).trim() || "Specialist";
      const savedItems = Array.isArray(data?.items)
        ? data.items.map((item) => {
          const normalized = normalizeBreakItem(item);
          return {
            ...normalized,
            specialistId: String(normalized.specialistId || specialistId).trim(),
            specialistName: String(normalized.specialistName || specialistNameFallback).trim()
          };
        })
        : [];
      setBreakItems((prev) => {
        const existing = Array.isArray(prev) ? prev : [];
        const filtered = existing.filter((item) => String(item?.specialistId || "").trim() !== specialistId);
        return [...filtered, ...savedItems].sort(compareBreakItems);
      });
      setIsEditBreakModalOpen(false);
      setEditingBreakIndex(-1);
      setEditingBreakDraft(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("crm:appointment-change"));
      }
      setMessage("");
      return true;
    } catch {
      setMessage("Failed to update appointment breaks.");
      return false;
    } finally {
      setBreaksMutating(false);
    }
  }

  function startBreakEdit(index) {
    const item = breakItems[index];
    if (!item) {
      return;
    }
    setIsEditBreakModalOpen(true);
    setEditingBreakIndex(index);
    setEditingBreakDraft({
      dayOfWeek: item.dayOfWeek || 1,
      breakType: item.breakType || "lunch",
      startTime: item.startTime || "",
      endTime: item.endTime || "",
      title: item.title || "",
      note: item.note || "",
      isActive: item.isActive !== false
    });
  }

  function cancelBreakEdit() {
    setIsEditBreakModalOpen(false);
    setEditingBreakIndex(-1);
    setEditingBreakDraft(null);
  }

  function handleBreakDraftField(field, value) {
    setEditingBreakDraft((prev) => ({
      ...(prev || {}),
      [field]: value
    }));
  }

  async function saveEditedBreak(index) {
    if (index < 0 || index >= breakItems.length || !editingBreakDraft) {
      return;
    }

    const targetItem = breakItems[index];
    if (!targetItem) {
      return;
    }

    const specialistId = String(targetItem.specialistId || "").trim();
    if (!specialistId) {
      setMessage("Specialist is required.");
      return;
    }

    const validation = validateBreakDraft(editingBreakDraft);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    const targetIdentity = buildBreakItemIdentity(targetItem);
    let updated = false;
    const specialistItems = breakItems.filter((item) => String(item?.specialistId || "").trim() === specialistId);
    const nextItems = specialistItems.map((item) => {
      if (updated || buildBreakItemIdentity(item) !== targetIdentity) {
        return item;
      }
      updated = true;
      const nextDayOfWeek = validation.item.dayOfWeek;
      return {
        ...item,
        ...validation.item,
        dayOfWeek: nextDayOfWeek,
        dayOfWeekLabel: DAYS[nextDayOfWeek - 1]?.label || String(nextDayOfWeek)
      };
    });

    if (!updated) {
      setMessage("Break not found.");
      return;
    }

    await saveBreakItems(specialistId, nextItems);
  }

  function openDeleteBreakModal(index) {
    if (index < 0 || index >= breakItems.length) {
      return;
    }
    const targetItem = breakItems[index];
    if (!targetItem) {
      return;
    }
    setDeletingBreakItem(targetItem);
  }

  function closeDeleteBreakModal() {
    if (breaksMutating) {
      return;
    }
    setDeletingBreakItem(null);
  }

  async function confirmDeleteBreak() {
    const targetItem = deletingBreakItem;
    if (!targetItem) {
      return;
    }

    const specialistId = String(targetItem.specialistId || "").trim();
    if (!specialistId) {
      setMessage("Specialist is required.");
      return;
    }

    const targetIdentity = buildBreakItemIdentity(targetItem);
    const specialistItems = breakItems.filter((item) => String(item?.specialistId || "").trim() === specialistId);
    const nextItems = specialistItems.filter((item) => buildBreakItemIdentity(item) !== targetIdentity);
    const success = await saveBreakItems(specialistId, nextItems);
    if (success) {
      setDeletingBreakItem(null);
    }
  }

  function openAddBreakModal() {
    setAddBreakDraftRows([createAddBreakDraftItem({ specialistId: "" })]);
    setIsAddBreakModalOpen(true);
  }

  function closeAddBreakModal() {
    if (breaksMutating) {
      return;
    }
    setIsAddBreakModalOpen(false);
  }

  function handleAddBreakDraftField(index, field, value) {
    setAddBreakDraftRows((prev) => prev.map((row, rowIndex) => {
      if (rowIndex !== index) {
        return row;
      }
      return {
        ...row,
        [field]: value
      };
    }));
  }

  function handleAddBreakDraftLineField(rowIndex, lineIndex, field, value) {
    setAddBreakDraftRows((prev) => prev.map((row, currentRowIndex) => {
      if (currentRowIndex !== rowIndex) {
        return row;
      }
      const sourceLines = Array.isArray(row?.lines) && row.lines.length > 0
        ? row.lines
        : [createAddBreakDraftLine()];
      const nextLines = sourceLines.map((line, currentLineIndex) => {
        if (currentLineIndex !== lineIndex) {
          return line;
        }
        return {
          ...line,
          [field]: value
        };
      });
      return {
        ...row,
        lines: nextLines
      };
    }));
  }

  function addBreakDraftLine(rowIndex, afterLineIndex = -1) {
    setAddBreakDraftRows((prev) => {
      const nextRows = Array.isArray(prev) && prev.length > 0
        ? [...prev]
        : [createAddBreakDraftItem({ specialistId: "" })];
      const targetRow = nextRows[rowIndex];
      if (!targetRow) {
        return nextRows;
      }
      const nextLines = Array.isArray(targetRow.lines) && targetRow.lines.length > 0
        ? [...targetRow.lines]
        : [createAddBreakDraftLine()];
      const shouldInsertAfterIndex = Number.isInteger(afterLineIndex)
        && afterLineIndex >= 0
        && afterLineIndex < nextLines.length;
      const insertAt = shouldInsertAfterIndex ? (afterLineIndex + 1) : nextLines.length;
      nextLines.splice(insertAt, 0, createAddBreakDraftLine());
      nextRows[rowIndex] = {
        ...targetRow,
        lines: nextLines
      };
      return nextRows;
    });
  }

  function deleteAddBreakDraftLine(rowIndex, lineIndex) {
    setAddBreakDraftRows((prev) => {
      const sourceRows = Array.isArray(prev) && prev.length > 0
        ? prev
        : [createAddBreakDraftItem({ specialistId: "" })];
      const currentTotalLines = sourceRows.reduce((sum, row) => (
        sum + (Array.isArray(row?.lines) && row.lines.length > 0 ? row.lines.length : 1)
      ), 0);
      if (currentTotalLines <= 1) {
        return sourceRows;
      }

      const nextRows = sourceRows.map((row) => ({
        ...row,
        lines: Array.isArray(row?.lines) && row.lines.length > 0
          ? [...row.lines]
          : [createAddBreakDraftLine()]
      }));
      const targetRow = nextRows[rowIndex];
      if (!targetRow) {
        return nextRows;
      }
      if (lineIndex < 0 || lineIndex >= targetRow.lines.length) {
        return nextRows;
      }
      targetRow.lines.splice(lineIndex, 1);
      if (targetRow.lines.length === 0) {
        nextRows.splice(rowIndex, 1);
      }

      return nextRows.length > 0 ? nextRows : [createAddBreakDraftItem({ specialistId: "" })];
    });
  }

  async function saveAddedBreakRows() {
    if (!canCreateCurrentPanel) {
      setMessage("You do not have permission to create appointment breaks.");
      return;
    }

    const sourceRows = Array.isArray(addBreakDraftRows) ? addBreakDraftRows : [];
    if (sourceRows.length === 0) {
      setMessage("Add at least one break row.");
      return;
    }

    const preparedRows = [];
    for (let index = 0; index < sourceRows.length; index += 1) {
      const row = sourceRows[index];
      const rowLines = Array.isArray(row?.lines) && row.lines.length > 0
        ? row.lines
        : [createAddBreakDraftLine()];
      const nonEmptyLines = rowLines.filter((line) => {
        const dayValue = String(line?.dayOfWeek ?? "").trim();
        const breakTypeValue = String(line?.breakType || "").trim();
        const startValue = String(line?.startTime || "").trim();
        const endValue = String(line?.endTime || "").trim();
        return Boolean(dayValue || breakTypeValue || startValue || endValue);
      });

      if (nonEmptyLines.length === 0) {
        continue;
      }

      const specialistId = String(row?.specialistId || "").trim();
      if (!specialistId) {
        setMessage(`Row ${index + 1}: specialist is required.`);
        return;
      }

      for (let lineIndex = 0; lineIndex < nonEmptyLines.length; lineIndex += 1) {
        const line = nonEmptyLines[lineIndex];
        const validation = validateBreakDraft(line);
        if (!validation.ok) {
          setMessage(`Row ${index + 1}.${lineIndex + 1}: ${validation.message}`);
          return;
        }
        preparedRows.push({
          specialistId,
          item: validation.item
        });
      }
    }

    if (preparedRows.length === 0) {
      setMessage("Add at least one break row.");
      return;
    }

    const groupedItemsBySpecialist = new Map();
    preparedRows.forEach(({ specialistId, item }) => {
      const existing = groupedItemsBySpecialist.get(specialistId) || [];
      existing.push(item);
      groupedItemsBySpecialist.set(specialistId, existing);
    });

    try {
      setBreaksMutating(true);
      const savedItemsBySpecialist = new Map();
      let savedSpecialistCount = 0;
      let skippedDuplicateCount = 0;

      for (const [specialistId, itemsToAdd] of groupedItemsBySpecialist.entries()) {
        const query = new URLSearchParams({ specialistId }).toString();
        const existingResponse = await apiFetch(`/api/appointments/breaks?${query}`, {
          method: "GET",
          cache: "no-store"
        });
        const existingData = await readApiResponseData(existingResponse);
        if (!existingResponse.ok) {
          setMessage(existingData?.message || "Failed to load appointment breaks.");
          return;
        }

        const existingItems = Array.isArray(existingData?.items)
          ? existingData.items.map((item) => normalizeBreakItem(item))
          : [];

        const existingKeys = new Set(existingItems.map((item) => buildBreakSlotKey(item)));
        const addedKeys = new Set();
        const uniqueItemsToAdd = [];
        for (const item of itemsToAdd) {
          const key = buildBreakSlotKey(item);
          if (existingKeys.has(key) || addedKeys.has(key)) {
            skippedDuplicateCount += 1;
            continue;
          }
          addedKeys.add(key);
          uniqueItemsToAdd.push(toBreakPayloadItem(item));
        }

        if (uniqueItemsToAdd.length === 0) {
          continue;
        }

        const payloadItems = [...existingItems.map((item) => toBreakPayloadItem(item)), ...uniqueItemsToAdd];
        const overlap = findBreakTimeOverlap(payloadItems);
        if (overlap) {
          const specialistName = String(
            breakSpecialists.find((item) => String(item?.id || "").trim() === specialistId)?.name || ""
          ).trim() || `Specialist #${specialistId}`;
          setMessage(`${specialistName}: ${buildBreakOverlapMessage(overlap)}`);
          return;
        }

        const payload = {
          specialistId,
          items: payloadItems
        };

        const saveResponse = await apiFetch("/api/appointments/breaks", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        const saveData = await readApiResponseData(saveResponse);
        if (!saveResponse.ok) {
          setMessage(saveData?.message || "Failed to save appointment breaks.");
          return;
        }

        savedSpecialistCount += 1;
        const specialistNameFallback = String(
          breakSpecialists.find((item) => String(item?.id || "").trim() === specialistId)?.name || ""
        ).trim() || "Specialist";
        const savedItems = Array.isArray(saveData?.items)
          ? saveData.items.map((item) => {
            const normalized = normalizeBreakItem(item);
            return {
              ...normalized,
              specialistId: String(normalized.specialistId || specialistId).trim(),
              specialistName: String(normalized.specialistName || specialistNameFallback).trim()
            };
          })
          : [];
        savedItemsBySpecialist.set(specialistId, savedItems);
      }

      if (savedSpecialistCount === 0) {
        if (skippedDuplicateCount > 0) {
          setMessage("No new breaks were added. Duplicate slots were skipped.");
          return;
        }
        setMessage("No new breaks were added.");
        return;
      }

      setBreakItems((prev) => {
        const existing = Array.isArray(prev) ? prev : [];
        let merged = [...existing];
        for (const [specialistId, items] of savedItemsBySpecialist.entries()) {
          merged = merged.filter((item) => String(item?.specialistId || "").trim() !== specialistId);
          merged.push(...items);
        }
        return merged.sort(compareBreakItems);
      });
      setIsEditBreakModalOpen(false);
      setEditingBreakIndex(-1);
      setEditingBreakDraft(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("crm:appointment-change"));
      }

      setAddBreakDraftRows([createAddBreakDraftItem({ specialistId: "" })]);
      setIsAddBreakModalOpen(false);
      setMessage("");
    } catch {
      setMessage("Failed to save appointment breaks.");
    } finally {
      setBreaksMutating(false);
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!form) {
      return;
    }
    if (!canUpdateCurrentPanel) {
      setMessage("You do not have permission to update appointment settings.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");
      const targetOrganizationId = String(effectiveOrganizationId || "").trim();

      if (!targetOrganizationId) {
        setMessage("Organization is required.");
        return;
      }

      const slotIntervalResult = parsePositiveIntegerField(form.slotInterval, {
        fieldLabel: "Slot interval",
        min: 1
      });
      if (!slotIntervalResult.ok) {
        setMessage(slotIntervalResult.message);
        return;
      }

      const slotSubDivisionsResult = parsePositiveIntegerField(form.slotSubDivisions, {
        fieldLabel: "Slot sub-divisions",
        min: 1,
        max: 60
      });
      if (!slotSubDivisionsResult.ok) {
        setMessage(slotSubDivisionsResult.message);
        return;
      }

      const slotCellHeightResult = parsePositiveIntegerField(form.slotCellHeightPx, {
        fieldLabel: "Planner cell height",
        min: 12,
        max: 72
      });
      if (!slotCellHeightResult.ok) {
        setMessage(slotCellHeightResult.message);
        return;
      }

      const historyLockDaysResult = parseNonNegativeIntegerField(form.historyLockDays, {
        fieldLabel: "History lock",
        max: 3650
      });
      if (!historyLockDaysResult.ok) {
        setMessage(historyLockDaysResult.message);
        return;
      }

      const outboxRetentionResult = parseNonNegativeIntegerField(form.outboxWorkerRetentionDays, {
        fieldLabel: "Outbox retention",
        max: 3650
      });
      if (!outboxRetentionResult.ok) {
        setMessage(outboxRetentionResult.message);
        return;
      }

      const userNotificationsRetentionResult = parseNonNegativeIntegerField(form.userNotificationsRetentionDays, {
        fieldLabel: "User notifications retention",
        max: 3650
      });
      if (!userNotificationsRetentionResult.ok) {
        setMessage(userNotificationsRetentionResult.message);
        return;
      }

      const noShowThresholdResult = parsePositiveIntegerField(form.noShowThreshold, {
        fieldLabel: "No-show threshold",
        min: 1
      });
      if (!noShowThresholdResult.ok) {
        setMessage(noShowThresholdResult.message);
        return;
      }

      const reminderHoursResult = parsePositiveIntegerField(form.reminderHours, {
        fieldLabel: "Reminder hours",
        min: 1
      });
      if (!reminderHoursResult.ok) {
        setMessage(reminderHoursResult.message);
        return;
      }

      const payload = {
        organizationId: targetOrganizationId,
        slotInterval: slotIntervalResult.value,
        slotSubDivisions: slotSubDivisionsResult.value,
        slotCellHeightPx: slotCellHeightResult.value,
        historyLockDays: historyLockDaysResult.value,
        outboxWorkerRetentionDays: outboxRetentionResult.value,
        userNotificationsRetentionDays: userNotificationsRetentionResult.value,
        appointmentDurationOptions: parseDurationOptionsInput(form.appointmentDurationOptions),
        visibleWeekDays: form.visibleWeekDays,
        noShowThreshold: noShowThresholdResult.value,
        reminderHours: reminderHoursResult.value,
        reminderChannels: Array.isArray(form.reminderChannels) ? form.reminderChannels : [],
        defaultWeeklyItems: (Array.isArray(defaultWeeklyRows) ? defaultWeeklyRows : []).map((row) => {
          const startTime = String(row?.startTime || "").trim();
          const endTime = String(row?.endTime || "").trim();
          const isActive = Boolean(startTime && endTime && startTime < endTime);
          const item = {
            dayOfWeek: String(row?.dayOfWeek || "").trim(),
            isActive,
            reason: ""
          };
          if (isActive) {
            item.startTime = startTime;
            item.endTime = endTime;
          }
          return item;
        })
      };

      const response = await apiFetch("/api/appointments/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        setMessage(data?.message || "Failed to save appointment settings.");
        return;
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new window.CustomEvent("crm:appointment-change", {
          detail: {
            type: "appointment-settings-updated",
            organizationId: String(targetOrganizationId || "")
          }
        }));
      }
      setForm(mapSettingsItemToForm(data?.item));
      setMessage(data?.message || "Appointment settings updated.");
    } catch {
      setMessage("Failed to save appointment settings.");
    } finally {
      setSaving(false);
    }
  }

  if (!isBreaksMode && !form) {
    return <div className="appointment-settings-form" aria-label="Appointment settings list" />;
  }

  if (isBreaksMode) {
    const editingBreakItem = (
      Number.isInteger(editingBreakIndex) && editingBreakIndex >= 0 && editingBreakIndex < breakItems.length
    )
      ? breakItems[editingBreakIndex]
      : null;
    const hasBreakItems = pagedBreakItems.length > 0;
    const hasAnyBreakItems = Array.isArray(breakItems) && breakItems.length > 0;
    const showBreaksSkeleton = breaksLoading || !breaksSpecialistsLoaded;
    const isBreakSearchActive = Boolean(String(breaksSearch || "").trim());
    const addBreakModalContent = (
      <>
        <section
          id="appointmentBreaksAddModal"
          className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal"
          hidden={!isAddBreakModalOpen}
          aria-modal="true"
          role="dialog"
          aria-label="Add appointment break"
        >
          <div className="appointment-breaks-add-modal-head">
            <h3>Add break</h3>
            <button
              id="appointmentBreaksAddTopCloseBtn"
              className="header-btn panel-close-btn"
              type="button"
              aria-label="Close add break modal"
              disabled={breaksMutating}
              onClick={closeAddBreakModal}
            >
              ×
            </button>
          </div>
          <form className="appointment-breaks-add-modal-form" onSubmit={(event) => event.preventDefault()}>
            <div className="appointment-breaks-add-rows appointment-breaks-add-rows-scroll">
              {addBreakDraftRows.map((row, rowIndex) => (
                <div className="appointment-breaks-add-row" key={`appointmentBreakDraftRow_${rowIndex}`}>
                  <div className="appointment-breaks-add-row-line appointment-breaks-add-row-line-top">
                    <div className="appointment-breaks-add-field appointment-breaks-add-field-with-action">
                      <span>Select specialist</span>
                      <div className="appointment-breaks-add-field-inline">
                        <CustomSelect
                          id={`appointmentBreakDraftSpecialist_${rowIndex}`}
                          placeholder="Select specialist"
                          value={String(row.specialistId || "")}
                          options={breakSpecialistOptions}
                          menuPortal
                          forceOpenDown
                          maxVisibleOptions={6}
                          onChange={(nextValue) => handleAddBreakDraftField(rowIndex, "specialistId", String(nextValue || ""))}
                        />
                        <button
                          id={`appointmentBreaksInlineAddBtn_${rowIndex}`}
                          className="header-btn appointment-breaks-inline-add-btn"
                          type="button"
                          disabled={breaksMutating || !canCreateCurrentPanel}
                          onClick={() => {
                            const lineCount = Array.isArray(row?.lines) && row.lines.length > 0 ? row.lines.length : 1;
                            addBreakDraftLine(rowIndex, lineCount - 1);
                          }}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="appointment-breaks-add-row-line appointment-breaks-add-row-line-bottom">
                    {(Array.isArray(row?.lines) && row.lines.length > 0 ? row.lines : [createAddBreakDraftLine()]).map((line, lineIndex) => (
                      <div
                        className="appointment-breaks-add-row-line-bottom-item"
                        key={`appointmentBreakDraftLine_${rowIndex}_${lineIndex}`}
                      >
                        <div className="appointment-breaks-add-field">
                          {lineIndex === 0 ? <span>Day</span> : null}
                          <CustomSelect
                            id={`appointmentBreakDraftDay_${rowIndex}_${lineIndex}`}
                            placeholder="Day"
                            value={String(line.dayOfWeek || "")}
                            options={breakDayOfWeekOptions}
                            menuPortal
                            forceOpenDown
                            maxVisibleOptions={6}
                            onChange={(nextValue) => {
                              const parsed = Number.parseInt(String(nextValue || ""), 10);
                              handleAddBreakDraftLineField(
                                rowIndex,
                                lineIndex,
                                "dayOfWeek",
                                Number.isInteger(parsed) && parsed >= 1 && parsed <= 7 ? parsed : ""
                              );
                            }}
                          />
                        </div>
                        <div className="appointment-breaks-add-field">
                          {lineIndex === 0 ? <span>Type</span> : null}
                          <CustomSelect
                            id={`appointmentBreakDraftType_${rowIndex}_${lineIndex}`}
                            placeholder="Type"
                            value={String(line.breakType || "")}
                            options={breakTypeSelectOptions}
                            menuPortal
                            forceOpenDown
                            maxVisibleOptions={6}
                            onChange={(nextValue) => handleAddBreakDraftLineField(rowIndex, lineIndex, "breakType", String(nextValue || ""))}
                          />
                        </div>
                        <label className="appointment-breaks-add-field" htmlFor={`appointmentBreakDraftStart_${rowIndex}_${lineIndex}`}>
                          {lineIndex === 0 ? <span>Start time</span> : null}
                          <input
                            id={`appointmentBreakDraftStart_${rowIndex}_${lineIndex}`}
                            type="time"
                            value={String(line.startTime || "")}
                            onChange={(event) => handleAddBreakDraftLineField(rowIndex, lineIndex, "startTime", event.currentTarget.value)}
                          />
                        </label>
                        <label className="appointment-breaks-add-field" htmlFor={`appointmentBreakDraftEnd_${rowIndex}_${lineIndex}`}>
                          {lineIndex === 0 ? <span>End time</span> : null}
                          <input
                            id={`appointmentBreakDraftEnd_${rowIndex}_${lineIndex}`}
                            type="time"
                            value={String(line.endTime || "")}
                            onChange={(event) => handleAddBreakDraftLineField(rowIndex, lineIndex, "endTime", event.currentTarget.value)}
                          />
                        </label>
                        <div className="appointment-breaks-add-inline-actions">
                          <button
                            id={`appointmentBreaksInlineDelBtn_${rowIndex}_${lineIndex}`}
                            className="table-action-btn table-action-btn-danger"
                            type="button"
                            disabled={breaksMutating || !canDeleteCurrentPanel || totalAddBreakDraftLines <= 1}
                            onClick={() => deleteAddBreakDraftLine(rowIndex, lineIndex)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="edit-actions appointment-breaks-add-modal-actions">
              <button
                id="appointmentBreaksAddSaveBtn"
                className="header-btn"
                type="button"
                disabled={breaksMutating || !canCreateCurrentPanel}
                onClick={() => {
                  void saveAddedBreakRows();
                }}
              >
                {breaksMutating ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </section>
        <div
          id="appointmentBreaksAddOverlay"
          className="login-overlay"
          hidden={!isAddBreakModalOpen}
          onClick={() => {
            if (!breaksMutating) {
              closeAddBreakModal();
            }
          }}
        />
      </>
    );
    const editBreakModalContent = (
      <>
        <section
          id="appointmentBreaksEditModal"
          className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal appointment-breaks-edit-modal"
          hidden={!isEditBreakModalOpen || !editingBreakItem}
          aria-modal="true"
          role="dialog"
          aria-label="Edit appointment break"
        >
          <div className="appointment-breaks-add-modal-head">
            <h3>Edit break</h3>
            <button
              id="appointmentBreaksEditTopCloseBtn"
              className="header-btn panel-close-btn"
              type="button"
              aria-label="Close edit break modal"
              disabled={breaksMutating}
              onClick={cancelBreakEdit}
            >
              ×
            </button>
          </div>
          <form className="appointment-breaks-add-modal-form" onSubmit={(event) => event.preventDefault()}>
            <div className="appointment-breaks-add-row">
              <div className="appointment-breaks-add-row-line appointment-breaks-add-row-line-top">
                <div className="appointment-breaks-add-field">
                  <span>Select specialist</span>
                  <div className="appointment-breaks-add-field-inline">
                    <CustomSelect
                      id="appointmentBreakEditSpecialistSelect"
                      placeholder="Select specialist"
                      value={String(editingBreakItem?.specialistId || "")}
                      options={editingBreakItem
                        ? [{
                          value: String(editingBreakItem.specialistId || ""),
                          label: String(editingBreakItem.specialistName || "Specialist")
                        }]
                        : []}
                      disabled
                    />
                  </div>
                </div>
              </div>
              <div className="appointment-breaks-add-row-line appointment-breaks-add-row-line-bottom">
                <div className="appointment-breaks-add-row-line-bottom-item">
                  <div className="appointment-breaks-add-field">
                    <span>Day</span>
                    <CustomSelect
                      id="appointmentBreakEditDaySelect"
                      placeholder="Day"
                      value={String(editingBreakItem?.dayOfWeek || editingBreakDraft?.dayOfWeek || "")}
                      options={editingBreakItem
                        ? [{
                          value: String(editingBreakItem.dayOfWeek || ""),
                          label: String(editingBreakItem.dayOfWeekLabel || DAYS[(editingBreakItem.dayOfWeek || 1) - 1]?.label || "Day")
                        }]
                        : []}
                      disabled
                    />
                  </div>
                  <div className="appointment-breaks-add-field">
                    <span>Type</span>
                    <CustomSelect
                      id="appointmentBreakEditTypeSelect"
                      placeholder="Type"
                      value={String(editingBreakDraft?.breakType || editingBreakItem?.breakType || "")}
                      options={breakTypeSelectOptions}
                      menuPortal
                      forceOpenDown
                      maxVisibleOptions={6}
                      onChange={(nextValue) => handleBreakDraftField("breakType", String(nextValue || ""))}
                    />
                  </div>
                  <label className="appointment-breaks-add-field" htmlFor="appointmentBreakEditStartInput">
                    <span>Start time</span>
                    <input
                      id="appointmentBreakEditStartInput"
                      type="time"
                      value={String(editingBreakDraft?.startTime || editingBreakItem?.startTime || "")}
                      onChange={(event) => handleBreakDraftField("startTime", event.currentTarget.value)}
                    />
                  </label>
                  <label className="appointment-breaks-add-field" htmlFor="appointmentBreakEditEndInput">
                    <span>End time</span>
                    <input
                      id="appointmentBreakEditEndInput"
                      type="time"
                      value={String(editingBreakDraft?.endTime || editingBreakItem?.endTime || "")}
                      onChange={(event) => handleBreakDraftField("endTime", event.currentTarget.value)}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="edit-actions appointment-breaks-add-modal-actions appointment-breaks-edit-modal-actions">
              <button
                id="appointmentBreaksEditSaveBtn"
                className="header-btn"
                type="button"
                disabled={breaksMutating || !canUpdateCurrentPanel || !editingBreakItem}
                onClick={() => {
                  if (editingBreakIndex >= 0) {
                    void saveEditedBreak(editingBreakIndex);
                  }
                }}
              >
                {breaksMutating ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </section>
        <div
          id="appointmentBreaksEditOverlay"
          className="login-overlay"
          hidden={!isEditBreakModalOpen || !editingBreakItem}
          onClick={() => {
            if (!breaksMutating) {
              cancelBreakEdit();
            }
          }}
        />
      </>
    );
    const deleteBreakModalContent = (
      <>
        <section
          id="appointmentBreaksDeleteModal"
          className="logout-confirm-modal settings-edit-modal"
          hidden={!deletingBreakItem}
          aria-modal="true"
          role="dialog"
          aria-label="Delete appointment break confirmation"
        >
          <h3>Delete this break?</h3>
          <div className="logout-confirm-actions">
            <button
              id="appointmentBreaksDeleteYesBtn"
              type="button"
              className="table-action-btn table-action-btn-danger"
              disabled={breaksMutating || !canDeleteCurrentPanel}
              onClick={() => {
                void confirmDeleteBreak();
              }}
            >
              Yes
            </button>
            <button
              id="appointmentBreaksDeleteNoBtn"
              type="button"
              className="btn header-btn"
              disabled={breaksMutating}
              onClick={closeDeleteBreakModal}
            >
              No
            </button>
          </div>
        </section>
        <div
          id="appointmentBreaksDeleteOverlay"
          className="login-overlay"
          hidden={!deletingBreakItem}
          onClick={() => {
            if (!breaksMutating) {
              closeDeleteBreakModal();
            }
          }}
        />
      </>
    );

    return (
      <>
        <div className="appointment-breaks-view" aria-label="Appointment breaks list">
          <button
            id="appointmentBreaksAddBtn"
            type="button"
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onClick={openAddBreakModal}
          />
          <form className="panel-search-bar" onSubmit={handleBreaksSearchSubmit}>
            <input
              id="appointmentBreaksSearchInput"
              type="search"
              className="panel-search-input"
              placeholder="Search by ID, specialist, type, day, time..."
              value={breaksSearchInput}
              onChange={(event) => setBreaksSearchInput(event.currentTarget.value)}
            />
            <button
              id="appointmentBreaksSearchBtn"
              type="submit"
              className="btn panel-search-btn"
              disabled={showBreaksSkeleton}
            >
              Search
            </button>
          </form>
          <div className="appointment-breaks-table-wrap all-users-table-wrap">
            <table className="appointment-breaks-table all-users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Specialist name</th>
                  <th>Break type</th>
                  <th>Day of week</th>
                  <th>Start time</th>
                  <th>End time</th>
                  <th>Created by</th>
                  <th>Edit</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {showBreaksSkeleton ? (
                  [0, 1, 2, 3].map((i) => (
                    <tr key={i} aria-hidden="true">
                      <td colSpan="9" className="skel" />
                    </tr>
                  ))
                ) : hasBreakItems ? (
                  pagedBreakItems.map((item, index) => {
                    const breakIndex = breakItems.indexOf(item);
                    return (
                    <tr key={`appointmentBreakRow_${item.id ?? index}`}>
                      <td>{item.id ?? "-"}</td>
                      <td>{item.specialistName || "-"}</td>
                      <td>{breakTypeLabelByValue.get(item.breakType) || item.breakType}</td>
                      <td>{item.dayOfWeekLabel || "-"}</td>
                      <td>{item.startTime}</td>
                      <td>{item.endTime}</td>
                      <td>{item.createdBy || "-"}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn"
                          disabled={breaksMutating || !canUpdateCurrentPanel}
                          onClick={() => startBreakEdit(breakIndex)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
                          disabled={breaksMutating || !canDeleteCurrentPanel}
                          onClick={() => openDeleteBreakModal(breakIndex)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="9" className="all-users-state">
                      {isBreakSearchActive && hasAnyBreakItems ? "No breaks found for your search." : "No records found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="all-users-pagination" hidden={showBreaksSkeleton || filteredBreakItems.length === 0}>
            <button
              type="button"
              className="header-btn"
              disabled={breaksPage <= 1}
              onClick={() => setBreaksPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <span className="all-users-page-info">
              Page {Math.min(breaksPage, breaksTotalPages)} of {breaksTotalPages}
            </span>
            <button
              type="button"
              className="header-btn"
              disabled={breaksPage >= breaksTotalPages}
              onClick={() => setBreaksPage((prev) => Math.min(breaksTotalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
        {typeof document !== "undefined"
          ? createPortal(
            <>
              {addBreakModalContent}
              {editBreakModalContent}
              {deleteBreakModalContent}
            </>,
            document.body
          )
          : (
            <>
              {addBreakModalContent}
              {editBreakModalContent}
              {deleteBreakModalContent}
            </>
          )}
      </>
    );
  }

  return (
      <form className="appointment-settings-form" aria-label="Appointment settings list" onSubmit={handleSave}>
        <div className="appointment-setting-row">
          <label htmlFor="slotIntervalInput">1. Slot Interval</label>
          <div className="appointment-setting-inline">
            <input
              id="slotIntervalInput"
              type="number"
              min="1"
              value={form.slotInterval}
              disabled={!canUpdateCurrentPanel}
              onChange={(event) => handleFormField("slotInterval", event.currentTarget.value)}
            />
            <span>minutes</span>
          </div>
        </div>

        <div className="appointment-setting-row">
          <label htmlFor="slotSubDivisionsInput">2. Slot Sub-Divisions</label>
          <div className="appointment-setting-inline">
            <input
              id="slotSubDivisionsInput"
              type="number"
              min="1"
              max="60"
              value={form.slotSubDivisions}
              disabled={!canUpdateCurrentPanel}
              onChange={(event) => handleFormField("slotSubDivisions", event.currentTarget.value)}
            />
            <span>per slot</span>
          </div>
        </div>

        <div className="appointment-setting-row">
          <label htmlFor="slotCellHeightPxInput">3. Planner Cell Height</label>
          <div className="appointment-setting-inline">
            <input
              id="slotCellHeightPxInput"
              type="number"
              min="12"
              max="72"
              value={form.slotCellHeightPx}
              disabled={!canUpdateCurrentPanel}
              onChange={(event) => handleFormField("slotCellHeightPx", event.currentTarget.value)}
            />
            <span>px</span>
          </div>
        </div>

        <div className="appointment-setting-row">
          <label htmlFor="appointmentDurationInput">5. Appointment Durations</label>
          <div className="appointment-setting-inline">
            <input
              id="appointmentDurationInput"
              className="appointment-duration-options-input"
              type="text"
              value={form.appointmentDurationOptions}
              placeholder="30,45,60"
              disabled={!canUpdateCurrentPanel}
              onChange={(event) => handleFormField("appointmentDurationOptions", event.currentTarget.value)}
            />
            <span>minutes</span>
          </div>
        </div>

        <div className="appointment-setting-row">
          <label>6. Visible Week Days</label>
          <div className="appointment-reminder-channels">
            {DAYS.map((day) => (
              <label key={day.key} htmlFor={`appointmentDay_${day.key}`}>
                  <input
                    id={`appointmentDay_${day.key}`}
                    type="checkbox"
                    checked={form.visibleWeekDays.includes(day.key)}
                    disabled={!canUpdateCurrentPanel}
                    onChange={(event) => handleDayToggle(day.key, event.currentTarget.checked)}
                  />
                {day.label}
              </label>
            ))}
          </div>
        </div>

        <div className="appointment-setting-row">
          <label>7. No-show Rules</label>
          <div className="appointment-setting-inline">
            <input
              type="number"
              min="1"
              value={form.noShowThreshold}
              disabled={!canUpdateCurrentPanel}
              onChange={(event) => handleFormField("noShowThreshold", event.currentTarget.value)}
            />
            <span>count threshold</span>
          </div>
        </div>

        <div className="appointment-setting-row">
          <label>8. Reminder Settings</label>
          <div className="appointment-setting-inline appointment-reminder-settings-inline">
            <input
              id="appointmentReminderHoursInput"
              type="number"
              min="1"
              value={form.reminderHours}
              disabled={!canUpdateCurrentPanel}
              onChange={(event) => handleFormField("reminderHours", event.currentTarget.value)}
            />
            <span>hours before appointment</span>
            <div className="appointment-reminder-channels">
              {REMINDER_CHANNEL_OPTIONS.map((channel) => (
                <label key={channel.key} htmlFor={`appointmentReminderChannel_${channel.key}`}>
                  <input
                    id={`appointmentReminderChannel_${channel.key}`}
                    type="checkbox"
                    checked={Array.isArray(form.reminderChannels) && form.reminderChannels.includes(channel.key)}
                    disabled={!canUpdateCurrentPanel}
                    onChange={(event) => handleReminderChannelToggle(channel.key, event.currentTarget.checked)}
                  />
                  {channel.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <WorkSchedulePanel
          canUpdateAppointments={canUpdateSettingsAppointments}
          organizationId={effectiveOrganizationId}
          profile={profile}
          showDefaultWeekly
          showUserWeeklyOverrides={false}
          defaultWeeklyTitle="9. Default Weekly Schedule"
          initialDefaultWeeklyRows={initialDefaultWeeklyRows}
          loadRemoteData={false}
          onDefaultWeeklyRowsChange={setDefaultWeeklyRows}
        />

        <div className="appointment-setting-row">
          <label htmlFor="historyLockDaysInput">10. History Lock (days)</label>
          <div className="appointment-setting-inline">
            <input
              id="historyLockDaysInput"
              type="number"
              min="0"
              max="3650"
              value={form.historyLockDays}
              disabled={!canUpdateCurrentPanel}
              onChange={(event) => handleFormField("historyLockDays", event.currentTarget.value)}
            />
            <span>days</span>
          </div>
        </div>

        <div className="appointment-setting-row">
          <label>11. Notification Retention</label>
          <div className="appointment-setting-inline appointment-settings-retention-inline">
            <div className="field">
              <label htmlFor="outboxWorkerRetentionDaysInput">Outbox Retention (days)</label>
              <input
                id="outboxWorkerRetentionDaysInput"
                type="number"
                min="0"
                max="3650"
                value={form.outboxWorkerRetentionDays}
                disabled={!canUpdateCurrentPanel}
                onChange={(event) => handleFormField("outboxWorkerRetentionDays", event.currentTarget.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="userNotificationsRetentionDaysInput">User Notifications Retention (days)</label>
              <input
                id="userNotificationsRetentionDaysInput"
                type="number"
                min="0"
                max="3650"
                value={form.userNotificationsRetentionDays}
                disabled={!canUpdateCurrentPanel}
                onChange={(event) => handleFormField("userNotificationsRetentionDays", event.currentTarget.value)}
              />
            </div>
          </div>
        </div>

        <div className="appointment-settings-actions">
          <button className="btn" type="submit" disabled={saving || !canUpdateCurrentPanel || !effectiveOrganizationId}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
  );
}

export default AppointmentSettingsPanel;
