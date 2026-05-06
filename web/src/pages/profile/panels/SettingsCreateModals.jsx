import { createPortal } from "react-dom";
import RolePermissionsAccordion from "../RolePermissionsAccordion.jsx";

function SettingsCreateModals({
  organizationCreateModalOpen,
  setOrganizationCreateModalOpen,
  closeOrganizationCreateModal,
  organizationCreateForm,
  organizationCreateError,
  organizationCreateSubmitting,
  setOrganizationCreateForm,
  setOrganizationCreateError,
  handleOrganizationCreateSubmit,
  roleCreateModalOpen,
  setRoleCreateModalOpen,
  closeRoleCreateModal,
  rolePermissionTree,
  roleCreateForm,
  roleCreateError,
  roleCreateSubmitting,
  setRoleCreateForm,
  setRoleCreateError,
  handleRoleCreateSubmit,
  positionCreateModalOpen,
  setPositionCreateModalOpen,
  closePositionCreateModal,
  positionCreateForm,
  positionCreateError,
  positionCreateSubmitting,
  setPositionCreateForm,
  setPositionCreateError,
  handlePositionCreateSubmit
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const organizationCreateModalLayer = (
    <>
      <section
        id="organizationCreateModal"
        className="logout-confirm-modal settings-edit-modal"
        hidden={!organizationCreateModalOpen}
      >
        <div className="all-users-head">
          <h3>Add Organization</h3>
          <button
            id="closeOrganizationCreateModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close create organization modal"
            onClick={closeOrganizationCreateModal}
          >
            ×
          </button>
        </div>
        <form
          className="auth-form settings-edit-form"
          noValidate
          onSubmit={async (event) => {
            const isCreated = await handleOrganizationCreateSubmit(event);
            if (isCreated) {
              setOrganizationCreateModalOpen(false);
            }
          }}
        >
          <div>
            <div className="field">
              <label htmlFor="organizationCreateModalCodeInput">Code</label>
              <input
                id="organizationCreateModalCodeInput"
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
              <label htmlFor="organizationCreateModalNameInput">Name</label>
              <input
                id="organizationCreateModalNameInput"
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
              <label htmlFor="organizationCreateModalIsActiveInput">Active</label>
              <label className="settings-checkbox settings-checkbox-inline" htmlFor="organizationCreateModalIsActiveInput">
                <input
                  id="organizationCreateModalIsActiveInput"
                  type="checkbox"
                  checked={Boolean(organizationCreateForm.isActive)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setOrganizationCreateForm((prev) => ({ ...prev, isActive: checked }));
                  }}
                />
              </label>
            </div>
          </div>
          <div className="edit-actions">
            <button className="btn" type="submit" disabled={organizationCreateSubmitting}>
              {organizationCreateSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div className="login-overlay" hidden={!organizationCreateModalOpen} onClick={closeOrganizationCreateModal} />
    </>
  );

  const roleCreateModalLayer = (
    <>
      <section
        id="roleCreateModal"
        className="logout-confirm-modal settings-edit-modal"
        hidden={!roleCreateModalOpen}
      >
        <div className="all-users-head">
          <h3>Add Role</h3>
          <button
            id="closeRoleCreateModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close create role modal"
            onClick={closeRoleCreateModal}
          >
            ×
          </button>
        </div>
        <form
          className="auth-form settings-edit-form"
          noValidate
          onSubmit={async (event) => {
            const isCreated = await handleRoleCreateSubmit(event);
            if (isCreated) {
              setRoleCreateModalOpen(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="roleCreateModalLabelInput">Label</label>
            <input
              id="roleCreateModalLabelInput"
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
          <div className="field settings-inline-control">
            <label htmlFor="roleCreateModalIsActiveInput">Active</label>
            <label className="settings-checkbox settings-checkbox-inline" htmlFor="roleCreateModalIsActiveInput">
              <input
                id="roleCreateModalIsActiveInput"
                type="checkbox"
                checked={Boolean(roleCreateForm.isActive)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setRoleCreateForm((prev) => ({ ...prev, isActive: checked }));
                }}
              />
            </label>
          </div>
          <RolePermissionsAccordion
            tree={rolePermissionTree}
            selectedCodes={roleCreateForm.permissionCodes}
            open={roleCreateModalOpen}
            idPrefix="roleCreatePermission"
            onChange={(updater) => {
              setRoleCreateForm((prev) => ({
                ...prev,
                permissionCodes: typeof updater === "function"
                  ? updater(prev.permissionCodes)
                  : updater
              }));
              if (roleCreateError) {
                setRoleCreateError("");
              }
            }}
          />
          <div className="edit-actions">
            <button className="btn" type="submit" disabled={roleCreateSubmitting}>
              {roleCreateSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div className="login-overlay" hidden={!roleCreateModalOpen} onClick={closeRoleCreateModal} />
    </>
  );

  const positionCreateModalLayer = (
    <>
      <section
        id="positionCreateModal"
        className="logout-confirm-modal settings-edit-modal"
        hidden={!positionCreateModalOpen}
      >
        <div className="all-users-head">
          <h3>Add Position</h3>
          <button
            id="closePositionCreateModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close create position modal"
            onClick={closePositionCreateModal}
          >
            ×
          </button>
        </div>
        <form
          className="auth-form settings-edit-form"
          noValidate
          onSubmit={async (event) => {
            const isCreated = await handlePositionCreateSubmit(event);
            if (isCreated) {
              setPositionCreateModalOpen(false);
            }
          }}
        >
          <div className="field">
            <label htmlFor="positionCreateModalLabelInput">Label</label>
            <input
              id="positionCreateModalLabelInput"
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
          <div className="field settings-inline-control">
            <label htmlFor="positionCreateModalIsActiveInput">Active</label>
            <label className="settings-checkbox settings-checkbox-inline" htmlFor="positionCreateModalIsActiveInput">
              <input
                id="positionCreateModalIsActiveInput"
                type="checkbox"
                checked={Boolean(positionCreateForm.isActive)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setPositionCreateForm((prev) => ({ ...prev, isActive: checked }));
                }}
              />
            </label>
          </div>
          <div className="edit-actions">
            <button className="btn" type="submit" disabled={positionCreateSubmitting}>
              {positionCreateSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div className="login-overlay" hidden={!positionCreateModalOpen} onClick={closePositionCreateModal} />
    </>
  );

  return (
    <>
      {createPortal(organizationCreateModalLayer, document.body)}
      {createPortal(roleCreateModalLayer, document.body)}
      {createPortal(positionCreateModalLayer, document.body)}
    </>
  );
}

export default SettingsCreateModals;
