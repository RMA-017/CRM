import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" }
];

const DEFAULT_DAY_TIME = {
  mon: { start: "09:00", end: "18:00" },
  tue: { start: "09:00", end: "18:00" },
  wed: { start: "09:00", end: "18:00" },
  thu: { start: "09:00", end: "18:00" },
  fri: { start: "09:00", end: "18:00" },
  sat: { start: "10:00", end: "16:00" },
  sun: { start: "", end: "" }
};

function createDayTimeMap() {
  return DAYS.reduce((acc, day) => {
    acc[day.key] = { ...DEFAULT_DAY_TIME[day.key] };
    return acc;
  }, {});
}

function AppointmentSettingsPanel({ canUpdateAppointments = true }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [form, setForm] = useState({
    slotInterval: "30",
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    noShowThreshold: "3",
    reminderHours: "24"
  });
  const [workingHours, setWorkingHours] = useState(createDayTimeMap);
  const [initialForm, setInitialForm] = useState(null);
  const [initialWorkingHours, setInitialWorkingHours] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        setLoading(true);
        setMessage("");
        setMessageType("");

        const response = await apiFetch("/api/appointments/settings", {
          method: "GET",
          cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));

        if (!active) {
          return;
        }

        if (!response.ok) {
          setMessage(data?.message || "Failed to load appointment settings.");
          setMessageType("error");
          return;
        }

        const item = data?.item;
        if (!item || typeof item !== "object") {
          return;
        }

        const nextVisibleWeekDays = Array.isArray(item.visibleWeekDays)
          ? item.visibleWeekDays
              .map((dayKey) => String(dayKey || "").trim().toLowerCase())
              .filter((dayKey) => DAYS.some((day) => day.key === dayKey))
          : [];

        setForm((prev) => ({
          ...prev,
          slotInterval: String(item.slotInterval ?? prev.slotInterval),
          visibleWeekDays: nextVisibleWeekDays.length > 0 ? nextVisibleWeekDays : prev.visibleWeekDays,
          noShowThreshold: String(item.noShowThreshold ?? prev.noShowThreshold),
          reminderHours: String(item.reminderHours ?? prev.reminderHours)
        }));

        if (item.workingHours && typeof item.workingHours === "object") {
          const nextWorkingHours = createDayTimeMap();
          DAYS.forEach((day) => {
            const value = item.workingHours?.[day.key];
            nextWorkingHours[day.key] = {
              start: String(value?.start || ""),
              end: String(value?.end || "")
            };
          });
          setWorkingHours(nextWorkingHours);
          setInitialWorkingHours(nextWorkingHours);
        }

        setInitialForm({
          slotInterval: String(item.slotInterval ?? "30"),
          visibleWeekDays: nextVisibleWeekDays.length > 0 ? nextVisibleWeekDays : ["mon", "tue", "wed", "thu", "fri", "sat"],
          noShowThreshold: String(item.noShowThreshold ?? "3"),
          reminderHours: String(item.reminderHours ?? "24")
        });
      } catch {
        if (active) {
          setMessage("Failed to load appointment settings.");
          setMessageType("error");
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
  }, []);

  function handleFormField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleDayToggle(dayKey, checked) {
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

  function handleDayTimeChange(setter, dayKey, field, value) {
    setter((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value
      }
    }));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!canUpdateAppointments) {
      setMessage("You do not have permission to update appointment settings.");
      setMessageType("error");
      return;
    }

    try {
      setSaving(true);
      setMessage("");
      setMessageType("");

      const payload = {
        slotInterval: String(form.slotInterval || "").trim(),
        visibleWeekDays: form.visibleWeekDays,
        workingHours,
        noShowThreshold: String(form.noShowThreshold || "").trim(),
        reminderHours: String(form.reminderHours || "").trim()
      };

      const response = await apiFetch("/api/appointments/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data?.message || "Failed to save appointment settings.");
        setMessageType("error");
        return;
      }

      setMessage(data?.message || "Appointment settings updated.");
      setMessageType("success");
      setInitialForm({
        ...form,
        visibleWeekDays: Array.isArray(form.visibleWeekDays) ? [...form.visibleWeekDays] : []
      });
      setInitialWorkingHours(JSON.parse(JSON.stringify(workingHours)));
    } catch {
      setMessage("Failed to save appointment settings.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
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
        <label>2. Visible Week Days</label>
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
        <label>3. Working Hours</label>
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
        <label>4. No-show Rules</label>
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
        <label>5. Reminder Settings</label>
        <div className="appointment-setting-inline">
          <input
            id="appointmentReminderHoursInput"
            type="number"
            min="1"
            value={form.reminderHours}
            disabled={loading || !canUpdateAppointments}
            onChange={(event) => handleFormField("reminderHours", event.currentTarget.value)}
          />
          <span>hours before appointment</span>
        </div>
      </div>

      <div className="appointment-settings-actions">
        <button className="btn" type="submit" disabled={loading || saving || !canUpdateAppointments}>
          {saving ? "Saving..." : "Save"}
        </button>
        <p className={`appointment-settings-message${messageType ? ` is-${messageType}` : ""}`} hidden={!message}>
          {message}
        </p>
      </div>
    </form>
  );
}

export default AppointmentSettingsPanel;
