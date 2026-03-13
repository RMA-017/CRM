import { formatDateYMD } from "../../../lib/formatters.js";

function RolesSettingsPanel({
  canCreateSettingsRoles,
  canUpdateSettingsRoles,
  canDeleteSettingsRoles,
  hasAdminSettingsAccess,
  openRoleCreateModal,
  closeRolesPanel,
  rolesSettingsMessage,
  rolesSettings,
  startRoleEdit,
  roleDeletingId,
  handleRoleDelete
}) {
  return (
    <section id="rolesPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Role Settings</h3>
        <div className="all-users-head-actions">
          <button
            id="openRoleCreateModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add role"
            title="Add role"
            hidden={!canCreateSettingsRoles}
            onClick={openRoleCreateModal}
          >
            +
          </button>
          <button
            id="closeRolesBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close roles panel"
            onClick={closeRolesPanel}
          >
            ×
          </button>
        </div>
      </div>

      <p id="rolesState" className="all-users-state" hidden={!rolesSettingsMessage}>
        {rolesSettingsMessage}
      </p>

      <div className="all-users-table-wrap settings-table-wrap" hidden={rolesSettings.length === 0}>
        <table className="all-users-table settings-table" aria-label="Roles table">
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
            {rolesSettings.map((item) => {
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
                      className="table-action-btn table-action-btn-role-permissions"
                      hidden={!canUpdateSettingsRoles || (item.isAdmin && !hasAdminSettingsAccess)}
                      onClick={() => startRoleEdit(item)}
                    >
                      Edit
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table-action-btn table-action-btn-danger"
                      hidden={!canDeleteSettingsRoles || (item.isAdmin && !hasAdminSettingsAccess)}
                      disabled={roleDeletingId === rowId}
                      onClick={() => handleRoleDelete(rowId, item?.label || rowId)}
                    >
                      {roleDeletingId === rowId ? "..." : "Delete"}
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

export default RolesSettingsPanel;
