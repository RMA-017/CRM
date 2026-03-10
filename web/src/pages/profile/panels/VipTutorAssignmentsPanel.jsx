function VipTutorAssignmentsPanel({
  closeAppointmentVipTutorAssignmentsPanel,
  vipAssignmentMessage,
  vipAssignmentLoading,
  vipAssignmentItems,
  vipAssignmentSavingByClientId,
  canCreateAppointmentVipAssignments,
  canUpdateAppointmentVipAssignments,
  openVipTutorEditModal
}) {
  return (
    <section id="appointmentVipTutorAssignmentsPanel">
      <div className="all-users-head">
        <h3>Tutor</h3>
        <button
          id="closeAppointmentVipTutorAssignmentsBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close VIP tutor assignments panel"
          onClick={closeAppointmentVipTutorAssignmentsPanel}
        >
          ×
        </button>
      </div>

      {vipAssignmentMessage && (
        <p style={{ marginTop: "12px", color: "var(--danger)" }}>{vipAssignmentMessage}</p>
      )}

      <div className="appointment-breaks-view" aria-label="VIP tutor assignments list">
        <div className="appointment-breaks-table-wrap all-users-table-wrap">
          <table className="appointment-breaks-table tutor-assignments-table all-users-table" aria-label="Tutor assignments table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Child</th>
                <th>Class</th>
                <th>Tutor</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {vipAssignmentLoading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i} aria-hidden="true">
                    <td colSpan="5" className="skel" />
                  </tr>
                ))
              ) : vipAssignmentItems.map((row, index) => {
                const rowId = String(row?.id || "").trim();
                const fullName = [row?.lastName, row?.firstName, row?.middleName]
                  .map((part) => String(part || "").trim())
                  .filter(Boolean)
                  .join(" ");
                const isSaving = Boolean(vipAssignmentSavingByClientId?.[rowId]);
                return (
                  <tr key={`vipTutorAssignRow_${String(rowId || index)}`}>
                    <td>{String(row?.id || index + 1)}</td>
                    <td>{fullName || "-"}</td>
                    <td>{String(row?.className || "-")}</td>
                    <td>{String(row?.tutorName || "-")}</td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn"
                        disabled={isSaving || (!canCreateAppointmentVipAssignments && !canUpdateAppointmentVipAssignments)}
                        onClick={() => openVipTutorEditModal(row)}
                      >
                        {isSaving ? "Saving..." : "Edit"}
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

export default VipTutorAssignmentsPanel;
