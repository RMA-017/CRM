import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import {
  createEmptySettingsDeleteState,
  EMPTY_ORGANIZATION_FORM,
  EMPTY_ROLE_CREATE_FORM,
  EMPTY_ROLE_EDIT_FORM,
  EMPTY_SETTINGS_OPTION_FORM,
  ORGANIZATION_CODE_REGEX
} from "./profile.constants.js";
import {
  groupRolePermissionOptions,
  handleProtectedStatus,
  mapValueLabelOptions,
  normalizePermissionCodesInput,
  normalizeSettingsSortOrderInput
} from "./profile.helpers.js";

export function useSettingsSection({
  hasSettingsMenuAccess,
  navigate,
  loadUserOptions
}) {
  const [settingsDelete, setSettingsDelete] = useState(createEmptySettingsDeleteState);

  const [organizations, setOrganizations] = useState([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsMessage, setOrganizationsMessage] = useState("");
  const [organizationCreateForm, setOrganizationCreateForm] = useState({ ...EMPTY_ORGANIZATION_FORM });
  const [organizationCreateError, setOrganizationCreateError] = useState("");
  const [organizationCreateSubmitting, setOrganizationCreateSubmitting] = useState(false);
  const [organizationEditId, setOrganizationEditId] = useState("");
  const [organizationEditOpen, setOrganizationEditOpen] = useState(false);
  const [organizationEditForm, setOrganizationEditForm] = useState({ ...EMPTY_ORGANIZATION_FORM });
  const [organizationEditError, setOrganizationEditError] = useState("");
  const [organizationEditSubmitting, setOrganizationEditSubmitting] = useState(false);
  const [organizationDeletingId, setOrganizationDeletingId] = useState("");

  const [rolesSettings, setRolesSettings] = useState([]);
  const [rolesSettingsLoading, setRolesSettingsLoading] = useState(false);
  const [rolesSettingsMessage, setRolesSettingsMessage] = useState("");
  const [rolePermissionOptions, setRolePermissionOptions] = useState([]);
  const [roleCreateForm, setRoleCreateForm] = useState({ ...EMPTY_ROLE_CREATE_FORM });
  const [roleCreateError, setRoleCreateError] = useState("");
  const [roleCreateSubmitting, setRoleCreateSubmitting] = useState(false);
  const [roleEditId, setRoleEditId] = useState("");
  const [roleEditOpen, setRoleEditOpen] = useState(false);
  const [roleEditForm, setRoleEditForm] = useState({ ...EMPTY_ROLE_EDIT_FORM });
  const [roleEditError, setRoleEditError] = useState("");
  const [roleEditSubmitting, setRoleEditSubmitting] = useState(false);
  const [roleDeletingId, setRoleDeletingId] = useState("");

  const [positionsSettings, setPositionsSettings] = useState([]);
  const [positionsSettingsLoading, setPositionsSettingsLoading] = useState(false);
  const [positionsSettingsMessage, setPositionsSettingsMessage] = useState("");
  const [positionCreateForm, setPositionCreateForm] = useState({ ...EMPTY_SETTINGS_OPTION_FORM });
  const [positionCreateError, setPositionCreateError] = useState("");
  const [positionCreateSubmitting, setPositionCreateSubmitting] = useState(false);
  const [positionEditId, setPositionEditId] = useState("");
  const [positionEditOpen, setPositionEditOpen] = useState(false);
  const [positionEditForm, setPositionEditForm] = useState({ ...EMPTY_SETTINGS_OPTION_FORM });
  const [positionEditError, setPositionEditError] = useState("");
  const [positionEditSubmitting, setPositionEditSubmitting] = useState(false);
  const [positionDeletingId, setPositionDeletingId] = useState("");

  const groupedRolePermissionOptions = useMemo(
    () => groupRolePermissionOptions(rolePermissionOptions),
    [rolePermissionOptions]
  );

  const closeSettingsDeleteModal = useCallback(() => {
    setSettingsDelete(createEmptySettingsDeleteState());
  }, []);

  const loadOrganizations = useCallback(async () => {
    if (!hasSettingsMenuAccess) {
      navigate("/404", { replace: true });
      return;
    }

    setOrganizationsLoading(true);
    setOrganizationsMessage("Loading organizations...");

    try {
      const response = await apiFetch("/api/settings/organizations", {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setOrganizations([]);
        setOrganizationsMessage(data?.message || "Failed to load organizations.");
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      setOrganizations(items);
      setOrganizationsMessage(items.length === 0 ? "No organizations found." : "");
    } catch {
      setOrganizations([]);
      setOrganizationsMessage("Unexpected error. Please try again.");
    } finally {
      setOrganizationsLoading(false);
    }
  }, [hasSettingsMenuAccess, navigate]);

  const loadRolesSettings = useCallback(async () => {
    if (!hasSettingsMenuAccess) {
      navigate("/404", { replace: true });
      return;
    }

    setRolesSettingsLoading(true);
    setRolesSettingsMessage("Loading roles...");

    try {
      const response = await apiFetch("/api/settings/roles", {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setRolesSettings([]);
        setRolePermissionOptions([]);
        setRolesSettingsMessage(data?.message || "Failed to load roles.");
        return;
      }

      const items = Array.isArray(data?.items)
        ? data.items.map((item) => ({
            ...item,
            permissionCodes: normalizePermissionCodesInput(item?.permissionCodes)
          }))
        : [];
      const permissions = mapValueLabelOptions(
        data?.permissions,
        (permission) => String(permission?.code || permission?.value || "").toLowerCase(),
        (permission) => permission?.label
      );

      setRolePermissionOptions(permissions);
      setRolesSettings(items);
      setRolesSettingsMessage(items.length === 0 ? "No roles found." : "");
    } catch {
      setRolesSettings([]);
      setRolePermissionOptions([]);
      setRolesSettingsMessage("Unexpected error. Please try again.");
    } finally {
      setRolesSettingsLoading(false);
    }
  }, [hasSettingsMenuAccess, navigate]);

  const loadPositionsSettings = useCallback(async () => {
    if (!hasSettingsMenuAccess) {
      navigate("/404", { replace: true });
      return;
    }

    setPositionsSettingsLoading(true);
    setPositionsSettingsMessage("Loading positions...");

    try {
      const response = await apiFetch("/api/settings/positions", {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setPositionsSettings([]);
        setPositionsSettingsMessage(data?.message || "Failed to load positions.");
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      setPositionsSettings(items);
      setPositionsSettingsMessage(items.length === 0 ? "No positions found." : "");
    } catch {
      setPositionsSettings([]);
      setPositionsSettingsMessage("Unexpected error. Please try again.");
    } finally {
      setPositionsSettingsLoading(false);
    }
  }, [hasSettingsMenuAccess, navigate]);

  const validateOrganizationForm = useCallback((form) => {
    const code = String(form?.code || "").trim().toLowerCase();
    const name = String(form?.name || "").trim();

    if (!ORGANIZATION_CODE_REGEX.test(code)) {
      return "Code must be 2-64 chars and contain lowercase letters, numbers, ., _, -";
    }
    if (!name) {
      return "Name is required.";
    }
    return "";
  }, []);

  const validateRoleSettingsForm = useCallback((form) => {
    const label = String(form?.label || "").trim();
    if (!label) {
      return "Label is required.";
    }
    return "";
  }, []);

  const validatePositionSettingsForm = useCallback((form) => {
    const label = String(form?.label || "").trim();
    if (!label) {
      return "Label is required.";
    }
    return "";
  }, []);

  const handleOrganizationCreateSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!hasSettingsMenuAccess) {
      setOrganizationCreateError("You do not have permission to manage settings.");
      return;
    }

    const payload = {
      code: String(organizationCreateForm.code || "").trim().toLowerCase(),
      name: String(organizationCreateForm.name || "").trim(),
      isActive: Boolean(organizationCreateForm.isActive)
    };
    const validationError = validateOrganizationForm(payload);
    if (validationError) {
      setOrganizationCreateError(validationError);
      return;
    }

    try {
      setOrganizationCreateSubmitting(true);
      setOrganizationCreateError("");
      const response = await apiFetch("/api/settings/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setOrganizationCreateError(data?.message || "Failed to create organization.");
        return;
      }

      setOrganizationCreateForm({ ...EMPTY_ORGANIZATION_FORM });
      await loadOrganizations();
    } catch {
      setOrganizationCreateError("Unexpected error. Please try again.");
    } finally {
      setOrganizationCreateSubmitting(false);
    }
  }, [
    hasSettingsMenuAccess,
    loadOrganizations,
    navigate,
    organizationCreateForm.code,
    organizationCreateForm.isActive,
    organizationCreateForm.name,
    validateOrganizationForm
  ]);

  const startOrganizationEdit = useCallback((item) => {
    setOrganizationEditId(String(item?.id || ""));
    setOrganizationEditForm({
      code: String(item?.code || ""),
      name: String(item?.name || ""),
      isActive: Boolean(item?.isActive)
    });
    setOrganizationEditError("");
    setOrganizationEditOpen(true);
  }, []);

  const cancelOrganizationEdit = useCallback(() => {
    setOrganizationEditOpen(false);
    setOrganizationEditId("");
    setOrganizationEditForm({ ...EMPTY_ORGANIZATION_FORM });
    setOrganizationEditError("");
    setOrganizationEditSubmitting(false);
  }, []);

  const handleOrganizationEditSave = useCallback(async () => {
    const id = String(organizationEditId || "").trim();
    if (!id) {
      return;
    }

    const payload = {
      code: String(organizationEditForm.code || "").trim().toLowerCase(),
      name: String(organizationEditForm.name || "").trim(),
      isActive: Boolean(organizationEditForm.isActive)
    };
    const validationError = validateOrganizationForm(payload);
    if (validationError) {
      setOrganizationEditError(validationError);
      return;
    }

    try {
      setOrganizationEditSubmitting(true);
      setOrganizationEditError("");
      const response = await apiFetch(`/api/settings/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setOrganizationEditError(data?.message || "Failed to update organization.");
        return;
      }

      cancelOrganizationEdit();
      await loadOrganizations();
    } catch {
      setOrganizationEditError("Unexpected error. Please try again.");
    } finally {
      setOrganizationEditSubmitting(false);
    }
  }, [
    cancelOrganizationEdit,
    loadOrganizations,
    navigate,
    organizationEditForm.code,
    organizationEditForm.isActive,
    organizationEditForm.name,
    organizationEditId,
    validateOrganizationForm
  ]);

  const openSettingsDelete = useCallback((type, id, label = "") => {
    const rowId = String(id || "").trim();
    if (!rowId) {
      return;
    }
    setSettingsDelete({
      open: true,
      type,
      id: rowId,
      label: String(label || rowId),
      error: "",
      submitting: false
    });
  }, []);

  const handleOrganizationDelete = useCallback((id, label = "") => {
    openSettingsDelete("organization", id, label);
  }, [openSettingsDelete]);

  const handleRoleCreateSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!hasSettingsMenuAccess) {
      setRoleCreateError("You do not have permission to manage settings.");
      return;
    }

    const payload = {
      label: String(roleCreateForm.label || "").trim(),
      sortOrder: normalizeSettingsSortOrderInput(roleCreateForm.sortOrder),
      isActive: Boolean(roleCreateForm.isActive)
    };
    const validationError = validateRoleSettingsForm(payload);
    if (validationError) {
      setRoleCreateError(validationError);
      return;
    }

    try {
      setRoleCreateSubmitting(true);
      setRoleCreateError("");
      const response = await apiFetch("/api/settings/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setRoleCreateError(data?.message || "Failed to create role.");
        return;
      }

      setRoleCreateForm({ ...EMPTY_ROLE_CREATE_FORM });
      await Promise.all([loadRolesSettings(), loadUserOptions()]);
    } catch {
      setRoleCreateError("Unexpected error. Please try again.");
    } finally {
      setRoleCreateSubmitting(false);
    }
  }, [
    hasSettingsMenuAccess,
    loadRolesSettings,
    loadUserOptions,
    navigate,
    roleCreateForm.isActive,
    roleCreateForm.label,
    roleCreateForm.sortOrder,
    validateRoleSettingsForm
  ]);

  const startRoleEdit = useCallback((item) => {
    setRoleEditId(String(item?.id || ""));
    setRoleEditForm({
      label: String(item?.label || ""),
      sortOrder: String(item?.sortOrder ?? "0"),
      isActive: Boolean(item?.isActive),
      permissionCodes: normalizePermissionCodesInput(item?.permissionCodes)
    });
    setRoleEditError("");
    setRoleEditOpen(true);
  }, []);

  const cancelRoleEdit = useCallback(() => {
    setRoleEditOpen(false);
    setRoleEditId("");
    setRoleEditForm({ ...EMPTY_ROLE_EDIT_FORM });
    setRoleEditError("");
    setRoleEditSubmitting(false);
  }, []);

  const handleRoleEditSave = useCallback(async () => {
    const id = String(roleEditId || "").trim();
    if (!id) {
      return;
    }

    const payload = {
      label: String(roleEditForm.label || "").trim(),
      sortOrder: normalizeSettingsSortOrderInput(roleEditForm.sortOrder),
      isActive: Boolean(roleEditForm.isActive),
      permissionCodes: normalizePermissionCodesInput(roleEditForm.permissionCodes)
    };
    const validationError = validateRoleSettingsForm(payload);
    if (validationError) {
      setRoleEditError(validationError);
      return;
    }

    try {
      setRoleEditSubmitting(true);
      setRoleEditError("");
      const response = await apiFetch(`/api/settings/roles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setRoleEditError(data?.message || "Failed to update role.");
        return;
      }

      cancelRoleEdit();
      await Promise.all([loadRolesSettings(), loadUserOptions()]);
    } catch {
      setRoleEditError("Unexpected error. Please try again.");
    } finally {
      setRoleEditSubmitting(false);
    }
  }, [
    cancelRoleEdit,
    loadRolesSettings,
    loadUserOptions,
    navigate,
    roleEditForm.isActive,
    roleEditForm.label,
    roleEditForm.permissionCodes,
    roleEditForm.sortOrder,
    roleEditId,
    validateRoleSettingsForm
  ]);

  const handleRoleDelete = useCallback((id, label = "") => {
    openSettingsDelete("role", id, label);
  }, [openSettingsDelete]);

  const handlePositionCreateSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!hasSettingsMenuAccess) {
      setPositionCreateError("You do not have permission to manage settings.");
      return;
    }

    const payload = {
      label: String(positionCreateForm.label || "").trim(),
      sortOrder: normalizeSettingsSortOrderInput(positionCreateForm.sortOrder),
      isActive: Boolean(positionCreateForm.isActive)
    };
    const validationError = validatePositionSettingsForm(payload);
    if (validationError) {
      setPositionCreateError(validationError);
      return;
    }

    try {
      setPositionCreateSubmitting(true);
      setPositionCreateError("");
      const response = await apiFetch("/api/settings/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setPositionCreateError(data?.message || "Failed to create position.");
        return;
      }

      setPositionCreateForm({ ...EMPTY_SETTINGS_OPTION_FORM });
      await Promise.all([loadPositionsSettings(), loadUserOptions()]);
    } catch {
      setPositionCreateError("Unexpected error. Please try again.");
    } finally {
      setPositionCreateSubmitting(false);
    }
  }, [
    hasSettingsMenuAccess,
    loadPositionsSettings,
    loadUserOptions,
    navigate,
    positionCreateForm.isActive,
    positionCreateForm.label,
    positionCreateForm.sortOrder,
    validatePositionSettingsForm
  ]);

  const startPositionEdit = useCallback((item) => {
    setPositionEditId(String(item?.id || ""));
    setPositionEditForm({
      label: String(item?.label || ""),
      sortOrder: String(item?.sortOrder ?? "0"),
      isActive: Boolean(item?.isActive)
    });
    setPositionEditError("");
    setPositionEditOpen(true);
  }, []);

  const cancelPositionEdit = useCallback(() => {
    setPositionEditOpen(false);
    setPositionEditId("");
    setPositionEditForm({ ...EMPTY_SETTINGS_OPTION_FORM });
    setPositionEditError("");
    setPositionEditSubmitting(false);
  }, []);

  const handlePositionEditSave = useCallback(async () => {
    const id = String(positionEditId || "").trim();
    if (!id) {
      return;
    }

    const payload = {
      label: String(positionEditForm.label || "").trim(),
      sortOrder: normalizeSettingsSortOrderInput(positionEditForm.sortOrder),
      isActive: Boolean(positionEditForm.isActive)
    };
    const validationError = validatePositionSettingsForm(payload);
    if (validationError) {
      setPositionEditError(validationError);
      return;
    }

    try {
      setPositionEditSubmitting(true);
      setPositionEditError("");
      const response = await apiFetch(`/api/settings/positions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setPositionEditError(data?.message || "Failed to update position.");
        return;
      }

      cancelPositionEdit();
      await Promise.all([loadPositionsSettings(), loadUserOptions()]);
    } catch {
      setPositionEditError("Unexpected error. Please try again.");
    } finally {
      setPositionEditSubmitting(false);
    }
  }, [
    cancelPositionEdit,
    loadPositionsSettings,
    loadUserOptions,
    navigate,
    positionEditForm.isActive,
    positionEditForm.label,
    positionEditForm.sortOrder,
    positionEditId,
    validatePositionSettingsForm
  ]);

  const handlePositionDelete = useCallback((id, label = "") => {
    openSettingsDelete("position", id, label);
  }, [openSettingsDelete]);

  const handleSettingsDeleteConfirm = useCallback(async () => {
    const rowId = String(settingsDelete.id || "").trim();
    const deleteType = String(settingsDelete.type || "").trim();

    if (!rowId || !deleteType) {
      return;
    }

    try {
      setSettingsDelete((prev) => ({
        ...prev,
        error: "",
        submitting: true
      }));

      let endpoint = "";
      let fallbackError = "Failed to delete item.";
      if (deleteType === "organization") {
        endpoint = `/api/settings/organizations/${rowId}`;
        fallbackError = "Failed to delete organization.";
        setOrganizationDeletingId(rowId);
      } else if (deleteType === "role") {
        endpoint = `/api/settings/roles/${rowId}`;
        fallbackError = "Failed to delete role.";
        setRoleDeletingId(rowId);
      } else if (deleteType === "position") {
        endpoint = `/api/settings/positions/${rowId}`;
        fallbackError = "Failed to delete position.";
        setPositionDeletingId(rowId);
      } else {
        setSettingsDelete((prev) => ({ ...prev, submitting: false }));
        return;
      }

      const response = await apiFetch(endpoint, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setSettingsDelete((prev) => ({
          ...prev,
          error: data?.message || fallbackError
        }));
        return;
      }

      if (deleteType === "organization") {
        if (organizationEditId === rowId) {
          cancelOrganizationEdit();
        }
        await loadOrganizations();
      } else if (deleteType === "role") {
        if (roleEditId === rowId) {
          cancelRoleEdit();
        }
        await Promise.all([loadRolesSettings(), loadUserOptions()]);
      } else if (deleteType === "position") {
        if (positionEditId === rowId) {
          cancelPositionEdit();
        }
        await Promise.all([loadPositionsSettings(), loadUserOptions()]);
      }

      closeSettingsDeleteModal();
    } catch {
      setSettingsDelete((prev) => ({
        ...prev,
        error: "Unexpected error. Please try again."
      }));
    } finally {
      setOrganizationDeletingId("");
      setRoleDeletingId("");
      setPositionDeletingId("");
      setSettingsDelete((prev) => (prev.open ? { ...prev, submitting: false } : prev));
    }
  }, [
    cancelOrganizationEdit,
    cancelPositionEdit,
    cancelRoleEdit,
    closeSettingsDeleteModal,
    loadOrganizations,
    loadPositionsSettings,
    loadRolesSettings,
    loadUserOptions,
    navigate,
    organizationEditId,
    positionEditId,
    roleEditId,
    settingsDelete.id,
    settingsDelete.type
  ]);

  return {
    settingsDelete,
    organizations,
    organizationsLoading,
    organizationsMessage,
    organizationCreateForm,
    organizationCreateError,
    organizationCreateSubmitting,
    organizationEditOpen,
    organizationEditForm,
    organizationEditError,
    organizationEditSubmitting,
    organizationDeletingId,
    rolesSettings,
    rolesSettingsLoading,
    rolesSettingsMessage,
    rolePermissionOptions,
    groupedRolePermissionOptions,
    roleCreateForm,
    roleCreateError,
    roleCreateSubmitting,
    roleEditOpen,
    roleEditForm,
    roleEditError,
    roleEditSubmitting,
    roleDeletingId,
    positionsSettings,
    positionsSettingsLoading,
    positionsSettingsMessage,
    positionCreateForm,
    positionCreateError,
    positionCreateSubmitting,
    positionEditOpen,
    positionEditForm,
    positionEditError,
    positionEditSubmitting,
    positionDeletingId,
    setOrganizationCreateForm,
    setOrganizationCreateError,
    setOrganizationEditForm,
    setOrganizationEditError,
    setRoleCreateForm,
    setRoleCreateError,
    setRoleEditForm,
    setRoleEditError,
    setPositionCreateForm,
    setPositionCreateError,
    setPositionEditForm,
    setPositionEditError,
    loadOrganizations,
    loadRolesSettings,
    loadPositionsSettings,
    handleOrganizationCreateSubmit,
    startOrganizationEdit,
    cancelOrganizationEdit,
    handleOrganizationEditSave,
    handleOrganizationDelete,
    handleRoleCreateSubmit,
    startRoleEdit,
    cancelRoleEdit,
    handleRoleEditSave,
    handleRoleDelete,
    handlePositionCreateSubmit,
    startPositionEdit,
    cancelPositionEdit,
    handlePositionEditSave,
    handlePositionDelete,
    closeSettingsDeleteModal,
    handleSettingsDeleteConfirm
  };
}
