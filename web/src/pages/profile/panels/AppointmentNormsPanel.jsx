import { formatDateYMD } from "../../../lib/formatters.js";

function AppointmentNormsPanel({
  canCreateSettingsAppointmentNorms,
  canUpdateSettingsAppointmentNorms,
  canDeleteSettingsAppointmentNorms,
  openNormCreateModal,
  closeNormsPanel,
  normsSettingsMessage,
  normsSettings,
  startNormEdit,
  normDeletingId,
  handleNormDelete
}) {
  return (
    <section id="appointmentNormsPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Appointment Norms</h3>
        <div className="all-users-head-actions">
          <button
            id="openNormCreateModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add norm"
            title="Add norm"
            hidden={!canCreateSettingsAppointmentNorms}
            onClick={openNormCreateModal}
          >
            +
          </button>
          <button
            id="closeAppointmentNormsBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close appointment norms panel"
            onClick={closeNormsPanel}
          >
            ×
          </button>
        </div>
      </div>

      <p id="normsState" className="all-users-state" hidden={!normsSettingsMessage}>
        {normsSettingsMessage}
      </p>

      <div className="all-users-table-wrap settings-table-wrap" hidden={normsSettings.length === 0}>
        <table className="all-users-table settings-table" aria-label="Appointment norms table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Position</th>
              <th>Max/Week</th>
              <th>Active</th>
              <th>Created</th>
              <th>Edit</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {normsSettings.map((item) => {
              const rowId = String(item.id);
              return (
                <tr key={rowId}>
                  <td>{rowId}</td>
                  <td>{item.positionLabel || item.positionId || "-"}</td>
                  <td style={{ textAlign: "center" }}>{item.maxPerWeek}</td>
                  <td>{item.isActive ? "Yes" : "No"}</td>
                  <td>{formatDateYMD(item.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="table-action-btn"
                      hidden={!canUpdateSettingsAppointmentNorms}
                      onClick={() => startNormEdit(item)}
                    >
                      Edit
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table-action-btn table-action-btn-danger"
                      hidden={!canDeleteSettingsAppointmentNorms}
                      disabled={normDeletingId === rowId}
                      onClick={() => handleNormDelete(rowId, item?.positionLabel || rowId)}
                    >
                      {normDeletingId === rowId ? "..." : "Delete"}
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

export default AppointmentNormsPanel;
