import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../../lib/api.js";
import { formatDateForInput } from "../../../lib/formatters.js";

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
    startTime: "",
    endTime: "",
    reason: ""
  };
}

function formatAbsenceTimeRange(startTime = "", endTime = "") {
  const normalizedStartTime = String(startTime || "").trim();
  const normalizedEndTime = String(endTime || "").trim();
  if (normalizedStartTime && normalizedEndTime) {
    return `${normalizedStartTime} - ${normalizedEndTime}`;
  }
  return "All day";
}

function addDaysYmd(value, days) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "";
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildAbsenceRangeGroups(items) {
  const buckets = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const specialistId = String(item?.specialistId || "").trim();
    const reason = String(item?.reason || "").trim();
    const startTime = String(item?.startTime || "").trim();
    const endTime = String(item?.endTime || "").trim();
    const updatedAt = String(item?.updatedAt || item?.createdAt || "").trim();
    const bucketKey = `${specialistId}__${reason}__${startTime}__${endTime}__${updatedAt}`;
    const existing = buckets.get(bucketKey) || [];
    existing.push(item);
    buckets.set(bucketKey, existing);
  });

  const grouped = [];
  buckets.forEach((bucketItems) => {
    const sortedItems = bucketItems
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item?.absenceDate || "").trim()))
      .sort((left, right) => String(left?.absenceDate || "").localeCompare(String(right?.absenceDate || "")));

    let currentGroup = null;
    sortedItems.forEach((item) => {
      const absenceDate = String(item?.absenceDate || "").trim();
      if (!currentGroup) {
        currentGroup = {
          id: String(item?.id || "").trim(),
          itemIds: [String(item?.id || "").trim()].filter(Boolean),
          specialistId: String(item?.specialistId || "").trim(),
          specialistName: String(item?.specialistName || "").trim(),
          dateFrom: absenceDate,
          dateTo: absenceDate,
          startTime: String(item?.startTime || "").trim(),
          endTime: String(item?.endTime || "").trim(),
          reason: String(item?.reason || "").trim(),
          createdAt: item?.createdAt || null,
          updatedAt: item?.updatedAt || null
        };
        return;
      }

      const nextExpectedDate = addDaysYmd(currentGroup.dateTo, 1);
      if (absenceDate === nextExpectedDate) {
        currentGroup.dateTo = absenceDate;
        currentGroup.itemIds.push(String(item?.id || "").trim());
        return;
      }

      grouped.push(currentGroup);
      currentGroup = {
        id: String(item?.id || "").trim(),
        itemIds: [String(item?.id || "").trim()].filter(Boolean),
        specialistId: String(item?.specialistId || "").trim(),
        specialistName: String(item?.specialistName || "").trim(),
        dateFrom: absenceDate,
        dateTo: absenceDate,
        startTime: String(item?.startTime || "").trim(),
        endTime: String(item?.endTime || "").trim(),
        reason: String(item?.reason || "").trim(),
        createdAt: item?.createdAt || null,
        updatedAt: item?.updatedAt || null
      };
    });

    if (currentGroup) {
      grouped.push(currentGroup);
    }
  });

  return grouped.sort((left, right) => {
    const leftDate = String(left?.dateFrom || "");
    const rightDate = String(right?.dateFrom || "");
    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate);
    }
    return String(left?.specialistName || "").localeCompare(String(right?.specialistName || ""), undefined, {
      sensitivity: "base"
    });
  });
}

