import { useEffect, useMemo, useState } from "react";
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

const SAMPLE_APPOINTMENTS = {};

function createEmptyClientForm() {
  return {
    clientId: "",
    service: "",
    status: "pending",
    note: ""
  };
}

function createEmptyClientSearchForm() {
  return {
    firstName: "",
    lastName: "",
    middleName: ""
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

function AppointmentScheduler() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [specialists, setSpecialists] = useState([]);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState("");
  const [appointmentsBySpecialist, setAppointmentsBySpecialist] = useState(() => ({}));
  const [createModal, setCreateModal] = useState({
    open: false,
    mode: "create",
    appointmentId: "",
    specialistId: "",
    dayKey: "",
    dayLabel: "",
    date: null,
    time: ""
  });
  const [createForm, setCreateForm] = useState(createEmptyClientForm);
  const [createErrors, setCreateErrors] = useState({});
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [clientSearch, setClientSearch] = useState(createEmptyClientSearchForm);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [clientSearchMessage, setClientSearchMessage] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [clientMap, setClientMap] = useState({});
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
  const specialistOptions = useMemo(() => (
    specialists.map((specialist) => ({
      value: specialist.id,
      label: `${specialist.name} (${specialist.role})`
    }))
  ), [specialists]);
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
  const now = new Date();

  function closeCreateModal() {
    setCreateModal({
      open: false,
      mode: "create",
      appointmentId: "",
      specialistId: "",
      dayKey: "",
      dayLabel: "",
      date: null,
      time: ""
    });
    setCreateForm(createEmptyClientForm());
    setCreateErrors({});
    setCreateSubmitting(false);
    setClientSearch(createEmptyClientSearchForm());
    setClientSearchLoading(false);
    setClientSearchMessage("");
    setClientOptions([]);
  }

  function openCreateModal(day, slot, existingItem = null) {
    if (!selectedSpecialistId) {
      return;
    }
    setMessage("");
    setCreateModal({
      open: true,
      mode: existingItem ? "edit" : "create",
      appointmentId: String(existingItem?.id || ""),
      specialistId: selectedSpecialistId,
      dayKey: day.key,
      dayLabel: day.label,
      date: day.date,
      time: slot
    });
    if (existingItem) {
      setCreateForm({
        clientId: String(existingItem?.clientId || ""),
        service: String(existingItem?.service || ""),
        status: String(existingItem?.status || "pending"),
        note: String(existingItem?.note || "")
      });
    } else {
      setCreateForm(createEmptyClientForm());
    }
    setCreateErrors({});
  }

  useEffect(() => {
    if (!createModal.open) {
      return;
    }
    const trimmedFirstName = String(clientSearch.firstName || "").trim();
    const trimmedLastName = String(clientSearch.lastName || "").trim();
    const trimmedMiddleName = String(clientSearch.middleName || "").trim();
    const combinedLength = `${trimmedFirstName}${trimmedLastName}${trimmedMiddleName}`.length;
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
          page: "1",
          limit: "100"
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

        const response = await apiFetch(`/api/clients?${queryParams.toString()}`, {
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
  }, [clientSearch.firstName, clientSearch.lastName, clientSearch.middleName, createModal.open]);

  function validateCreateForm(value) {
    const errors = {};
    const clientId = String(value.clientId || "").trim();
    const service = String(value.service || "").trim();
    const note = String(value.note || "").trim();

    if (!clientId) {
      errors.clientId = "Client is required.";
    }
    if (!service) {
      errors.service = "Service is required.";
    }
    if (note.length > 255) {
      errors.note = "Note is too long.";
    }

    return errors;
  }

  async function handleCreateSubmit(event) {
    event.preventDefault();

    if (!createModal.open) {
      return;
    }

    try {
      setCreateSubmitting(true);
      setCreateErrors({});

      const nextPayload = {
        clientId: String(createForm.clientId || "").trim(),
        service: String(createForm.service || "").trim(),
        status: String(createForm.status || "pending").trim().toLowerCase(),
        note: String(createForm.note || "").trim()
      };

      const errors = validateCreateForm(nextPayload);
      if (Object.keys(errors).length > 0) {
        setCreateErrors(errors);
        return;
      }

      const specialistId = String(createModal.specialistId || "");
      const dayKey = String(createModal.dayKey || "");
      const time = String(createModal.time || "");
      if (!specialistId || !dayKey || !time) {
        setCreateErrors({ form: "Invalid slot. Please try again." });
        return;
      }
      if (!nextPayload.clientId) {
        setCreateErrors({ clientId: "Client is required." });
        return;
      }

      const existingItems = appointmentsBySpecialist[specialistId]?.[dayKey] || [];
      const isEditMode = createModal.mode === "edit";
      const editingId = String(createModal.appointmentId || "");
      const hasSlotConflict = existingItems.some((item) => {
        const sameTime = String(item.time || "") === time;
        if (!sameTime) {
          return false;
        }
        if (!isEditMode) {
          return true;
        }
        return String(item.id || "") !== editingId;
      });
      if (hasSlotConflict) {
        setCreateErrors({ form: "This slot is already occupied." });
        return;
      }

      setAppointmentsBySpecialist((prev) => {
        const specialistItems = { ...(prev[specialistId] || {}) };
        const dayItems = Array.isArray(specialistItems[dayKey]) ? [...specialistItems[dayKey]] : [];
        const client = clientMap[nextPayload.clientId];
        const fullName = client ? getClientCardName(client) : `Client #${nextPayload.clientId}`;
        const nextItem = {
          id: String(createModal.appointmentId || `local_${Date.now()}`),
          clientId: nextPayload.clientId,
          time,
          client: fullName,
          service: nextPayload.service,
          status: nextPayload.status,
          note: nextPayload.note
        };

        const existingIndex = dayItems.findIndex((item) => (
          String(item.id || "") === String(createModal.appointmentId || "")
        ));
        if (existingIndex >= 0) {
          dayItems[existingIndex] = nextItem;
        } else {
          dayItems.push(nextItem);
        }
        dayItems.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
        specialistItems[dayKey] = dayItems;

        return {
          ...prev,
          [specialistId]: specialistItems
        };
      });

      setMessage(createModal.mode === "edit" ? "Appointment updated." : "Client added to schedule.");
      closeCreateModal();
    } finally {
      setCreateSubmitting(false);
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
                onChange={(nextValue) => setSelectedSpecialistId(nextValue)}
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

      <p className="all-users-state" hidden={!message}>
        {message}
      </p>

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
            {timeSlots.map((slot) => (
              <tr key={slot}>
                <th className="appointment-time-col" scope="row">{slot}</th>
                {weekDays.map((day) => {
                  const dayHours = settings.workingHours?.[day.key] || {};
                  const slotMinutes = normalizeTimeToMinutes(slot);
                  const startMinutes = normalizeTimeToMinutes(dayHours.start);
                  const endMinutes = normalizeTimeToMinutes(dayHours.end);
                  const isInsideWorkingHours = (
                    slotMinutes !== null
                    && startMinutes !== null
                    && endMinutes !== null
                    && slotMinutes >= startMinutes
                    && slotMinutes < endMinutes
                  );
                  const item = (appointmentsByDay[day.key] || []).find((event) => event.time === slot);

                  return (
                    <td key={`${day.key}-${slot}`}>
                      {!isInsideWorkingHours ? (
                        <span className="appointment-off-slot">o</span>
                      ) : item ? (
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
                        <button
                          type="button"
                          className="appointment-add-slot"
                          aria-label={`Add appointment on ${day.label} at ${slot}`}
                          onClick={() => openCreateModal(day, slot)}
                        >
                          +
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createModal.open && (
        <>
          <section id="appointmentCreateClientModal" className="logout-confirm-modal appointment-create-modal">
            <h3>To Schedule</h3>
            <form className="auth-form" noValidate onSubmit={handleCreateSubmit}>
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

              <div className="field">
                <label htmlFor="appointmentClientSearchMiddle">Middle</label>
                <input
                  id="appointmentClientSearchMiddle"
                  type="text"
                  placeholder="Middle name"
                  value={clientSearch.middleName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientSearch((prev) => ({ ...prev, middleName: nextValue }));
                  }}
                />
                <small className="field-error">{clientSearchMessage || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="appointmentCreateClientSelect">Client</label>
                <CustomSelect
                  id="appointmentCreateClientSelect"
                  placeholder="Select client"
                  value={createForm.clientId}
                  options={clientSelectOptions}
                  maxVisibleOptions={10}
                  error={Boolean(createErrors.clientId)}
                  onChange={(nextValue) => {
                    setCreateForm((prev) => ({ ...prev, clientId: nextValue }));
                    if (createErrors.clientId) {
                      setCreateErrors((prev) => ({ ...prev, clientId: "" }));
                    }
                  }}
                />
                <small className="field-error">{createErrors.clientId || ""}</small>
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

              <div className="field">
                <label htmlFor="appointmentCreateStatus">Status</label>
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

              <small className="field-error">{createErrors.form || ""}</small>
              <div className="edit-actions">
                <button className="btn" type="submit" disabled={createSubmitting}>
                  {createSubmitting ? "Saving..." : "Save"}
                </button>
                <button className="header-btn" type="button" onClick={closeCreateModal}>
                  Cancel
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

      <p className="all-users-state" hidden={!loading}>
        Loading scheduler...
      </p>
    </section>
  );
}

export default AppointmentScheduler;
