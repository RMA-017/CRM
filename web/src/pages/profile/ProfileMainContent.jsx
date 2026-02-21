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
  closeAllClientsPanel,
  closeCreateClientPanel,
  clients,
  clientsMessage,
  clientsLoading,
  clientsPage,
  clientsTotalPages,
  loadClients,
  canManageClients,
  clientCreateForm,
  clientCreateErrors,
  clientCreateSubmitting,
  setClientCreateForm,
  setClientCreateErrors,
  handleClientCreateSubmit,
  startClientEdit,
  openClientsDeleteModal,
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
  const maxBirthdayYmd = new Date().toISOString().slice(0, 10);

  return (
    <main className={`home-main${(mainView === "create-user" || mainView === "clients-create") ? " home-main-centered" : ""}`} aria-label="Main content">
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

      {mainView === "clients-all" && (
        <section id="clientsPanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>All Clients</h3>
            <button
              id="closeAllClientsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close all clients panel"
              onClick={closeAllClientsPanel}
            >
              ×
            </button>
          </div>

          <p className="all-users-state" hidden={!clientsMessage}>
            {clientsMessage}
          </p>

          <div className="all-users-table-wrap" hidden={clients.length === 0}>
            <table className="all-users-table" aria-label="Clients table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Middle Name</th>
                  <th>Birthday</th>
                  <th>Phone</th>
                  <th>TG / Email</th>
                  <th>VIP</th>
                  <th>Created At</th>
                  <th>Note</th>
                  <th>Edit</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((item) => {
                  const rowId = String(item.id || "");
                  const firstName = String(item.firstName || item.first_name || "").trim();
                  const lastName = String(item.lastName || item.last_name || "").trim();
                  const middleName = String(item.middleName || item.middle_name || "").trim();
                  const displayBirthday = String(item.birthday || item.birthdate || "").trim();
                  const displayTgMail = String(
                    item.tgMail || item.telegramOrEmail || item.telegram_or_email || item.tg_mail || ""
                  ).trim();
                  const displayNote = String(item.note || "").trim() || "-";
                  const isVip = Boolean(item.isVip ?? item.is_vip);
                  const createdAt = item.createdAt || item.created_at || "";

                  return (
                    <tr key={rowId}>
                      <td>{rowId || "-"}</td>
                      <td>{firstName || "-"}</td>
                      <td>{lastName || "-"}</td>
                      <td>{middleName || "-"}</td>
                      <td>{formatDateYMD(displayBirthday)}</td>
                      <td>{item.phone || item.phone_number || "-"}</td>
                      <td>{displayTgMail || "-"}</td>
                      <td>{isVip ? "Yes" : "No"}</td>
                      <td>{formatDateYMD(createdAt)}</td>
                      <td>{displayNote}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn"
                          disabled={!canManageClients}
                          onClick={() => startClientEdit(item)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
                          disabled={!canManageClients}
                          onClick={() => openClientsDeleteModal(item)}
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

          <div className="all-users-pagination" hidden={clients.length === 0}>
            <button
              type="button"
              className="header-btn"
              disabled={clientsPage <= 1 || clientsLoading}
              onClick={() => loadClients(clientsPage - 1)}
            >
              Previous
            </button>
            <span className="all-users-page-info">
              Page {clientsPage} of {clientsTotalPages}
            </span>
            <button
              type="button"
              className="header-btn"
              disabled={clientsPage >= clientsTotalPages || clientsLoading}
              onClick={() => loadClients(clientsPage + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {mainView === "clients-create" && (
        <section id="createClientPanel" className="create-user-panel">
          <div className="all-users-head">
            <h3>Create Client</h3>
            <button
              id="closeCreateClientBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close create client panel"
              onClick={closeCreateClientPanel}
            >
              ×
            </button>
          </div>

          {!canManageClients ? (
            <p className="all-users-state">You do not have permission to manage clients.</p>
          ) : (
            <form className="auth-form" noValidate onSubmit={handleClientCreateSubmit}>
              <div className="field">
                <label htmlFor="clientCreateFirstName">First Name</label>
                <input
                  id="clientCreateFirstName"
                  name="firstName"
                  type="text"
                  required
                  placeholder="First Name"
                  className={clientCreateErrors.firstName ? "input-error" : ""}
                  value={clientCreateForm.firstName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, firstName: nextValue }));
                    if (clientCreateErrors.firstName) {
                      setClientCreateErrors((prev) => ({ ...prev, firstName: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.firstName || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreateLastName">Last Name</label>
                <input
                  id="clientCreateLastName"
                  name="lastName"
                  type="text"
                  required
                  placeholder="Last Name"
                  className={clientCreateErrors.lastName ? "input-error" : ""}
                  value={clientCreateForm.lastName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, lastName: nextValue }));
                    if (clientCreateErrors.lastName) {
                      setClientCreateErrors((prev) => ({ ...prev, lastName: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.lastName || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreateMiddleName">Middle Name</label>
                <input
                  id="clientCreateMiddleName"
                  name="middleName"
                  type="text"
                  placeholder="Middle Name"
                  className={clientCreateErrors.middleName ? "input-error" : ""}
                  value={clientCreateForm.middleName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, middleName: nextValue }));
                    if (clientCreateErrors.middleName) {
                      setClientCreateErrors((prev) => ({ ...prev, middleName: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.middleName || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreateBirthday">Birthday</label>
                <input
                  id="clientCreateBirthday"
                  name="birthday"
                  type="date"
                  required
                  min="1950-01-01"
                  max={maxBirthdayYmd}
                  className={clientCreateErrors.birthday ? "input-error" : ""}
                  value={clientCreateForm.birthday}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, birthday: nextValue }));
                    if (clientCreateErrors.birthday) {
                      setClientCreateErrors((prev) => ({ ...prev, birthday: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.birthday || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreatePhone">Phone Number</label>
                <input
                  id="clientCreatePhone"
                  name="phone"
                  type="tel"
                  placeholder="+998..."
                  className={clientCreateErrors.phone ? "input-error" : ""}
                  value={clientCreateForm.phone}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, phone: nextValue }));
                    if (clientCreateErrors.phone) {
                      setClientCreateErrors((prev) => ({ ...prev, phone: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.phone || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreateTelegramOrEmail">Telegram or Email</label>
                <input
                  id="clientCreateTelegramOrEmail"
                  name="telegramOrEmail"
                  type="text"
                  placeholder="@username or email@example.com"
                  className={clientCreateErrors.telegramOrEmail ? "input-error" : ""}
                  value={clientCreateForm.telegramOrEmail}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, telegramOrEmail: nextValue }));
                    if (clientCreateErrors.telegramOrEmail) {
                      setClientCreateErrors((prev) => ({ ...prev, telegramOrEmail: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.telegramOrEmail || ""}</small>
              </div>

              <div className="field clients-create-vip-field">
                <label htmlFor="clientCreateIsVip">VIP Client</label>
                <label className="settings-checkbox clients-create-vip-checkbox" htmlFor="clientCreateIsVip">
                  <input
                    id="clientCreateIsVip"
                    type="checkbox"
                    checked={Boolean(clientCreateForm.isVip)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setClientCreateForm((prev) => ({ ...prev, isVip: checked }));
                    }}
                  />
                </label>
                <small className="field-error">{clientCreateErrors.isVip || ""}</small>
              </div>

              <button id="createClientBtn" className="btn" type="submit" disabled={clientCreateSubmitting}>
                Create
              </button>
            </form>
          )}
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
