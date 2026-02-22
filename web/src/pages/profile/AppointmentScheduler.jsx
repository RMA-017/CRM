import { useCallback, useEffect, useMemo, useState } from "react";
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

const STATUS_LABELS = {
  confirmed: "Confirmed",
  pending: "Pending",
  cancelled: "Cancelled",
  "no-show": "No Show"
};

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

const SAMPLE_APPOINTMENTS = {};
const DAY_KEYS_SET = new Set(DAY_ITEMS.map((item) => item.key));
const MAX_REPEAT_RANGE_DAYS = 366;

function createEmptyClientForm({
  appointmentDate = "",
  startTime = "",
  repeatEnabled = false,
  repeatUntil = "",
  repeatDays = []
} = {}) {
  return {
    clientId: "",
    appointmentDate,
    startTime,
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

function formatHeaderDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

function formatWeekRange(days) {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!(first instanceof Date) || !(last instanceof Date)) {
    return "";
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

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
  canDeleteAppointments = true
}) {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [specialists, setSpecialists] = useState([]);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState("");
  const [specialistSelectError, setSpecialistSelectError] = useState(false);
  const [appointmentsBySpecialist, setAppointmentsBySpecialist] = useState(() => ({}));
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
  const [clientSearch, setClientSearch] = useState(createEmptyClientSearchForm);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [clientSearchMessage, setClientSearchMessage] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [clientMap, setClientMap] = useState({});
  const [clientNoShowSummary, setClientNoShowSummary] = useState(null);
  const [clientNoShowLoading, setClientNoShowLoading] = useState(false);
  const [settings, setSettings] = useState({
    slotInterval: "30",
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    workingHours: createDefaultWorkingHours()
  });

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
          visibleWeekDays,
          workingHours: nextWorkingHours
        });
        setSpecialists(nextSpecialists);
        setSelectedSpecialistId((prev) => {
          if (prev && nextSpecialists.some((itemValue) => itemValue.id === prev)) {
            return prev;
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

  const timeSlots = useMemo(() => (
    buildTimeSlots({
      visibleDays: weekDays.map((day) => day.key),
      workingHours: settings.workingHours,
      slotIntervalMinutes: Number.parseInt(String(settings.slotInterval), 10)
    })
  ), [settings.slotInterval, settings.workingHours, weekDays]);

  const appointmentsByDay = appointmentsBySpecialist[selectedSpecialistId] || SAMPLE_APPOINTMENTS;
  const slotMinutesByValue = useMemo(() => (
    timeSlots.reduce((acc, slot) => {
      acc[slot] = normalizeTimeToMinutes(slot);
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

    try {
      const queryParams = new URLSearchParams({
        specialistId: selectedSpecialistId,
        dateFrom,
        dateTo
      });

      const response = await apiFetch(`/api/appointments/schedules?${queryParams.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));

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
      setMessage("Failed to load appointments.");
    }
  }, [selectedSpecialistId, weekDays]);

  useEffect(() => {
    loadSchedulesForCurrentWeek();
  }, [loadSchedulesForCurrentWeek]);

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
      if (!canUpdateAppointments && !canDeleteAppointments) {
        setMessage("You do not have permission to edit appointments.");
        return;
      }
    } else if (!canCreateAppointments) {
      setMessage("You do not have permission to create appointments.");
      return;
    }

    if (!selectedSpecialistId) {
      setSpecialistSelectError(true);
      return;
    }
    setSpecialistSelectError(false);
    setMessage("");
    const appointmentDate = formatDateYmd(day.date);
    const startTime = String(slot || "").trim();

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
        service: String(existingItem?.service || ""),
        status: String(existingItem?.status || "pending"),
        note: String(existingItem?.note || ""),
        editScope: "single",
        repeatEnabled: false,
        repeatUntil: isExistingRecurring ? "" : appointmentDate,
        repeatDays: []
      });
    } else {
      setCreateForm(createEmptyClientForm({
        appointmentDate,
        startTime,
        repeatEnabled: false,
        repeatUntil: "",
        repeatDays: []
      }));
    }
    setCreateErrors({});
  }

  useEffect(() => {
    if (!createModal.open) {
      return;
    }
    const trimmedFirstName = String(clientSearch.firstName || "").trim();
    const trimmedLastName = String(clientSearch.lastName || "").trim();
    const combinedLength = `${trimmedFirstName}${trimmedLastName}`.length;
    if (combinedLength === 0) {
      setClientSearchLoading(false);
      setClientSearchMessage("");
      setClientOptions([]);
      return;
    }
    if (combinedLength < 3) {
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
        setClientSearchMessage(nextOptions.length === 0 ? "No clients found." : "");
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
  }, [clientSearch.firstName, clientSearch.lastName, createModal.open]);

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
    allowRepeatValidationInEdit = false
  } = {}) {
    const errors = {};
    const visibleRepeatDayKeySet = new Set(visibleRepeatDayKeys);
    const clientId = String(value.clientId || "").trim();
    const appointmentDate = String(value.appointmentDate || "").trim();
    const startTime = String(value.startTime || "").trim();
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
    if (!service) {
      errors.service = "Service is required.";
    }
    if (note.length > 255) {
      errors.note = "Note is too long.";
    }
    const shouldValidateRepeat = !isEditMode || allowRepeatValidationInEdit;
    if (shouldValidateRepeat) {
      const wantsRepeat = repeatDays.length > 0;
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

    if (!createModal.open) {
      return;
    }
    if (!isEditMode && !canCreateAppointments) {
      setCreateErrors({ form: "You do not have permission to create appointments." });
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
        allowRepeatValidationInEdit
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
      if (!appointmentDate || startMinutes === null) {
        setCreateErrors({ form: "Invalid slot. Please try again." });
        return;
      }
      const slotIntervalMinutes = Number.parseInt(String(settings.slotInterval), 10);
      const safeSlotIntervalMinutes = Number.isInteger(slotIntervalMinutes) && slotIntervalMinutes > 0
        ? slotIntervalMinutes
        : 30;
      const endTime = minutesToTime(startMinutes + safeSlotIntervalMinutes);

      const requestPayload = {
        specialistId,
        clientId: nextPayload.clientId,
        appointmentDate,
        startTime,
        endTime,
        service: nextPayload.service,
        status: nextPayload.status,
        note: nextPayload.note
      };
      const shouldSendRepeat = (
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
      const response = await apiFetch(`/api/appointments/schedules/${encodeURIComponent(appointmentId)}?scope=${encodeURIComponent(deleteScope)}`, {
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
    if (!createModal.open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [createModal.open]);

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

        <div className="appointment-toolbar-block appointment-week-switcher">
          <button type="button" className="header-btn" onClick={() => setWeekOffset((prev) => prev - 1)}>
            Previous
          </button>
          <p className="appointment-week-range">{formatWeekRange(weekDays)}</p>
          <button type="button" className="header-btn" onClick={() => setWeekOffset((prev) => prev + 1)}>
            Next
          </button>
        </div>
      </div>

      <p className="appointment-scheduler-state" hidden={!message}>
        {message}
      </p>

      {loading ? (
        <p className="appointment-scheduler-state">
          Loading scheduler...
        </p>
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

                return (
                  <tr key={slot}>
                    <th className="appointment-time-col" scope="row">{slot}</th>
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

                      return (
                        <td key={`${day.key}-${slot}`}>
                          {!isInsideWorkingHours ? (
                            <span className="appointment-off-slot">o</span>
                          ) : item ? (
                            (canUpdateAppointments || canDeleteAppointments) ? (
                              <button
                                type="button"
                                className={`appointment-card appointment-card-btn appointment-status-${item.status}`}
                                onClick={() => openCreateModal(day, slot, item)}
                                aria-label={`Edit appointment on ${day.label} at ${slot}`}
                              >
                                <p className="appointment-client">{item.client}</p>
                                <p className="appointment-service">{item.service}</p>
                              </button>
                            ) : (
                              <div
                                className={`appointment-card appointment-status-${item.status}`}
                                aria-label={`Appointment on ${day.label} at ${slot}`}
                              >
                                <p className="appointment-client">{item.client}</p>
                                <p className="appointment-service">{item.service}</p>
                              </div>
                            )
                          ) : (
                            canCreateAppointments ? (
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

      {createModal.open && (
        <>
          <section id="appointmentCreateClientModal" className="logout-confirm-modal appointment-create-modal">
            <div className="appointment-create-head">
              <h3>To Schedule</h3>
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
            <form className="auth-form" noValidate onSubmit={handleCreateSubmit}>
              <div className="appointment-client-search-row">
                <div className="field">
                  <label htmlFor="appointmentClientSearchFirst">First</label>
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
                  <label htmlFor="appointmentClientSearchLast">Last</label>
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

              <div className="appointment-create-date-time-row">
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

                <div className="field">
                  <label htmlFor="appointmentCreateTime">Time</label>
                  <CustomSelect
                    id="appointmentCreateTime"
                    placeholder="Select time"
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

              {!isEditRecurring ? (
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
              ) : null}

              {createModal.mode === "edit" && isEditRecurring ? (
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
              ) : null}

              <div className="appointment-status-note-row">
                <div className="field">
                  <label htmlFor="appointmentCreateStatus">Status</label>
                  <div className="appointment-status-inline-select">
                    <CustomSelect
                      id="appointmentCreateStatus"
                      placeholder="Select status"
                      value={createForm.status}
                      options={STATUS_OPTIONS}
                      forceOpenDown
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

              <small className="field-error">{createErrors.form || ""}</small>
              <div className="edit-actions">
                <button
                  className="btn"
                  type="submit"
                  disabled={
                    createSubmitting
                    || createDeleting
                    || (createModal.mode === "edit" ? !canUpdateAppointments : !canCreateAppointments)
                  }
                >
                  {createSubmitting ? "Saving..." : "Save"}
                </button>
                <button
                  className="header-btn logout-confirm-yes"
                  type="button"
                  disabled={createModal.mode !== "edit" || createSubmitting || createDeleting || !canDeleteAppointments}
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
      )}

    </section>
  );
}

export default AppointmentScheduler;
