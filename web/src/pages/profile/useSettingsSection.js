import { useCallback, useMemo, useRef, useState } from "react";
import { apiFetch, readApiResponseData } from "../../lib/api.js";
import {
  createEmptySettingsDeleteState,
  EMPTY_NORM_FORM,
  EMPTY_ORGANIZATION_FORM,
  EMPTY_ROLE_CREATE_FORM,
  EMPTY_ROLE_EDIT_FORM,
  EMPTY_SETTINGS_OPTION_FORM,
  ORGANIZATION_CODE_REGEX
} from "./profile.constants.js";
import {
  buildRolePermissionTree,
  handleProtectedStatus,
  mapValueLabelOptions,
  normalizePermissionCodesInput,
  normalizeSettingsSortOrderInput
} from "./profile.helpers.js";

export function useSettingsSection({
  canOpenSettingsOrganizations,
  canCreateSettingsOrganizations,
  canUpdateSettingsOrganizations,
  canDeleteSettingsOrganizations,
  canOpenSettingsRoles,
  canCreateSettingsRoles,
  canUpdateSettingsRoles,
  canDeleteSettingsRoles,
  canOpenSettingsPositions,
  canCreateSettingsPositions,
  canUpdateSettingsPositions,
  canDeleteSettingsPositions,
  canOpenSettingsNorms,
  canCreateSettingsAppointmentNorms,
  canUpdateSettingsAppointmentNorms,
  canDeleteSettingsAppointmentNorms,
  navigate,
  loadUserOptions,
  orgFeatures = null
}) {
  const hasOrganizationSettingsAccess = canOpenSettingsOrganizations;
  const hasRoleSettingsAccess = canOpenSettingsRoles;
  const hasPositionSettingsAccess = canOpenSettingsPositions;
  const hasNormsSettingsAccess = Boolean(canOpenSettingsNorms);
  const [settingsDelete, setSettingsDelete] = useState(createEmptySettingsDeleteState);

  const [organizations, setOrganizations] = useState([]);
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
  const [normsSettings, setNormsSettings] = useState([]);
  const [normsSettingsMessage, setNormsSettingsMessage] = useState("");
  const [normCreateForm, setNormCreateForm] = useState({ ...EMPTY_NORM_FORM });
  const [normCreateError, setNormCreateError] = useState("");
  const [normCreateSubmitting, setNormCreateSubmitting] = useState(false);
  const [normEditId, setNormEditId] = useState("");
  const [normEditOpen, setNormEditOpen] = useState(false);
  const [normEditForm, setNormEditForm] = useState({ maxPerWeek: "2", isActive: true });
  const [normEditError, setNormEditError] = useState("");
  const [normEditSubmitting, setNormEditSubmitting] = useState(false);
  const [normDeletingId, setNormDeletingId] = useState("");
  const organizationsLoadedRef = useRef(false);
  const rolesLoadedRef = useRef(false);
  const positionsLoadedRef = useRef(false);
  const normsLoadedRef = useRef(false);

  const allowedRolePermissionCodeSet = useMemo(
    () => new Set(
      normalizePermissionCodesInput(
        rolePermissionOptions.map((permission) => permission?.code || permission?.value)
      )
    ),
    [rolePermissionOptions]
  );

  const filterRolePermissionCodesForCurrentOptions = useCallback((permissionCodes) => {
    const normalizedCodes = normalizePermissionCodesInput(permissionCodes);
    if (allowedRolePermissionCodeSet.size === 0) {
      return [];
    }
    return normalizedCodes.filter((code) => allowedRolePermissionCodeSet.has(code));
  }, [allowedRolePermissionCodeSet]);

  const rolePermissionTree = useMemo(
    () => buildRolePermissionTree(rolePermissionOptions, orgFeatures),
    [rolePermissionOptions, orgFeatures]
  );

  const closeSettingsDeleteModal = useCallback(() => {
    setSettingsDelete(createEmptySettingsDeleteState());
  }, []);

  const loadOrganizations = useCallback(async (options = {}) => {
    if (!hasOrganizationSettingsAccess) {
      navigate("/404", { replace: true });
      return;
    }
    const force = options?.force === true;
    if (!force && organizationsLoadedRef.current) {
      return;
    }

    setOrganizationsMessage("");

    try {
      const response = await apiFetch("/api/settings/organizations", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        organizationsLoadedRef.current = false;
        setOrganizations([]);
        setOrganizationsMessage(data?.message || "Failed to load organizations.");
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      organizationsLoadedRef.current = true;
      setOrganizations(items);
      setOrganizationsMessage(items.length === 0 ? "No organizations found." : "");
    } catch {
      organizationsLoadedRef.current = false;
      setOrganizations([]);
      setOrganizationsMessage("Unexpected error. Please try again.");
    }
  }, [hasOrganizationSettingsAccess, navigate]);

  const loadRolesSettings = useCallback(async (options = {}) => {
    if (!hasRoleSettingsAccess) {
      navigate("/404", { replace: true });
      return;
    }
    const force = options?.force === true;
    if (!force && rolesLoadedRef.current) {
      return;
    }

    setRolesSettingsMessage("");

    try {
      const response = await apiFetch("/api/settings/roles", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        rolesLoadedRef.current = false;
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
      rolesLoadedRef.current = true;
      setRolesSettings(items);
      setRolesSettingsMessage(items.length === 0 ? "No roles found." : "");
    } catch {
      rolesLoadedRef.current = false;
      setRolesSettings([]);
      setRolePermissionOptions([]);
      setRolesSettingsMessage("Unexpected error. Please try again.");
    }
  }, [hasRoleSettingsAccess, navigate]);

  const loadPositionsSettings = useCallback(async (options = {}) => {
    if (!hasPositionSettingsAccess) {
      navigate("/404", { replace: true });
      return;
    }
    const force = options?.force === true;
    if (!force && positionsLoadedRef.current) {
      return;
    }

    setPositionsSettingsMessage("");

    try {
      const response = await apiFetch("/api/settings/positions", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        positionsLoadedRef.current = false;
        setPositionsSettings([]);
        setPositionsSettingsMessage(data?.message || "Failed to load positions.");
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      positionsLoadedRef.current = true;
      setPositionsSettings(items);
      setPositionsSettingsMessage(items.length === 0 ? "No positions found." : "");
    } catch {
      positionsLoadedRef.current = false;
      setPositionsSettings([]);
      setPositionsSettingsMessage("Unexpected error. Please try again.");
    }
  }, [hasPositionSettingsAccess, navigate]);

  const loadNormsSettings = useCallback(async (options = {}) => {
    if (!hasNormsSettingsAccess) {
      navigate("/404", { replace: true });
      return;
    }
    const force = options?.force === true;
    if (!force && normsLoadedRef.current) {
      return;
    }

    setNormsSettingsMessage("");

    try {
      const response = await apiFetch("/api/settings/appointment-norms", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        normsLoadedRef.current = false;
        setNormsSettings([]);
        setNormsSettingsMessage(data?.message || "Failed to load appointment norms.");
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      normsLoadedRef.current = true;
      setNormsSettings(items);
      setNormsSettingsMessage(items.length === 0 ? "No norms found." : "");
    } catch {
      normsLoadedRef.current = false;
      setNormsSettings([]);
      setNormsSettingsMessage("Unexpected error. Please try again.");
    }
  }, [hasNormsSettingsAccess, navigate]);

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

  const validateLabelSettingsForm = useCallback((form) => {
    const label = String(form?.label || "").trim();
    if (!label) {
      return "Label is required.";
    }
    return "";
  }, []);

  const handleOrganizationCreateSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!canCreateSettingsOrganizations) {
      setOrganizationCreateError("You do not have permission to manage organizations.");
      return false;
    }

    const payload = {
      code: String(organizationCreateForm.code || "").trim().toLowerCase(),
      name: String(organizationCreateForm.name || "").trim(),
      isActive: Boolean(organizationCreateForm.isActive),
      allowedFeatures: Array.isArray(organizationCreateForm.allowedFeatures) ? organizationCreateForm.allowedFeatures : null
    };
    const validationError = validateOrganizationForm(payload);
    if (validationError) {
      setOrganizationCreateError(validationError);
      return false;
    }

    try {
      setOrganizationCreateSubmitting(true);
      setOrganizationCreateError("");
      const response = await apiFetch("/api/settings/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return false;
        }
        setOrganizationCreateError(data?.message || "Failed to create organization.");
        return false;
      }

      setOrganizationCreateForm({ ...EMPTY_ORGANIZATION_FORM });
      await loadOrganizations({ force: true });
      return true;
    } catch {
      setOrganizationCreateError("Unexpected error. Please try again.");
      return false;
    } finally {
      setOrganizationCreateSubmitting(false);
    }
  }, [
    canCreateSettingsOrganizations,
    loadOrganizations,
    navigate,
    organizationCreateForm.allowedFeatures,
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
      isActive: Boolean(item?.isActive),
      allowedFeatures: Array.isArray(item?.allowedFeatures) ? item.allowedFeatures : null
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
    if (!canUpdateSettingsOrganizations) {
      setOrganizationEditError("You do not have permission to manage organizations.");
      return;
    }

    const payload = {
      code: String(organizationEditForm.code || "").trim().toLowerCase(),
      name: String(organizationEditForm.name || "").trim(),
      isActive: Boolean(organizationEditForm.isActive),
      allowedFeatures: Array.isArray(organizationEditForm.allowedFeatures) ? organizationEditForm.allowedFeatures : null
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
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setOrganizationEditError(data?.message || "Failed to update organization.");
        return;
      }

      cancelOrganizationEdit();
      await loadOrganizations({ force: true });
    } catch {
      setOrganizationEditError("Unexpected error. Please try again.");
    } finally {
      setOrganizationEditSubmitting(false);
    }
  }, [
    cancelOrganizationEdit,
    canUpdateSettingsOrganizations,
    loadOrganizations,
    navigate,
    organizationEditForm.allowedFeatures,
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

    if (!canCreateSettingsRoles) {
      setRoleCreateError("You do not have permission to manage settings.");
      return false;
    }

    const payload = {
      label: String(roleCreateForm.label || "").trim(),
      sortOrder: normalizeSettingsSortOrderInput(roleCreateForm.sortOrder),
      isActive: Boolean(roleCreateForm.isActive),
      permissionCodes: filterRolePermissionCodesForCurrentOptions(roleCreateForm.permissionCodes)
    };
    const validationError = validateLabelSettingsForm(payload);
    if (validationError) {
      setRoleCreateError(validationError);
      return false;
    }

    try {
      setRoleCreateSubmitting(true);
      setRoleCreateError("");
      const response = await apiFetch("/api/settings/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return false;
        }
        setRoleCreateError(data?.message || "Failed to create role.");
        return false;
      }

      setRoleCreateForm({ ...EMPTY_ROLE_CREATE_FORM });
      await Promise.all([loadRolesSettings({ force: true }), loadUserOptions()]);
      return true;
    } catch {
      setRoleCreateError("Unexpected error. Please try again.");
      return false;
    } finally {
      setRoleCreateSubmitting(false);
    }
  }, [
    canCreateSettingsRoles,
    loadRolesSettings,
    loadUserOptions,
    navigate,
    roleCreateForm.isActive,
    roleCreateForm.label,
    roleCreateForm.permissionCodes,
    roleCreateForm.sortOrder,
    filterRolePermissionCodesForCurrentOptions,
    validateLabelSettingsForm
  ]);

  const startRoleEdit = useCallback((item) => {
    setRoleEditId(String(item?.id || ""));
    setRoleEditForm({
      label: String(item?.label || ""),
      sortOrder: String(item?.sortOrder ?? "0"),
      isActive: Boolean(item?.isActive),
      isAdmin: Boolean(item?.isAdmin),
      permissionCodes: filterRolePermissionCodesForCurrentOptions(item?.permissionCodes)
    });
    setRoleEditError("");
    setRoleEditOpen(true);
  }, [filterRolePermissionCodesForCurrentOptions]);

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
    if (!canUpdateSettingsRoles) {
      setRoleEditError("You do not have permission to manage settings.");
      return;
    }

    const payload = {
      label: String(roleEditForm.label || "").trim(),
      sortOrder: normalizeSettingsSortOrderInput(roleEditForm.sortOrder),
      isActive: Boolean(roleEditForm.isActive),
      isAdmin: Boolean(roleEditForm.isAdmin),
      permissionCodes: filterRolePermissionCodesForCurrentOptions(roleEditForm.permissionCodes)
    };
    const validationError = validateLabelSettingsForm(payload);
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
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setRoleEditError(data?.message || "Failed to update role.");
        return;
      }

      cancelRoleEdit();
      await Promise.all([loadRolesSettings({ force: true }), loadUserOptions()]);
    } catch {
      setRoleEditError("Unexpected error. Please try again.");
    } finally {
      setRoleEditSubmitting(false);
    }
  }, [
    cancelRoleEdit,
    canUpdateSettingsRoles,
    loadRolesSettings,
    loadUserOptions,
    navigate,
    filterRolePermissionCodesForCurrentOptions,
    roleEditForm.isActive,
    roleEditForm.isAdmin,
    roleEditForm.label,
    roleEditForm.permissionCodes,
    roleEditForm.sortOrder,
    roleEditId,
    validateLabelSettingsForm
  ]);

  const handleRoleDelete = useCallback((id, label = "") => {
    openSettingsDelete("role", id, label);
  }, [openSettingsDelete]);

  const handlePositionCreateSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!canCreateSettingsPositions) {
      setPositionCreateError("You do not have permission to manage settings.");
      return false;
    }

    const payload = {
      label: String(positionCreateForm.label || "").trim(),
      sortOrder: normalizeSettingsSortOrderInput(positionCreateForm.sortOrder),
      isActive: Boolean(positionCreateForm.isActive)
    };
    const validationError = validateLabelSettingsForm(payload);
    if (validationError) {
      setPositionCreateError(validationError);
      return false;
    }

    try {
      setPositionCreateSubmitting(true);
      setPositionCreateError("");
      const response = await apiFetch("/api/settings/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return false;
        }
        setPositionCreateError(data?.message || "Failed to create position.");
        return false;
      }

      setPositionCreateForm({ ...EMPTY_SETTINGS_OPTION_FORM });
      await Promise.all([loadPositionsSettings({ force: true }), loadUserOptions()]);
      return true;
    } catch {
      setPositionCreateError("Unexpected error. Please try again.");
      return false;
    } finally {
      setPositionCreateSubmitting(false);
    }
  }, [
    canCreateSettingsPositions,
    loadPositionsSettings,
    loadUserOptions,
    navigate,
    positionCreateForm.isActive,
    positionCreateForm.label,
    positionCreateForm.sortOrder,
    validateLabelSettingsForm
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
    if (!canUpdateSettingsPositions) {
      setPositionEditError("You do not have permission to manage settings.");
      return;
    }

    const payload = {
      label: String(positionEditForm.label || "").trim(),
      sortOrder: normalizeSettingsSortOrderInput(positionEditForm.sortOrder),
      isActive: Boolean(positionEditForm.isActive)
    };
    const validationError = validateLabelSettingsForm(payload);
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
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setPositionEditError(data?.message || "Failed to update position.");
        return;
      }

      cancelPositionEdit();
      await Promise.all([loadPositionsSettings({ force: true }), loadUserOptions()]);
    } catch {
      setPositionEditError("Unexpected error. Please try again.");
    } finally {
      setPositionEditSubmitting(false);
    }
  }, [
    cancelPositionEdit,
    canUpdateSettingsPositions,
    loadPositionsSettings,
    loadUserOptions,
    navigate,
    positionEditForm.isActive,
    positionEditForm.label,
    positionEditForm.sortOrder,
    positionEditId,
    validateLabelSettingsForm
  ]);

  const handlePositionDelete = useCallback((id, label = "") => {
    openSettingsDelete("position", id, label);
  }, [openSettingsDelete]);

  const validateNormCreateForm = useCallback((form) => {
    const positionId = String(form?.positionId || "").trim();
    if (!positionId) {
      return "Position is required.";
    }
    const maxPerWeek = parseInt(String(form?.maxPerWeek || ""), 10);
    if (isNaN(maxPerWeek) || maxPerWeek < 1 || maxPerWeek > 100) {
      return "Max per week must be between 1 and 100.";
    }
    return "";
  }, []);

  const validateNormEditForm = useCallback((form) => {
    const maxPerWeek = parseInt(String(form?.maxPerWeek || ""), 10);
    if (isNaN(maxPerWeek) || maxPerWeek < 1 || maxPerWeek > 100) {
      return "Max per week must be between 1 and 100.";
    }
    return "";
  }, []);

  const handleNormCreateSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!canCreateSettingsAppointmentNorms) {
      setNormCreateError("You do not have permission to create norms.");
      return false;
    }

    const payload = {
      positionId: parseInt(String(normCreateForm.positionId || ""), 10),
      maxPerWeek: parseInt(String(normCreateForm.maxPerWeek || ""), 10),
      isActive: Boolean(normCreateForm.isActive)
    };
    const validationError = validateNormCreateForm(normCreateForm);
    if (validationError) {
      setNormCreateError(validationError);
      return false;
    }

    try {
      setNormCreateSubmitting(true);
      setNormCreateError("");
      const response = await apiFetch("/api/settings/appointment-norms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return false;
        }
        setNormCreateError(data?.message || "Failed to create norm.");
        return false;
      }

      setNormCreateForm({ ...EMPTY_NORM_FORM });
      await loadNormsSettings({ force: true });
      return true;
    } catch {
      setNormCreateError("Unexpected error. Please try again.");
      return false;
    } finally {
      setNormCreateSubmitting(false);
    }
  }, [
    canCreateSettingsAppointmentNorms,
    loadNormsSettings,
    navigate,
    normCreateForm.isActive,
    normCreateForm.maxPerWeek,
    normCreateForm.positionId,
    validateNormCreateForm
  ]);

  const startNormEdit = useCallback((item) => {
    setNormEditId(String(item?.id || ""));
    setNormEditForm({
      maxPerWeek: String(item?.maxPerWeek ?? "2"),
      isActive: Boolean(item?.isActive)
    });
    setNormEditError("");
    setNormEditOpen(true);
  }, []);

  const cancelNormEdit = useCallback(() => {
    setNormEditOpen(false);
    setNormEditId("");
    setNormEditForm({ maxPerWeek: "2", isActive: true });
    setNormEditError("");
    setNormEditSubmitting(false);
  }, []);

  const handleNormEditSave = useCallback(async () => {
    const id = String(normEditId || "").trim();
    if (!id) {
      return;
    }
    if (!canUpdateSettingsAppointmentNorms) {
      setNormEditError("You do not have permission to manage norms.");
      return;
    }

    const validationError = validateNormEditForm(normEditForm);
    if (validationError) {
      setNormEditError(validationError);
      return;
    }

    const payload = {
      maxPerWeek: parseInt(String(normEditForm.maxPerWeek || ""), 10),
      isActive: Boolean(normEditForm.isActive)
    };

    try {
      setNormEditSubmitting(true);
      setNormEditError("");
      const response = await apiFetch(`/api/settings/appointment-norms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setNormEditError(data?.message || "Failed to update norm.");
        return;
      }

      cancelNormEdit();
      await loadNormsSettings({ force: true });
    } catch {
      setNormEditError("Unexpected error. Please try again.");
    } finally {
      setNormEditSubmitting(false);
    }
  }, [
    cancelNormEdit,
    canUpdateSettingsAppointmentNorms,
    loadNormsSettings,
    navigate,
    normEditForm.isActive,
    normEditForm.maxPerWeek,
    normEditId,
    validateNormEditForm
  ]);

  const handleNormDelete = useCallback(async (id, label = "") => {
    const rowId = String(id || "").trim();
    if (!rowId) {
      return;
    }
    if (!canDeleteSettingsAppointmentNorms) {
      setNormsSettingsMessage("You do not have permission to delete norms.");
      return;
    }

    try {
      setNormDeletingId(rowId);
      const response = await apiFetch(`/api/settings/appointment-norms/${rowId}`, {
        method: "DELETE"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setNormsSettingsMessage(data?.message || `Failed to delete norm "${label}".`);
        return;
      }

      await loadNormsSettings({ force: true });
    } catch {
      setNormsSettingsMessage("Unexpected error. Please try again.");
    } finally {
      setNormDeletingId("");
    }
  }, [canDeleteSettingsAppointmentNorms, loadNormsSettings, navigate]);

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
        if (!canDeleteSettingsOrganizations) {
          setSettingsDelete((prev) => ({
            ...prev,
            error: "You do not have permission to manage organizations.",
            submitting: false
          }));
          return;
        }
        endpoint = `/api/settings/organizations/${rowId}`;
        fallbackError = "Failed to delete organization.";
        setOrganizationDeletingId(rowId);
      } else if (deleteType === "role") {
        if (!canDeleteSettingsRoles) {
          setSettingsDelete((prev) => ({
            ...prev,
            error: "You do not have permission to manage settings.",
            submitting: false
          }));
          return;
        }
        endpoint = `/api/settings/roles/${rowId}`;
        fallbackError = "Failed to delete role.";
        setRoleDeletingId(rowId);
      } else if (deleteType === "position") {
        if (!canDeleteSettingsPositions) {
          setSettingsDelete((prev) => ({
            ...prev,
            error: "You do not have permission to manage settings.",
            submitting: false
          }));
          return;
        }
        endpoint = `/api/settings/positions/${rowId}`;
        fallbackError = "Failed to delete position.";
        setPositionDeletingId(rowId);
      } else {
        setSettingsDelete((prev) => ({ ...prev, submitting: false }));
        return;
      }

      const response = await apiFetch(endpoint, { method: "DELETE" });
      const data = await readApiResponseData(response);

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
        await loadOrganizations({ force: true });
      } else if (deleteType === "role") {
        if (roleEditId === rowId) {
          cancelRoleEdit();
        }
        await Promise.all([loadRolesSettings({ force: true }), loadUserOptions()]);
      } else if (deleteType === "position") {
        if (positionEditId === rowId) {
          cancelPositionEdit();
        }
        await Promise.all([loadPositionsSettings({ force: true }), loadUserOptions()]);
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
    canDeleteSettingsOrganizations,
    canDeleteSettingsPositions,
    canDeleteSettingsRoles,
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
    rolesSettingsMessage,
    rolePermissionOptions,
    rolePermissionTree,
    roleCreateForm,
    roleCreateError,
    roleCreateSubmitting,
    roleEditOpen,
    roleEditForm,
    roleEditError,
    roleEditSubmitting,
    roleDeletingId,
    positionsSettings,
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
    normsSettings,
    normsSettingsMessage,
    normCreateForm,
    normCreateError,
    normCreateSubmitting,
    normEditOpen,
    normEditForm,
    normEditError,
    normEditSubmitting,
    normDeletingId,
    setNormCreateForm,
    setNormCreateError,
    setNormEditForm,
    setNormEditError,
    loadNormsSettings,
    handleNormCreateSubmit,
    startNormEdit,
    cancelNormEdit,
    handleNormEditSave,
    handleNormDelete,
    closeSettingsDeleteModal,
    handleSettingsDeleteConfirm
  };
}
