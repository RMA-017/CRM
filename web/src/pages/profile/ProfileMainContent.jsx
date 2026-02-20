import CustomSelect from "../../components/CustomSelect.jsx";
import { formatDateYMD } from "../../lib/formatters.js";

function ProfileMainContent({
  mainView,
  allUsersMessage,
  allUsers,
  canUpdateUsers,
  canDeleteUsers,
  openAllUsersEditModal,
  openAllUsersDeleteModal,
  allUsersPage,
  allUsersTotalPages,
  allUsersLoading,
  loadAllUsers,
  closeAllUsersPanel,
  closeClientsPanel,
  closeAppointmentPanel,
  closeOrganizationsPanel,
  closeRolesPanel,
  closePositionsPanel,
  organizations,
  organizationsMessage,
  organizationCreateForm,
  organizationCreateError,
  organizationCreateSubmitting,
  setOrganizationCreateForm,
  setOrganizationCreateError,
  handleOrganizationCreateSubmit,
  startOrganizationEdit,
  organizationDeletingId,
  handleOrganizationDelete,
  rolesSettings,
  rolesSettingsMessage,
  roleCreateForm,
  roleCreateError,
  roleCreateSubmitting,
  setRoleCreateForm,
  setRoleCreateError,
  handleRoleCreateSubmit,
  startRoleEdit,
  roleDeletingId,
  handleRoleDelete,
  positionsSettings,
  positionsSettingsMessage,
  positionCreateForm,
  positionCreateError,
  positionCreateSubmitting,
  setPositionCreateForm,
  setPositionCreateError,
  handlePositionCreateSubmit,
  startPositionEdit,
  positionDeletingId,
  handlePositionDelete,
  canCreateUsers,
  handleCreateUserSubmit,
  createForm,
  createErrors,
  createSubmitting,
  organizationsLoading,
  createOrganizationOptions,
  setCreateForm,
  setCreateErrors,
  roleOptions,
  closeCreateUserPanel
}) {
  return (
    <main className={`home-main${mainView === "create-user" ? " home-main-centered" : ""}`} aria-label="Main content">
      {mainView === "all-users" && (
        <section id="allUsersPanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>All Users</h3>
            <button
              id="closeAllUsersBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close all users panel"
              onClick={closeAllUsersPanel}
            >
              ×
            </button>
          </div>

          <p id="allUsersState" className="all-users-state" hidden={!allUsersMessage}>
            {allUsersMessage}
          </p>

          <div id="allUsersTableWrap" className="all-users-table-wrap" hidden={allUsers.length === 0}>
            <table className="all-users-table" aria-label="All users table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Organization</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Full Name</th>
                  <th>Birthday</th>
                  <th>Phone</th>
                  <th>Position</th>
                  <th>Role</th>
                  <th>Created At</th>
                  <th>Edit</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody id="allUsersTableBody">
                {allUsers.map((user) => (
                  <tr key={String(user.id)}>
                    <td>{user.id || "-"}</td>
                    <td>
                      {user.organizationName && user.organizationCode
                        ? `${user.organizationName} (${user.organizationCode})`
                        : (user.organizationCode || "-")}
                    </td>
                    <td>{user.username || "-"}</td>
                    <td>{user.email || "-"}</td>
                    <td>{user.fullName || "-"}</td>
                    <td>{formatDateYMD(user.birthday)}</td>
                    <td>{user.phone || "-"}</td>
                    <td>{user.position || "-"}</td>
                    <td>{user.role || "-"}</td>
                    <td>{formatDateYMD(user.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn"
                        disabled={!canUpdateUsers}
                        onClick={() => openAllUsersEditModal(user.id)}
                      >
                        Edit
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn table-action-btn-danger"
                        disabled={!canDeleteUsers}
                        onClick={() => openAllUsersDeleteModal(user.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div id="allUsersPagination" className="all-users-pagination" hidden={allUsers.length === 0}>
            <button
              id="allUsersPrevBtn"
              type="button"
              className="header-btn"
              disabled={allUsersPage <= 1 || allUsersLoading}
              onClick={() => loadAllUsers(allUsersPage - 1)}
            >
              Previous
            </button>
            <span id="allUsersPageInfo" className="all-users-page-info">
              Page {allUsersPage} of {allUsersTotalPages}
            </span>
            <button
              id="allUsersNextBtn"
              type="button"
              className="header-btn"
              disabled={allUsersPage >= allUsersTotalPages || allUsersLoading}
              onClick={() => loadAllUsers(allUsersPage + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {mainView === "clients" && (
        <section id="clientsPanel" className="create-user-panel">
          <div className="all-users-head">
            <h3>Clients</h3>
            <button
              id="closeClientsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close clients panel"
              onClick={closeClientsPanel}
            >
              ×
            </button>
          </div>
          <p className="all-users-state">
            Clients bo'limi tayyorlandi. Keyingi bosqichda mijozlar jadvali va CRUD funksiyalarini qo'shamiz.
          </p>
        </section>
      )}

      {mainView === "appointment" && (
        <section id="appointmentPanel" className="create-user-panel">
          <div className="all-users-head">
            <h3>Appointment</h3>
            <button
              id="closeAppointmentBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close appointment panel"
              onClick={closeAppointmentPanel}
            >
              ×
            </button>
          </div>
          <p className="all-users-state">
            Appointment bo'limi tayyorlandi. Keyingi bosqichda jadval va bronlash oqimini qo'shamiz.
          </p>
        </section>
      )}

      {mainView === "settings-organizations" && (
        <section id="organizationsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Organizations</h3>
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

          <form className="auth-form settings-create-form" noValidate onSubmit={handleOrganizationCreateSubmit}>
            <div className="settings-form-grid settings-form-grid-org">
              <div className="field">
                <label htmlFor="organizationCodeInput">Code</label>
                <input
                  id="organizationCodeInput"
                  name="code"
                  type="text"
                  placeholder="organization-code"
                  value={organizationCreateForm.code}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setOrganizationCreateForm((prev) => ({ ...prev, code: nextValue }));
                    if (organizationCreateError) {
                      setOrganizationCreateError("");
                    }
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="organizationNameInput">Name</label>
                <input
                  id="organizationNameInput"
                  name="name"
                  type="text"
                  placeholder="Organization Name"
                  value={organizationCreateForm.name}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setOrganizationCreateForm((prev) => ({ ...prev, name: nextValue }));
                    if (organizationCreateError) {
                      setOrganizationCreateError("");
                    }
                  }}
                />
              </div>
              <div className="field settings-inline-control">
                <label className="settings-spacer-label" aria-hidden="true">&nbsp;</label>
                <label className="settings-checkbox" htmlFor="organizationIsActiveInput">
                  <input
                    id="organizationIsActiveInput"
                    type="checkbox"
                    aria-label="Active"
                    checked={Boolean(organizationCreateForm.isActive)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setOrganizationCreateForm((prev) => ({ ...prev, isActive: checked }));
                    }}
                  />
                </label>
              </div>
              <div className="field settings-inline-control settings-action-field">
                <label aria-hidden="true">&nbsp;</label>
                <button className="btn settings-add-btn" type="submit" disabled={organizationCreateSubmitting}>
                  Add
                </button>
              </div>
            </div>
            <small className="field-error settings-error">{organizationCreateError}</small>
          </form>

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
                          onClick={() => startOrganizationEdit(item)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
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
      )}

      {mainView === "settings-roles" && (
        <section id="rolesPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Roles</h3>
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

          <form className="auth-form settings-create-form" noValidate onSubmit={handleRoleCreateSubmit}>
            <div className="settings-form-grid">
              <div className="field">
                <label htmlFor="roleLabelInput">Label</label>
                <input
                  id="roleLabelInput"
                  name="label"
                  type="text"
                  placeholder="Manager"
                  value={roleCreateForm.label}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setRoleCreateForm((prev) => ({ ...prev, label: nextValue }));
                    if (roleCreateError) {
                      setRoleCreateError("");
                    }
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="roleSortOrderInput">Sort</label>
                <input
                  id="roleSortOrderInput"
                  name="sortOrder"
                  type="number"
                  value={roleCreateForm.sortOrder}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setRoleCreateForm((prev) => ({ ...prev, sortOrder: nextValue }));
                  }}
                />
              </div>
              <div className="field settings-inline-control">
                <label className="settings-spacer-label" aria-hidden="true">&nbsp;</label>
                <label className="settings-checkbox" htmlFor="roleIsActiveInput">
                  <input
                    id="roleIsActiveInput"
                    type="checkbox"
                    aria-label="Active"
                    checked={Boolean(roleCreateForm.isActive)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setRoleCreateForm((prev) => ({ ...prev, isActive: checked }));
                    }}
                  />
                </label>
              </div>
              <div className="field settings-inline-control settings-action-field">
                <label aria-hidden="true">&nbsp;</label>
                <button className="btn settings-add-btn" type="submit" disabled={roleCreateSubmitting}>
                  Add
                </button>
              </div>
            </div>
            <small className="field-error settings-error">{roleCreateError}</small>
          </form>

          <p id="rolesState" className="all-users-state" hidden={!rolesSettingsMessage}>
            {rolesSettingsMessage}
          </p>

          <div className="all-users-table-wrap settings-table-wrap" hidden={rolesSettings.length === 0}>
            <table className="all-users-table settings-table" aria-label="Roles table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Label</th>
                  <th>Sort</th>
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
                      <td>{item.sortOrder}</td>
                      <td>{item.isActive ? "Yes" : "No"}</td>
                      <td>{formatDateYMD(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn"
                          onClick={() => startRoleEdit(item)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
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
      )}

      {mainView === "settings-positions" && (
        <section id="positionsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Positions</h3>
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

          <form className="auth-form settings-create-form" noValidate onSubmit={handlePositionCreateSubmit}>
            <div className="settings-form-grid">
              <div className="field">
                <label htmlFor="positionLabelInput">Label</label>
                <input
                  id="positionLabelInput"
                  name="label"
                  type="text"
                  placeholder="New Position Label"
                  value={positionCreateForm.label}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setPositionCreateForm((prev) => ({ ...prev, label: nextValue }));
                    if (positionCreateError) {
                      setPositionCreateError("");
                    }
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="positionSortOrderInput">Sort</label>
                <input
                  id="positionSortOrderInput"
                  name="sortOrder"
                  type="number"
                  value={positionCreateForm.sortOrder}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setPositionCreateForm((prev) => ({ ...prev, sortOrder: nextValue }));
                  }}
                />
              </div>
              <div className="field settings-inline-control">
                <label className="settings-spacer-label" aria-hidden="true">&nbsp;</label>
                <label className="settings-checkbox" htmlFor="positionIsActiveInput">
                  <input
                    id="positionIsActiveInput"
                    type="checkbox"
                    aria-label="Active"
                    checked={Boolean(positionCreateForm.isActive)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setPositionCreateForm((prev) => ({ ...prev, isActive: checked }));
                    }}
                  />
                </label>
              </div>
              <div className="field settings-inline-control settings-action-field">
                <label aria-hidden="true">&nbsp;</label>
                <button className="btn settings-add-btn" type="submit" disabled={positionCreateSubmitting}>
                  Add
                </button>
              </div>
            </div>
            <small className="field-error settings-error">{positionCreateError}</small>
          </form>

          <p id="positionsState" className="all-users-state" hidden={!positionsSettingsMessage}>
            {positionsSettingsMessage}
          </p>

          <div className="all-users-table-wrap settings-table-wrap" hidden={positionsSettings.length === 0}>
            <table className="all-users-table settings-table" aria-label="Positions table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Label</th>
                  <th>Sort</th>
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
                      <td>{item.sortOrder}</td>
                      <td>{item.isActive ? "Yes" : "No"}</td>
                      <td>{formatDateYMD(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn"
                          onClick={() => startPositionEdit(item)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
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
      )}

      {mainView === "create-user" && (
        <section id="createUserPanel" className="create-user-panel">
          <div className="all-users-head">
            <h3>Create User</h3>
            <button
              id="closeCreateUserBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close create user panel"
              onClick={closeCreateUserPanel}
            >
              ×
            </button>
          </div>

          {!canCreateUsers ? (
            <p className="all-users-state">You do not have permission to create users.</p>
          ) : (
            <form className="auth-form" id="adminCreateForm" noValidate onSubmit={handleCreateUserSubmit}>
              <div className="field">
                <label htmlFor="createUserOrganizationCode">Organisation</label>
                <CustomSelect
                  id="createUserOrganizationCode"
                  placeholder={organizationsLoading ? "Loading organisations..." : "Select organisation"}
                  value={createForm.organizationCode}
                  options={createOrganizationOptions}
                  error={Boolean(createErrors.organizationCode)}
                  onChange={(nextCode) => {
                    setCreateForm((prev) => ({ ...prev, organizationCode: nextCode }));
                    if (createErrors.organizationCode) {
                      setCreateErrors((prev) => ({ ...prev, organizationCode: "" }));
                    }
                  }}
                />
                <small className="field-error">{createErrors.organizationCode || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="Username"
                  autoComplete="username"
                  required
                  className={createErrors.username ? "input-error" : ""}
                  value={createForm.username}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setCreateForm((prev) => ({ ...prev, username: nextValue }));
                    if (createErrors.username) {
                      setCreateErrors((prev) => ({ ...prev, username: "" }));
                    }
                  }}
                />
                <small className="field-error" id="usernameError">{createErrors.username || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="Muhammad Rahmonov"
                  autoComplete="name"
                  required
                  className={createErrors.fullName ? "input-error" : ""}
                  value={createForm.fullName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setCreateForm((prev) => ({ ...prev, fullName: nextValue }));
                    if (createErrors.fullName) {
                      setCreateErrors((prev) => ({ ...prev, fullName: "" }));
                    }
                  }}
                />
                <small className="field-error" id="fullNameError">{createErrors.fullName || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="roleSelect">Role</label>
                <CustomSelect
                  id="roleSelect"
                  placeholder="Select role"
                  value={createForm.role}
                  options={roleOptions}
                  error={Boolean(createErrors.role)}
                  onChange={(nextRole) => {
                    setCreateForm((prev) => ({ ...prev, role: nextRole }));
                    if (createErrors.role) {
                      setCreateErrors((prev) => ({ ...prev, role: "" }));
                    }
                  }}
                />
                <small className="field-error" id="roleError">{createErrors.role || ""}</small>
              </div>

              <button id="adminCreateBtn" className="btn" type="submit" disabled={createSubmitting}>
                Create
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}

export default ProfileMainContent;
