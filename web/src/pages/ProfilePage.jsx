import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { formatDateForInput, getInitial, normalizeProfile } from "../lib/formatters.js";
import {
  ALL_USERS_LIMIT,
  createEmptyAllUsersDeleteState,
  createEmptyClientsDeleteState,
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
  normalizeSettingsSortOrderInput
} from "./profile/profile.helpers.js";
import ProfileMainContent from "./profile/ProfileMainContent.jsx";
import ProfileModals from "./profile/ProfileModals.jsx";
import ProfileSideMenu from "./profile/ProfileSideMenu.jsx";
import { useProfileAccess } from "./profile/useProfileAccess.js";

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const TELEGRAM_USERNAME_REGEX = /^@?[a-zA-Z0-9_]{5,32}$/;
const MIN_BIRTHDAY_YMD = "1950-01-01";

function getTodayYmd() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBirthdayValidationMessage(value, { required = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    return required ? "Birthday is required." : "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "Invalid birthday format.";
  }

  const [yearRaw, monthRaw, dayRaw] = raw.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate = (
    !Number.isNaN(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
  if (!isRealDate) {
    return "Invalid birthday format.";
  }

  const todayYmd = getTodayYmd();
  if (raw < MIN_BIRTHDAY_YMD || raw > todayYmd) {
    return "Birthday is out of allowed range.";
  }

  return "";
}

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
  const [clientsMenuOpen, setClientsMenuOpen] = useState(false);
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

  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsMessage, setClientsMessage] = useState("");
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsTotalPages, setClientsTotalPages] = useState(1);
  const [clientCreateForm, setClientCreateForm] = useState({
    firstName: "",
    lastName: "",
    middleName: "",
    birthday: "",
    phone: "",
    telegramOrEmail: "",
    isVip: false
  });
  const [clientCreateErrors, setClientCreateErrors] = useState({});
  const [clientCreateSubmitting, setClientCreateSubmitting] = useState(false);
  const [clientEditId, setClientEditId] = useState("");
  const [clientEditForm, setClientEditForm] = useState({
    firstName: "",
    lastName: "",
    middleName: "",
    birthday: "",
    phone: "",
    tgMail: "",
    isVip: false,
    note: ""
  });
  const [clientEditErrors, setClientEditErrors] = useState({});
  const [clientEditSubmitting, setClientEditSubmitting] = useState(false);
  const [clientsEditOpen, setClientsEditOpen] = useState(false);
  const [clientsDelete, setClientsDelete] = useState(createEmptyClientsDeleteState());

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
    canManageClients,
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

  const hasAnyModalOpen = (
    myProfileModalOpen
    || logoutConfirmOpen
    || profileEdit.open
    || allUsersEdit.open
    || allUsersDelete.open
    || clientsEditOpen
    || clientsDelete.open
    || settingsDelete.open
    || organizationEditOpen
    || roleEditOpen
    || positionEditOpen
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
    setClientsMenuOpen(false);
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

  const closeClientsEditModal = useCallback(() => {
    setClientsEditOpen(false);
    setClientEditId("");
    setClientEditForm({
      firstName: "",
      lastName: "",
      middleName: "",
      birthday: "",
      phone: "",
      tgMail: "",
      isVip: false,
      note: ""
    });
    setClientEditErrors({});
    setClientEditSubmitting(false);
  }, []);

  const closeClientsDeleteModal = useCallback(() => {
    setClientsDelete(createEmptyClientsDeleteState());
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

  const loadClients = useCallback(async (requestedPage = 1) => {
    if (!canReadClients) {
      navigate("/404", { replace: true });
      return;
    }

    const nextPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    setClientsLoading(true);
    setClientsMessage("Loading clients...");

    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        limit: String(ALL_USERS_LIMIT)
      });

      const response = await apiFetch(`/api/clients?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setClients([]);
        setClientsMessage(data?.message || "Failed to load clients.");
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      const pagination = data?.pagination || {};

      setClientsPage(Number(pagination.page) || 1);
      setClientsTotalPages(Number(pagination.totalPages) || 1);

      if (items.length === 0) {
        setClients([]);
        setClientsMessage("No clients found.");
        return;
      }

      setClients(items);
      setClientsMessage("");
    } catch {
      setClients([]);
      setClientsMessage("Unexpected error. Please try again.");
    } finally {
      setClientsLoading(false);
    }
  }, [canReadClients, navigate]);

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
    if (mainView === "clients-all") {
      loadClients(1);
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
    loadClients,
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
      closeClientsEditModal();
      closeClientsDeleteModal();
      closeSettingsDeleteModal();
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [
    closeAllUsersDeleteModal,
    closeAllUsersEditModal,
    closeClientsEditModal,
    closeClientsDeleteModal,
    closeMenu,
    closeProfileEditModal,
    closeSettingsDeleteModal,
    closeUserDropdown
  ]);

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

  function openAllClientsPanel() {
    openPanel("/clients/allclients", canReadClients);
  }

  function closeAllClientsPanel() {
    closePanel("clients-all");
  }

  function openCreateClientPanel() {
    openPanel("/clients/create", canManageClients && canReadClients);
  }

  function closeCreateClientPanel() {
    closePanel("clients-create");
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

  function validateClientCreateForm(form) {
    const errors = {};
    const firstName = String(form?.firstName || "").trim();
    const lastName = String(form?.lastName || "").trim();
    const middleName = String(form?.middleName || "").trim();
    const birthday = String(form?.birthday || "").trim();
    const phone = String(form?.phone || "").trim();
    const telegramOrEmail = String(form?.telegramOrEmail || "").trim();
    const fullName = [lastName, firstName, middleName].filter(Boolean).join(" ").trim();

    if (!firstName) {
      errors.firstName = "First name is required.";
    } else if (firstName.length > 64) {
      errors.firstName = "First name is too long (max 64).";
    }

    if (!lastName) {
      errors.lastName = "Last name is required.";
    } else if (lastName.length > 64) {
      errors.lastName = "Last name is too long (max 64).";
    }

    if (middleName && middleName.length > 64) {
      errors.middleName = "Middle name is too long (max 64).";
    }

    const birthdayError = getBirthdayValidationMessage(birthday, { required: true });
    if (birthdayError) {
      errors.birthday = birthdayError;
    }

    if (phone && !PHONE_REGEX.test(phone)) {
      errors.phone = "Invalid phone number.";
    }

    if (telegramOrEmail) {
      const isEmail = EMAIL_REGEX.test(telegramOrEmail);
      const isTelegram = TELEGRAM_USERNAME_REGEX.test(telegramOrEmail);
      if (!isEmail && !isTelegram) {
        errors.telegramOrEmail = "Enter valid Telegram username or email.";
      } else if (telegramOrEmail.length > 96) {
        errors.telegramOrEmail = "Telegram or email is too long (max 96).";
      }
    }

    if (fullName.length > 96) {
      errors.firstName = "Full name is too long (max 96).";
    }

    return errors;
  }

  function validateClientEditForm(form) {
    const errors = {};
    const firstName = String(form?.firstName || "").trim();
    const lastName = String(form?.lastName || "").trim();
    const middleName = String(form?.middleName || "").trim();
    const birthday = String(form?.birthday || "").trim();
    const phone = String(form?.phone || "").trim();
    const tgMail = String(form?.tgMail || "").trim();
    const note = String(form?.note || "").trim();

    if (!firstName) {
      errors.firstName = "First name is required.";
    } else if (firstName.length > 64) {
      errors.firstName = "First name is too long (max 64).";
    }

    if (!lastName) {
      errors.lastName = "Last name is required.";
    } else if (lastName.length > 64) {
      errors.lastName = "Last name is too long (max 64).";
    }

    if (middleName && middleName.length > 64) {
      errors.middleName = "Middle name is too long (max 64).";
    }

    const birthdayError = getBirthdayValidationMessage(birthday, { required: true });
    if (birthdayError) {
      errors.birthday = birthdayError;
    }

    if (phone && !PHONE_REGEX.test(phone)) {
      errors.phone = "Invalid phone number.";
    }

    if (tgMail && tgMail.length > 96) {
      errors.tgMail = "Telegram or email is too long (max 96).";
    }

    if (note.length > 255) {
      errors.note = "Note is too long (max 255).";
    }

    return errors;
  }

  async function handleClientCreateSubmit(event) {
    event.preventDefault();

    if (!canManageClients) {
      setClientCreateErrors({ firstName: "You do not have permission to manage clients." });
      return;
    }

    const firstName = String(clientCreateForm.firstName || "").trim();
    const lastName = String(clientCreateForm.lastName || "").trim();
    const middleName = String(clientCreateForm.middleName || "").trim();
    const birthday = String(clientCreateForm.birthday || "").trim();
    const telegramOrEmail = String(clientCreateForm.telegramOrEmail || "").trim();
    const createErrors = validateClientCreateForm(clientCreateForm);
    setClientCreateErrors(createErrors);
    if (Object.keys(createErrors).length > 0) {
      return;
    }

    const payload = {
      firstName,
      lastName,
      middleName,
      birthday,
      phone: String(clientCreateForm.phone || "").trim(),
      tgMail: telegramOrEmail,
      isVip: Boolean(clientCreateForm.isVip),
      note: ""
    };

    try {
      setClientCreateSubmitting(true);

      const response = await apiFetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        if (data?.errors && typeof data.errors === "object") {
          setClientCreateErrors({
            firstName: data.errors.firstName || data.errors.fullName || "",
            lastName: data.errors.lastName || "",
            middleName: data.errors.middleName || "",
            birthday: data.errors.birthday || data.errors.notes || "",
            phone: data.errors.phone || "",
            telegramOrEmail: data.errors.tgMail || data.errors.notes || ""
          });
        } else if (data?.field) {
          if (data.field === "fullName" || data.field === "firstName") {
            setClientCreateErrors({ firstName: data.message || "Invalid value." });
          } else if (data.field === "lastName") {
            setClientCreateErrors({ lastName: data.message || "Invalid value." });
          } else if (data.field === "middleName") {
            setClientCreateErrors({ middleName: data.message || "Invalid value." });
          } else if (data.field === "birthday") {
            setClientCreateErrors({ birthday: data.message || "Invalid value." });
          } else if (data.field === "notes") {
            setClientCreateErrors({ telegramOrEmail: data.message || "Invalid value." });
          } else if (data.field === "tgMail") {
            setClientCreateErrors({ telegramOrEmail: data.message || "Invalid value." });
          } else {
            setClientCreateErrors({ [data.field]: data.message || "Invalid value." });
          }
        } else {
          setClientCreateErrors({ firstName: data?.message || "Failed to create client." });
        }
        return;
      }

      setClientCreateForm({
        firstName: "",
        lastName: "",
        middleName: "",
        birthday: "",
        phone: "",
        telegramOrEmail: "",
        isVip: false
      });
      setClientCreateErrors({});
      await loadClients(1);
    } catch {
      setClientCreateErrors({ firstName: "Unexpected error. Please try again." });
    } finally {
      setClientCreateSubmitting(false);
    }
  }

  function startClientEdit(item) {
    setClientEditId(String(item?.id || ""));
    setClientsEditOpen(true);
    setClientEditForm({
      firstName: String(item?.firstName || item?.first_name || "").trim(),
      lastName: String(item?.lastName || item?.last_name || "").trim(),
      middleName: String(item?.middleName || item?.middle_name || "").trim(),
      birthday: formatDateForInput(item?.birthday || item?.birthdate || ""),
      phone: String(item?.phone || ""),
      tgMail: String(
        item?.tgMail
        || item?.telegramOrEmail
        || item?.telegram_or_email
        || item?.tg_mail
        || ""
      ).trim(),
      isVip: Boolean(item?.isVip ?? item?.is_vip),
      note: String(item?.note || "").trim()
    });
    setClientEditErrors({});
  }

  function cancelClientEdit() {
    closeClientsEditModal();
  }

  async function handleClientEditSave(id) {
    if (!canManageClients) {
      setClientEditErrors({ firstName: "You do not have permission to manage clients." });
      return;
    }

    const clientId = String(id || "").trim();
    if (!clientId) {
      return;
    }

    const payload = {
      firstName: String(clientEditForm.firstName || "").trim(),
      lastName: String(clientEditForm.lastName || "").trim(),
      middleName: String(clientEditForm.middleName || "").trim(),
      birthday: String(clientEditForm.birthday || "").trim(),
      phone: String(clientEditForm.phone || "").trim(),
      tgMail: String(clientEditForm.tgMail || "").trim(),
      isVip: Boolean(clientEditForm.isVip),
      note: String(clientEditForm.note || "").trim()
    };

    const errors = validateClientEditForm(clientEditForm);
    setClientEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    try {
      setClientEditSubmitting(true);

      const response = await apiFetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        if (data?.errors && typeof data.errors === "object") {
          setClientEditErrors({
            firstName: data.errors.firstName || data.errors.fullName || "",
            lastName: data.errors.lastName || "",
            middleName: data.errors.middleName || "",
            birthday: data.errors.birthday || data.errors.notes || "",
            phone: data.errors.phone || "",
            tgMail: data.errors.tgMail || "",
            isVip: data.errors.isVip || "",
            note: data.errors.note || ""
          });
        } else if (data?.field) {
          setClientEditErrors({ [data.field]: data.message || "Invalid value." });
        } else {
          setClientEditErrors({ firstName: data?.message || "Failed to update client." });
        }
        return;
      }

      closeClientsEditModal();
      await loadClients(clientsPage);
    } catch {
      setClientEditErrors({ firstName: "Unexpected error. Please try again." });
    } finally {
      setClientEditSubmitting(false);
    }
  }

  async function handleClientEditSubmit(event) {
    event.preventDefault();
    await handleClientEditSave(clientEditId);
  }

  function openClientsDeleteModal(client) {
    if (!canManageClients) {
      return;
    }

    const clientId = String(client?.id || "").trim();
    if (!clientId) {
      return;
    }

    const firstName = String(client?.firstName || client?.first_name || "").trim();
    const lastName = String(client?.lastName || client?.last_name || "").trim();
    const middleName = String(client?.middleName || client?.middle_name || "").trim();
    const label = [lastName, firstName, middleName].filter(Boolean).join(" ").trim();

    setClientsDelete({
      open: true,
      id: clientId,
      label,
      error: "",
      submitting: false
    });
  }

  async function handleClientsDeleteConfirm() {
    if (!canManageClients) {
      setClientsDelete((prev) => ({
        ...prev,
        error: "You do not have permission to manage clients."
      }));
      return;
    }

    const clientId = String(clientsDelete.id || "").trim();
    if (!clientId) {
      return;
    }

    try {
      setClientsDelete((prev) => ({
        ...prev,
        submitting: true,
        error: ""
      }));

      const response = await apiFetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "DELETE"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setClientsDelete((prev) => ({
          ...prev,
          submitting: false,
          error: data?.message || "Failed to delete client."
        }));
        return;
      }

      if (clientEditId === clientId) {
        closeClientsEditModal();
      }
      closeClientsDeleteModal();
      await loadClients(clientsPage);
    } catch {
      setClientsDelete((prev) => ({
        ...prev,
        submitting: false,
        error: "Unexpected error. Please try again."
      }));
    }
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
      errorField: "",
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
      errorField: "",
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
        error: "",
        errorField: ""
      }));

      if (profileEdit.mode === "password") {
        const currentPassword = String(profileEdit.currentPassword || "");
        const newPassword = String(profileEdit.newPassword || "").trim();

        if (!currentPassword) {
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: "Current password is required.",
            errorField: "currentPassword"
          }));
          return;
        }

        if (newPassword.length < 6) {
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: "Password must be at least 6 characters.",
            errorField: "newPassword"
          }));
          return;
        }
        if (currentPassword === newPassword) {
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: "New password must be different from current password.",
            errorField: "newPassword"
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
          const apiField = String(data?.field || "").trim();
          const mappedField = apiField === "password"
            ? "newPassword"
            : (apiField === "currentPassword" ? "currentPassword" : "");
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: data?.message || "Failed to update profile.",
            errorField: mappedField
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
          error: "Full name is required.",
          errorField: "fullName"
        }));
        return;
      }

      const birthdayError = getBirthdayValidationMessage(nextValues.birthday);
      if (birthdayError) {
        setProfileEdit((prev) => ({
          ...prev,
          submitting: false,
          error: birthdayError,
          errorField: "birthday"
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
          const apiField = String(data?.field || field || "").trim();
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: data?.message || "Failed to update profile.",
            errorField: apiField
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
        error: "Unexpected error. Please try again.",
        errorField: ""
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

    const birthdayError = getBirthdayValidationMessage(payload.birthday);
    if (birthdayError) {
      setAllUsersEdit((prev) => ({
        ...prev,
        submitting: false,
        errors: { ...prev.errors, birthday: birthdayError }
      }));
      return;
    }

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

        <ProfileMainContent
          mainView={mainView}
          allUsersMessage={allUsersMessage}
          allUsers={allUsers}
          canUpdateUsers={canUpdateUsers}
          canDeleteUsers={canDeleteUsers}
          openAllUsersEditModal={openAllUsersEditModal}
          openAllUsersDeleteModal={openAllUsersDeleteModal}
          allUsersPage={allUsersPage}
          allUsersTotalPages={allUsersTotalPages}
          allUsersLoading={allUsersLoading}
          loadAllUsers={loadAllUsers}
          closeAllUsersPanel={closeAllUsersPanel}
          closeAllClientsPanel={closeAllClientsPanel}
          closeCreateClientPanel={closeCreateClientPanel}
          clients={clients}
          clientsMessage={clientsMessage}
          clientsLoading={clientsLoading}
          clientsPage={clientsPage}
          clientsTotalPages={clientsTotalPages}
          loadClients={loadClients}
          canManageClients={canManageClients}
          clientCreateForm={clientCreateForm}
          clientCreateErrors={clientCreateErrors}
          clientCreateSubmitting={clientCreateSubmitting}
          setClientCreateForm={setClientCreateForm}
          setClientCreateErrors={setClientCreateErrors}
          handleClientCreateSubmit={handleClientCreateSubmit}
          clientEditId={clientEditId}
          clientEditForm={clientEditForm}
          clientEditErrors={clientEditErrors}
          clientEditSubmitting={clientEditSubmitting}
          setClientEditForm={setClientEditForm}
          setClientEditErrors={setClientEditErrors}
          startClientEdit={startClientEdit}
          cancelClientEdit={cancelClientEdit}
          handleClientEditSave={handleClientEditSave}
          openClientsDeleteModal={openClientsDeleteModal}
          closeAppointmentPanel={closeAppointmentPanel}
          closeOrganizationsPanel={closeOrganizationsPanel}
          closeRolesPanel={closeRolesPanel}
          closePositionsPanel={closePositionsPanel}
          organizations={organizations}
          organizationsMessage={organizationsMessage}
          organizationCreateForm={organizationCreateForm}
          organizationCreateError={organizationCreateError}
          organizationCreateSubmitting={organizationCreateSubmitting}
          setOrganizationCreateForm={setOrganizationCreateForm}
          setOrganizationCreateError={setOrganizationCreateError}
          handleOrganizationCreateSubmit={handleOrganizationCreateSubmit}
          startOrganizationEdit={startOrganizationEdit}
          organizationDeletingId={organizationDeletingId}
          handleOrganizationDelete={handleOrganizationDelete}
          rolesSettings={rolesSettings}
          rolesSettingsMessage={rolesSettingsMessage}
          roleCreateForm={roleCreateForm}
          roleCreateError={roleCreateError}
          roleCreateSubmitting={roleCreateSubmitting}
          setRoleCreateForm={setRoleCreateForm}
          setRoleCreateError={setRoleCreateError}
          handleRoleCreateSubmit={handleRoleCreateSubmit}
          startRoleEdit={startRoleEdit}
          roleDeletingId={roleDeletingId}
          handleRoleDelete={handleRoleDelete}
          positionsSettings={positionsSettings}
          positionsSettingsMessage={positionsSettingsMessage}
          positionCreateForm={positionCreateForm}
          positionCreateError={positionCreateError}
          positionCreateSubmitting={positionCreateSubmitting}
          setPositionCreateForm={setPositionCreateForm}
          setPositionCreateError={setPositionCreateError}
          handlePositionCreateSubmit={handlePositionCreateSubmit}
          startPositionEdit={startPositionEdit}
          positionDeletingId={positionDeletingId}
          handlePositionDelete={handlePositionDelete}
          canCreateUsers={canCreateUsers}
          handleCreateUserSubmit={handleCreateUserSubmit}
          createForm={createForm}
          createErrors={createErrors}
          createSubmitting={createSubmitting}
          organizationsLoading={organizationsLoading}
          createOrganizationOptions={createOrganizationOptions}
          setCreateForm={setCreateForm}
          setCreateErrors={setCreateErrors}
          roleOptions={roleOptions}
          closeCreateUserPanel={closeCreateUserPanel}
        />

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

      {hasAnyModalOpen && (
        <ProfileModals
          myProfileModalOpen={myProfileModalOpen}
          closeMyProfilePanel={closeMyProfilePanel}
          openAvatarPicker={openAvatarPicker}
          avatarDataUrl={avatarDataUrl}
          avatarFallback={avatarFallback}
          profile={profile}
          openProfileEditModal={openProfileEditModal}
          openPasswordEditModal={openPasswordEditModal}
          logoutConfirmOpen={logoutConfirmOpen}
          handleLogout={handleLogout}
          setLogoutConfirmOpen={setLogoutConfirmOpen}
          profileEdit={profileEdit}
          handleProfileEditSubmit={handleProfileEditSubmit}
          setProfileEdit={setProfileEdit}
          positionOptions={positionOptions}
          closeProfileEditModal={closeProfileEditModal}
          allUsersEdit={allUsersEdit}
          handleAllUsersEditSubmit={handleAllUsersEditSubmit}
          organizationsLoading={organizationsLoading}
          createOrganizationOptions={createOrganizationOptions}
          setAllUsersEdit={setAllUsersEdit}
          roleOptions={roleOptions}
          closeAllUsersEditModal={closeAllUsersEditModal}
          allUsersDelete={allUsersDelete}
          handleAllUsersDelete={handleAllUsersDelete}
          closeAllUsersDeleteModal={closeAllUsersDeleteModal}
          clientsEditOpen={clientsEditOpen}
          clientEditForm={clientEditForm}
          clientEditErrors={clientEditErrors}
          clientEditSubmitting={clientEditSubmitting}
          setClientEditForm={setClientEditForm}
          setClientEditErrors={setClientEditErrors}
          handleClientEditSubmit={handleClientEditSubmit}
          closeClientsEditModal={closeClientsEditModal}
          clientsDelete={clientsDelete}
          handleClientsDeleteConfirm={handleClientsDeleteConfirm}
          closeClientsDeleteModal={closeClientsDeleteModal}
          settingsDelete={settingsDelete}
          handleSettingsDeleteConfirm={handleSettingsDeleteConfirm}
          closeSettingsDeleteModal={closeSettingsDeleteModal}
          organizationEditOpen={organizationEditOpen}
          handleOrganizationEditSave={handleOrganizationEditSave}
          organizationEditForm={organizationEditForm}
          setOrganizationEditForm={setOrganizationEditForm}
          organizationEditError={organizationEditError}
          setOrganizationEditError={setOrganizationEditError}
          organizationEditSubmitting={organizationEditSubmitting}
          cancelOrganizationEdit={cancelOrganizationEdit}
          roleEditOpen={roleEditOpen}
          handleRoleEditSave={handleRoleEditSave}
          roleEditTab={roleEditTab}
          setRoleEditTab={setRoleEditTab}
          groupedRolePermissionOptions={groupedRolePermissionOptions}
          roleEditForm={roleEditForm}
          setRoleEditForm={setRoleEditForm}
          roleEditError={roleEditError}
          setRoleEditError={setRoleEditError}
          roleEditSubmitting={roleEditSubmitting}
          cancelRoleEdit={cancelRoleEdit}
          positionEditOpen={positionEditOpen}
          handlePositionEditSave={handlePositionEditSave}
          positionEditForm={positionEditForm}
          setPositionEditForm={setPositionEditForm}
          positionEditError={positionEditError}
          setPositionEditError={setPositionEditError}
          positionEditSubmitting={positionEditSubmitting}
          cancelPositionEdit={cancelPositionEdit}
        />
      )}

      <ProfileSideMenu
        menuRef={menuRef}
        menuOpen={menuOpen}
        canReadClients={canReadClients}
        canManageClients={canManageClients}
        clientsMenuOpen={clientsMenuOpen}
        setClientsMenuOpen={setClientsMenuOpen}
        openAllClientsPanel={openAllClientsPanel}
        openCreateClientPanel={openCreateClientPanel}
        canReadAppointments={canReadAppointments}
        openAppointmentPanel={openAppointmentPanel}
        hasUsersMenuAccess={hasUsersMenuAccess}
        usersMenuOpen={usersMenuOpen}
        setUsersMenuOpen={setUsersMenuOpen}
        setSettingsMenuOpen={setSettingsMenuOpen}
        canReadUsers={canReadUsers}
        closeMenu={closeMenu}
        navigate={navigate}
        canCreateUsers={canCreateUsers}
        openCreateUserPanel={openCreateUserPanel}
        hasSettingsMenuAccess={hasSettingsMenuAccess}
        settingsMenuOpen={settingsMenuOpen}
        openOrganizationsPanel={openOrganizationsPanel}
        openRolesPanel={openRolesPanel}
        openPositionsPanel={openPositionsPanel}
      />
    </>
  );
}

export default ProfilePage;

