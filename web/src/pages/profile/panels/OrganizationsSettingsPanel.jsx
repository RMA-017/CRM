import { formatDateYMD } from "../../../lib/formatters.js";

function OrganizationsSettingsPanel({
  canCreateSettingsOrganizations,
  canUpdateSettingsOrganizations,
  canDeleteSettingsOrganizations,
  openOrganizationCreateModal,
  closeOrganizationsPanel,
  organizationsMessage,
  organizations,
  startOrganizationEdit,
  organizationDeletingId,
  handleOrganizationDelete
}) {
  return (
    <section id="organizationsPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Organization Settings</h3>
        <div className="all-users-head-actions">
          <button
            id="openOrganizationCreateModalBtn"
            type="button"
            className="header-btn appointment-breaks-add-icon-btn"
            aria-label="Add organization"
            title="Add organization"
            hidden={!canCreateSettingsOrganizations}
            onClick={openOrganizationCreateModal}
          >
            +
          </button>
          <button
            id="closeOrganizationsBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close organizations panel"
            onClick={closeOrganizationsPanel}
          >
            ×
          </button>
        </div>
      </div>

      <p id="organizationsState" className="all-users-state" hidden={!organizationsMessage}>
        {organizationsMessage}
      </p>

      <div className="all-users-table-wrap settings-table-wrap" hidden={organizations.length === 0}>
        <table className="all-users-table settings-table" aria-label="Organizations table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Code</th>
              <th>Name</th>
              <th>Active</th>
              <th>Created</th>
              <th>Edit</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((item) => {
              const rowId = String(item.id);
              return (
                <tr key={rowId}>
                  <td>{rowId}</td>
                  <td>{item.code || "-"}</td>
                  <td>{item.name || "-"}</td>
                  <td>{item.isActive ? "Yes" : "No"}</td>
                  <td>{formatDateYMD(item.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="table-action-btn"
                      hidden={!canUpdateSettingsOrganizations}
                      onClick={() => startOrganizationEdit(item)}
                    >
                      Edit
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table-action-btn table-action-btn-danger"
                      hidden={!canDeleteSettingsOrganizations}
                      disabled={organizationDeletingId === rowId}
                      onClick={() => handleOrganizationDelete(rowId, item?.name || item?.code || rowId)}
                    >
                      {organizationDeletingId === rowId ? "..." : "Delete"}
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

export default OrganizationsSettingsPanel;
