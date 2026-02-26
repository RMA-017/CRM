import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE_URL, apiFetch } from "../lib/api.js";
import { formatDateForInput, getInitial, normalizeProfile } from "../lib/formatters.js";
import {
  createEmptyProfileEditState,
  EMPTY_PROFILE_EDIT_FORM,
  LOGOUT_FLAG_KEY,
  ORGANIZATION_CODE_REGEX,
  USERNAME_REGEX
} from "./profile/profile.constants.js";
import {
  handleProtectedStatus,
  mapValueLabelOptions,
} from "./profile/profile.helpers.js";
import ProfileMainContent from "./profile/ProfileMainContent.jsx";
import ProfileModals from "./profile/ProfileModals.jsx";
import ProfileSideMenu from "./profile/ProfileSideMenu.jsx";
import { useAllUsersSection } from "./profile/useAllUsersSection.js";
import { useClientsSection } from "./profile/useClientsSection.js";
import { useProfileAccess } from "./profile/useProfileAccess.js";
import { useProfilePanels } from "./profile/useProfilePanels.js";
import { useSettingsSection } from "./profile/useSettingsSection.js";
import { getBirthdayValidationMessage } from "./profile/profile.validators.js";

function ProfilePage({ forcedView = "none" }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const menuToggleRef = useRef(null);
  const avatarInputRef = useRef(null);
  const notificationReloadTimerRef = useRef(null);
  const pendingNotificationFallbackRef = useRef([]);

  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);
  const [clientsMenuOpen, setClientsMenuOpen] = useState(false);
  const [appointmentMenuOpen, setAppointmentMenuOpen] = useState(false);
  const [usersMenuOpen, setUsersMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [myProfileModalOpen, setMyProfileModalOpen] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationSendForm, setNotificationSendForm] = useState({
    message: "",
    targetRole: "all"
  });
  const [notificationSendSubmitting, setNotificationSendSubmitting] = useState(false);
  const [notificationSendError, setNotificationSendError] = useState("");
  const [notificationSendSuccess, setNotificationSendSuccess] = useState("");

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

  const {
    canReadUsers,
    canCreateUsers,
    canUpdateUsers,
    canDeleteUsers,
    canReadClients,
    canCreateClients,
    canUpdateClients,
    canDeleteClients,
    hasClientsMenuAccess,
    canReadAppointments,
    canCreateAppointments,
    canUpdateAppointments,
    canDeleteAppointments,
    canSendNotifications,
    canOpenAppointmentSchedule,
    canOpenAppointmentBreaks,
    canOpenAppointmentVipClients,
    hasAppointmentsMenuAccess,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    hasNotificationsSettingsAccess,
    canAccessForcedView
  } = useProfileAccess(profile, forcedView);

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

  const {
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
    rolesSettingsMessage,
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
    positionsSettingsMessage,
    positionCreateForm,
    positionCreateError,
    positionCreateSubmitting,
    positionEditOpen,
    positionEditForm,
    positionEditError,
    positionEditSubmitting,
    positionDeletingId,
    adminOptionsForm,
    adminOptionsLoading,
    adminOptionsMessage,
    adminOptionsError,
    adminOptionsSubmitting,
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
    setAdminOptionsForm,
    setAdminOptionsError,
    loadOrganizations,
    loadRolesSettings,
    loadPositionsSettings,
    loadAdminOptions,
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
    handleAdminOptionsSubmit,
    closeSettingsDeleteModal,
    handleSettingsDeleteConfirm
  } = useSettingsSection({
    hasSettingsMenuAccess,
    navigate,
    loadUserOptions
  });

  const ensureOrganizationsLoaded = useCallback(() => {
    if (hasSettingsMenuAccess && !organizationsLoading && organizations.length === 0) {
      loadOrganizations();
    }
  }, [hasSettingsMenuAccess, organizations.length, organizationsLoading, loadOrganizations]);

  const {
    allUsers,
    allUsersLoading,
    allUsersMessage,
    allUsersPage,
    allUsersTotalPages,
    allUsersEdit,
    allUsersDelete,
    setAllUsersEdit,
    loadAllUsers,
    openAllUsersEditModal,
    openAllUsersDeleteModal,
    handleAllUsersEditSubmit,
    handleAllUsersDelete,
    closeAllUsersEditModal,
    closeAllUsersDeleteModal
  } = useAllUsersSection({
    canReadUsers,
    canUpdateUsers,
    canDeleteUsers,
    navigate,
    ensureOrganizationsLoaded,
    getBirthdayValidationMessage
  });

  const {
    clients,
    clientsLoading,
    clientsMessage,
    clientsPage,
    clientsTotalPages,
    vipClients,
    vipClientsLoading,
    vipClientsMessage,
    vipClientsPage,
    vipClientsTotalPages,
    clientCreateForm,
    clientCreateErrors,
    clientCreateSubmitting,
    clientEditId,
    clientEditForm,
    clientEditErrors,
    clientEditSubmitting,
    clientsEditOpen,
    clientsDelete,
    setClientCreateForm,
    setClientCreateErrors,
    setClientEditForm,
    setClientEditErrors,
    loadClients,
    loadVipClients,
    handleClientCreateSubmit,
    startClientEdit,
    handleClientEditSubmit,
    openClientsDeleteModal,
    handleClientsDeleteConfirm,
    closeClientsEditModal,
    closeClientsDeleteModal
  } = useClientsSection({
    canReadClients,
    canCreateClients,
    canUpdateClients,
    canDeleteClients,
    navigate,
    getBirthdayValidationMessage
  });

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

  const hasAnyModalOpen = (
    myProfileModalOpen
    || notificationsModalOpen
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
    setAppointmentMenuOpen(false);
    setUsersMenuOpen(false);
    setSettingsMenuOpen(false);
  }, []);

  const closeUserDropdown = useCallback(() => {}, []);

  const openNotificationsPanel = useCallback(() => {
    closeMenu();
    closeUserDropdown();
    setNotificationsModalOpen(true);
  }, [closeMenu, closeUserDropdown]);

  const closeNotificationsPanel = useCallback(() => {
    setNotificationsModalOpen(false);
  }, []);

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!profile?.username) {
      return false;
    }
    try {
      const response = await apiFetch("/api/notifications?limit=100", {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        handleProtectedStatus(response, navigate);
        return false;
      }

      const items = Array.isArray(data?.items)
        ? data.items.map((item) => ({
            id: String(item?.id || "").trim(),
            eventType: String(item?.eventType || item?.event_type || "").trim().toLowerCase(),
            message: String(item?.message || "").trim(),
            payload: item?.payload && typeof item.payload === "object" ? item.payload : {},
            isRead: Boolean(item?.isRead ?? item?.is_read),
            readAt: item?.readAt || item?.read_at || null,
            createdAt: item?.createdAt || item?.created_at || null
          }))
        : [];
      setNotifications(items);
      return true;
    } catch {
      if (!silent) {
        setNotifications([]);
      }
      return false;
    }
  }, [navigate, profile?.username]);

  const markNotificationsRead = useCallback(async () => {
    if (!profile?.username) {
      return;
    }
    try {
      const response = await apiFetch("/api/notifications/read-all", {
        method: "PATCH"
      });
      if (!response.ok) {
        handleProtectedStatus(response, navigate);
        return;
      }
      const readAtValue = new Date().toISOString();
      setNotifications((prev) => (
        Array.isArray(prev)
          ? prev.map((item) => (
              item?.isRead
                ? item
                : { ...item, isRead: true, readAt: item?.readAt || readAtValue }
            ))
          : []
      ));
    } catch {
      // Ignore notification read errors in UI.
    }
  }, [navigate, profile?.username]);

  const clearNotifications = useCallback(async () => {
    if (!profile?.username) {
      setNotifications([]);
      return;
    }

    try {
      const response = await apiFetch("/api/notifications", {
        method: "DELETE"
      });
      if (!response.ok) {
        handleProtectedStatus(response, navigate);
      }
    } catch {
      // Ignore clear errors and still clear local list.
    } finally {
      setNotifications([]);
    }
  }, [navigate, profile?.username]);

  const sendManualNotification = useCallback(async () => {
    if (!canSendNotifications) {
      window.alert("You do not have permission to send notifications.");
      return;
    }

    const message = String(notificationSendForm.message || "").trim();
    const targetRole = String(notificationSendForm.targetRole || "").trim().toLowerCase();
    if (!message) {
      window.alert("Message is required.");
      return;
    }
    if (!targetRole) {
      window.alert("Select recipient group.");
      return;
    }

    try {
      setNotificationSendSubmitting(true);

      const response = await apiFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          targetRoles: [targetRole]
        })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        window.alert(data?.message || "Failed to send notification.");
        return;
      }

      setNotificationSendForm((prev) => ({ ...prev, message: "" }));
      window.alert(data?.message || "Notification sent.");
    } catch {
      window.alert("Unexpected error. Please try again.");
    } finally {
      setNotificationSendSubmitting(false);
    }
  }, [canSendNotifications, navigate, notificationSendForm.message, notificationSendForm.targetRole]);

  const handleAppointmentNotification = useCallback((notification) => {
    const normalizedMessage = String(notification?.message || "").trim();
    if (!normalizedMessage) {
      return;
    }
    const eventType = String(notification?.eventType || notification?.type || "").trim().toLowerCase();
    const payload = notification?.payload && typeof notification.payload === "object"
      ? notification.payload
      : {};
    const createdAt = notification?.createdAt || notification?.timestamp || new Date().toISOString();

    setNotifications((prev) => (
      [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          eventType,
          message: normalizedMessage,
          payload,
          isRead: false,
          readAt: null,
          createdAt
        },
        ...prev
      ].slice(0, 50)
    ));
  }, []);

  const unreadNotificationsCount = useMemo(() => {
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return 0;
    }
    return notifications.reduce((count, item) => (
      item?.isRead ? count : count + 1
    ), 0);
  }, [notifications]);

  const scheduleNotificationsReload = useCallback((fallbackNotification) => {
    if (fallbackNotification && typeof fallbackNotification === "object") {
      pendingNotificationFallbackRef.current = [
        ...pendingNotificationFallbackRef.current,
        fallbackNotification
      ].slice(-50);
    }

    if (notificationReloadTimerRef.current) {
      clearTimeout(notificationReloadTimerRef.current);
    }

    notificationReloadTimerRef.current = setTimeout(() => {
      notificationReloadTimerRef.current = null;
      const queuedFallbacks = pendingNotificationFallbackRef.current;
      pendingNotificationFallbackRef.current = [];

      void loadNotifications({ silent: true }).then((loaded) => {
        if (loaded) {
          return;
        }
        queuedFallbacks.forEach((notification) => {
          handleAppointmentNotification(notification);
        });
      });
    }, 500);
  }, [handleAppointmentNotification, loadNotifications]);

  useEffect(() => () => {
    if (notificationReloadTimerRef.current) {
      clearTimeout(notificationReloadTimerRef.current);
      notificationReloadTimerRef.current = null;
    }
    pendingNotificationFallbackRef.current = [];
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
      return undefined;
    }
    if (!canReadAppointments || !profile?.username) {
      return undefined;
    }

    const ownUsername = String(profile.username || "").trim().toLowerCase();
    const eventSource = new window.EventSource(`${API_BASE_URL}/api/appointments/events`, {
      withCredentials: true
    });

    const handleAppointmentChange = (event) => {
      let payload = {};
      try {
        payload = JSON.parse(String(event?.data || "{}"));
      } catch {
        payload = {};
      }

      const sourceUsername = String(payload?.sourceUsername || "").trim().toLowerCase();
      const isOwnChange = Boolean(ownUsername) && sourceUsername === ownUsername;

      window.dispatchEvent(new window.CustomEvent("crm:appointment-change", { detail: payload }));

      if (!isOwnChange) {
        const notificationText = String(payload?.message || "").trim() || "Appointment schedule changed.";
        const notificationPayloadData = payload?.data && typeof payload.data === "object" ? payload.data : {};
        scheduleNotificationsReload({
          eventType: payload?.type,
          message: notificationText,
          payload: { data: notificationPayloadData },
          createdAt: payload?.timestamp || new Date().toISOString()
        });
      }
    };

    eventSource.addEventListener("appointment-change", handleAppointmentChange);

    return () => {
      eventSource.removeEventListener("appointment-change", handleAppointmentChange);
      eventSource.close();
    };
  }, [canReadAppointments, profile?.username, scheduleNotificationsReload]);

  useEffect(() => {
    if (!profile?.username) {
      return;
    }
    void loadNotifications({ silent: true });
  }, [loadNotifications, profile?.username]);

  useEffect(() => {
    if (!notificationsModalOpen) {
      return;
    }
    void loadNotifications({ silent: true });
    void markNotificationsRead();
  }, [loadNotifications, markNotificationsRead, notificationsModalOpen]);

  const closeProfileEditModal = useCallback(() => {
    setProfileEdit(createEmptyProfileEditState());
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
    if (mainView === "appointment-vip-clients") {
      loadVipClients(1);
      return;
    }
    if (mainView === "create-user") {
      if (hasSettingsMenuAccess) {
        loadOrganizations();
      }
      return;
    }
    if (mainView === "appointment-settings" || mainView === "appointment-breaks") {
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
      return;
    }
    if (mainView === "settings-admin-options") {
      loadOrganizations();
      loadAdminOptions();
      return;
    }
    if (mainView === "settings-notifications") {
      loadRolesSettings();
      return;
    }
  }, [
    hasSettingsMenuAccess,
    loadClients,
    loadVipClients,
    loadAllUsers,
    loadAdminOptions,
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
    function handleEscape(event) {
      if (event.key !== "Escape") {
        return;
      }
      closeMenu();
      closeUserDropdown();
      setMyProfileModalOpen(false);
      setNotificationsModalOpen(false);
      setLogoutConfirmOpen(false);
      cancelOrganizationEdit();
      cancelRoleEdit();
      cancelPositionEdit();
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
    closeUserDropdown,
    cancelOrganizationEdit,
    cancelRoleEdit,
    cancelPositionEdit
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

  const {
    openMyProfilePanel,
    closeMyProfilePanel,
    openCreateUserPanel,
    openAllClientsPanel,
    closeAllClientsPanel,
    openCreateClientPanel,
    closeCreateClientPanel,
    openAppointmentPanel,
    closeAppointmentPanel,
    openAppointmentBreaksPanel,
    closeAppointmentBreaksPanel,
    openAppointmentSettingsPanel,
    closeAppointmentSettingsPanel,
    openAppointmentVipClientsPanel,
    closeAppointmentVipClientsPanel,
    openOrganizationsPanel,
    closeOrganizationsPanel,
    openRolesPanel,
    closeRolesPanel,
    openPositionsPanel,
    closePositionsPanel,
    openAdminOptionsPanel,
    closeAdminOptionsPanel,
    openNotificationsSettingsPanel,
    closeNotificationsSettingsPanel,
    closeCreateUserPanel,
    closeAllUsersPanel
  } = useProfilePanels({
    navigate,
    mainView,
    closeMenu,
    closeUserDropdown,
    setMyProfileModalOpen,
    canCreateUsers,
    canReadClients,
    canCreateClients,
    canOpenAppointmentSchedule,
    canOpenAppointmentBreaks,
    canOpenAppointmentVipClients,
    hasSettingsMenuAccess,
    hasNotificationsSettingsAccess
  });

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
            <button
              id="headerNotificationsBtn"
              type="button"
              className={`header-btn header-notification-btn${unreadNotificationsCount > 0 ? " has-unread" : ""}`}
              aria-label="Open notifications"
              title="Notifications"
              onClick={openNotificationsPanel}
            >
              <span className="header-notification-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" focusable="false">
                  <path
                    d="M15 17H9M18 17V11C18 8.23858 15.7614 6 13 6H11C8.23858 6 6 8.23858 6 11V17M18 17H6M18 17H20M6 17H4M14 20C14 21.1046 13.1046 22 12 22C10.8954 22 10 21.1046 10 20"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {unreadNotificationsCount > 0 ? (
                <span className="header-notification-badge" aria-hidden="true">
                  {unreadNotificationsCount > 99 ? "99+" : String(unreadNotificationsCount)}
                </span>
              ) : null}
            </button>
            <div className="user-menu-wrap">
              <button
                id="headerUserNameBtn"
                type="button"
                className="header-btn user-name-btn"
                onClick={openMyProfilePanel}
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
          vipClients={vipClients}
          vipClientsMessage={vipClientsMessage}
          vipClientsLoading={vipClientsLoading}
          vipClientsPage={vipClientsPage}
          vipClientsTotalPages={vipClientsTotalPages}
          loadVipClients={loadVipClients}
          canCreateClients={canCreateClients}
          canUpdateClients={canUpdateClients}
          canDeleteClients={canDeleteClients}
          clientCreateForm={clientCreateForm}
          clientCreateErrors={clientCreateErrors}
          clientCreateSubmitting={clientCreateSubmitting}
          setClientCreateForm={setClientCreateForm}
          setClientCreateErrors={setClientCreateErrors}
          handleClientCreateSubmit={handleClientCreateSubmit}
          startClientEdit={startClientEdit}
          openClientsDeleteModal={openClientsDeleteModal}
          canCreateAppointments={canCreateAppointments}
          canUpdateAppointments={canUpdateAppointments}
          canDeleteAppointments={canDeleteAppointments}
          closeAppointmentPanel={closeAppointmentPanel}
          closeAppointmentBreaksPanel={closeAppointmentBreaksPanel}
          closeAppointmentSettingsPanel={closeAppointmentSettingsPanel}
          closeAppointmentVipClientsPanel={closeAppointmentVipClientsPanel}
          closeOrganizationsPanel={closeOrganizationsPanel}
          closeRolesPanel={closeRolesPanel}
          closePositionsPanel={closePositionsPanel}
          closeAdminOptionsPanel={closeAdminOptionsPanel}
          closeNotificationsSettingsPanel={closeNotificationsSettingsPanel}
          canSendNotifications={canSendNotifications}
          notificationSendForm={notificationSendForm}
          notificationSendSubmitting={notificationSendSubmitting}
          notificationSendError={notificationSendError}
          notificationSendSuccess={notificationSendSuccess}
          setNotificationSendForm={setNotificationSendForm}
          setNotificationSendError={setNotificationSendError}
          sendManualNotification={sendManualNotification}
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
          adminOptionsForm={adminOptionsForm}
          adminOptionsLoading={adminOptionsLoading}
          adminOptionsMessage={adminOptionsMessage}
          adminOptionsError={adminOptionsError}
          adminOptionsSubmitting={adminOptionsSubmitting}
          setAdminOptionsForm={setAdminOptionsForm}
          setAdminOptionsError={setAdminOptionsError}
          loadAdminOptions={loadAdminOptions}
          handleAdminOptionsSubmit={handleAdminOptionsSubmit}
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
          profile={profile}
          onAppointmentNotification={handleAppointmentNotification}
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
          notificationsModalOpen={notificationsModalOpen}
          closeNotificationsPanel={closeNotificationsPanel}
          notifications={notifications}
          clearNotifications={clearNotifications}
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
        hasClientsMenuAccess={hasClientsMenuAccess}
        canReadClients={canReadClients}
        canCreateClients={canCreateClients}
        clientsMenuOpen={clientsMenuOpen}
        setClientsMenuOpen={setClientsMenuOpen}
        openAllClientsPanel={openAllClientsPanel}
        openCreateClientPanel={openCreateClientPanel}
        hasAppointmentsMenuAccess={hasAppointmentsMenuAccess}
        canOpenAppointmentSchedule={canOpenAppointmentSchedule}
        canOpenAppointmentBreaks={canOpenAppointmentBreaks}
        canOpenAppointmentVipClients={canOpenAppointmentVipClients}
        appointmentMenuOpen={appointmentMenuOpen}
        setAppointmentMenuOpen={setAppointmentMenuOpen}
        openAppointmentPanel={openAppointmentPanel}
        openAppointmentBreaksPanel={openAppointmentBreaksPanel}
        openAppointmentSettingsPanel={openAppointmentSettingsPanel}
        openAppointmentVipClientsPanel={openAppointmentVipClientsPanel}
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
        hasNotificationsSettingsAccess={hasNotificationsSettingsAccess}
        settingsMenuOpen={settingsMenuOpen}
        openOrganizationsPanel={openOrganizationsPanel}
        openRolesPanel={openRolesPanel}
        openPositionsPanel={openPositionsPanel}
        openAdminOptionsPanel={openAdminOptionsPanel}
        openNotificationsSettingsPanel={openNotificationsSettingsPanel}
      />
    </>
  );
}

export default ProfilePage;
