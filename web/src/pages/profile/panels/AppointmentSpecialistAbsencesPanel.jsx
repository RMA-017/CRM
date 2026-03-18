import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
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

function buildSpecialistOptions(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      value: String(item?.id || "").trim(),
      label: String(item?.name || "").trim()
    }))
    .filter((item) => Boolean(item.value));
}

function createEmptyForm(todayYmd, specialistId = "") {
  return {
    specialistId: String(specialistId || "").trim(),
    dateFrom: String(todayYmd || "").trim(),
    dateTo: String(todayYmd || "").trim(),
    reason: ""
  };
}

function AppointmentSpecialistAbsencesPanel({
  canReadAppointmentSpecialistAbsences,
  canCreateAppointmentSpecialistAbsences,
  canDeleteAppointmentSpecialistAbsences,
  profileDisplayName,
  closeAppointmentSpecialistAbsencesPanel
}) {
  const todayYmd = useMemo(() => formatDateForInput(new Date()), []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [specialistsLoading, setSpecialistsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [specialistOptions, setSpecialistOptions] = useState([]);
  const [form, setForm] = useState(() => createEmptyForm(todayYmd));
  const dateInputRef = useRef(null);

  const specialistDisplayName = useMemo(() => {
    const selectedSpecialistName = specialistOptions.find((item) => item.value === String(form.specialistId || "").trim())?.label || "";
    const firstItemName = String(items[0]?.specialistName || "").trim();
    const fallbackName = String(profileDisplayName || "").trim();
    return selectedSpecialistName || firstItemName || fallbackName || "Select specialist";
  }, [form.specialistId, items, profileDisplayName, specialistOptions]);

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
          specialistName: String(item?.specialistName || "").trim(),
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

  const loadSpecialists = useCallback(async () => {
    if (!canCreateAppointmentSpecialistAbsences) {
      setSpecialistOptions([]);
      return;
    }

    try {
      setSpecialistsLoading(true);
      const response = await apiFetch("/api/appointments/specialists", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setSpecialistOptions([]);
        setMessage(getApiErrorMessage(response, data, "Failed to load specialists."));
        return;
      }

      const nextOptions = buildSpecialistOptions(data?.items);
      setSpecialistOptions(nextOptions);
      setForm((prev) => {
        const currentId = String(prev.specialistId || "").trim();
        if (currentId && nextOptions.some((item) => item.value === currentId)) {
          return prev;
        }
        return {
          ...prev,
          specialistId: String(nextOptions[0]?.value || "").trim()
        };
      });
    } catch {
      setSpecialistOptions([]);
      setMessage("Failed to load specialists.");
    } finally {
      setSpecialistsLoading(false);
    }
  }, [canCreateAppointmentSpecialistAbsences]);

  useEffect(() => {
    void loadAbsences();
  }, [loadAbsences]);

  useEffect(() => {
    void loadSpecialists();
  }, [loadSpecialists]);

  useEffect(() => {
    if (!createFormOpen) {
      return;
    }
    dateInputRef.current?.focus();
  }, [createFormOpen]);

  const openCreateForm = useCallback(() => {
    if (!canCreateAppointmentSpecialistAbsences) {
      setMessage("You do not have permission to create specialist absences.");
      return;
    }
    setForm(createEmptyForm(todayYmd, specialistOptions[0]?.value || form.specialistId || ""));
    setMessage("");
    setCreateFormOpen(true);
  }, [canCreateAppointmentSpecialistAbsences, form.specialistId, specialistOptions, todayYmd]);

  const closeCreateForm = useCallback(() => {
    if (saving) {
      return;
    }
    setForm(createEmptyForm(todayYmd, specialistOptions[0]?.value || ""));
    setCreateFormOpen(false);
  }, [saving, specialistOptions, todayYmd]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();

    const specialistId = String(form.specialistId || "").trim();
    const dateFrom = String(form.dateFrom || "").trim();
    const dateTo = String(form.dateTo || "").trim();
    const reason = String(form.reason || "").trim();
    if (!specialistId) {
      setMessage("Specialist is required.");
      return;
    }
    if (!dateFrom) {
      setMessage("Date from is required.");
      return;
    }
    if (!dateTo) {
      setMessage("Date to is required.");
      return;
    }
    if (dateFrom > dateTo) {
      setMessage("Date to must be on or after date from.");
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
          specialistId,
          dateFrom,
          dateTo,
          reason
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(getApiErrorMessage(response, data, "Failed to save specialist absence."));
        return;
      }

      setForm(createEmptyForm(todayYmd, specialistId));
      setCreateFormOpen(false);
      setMessage(String(data?.message || "Specialist absence saved."));
      dispatchPlannerRefresh({
        absenceDate: dateFrom,
        dateFrom,
        dateTo,
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
    form.specialistId,
    form.dateFrom,
    form.dateTo,
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

  const createModal = createFormOpen ? (
    <>
      <section
        id="appointmentSpecialistAbsenceCreateModal"
        className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal appointment-specialist-absence-modal"
        aria-modal="true"
        role="dialog"
        aria-label="Add specialist absence"
      >
        <div className="appointment-breaks-add-modal-head">
          <h3>Add Specialist Absence</h3>
          <button
            id="closeAppointmentSpecialistAbsenceCreateModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close specialist absence create modal"
            disabled={saving}
            onClick={closeCreateForm}
          >
            ×
          </button>
        </div>

        <form className="appointment-breaks-add-modal-form appointment-specialist-absence-form" onSubmit={handleSubmit}>
          <label className="field appointment-specialist-absence-field" htmlFor="appointmentSpecialistAbsenceSpecialistSelect">
            <span>Specialist</span>
            <CustomSelect
              id="appointmentSpecialistAbsenceSpecialistSelect"
              value={form.specialistId}
              options={specialistOptions}
              placeholder={specialistsLoading ? "Loading specialists..." : (specialistOptions.length > 0 ? "Select specialist" : "No specialists")}
              disabled={saving || specialistsLoading || specialistOptions.length === 0}
              searchable
              searchThreshold={0}
              menuPortal
              forceOpenDown
              maxVisibleOptions={8}
              onChange={(nextValue) => {
                setForm((prev) => ({ ...prev, specialistId: String(nextValue || "").trim() }));
              }}
            />
          </label>
          <div className="appointment-specialist-absence-date-row">
            <label className="field appointment-specialist-absence-field" htmlFor="appointmentSpecialistAbsenceDateFromInput">
              <span>Date From</span>
              <input
                id="appointmentSpecialistAbsenceDateFromInput"
                ref={dateInputRef}
                type="date"
                value={form.dateFrom}
                onChange={(event) => {
                  const value = String(event.target.value || "").trim();
                  setForm((prev) => ({ ...prev, dateFrom: value }));
                }}
              />
            </label>
            <label className="field appointment-specialist-absence-field" htmlFor="appointmentSpecialistAbsenceDateToInput">
              <span>Date To</span>
              <input
                id="appointmentSpecialistAbsenceDateToInput"
                type="date"
                value={form.dateTo}
                onChange={(event) => {
                  const value = String(event.target.value || "").trim();
                  setForm((prev) => ({ ...prev, dateTo: value }));
                }}
              />
            </label>
          </div>
          <label className="field appointment-specialist-absence-field" htmlFor="appointmentSpecialistAbsenceReasonInput">
            <span>Reason</span>
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
          </label>
          <p className="all-users-state" hidden={!message}>{message}</p>
          <div className="edit-actions appointment-breaks-add-modal-actions">
            <button
              id="saveAppointmentSpecialistAbsenceBtn"
              type="submit"
              className="btn"
              disabled={saving || !form.specialistId || !form.dateFrom || !form.dateTo || !canCreateAppointmentSpecialistAbsences}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div className="login-overlay" onClick={closeCreateForm} />
    </>
  ) : null;

  return (
    <section id="appointmentSpecialistAbsencesPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Specialist Absences</h3>
        <div className="all-users-head-actions">
          <button
            id="openAppointmentSpecialistAbsenceCreateBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add specialist absence"
            title="Add specialist absence"
            hidden={!canCreateAppointmentSpecialistAbsences}
            onClick={openCreateForm}
          >
            +
          </button>
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
      </div>

      <p className="all-users-state" hidden={loading || !message || createFormOpen}>{message}</p>

      <div className="appointment-breaks-view" aria-label="Specialist absences list">
        <div className="appointment-breaks-table-wrap all-users-table-wrap">
          <table className="appointment-breaks-table all-users-table" aria-label="Specialist absences table">
            <thead>
              <tr>
                <th>Specialist</th>
                <th>Date</th>
                <th>Reason</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="all-users-state">Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="5" className="all-users-state">No specialist absences yet.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.specialistName || specialistDisplayName || "-"}</td>
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
      {createModal
        ? (typeof document !== "undefined" ? createPortal(createModal, document.body) : createModal)
        : null}
    </section>
  );
}

export default AppointmentSpecialistAbsencesPanel;
