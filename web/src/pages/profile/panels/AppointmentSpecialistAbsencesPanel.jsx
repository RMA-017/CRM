import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../../lib/api.js";
import { formatDateForInput } from "../../../lib/formatters.js";

function formatDateTimeLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "-";
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return normalized;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function createEmptyForm(todayYmd) {
  return {
    absenceDate: String(todayYmd || "").trim(),
    reason: ""
  };
}

function AppointmentSpecialistAbsencesPanel({
  canReadAppointmentSpecialistAbsences,
  canCreateAppointmentSpecialistAbsences,
  canDeleteAppointmentSpecialistAbsences,
  closeAppointmentSpecialistAbsencesPanel
}) {
  const todayYmd = useMemo(() => formatDateForInput(new Date()), []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(() => createEmptyForm(todayYmd));

  const dispatchPlannerRefresh = useCallback((detail = {}) => {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(new window.CustomEvent("crm:appointment-change", {
      detail: {
        type: "specialist-absence-updated",
        ...detail
      }
    }));
  }, []);

  const loadAbsences = useCallback(async ({ silent = false } = {}) => {
    if (!canReadAppointmentSpecialistAbsences) {
      setItems([]);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
      }
      const response = await apiFetch("/api/appointments/absences", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setItems([]);
        setMessage(getApiErrorMessage(response, data, "Failed to load specialist absences."));
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          absenceDate: String(item?.absenceDate || "").trim(),
          reason: String(item?.reason || "").trim(),
          updatedAt: item?.updatedAt || null
        }))
        .filter((item) => Boolean(item.id) && Boolean(item.absenceDate));

      setItems(nextItems);
      setMessage("");
    } catch {
      setItems([]);
      setMessage("Failed to load specialist absences.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [canReadAppointmentSpecialistAbsences]);

  useEffect(() => {
    void loadAbsences();
  }, [loadAbsences]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();

    const absenceDate = String(form.absenceDate || "").trim();
    const reason = String(form.reason || "").trim();
    if (!absenceDate) {
      setMessage("Date is required.");
      return;
    }
    if (!canCreateAppointmentSpecialistAbsences) {
      setMessage("You do not have permission to create specialist absences.");
      return;
    }

    try {
      setSaving(true);
      const response = await apiFetch("/api/appointments/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          absenceDate,
          reason
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(getApiErrorMessage(response, data, "Failed to save specialist absence."));
        return;
      }

      setForm(createEmptyForm(todayYmd));
      setMessage(String(data?.message || "Specialist absence saved."));
      dispatchPlannerRefresh({
        absenceDate,
        cancelledCount: Number(data?.cancelledCount || 0)
      });
      await loadAbsences({ silent: true });
    } catch {
      setMessage("Failed to save specialist absence.");
    } finally {
      setSaving(false);
    }
  }, [
    canCreateAppointmentSpecialistAbsences,
    dispatchPlannerRefresh,
    form.absenceDate,
    form.reason,
    loadAbsences,
    todayYmd
  ]);

  const handleDelete = useCallback(async (item) => {
    const id = String(item?.id || "").trim();
    if (!id) {
      return;
    }
    if (!canDeleteAppointmentSpecialistAbsences) {
      setMessage("You do not have permission to delete specialist absences.");
      return;
    }
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const confirmed = window.confirm("Delete this specialist absence?");
      if (!confirmed) {
        return;
      }
    }

    try {
      setDeletingId(id);
      const response = await apiFetch(`/api/appointments/absences/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(getApiErrorMessage(response, data, "Failed to delete specialist absence."));
        return;
      }

      setMessage(String(data?.message || "Specialist absence deleted."));
      dispatchPlannerRefresh({
        absenceDate: String(item?.absenceDate || "").trim()
      });
      await loadAbsences({ silent: true });
    } catch {
      setMessage("Failed to delete specialist absence.");
    } finally {
      setDeletingId("");
    }
  }, [canDeleteAppointmentSpecialistAbsences, dispatchPlannerRefresh, loadAbsences]);

  return (
    <section id="appointmentSpecialistAbsencesPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Specialist Absences</h3>
        <button
          id="closeAppointmentSpecialistAbsencesBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close specialist absences panel"
          onClick={closeAppointmentSpecialistAbsencesPanel}
        >
          ×
        </button>
      </div>

      <form className="appointment-settings-form" onSubmit={handleSubmit}>
        <div className="appointment-setting-row">
          <label htmlFor="appointmentSpecialistAbsenceDateInput">Date</label>
          <div className="appointment-setting-inline">
            <input
              id="appointmentSpecialistAbsenceDateInput"
              type="date"
              value={form.absenceDate}
              onChange={(event) => {
                const value = String(event.target.value || "").trim();
                setForm((prev) => ({ ...prev, absenceDate: value }));
              }}
            />
          </div>
        </div>
        <div className="appointment-setting-row">
          <label htmlFor="appointmentSpecialistAbsenceReasonInput">Reason</label>
          <div className="appointment-setting-inline">
            <input
              id="appointmentSpecialistAbsenceReasonInput"
              type="text"
              maxLength={120}
              placeholder="Optional reason"
              value={form.reason}
              onChange={(event) => {
                const value = String(event.target.value || "").slice(0, 120);
                setForm((prev) => ({ ...prev, reason: value }));
              }}
            />
          </div>
        </div>
        <div className="appointment-settings-actions">
          <button
            id="saveAppointmentSpecialistAbsenceBtn"
            type="submit"
            className="header-btn"
            disabled={saving || !form.absenceDate || !canCreateAppointmentSpecialistAbsences}
          >
            {saving ? "Saving..." : "Save Absence"}
          </button>
        </div>
      </form>

      <p className="all-users-state" hidden={loading || !message}>{message}</p>

      <div className="appointment-breaks-view" aria-label="Specialist absences list">
        <div className="appointment-breaks-table-wrap all-users-table-wrap">
          <table className="appointment-breaks-table all-users-table" aria-label="Specialist absences table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="all-users-state">Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="4" className="all-users-state">No specialist absences yet.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.absenceDate || "-"}</td>
                    <td>{item.reason || "-"}</td>
                    <td>{formatDateTimeLabel(item.updatedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn danger"
                        disabled={deletingId === item.id || !canDeleteAppointmentSpecialistAbsences}
                        onClick={() => {
                          void handleDelete(item);
                        }}
                      >
                        {deletingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default AppointmentSpecialistAbsencesPanel;
