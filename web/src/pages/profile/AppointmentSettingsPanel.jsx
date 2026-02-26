import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiResponseData } from "../../lib/api.js";
import CustomSelect from "../../components/CustomSelect.jsx";

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
const BREAK_DAY_OPTIONS = DAYS.map((day, index) => ({
  value: index + 1,
  label: day.label
}));
const APPOINTMENT_SPECIALIST_STORAGE_KEY = "crm_appointment_selected_specialist_id";
const APPOINTMENT_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY = "crm_appointment_settings_selected_specialist_id";
const APPOINTMENT_SETTINGS_ORGANIZATION_STORAGE_KEY = "crm_appointment_settings_selected_organization_id";

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

function readStoredOrganizationId() {
  if (typeof window === "undefined") {
    return "";
  }
  return String(window.localStorage.getItem(APPOINTMENT_SETTINGS_ORGANIZATION_STORAGE_KEY) || "").trim();
}

const DEFAULT_DAY_TIME = {
  mon: { start: "09:00", end: "18:00" },
  tue: { start: "09:00", end: "18:00" },
  wed: { start: "09:00", end: "18:00" },
  thu: { start: "09:00", end: "18:00" },
  fri: { start: "09:00", end: "18:00" },
  sat: { start: "10:00", end: "16:00" },
  sun: { start: "", end: "" }
};

function createDefaultForm() {
  return {
    slotInterval: "30",
    slotSubDivisions: "1",
    appointmentDurationOptions: "30",
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    noShowThreshold: "3",
    reminderHours: "24",
    reminderChannels: ["sms", "email", "telegram"]
  };
}

