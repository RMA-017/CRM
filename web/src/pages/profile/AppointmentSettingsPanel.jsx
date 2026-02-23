import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";
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
const APPOINTMENT_SPECIALIST_STORAGE_KEY = "crm_appointment_selected_specialist_id";
const APPOINTMENT_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY = "crm_appointment_settings_selected_specialist_id";
const APPOINTMENT_VIP_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY = "crm_appointment_vip_settings_selected_specialist_id";

function getBreaksSpecialistStorageKey(isVipScope) {
  return isVipScope
    ? APPOINTMENT_VIP_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY
    : APPOINTMENT_SETTINGS_BREAKS_SPECIALIST_STORAGE_KEY;
}

function readStoredBreaksSpecialistId(isVipScope) {
  if (typeof window === "undefined") {
    return "";
  }

  const storageKey = getBreaksSpecialistStorageKey(isVipScope);
  const scopedValue = String(window.localStorage.getItem(storageKey) || "").trim();
  if (scopedValue) {
    return scopedValue;
  }

  return String(window.localStorage.getItem(APPOINTMENT_SPECIALIST_STORAGE_KEY) || "").trim();
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
    appointmentDurationOptions: "30",
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    noShowThreshold: "3",
    reminderHours: "24",
    reminderChannels: ["sms", "email", "telegram"]
  };
}

function createEmptyForm() {
  return {
    slotInterval: "",
    appointmentDuration: "",
    appointmentDurationOptions: "",
    visibleWeekDays: [],
    noShowThreshold: "",
    reminderHours: "",
    reminderChannels: []
  };
}

function createDayTimeMap() {
  return DAYS.reduce((acc, day) => {
    acc[day.key] = { ...DEFAULT_DAY_TIME[day.key] };
    return acc;
  }, {});
}

