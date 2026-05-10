import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../components/CustomSelect.jsx";
import { formatDateYMD } from "../../lib/formatters.js";
import RolePermissionsAccordion from "./RolePermissionsAccordion.jsx";

function ProfileModals(props) {
  const maxBirthdayYmd = new Date().toISOString().slice(0, 10);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const photoWrapRef = useRef(null);

  useEffect(() => {
    if (!showPhotoMenu) return;
    function handleClick(e) {
      if (photoWrapRef.current && !photoWrapRef.current.contains(e.target)) {
        setShowPhotoMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPhotoMenu]);

  const {
    myProfileModalOpen,
    closeMyProfilePanel,
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
    rolePermissionTree,
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

  useEffect(() => {
    const message = String(organizationEditError || "").trim();
    if (!message) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
    setOrganizationEditError("");
  }, [organizationEditError, setOrganizationEditError]);

  useEffect(() => {
    const message = String(roleEditError || "").trim();
    if (!message) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
    setRoleEditError("");
  }, [roleEditError, setRoleEditError]);

  useEffect(() => {
    const message = String(positionEditError || "").trim();
    if (!message) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
    setPositionEditError("");
  }, [positionEditError, setPositionEditError]);

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

        <div className="profile-photo-wrap" ref={photoWrapRef}>
          <div
            className="profile-modal-photo"
            id="myProfilePhoto"
            role="button"
            tabIndex={0}
            aria-label="Photo options"
            onClick={() => setShowPhotoMenu((prev) => !prev)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setShowPhotoMenu((prev) => !prev);
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

          {showPhotoMenu && (
            <div className="profile-photo-menu">
              <button
                type="button"
                className="profile-photo-menu-btn"
                onClick={() => { openAvatarPicker(); setShowPhotoMenu(false); }}
              >
                Upload Photo
              </button>
            </div>
          )}

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

      {allUsersEdit.open ? (
        <>
          <section id="allUsersEditModal" className="logout-confirm-modal all-users-edit-modal" hidden={!allUsersEdit.open}>
        <h3>Edit User</h3>
        <form id="allUsersEditForm" className="auth-form" noValidate onSubmit={handleAllUsersEditSubmit}>
          <div className="all-users-edit-fields">
            <div className="field">
              <label htmlFor="allUsersEditOrganizationSelect">Organisation</label>
              <CustomSelect
                id="allUsersEditOrganizationSelect"
                placeholder="Select organisation"
                value={allUsersEdit.form.organizationCode}
                options={createOrganizationOptions}
                error={Boolean(allUsersEdit.errors.organizationCode)}
                menuPortal
                maxVisibleOptions={6}
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
                menuPortal
                maxVisibleOptions={6}
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
                menuPortal
                maxVisibleOptions={6}
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

          {allUsersEdit.errors._form && (
            <small className="field-error">{allUsersEdit.errors._form}</small>
          )}
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
        </>
      ) : null}

      {clientsEditOpen ? (
        <>
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
                      setClientEditForm((prev) => ({ ...prev, isVip: event.currentTarget.checked }));
                    }}
                  />
                </label>
                <small className="field-error" />
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
        </>
      ) : null}

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

      {organizationEditOpen ? (
        <>
          <section id="organizationEditModal" className="logout-confirm-modal settings-edit-modal" hidden={!organizationEditOpen}>
        <div className="all-users-head">
          <h3>Edit Organization</h3>
          <button
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close edit organization modal"
            onClick={cancelOrganizationEdit}
          >
            ×
          </button>
        </div>
        <form
          className="auth-form settings-edit-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleOrganizationEditSave();
          }}
        >
          <div>
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
          </div>
          <div className="edit-actions">
            <button className="btn" type="submit" disabled={organizationEditSubmitting}>
              {organizationEditSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
          </section>
          <div className="login-overlay" hidden={!organizationEditOpen} onClick={cancelOrganizationEdit} />
        </>
      ) : null}

      {roleEditOpen ? (
        <>
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
          <RolePermissionsAccordion
            tree={rolePermissionTree}
            selectedCodes={roleEditForm.permissionCodes}
            open={roleEditOpen}
            idPrefix="roleEditPermission"
            onChange={(updater) => {
              setRoleEditForm((prev) => ({
                ...prev,
                permissionCodes: typeof updater === "function"
                  ? updater(prev.permissionCodes)
                  : updater
              }));
            }}
          />
          <div className="edit-actions">
            <button className="btn" type="submit" disabled={roleEditSubmitting}>Save</button>
            <button className="header-btn" type="button" onClick={cancelRoleEdit}>Cancel</button>
          </div>
        </form>
          </section>
          <div className="login-overlay" hidden={!roleEditOpen} onClick={cancelRoleEdit} />
        </>
      ) : null}

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

  return (
    <>
      {createPortal(modalContent, document.body)}
    </>
  );
}

export default memo(ProfileModals);
