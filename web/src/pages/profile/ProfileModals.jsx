import { createPortal } from "react-dom";
import CustomSelect from "../../components/CustomSelect.jsx";
import { formatDateYMD } from "../../lib/formatters.js";
import { togglePermissionCode } from "./profile.helpers.js";

function formatNotificationDateTime(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const dateText = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
  const timeText = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return `${dateText} • ${timeText}`;
}

function resolveNotificationDisplay(item) {
  const message = String(item?.message || "").trim();
  const eventType = String(item?.eventType || item?.event_type || "").trim().toLowerCase();
  const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
  const payloadData = payload?.data && typeof payload.data === "object" ? payload.data : payload;

  const actionLabel = String(payloadData?.actionLabel || "").trim().toLowerCase();
  const actorFirstName = String(payloadData?.actorFirstName || "").trim();
  const clientName = String(payloadData?.clientName || "").trim();
  const isScheduleNotification = (
    eventType === "schedule-created"
    || eventType === "schedule-updated"
    || eventType === "schedule-deleted"
  );

  const title = isScheduleNotification && actionLabel && actorFirstName
    ? `Client ${actionLabel} by ${actorFirstName}`
    : (message || "-");

  return {
    title,
    clientName: clientName || ""
  };
}

function ProfileModals(props) {
  const maxBirthdayYmd = new Date().toISOString().slice(0, 10);

  const {
    myProfileModalOpen,
    closeMyProfilePanel,
    notificationsModalOpen,
    closeNotificationsPanel,
    notifications,
    clearNotifications,
    openAvatarPicker,
    avatarDataUrl,
    avatarFallback,
    profile,
    openProfileEditModal,
    openPasswordEditModal,
    logoutConfirmOpen,
    handleLogout,
    setLogoutConfirmOpen,
    profileEdit,
    handleProfileEditSubmit,
    setProfileEdit,
    positionOptions,
    closeProfileEditModal,
    allUsersEdit,
    handleAllUsersEditSubmit,
    organizationsLoading,
    createOrganizationOptions,
    setAllUsersEdit,
    roleOptions,
    closeAllUsersEditModal,
    clientsEditOpen,
    clientEditForm,
    clientEditErrors,
    clientEditSubmitting,
    setClientEditForm,
    setClientEditErrors,
    handleClientEditSubmit,
    closeClientsEditModal,
    allUsersDelete,
    handleAllUsersDelete,
    closeAllUsersDeleteModal,
    clientsDelete,
    handleClientsDeleteConfirm,
    closeClientsDeleteModal,
    settingsDelete,
    handleSettingsDeleteConfirm,
    closeSettingsDeleteModal,
    organizationEditOpen,
    handleOrganizationEditSave,
    organizationEditForm,
    setOrganizationEditForm,
    organizationEditError,
    setOrganizationEditError,
    organizationEditSubmitting,
    cancelOrganizationEdit,
    roleEditOpen,
    handleRoleEditSave,
    groupedRolePermissionOptions,
    roleEditForm,
    setRoleEditForm,
    roleEditError,
    setRoleEditError,
    roleEditSubmitting,
    cancelRoleEdit,
    positionEditOpen,
    handlePositionEditSave,
    positionEditForm,
    setPositionEditForm,
    positionEditError,
    setPositionEditError,
    positionEditSubmitting,
    cancelPositionEdit
  } = props;

  const modalContent = (
    <>
      <section id="myProfileModal" className="my-profile-panel my-profile-modal" hidden={!myProfileModalOpen}>
        <div className="all-users-head">
          <h3>My Profile</h3>
          <button
            id="closeMyProfileBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close my profile panel"
            onClick={closeMyProfilePanel}
          >
            ×
          </button>
        </div>

        <div
          className="profile-modal-photo"
          id="myProfilePhoto"
          role="button"
          tabIndex={0}
          aria-label="Upload profile photo"
          onClick={openAvatarPicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openAvatarPicker();
            }
          }}
        >
          <img
            id="myProfilePhotoImage"
            className="profile-modal-photo-image"
            alt="My profile photo"
            hidden={!avatarDataUrl}
            src={avatarDataUrl || undefined}
          />
          <span id="myProfilePhotoFallback" hidden={Boolean(avatarDataUrl)}>
            {avatarFallback}
          </span>
        </div>

        <dl className="profile-modal-list">
          <div>
            <dt>Username</dt>
            <dd id="modalProfileUsername">{profile?.username || "-"}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd id="modalProfileRole">{profile?.role || "-"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd id="modalProfileEmail">{profile?.email || "-"}</dd>
          </div>
          <div>
            <dt>Full Name</dt>
            <dd id="modalProfileFullName">{profile?.fullName || "-"}</dd>
          </div>
          <div>
            <dt>Birthday</dt>
            <dd id="modalProfileBirthday">{formatDateYMD(profile?.birthday)}</dd>
          </div>
          <div>
            <dt>Password</dt>
            <dd id="modalProfilePassword">********</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd id="modalProfilePhone">{profile?.phone || "-"}</dd>
          </div>
          <div>
            <dt>Position</dt>
            <dd id="modalProfilePosition">{profile?.position || "-"}</dd>
          </div>
        </dl>
        <div className="profile-modal-actions">
          <button id="openProfileEditBtn" className="btn" type="button" onClick={openProfileEditModal}>
            Edit
          </button>
          <button id="openPasswordEditBtn" className="header-btn" type="button" onClick={openPasswordEditModal}>
            Change
          </button>
        </div>
      </section>
      <div id="myProfileOverlay" className="login-overlay" hidden={!myProfileModalOpen} onClick={closeMyProfilePanel} />

      <section id="notificationsModal" className="logout-confirm-modal profile-notification-modal" hidden={!notificationsModalOpen}>
        <div className="all-users-head">
          <h3>Notifications</h3>
          <button
            id="closeNotificationsBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close notifications panel"
            onClick={closeNotificationsPanel}
          >
            ×
          </button>
        </div>

        <div className="profile-notification-list">
          {Array.isArray(notifications) && notifications.length > 0 ? (
            notifications.map((item) => {
              const message = String(item?.message || "").trim();
              const { title, clientName } = resolveNotificationDisplay(item);
              const createdAt = formatNotificationDateTime(item?.createdAt);
              return (
                <article key={String(item?.id || `${message}-${createdAt}`)} className="profile-notification-item">
                  <p className="profile-notification-title">{title}</p>
                  <div className="profile-notification-meta">
                    <span className="profile-notification-client">{clientName || "\u00A0"}</span>
                    <time>{createdAt}</time>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="all-users-state profile-notification-empty">No notifications yet.</p>
          )}
        </div>

        <div className="profile-modal-actions">
          <button id="clearNotificationsBtn" className="btn" type="button" onClick={clearNotifications}>
            Clear
          </button>
          <button id="closeNotificationsFooterBtn" className="header-btn" type="button" onClick={closeNotificationsPanel}>
            Close
          </button>
        </div>
      </section>
      <div
        id="notificationsOverlay"
        className="login-overlay"
        hidden={!notificationsModalOpen}
        onClick={closeNotificationsPanel}
      />

      <section id="logoutConfirmModal" className="logout-confirm-modal" hidden={!logoutConfirmOpen}>
        <h3>Are you sure you want to log out?</h3>
        <div className="logout-confirm-actions">
          <button
            id="logoutConfirmYes"
            type="button"
            className="header-btn logout-confirm-yes"
            onClick={handleLogout}
          >
            Yes
          </button>
          <button
            id="logoutConfirmNo"
            type="button"
            className="header-btn"
            onClick={() => setLogoutConfirmOpen(false)}
          >
            No
          </button>
        </div>
      </section>
      <div
        id="logoutConfirmOverlay"
        className="login-overlay"
        hidden={!logoutConfirmOpen}
        onClick={() => setLogoutConfirmOpen(false)}
      />

      <section id="profileEditModal" className="logout-confirm-modal profile-edit-modal" hidden={!profileEdit.open}>
        <h3 id="profileEditTitle">{profileEdit.mode === "password" ? "Change Password" : "Edit Profile"}</h3>
        <form id="profileEditForm" className="auth-form" noValidate onSubmit={handleProfileEditSubmit}>
          {profileEdit.mode === "password" ? (
            <>
              <div className="field">
                <label id="profileEditLabel" htmlFor="profileEditCurrentPassword">Current Password</label>
                <input
                  id="profileEditCurrentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Current password"
                  className={profileEdit.errorField === "currentPassword" ? "input-error" : ""}
                  value={profileEdit.currentPassword}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({ ...prev, currentPassword: nextValue, error: "", errorField: "" }));
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="profileEditNewPassword">New Password</label>
                <input
                  id="profileEditNewPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="New password"
                  className={profileEdit.errorField === "newPassword" ? "input-error" : ""}
                  value={profileEdit.newPassword}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({ ...prev, newPassword: nextValue, error: "", errorField: "" }));
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="profileEditEmail">Email</label>
                <input
                  id="profileEditEmail"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="user@gmail.com"
                  className={profileEdit.errorField === "email" ? "input-error" : ""}
                  value={profileEdit.form.email}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({
                      ...prev,
                      form: { ...prev.form, email: nextValue },
                      error: "",
                      errorField: ""
                    }));
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="profileEditFullName">Full Name</label>
                <input
                  id="profileEditFullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  placeholder="Full name"
                  className={profileEdit.errorField === "fullName" ? "input-error" : ""}
                  value={profileEdit.form.fullName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({
                      ...prev,
                      form: { ...prev.form, fullName: nextValue },
                      error: "",
                      errorField: ""
                    }));
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="profileEditBirthday">Birthday</label>
                <input
                  id="profileEditBirthday"
                  name="birthday"
                  type="date"
                  min="1950-01-01"
                  max={maxBirthdayYmd}
                  autoComplete="bday"
                  className={profileEdit.errorField === "birthday" ? "input-error" : ""}
                  value={profileEdit.form.birthday}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({
                      ...prev,
                      form: { ...prev.form, birthday: nextValue },
                      error: "",
                      errorField: ""
                    }));
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="profileEditPhone">Phone</label>
                <input
                  id="profileEditPhone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+998977861070"
                  className={profileEdit.errorField === "phone" ? "input-error" : ""}
                  value={profileEdit.form.phone}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({
                      ...prev,
                      form: { ...prev.form, phone: nextValue },
                      error: "",
                      errorField: ""
                    }));
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="profileEditPositionSelectControl">Position</label>
                <CustomSelect
                  id="profileEditPositionSelectControl"
                  placeholder="Select position"
                  value={profileEdit.form.position}
                  options={positionOptions}
                  error={profileEdit.errorField === "position"}
                  onChange={(nextPosition) => {
                    setProfileEdit((prev) => ({
                      ...prev,
                      form: { ...prev.form, position: nextPosition },
                      error: "",
                      errorField: ""
                    }));
                  }}
                />
              </div>
            </>
          )}
          <small id="profileEditError" className="field-error">{profileEdit.error}</small>
          <div className="edit-actions">
            <button id="profileEditSubmit" className="btn" type="submit" disabled={profileEdit.submitting}>
              Save
            </button>
            <button id="profileEditCancel" className="header-btn" type="button" onClick={closeProfileEditModal}>
              Cancel
            </button>
          </div>
        </form>
      </section>
      <div
        id="profileEditOverlay"
        className="login-overlay stacked-modal-overlay"
        hidden={!profileEdit.open}
        onClick={closeProfileEditModal}
      />

      <section id="allUsersEditModal" className="logout-confirm-modal all-users-edit-modal" hidden={!allUsersEdit.open}>
        <h3>Edit User</h3>
        <form id="allUsersEditForm" className="auth-form" noValidate onSubmit={handleAllUsersEditSubmit}>
          <div className="all-users-edit-fields">
            <div className="field">
              <label htmlFor="allUsersEditOrganizationSelect">Organisation</label>
              <CustomSelect
                id="allUsersEditOrganizationSelect"
                placeholder={organizationsLoading ? "Loading organisations..." : "Select organisation"}
                value={allUsersEdit.form.organizationCode}
                options={createOrganizationOptions}
                error={Boolean(allUsersEdit.errors.organizationCode)}
                onChange={(nextCode) => {
                  setAllUsersEdit((prev) => ({
                    ...prev,
                    form: { ...prev.form, organizationCode: nextCode },
                    errors: { ...prev.errors, organizationCode: "" }
                  }));
                }}
              />
              <small id="allUsersEditOrganizationError" className="field-error">{allUsersEdit.errors.organizationCode || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="allUsersEditUsername">Username</label>
              <input
                id="allUsersEditUsername"
                name="username"
                type="text"
                autoComplete="username"
                required
                className={allUsersEdit.errors.username ? "input-error" : ""}
                value={allUsersEdit.form.username}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setAllUsersEdit((prev) => ({
                    ...prev,
                    form: { ...prev.form, username: nextValue },
                    errors: { ...prev.errors, username: "" }
                  }));
                }}
              />
              <small id="allUsersEditUsernameError" className="field-error">{allUsersEdit.errors.username || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="allUsersEditEmail">Email</label>
              <input
                id="allUsersEditEmail"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="user@gmail.com"
                className={allUsersEdit.errors.email ? "input-error" : ""}
                value={allUsersEdit.form.email}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setAllUsersEdit((prev) => ({
                    ...prev,
                    form: { ...prev.form, email: nextValue },
                    errors: { ...prev.errors, email: "" }
                  }));
                }}
              />
              <small id="allUsersEditEmailError" className="field-error">{allUsersEdit.errors.email || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="allUsersEditFullName">Full Name</label>
              <input
                id="allUsersEditFullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                className={allUsersEdit.errors.fullName ? "input-error" : ""}
                value={allUsersEdit.form.fullName}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setAllUsersEdit((prev) => ({
                    ...prev,
                    form: { ...prev.form, fullName: nextValue },
                    errors: { ...prev.errors, fullName: "" }
                  }));
                }}
              />
              <small id="allUsersEditFullNameError" className="field-error">{allUsersEdit.errors.fullName || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="allUsersEditBirthday">Birthday</label>
              <input
                id="allUsersEditBirthday"
                name="birthday"
                type="date"
                min="1950-01-01"
                max={maxBirthdayYmd}
                autoComplete="bday"
                className={allUsersEdit.errors.birthday ? "input-error" : ""}
                value={allUsersEdit.form.birthday}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setAllUsersEdit((prev) => ({
                    ...prev,
                    form: { ...prev.form, birthday: nextValue },
                    errors: { ...prev.errors, birthday: "" }
                  }));
                }}
              />
              <small id="allUsersEditBirthdayError" className="field-error">{allUsersEdit.errors.birthday || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="allUsersEditPhone">Phone</label>
              <input
                id="allUsersEditPhone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+998977861070"
                className={allUsersEdit.errors.phone ? "input-error" : ""}
                value={allUsersEdit.form.phone}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setAllUsersEdit((prev) => ({
                    ...prev,
                    form: { ...prev.form, phone: nextValue },
                    errors: { ...prev.errors, phone: "" }
                  }));
                }}
              />
              <small id="allUsersEditPhoneError" className="field-error">{allUsersEdit.errors.phone || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="allUsersEditPositionSelect">Position</label>
              <CustomSelect
                id="allUsersEditPositionSelect"
                placeholder="Select position"
                value={allUsersEdit.form.position}
                options={positionOptions}
                error={Boolean(allUsersEdit.errors.position)}
                onChange={(nextValue) => {
                  setAllUsersEdit((prev) => ({
                    ...prev,
                    form: { ...prev.form, position: nextValue },
                    errors: { ...prev.errors, position: "" }
                  }));
                }}
              />
              <small id="allUsersEditPositionError" className="field-error">{allUsersEdit.errors.position || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="allUsersEditRoleSelect">Role</label>
              <CustomSelect
                id="allUsersEditRoleSelect"
                placeholder="Select role"
                value={allUsersEdit.form.role}
                options={roleOptions}
                error={Boolean(allUsersEdit.errors.role)}
                onChange={(nextValue) => {
                  setAllUsersEdit((prev) => ({
                    ...prev,
                    form: { ...prev.form, role: nextValue },
                    errors: { ...prev.errors, role: "" }
                  }));
                }}
              />
              <small id="allUsersEditRoleError" className="field-error">{allUsersEdit.errors.role || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="allUsersEditPassword">New Password (optional)</label>
              <input
                id="allUsersEditPassword"
                name="password"
                type="password"
                autoComplete="new-password"
                className={allUsersEdit.errors.password ? "input-error" : ""}
                value={allUsersEdit.form.password}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setAllUsersEdit((prev) => ({
                    ...prev,
                    form: { ...prev.form, password: nextValue },
                    errors: { ...prev.errors, password: "" }
                  }));
                }}
              />
              <small id="allUsersEditPasswordError" className="field-error">{allUsersEdit.errors.password || ""}</small>
            </div>
          </div>

          <div className="edit-actions">
            <button id="allUsersEditSaveBtn" className="btn" type="submit" disabled={allUsersEdit.submitting}>
              Save
            </button>
            <button id="allUsersEditCancelBtn" className="header-btn" type="button" onClick={closeAllUsersEditModal}>
              Cancel
            </button>
          </div>
        </form>
      </section>
      <div id="allUsersEditOverlay" className="login-overlay" hidden={!allUsersEdit.open} onClick={closeAllUsersEditModal} />

      <section id="clientsEditModal" className="logout-confirm-modal all-users-edit-modal" hidden={!clientsEditOpen}>
        <h3>Edit Client</h3>
        <form id="clientsEditForm" className="auth-form" noValidate onSubmit={handleClientEditSubmit}>
          <div className="all-users-edit-fields">
            <div className="field">
              <label htmlFor="clientsEditFirstName">First Name</label>
              <input
                id="clientsEditFirstName"
                type="text"
                className={clientEditErrors.firstName ? "input-error" : ""}
                value={clientEditForm.firstName}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setClientEditForm((prev) => ({ ...prev, firstName: nextValue }));
                  if (clientEditErrors.firstName) {
                    setClientEditErrors((prev) => ({ ...prev, firstName: "" }));
                  }
                }}
              />
              <small className="field-error">{clientEditErrors.firstName || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="clientsEditLastName">Last Name</label>
              <input
                id="clientsEditLastName"
                type="text"
                className={clientEditErrors.lastName ? "input-error" : ""}
                value={clientEditForm.lastName}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setClientEditForm((prev) => ({ ...prev, lastName: nextValue }));
                  if (clientEditErrors.lastName) {
                    setClientEditErrors((prev) => ({ ...prev, lastName: "" }));
                  }
                }}
              />
              <small className="field-error">{clientEditErrors.lastName || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="clientsEditMiddleName">Middle Name</label>
              <input
                id="clientsEditMiddleName"
                type="text"
                className={clientEditErrors.middleName ? "input-error" : ""}
                value={clientEditForm.middleName}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setClientEditForm((prev) => ({ ...prev, middleName: nextValue }));
                  if (clientEditErrors.middleName) {
                    setClientEditErrors((prev) => ({ ...prev, middleName: "" }));
                  }
                }}
              />
              <small className="field-error">{clientEditErrors.middleName || ""}</small>
            </div>

            <div className="client-birthday-vip-row">
              <div className="field">
                <label htmlFor="clientsEditBirthday">Birthday</label>
                <input
                  id="clientsEditBirthday"
                  type="date"
                  min="1950-01-01"
                  max={maxBirthdayYmd}
                  className={clientEditErrors.birthday ? "input-error" : ""}
                  value={clientEditForm.birthday}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientEditForm((prev) => ({ ...prev, birthday: nextValue }));
                    if (clientEditErrors.birthday) {
                      setClientEditErrors((prev) => ({ ...prev, birthday: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientEditErrors.birthday || ""}</small>
              </div>

              <div className="field clients-edit-vip-field">
                <label htmlFor="clientsEditIsVip">VIP</label>
                <label
                  className={`clients-create-vip-toggle${clientEditForm.isVip ? " is-active" : ""}`}
                  htmlFor="clientsEditIsVip"
                >
                  <input
                    id="clientsEditIsVip"
                    type="checkbox"
                    checked={Boolean(clientEditForm.isVip)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setClientEditForm((prev) => ({ ...prev, isVip: checked }));
                      if (clientEditErrors.isVip) {
                        setClientEditErrors((prev) => ({ ...prev, isVip: "" }));
                      }
                    }}
                  />
                </label>
                <small className="field-error">{clientEditErrors.isVip || ""}</small>
              </div>
            </div>

            <div className="field">
              <label htmlFor="clientsEditPhone">Phone Number</label>
              <input
                id="clientsEditPhone"
                type="text"
                placeholder="+998977861070"
                className={clientEditErrors.phone ? "input-error" : ""}
                value={clientEditForm.phone}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setClientEditForm((prev) => ({ ...prev, phone: nextValue }));
                  if (clientEditErrors.phone) {
                    setClientEditErrors((prev) => ({ ...prev, phone: "" }));
                  }
                }}
              />
              <small className="field-error">{clientEditErrors.phone || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="clientsEditTgMail">Email</label>
              <input
                id="clientsEditTgMail"
                type="text"
                placeholder="user@gmail.com"
                className={clientEditErrors.tgMail ? "input-error" : ""}
                value={clientEditForm.tgMail}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setClientEditForm((prev) => ({ ...prev, tgMail: nextValue }));
                  if (clientEditErrors.tgMail) {
                    setClientEditErrors((prev) => ({ ...prev, tgMail: "" }));
                  }
                }}
              />
              <small className="field-error">{clientEditErrors.tgMail || ""}</small>
            </div>

            <div className="field">
              <label htmlFor="clientsEditNote">Note</label>
              <input
                id="clientsEditNote"
                type="text"
                className={clientEditErrors.note ? "input-error" : ""}
                value={clientEditForm.note}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setClientEditForm((prev) => ({ ...prev, note: nextValue }));
                  if (clientEditErrors.note) {
                    setClientEditErrors((prev) => ({ ...prev, note: "" }));
                  }
                }}
              />
              <small className="field-error">{clientEditErrors.note || ""}</small>
            </div>
          </div>

          <div className="edit-actions">
            <button id="clientsEditSaveBtn" className="btn" type="submit" disabled={clientEditSubmitting}>
              Save
            </button>
            <button id="clientsEditCancelBtn" className="header-btn" type="button" onClick={closeClientsEditModal}>
              Cancel
            </button>
          </div>
        </form>
      </section>
      <div id="clientsEditOverlay" className="login-overlay" hidden={!clientsEditOpen} onClick={closeClientsEditModal} />

      <section id="allUsersDeleteModal" className="logout-confirm-modal" hidden={!allUsersDelete.open}>
        <h3>Are you sure you want to delete this user?</h3>
        <p id="allUsersDeleteError" className="field-error">{allUsersDelete.error}</p>
        <div className="logout-confirm-actions">
          <button
            id="allUsersDeleteYesBtn"
            type="button"
            className="header-btn logout-confirm-yes"
            disabled={allUsersDelete.submitting}
            onClick={handleAllUsersDelete}
          >
            Yes
          </button>
          <button
            id="allUsersDeleteNoBtn"
            type="button"
            className="header-btn"
            disabled={allUsersDelete.submitting}
            onClick={closeAllUsersDeleteModal}
          >
            No
          </button>
        </div>
      </section>
      <div id="allUsersDeleteOverlay" className="login-overlay" hidden={!allUsersDelete.open} onClick={closeAllUsersDeleteModal} />

      <section id="clientsDeleteModal" className="logout-confirm-modal" hidden={!clientsDelete.open}>
        <h3>Are you sure you want to delete this client?</h3>
        <p className="all-users-state" hidden={!clientsDelete.label}>
          {clientsDelete.label}
        </p>
        <p id="clientsDeleteError" className="field-error">{clientsDelete.error}</p>
        <div className="logout-confirm-actions">
          <button
            id="clientsDeleteYesBtn"
            type="button"
            className="header-btn logout-confirm-yes"
            disabled={clientsDelete.submitting}
            onClick={handleClientsDeleteConfirm}
          >
            Yes
          </button>
          <button
            id="clientsDeleteNoBtn"
            type="button"
            className="header-btn"
            disabled={clientsDelete.submitting}
            onClick={closeClientsDeleteModal}
          >
            No
          </button>
        </div>
      </section>
      <div id="clientsDeleteOverlay" className="login-overlay" hidden={!clientsDelete.open} onClick={closeClientsDeleteModal} />

      <section id="settingsDeleteModal" className="logout-confirm-modal" hidden={!settingsDelete.open}>
        <h3>
          {`Are you sure you want to delete this ${settingsDelete.type || "item"}?`}
        </h3>
        <p className="all-users-state" hidden={!settingsDelete.label}>
          {settingsDelete.label}
        </p>
        <p id="settingsDeleteError" className="field-error">{settingsDelete.error}</p>
        <div className="logout-confirm-actions">
          <button
            id="settingsDeleteYesBtn"
            type="button"
            className="header-btn logout-confirm-yes"
            disabled={settingsDelete.submitting}
            onClick={handleSettingsDeleteConfirm}
          >
            Yes
          </button>
          <button
            id="settingsDeleteNoBtn"
            type="button"
            className="header-btn"
            disabled={settingsDelete.submitting}
            onClick={closeSettingsDeleteModal}
          >
            No
          </button>
        </div>
      </section>
      <div id="settingsDeleteOverlay" className="login-overlay" hidden={!settingsDelete.open} onClick={closeSettingsDeleteModal} />

      <section id="organizationEditModal" className="logout-confirm-modal settings-edit-modal" hidden={!organizationEditOpen}>
        <h3>Edit Organization</h3>
        <form
          className="auth-form settings-edit-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleOrganizationEditSave();
          }}
        >
          <div className="field">
            <label htmlFor="organizationEditCodeInput">Code</label>
            <input
              id="organizationEditCodeInput"
              type="text"
              value={organizationEditForm.code}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setOrganizationEditForm((prev) => ({ ...prev, code: nextValue }));
                if (organizationEditError) {
                  setOrganizationEditError("");
                }
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="organizationEditNameInput">Name</label>
            <input
              id="organizationEditNameInput"
              type="text"
              value={organizationEditForm.name}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setOrganizationEditForm((prev) => ({ ...prev, name: nextValue }));
                if (organizationEditError) {
                  setOrganizationEditError("");
                }
              }}
            />
          </div>
          <div className="field settings-inline-control">
            <label htmlFor="organizationEditIsActiveInput">Active</label>
            <label className="settings-checkbox settings-checkbox-inline" htmlFor="organizationEditIsActiveInput">
              <input
                id="organizationEditIsActiveInput"
                type="checkbox"
                checked={Boolean(organizationEditForm.isActive)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setOrganizationEditForm((prev) => ({ ...prev, isActive: checked }));
                }}
              />
            </label>
          </div>
          <small className="field-error settings-error">{organizationEditError}</small>
          <div className="edit-actions">
            <button className="btn" type="submit" disabled={organizationEditSubmitting}>Save</button>
            <button className="header-btn" type="button" onClick={cancelOrganizationEdit}>Cancel</button>
          </div>
        </form>
      </section>
      <div className="login-overlay" hidden={!organizationEditOpen} onClick={cancelOrganizationEdit} />

      <section id="roleEditModal" className="logout-confirm-modal settings-edit-modal" hidden={!roleEditOpen}>
        <h3>Edit Permissions</h3>
        <form
          className="auth-form settings-edit-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleRoleEditSave();
          }}
        >
          <div className="role-edit-top-row">
            <div className="field">
              <label htmlFor="roleEditLabelInput">Label</label>
              <input
                id="roleEditLabelInput"
                type="text"
                value={roleEditForm.label}
                onInput={(event) => {
                  const nextValue = event.currentTarget.value;
                  setRoleEditForm((prev) => ({ ...prev, label: nextValue }));
                  if (roleEditError) {
                    setRoleEditError("");
                  }
                }}
              />
            </div>
            <div className="field settings-inline-control role-edit-active-field">
              <label htmlFor="roleEditIsActiveInput">Active</label>
              <label className="settings-checkbox settings-checkbox-inline" htmlFor="roleEditIsActiveInput">
                <input
                  id="roleEditIsActiveInput"
                  type="checkbox"
                  checked={Boolean(roleEditForm.isActive)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setRoleEditForm((prev) => ({ ...prev, isActive: checked }));
                  }}
                />
              </label>
            </div>
          </div>
          <div
            className="settings-permissions-section"
            hidden={groupedRolePermissionOptions.length === 0}
          >
            <p className="settings-permissions-title">Permissions</p>
            <div className="settings-permission-groups">
              {groupedRolePermissionOptions.map((group) => (
                <section key={group.key} className="settings-permission-group">
                  <p className="settings-permission-group-title">{group.label}</p>
                  <div className="settings-permissions-grid settings-permissions-grid-group">
                    {group.permissions.map((permission) => {
                      const inputId = `roleEditPermission_${permission.code.replace(/[^a-z0-9_-]/g, "_")}`;
                      return (
                        <label key={permission.code} className="settings-permission-item" htmlFor={inputId}>
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={roleEditForm.permissionCodes.includes(permission.code)}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              setRoleEditForm((prev) => ({
                                ...prev,
                                permissionCodes: togglePermissionCode(prev.permissionCodes, permission.code, checked)
                              }));
                            }}
                          />
                          <span>{permission.actionLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <p className="all-users-state" hidden={groupedRolePermissionOptions.length > 0}>
            No permissions found.
          </p>
          <small className="field-error settings-error">{roleEditError}</small>
          <div className="edit-actions">
            <button className="btn" type="submit" disabled={roleEditSubmitting}>Save</button>
            <button className="header-btn" type="button" onClick={cancelRoleEdit}>Cancel</button>
          </div>
        </form>
      </section>
      <div className="login-overlay" hidden={!roleEditOpen} onClick={cancelRoleEdit} />

      <section id="positionEditModal" className="logout-confirm-modal settings-edit-modal" hidden={!positionEditOpen}>
        <h3>Edit Position</h3>
        <form
          className="auth-form settings-edit-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handlePositionEditSave();
          }}
        >
          <div className="field">
            <label htmlFor="positionEditLabelInput">Label</label>
            <input
              id="positionEditLabelInput"
              type="text"
              value={positionEditForm.label}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                  setPositionEditForm((prev) => ({ ...prev, label: nextValue }));
                  if (positionEditError) {
                    setPositionEditError("");
                  }
                }}
              />
            </div>
          <div className="field settings-inline-control">
            <label htmlFor="positionEditIsActiveInput">Active</label>
            <label className="settings-checkbox settings-checkbox-inline" htmlFor="positionEditIsActiveInput">
              <input
                id="positionEditIsActiveInput"
                type="checkbox"
                checked={Boolean(positionEditForm.isActive)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setPositionEditForm((prev) => ({ ...prev, isActive: checked }));
                }}
              />
            </label>
          </div>
          <small className="field-error settings-error">{positionEditError}</small>
          <div className="edit-actions">
            <button className="btn" type="submit" disabled={positionEditSubmitting}>Save</button>
            <button className="header-btn" type="button" onClick={cancelPositionEdit}>Cancel</button>
          </div>
        </form>
      </section>
      <div className="login-overlay" hidden={!positionEditOpen} onClick={cancelPositionEdit} />
    </>
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(modalContent, document.body);
}

export default ProfileModals;
