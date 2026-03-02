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
            ) : vipDailyRoutineRows.map((row, index) => {
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
    </section>
  );
}

export default VipDailyRoutinesPanel;