function createEmptyDayTimeMap() {
  return DAYS.reduce((acc, day) => {
    acc[day.key] = { start: "", end: "" };
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

function AppointmentSettingsPanel({ canUpdateAppointments = true, settingsScope = "default" }) {
  const isVipScope = String(settingsScope || "").trim().toLowerCase() === "vip";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState(null);
  const [workingHours, setWorkingHours] = useState(null);
  const [breakSpecialists, setBreakSpecialists] = useState([]);
  const [selectedBreakSpecialistId, setSelectedBreakSpecialistId] = useState(() => (
    readStoredBreaksSpecialistId(isVipScope)
  ));
  const [breakItems, setBreakItems] = useState([]);
  const [breaksLoading, setBreaksLoading] = useState(false);
  const [breaksSaving, setBreaksSaving] = useState(false);

  useEffect(() => {
    const text = String(message || "").trim();
    if (!text) {
      return;
    }

    window.alert(text);
    setMessage("");
  }, [message]);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        setLoading(true);
        setMessage("");
        setForm(null);
        setWorkingHours(null);

        const query = isVipScope ? "?scope=vip" : "";
        const response = await apiFetch(`/api/appointments/settings${query}`, {
          method: "GET",
          cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));

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
          : (isVipScope ? createEmptyForm() : createDefaultForm());

        const nextVisibleWeekDays = Array.isArray(source.visibleWeekDays)
          ? source.visibleWeekDays
              .map((dayKey) => String(dayKey || "").trim().toLowerCase())
              .filter((dayKey) => DAYS.some((day) => day.key === dayKey))
          : [];

        const defaultVisibleWeekDays = isVipScope ? [] : ["mon", "tue", "wed", "thu", "fri", "sat"];
        const nextForm = {
          slotInterval: String(source.slotInterval ?? "30"),
          appointmentDurationOptions: Array.isArray(source.appointmentDurationOptions)
            ? source.appointmentDurationOptions.join(",")
            : String(source.appointmentDuration ?? "30"),
          visibleWeekDays: nextVisibleWeekDays.length > 0 ? nextVisibleWeekDays : defaultVisibleWeekDays,
          noShowThreshold: String(source.noShowThreshold ?? "3"),
          reminderHours: String(source.reminderHours ?? "24"),
          reminderChannels: normalizeReminderChannels(source.reminderChannels, { allowEmpty: isVipScope })
        };
        const nextWorkingHours = isVipScope ? createEmptyDayTimeMap() : createDayTimeMap();
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
  }, [isVipScope]);

  useEffect(() => {
    let active = true;

    async function loadSpecialists() {
      try {
        const response = await apiFetch("/api/appointments/specialists", {
          method: "GET",
          cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
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
          .filter((item) => Boolean(item.id));

        setBreakSpecialists(nextSpecialists);
        setSelectedBreakSpecialistId((prev) => {
          const persisted = readStoredBreaksSpecialistId(isVipScope);
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
  }, [isVipScope]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storageKey = getBreaksSpecialistStorageKey(isVipScope);
    const specialistId = String(selectedBreakSpecialistId || "").trim();
    if (!specialistId) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, specialistId);
    window.localStorage.setItem(APPOINTMENT_SPECIALIST_STORAGE_KEY, specialistId);
  }, [isVipScope, selectedBreakSpecialistId]);

  useEffect(() => {
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
        const data = await response.json().catch(() => ({}));
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
  }, [selectedBreakSpecialistId]);

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
    if (!form || !workingHours) {
      return;
    }
    if (!canUpdateAppointments) {
      setMessage("You do not have permission to update appointment settings.");
      return;
    }

    try {
      setSaving(true);
      setBreaksSaving(false);
      setMessage("");

      const specialistId = String(selectedBreakSpecialistId || "").trim();
      if (specialistId) {
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
        const breaksData = await breaksResponse.json().catch(() => ({}));
        if (!breaksResponse.ok) {
          setMessage(breaksData?.message || "Failed to save appointment breaks.");
          return;
        }

        const nextItems = Array.isArray(breaksData?.items) ? breaksData.items.map((item) => normalizeBreakItem(item)) : [];
        setBreakItems(nextItems);
      }

      const payload = {
        slotInterval: String(form.slotInterval || "").trim(),
        appointmentDurationOptions: parseDurationOptionsInput(form.appointmentDurationOptions),
        visibleWeekDays: form.visibleWeekDays,
        workingHours,
        noShowThreshold: String(form.noShowThreshold || "").trim(),
        reminderHours: String(form.reminderHours || "").trim(),
        reminderChannels: Array.isArray(form.reminderChannels) ? form.reminderChannels : []
      };

      const query = isVipScope ? "?scope=vip" : "";
      const response = await apiFetch(`/api/appointments/settings${query}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data?.message || "Failed to save appointment settings.");
        return;
      }

      setMessage(data?.message || "Appointment settings updated.");
    } catch {
      setMessage("Failed to save appointment settings.");
    } finally {
      setBreaksSaving(false);
      setSaving(false);
    }
  }

  if (!form || !workingHours) {
    return <div className="appointment-settings-list" aria-label="Appointment settings list" />;
  }

  return (
    <form className="appointment-settings-list" aria-label="Appointment settings list" onSubmit={handleSave}>
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
        <label htmlFor="appointmentDurationInput">2. Appointment Durations</label>
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
        <label>3. Visible Week Days</label>
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
        <label>4. Working Hours</label>
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
        <label>5. No-show Rules</label>
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
        <label>6. Reminder Settings</label>
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

      <div className="appointment-setting-row">
        <label>7. Breaks</label>
        <div className="appointment-breaks-block">
          <div className="appointment-breaks-toolbar">
            <div className="appointment-breaks-specialist-field">
              <CustomSelect
                id="appointmentBreaksSpecialistSelect"
                placeholder="Select specialist"
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
            <button
              type="button"
              className="header-btn"
              disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments || !selectedBreakSpecialistId}
              onClick={handleAddBreak}
            >
              Add Break
            </button>
          </div>

          <div className="appointment-breaks-list">
            {breakItems.map((item, index) => (
              <div key={`appointmentBreakRow_${index}`} className="appointment-break-row">
                <select
                  value={String(item.dayOfWeek || "1")}
                  disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments}
                  onChange={(event) => handleBreakFieldChange(index, "dayOfWeek", Number.parseInt(event.currentTarget.value, 10) || 1)}
                >
                  {DAYS.map((day, dayIndex) => (
                    <option key={`appointmentBreakDay_${day.key}`} value={String(dayIndex + 1)}>
                      {day.label}
                    </option>
                  ))}
                </select>

                <select
                  value={item.breakType}
                  disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments}
                  onChange={(event) => handleBreakFieldChange(index, "breakType", event.currentTarget.value)}
                >
                  {BREAK_TYPE_OPTIONS.map((option) => (
                    <option key={`appointmentBreakType_${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <input
                  type="time"
                  value={item.startTime}
                  disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments}
                  onChange={(event) => handleBreakFieldChange(index, "startTime", event.currentTarget.value)}
                />
                <input
                  type="time"
                  value={item.endTime}
                  disabled={loading || breaksLoading || breaksSaving || !canUpdateAppointments}
                  onChange={(event) => handleBreakFieldChange(index, "endTime", event.currentTarget.value)}
                />

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
        <button className="btn" type="submit" disabled={loading || saving || breaksSaving || breaksLoading || !canUpdateAppointments}>
          {(saving || breaksSaving) ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

export default AppointmentSettingsPanel;