function AppointmentSpecialistAbsencesPanel({
  canReadAppointmentSpecialistAbsences,
  canCreateAppointmentSpecialistAbsences,
  canDeleteAppointmentSpecialistAbsences,
  currentUserId,
  selfScopedToCurrentSpecialist = false,
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
  const normalizedCurrentUserId = String(currentUserId || "").trim();
  const isSelfScopedSpecialistAbsences = selfScopedToCurrentSpecialist && Boolean(normalizedCurrentUserId);
  const selfScopedSpecialistOptions = useMemo(() => (
    isSelfScopedSpecialistAbsences
      ? [{
          value: normalizedCurrentUserId,
          label: String(profileDisplayName || "").trim() || "My profile"
        }]
      : []
  ), [isSelfScopedSpecialistAbsences, normalizedCurrentUserId, profileDisplayName]);

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
      const query = new URLSearchParams();
      if (isSelfScopedSpecialistAbsences) {
        query.set("specialistId", normalizedCurrentUserId);
      }
      const response = await apiFetch(
        query.size > 0
          ? `/api/appointments/absences?${query.toString()}`
          : "/api/appointments/absences",
        {
          method: "GET",
          cache: "no-store"
        }
      );
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setItems([]);
        setMessage(getApiErrorMessage(response, data, "Failed to load specialist absences."));
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          specialistId: String(item?.specialistId || "").trim(),
          specialistName: String(item?.specialistName || "").trim(),
          absenceDate: String(item?.absenceDate || "").trim(),
          startTime: String(item?.startTime || "").trim(),
          endTime: String(item?.endTime || "").trim(),
          reason: String(item?.reason || "").trim(),
          createdAt: item?.createdAt || null,
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
  }, [canReadAppointmentSpecialistAbsences, isSelfScopedSpecialistAbsences, normalizedCurrentUserId]);

  const loadSpecialists = useCallback(async () => {
    if (!canCreateAppointmentSpecialistAbsences) {
      setSpecialistOptions([]);
      return;
    }
    if (isSelfScopedSpecialistAbsences) {
      setSpecialistOptions(selfScopedSpecialistOptions);
      setForm((prev) => ({
        ...prev,
        specialistId: normalizedCurrentUserId
      }));
      setSpecialistsLoading(false);
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
  }, [
    canCreateAppointmentSpecialistAbsences,
    isSelfScopedSpecialistAbsences,
    normalizedCurrentUserId,
    selfScopedSpecialistOptions
  ]);

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
    const startTime = String(form.startTime || "").trim();
    const endTime = String(form.endTime || "").trim();
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
    if ((startTime && !endTime) || (!startTime && endTime)) {
      setMessage("Both time fields are required.");
      return;
    }
    if (startTime && endTime && startTime >= endTime) {
      setMessage("Time to must be after time from.");
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
          startTime,
          endTime,
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
    form.startTime,
    form.endTime,
    loadAbsences,
    todayYmd
  ]);

  const handleDelete = useCallback(async (item) => {
    const itemIds = Array.from(
      new Set(
        (Array.isArray(item?.itemIds) ? item.itemIds : [item?.id])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
    if (itemIds.length === 0) {
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
      setDeletingId(itemIds[0]);
      for (const id of itemIds) {
        const response = await apiFetch(`/api/appointments/absences/${encodeURIComponent(id)}`, {
          method: "DELETE"
        });
        const data = await readApiResponseData(response);
        if (!response.ok) {
          setMessage(getApiErrorMessage(response, data, "Failed to delete specialist absence."));
          return;
        }
      }

      setMessage(
        itemIds.length > 1
          ? "Specialist absence range deleted."
          : "Specialist absence deleted."
      );
      dispatchPlannerRefresh({
        absenceDate: String(item?.dateFrom || item?.absenceDate || "").trim(),
        dateFrom: String(item?.dateFrom || item?.absenceDate || "").trim(),
        dateTo: String(item?.dateTo || item?.absenceDate || "").trim()
      });
      await loadAbsences({ silent: true });
    } catch {
      setMessage("Failed to delete specialist absence.");
    } finally {
      setDeletingId("");
    }
  }, [canDeleteAppointmentSpecialistAbsences, dispatchPlannerRefresh, loadAbsences]);

  const groupedItems = useMemo(() => buildAbsenceRangeGroups(items), [items]);

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
              disabled={saving || specialistsLoading || specialistOptions.length === 0 || isSelfScopedSpecialistAbsences}
              searchable={!isSelfScopedSpecialistAbsences}
              searchThreshold={isSelfScopedSpecialistAbsences ? 999 : 0}
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
          <div className="appointment-specialist-absence-date-row">
            <label className="field appointment-specialist-absence-field" htmlFor="appointmentSpecialistAbsenceStartTimeInput">
              <span>Time From</span>
              <input
                id="appointmentSpecialistAbsenceStartTimeInput"
                type="time"
                value={form.startTime}
                onChange={(event) => {
                  const value = String(event.target.value || "").trim();
                  setForm((prev) => ({ ...prev, startTime: value }));
                }}
              />
            </label>
            <label className="field appointment-specialist-absence-field" htmlFor="appointmentSpecialistAbsenceEndTimeInput">
              <span>Time To</span>
              <input
                id="appointmentSpecialistAbsenceEndTimeInput"
                type="time"
                value={form.endTime}
                onChange={(event) => {
                  const value = String(event.target.value || "").trim();
                  setForm((prev) => ({ ...prev, endTime: value }));
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
              <th>Date From</th>
              <th>Date To</th>
              <th>Time</th>
              <th>Reason</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="all-users-state">Loading...</td>
                </tr>
              ) : groupedItems.length === 0 ? (
                <tr>
                  <td colSpan="6" className="all-users-state">No specialist absences yet.</td>
                </tr>
              ) : (
                groupedItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.specialistName || specialistDisplayName || "-"}</td>
                    <td>{item.dateFrom || "-"}</td>
                    <td>{item.dateTo || "-"}</td>
                    <td>{formatAbsenceTimeRange(item.startTime, item.endTime)}</td>
                    <td>{item.reason || "-"}</td>
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
