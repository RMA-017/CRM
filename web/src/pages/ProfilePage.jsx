import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CustomSelect from "../components/CustomSelect.jsx";
import { apiFetch } from "../lib/api.js";
import { formatDateForInput, formatDateYMD, getInitial, normalizeProfile } from "../lib/formatters.js";
import {
  ALL_USERS_LIMIT,
  createEmptyAllUsersDeleteState,
  createEmptyAllUsersEditState,
  createEmptyProfileEditState,
  createEmptySettingsDeleteState,
  EMPTY_ORGANIZATION_FORM,
  EMPTY_PROFILE_EDIT_FORM,
  EMPTY_ROLE_CREATE_FORM,
  EMPTY_ROLE_EDIT_FORM,
  EMPTY_SETTINGS_OPTION_FORM,
  LOGOUT_FLAG_KEY,
  ORGANIZATION_CODE_REGEX,
  USERNAME_REGEX
} from "./profile/profile.constants.js";
import {
  groupRolePermissionOptions,
  handleProtectedStatus,
  mapValueLabelOptions,
  normalizePermissionCodesInput,
  normalizeSettingsSortOrderInput,
  togglePermissionCode
} from "./profile/profile.helpers.js";
import { useProfileAccess } from "./profile/useProfileAccess.js";

function ProfilePage({ forcedView = "none" }) {
  const navigate = useNavigate();
  const userMenuWrapRef = useRef(null);
  const menuRef = useRef(null);
  const menuToggleRef = useRef(null);
  const avatarInputRef = useRef(null);

  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);
  const [usersMenuOpen, setUsersMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [myProfileModalOpen, setMyProfileModalOpen] = useState(false);

  const [mainView, setMainViewState] = useState("none");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [profileEdit, setProfileEdit] = useState(createEmptyProfileEditState);

  const [createForm, setCreateForm] = useState({
    organizationCode: "",
    username: "",
    fullName: "",
    role: ""
  });
  const [createErrors, setCreateErrors] = useState({});
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [roleOptions, setRoleOptions] = useState([]);
  const [positionOptions, setPositionOptions] = useState([]);

  const [allUsers, setAllUsers] = useState([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [allUsersMessage, setAllUsersMessage] = useState("");
  const [allUsersPage, setAllUsersPage] = useState(1);
  const [allUsersTotalPages, setAllUsersTotalPages] = useState(1);

  const [allUsersEdit, setAllUsersEdit] = useState(createEmptyAllUsersEditState);

  const [allUsersDelete, setAllUsersDelete] = useState(createEmptyAllUsersDeleteState);
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
  const [roleEditTab, setRoleEditTab] = useState("edit");
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

  const {
    canReadUsers,
    canCreateUsers,
    canUpdateUsers,
    canDeleteUsers,
    canReadClients,
    canReadAppointments,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    canAccessForcedView
  } = useProfileAccess(profile, forcedView);

  const allowedRoleValues = useMemo(() => (
    new Set(
      roleOptions
        .map((option) => String(option?.value || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ), [roleOptions]);

  const createOrganizationOptions = useMemo(() => {
    const currentCode = String(profile?.organizationCode || "").trim().toLowerCase();
    const currentName = String(profile?.organizationName || "").trim();

    if (!hasSettingsMenuAccess) {
      return currentCode
        ? [{ value: currentCode, label: currentName ? `${currentName} (${currentCode})` : currentCode }]
        : [];
    }

    const activeItems = Array.isArray(organizations)
      ? organizations
          .filter((item) => Boolean(item?.isActive))
          .map((item) => {
            const code = String(item?.code || "").trim().toLowerCase();
            const name = String(item?.name || "").trim();
            if (!code) {
              return null;
            }
            return {
              value: code,
              label: name ? `${name} (${code})` : code
            };
          })
          .filter(Boolean)
      : [];

    const hasCurrent = activeItems.some((item) => item.value === currentCode);
    if (!hasCurrent && currentCode) {
      activeItems.unshift({
        value: currentCode,
        label: currentName ? `${currentName} (${currentCode})` : currentCode
      });
    }

    return activeItems;
  }, [hasSettingsMenuAccess, organizations, profile?.organizationCode, profile?.organizationName]);

  const allowedCreateOrganizationCodes = useMemo(() => (
    new Set(
      createOrganizationOptions
        .map((option) => String(option?.value || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ), [createOrganizationOptions]);

  const groupedRolePermissionOptions = useMemo(
    () => groupRolePermissionOptions(rolePermissionOptions),
    [rolePermissionOptions]
  );

  const firstName = useMemo(() => {
    const rawName = String(profile?.fullName || profile?.username || "User").trim();
    return rawName.split(/\s+/)[0] || "User";
  }, [profile?.fullName, profile?.username]);

  const avatarFallback = useMemo(
    () => getInitial(profile?.fullName || profile?.username || "User"),
    [profile?.fullName, profile?.username]
  );

  const avatarStorageKey = useMemo(() => {
    const username = String(profile?.username || "").trim();
    const organizationCode = String(profile?.organizationCode || "").trim().toLowerCase();
    if (!username) {
      return "";
    }
    return organizationCode
      ? `crm_avatar_${organizationCode}_${username}`
      : `crm_avatar_${username}`;
  }, [profile?.organizationCode, profile?.username]);

  const setMainView = useCallback((view) => {
    setMainViewState(view);
  }, []);

  const closeMenu = useCallback(() => {
    const activeElement = document.activeElement;
    if (
      menuRef.current
      && activeElement instanceof HTMLElement
      && menuRef.current.contains(activeElement)
    ) {
      menuToggleRef.current?.focus();
    }
    setMenuOpen(false);
    setUsersMenuOpen(false);
    setSettingsMenuOpen(false);
  }, []);

  const closeUserDropdown = useCallback(() => {
    setUserMenuOpen(false);
  }, []);

  const closeProfileEditModal = useCallback(() => {
    setProfileEdit(createEmptyProfileEditState());
  }, []);

  const closeAllUsersEditModal = useCallback(() => {
    setAllUsersEdit(createEmptyAllUsersEditState());
  }, []);

  const closeAllUsersDeleteModal = useCallback(() => {
    setAllUsersDelete(createEmptyAllUsersDeleteState());
  }, []);

  const closeSettingsDeleteModal = useCallback(() => {
    setSettingsDelete(createEmptySettingsDeleteState());
  }, []);

  const openAvatarPicker = useCallback(() => {
    avatarInputRef.current?.click();
  }, []);

  const saveAvatarFromFile = useCallback((file) => {
    if (!file || !avatarStorageKey) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) {
        return;
      }
      localStorage.setItem(avatarStorageKey, dataUrl);
      setAvatarDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }, [avatarStorageKey]);

  const loadAllUsers = useCallback(async (requestedPage = 1) => {
    if (!canReadUsers) {
      navigate("/404", { replace: true });
      return;
    }

    const nextPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    setAllUsersLoading(true);
    setAllUsersMessage("Loading users...");

    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        limit: String(ALL_USERS_LIMIT)
      });

      const response = await apiFetch(`/api/users?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          navigate("/", { replace: true });
          return;
        }
        if (response.status === 403 || response.status === 404) {
          navigate("/404", { replace: true });
          return;
        }
        setAllUsers([]);
        setAllUsersMessage(data?.message || "Failed to load users.");
        return;
      }

      const users = Array.isArray(data?.users) ? data.users : [];
      const pagination = data?.pagination || {};

      setAllUsersPage(Number(pagination.page) || 1);
      setAllUsersTotalPages(Number(pagination.totalPages) || 1);

      if (users.length === 0) {
        setAllUsers([]);
        setAllUsersMessage("No users found.");
        return;
      }

      setAllUsers(users);
      setAllUsersMessage("");
    } catch {
      setAllUsers([]);
      setAllUsersMessage("Unexpected error. Please try again.");
    } finally {
      setAllUsersLoading(false);
    }
  }, [canReadUsers, navigate]);

  const loadUserOptions = useCallback(async () => {
    try {
      const response = await apiFetch("/api/meta/user-options", {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        return;
      }

      const nextRoles = mapValueLabelOptions(
        data?.roles,
        (option) => option?.value,
        (option) => option?.label
      );
      const nextPositions = mapValueLabelOptions(
        data?.positions,
        (option) => option?.value,
        (option) => option?.label
      );

      setRoleOptions(nextRoles);
      setPositionOptions(nextPositions);
    } catch {
      setRoleOptions([]);
      setPositionOptions([]);
    }
  }, [navigate]);

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

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const response = await apiFetch("/api/profile", {
          method: "GET",
          cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));

        if (!active) {
          return;
        }

        if (!response.ok) {
          navigate("/", { replace: true });
          return;
        }

        setProfile(normalizeProfile(data));
      } catch {
        if (active) {
          navigate("/", { replace: true });
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (profileLoading || !profile?.username) {
      return;
    }
    loadUserOptions();
  }, [loadUserOptions, profile?.username, profileLoading]);

  useEffect(() => {
    if (!avatarStorageKey) {
      setAvatarDataUrl("");
      return;
    }
    setAvatarDataUrl(localStorage.getItem(avatarStorageKey) || "");
  }, [avatarStorageKey]);

  useEffect(() => {
    setMainView(forcedView);
  }, [forcedView, setMainView]);

  useEffect(() => {
    if (profileLoading || !profile?.username) {
      return;
    }
    if (!canAccessForcedView) {
      navigate("/404", { replace: true });
    }
  }, [canAccessForcedView, navigate, profile?.username, profileLoading]);

  useEffect(() => {
    if (profileLoading || !profile?.username) {
      return;
    }

    if (mainView === "all-users") {
      loadAllUsers(1);
      return;
    }
    if (mainView === "create-user") {
      if (hasSettingsMenuAccess) {
        loadOrganizations();
      }
      return;
    }
    if (mainView === "settings-organizations") {
      loadOrganizations();
      return;
    }
    if (mainView === "settings-roles") {
      loadRolesSettings();
      return;
    }
    if (mainView === "settings-positions") {
      loadPositionsSettings();
    }
  }, [
    hasSettingsMenuAccess,
    loadAllUsers,
    loadOrganizations,
    loadPositionsSettings,
    loadRolesSettings,
    mainView,
    profile?.username,
    profileLoading
  ]);

  useEffect(() => {
    const fallbackCode = String(profile?.organizationCode || "").trim().toLowerCase();
    const firstAvailableCode = createOrganizationOptions[0]?.value || "";
    const nextCode = fallbackCode || firstAvailableCode;
    if (!nextCode) {
      return;
    }

    setCreateForm((prev) => {
      const currentCode = String(prev.organizationCode || "").trim().toLowerCase();
      if (currentCode && allowedCreateOrganizationCodes.has(currentCode)) {
        return prev;
      }
      return {
        ...prev,
        organizationCode: nextCode
      };
    });
  }, [allowedCreateOrganizationCodes, createOrganizationOptions, profile?.organizationCode]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!userMenuWrapRef.current) {
        return;
      }
      if (!userMenuWrapRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key !== "Escape") {
        return;
      }
      closeMenu();
      closeUserDropdown();
      setMyProfileModalOpen(false);
      setLogoutConfirmOpen(false);
      setOrganizationEditOpen(false);
      setRoleEditOpen(false);
      setPositionEditOpen(false);
      closeProfileEditModal();
      closeAllUsersEditModal();
      closeAllUsersDeleteModal();
      closeSettingsDeleteModal();
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeAllUsersDeleteModal, closeAllUsersEditModal, closeMenu, closeProfileEditModal, closeSettingsDeleteModal, closeUserDropdown]);

  useEffect(() => {
    function preventFileDropNavigation(event) {
      event.preventDefault();
      event.stopPropagation();
    }

    function handleDrop(event) {
      preventFileDropNavigation(event);
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        saveAvatarFromFile(file);
      }
    }

    const events = ["dragenter", "dragover", "drop"];
    events.forEach((eventName) => {
      window.addEventListener(eventName, preventFileDropNavigation, true);
      document.addEventListener(eventName, preventFileDropNavigation, true);
    });
    window.addEventListener("drop", handleDrop, true);

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, preventFileDropNavigation, true);
        document.removeEventListener(eventName, preventFileDropNavigation, true);
      });
      window.removeEventListener("drop", handleDrop, true);
    };
  }, [saveAvatarFromFile]);

  function openMyProfilePanel() {
    closeMenu();
    closeUserDropdown();
    setMyProfileModalOpen(true);
  }

  function closeMyProfilePanel() {
    setMyProfileModalOpen(false);
  }

  function openPanel(path, hasAccess = true) {
    closeMenu();
    closeUserDropdown();
    if (!hasAccess) {
      return;
    }
    navigate(path);
  }

  function closePanel(view) {
    if (mainView === view) {
      navigate("/profile");
    }
  }

  function openCreateUserPanel() {
    openPanel("/users/create", canCreateUsers);
  }

  function openClientsPanel() {
    openPanel("/clients", canReadClients);
  }

  function closeClientsPanel() {
    closePanel("clients");
  }

  function openAppointmentPanel() {
    openPanel("/appointments", canReadAppointments);
  }

  function closeAppointmentPanel() {
    closePanel("appointment");
  }

  function openOrganizationsPanel() {
    openPanel("/settings/organizations", hasSettingsMenuAccess);
  }

  function closeOrganizationsPanel() {
    closePanel("settings-organizations");
  }

  function openRolesPanel() {
    openPanel("/settings/roles", hasSettingsMenuAccess);
  }

  function closeRolesPanel() {
    closePanel("settings-roles");
  }

  function openPositionsPanel() {
    openPanel("/settings/positions", hasSettingsMenuAccess);
  }

  function closePositionsPanel() {
    closePanel("settings-positions");
  }

  function closeCreateUserPanel() {
    closePanel("create-user");
  }

  function closeAllUsersPanel() {
    closePanel("all-users");
  }

  function validateOrganizationForm(form) {
    const code = String(form?.code || "").trim().toLowerCase();
    const name = String(form?.name || "").trim();

    if (!ORGANIZATION_CODE_REGEX.test(code)) {
      return "Code must be 2-64 chars and contain lowercase letters, numbers, ., _, -";
    }
    if (!name) {
      return "Name is required.";
    }
    return "";
  }

  function validateRoleSettingsForm(form) {
    const label = String(form?.label || "").trim();

    if (!label) {
      return "Label is required.";
    }
    return "";
  }

  function validatePositionSettingsForm(form) {
    const label = String(form?.label || "").trim();

    if (!label) {
      return "Label is required.";
    }
    return "";
  }

  async function handleOrganizationCreateSubmit(event) {
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
        if (response.status === 401) {
          navigate("/", { replace: true });
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
  }

  function startOrganizationEdit(item) {
    setOrganizationEditId(String(item?.id || ""));
    setOrganizationEditForm({
      code: String(item?.code || ""),
      name: String(item?.name || ""),
      isActive: Boolean(item?.isActive)
    });
    setOrganizationEditError("");
    setOrganizationEditOpen(true);
  }

  function cancelOrganizationEdit() {
    setOrganizationEditOpen(false);
    setOrganizationEditId("");
    setOrganizationEditForm({ ...EMPTY_ORGANIZATION_FORM });
    setOrganizationEditError("");
    setOrganizationEditSubmitting(false);
  }

  async function handleOrganizationEditSave() {
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
        if (response.status === 401) {
          navigate("/", { replace: true });
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
  }

  function openSettingsDelete(type, id, label = "") {
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
  }

  function handleOrganizationDelete(id, label = "") {
    openSettingsDelete("organization", id, label);
  }

  async function handleRoleCreateSubmit(event) {
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
        if (response.status === 401) {
          navigate("/", { replace: true });
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
  }

  function startRoleEdit(item) {
    setRoleEditId(String(item?.id || ""));
    setRoleEditTab("edit");
    setRoleEditForm({
      label: String(item?.label || ""),
      sortOrder: String(item?.sortOrder ?? "0"),
      isActive: Boolean(item?.isActive),
      permissionCodes: normalizePermissionCodesInput(item?.permissionCodes)
    });
    setRoleEditError("");
    setRoleEditOpen(true);
  }

  function cancelRoleEdit() {
    setRoleEditOpen(false);
    setRoleEditTab("edit");
    setRoleEditId("");
    setRoleEditForm({ ...EMPTY_ROLE_EDIT_FORM });
    setRoleEditError("");
    setRoleEditSubmitting(false);
  }

  async function handleRoleEditSave() {
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
        if (response.status === 401) {
          navigate("/", { replace: true });
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
  }

  function handleRoleDelete(id, label = "") {
    openSettingsDelete("role", id, label);
  }

  async function handlePositionCreateSubmit(event) {
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
        if (response.status === 401) {
          navigate("/", { replace: true });
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
  }

  function startPositionEdit(item) {
    setPositionEditId(String(item?.id || ""));
    setPositionEditForm({
      label: String(item?.label || ""),
      sortOrder: String(item?.sortOrder ?? "0"),
      isActive: Boolean(item?.isActive)
    });
    setPositionEditError("");
    setPositionEditOpen(true);
  }

  function cancelPositionEdit() {
    setPositionEditOpen(false);
    setPositionEditId("");
    setPositionEditForm({ ...EMPTY_SETTINGS_OPTION_FORM });
    setPositionEditError("");
    setPositionEditSubmitting(false);
  }

  async function handlePositionEditSave() {
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
        if (response.status === 401) {
          navigate("/", { replace: true });
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
  }

  function handlePositionDelete(id, label = "") {
    openSettingsDelete("position", id, label);
  }

  async function handleSettingsDeleteConfirm() {
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
        if (response.status === 401) {
          navigate("/", { replace: true });
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
  }

  function validateCreatePayload(payload) {
    const errors = {};
    if (!ORGANIZATION_CODE_REGEX.test(payload.organizationCode)) {
      errors.organizationCode = "Invalid organisation.";
    } else if (!allowedCreateOrganizationCodes.has(payload.organizationCode)) {
      errors.organizationCode = "Invalid organisation.";
    }
    if (!USERNAME_REGEX.test(payload.username)) {
      errors.username = "Username must be 3-30 chars and contain letters, numbers, ., _, -";
    }
    if (!payload.fullName) {
      errors.fullName = "Full name is required.";
    }
    if (!payload.role) {
      errors.role = "Role is required.";
    } else if (!allowedRoleValues.has(payload.role)) {
      errors.role = "Invalid role.";
    }
    return errors;
  }

  async function handleCreateUserSubmit(event) {
    event.preventDefault();

    if (!canCreateUsers) {
      setCreateErrors({ role: "You do not have permission to create users." });
      return;
    }

    const payload = {
      organizationCode: String(
        createForm.organizationCode || profile?.organizationCode || ""
      ).trim().toLowerCase(),
      username: String(createForm.username || "").trim(),
      fullName: String(createForm.fullName || "").trim(),
      role: String(createForm.role || "").trim().toLowerCase()
    };

    const errors = validateCreatePayload(payload);
    setCreateErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    try {
      setCreateSubmitting(true);

      const response = await apiFetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data?.errors && typeof data.errors === "object") {
          setCreateErrors(data.errors);
        } else if (data?.field) {
          setCreateErrors({ [data.field]: data.message || "Invalid value." });
        } else {
          setCreateErrors({ username: data?.message || "Failed to create employee account." });
        }
        return;
      }

      setCreateForm((prev) => ({ ...prev, username: "", fullName: "", role: "" }));
      setCreateErrors({});
    } catch {
      setCreateErrors({ username: "Unexpected error. Please try again." });
    } finally {
      setCreateSubmitting(false);
    }
  }

  function openProfileEditModal() {
    setProfileEdit({
      open: true,
      mode: "profile",
      form: {
        email: String(profile?.email || ""),
        fullName: String(profile?.fullName || ""),
        birthday: formatDateForInput(profile?.birthday),
        phone: String(profile?.phone || ""),
        position: String(profile?.positionId || "")
      },
      currentPassword: "",
      newPassword: "",
      error: "",
      submitting: false
    });
  }

  function openPasswordEditModal() {
    setProfileEdit({
      open: true,
      mode: "password",
      form: { ...EMPTY_PROFILE_EDIT_FORM },
      currentPassword: "",
      newPassword: "",
      error: "",
      submitting: false
    });
  }

  async function handleProfileEditSubmit(event) {
    event.preventDefault();

    if (!profileEdit.open) {
      return;
    }

    try {
      setProfileEdit((prev) => ({
        ...prev,
        submitting: true,
        error: ""
      }));

      if (profileEdit.mode === "password") {
        const currentPassword = String(profileEdit.currentPassword || "");
        const newPassword = String(profileEdit.newPassword || "").trim();

        if (!currentPassword) {
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: "Current password is required."
          }));
          return;
        }

        if (newPassword.length < 6) {
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: "Password must be at least 6 characters."
          }));
          return;
        }
        if (currentPassword === newPassword) {
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: "New password must be different from current password."
          }));
          return;
        }

        const response = await apiFetch("/api/profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            field: "password",
            value: newPassword,
            currentPassword
          })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: data?.message || "Failed to update profile."
          }));
          return;
        }

        if (data?.profile) {
          setProfile(normalizeProfile(data.profile));
        }
        closeProfileEditModal();
        return;
      }

      const nextValues = {
        email: String(profileEdit.form.email || "").trim(),
        fullName: String(profileEdit.form.fullName || "").trim(),
        birthday: String(profileEdit.form.birthday || "").trim(),
        phone: String(profileEdit.form.phone || "").trim(),
        position: String(profileEdit.form.position || "").trim()
      };

      if (!nextValues.fullName) {
        setProfileEdit((prev) => ({
          ...prev,
          submitting: false,
          error: "Full name is required."
        }));
        return;
      }

      const currentValues = {
        email: String(profile?.email || "").trim(),
        fullName: String(profile?.fullName || "").trim(),
        birthday: formatDateForInput(profile?.birthday),
        phone: String(profile?.phone || "").trim(),
        position: String(profile?.positionId || "").trim()
      };
      const fieldsToUpdate = Object.keys(nextValues).filter(
        (field) => nextValues[field] !== currentValues[field]
      );

      if (fieldsToUpdate.length === 0) {
        closeProfileEditModal();
        return;
      }

      let latestProfile = null;

      for (const field of fieldsToUpdate) {
        const response = await apiFetch("/api/profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ field, value: nextValues[field] })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: data?.message || "Failed to update profile."
          }));
          return;
        }

        if (data?.profile) {
          latestProfile = normalizeProfile(data.profile);
        }
      }

      if (latestProfile) {
        setProfile(latestProfile);
      }
      closeProfileEditModal();
    } catch {
      setProfileEdit((prev) => ({
        ...prev,
        submitting: false,
        error: "Unexpected error. Please try again."
      }));
    }
  }

  function openAllUsersEditModal(userId) {
    if (!canUpdateUsers) {
      return;
    }
    if (hasSettingsMenuAccess && !organizationsLoading && organizations.length === 0) {
      loadOrganizations();
    }
    const currentUser = allUsers.find((user) => String(user.id) === String(userId));
    if (!currentUser) {
      return;
    }

    setAllUsersEdit({
      open: true,
      id: String(currentUser.id || ""),
      submitting: false,
      form: {
        organizationName: String(currentUser.organizationName || ""),
        organizationCode: String(currentUser.organizationCode || ""),
        username: String(currentUser.username || ""),
        email: String(currentUser.email || ""),
        fullName: String(currentUser.fullName || ""),
        birthday: formatDateForInput(currentUser.birthday),
        phone: String(currentUser.phone || ""),
        position: String(currentUser.positionId || ""),
        role: String(currentUser.roleId || ""),
        password: ""
      },
      errors: {}
    });
  }

  function openAllUsersDeleteModal(userId) {
    if (!canDeleteUsers) {
      return;
    }
    setAllUsersDelete({
      open: true,
      id: String(userId || ""),
      error: "",
      submitting: false
    });
  }

  async function handleAllUsersEditSubmit(event) {
    event.preventDefault();

    if (!canUpdateUsers) {
      setAllUsersEdit((prev) => ({
        ...prev,
        errors: { username: "You do not have permission to edit users." }
      }));
      return;
    }

    if (!allUsersEdit.id) {
      return;
    }

    const payload = {
      organizationCode: String(allUsersEdit.form.organizationCode || "").trim().toLowerCase(),
      username: String(allUsersEdit.form.username || "").trim(),
      email: String(allUsersEdit.form.email || "").trim(),
      fullName: String(allUsersEdit.form.fullName || "").trim(),
      birthday: String(allUsersEdit.form.birthday || "").trim(),
      phone: String(allUsersEdit.form.phone || "").trim(),
      position: String(allUsersEdit.form.position || "").trim(),
      role: String(allUsersEdit.form.role || "").trim(),
      password: String(allUsersEdit.form.password || "")
    };

    try {
      setAllUsersEdit((prev) => ({
        ...prev,
        submitting: true,
        errors: {}
      }));

      const response = await apiFetch(`/api/users/${encodeURIComponent(allUsersEdit.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setAllUsersEdit((prev) => ({
          ...prev,
          submitting: false,
          errors: data?.errors && typeof data.errors === "object"
            ? data.errors
            : data?.field
              ? { [data.field]: data.message || "Invalid value." }
            : { username: data?.message || "Failed to update user." }
        }));
        return;
      }

      closeAllUsersEditModal();
      await loadAllUsers(allUsersPage);
    } catch {
      setAllUsersEdit((prev) => ({
        ...prev,
        submitting: false,
        errors: { username: "Unexpected error. Please try again." }
      }));
    }
  }

  async function handleAllUsersDelete() {
    if (!canDeleteUsers) {
      setAllUsersDelete((prev) => ({
        ...prev,
        error: "You do not have permission to delete users."
      }));
      return;
    }

    if (!allUsersDelete.id) {
      return;
    }

    try {
      setAllUsersDelete((prev) => ({
        ...prev,
        submitting: true,
        error: ""
      }));

      const response = await apiFetch(`/api/users/${encodeURIComponent(allUsersDelete.id)}`, {
        method: "DELETE"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setAllUsersDelete((prev) => ({
          ...prev,
          submitting: false,
          error: data?.message || "Failed to delete user."
        }));
        return;
      }

      closeAllUsersDeleteModal();
      await loadAllUsers(allUsersPage);
    } catch {
      setAllUsersDelete((prev) => ({
        ...prev,
        submitting: false,
        error: "Unexpected error. Please try again."
      }));
    }
  }

  async function handleLogout() {
    try {
      await apiFetch("/api/login/logout", {
        method: "POST"
      });
    } finally {
      sessionStorage.setItem(LOGOUT_FLAG_KEY, "1");
      navigate("/", { replace: true });
    }
  }

  return (
    <>
      <div className="home-layout">
        <header className="home-header">
          <div className="brand-wrap">
            <button
              id="menuToggle"
              ref={menuToggleRef}
              className="menu-toggle"
              type="button"
              aria-label="Open main menu"
              aria-expanded={menuOpen ? "true" : "false"}
              aria-controls="mainMenu"
              onClick={() => {
                if (menuOpen) {
                  closeMenu();
                  return;
                }
                setMenuOpen(true);
              }}
            >
              <span />
              <span />
              <span />
            </button>

            <Link className="brand" to="/" aria-label="AARON CRM home">
              <img src="/crm.svg" alt="AARON CRM logo" className="brand-logo" />
              <span className="brand-text">AARON</span>
            </Link>
          </div>

          <nav className="header-actions" aria-label="Header actions">
            <div ref={userMenuWrapRef} className="user-menu-wrap">
              <button
                id="headerUserNameBtn"
                type="button"
                className="header-btn user-name-btn"
                aria-expanded={userMenuOpen ? "true" : "false"}
                onClick={() => setUserMenuOpen((prev) => !prev)}
              >
                <span className="header-avatar-inline">
                  <img
                    id="headerAvatarImage"
                    className="header-avatar-image"
                    alt="Profile photo"
                    hidden={!avatarDataUrl}
                    src={avatarDataUrl || undefined}
                  />
                  <span id="headerAvatarFallback" className="header-avatar-fallback" hidden={Boolean(avatarDataUrl)}>
                    {avatarFallback}
                  </span>
                </span>
                <span id="headerUserNameText">{profileLoading ? "-" : firstName}</span>
              </button>

              <input
                id="headerAvatarInput"
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  saveAvatarFromFile(file);
                  event.currentTarget.value = "";
                }}
              />

              <div id="headerUserMenu" className="header-user-menu" hidden={!userMenuOpen}>
                <button id="openMyProfileBtn" type="button" className="header-user-menu-item" onClick={openMyProfilePanel}>
                  My Profile
                </button>
                <button
                  id="openSettingsBtn"
                  type="button"
                  className="header-user-menu-item"
                >
                  Settings
                </button>
              </div>
            </div>

            <button id="headerLogoutBtn" type="button" className="header-btn" onClick={() => setLogoutConfirmOpen(true)}>
              Logout
            </button>
          </nav>
        </header>

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

        <footer className="home-footer">
          <a
            className="footer-link"
            href="https://www.instagram.com/aaron_uzb?igsh=MWxod2Q1eDV6NGowZw=="
            target="_blank"
            rel="noreferrer"
          >
            <img src="/icon/instagram.svg" alt="" aria-hidden="true" className="footer-link-icon" />
            <span>Instagram</span>
          </a>
          <a className="footer-link" href="https://t.me/aaron_uz" target="_blank" rel="noreferrer">
            <img src="/icon/telegram.svg" alt="" aria-hidden="true" className="footer-link-icon" />
            <span>Telegram</span>
          </a>
          <a className="footer-link" href="tel:+998954550033">
            <img src="/icon/call-center.svg" alt="" aria-hidden="true" className="footer-link-icon" />
            <span>Call Center</span>
          </a>
        </footer>
      </div>

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

      <aside
        id="mainMenu"
        ref={menuRef}
        className={`side-menu${menuOpen ? " open" : ""}`}
        aria-label="Main menu"
        aria-hidden={menuOpen ? "false" : "true"}
      >
        <div className="side-menu-head">
          <img src="/crm.svg" alt="CRM logo" className="side-logo" />
          <strong>Main Menu</strong>
        </div>
        <nav className="side-menu-links">
          <button
            id="openClientsBtn"
            type="button"
            className="side-menu-action"
            hidden={!canReadClients}
            onClick={openClientsPanel}
          >
            Clients
          </button>
          <button
            id="openAppointmentBtn"
            type="button"
            className="side-menu-action"
            hidden={!canReadAppointments}
            onClick={openAppointmentPanel}
          >
            Appointment
          </button>
          <div id="usersMenuGroup" className="side-menu-group" hidden={!hasUsersMenuAccess}>
            <button
              id="toggleUsersMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={usersMenuOpen ? "true" : "false"}
              onClick={() => {
                setUsersMenuOpen((prev) => !prev);
                setSettingsMenuOpen(false);
              }}
            >
              Users
            </button>
            <div id="usersSubMenu" className="side-submenu" hidden={!usersMenuOpen}>
              <button
                id="openAllUsersBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canReadUsers}
                onClick={() => {
                  closeMenu();
                  navigate("/users/allusers");
                }}
              >
                All Users
              </button>
              <button
                id="openCreateUserBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                hidden={!canCreateUsers}
                onClick={openCreateUserPanel}
              >
                Create User
              </button>
            </div>
          </div>
          <div id="settingsMenuGroup" className="side-menu-group" hidden={!hasSettingsMenuAccess}>
            <button
              id="toggleSettingsMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={settingsMenuOpen ? "true" : "false"}
              onClick={() => {
                setSettingsMenuOpen((prev) => !prev);
                setUsersMenuOpen(false);
              }}
            >
              General Settings
            </button>
            <div id="settingsSubMenu" className="side-submenu" hidden={!settingsMenuOpen}>
              <button
                id="openOrganizationsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={openOrganizationsPanel}
              >
                Organizations
              </button>
              <button
                id="openRolesBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={openRolesPanel}
              >
                Roles
              </button>
              <button
                id="openPositionsBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={openPositionsPanel}
              >
                Positions
              </button>
            </div>
          </div>
        </nav>
      </aside>

      <div id="menuOverlay" className="menu-overlay" hidden={!menuOpen} onClick={closeMenu} />
    </>
  );
}

export default ProfilePage;
