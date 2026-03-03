import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { formatDateYMD } from "../../../lib/formatters.js";

function formatAttendanceDateTime(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "-";
  }
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  if (!hasExplicitTimezone) {
    const directMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (directMatch) {
      const [, year, month, day, hours, minutes] = directMatch;
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    }
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear()).padStart(4, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function toDatetimeLocalValue(datetimeStr, fallbackDate) {
  if (!datetimeStr) return "";
  const s = String(datetimeStr).trim();
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
  if (!hasExplicitTimezone) {
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
    if (m) return `${m[1]}T${m[2]}`;
    const m2 = s.match(/^(\d{2}:\d{2})/);
    if (m2 && fallbackDate) return `${fallbackDate}T${m2[1]}`;
    return "";
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const year = String(d.getFullYear()).padStart(4, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${h}:${mm}`;
}

function getDatePartFromDatetimeLocal(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}$/);
  return match ? match[1] : "";
}

function mapStatisticsSelectOptions(items, mapItem) {
  return [
    { value: "all", label: "All" },
    ...(Array.isArray(items) ? items : [])
      .map((item) => mapItem(item))
      .filter((option) => Boolean(option?.value) && Boolean(option?.label))
  ];
}

const EDIT_NOTE_MAX = 128;
const ATTENDANCE_STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" }
];

function StatisticsClassPanel({
  closeStatisticsPanel,
  statisticsVipAttendanceHistoryFilters,
  statisticsHistoryClassId,
  statisticsHistoryTeacherId,
  statisticsHistoryTutorId,
  statisticsHistoryClientId,
  statisticsHistoryPeriod,
  setStatisticsHistoryClassId,
  setStatisticsHistoryTeacherId,
  setStatisticsHistoryTutorId,
  setStatisticsHistoryClientId,
  setStatisticsHistoryPeriodField,
  reloadStatisticsHistory,
  statisticsVipAttendanceHistoryLoading,
  showStatisticsBootstrapSkeleton,
  statisticsVipAttendanceHistoryItems,
  canUpdateAppointments,
  canDeleteAppointments
}) {
  const classOptions = mapStatisticsSelectOptions(
    statisticsVipAttendanceHistoryFilters?.classes,
    (item) => ({
      value: String(item?.id || "").trim(),
      label: String(item?.className || item?.class_name || "").trim()
    })
  );
  const teacherOptions = mapStatisticsSelectOptions(
    statisticsVipAttendanceHistoryFilters?.teachers,
    (item) => ({
      value: String(item?.id || "").trim(),
      label: String(item?.name || "").trim()
    })
  );
  const tutorOptions = mapStatisticsSelectOptions(
    statisticsVipAttendanceHistoryFilters?.tutors,
    (item) => ({
      value: String(item?.id || "").trim(),
      label: String(item?.name || "").trim()
    })
  );
  const clientOptions = mapStatisticsSelectOptions(
    statisticsVipAttendanceHistoryFilters?.clients,
    (item) => {
      const clientId = String(item?.id || "").trim();
      const firstName = String(item?.firstName || item?.first_name || "").trim();
      const lastName = String(item?.lastName || item?.last_name || "").trim();
      const middleName = String(item?.middleName || item?.middle_name || "").trim();
      const fullName = [lastName, firstName, middleName].filter(Boolean).join(" ").trim();
      return {
        value: clientId,
        label: fullName || `Client #${clientId}`
      };
    }
  );
  const showStatisticsLoadingText = statisticsVipAttendanceHistoryLoading && !showStatisticsBootstrapSkeleton;

  // ── Edit / Delete state ───────────────────────────────────────────────────
  const [editState, setEditState] = useState(null);
  const [deleteState, setDeleteState] = useState(null);

  const openEdit = useCallback((item) => {
    const attendanceDate = String(item?.attendanceDate || item?.attendance_date || "").trim();
    setEditState({
      item,
      status: item?.attendanceStatus === "present" ? "present" : "absent",
      arrivedAt: toDatetimeLocalValue(item?.arrivedAt || item?.arrived_at, attendanceDate),
      leftAt: toDatetimeLocalValue(item?.leftAt || item?.left_at, attendanceDate),
      note: String(item?.note || item?.attendanceNote || "").trim(),
      error: "",
      submitting: false
    });
  }, []);

  const closeEdit = useCallback(() => {
    setEditState(null);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editState || editState.submitting) return;
    const { item, status, arrivedAt, leftAt, note } = editState;
    const isAbsent = status === "absent";
    const attendanceDate = String(item?.attendanceDate || item?.attendance_date || "").trim();
    const showAlert = (message) => {
      if (typeof window !== "undefined") {
        window.alert(message);
      }
    };

    if (isAbsent && !note.trim()) {
      showAlert("Reason is required for absent.");
      return;
    }

    if (!isAbsent && attendanceDate) {
      const arrivedAtDate = getDatePartFromDatetimeLocal(arrivedAt);
      const leftAtDate = getDatePartFromDatetimeLocal(leftAt);
      if ((arrivedAtDate && arrivedAtDate !== attendanceDate) || (leftAtDate && leftAtDate !== attendanceDate)) {
        showAlert("Arrival and departure date must match the attendance date.");
        return;
      }
    }

    setEditState((prev) => ({ ...prev, submitting: true, error: "" }));
    try {
      const response = await apiFetch("/api/clients/vip-attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: item?.clientId || item?.client_id,
          attendanceDate: item?.attendanceDate || item?.attendance_date,
          status,
          arrivedAt: isAbsent ? null : (arrivedAt || null),
          leftAt: isAbsent ? null : (leftAt || null),
          note: isAbsent ? note.trim() : ""
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setEditState((prev) => ({
          ...prev,
          submitting: false
        }));
        showAlert(String(data?.message || "Failed to save.").trim());
        return;
      }
      setEditState(null);
      reloadStatisticsHistory();
    } catch {
      setEditState((prev) => ({ ...prev, submitting: false }));
      showAlert("Unexpected error. Please try again.");
    }
  }, [editState, reloadStatisticsHistory]);

  const openDelete = useCallback((item) => {
    setDeleteState({ item, error: "", submitting: false });
  }, []);

  const closeDelete = useCallback(() => {
    setDeleteState(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteState || deleteState.submitting) return;
    const { item } = deleteState;
    setDeleteState((prev) => ({ ...prev, submitting: true, error: "" }));
    try {
      const response = await apiFetch("/api/clients/vip-attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: item?.clientId || item?.client_id,
          attendanceDate: item?.attendanceDate || item?.attendance_date,
          reset: true
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setDeleteState((prev) => ({
          ...prev,
          submitting: false,
          error: String(data?.message || "Failed to delete.").trim()
        }));
        return;
      }
      setDeleteState(null);
      reloadStatisticsHistory();
    } catch {
      setDeleteState((prev) => ({ ...prev, submitting: false, error: "Unexpected error. Please try again." }));
    }
  }, [deleteState, reloadStatisticsHistory]);

  const editAttendanceDate = String(
    editState?.item?.attendanceDate || editState?.item?.attendance_date || ""
  ).trim();
  const editDayMin = editAttendanceDate ? `${editAttendanceDate}T00:00` : undefined;
  const editDayMax = editAttendanceDate ? `${editAttendanceDate}T23:59` : undefined;
  const isStatisticsLoading = showStatisticsBootstrapSkeleton || statisticsVipAttendanceHistoryLoading;
  const hasStatisticsItems = Array.isArray(statisticsVipAttendanceHistoryItems)
    && statisticsVipAttendanceHistoryItems.length > 0;

  const editModalLayer = editState ? (
    <>
      <section
        id="statisticsAttendanceEditModal"
        className="logout-confirm-modal vip-attendance-edit-modal"
        aria-modal="true"
        role="dialog"
        aria-label="Edit attendance record"
      >
        <div className="all-users-head">
          <h3>Edit attendance</h3>
          <button
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close"
            disabled={editState.submitting}
            onClick={closeEdit}
          >
            ×
          </button>
        </div>

        <div className="vip-attendance-edit-grid">
          <label className="field" htmlFor="statsEditStatusSelect">
            <span>Status</span>
            <CustomSelect
              id="statsEditStatusSelect"
              value={editState.status}
              options={ATTENDANCE_STATUS_OPTIONS}
              placeholder="Present"
              disabled={editState.submitting}
              onChange={(nextValue) => {
                setEditState((prev) => ({ ...prev, status: String(nextValue || "present"), error: "" }));
              }}
            />
          </label>
        </div>

        <div className="vip-attendance-edit-grid">
          <label className="field" htmlFor="statsEditArrivedAt">
            <span>Arrival time</span>
            <input
              id="statsEditArrivedAt"
              type="datetime-local"
              value={editState.arrivedAt}
              min={editDayMin}
              max={editDayMax}
              disabled={editState.submitting || editState.status === "absent"}
              onChange={(e) => {
                const v = String(e.currentTarget.value || "").trim();
                setEditState((prev) => ({
                  ...prev,
                  arrivedAt: v,
                  leftAt: v ? prev.leftAt : "",
                  error: ""
                }));
              }}
            />
          </label>
          <label className="field" htmlFor="statsEditLeftAt">
            <span>Departure time</span>
            <input
              id="statsEditLeftAt"
              type="datetime-local"
              value={editState.leftAt}
              min={editDayMin}
              max={editDayMax}
              disabled={editState.submitting || editState.status === "absent" || !editState.arrivedAt}
              onChange={(e) => {
                const v = String(e.currentTarget.value || "").trim();
                setEditState((prev) => ({
                  ...prev,
                  leftAt: v,
                  error: ""
                }));
              }}
            />
          </label>
        </div>

        <label className="field" htmlFor="statsEditNoteInput">
          <span>Absent reason</span>
          <textarea
            id="statsEditNoteInput"
            className="notify-textarea vip-attendance-edit-textarea"
            value={editState.note}
            maxLength={EDIT_NOTE_MAX}
            placeholder="Write reason"
            disabled={editState.submitting || editState.status === "present"}
            onChange={(e) => {
              const v = String(e.currentTarget.value || "").slice(0, EDIT_NOTE_MAX);
              setEditState((prev) => ({ ...prev, note: v, error: "" }));
            }}
          />
        </label>
        <p className="vip-attendance-edit-note-count">
          {editState.note.length}/{EDIT_NOTE_MAX}
        </p>

        <div className="edit-actions vip-attendance-edit-actions">
          <button
            type="button"
            className="btn"
            disabled={editState.submitting || !canUpdateAppointments}
            onClick={() => { void handleEditSave(); }}
          >
            {editState.submitting ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className="header-btn"
            disabled={editState.submitting}
            onClick={closeEdit}
          >
            Cancel
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        onClick={() => {
          if (!editState.submitting) closeEdit();
        }}
      />
    </>
  ) : null;

  const deleteModalLayer = deleteState ? (
    <>
      <section
        id="statisticsAttendanceDeleteModal"
        className="logout-confirm-modal settings-edit-modal"
        aria-modal="true"
        role="dialog"
        aria-label="Delete attendance confirmation"
      >
        <h3>Delete this record?</h3>
        <p className="all-users-state">This action cannot be undone.</p>
        <div className="logout-confirm-actions">
          <button
            type="button"
            className="table-action-btn table-action-btn-danger"
            disabled={deleteState.submitting || !canDeleteAppointments}
            onClick={() => { void handleDeleteConfirm(); }}
          >
            {deleteState.submitting ? "Deleting..." : "Yes"}
          </button>
          <button
            id="statisticsAttendanceDeleteNoBtn"
            type="button"
            className="btn header-btn"
            disabled={deleteState.submitting}
            onClick={closeDelete}
          >
            No
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        onClick={() => {
          if (!deleteState.submitting) closeDelete();
        }}
      />
    </>
  ) : null;

  return (
    <section id="statisticsClassPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>Statistics / VIP Class Attendance Report</h3>
        <button
          id="closeStatisticsBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close statistics panel"
          onClick={closeStatisticsPanel}
        >
          ×
        </button>
      </div>

      <div className="vip-attendance-toolbar statistics-history-toolbar">
        <label className="field" htmlFor="statisticsClassFilterSelect">
          <span>Class</span>
          <CustomSelect
            id="statisticsClassFilterSelect"
            value={statisticsHistoryClassId}
            options={classOptions}
            placeholder="All"
            searchable
            searchThreshold={8}
            onChange={(nextValue) => {
              setStatisticsHistoryClassId(String(nextValue || "").trim() || "all");
            }}
          />
        </label>
        <label className="field" htmlFor="statisticsTeacherFilterSelect">
          <span>Teacher</span>
          <CustomSelect
            id="statisticsTeacherFilterSelect"
            value={statisticsHistoryTeacherId}
            options={teacherOptions}
            placeholder="All"
            searchable
            searchThreshold={8}
            onChange={(nextValue) => {
              setStatisticsHistoryTeacherId(String(nextValue || "").trim() || "all");
            }}
          />
        </label>
        <label className="field" htmlFor="statisticsTutorFilterSelect">
          <span>Tutor</span>
          <CustomSelect
            id="statisticsTutorFilterSelect"
            value={statisticsHistoryTutorId}
            options={tutorOptions}
            placeholder="All"
            searchable
            searchThreshold={8}
            onChange={(nextValue) => {
              setStatisticsHistoryTutorId(String(nextValue || "").trim() || "all");
            }}
          />
        </label>
        <label className="field" htmlFor="statisticsClientFilterSelect">
          <span>VIP Client</span>
          <CustomSelect
            id="statisticsClientFilterSelect"
            value={statisticsHistoryClientId}
            options={clientOptions}
            placeholder="All"
            searchable
            searchThreshold={8}
            onChange={(nextValue) => {
              setStatisticsHistoryClientId(String(nextValue || "").trim() || "all");
            }}
          />
        </label>
        <label className="field statistics-period-field" htmlFor="statisticsPeriodFromInput">
          <span>From</span>
          <input
            id="statisticsPeriodFromInput"
            type="date"
            value={statisticsHistoryPeriod.from}
            max={statisticsHistoryPeriod.to || undefined}
            onChange={(event) => {
              setStatisticsHistoryPeriodField("from", event.currentTarget.value);
            }}
          />
        </label>
        <label className="field statistics-period-field" htmlFor="statisticsPeriodToInput">
          <span>To</span>
          <input
            id="statisticsPeriodToInput"
            type="date"
            value={statisticsHistoryPeriod.to}
            min={statisticsHistoryPeriod.from || undefined}
            onChange={(event) => {
              setStatisticsHistoryPeriodField("to", event.currentTarget.value);
            }}
          />
        </label>
        <button
          id="statisticsHistoryReloadBtn"
          type="button"
          className="btn statistics-history-reload-btn"
          onClick={reloadStatisticsHistory}
          disabled={statisticsVipAttendanceHistoryLoading || showStatisticsBootstrapSkeleton}
        >
          {showStatisticsLoadingText ? "Loading..." : "Reload"}
        </button>
      </div>

      <div className="all-users-table-wrap">
        <table className="all-users-table" aria-label="Statistics class attendance history table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Class</th>
              <th>Teacher</th>
              <th>Tutor</th>
              <th>VIP Client</th>
              <th>Arrival</th>
              <th>Departure</th>
              <th>Absent</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isStatisticsLoading ? (
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} aria-hidden="true">
                  <td colSpan="9" className="skel" />
                </tr>
              ))
            ) : hasStatisticsItems ? statisticsVipAttendanceHistoryItems.map((item, index) => {
              const firstName = String(item?.firstName || item?.first_name || "").trim();
              const lastName = String(item?.lastName || item?.last_name || "").trim();
              const middleName = String(item?.middleName || item?.middle_name || "").trim();
              const fullName = [lastName, firstName, middleName].filter(Boolean).join(" ").trim();
              const status = String(item?.attendanceStatus || item?.attendance_status || "").trim().toLowerCase() === "present"
                ? "Present"
                : "Absent";
              const note = String(item?.note || item?.attendanceNote || item?.attendance_note || "").trim();
              return (
                <tr key={`statisticsHistoryRow_${String(item?.id || index)}`}>
                  <td>{formatDateYMD(item?.attendanceDate || item?.attendance_date)}</td>
                  <td>{String(item?.className || item?.class_name || "").trim() || "-"}</td>
                  <td>{String(item?.teacherName || item?.teacher_name || "").trim() || "-"}</td>
                  <td>{String(item?.tutorName || item?.tutor_name || "").trim() || "-"}</td>
                  <td>{fullName || "-"}</td>
                  <td>{formatAttendanceDateTime(item?.arrivedAt || item?.arrived_at)}</td>
                  <td>{formatAttendanceDateTime(item?.leftAt || item?.left_at)}</td>
                  <td>{status === "Absent" ? (note || "Absent") : "-"}</td>
                  <td>
                    <div className="statistics-actions-wrap">
                      <button
                        type="button"
                        className="table-action-btn"
                        aria-label="Edit"
                        disabled={!canUpdateAppointments}
                        onClick={() => openEdit(item)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="table-action-btn table-action-btn-danger"
                        aria-label="Delete"
                        disabled={!canDeleteAppointments}
                        onClick={() => openDelete(item)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan="9" className="all-users-state">No records found.</td>
              </tr>
            )}
            </tbody>
        </table>
      </div>

      {typeof document !== "undefined" ? createPortal(editModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(deleteModalLayer, document.body) : null}
    </section>
  );
}

export default StatisticsClassPanel;
