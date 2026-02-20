import CustomSelect from "../../components/CustomSelect.jsx";
import { formatDateYMD } from "../../lib/formatters.js";
import { togglePermissionCode } from "./profile.helpers.js";

function ProfileModals(props) {
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
    organizationsLoading,
    createOrganizationOptions,
    setAllUsersEdit,
    roleOptions,
    closeAllUsersEditModal,
    allUsersDelete,
    handleAllUsersDelete,
    closeAllUsersDeleteModal,
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
    roleEditTab,
    setRoleEditTab,
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

  return (
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
            Edit Profile
          </button>
          <button id="openPasswordEditBtn" className="header-btn" type="button" onClick={openPasswordEditModal}>
            Change Password
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
                  className={profileEdit.error ? "input-error" : ""}
                  value={profileEdit.currentPassword}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({ ...prev, currentPassword: nextValue, error: "" }));
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
                  className={profileEdit.error ? "input-error" : ""}
                  value={profileEdit.newPassword}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({ ...prev, newPassword: nextValue, error: "" }));
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
                  placeholder="example@mail.com"
                  className={profileEdit.error ? "input-error" : ""}
                  value={profileEdit.form.email}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({
                      ...prev,
                      form: { ...prev.form, email: nextValue },
                      error: ""
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
                  className={profileEdit.error ? "input-error" : ""}
                  value={profileEdit.form.fullName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({
                      ...prev,
                      form: { ...prev.form, fullName: nextValue },
                      error: ""
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
                  autoComplete="bday"
                  className={profileEdit.error ? "input-error" : ""}
                  value={profileEdit.form.birthday}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({
                      ...prev,
                      form: { ...prev.form, birthday: nextValue },
                      error: ""
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
                  placeholder="+998..."
                  className={profileEdit.error ? "input-error" : ""}
                  value={profileEdit.form.phone}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setProfileEdit((prev) => ({
                      ...prev,
                      form: { ...prev.form, phone: nextValue },
                      error: ""
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
                  error={Boolean(profileEdit.error)}
                  onChange={(nextPosition) => {
                    setProfileEdit((prev) => ({
                      ...prev,
                      form: { ...prev.form, position: nextPosition },
                      error: ""
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
              placeholder="+998954550033"
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
        <form
          className="auth-form settings-edit-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleRoleEditSave();
          }}
        >
          <div className="settings-edit-tabs">
            <button
              type="button"
              className={`header-btn settings-edit-tab-btn${roleEditTab === "edit" ? " is-active" : ""}`}
              onClick={() => setRoleEditTab("edit")}
            >
              Edit role
            </button>
            <button
              type="button"
              className={`header-btn settings-edit-tab-btn${roleEditTab === "permissions" ? " is-active" : ""}`}
              onClick={() => setRoleEditTab("permissions")}
            >
              Permissions
            </button>
          </div>
          <div
            className="settings-permissions-section"
            hidden={roleEditTab !== "permissions" || groupedRolePermissionOptions.length === 0}
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
          <div className="field" hidden={roleEditTab !== "edit"}>
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
          <div className="field" hidden={roleEditTab !== "edit"}>
            <label htmlFor="roleEditSortInput">Sort</label>
            <input
              id="roleEditSortInput"
              type="number"
              value={roleEditForm.sortOrder}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setRoleEditForm((prev) => ({ ...prev, sortOrder: nextValue }));
              }}
            />
          </div>
          <div className="field settings-inline-control" hidden={roleEditTab !== "edit"}>
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
          <div className="field">
            <label htmlFor="positionEditSortInput">Sort</label>
            <input
              id="positionEditSortInput"
              type="number"
              value={positionEditForm.sortOrder}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setPositionEditForm((prev) => ({ ...prev, sortOrder: nextValue }));
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
}

export default ProfileModals;
