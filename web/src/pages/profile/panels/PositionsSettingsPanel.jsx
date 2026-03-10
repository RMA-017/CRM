import { formatDateYMD } from "../../../lib/formatters.js";

function PositionsSettingsPanel({
  canCreateSettingsPositions,
  canUpdateSettingsPositions,
  canDeleteSettingsPositions,
  openPositionCreateModal,
  closePositionsPanel,
  positionsSettingsMessage,
  positionsSettings,
  startPositionEdit,
  positionDeletingId,
  handlePositionDelete
}) {
  return (
    <section id="positionsPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Position Settings</h3>
        <div className="all-users-head-actions">
          <button
            id="openPositionCreateModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add position"
            title="Add position"
            hidden={!canCreateSettingsPositions}
            onClick={openPositionCreateModal}
          >
            +
          </button>
          <button
            id="closePositionsBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close positions panel"
            onClick={closePositionsPanel}
          >
            ×
          </button>
        </div>
      </div>

      <p id="positionsState" className="all-users-state" hidden={!positionsSettingsMessage}>
        {positionsSettingsMessage}
      </p>

      <div className="all-users-table-wrap settings-table-wrap" hidden={positionsSettings.length === 0}>
        <table className="all-users-table settings-table" aria-label="Positions table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Label</th>
              <th>Active</th>
              <th>Created</th>
              <th>Edit</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {positionsSettings.map((item) => {
              const rowId = String(item.id);
              return (
                <tr key={rowId}>
                  <td>{rowId}</td>
                  <td>{item.label || "-"}</td>
                  <td>{item.isActive ? "Yes" : "No"}</td>
                  <td>{formatDateYMD(item.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="table-action-btn"
                      hidden={!canUpdateSettingsPositions}
                      onClick={() => startPositionEdit(item)}
                    >
                      Edit
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table-action-btn table-action-btn-danger"
                      hidden={!canDeleteSettingsPositions}
                      disabled={positionDeletingId === rowId}
                      onClick={() => handlePositionDelete(rowId, item?.label || rowId)}
                    >
                      {positionDeletingId === rowId ? "..." : "Delete"}
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

export default PositionsSettingsPanel;
