import { useEffect, useMemo, useState } from "react";
import { apiFetch, readApiResponseData } from "../../lib/api.js";

const DAYS = [
  { key: "mon", dayOfWeek: "1", label: "Mon" },
  { key: "tue", dayOfWeek: "2", label: "Tue" },
  { key: "wed", dayOfWeek: "3", label: "Wed" },
  { key: "thu", dayOfWeek: "4", label: "Thu" },
  { key: "fri", dayOfWeek: "5", label: "Fri" },
  { key: "sat", dayOfWeek: "6", label: "Sat" },
  { key: "sun", dayOfWeek: "7", label: "Sun" }
];

function createDefaultForm() {
  return {
    slotInterval: "",
    slotSubDivisions: "1",
    slotCellHeightPx: "18",
    historyLockDays: "10",
    appointmentDurationOptions: "",
    visibleWeekDays: [],
    workingHours: null,
    noShowThreshold: "1"
  };
}

function mapWorkingHoursToDefaultWeeklyRows(workingHours) {
  return DAYS.map((day) => {
    const source = workingHours && typeof workingHours === "object"
      ? workingHours[day.key]
      : null;
    const startTime = String(source?.start || "").trim();
    const endTime = String(source?.end || "").trim();
    const isActive = Boolean(startTime && endTime && startTime < endTime);
    return {
      dayOfWeek: day.dayOfWeek,
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
    appointmentDurationOptions: Array.isArray(normalizedSource.appointmentDurationOptions)
      ? normalizedSource.appointmentDurationOptions.join(",")
      : String(normalizedSource.appointmentDuration ?? ""),
    visibleWeekDays: nextVisibleWeekDays,
    workingHours: normalizedSource.workingHours && typeof normalizedSource.workingHours === "object"
      ? normalizedSource.workingHours
      : null,
    noShowThreshold: String(normalizedSource.noShowThreshold ?? "1")
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

function withDefaultWeeklyTimes(row, nextStartTime, nextEndTime) {
  const startTime = String(nextStartTime || "").trim();
  const endTime = String(nextEndTime || "").trim();
  const hasValidTimeRange = Boolean(startTime && endTime && startTime < endTime);
  return {
    ...row,
    startTime,
    endTime,
    isActive: hasValidTimeRange,
    reason: ""
  };
}

function AppointmentSettingsPanel({
  canUpdateAppointments = true,
  canUpdateSettingsAppointments = canUpdateAppointments,
  profile = null
}) {
  const currentOrganizationId = String(profile?.organizationId || "").trim();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(null);
  const [defaultWeeklyRows, setDefaultWeeklyRows] = useState([]);
  const initialDefaultWeeklyRows = useMemo(() => (
    mapWorkingHoursToDefaultWeeklyRows(form?.workingHours)
  ), [form?.workingHours]);

  useEffect(() => {
    const text = String(message || "").trim();
    if (!text) {
      return;
    }

    window.alert(text);
    setMessage("");
  }, [message]);

  useEffect(() => {
    setDefaultWeeklyRows(initialDefaultWeeklyRows);
  }, [initialDefaultWeeklyRows]);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      if (!currentOrganizationId) {
        return;
      }

      try {
        const query = new URLSearchParams({
          organizationId: currentOrganizationId
        });
        const response = await apiFetch(`/api/appointments/settings?${query.toString()}`, {
          method: "GET",
          cache: "no-store"
        });
        const data = await readApiResponseData(response);
        if (!active) {
          return;
        }
        if (!response.ok) {
          setMessage(data?.message || "Failed to load appointment settings.");
          setForm(createDefaultForm());
          return;
        }
        setForm(mapSettingsItemToForm(data?.item));
      } catch {
        if (active) {
          setMessage("Failed to load appointment settings.");
          setForm(createDefaultForm());
        }
      }
    }

    void loadSettings();
    return () => {
      active = false;
    };
  }, [currentOrganizationId]);

  function handleFormField(field, value) {
    setForm((prev) => ({
      ...(prev || createDefaultForm()),
      [field]: value
    }));
  }

  function handleDayToggle(dayKey, checked) {
    setForm((prev) => {
      const current = new Set(Array.isArray(prev?.visibleWeekDays) ? prev.visibleWeekDays : []);
      if (checked) {
        current.add(dayKey);
      } else {
        current.delete(dayKey);
      }
      return {
        ...(prev || createDefaultForm()),
        visibleWeekDays: Array.from(current).filter((item) => DAYS.some((day) => day.key === item))
      };
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!form || saving || !canUpdateSettingsAppointments || !currentOrganizationId) {
      return;
    }

    setSaving(true);
    try {
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

      const durationOptions = parseDurationOptionsInput(form.appointmentDurationOptions);
      if (durationOptions.length === 0) {
        setMessage("Appointment durations must include at least one value.");
        return;
      }

      if (!Array.isArray(form.visibleWeekDays) || form.visibleWeekDays.length === 0) {
        setMessage("Select at least one visible week day.");
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

      const payload = {
        organizationId: currentOrganizationId,
        slotInterval: slotIntervalResult.value,
        slotSubDivisions: slotSubDivisionsResult.value,
        slotCellHeightPx: slotCellHeightResult.value,
        historyLockDays: historyLockDaysResult.value,
        appointmentDurationOptions: durationOptions,
        visibleWeekDays: form.visibleWeekDays,
        noShowThreshold: Number.parseInt(String(form.noShowThreshold || "1").trim(), 10) || 1,
        reminderHours: 24,
        reminderChannels: ["sms", "email", "telegram"],
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
            organizationId: currentOrganizationId
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

  if (!form) {
    return <div className="appointment-settings-form" aria-label="Appointment settings list" />;
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
            disabled={!canUpdateSettingsAppointments}
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
            disabled={!canUpdateSettingsAppointments}
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
            disabled={!canUpdateSettingsAppointments}
            onChange={(event) => handleFormField("slotCellHeightPx", event.currentTarget.value)}
          />
          <span>px</span>
        </div>
      </div>

      <div className="appointment-setting-row">
        <label htmlFor="appointmentDurationInput">4. Appointment Durations</label>
        <div className="appointment-setting-inline">
          <input
            id="appointmentDurationInput"
            className="appointment-duration-options-input"
            type="text"
            value={form.appointmentDurationOptions}
            placeholder="30,45,60"
            disabled={!canUpdateSettingsAppointments}
            onChange={(event) => handleFormField("appointmentDurationOptions", event.currentTarget.value)}
          />
          <span>minutes</span>
        </div>
      </div>

      <div className="appointment-setting-row">
        <label>5. Visible Week Days</label>
        <div className="appointment-reminder-channels">
          {DAYS.map((day) => (
            <label key={day.key} htmlFor={`appointmentDay_${day.key}`}>
              <input
                id={`appointmentDay_${day.key}`}
                type="checkbox"
                checked={form.visibleWeekDays.includes(day.key)}
                disabled={!canUpdateSettingsAppointments}
                onChange={(event) => handleDayToggle(day.key, event.currentTarget.checked)}
              />
              {day.label}
            </label>
          ))}
        </div>
      </div>

      <div className="appointment-settings-form ws-default-form">
        <div className="appointment-setting-row">
          <label>6. Default Weekly Schedule</label>
          <div className="ws-default-group-body">
            {defaultWeeklyRows.map((row, index) => (
              <div className="ws-default-day-row" key={`defaultWeeklyRow_${row.dayOfWeek}`}>
                <span className="ws-default-day-label">{row.label}</span>
                <label className="ws-default-time-field" htmlFor={`wsDefaultStart_${row.dayOfWeek}`}>
                  <span>Start</span>
                  <input
                    id={`wsDefaultStart_${row.dayOfWeek}`}
                    type="time"
                    value={row.startTime}
                    disabled={!canUpdateSettingsAppointments}
                    onChange={(event) => {
                      const value = String(event.target.value || "");
                      setDefaultWeeklyRows((prev) => prev.map((item, itemIndex) => (
                        itemIndex === index
                          ? withDefaultWeeklyTimes(item, value, item.endTime)
                          : item
                      )));
                    }}
                  />
                </label>
                <label className="ws-default-time-field" htmlFor={`wsDefaultEnd_${row.dayOfWeek}`}>
                  <span>End</span>
                  <input
                    id={`wsDefaultEnd_${row.dayOfWeek}`}
                    type="time"
                    value={row.endTime}
                    disabled={!canUpdateSettingsAppointments}
                    onChange={(event) => {
                      const value = String(event.target.value || "");
                      setDefaultWeeklyRows((prev) => prev.map((item, itemIndex) => (
                        itemIndex === index
                          ? withDefaultWeeklyTimes(item, item.startTime, value)
                          : item
                      )));
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="appointment-setting-row">
        <label htmlFor="historyLockDaysInput">7. History Lock (days)</label>
        <div className="appointment-setting-inline">
          <input
            id="historyLockDaysInput"
            type="number"
            min="0"
            max="3650"
            value={form.historyLockDays}
            disabled={!canUpdateSettingsAppointments}
            onChange={(event) => handleFormField("historyLockDays", event.currentTarget.value)}
          />
          <span>days</span>
        </div>
      </div>

      <div className="appointment-settings-actions">
        <button className="btn" type="submit" disabled={saving || !canUpdateSettingsAppointments || !currentOrganizationId}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

export default AppointmentSettingsPanel;
