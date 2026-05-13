import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";

function ProfileEntityModals({
  clientCreateModalOpen,
  setClientCreateModalOpen,
  closeClientCreateModal,
  canCreateClients,
  clientCreateForm,
  clientCreateErrors,
  clientCreateSubmitting,
  setClientCreateForm,
  setClientCreateErrors,
  handleClientCreateSubmit,
  userCreateModalOpen,
  closeUserCreateModal,
  canCreateUsers,
  handleCreateUserSubmit,
  createForm,
  createErrors,
  createSubmitting,
  createOrganizationOptions,
  setCreateForm,
  setCreateErrors,
  roleOptions
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const maxBirthdayYmd = new Date().toISOString().slice(0, 10);

  const clientCreateModalLayer = (
    <>
      <section id="clientsCreateModal" className="logout-confirm-modal all-users-edit-modal" hidden={!clientCreateModalOpen}>
        <div className="all-users-head">
          <h3>Create Client</h3>
          <button
            id="closeClientsCreateModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close create client modal"
            onClick={closeClientCreateModal}
          >
            ×
          </button>
        </div>

        {!canCreateClients ? (
          <p className="all-users-state">You do not have permission to create clients.</p>
        ) : (
          <form
            className="auth-form"
            noValidate
            onSubmit={async (event) => {
              const isCreated = await handleClientCreateSubmit(event);
              if (isCreated) {
                setClientCreateModalOpen(false);
              }
            }}
          >
            <div className="all-users-edit-fields">
              <div className="field">
                <label htmlFor="clientCreateModalFirstName">First Name</label>
                <input
                  id="clientCreateModalFirstName"
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
                <label htmlFor="clientCreateModalLastName">Last Name</label>
                <input
                  id="clientCreateModalLastName"
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
                <label htmlFor="clientCreateModalMiddleName">Middle Name</label>
                <input
                  id="clientCreateModalMiddleName"
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

              <div className="client-birthday-vip-row">
                <div className="field">
                  <label htmlFor="clientCreateModalBirthday">Birthday</label>
                  <input
                    id="clientCreateModalBirthday"
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

                <div className="field clients-create-vip-field">
                  <label htmlFor="clientCreateModalIsVip">Active</label>
                  <label
                    className={`clients-create-vip-toggle${clientCreateForm.isVip ? " is-active" : ""}`}
                    htmlFor="clientCreateModalIsVip"
                  >
                    <input
                      id="clientCreateModalIsVip"
                      name="isVip"
                      type="checkbox"
                      checked={Boolean(clientCreateForm.isVip)}
                      onChange={(event) => {
                        const checked = Boolean(event.currentTarget?.checked);
                        setClientCreateForm((prev) => ({ ...prev, isVip: checked }));
                      }}
                    />
                  </label>
                  <small className="field-error" />
                </div>
              </div>

              <div className="field">
                <label htmlFor="clientCreateModalPhone">Phone Number</label>
                <input
                  id="clientCreateModalPhone"
                  name="phone"
                  type="tel"
                  placeholder="+998977861070"
                  required
                  inputMode="tel"
                  pattern="^\+\d{7,15}$"
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
                <label htmlFor="clientCreateModalTelegramOrEmail">Email / Telegram</label>
                <input
                  id="clientCreateModalTelegramOrEmail"
                  name="telegramOrEmail"
                  type="text"
                  placeholder="user@gmail.com or @telegram"
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
            </div>

            <div className="edit-actions">
              <button id="createClientModalBtn" className="btn" type="submit" disabled={clientCreateSubmitting}>
                {clientCreateSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}
      </section>
      <div id="clientsCreateOverlay" className="login-overlay" hidden={!clientCreateModalOpen} onClick={closeClientCreateModal} />
    </>
  );

  const userCreateModalLayer = (
    <>
      <section id="usersCreateModal" className="logout-confirm-modal all-users-edit-modal" hidden={!userCreateModalOpen}>
        <div className="all-users-head">
          <h3>Create User</h3>
          <button
            id="closeUsersCreateModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close create user modal"
            onClick={closeUserCreateModal}
          >
            ×
          </button>
        </div>

        {!canCreateUsers ? (
          <p className="all-users-state">You do not have permission to create users.</p>
        ) : (
          <form
            className="auth-form"
            id="adminCreateForm"
            noValidate
            onSubmit={async (event) => {
              const isCreated = await handleCreateUserSubmit(event);
              if (isCreated) {
                closeUserCreateModal();
              }
            }}
          >
            <div className="all-users-edit-fields">
              <div className="field">
                <label htmlFor="createUserOrganizationCode">Organisation</label>
                <CustomSelect
                  id="createUserOrganizationCode"
                  placeholder="Select organisation"
                  value={createForm.organizationCode}
                  options={createOrganizationOptions}
                  menuPortal
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
                  menuPortal
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
            </div>

            <div className="edit-actions">
              <button id="adminCreateBtn" className="btn" type="submit" disabled={createSubmitting}>
                {createSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}
      </section>
      <div id="usersCreateOverlay" className="login-overlay" hidden={!userCreateModalOpen} onClick={closeUserCreateModal} />
    </>
  );

  return (
    <>
      {createPortal(userCreateModalLayer, document.body)}
      {createPortal(clientCreateModalLayer, document.body)}
    </>
  );
}

export default ProfileEntityModals;
