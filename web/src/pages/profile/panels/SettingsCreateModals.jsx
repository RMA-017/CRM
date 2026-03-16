import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import RolePermissionsAccordion from "../RolePermissionsAccordion.jsx";
import { ALL_ORG_FEATURE_KEYS, ORG_FEATURE_TREE } from "../profile.constants.js";

function SettingsCreateModals({
  organizationCreateModalOpen,
  setOrganizationCreateModalOpen,
  closeOrganizationCreateModal,
  orgCreateTab,
  setOrgCreateTab,
  organizationCreateForm,
  organizationCreateError,
  organizationCreateSubmitting,
  setOrganizationCreateForm,
  setOrganizationCreateError,
  handleOrganizationCreateSubmit,
  expandedCreateFeatures,
  setExpandedCreateFeatures,
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
  handlePositionCreateSubmit,
  normCreateModalOpen,
  closeNormCreateModal,
  normCreateForm,
  normCreateError,
  normCreateSubmitting,
  setNormCreateForm,
  setNormCreateError,
  handleNormCreateSubmit,
  positionsSettings
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
        <div className="att-admin-tabs">
          <button
            type="button"
            className={`att-admin-tab-btn${orgCreateTab === "edit" ? " active" : ""}`}
            onClick={() => setOrgCreateTab("edit")}
          >
            Add
          </button>
          <button
            type="button"
            className={`att-admin-tab-btn${orgCreateTab === "features" ? " active" : ""}`}
            onClick={() => setOrgCreateTab("features")}
          >
            Features
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
          <div hidden={orgCreateTab !== "edit"}>
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
          <div className="org-edit-features-tab" hidden={orgCreateTab !== "features"}>
            <div className="settings-permissions-section">
              <div className="settings-permission-groups">
                {ORG_FEATURE_TREE.map(({ key: parentKey, label: parentLabel, children }) => {
                  const childKeys = children.map((child) => child.key);
                  const current = organizationCreateForm.allowedFeatures === null
                    ? [...ALL_ORG_FEATURE_KEYS]
                    : organizationCreateForm.allowedFeatures;
                  const parentChecked = current.includes(parentKey);
                  const isExpanded = expandedCreateFeatures.has(parentKey);
                  const toggleExpand = () =>
                    setExpandedCreateFeatures((prev) => {
                      const next = new Set(prev);
                      if (next.has(parentKey)) {
                        next.delete(parentKey);
                      } else {
                        next.add(parentKey);
                      }
                      return next;
                    });
                  return (
                    <div key={parentKey} className="settings-permission-group">
                      <div className="org-feature-accordion-header">
                        <label className="settings-permission-item" htmlFor={`orgCreateFeatureP_${parentKey}`}>
                          <input
                            id={`orgCreateFeatureP_${parentKey}`}
                            type="checkbox"
                            checked={parentChecked}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              setOrganizationCreateForm((prev) => {
                                const currentFeatures = prev.allowedFeatures === null
                                  ? [...ALL_ORG_FEATURE_KEYS]
                                  : [...prev.allowedFeatures];
                                const next = checked
                                  ? [...new Set([...currentFeatures, parentKey, ...childKeys])]
                                  : currentFeatures.filter((key) => key !== parentKey && !childKeys.includes(key));
                                return {
                                  ...prev,
                                  allowedFeatures: next.length === ALL_ORG_FEATURE_KEYS.length ? null : next
                                };
                              });
                            }}
                          />
                          <strong>{parentLabel}</strong>
                        </label>
                        <button type="button" className="org-feature-accordion-toggle" onClick={toggleExpand}>
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="settings-permissions-grid settings-permissions-grid-group org-feature-accordion-children">
                          {children.map(({ key: childKey, label: childLabel }) => (
                            <label key={childKey} className="settings-permission-item" htmlFor={`orgCreateFeatureC_${childKey}`}>
                              <input
                                id={`orgCreateFeatureC_${childKey}`}
                                type="checkbox"
                                checked={current.includes(childKey)}
                                onChange={(event) => {
                                  const checked = event.currentTarget.checked;
                                  setOrganizationCreateForm((prev) => {
                                    const currentFeatures = prev.allowedFeatures === null
                                      ? [...ALL_ORG_FEATURE_KEYS]
                                      : [...prev.allowedFeatures];
                                    let next;
                                    if (checked) {
                                      next = [...new Set([...currentFeatures, childKey, parentKey])];
                                    } else {
                                      next = currentFeatures.filter((key) => key !== childKey);
                                      const hasAnyChild = childKeys.some((key) => next.includes(key));
                                      if (!hasAnyChild) {
                                        next = next.filter((key) => key !== parentKey);
                                      }
                                    }
                                    return {
                                      ...prev,
                                      allowedFeatures: next.length === ALL_ORG_FEATURE_KEYS.length ? null : next
                                    };
                                  });
                                }}
                              />
                              <span>{childLabel}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="edit-actions">
            <button className="btn" type="submit" disabled={organizationCreateSubmitting}>
              {organizationCreateSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div
        className="login-overlay"
        hidden={!organizationCreateModalOpen}
        onClick={closeOrganizationCreateModal}
      />
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
      <div
        className="login-overlay"
        hidden={!roleCreateModalOpen}
        onClick={closeRoleCreateModal}
      />
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
      <div
        className="login-overlay"
        hidden={!positionCreateModalOpen}
        onClick={closePositionCreateModal}
      />
    </>
  );

  const normCreateModalLayer = (
    <>
      <section
        id="normCreateModal"
        className="logout-confirm-modal settings-edit-modal"
        hidden={!normCreateModalOpen}
      >
        <div className="all-users-head">
          <h3>Add Appointment Norm</h3>
          <button
            id="closeNormCreateModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close create norm modal"
            onClick={closeNormCreateModal}
          >
            ×
          </button>
        </div>
        <form
          className="auth-form settings-edit-form"
          noValidate
          onSubmit={async (event) => {
            const isCreated = await handleNormCreateSubmit(event);
            if (isCreated) {
              closeNormCreateModal();
            }
          }}
        >
          <div className="field">
            <label htmlFor="normCreateModalPositionInput">Position</label>
            <CustomSelect
              id="normCreateModalPositionInput"
              placeholder="Select position"
              value={normCreateForm.positionId}
              menuPortal
              options={(Array.isArray(positionsSettings) ? positionsSettings : []).map((pos) => ({
                value: String(pos?.id || "").trim(),
                label: String(pos?.label || pos?.id || "").trim()
              })).filter((option) => option.value)}
              onChange={(nextValue) => {
                setNormCreateForm((prev) => ({ ...prev, positionId: nextValue }));
                if (normCreateError) {
                  setNormCreateError("");
                }
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="normCreateModalMaxPerWeekInput">Max sessions / week</label>
            <input
              id="normCreateModalMaxPerWeekInput"
              name="maxPerWeek"
              type="number"
              min="1"
              max="100"
              placeholder="2"
              value={normCreateForm.maxPerWeek}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setNormCreateForm((prev) => ({ ...prev, maxPerWeek: nextValue }));
                if (normCreateError) {
                  setNormCreateError("");
                }
              }}
            />
          </div>
          <div className="field settings-inline-control">
            <label htmlFor="normCreateModalIsActiveInput">Active</label>
            <label className="settings-checkbox settings-checkbox-inline" htmlFor="normCreateModalIsActiveInput">
              <input
                id="normCreateModalIsActiveInput"
                type="checkbox"
                checked={Boolean(normCreateForm.isActive)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setNormCreateForm((prev) => ({ ...prev, isActive: checked }));
                }}
              />
            </label>
          </div>
          {normCreateError ? (
            <p className="auth-error" role="alert">{normCreateError}</p>
          ) : null}
          <div className="edit-actions">
            <button className="btn" type="submit" disabled={normCreateSubmitting}>
              {normCreateSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div
        className="login-overlay"
        hidden={!normCreateModalOpen}
        onClick={closeNormCreateModal}
      />
    </>
  );

  return (
    <>
      {createPortal(organizationCreateModalLayer, document.body)}
      {createPortal(roleCreateModalLayer, document.body)}
      {createPortal(positionCreateModalLayer, document.body)}
      {createPortal(normCreateModalLayer, document.body)}
    </>
  );
}

export default SettingsCreateModals;
