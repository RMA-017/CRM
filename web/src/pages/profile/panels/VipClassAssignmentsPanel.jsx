function VipClassAssignmentsPanel({
  canCreateAppointmentVipAssignments,
  canUpdateAppointmentVipAssignments,
  canDeleteAppointmentVipAssignments,
  closeAppointmentVipAssignmentsPanel,
  vipClassMessage,
  vipClassLoading,
  vipClassRows,
  vipClassSavingById,
  vipClassModalSaving,
  vipClassDeleteSaving,
  openVipClassAddModal,
  openVipClassEditModal,
  openVipClassDeleteModal
}) {
  return (
    <section id="appointmentBreaksPanel">
      <div className="all-users-head">
        <h3>Class</h3>
        <div className="all-users-head-actions">
          <button
            id="openVipClassAddModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add class"
            title="Add class"
            disabled={!canCreateAppointmentVipAssignments}
            onClick={openVipClassAddModal}
          >
            +
          </button>
          <button
            id="closeAppointmentVipAssignmentsBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close VIP assignments panel"
            onClick={closeAppointmentVipAssignmentsPanel}
          >
            ×
          </button>
        </div>
      </div>

      {vipClassMessage && (
        <p style={{ marginTop: "12px", color: "var(--danger)" }}>{vipClassMessage}</p>
      )}

      <div className="appointment-breaks-view" aria-label="Class assignments list">
        <div className="appointment-breaks-table-wrap all-users-table-wrap">
          <table className="appointment-breaks-table class-assignments-table all-users-table" aria-label="Class table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Class</th>
                <th>Teacher</th>
                <th>Children</th>
                <th>Edit</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {vipClassLoading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i} aria-hidden="true">
                    <td colSpan="6" className="skel" />
                  </tr>
                ))
              ) : vipClassRows.map((row, index) => {
                const classId = String(row?.id || "").trim();
                const isClassSaving = Boolean(vipClassSavingById?.[classId]);
                return (
                  <tr key={`vipClassRow_${String(classId || index)}`}>
                    <td>{String(row?.id || index + 1)}</td>
                    <td>{String(row?.className || "-")}</td>
                    <td>{String(row?.teacherName || "-")}</td>
                    <td>{row.childrenCount}</td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn"
                        disabled={isClassSaving || vipClassModalSaving || !canUpdateAppointmentVipAssignments}
                        onClick={() => openVipClassEditModal(row)}
                      >
                        Edit
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn table-action-btn-danger"
                        disabled={isClassSaving || vipClassModalSaving || vipClassDeleteSaving || !canDeleteAppointmentVipAssignments}
                        onClick={() => {
                          openVipClassDeleteModal(row);
                        }}
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
      </div>
    </section>
  );
}

export default VipClassAssignmentsPanel;