function createDayTimeMap() {
  return DAYS.reduce((acc, day) => {
    acc[day.key] = { ...DEFAULT_DAY_TIME[day.key] };
    return acc;
  }, {});
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

function normalizeReminderChannels(value, { allowEmpty = false } = {}) {
  const normalized = Array.isArray(value)
    ? value
        .map((channel) => String(channel || "").trim().toLowerCase())
        .filter((channel) => REMINDER_CHANNEL_OPTIONS.some((option) => option.key === channel))
    : [];
  if (normalized.length > 0) {
    return normalized;
  }
  return allowEmpty ? [] : ["sms", "email", "telegram"];
}

function createEmptyBreakItem(dayOfWeek = 1) {
  return {
    dayOfWeek,
    breakType: "lunch",
    startTime: "12:00",
    endTime: "13:00",
    title: "",
    note: "",
    isActive: true
  };
}

function normalizeBreakItem(value) {
  const rawDayOfWeek = Number.parseInt(String(value?.dayOfWeek ?? "").trim(), 10);
  const dayOfWeek = Number.isInteger(rawDayOfWeek) && rawDayOfWeek >= 1 && rawDayOfWeek <= 7 ? rawDayOfWeek : 1;
  const breakType = String(value?.breakType || "lunch").trim().toLowerCase();
  return {
    dayOfWeek,
    breakType: BREAK_TYPE_OPTIONS.some((option) => option.value === breakType) ? breakType : "lunch",
    startTime: String(value?.startTime || "12:00").trim() || "12:00",
    endTime: String(value?.endTime || "13:00").trim() || "13:00",
    title: String(value?.title || "").trim(),
    note: String(value?.note || "").trim(),
    isActive: value?.isActive !== false
  };
}

function AppointmentSettingsPanel({
  canUpdateAppointments = true,
  panelMode = "settings",
  organizations = [],
  profile = null
}) {
  const isBreaksMode = String(panelMode || "").trim().toLowerCase() === "breaks";
  const currentOrganizationId = String(profile?.organizationId || "").trim();
  const currentOrganizationName = String(profile?.organizationName || "").trim();
  const currentOrganizationCode = String(profile?.organizationCode || "").trim();
  const hasOrganizationsList = Array.isArray(organizations) && organizations.length > 0;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(() => (
    readStoredOrganizationId() || currentOrganizationId
  ));

  const [form, setForm] = useState(null);
  const [workingHours, setWorkingHours] = useState(null);
  const [breakSpecialists, setBreakSpecialists] = useState([]);
  const [selectedBreakSpecialistId, setSelectedBreakSpecialistId] = useState(() => (
    readStoredBreaksSpecialistId()
  ));
  const [breakItems, setBreakItems] = useState([]);
  const [breaksLoading, setBreaksLoading] = useState(false);
  const [breaksSaving, setBreaksSaving] = useState(false);

  const organizationOptions = useMemo(() => {
    const fallbackLabel = currentOrganizationName && currentOrganizationCode
      ? `${currentOrganizationName} (${currentOrganizationCode})`
      : (currentOrganizationName || currentOrganizationCode || "Current organization");
    const source = Array.isArray(organizations) ? organizations : [];
    const seen = new Set();
    const mapped = source
      .map((item) => {
        const value = String(item?.id || "").trim();
        if (!value || seen.has(value)) {
          return null;
        }
        seen.add(value);
        const code = String(item?.code || "").trim();
        const name = String(item?.name || "").trim();
        return {
          value,
          label: name && code ? `${name} (${code})` : (name || code || `Organization #${value}`)
        };
      })
      .filter(Boolean);

    if (currentOrganizationId && !seen.has(currentOrganizationId)) {
      mapped.unshift({
        value: currentOrganizationId,
        label: fallbackLabel
      });
    }
    if (mapped.length === 0 && currentOrganizationId) {
      mapped.push({
        value: currentOrganizationId,
        label: fallbackLabel
      });
    }
    return mapped;
  }, [currentOrganizationCode, currentOrganizationId, currentOrganizationName, organizations]);

  const canSwitchOrganization = Boolean(profile?.isAdmin) && organizationOptions.length > 1;
  const effectiveOrganizationId = String(selectedOrganizationId || currentOrganizationId || "").trim();

  useEffect(() => {
    setSelectedOrganizationId((prev) => {
      const prevId = String(prev || "").trim();
      if (prevId && organizationOptions.some((option) => option.value === prevId)) {
        return prevId;
      }
      if (prevId && !hasOrganizationsList) {
        return prevId;
      }
      if (currentOrganizationId && organizationOptions.some((option) => option.value === currentOrganizationId)) {
        return currentOrganizationId;
      }
      return organizationOptions[0]?.value || currentOrganizationId || "";
    });
  }, [currentOrganizationId, hasOrganizationsList, organizationOptions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const nextId = String(selectedOrganizationId || "").trim();
    if (!nextId) {
      window.localStorage.removeItem(APPOINTMENT_SETTINGS_ORGANIZATION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(APPOINTMENT_SETTINGS_ORGANIZATION_STORAGE_KEY, nextId);
  }, [selectedOrganizationId]);

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
      setForm(null);
      setWorkingHours(null);
      setLoading(false);
      return undefined;
    }

    let active = true;

    async function loadSettings() {
      try {
        setLoading(true);
        setMessage("");
        setForm(null);
        setWorkingHours(null);

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

        const item = data?.item;
        const source = item && typeof item === "object"
          ? item
          : createDefaultForm();

        const nextVisibleWeekDays = Array.isArray(source.visibleWeekDays)
          ? source.visibleWeekDays
              .map((dayKey) => String(dayKey || "").trim().toLowerCase())
              .filter((dayKey) => DAYS.some((day) => day.key === dayKey))
          : [];

        const nextForm = {
          slotInterval: String(source.slotInterval ?? "30"),
          slotSubDivisions: String(source.slotSubDivisions ?? "1"),
          appointmentDurationOptions: Array.isArray(source.appointmentDurationOptions)
            ? source.appointmentDurationOptions.join(",")
            : String(source.appointmentDuration ?? "30"),
          visibleWeekDays: nextVisibleWeekDays.length > 0 ? nextVisibleWeekDays : ["mon", "tue", "wed", "thu", "fri", "sat"],
          noShowThreshold: String(source.noShowThreshold ?? "3"),
          reminderHours: String(source.reminderHours ?? "24"),
          reminderChannels: normalizeReminderChannels(source.reminderChannels)
        };
        const nextWorkingHours = createDayTimeMap();
        if (source.workingHours && typeof source.workingHours === "object") {
          DAYS.forEach((day) => {
            const value = source.workingHours?.[day.key];
            nextWorkingHours[day.key] = {
              start: String(value?.start || ""),
              end: String(value?.end || "")
            };
          });
        }

        setForm(nextForm);
        setWorkingHours(nextWorkingHours);
      } catch {
        if (active) {
          setMessage("Failed to load appointment settings.");
        }
      } finally {
        if (active) {
          setLoading(false);
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
      return undefined;
    }

    let active = true;

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
        setSelectedBreakSpecialistId((prev) => {
          const persisted = readStoredBreaksSpecialistId();
          const preferredId = String(prev || persisted || "").trim();
          if (preferredId && nextSpecialists.some((item) => item.id === preferredId)) {
            return preferredId;
          }
          return nextSpecialists[0]?.id || "";
        });
      } catch {
        if (active) {
          setBreakSpecialists([]);
          setSelectedBreakSpecialistId("");
        }
      }
    }

    loadSpecialists();
    return () => {
      active = false;
    };
  }, [isBreaksMode]);

  useEffect(() => {
    if (!isBreaksMode || typeof window === "undefined") {
      return;
    }

    const specialistId = String(selectedBreakSpecialistId || "").trim();
    if (!specialistId) {
      window.localStorage.removeItem(APPOINTMENT_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(APPOINTMENT_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY, specialistId);
    window.localStorage.setItem(APPOINTMENT_SPECIALIST_STORAGE_KEY, specialistId);
  }, [isBreaksMode, selectedBreakSpecialistId]);

  useEffect(() => {
    if (!isBreaksMode) {
      return undefined;
    }

    const specialistId = String(selectedBreakSpecialistId || "").trim();
    if (!specialistId) {
      setBreakItems([]);
      setBreaksLoading(false);
      return;
    }

    let active = true;

    async function loadBreaks() {
      try {
        setBreaksLoading(true);
        const query = new URLSearchParams({ specialistId }).toString();
        const response = await apiFetch(`/api/appointments/breaks?${query}`, {
          method: "GET",
          cache: "no-store"
        });
        const data = await readApiResponseData(response);
        if (!active) {
          return;
        }
        if (!response.ok) {
          setBreakItems([]);
          return;
        }
        const items = Array.isArray(data?.items) ? data.items : [];
        setBreakItems(items.map((item) => normalizeBreakItem(item)));
      } catch {
        if (active) {
          setBreakItems([]);
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
  }, [isBreaksMode, selectedBreakSpecialistId]);

  const breakSpecialistOptions = breakSpecialists.map((specialist) => ({
    value: specialist.id,
    label: `${specialist.name} (${specialist.role})`
  }));

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

  function handleDayTimeChange(setter, dayKey, field, value) {
    setter((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value
      }
    }));
  }

  function handleBreakFieldChange(index, field, value) {
    setBreakItems((prev) => prev.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, [field]: value }
        : item
    )));
  }

  function handleAddBreak() {
    setBreakItems((prev) => [...prev, createEmptyBreakItem()]);
  }

  function handleDeleteBreak(index) {
    setBreakItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!isBreaksMode && (!form || !workingHours)) {
      return;
    }
    if (!canUpdateAppointments) {
      setMessage(
        isBreaksMode
          ? "You do not have permission to update appointment breaks."
          : "You do not have permission to update appointment settings."
      );
      return;
    }

    try {
      setSaving(true);
      setBreaksSaving(false);
      setMessage("");
      const targetOrganizationId = String(effectiveOrganizationId || "").trim();

      if (isBreaksMode) {
        const specialistId = String(selectedBreakSpecialistId || "").trim();
        if (!specialistId) {
          setMessage("Specialist is required.");
          return;
        }

        setBreaksSaving(true);
        const breaksPayload = {
          specialistId,
          items: breakItems.map((item) => normalizeBreakItem(item))
        };
        const breaksResponse = await apiFetch("/api/appointments/breaks", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(breaksPayload)
        });
        const breaksData = await readApiResponseData(breaksResponse);
        if (!breaksResponse.ok) {
          setMessage(breaksData?.message || "Failed to save appointment breaks.");
          return;
        }

        const nextItems = Array.isArray(breaksData?.items) ? breaksData.items.map((item) => normalizeBreakItem(item)) : [];
        setBreakItems(nextItems);
        setMessage(breaksData?.message || "Appointment breaks updated.");
        return;
      }

      if (!targetOrganizationId) {
        setMessage("Organization is required.");
        return;
      }

      const payload = {
        organizationId: targetOrganizationId,
        slotInterval: String(form.slotInterval || "").trim(),
        slotSubDivisions: Number.parseInt(String(form.slotSubDivisions || "1"), 10) || 1,
        appointmentDurationOptions: parseDurationOptionsInput(form.appointmentDurationOptions),
        visibleWeekDays: form.visibleWeekDays,
        workingHours,
        noShowThreshold: String(form.noShowThreshold || "").trim(),
        reminderHours: String(form.reminderHours || "").trim(),
        reminderChannels: Array.isArray(form.reminderChannels) ? form.reminderChannels : []
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

      setMessage(data?.message || "Appointment settings updated.");
    } catch {
      setMessage(isBreaksMode ? "Failed to save appointment breaks." : "Failed to save appointment settings.");
    } finally {
      setBreaksSaving(false);
      setSaving(false);
    }
  }

  if (!isBreaksMode && (!form || !workingHours)) {
    return <div className="appointment-settings-list" aria-label="Appointment settings list" />;
  }

  if (isBreaksMode) {
    return (
      <form
        className="appointment-settings-list appointment-settings-list-breaks"
        aria-label="Appointment settings list"
        onSubmit={handleSave}
      >
        <div className="appointment-setting-row appointment-setting-row-breaks">
          <div className="appointment-breaks-block">
            <div className="appointment-breaks-toolbar">
              <div className="appointment-breaks-specialist-field">
                <div className="appointment-specialist-row">
                  <span className="appointment-toolbar-label">Specialist</span>
                  <div className="appointment-specialist-select-wrap">
                    <CustomSelect
                      id="appointmentBreaksSpecialistSelect"
                      placeholder={(loading || breaksLoading) ? "Loading specialists..." : "Select specialist"}
                      value={selectedBreakSpecialistId}
                      options={breakSpecialistOptions}
                      searchable
                      searchPlaceholder="Search specialist"
                      searchThreshold={20}
                      maxVisibleOptions={10}
                      onChange={(nextValue) => {
                        setSelectedBreakSpecialistId(nextValue);
                      }}
                    />
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="header-btn appointment-breaks-add-btn"
                disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments || !selectedBreakSpecialistId}
                onClick={handleAddBreak}
              >
                Add
              </button>
            </div>

            <div className="appointment-breaks-list">
              {breakItems.map((item, index) => (
                <div key={`appointmentBreakRow_${index}`} className="appointment-break-row">
                  <CustomSelect
                    id={`appointmentBreakDay_${index}`}
                    value={Number(item.dayOfWeek || 1)}
                    options={BREAK_DAY_OPTIONS}
                    disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments}
                    onChange={(nextValue) => {
                      handleBreakFieldChange(index, "dayOfWeek", Number.parseInt(String(nextValue || "1"), 10) || 1);
                    }}
                  />

                  <CustomSelect
                    id={`appointmentBreakType_${index}`}
                    value={item.breakType}
                    options={BREAK_TYPE_OPTIONS}
                    disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments}
                    onChange={(nextValue) => handleBreakFieldChange(index, "breakType", String(nextValue || "lunch"))}
                  />

                  <div className="appointment-break-time-field">
                    <span className="appointment-break-time-label">From</span>
                    <input
                      type="time"
                      value={item.startTime}
                      disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments}
                      onChange={(event) => handleBreakFieldChange(index, "startTime", event.currentTarget.value)}
                    />
                  </div>
                  <div className="appointment-break-time-field">
                    <span className="appointment-break-time-label">To</span>
                    <input
                      type="time"
                      value={item.endTime}
                      disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments}
                      onChange={(event) => handleBreakFieldChange(index, "endTime", event.currentTarget.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="header-btn appointment-breaks-delete-btn"
                    disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments}
                    onClick={() => handleDeleteBreak(index)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="appointment-settings-actions">
          <button
            className="btn appointment-settings-save-sticky-btn"
            type="submit"
            disabled={loading || saving || breaksSaving || breaksLoading || !canUpdateAppointments}
          >
            {(saving || breaksSaving) ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="appointment-settings-list" aria-label="Appointment settings list" onSubmit={handleSave}>
      <div className="appointment-setting-row">
        <label htmlFor="appointmentSettingsOrganizationSelect">Organization</label>
        <div className="appointment-setting-inline appointment-settings-organization-inline">
          <CustomSelect
            id="appointmentSettingsOrganizationSelect"
            placeholder="Select organization"
            value={effectiveOrganizationId}
            options={organizationOptions}
            disabled={loading || saving || !canSwitchOrganization}
            onChange={(nextValue) => {
              setSelectedOrganizationId(String(nextValue || "").trim());
            }}
          />
        </div>
      </div>

      <div className="appointment-setting-row">
        <label htmlFor="slotIntervalInput">1. Slot Interval</label>
        <div className="appointment-setting-inline">
          <input
            id="slotIntervalInput"
            type="number"
            min="1"
            value={form.slotInterval}
            disabled={loading || !canUpdateAppointments}
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
            disabled={loading || !canUpdateAppointments}
            onChange={(event) => handleFormField("slotSubDivisions", event.currentTarget.value)}
          />
          <span>per slot</span>
        </div>
      </div>

      <div className="appointment-setting-row">
        <label htmlFor="appointmentDurationInput">3. Appointment Durations</label>
        <div className="appointment-setting-inline">
          <input
            id="appointmentDurationInput"
            className="appointment-duration-options-input"
            type="text"
            value={form.appointmentDurationOptions}
            placeholder="30,45,60"
            disabled={loading || !canUpdateAppointments}
            onChange={(event) => handleFormField("appointmentDurationOptions", event.currentTarget.value)}
          />
          <span>minutes</span>
        </div>
      </div>

      <div className="appointment-setting-row">
        <label>4. Visible Week Days</label>
        <div className="appointment-reminder-channels">
          {DAYS.map((day) => (
            <label key={day.key} htmlFor={`appointmentDay_${day.key}`}>
              <input
                id={`appointmentDay_${day.key}`}
                type="checkbox"
                checked={form.visibleWeekDays.includes(day.key)}
                disabled={loading || !canUpdateAppointments}
                onChange={(event) => handleDayToggle(day.key, event.currentTarget.checked)}
              />
              {day.label}
            </label>
          ))}
        </div>
      </div>

      <div className="appointment-setting-row">
        <label>5. Working Hours</label>
        <div className="appointment-working-hours-grid">
          {DAYS.map((day) => (
            <div key={day.key} className="appointment-working-hours-item">
              <strong>{day.label}</strong>
              <input
                type="time"
                value={workingHours[day.key].start}
                disabled={loading || !canUpdateAppointments}
                onChange={(event) => handleDayTimeChange(setWorkingHours, day.key, "start", event.currentTarget.value)}
              />
              <span>-</span>
              <input
                type="time"
                value={workingHours[day.key].end}
                disabled={loading || !canUpdateAppointments}
                onChange={(event) => handleDayTimeChange(setWorkingHours, day.key, "end", event.currentTarget.value)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="appointment-setting-row">
        <label>6. No-show Rules</label>
        <div className="appointment-setting-inline">
          <input
            type="number"
            min="1"
            value={form.noShowThreshold}
            disabled={loading || !canUpdateAppointments}
            onChange={(event) => handleFormField("noShowThreshold", event.currentTarget.value)}
          />
          <span>count threshold</span>
        </div>
      </div>

      <div className="appointment-setting-row">
        <label>7. Reminder Settings</label>
        <div className="appointment-setting-inline appointment-reminder-settings-inline">
          <input
            id="appointmentReminderHoursInput"
            type="number"
            min="1"
            value={form.reminderHours}
            disabled={loading || !canUpdateAppointments}
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
                  disabled={loading || !canUpdateAppointments}
                  onChange={(event) => handleReminderChannelToggle(channel.key, event.currentTarget.checked)}
                />
                {channel.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="appointment-settings-actions">
        <button className="btn" type="submit" disabled={loading || saving || !canUpdateAppointments || !effectiveOrganizationId}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

export default AppointmentSettingsPanel;

