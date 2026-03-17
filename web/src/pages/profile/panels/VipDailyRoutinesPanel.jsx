import { useState, useEffect, useMemo } from "react";

const PAGE_SIZE = 20;

const ACTIVITY_FILTER_OPTIONS = [
  { value: "lesson", label: "Lesson" },
  { value: "sleep",  label: "Sleep" },
  { value: "meal",   label: "Meal" },
  { value: "other",  label: "Other" }
];

function VipDailyRoutinesPanel({
  canCreateAppointmentVipClients,
  canUpdateAppointmentVipClients,
  canDeleteAppointmentVipClients,
  closeAppointmentVipDailyRoutinesPanel,
  vipDailyRoutineLoading,
  vipDailyRoutineMessage,
  vipDailyRoutineRows,
  vipDailyRoutineSavingById,
  openVipDailyRoutineAddModal,
  openVipDailyRoutineEditModal,
  openVipDailyRoutineDeleteModal,
  formatVipDailyRoutineDayLabel,
  formatVipDailyRoutineActivityLabel
}) {
  const [page, setPage] = useState(1);
  const [filterClassId, setFilterClassId] = useState("");
  const [filterActivity, setFilterActivity] = useState("");

  useEffect(() => {
    setPage(1);
  }, [vipDailyRoutineRows, filterClassId, filterActivity]);

  const classOptions = useMemo(() => {
    const seen = new Map();
    for (const row of vipDailyRoutineRows) {
      const id = String(row?.classId || "").trim();
      if (id && !seen.has(id)) {
        const name = String(row?.className || "").trim();
        seen.set(id, name || `Class #${id}`);
      }
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ value: id, label }));
  }, [vipDailyRoutineRows]);

  const filteredRows = useMemo(() => {
    return vipDailyRoutineRows.filter((row) => {
      if (filterClassId && String(row?.classId || "").trim() !== filterClassId) return false;
      if (filterActivity && String(row?.activityType || "").trim() !== filterActivity) return false;
      return true;
    });
  }, [vipDailyRoutineRows, filterClassId, filterActivity]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section id="appointmentVipDailyRoutinesPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>VIP Daily Routines</h3>
        <div className="all-users-head-actions">
          <button
            id="openVipDailyRoutineAddBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add daily routine"
            title="Add daily routine"
            disabled={!canCreateAppointmentVipClients}
            onClick={openVipDailyRoutineAddModal}
          >
            +
          </button>
          <button
            id="closeAppointmentVipDailyRoutinesBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close VIP daily routines panel"
            onClick={closeAppointmentVipDailyRoutinesPanel}
          >
            ×
          </button>
        </div>
      </div>

      <div className="vip-daily-routines-filters">
        <select
          className="vip-daily-routines-filter-select"
          value={filterClassId}
          onChange={(e) => setFilterClassId(e.currentTarget.value)}
          disabled={vipDailyRoutineLoading}
        >
          <option value="">All classes</option>
          {classOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          className="vip-daily-routines-filter-select"
          value={filterActivity}
          onChange={(e) => setFilterActivity(e.currentTarget.value)}
          disabled={vipDailyRoutineLoading}
        >
          <option value="">All activities</option>
          {ACTIVITY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <p className="all-users-state" hidden={vipDailyRoutineLoading || !vipDailyRoutineMessage}>
        {vipDailyRoutineMessage}
      </p>

      <div className="all-users-table-wrap" hidden={!vipDailyRoutineLoading && vipDailyRoutineRows.length === 0}>
        <table className="all-users-table" aria-label="VIP daily routines table">
          <thead>
            <tr>
              <th>Class</th>
              <th>Teacher</th>
              <th>Children</th>
              <th>Day</th>
              <th>Time</th>
              <th>Activity</th>
              <th>Note</th>
              <th>Edit</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {vipDailyRoutineLoading ? (
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} aria-hidden="true">
                  <td colSpan="9" className="skel" />
                </tr>
              ))
            ) : pageRows.map((row, index) => {
              const rowId = String(row?.id || "").trim();
              const className = String(row?.className || "").trim();
              const classLabel = className || (row?.classId ? `Class #${String(row.classId).trim()}` : "-");
              const timeRange = row?.startTime && row?.endTime
                ? `${row.startTime} - ${row.endTime}`
                : (String(row?.startTime || row?.endTime || "").trim() || "-");
              const isRowSaving = Boolean(vipDailyRoutineSavingById?.[rowId]);
              return (
                <tr key={`vipDailyRoutineRow_${rowId || index}`}>
                  <td>{classLabel}</td>
                  <td>{String(row?.teacherName || "").trim() || "-"}</td>
                  <td>{Number.parseInt(String(row?.childrenCount || "0"), 10) || 0}</td>
                  <td>{formatVipDailyRoutineDayLabel(row?.dayOfWeek)}</td>
                  <td>{timeRange}</td>
                  <td>{formatVipDailyRoutineActivityLabel(row?.activityType)}</td>
                  <td>{String(row?.note || "").trim() || "-"}</td>
                  <td>
                    <button
                      type="button"
                      className="table-action-btn"
                      disabled={isRowSaving || !canUpdateAppointmentVipClients}
                      onClick={() => openVipDailyRoutineEditModal(row)}
                    >
                      Edit
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table-action-btn table-action-btn-danger"
                      disabled={isRowSaving || !canDeleteAppointmentVipClients}
                      onClick={() => openVipDailyRoutineDeleteModal(row)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="all-users-pagination" hidden={vipDailyRoutineLoading || filteredRows.length === 0 || totalPages <= 1}>
        <button
          type="button"
          className="header-btn"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span className="all-users-page-info">Page {page} of {totalPages}</span>
        <button
          type="button"
          className="header-btn"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

export default VipDailyRoutinesPanel;
