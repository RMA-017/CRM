import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CustomSelect from "../components/CustomSelect.jsx";
import "../css/profile.css";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../lib/api.js";
import { LOGOUT_FLAG_KEY } from "../lib/auth-flags.js";
import { formatDateForInput, normalizeProfile } from "../lib/formatters.js";
import {
  createEmptyProfileEditState,
  EMPTY_PROFILE_EDIT_FORM,
  ORGANIZATION_CODE_REGEX,
  USERNAME_REGEX
} from "./profile/profile.constants.js";
import {
  handleProtectedStatus,
  isViewBlockedByOrgFeatures,
  mapValueLabelOptions,
} from "./profile/profile.helpers.js";
import { useAllUsersSection } from "./profile/useAllUsersSection.js";
import { useClientsSection } from "./profile/useClientsSection.js";
import { useProfileAccess } from "./profile/useProfileAccess.js";
import { useProfileAvatar } from "./profile/useProfileAvatar.js";
import { useProfileNotifications } from "./profile/useProfileNotifications.js";
import { useProfilePanels } from "./profile/useProfilePanels.js";
import { useSettingsSection } from "./profile/useSettingsSection.js";
import { getBirthdayValidationMessage } from "./profile/profile.validators.js";

const ProfileModals = lazy(() => import("./profile/ProfileModals.jsx"));
const ProfileMainContent = lazy(() => import("./profile/ProfileMainContent.jsx"));
let profileSideMenuPromise;
function loadProfileSideMenu() {
  profileSideMenuPromise ??= import("./profile/ProfileSideMenu.jsx");
  return profileSideMenuPromise;
}
const ProfileSideMenu = lazy(loadProfileSideMenu);

function ProfilePage({ forcedView = "none" }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const menuToggleRef = useRef(null);
  const sideMenuRef = useRef(null);
  const menuOpenRef = useRef(false);
  const pendingSideMenuOpenRef = useRef(false);

  const [profile, setProfile] = useState(null);
  const [organizationContextSwitching, setOrganizationContextSwitching] = useState(false);
  const [myProfileModalOpen, setMyProfileModalOpen] = useState(false);
  const [sideMenuMounted, setSideMenuMounted] = useState(false);

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
  const [clientMedicalHistorySpecialistOptions, setClientMedicalHistorySpecialistOptions] = useState([]);

  const {
    canReadUsers,
    canCreateUsers,
    canUpdateUsers,
    canDeleteUsers,
    canReadClients,
    canCreateClients,
    canUpdateClients,
    canDeleteClients,
    canReadClientMedicalHistory,
    canCreateClientMedicalHistory,
    canUpdateClientMedicalHistory,
    canDeleteClientMedicalHistory,
    hasClientsMenuAccess,
    canReadAppointments,
    canCreateAppointments,
    canUpdateAppointments,
    canDeleteAppointments,
    canSendNotifications,
    canOpenAppointmentSchedule,
    canOpenAppointmentVipMyClass,
    canOpenAppointmentBreaks,
    canOpenAppointmentWorkSchedule,
    canOpenAppointmentVipClients,
    canOpenMyChildren,
    canOpenAppointmentVipDailyRoutines,
    canReadAppointmentVipClients,
    canCreateAppointmentVipClients,
    canUpdateAppointmentVipClients,
    canDeleteAppointmentVipClients,
    canOpenAppointmentVipClassAssignments,
    canOpenAppointmentVipTutorAssignments,
    canOpenAppointmentVipAssignments,
    canReadAppointmentVipAssignments,
    canCreateAppointmentVipAssignments,
    canUpdateAppointmentVipAssignments,
    canDeleteAppointmentVipAssignments,
    canOpenAppointmentStatistics,
    canOpenStatisticsClassAttendance,
    canOpenStatisticsPlannerReport,
    canOpenAppointmentSettings,
    canUpdateSettingsAppointments,
    canCreateSettingsAppointmentNorms,
    canUpdateSettingsAppointmentNorms,
    canDeleteSettingsAppointmentNorms,
    canOpenSettingsNorms,
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
    hasAppointmentsMenuAccess,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    hasAdminSettingsAccess,
    canAccessForcedView
  } = useProfileAccess(profile, forcedView);

  const loadUserOptions = useCallback(async (organizationCode = "") => {
    try {
      const query = new URLSearchParams();
      const normalizedOrganizationCode = String(organizationCode || "").trim().toLowerCase();
      if (normalizedOrganizationCode) {
        query.set("organizationCode", normalizedOrganizationCode);
      }
      const response = await apiFetch(
        query.toString() ? `/api/meta/user-options?${query.toString()}` : "/api/meta/user-options",
        {
        method: "GET",
        cache: "no-store"
        }
      );
      const data = await readApiResponseData(response);

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
      const nextSpecialists = mapValueLabelOptions(
        data?.specialists,
        (option) => option?.value,
        (option) => option?.label
      );

      setRoleOptions(nextRoles);
      setPositionOptions(nextPositions);
      setClientMedicalHistorySpecialistOptions(nextSpecialists);
    } catch {
      setRoleOptions([]);
      setPositionOptions([]);
      setClientMedicalHistorySpecialistOptions([]);
    }
  }, [navigate]);

  const {
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
  } = useSettingsSection({
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
    orgFeatures: Boolean(profile?.isPlatformAdmin) ? null : (profile?.orgFeatures ?? null)
  });

  const ensureOrganizationsLoaded = useCallback(() => {
    if (hasAdminSettingsAccess && organizations.length === 0) {
      loadOrganizations();
    }
  }, [hasAdminSettingsAccess, organizations.length, loadOrganizations]);

  const {
    allUsers,
    allUsersLoading,
    allUsersMessage,
    allUsersLoadedOnce,
    allUsersPage,
    allUsersTotalPages,
    allUsersSearch,
    setAllUsersSearch,
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
    clientsSearch,
    setClientsSearch,
    clientsIsVip,
    setClientsIsVip,
    clientCreateForm,
    clientCreateErrors,
    clientCreateSubmitting,
    clientEditId,
    clientEditForm,
    clientEditErrors,
    clientEditSubmitting,
    clientsEditOpen,
    clientsDelete,
    clientMedicalHistoryOpen,
    clientMedicalHistoryClient,
    clientMedicalHistoryClientSearch,
    clientMedicalHistoryClientOptions,
    clientMedicalHistoryClientOptionsLoading,
    clientMedicalHistoryMode,
    clientMedicalHistoryItems,
    clientMedicalHistorySkeletonCount,
    clientMedicalHistoryLoading,
    clientMedicalHistoryMessage,
    clientMedicalHistoryForm,
    clientMedicalHistoryErrors,
    clientMedicalHistorySubmitting,
    clientMedicalHistoryDeletingId,
    clientMedicalHistoryDelete,
    setClientCreateForm,
    setClientCreateErrors,
    setClientEditForm,
    setClientEditErrors,
    setClientMedicalHistoryClientSearch,
    setClientMedicalHistoryForm,
    setClientMedicalHistoryErrors,
    loadClients,
    loadClientMedicalHistoryClients,
    handleClientCreateSubmit,
    startClientEdit,
    handleClientEditSubmit,
    openClientsDeleteModal,
    handleClientsDeleteConfirm,
    openClientMedicalHistoryModal,
    openClientMedicalHistoryCreateModal,
    selectClientMedicalHistoryClient,
    closeClientMedicalHistoryModal,
    closeClientMedicalHistoryDeleteModal,
    resetClientMedicalHistoryForm,
    startClientMedicalHistoryEdit,
    openClientMedicalHistoryDeleteModal,
    handleClientMedicalHistorySubmit,
    deleteClientMedicalHistoryItem,
    handleClientMedicalHistoryDeleteConfirm,
    closeClientsEditModal,
    closeClientsDeleteModal
  } = useClientsSection({
    currentView: mainView,
    isAdmin: Boolean(profile?.isAdmin),
    isPlatformAdmin: Boolean(profile?.isPlatformAdmin),
    canReadClients,
    canCreateClients,
    canUpdateClients,
    canDeleteClients,
    canReadClientMedicalHistory,
    canCreateClientMedicalHistory,
    canUpdateClientMedicalHistory,
    canDeleteClientMedicalHistory,
    navigate,
    getBirthdayValidationMessage
  });
  const hasReadClientMedicalHistoryAccess = Boolean(canReadClientMedicalHistory || profile?.isAdmin || profile?.isPlatformAdmin);
  const hasCreateClientMedicalHistoryAccess = Boolean(canCreateClientMedicalHistory || profile?.isAdmin || profile?.isPlatformAdmin);
  const hasUpdateClientMedicalHistoryAccess = Boolean(canUpdateClientMedicalHistory || profile?.isAdmin || profile?.isPlatformAdmin);
  const hasDeleteClientMedicalHistoryAccess = Boolean(canDeleteClientMedicalHistory || profile?.isAdmin || profile?.isPlatformAdmin);

  const allowedRoleValues = useMemo(() => (
    new Set(
      roleOptions
        .map((option) => String(option?.value || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ), [roleOptions]);

  const createOrganizationOptions = useMemo(() => {
    const currentCode = String(profile?.organizationCode || "").trim().toLowerCase();

    if (!hasAdminSettingsAccess) {
      return currentCode
        ? [{ value: currentCode, label: currentCode }]
        : [];
    }

    const activeItems = Array.isArray(organizations)
      ? organizations
          .filter((item) => Boolean(item?.isActive))
          .map((item) => {
            const code = String(item?.code || "").trim().toLowerCase();
            if (!code) {
              return null;
            }
            return {
              value: code,
              label: code
            };
          })
          .filter(Boolean)
      : [];

    const hasCurrent = activeItems.some((item) => item.value === currentCode);
    if (!hasCurrent && currentCode) {
      activeItems.unshift({
        value: currentCode,
        label: currentCode
      });
    }

    return activeItems;
  }, [hasAdminSettingsAccess, organizations, profile?.organizationCode]);

  const allowedCreateOrganizationCodes = useMemo(() => (
    new Set(
      createOrganizationOptions
        .map((option) => String(option?.value || "").trim().toLowerCase())
        .filter(Boolean)
    )
  ), [createOrganizationOptions]);

  const activeUserOptionsOrganizationCode = useMemo(() => {
    const editOrganizationCode = allUsersEdit.open
      ? String(allUsersEdit.form.organizationCode || "").trim().toLowerCase()
      : "";
    if (editOrganizationCode) {
      return editOrganizationCode;
    }

    if (mainView === "create-user") {
      return String(createForm.organizationCode || "").trim().toLowerCase();
    }

    return String(profile?.organizationCode || "").trim().toLowerCase();
  }, [
    allUsersEdit.form.organizationCode,
    allUsersEdit.open,
    createForm.organizationCode,
    mainView,
    profile?.organizationCode
  ]);

  const firstName = useMemo(() => {
    const rawName = String(profile?.fullName || profile?.username || "User").trim();
    return rawName.split(/\s+/)[0] || "User";
  }, [profile?.fullName, profile?.username]);

  const {
    avatarDataUrl,
    avatarFallback,
    avatarInputRef,
    openAvatarPicker,
    saveAvatarFromFile
  } = useProfileAvatar({
    fullName: profile?.fullName,
    username: profile?.username,
    organizationCode: profile?.organizationCode
  });

  const setMainView = useCallback((view) => {
    setMainViewState(view);
  }, []);

  const preloadSideMenu = useCallback(() => {
    if (!sideMenuMounted) {
      setSideMenuMounted(true);
    }
    void loadProfileSideMenu();
  }, [sideMenuMounted]);

  const bindSideMenuRef = useCallback((instance) => {
    sideMenuRef.current = instance;

    if (!instance || !pendingSideMenuOpenRef.current) {
      return;
    }

    pendingSideMenuOpenRef.current = false;
    menuOpenRef.current = true;
    menuToggleRef.current?.setAttribute("aria-expanded", "true");
    instance.open();
  }, []);

  const openMenu = useCallback(() => {
    if (!sideMenuRef.current) {
      pendingSideMenuOpenRef.current = true;
      if (!sideMenuMounted) {
        setSideMenuMounted(true);
      }
      void loadProfileSideMenu();
      return;
    }

    menuOpenRef.current = true;
    menuToggleRef.current?.setAttribute("aria-expanded", "true");
    sideMenuRef.current?.open();
  }, [sideMenuMounted]);

  const closeMenu = useCallback(() => {
    const activeElement = document.activeElement;
    if (
      menuRef.current
      && activeElement instanceof HTMLElement
      && menuRef.current.contains(activeElement)
    ) {
      menuToggleRef.current?.focus();
    }
    pendingSideMenuOpenRef.current = false;
    menuOpenRef.current = false;
    menuToggleRef.current?.setAttribute("aria-expanded", "false");
    sideMenuRef.current?.close();
  }, []);

  const closeUserDropdown = useCallback(() => {}, []);

  const {
    notificationsModalOpen,
    notifications,
    notificationSendForm,
    notificationSendSubmitting,
    notificationSendError,
    notificationSendSuccess,
    unreadNotificationsCount,
    setNotificationSendForm,
    setNotificationSendError,
    openNotificationsPanel,
    closeNotificationsPanel,
    clearNotifications,
    sendManualNotification,
    handleAppointmentNotification
  } = useProfileNotifications({
    canReadAppointments,
    canSendNotifications,
    profileUsername: profile?.username,
    navigate,
    closeMenu,
    closeUserDropdown
  });

  const hasAnyModalOpen = (
    myProfileModalOpen
    || notificationsModalOpen
    || logoutConfirmOpen
    || profileEdit.open
    || allUsersEdit.open
    || allUsersDelete.open
    || clientsEditOpen
    || clientsDelete.open
    || clientMedicalHistoryOpen
    || settingsDelete.open
    || organizationEditOpen
    || roleEditOpen
    || positionEditOpen
    || normEditOpen
  );

  useEffect(() => {
    document.body.style.overflow = hasAnyModalOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [hasAnyModalOpen]);

  const closeProfileEditModal = useCallback(() => {
    setProfileEdit(createEmptyProfileEditState());
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const response = await apiFetch("/api/profile", {
          method: "GET",
          cache: "no-store"
        });
        const data = await readApiResponseData(response);

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
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!profile?.username) {
      return;
    }
    loadUserOptions(activeUserOptionsOrganizationCode);
  }, [activeUserOptionsOrganizationCode, loadUserOptions, profile?.username]);

  useEffect(() => {
    if (!profile?.username || !hasAdminSettingsAccess || organizations.length > 0) {
      return;
    }
    loadOrganizations();
  }, [hasAdminSettingsAccess, loadOrganizations, organizations.length, profile?.username]);

  useEffect(() => {
    setMainView(forcedView);
  }, [forcedView, setMainView]);

  useEffect(() => {
    if (!profile?.username) {
      return;
    }
    if (!canAccessForcedView && !profile?.isPlatformAdmin) {
      navigate("/404", { replace: true });
    }
  }, [canAccessForcedView, navigate, profile?.username, profile?.isPlatformAdmin]);

  useEffect(() => {
    if (!profile?.username) {
      return;
    }

    if (profile?.isPlatformAdmin && isViewBlockedByOrgFeatures(forcedView, profile?.orgFeatures)) {
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
    if (mainView === "clients-medical-history") {
      loadClientMedicalHistoryClients(1);
      return;
    }
    if (mainView === "create-user") {
      if (canReadUsers && !allUsersLoadedOnce) {
        loadAllUsers(1);
      }
      if (hasAdminSettingsAccess) {
        loadOrganizations();
      }
      return;
    }
    if (mainView === "appointment-settings" || mainView === "appointment-breaks") {
      if (hasAdminSettingsAccess) {
        loadOrganizations();
      }
      return;
    }
    if (mainView === "settings-organizations") {
      if (hasAdminSettingsAccess) {
        loadOrganizations();
      }
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
    if (mainView === "settings-appointment-norms") {
      loadNormsSettings();
      loadPositionsSettings();
      return;
    }
    if (mainView === "notifications-send") {
      loadRolesSettings();
      return;
    }
  }, [
    canReadUsers,
    allUsersLoadedOnce,
    hasAdminSettingsAccess,
    loadClients,
    loadClientMedicalHistoryClients,
    loadAllUsers,
    loadOrganizations,
    loadNormsSettings,
    loadPositionsSettings,
    loadRolesSettings,
    mainView,
    forcedView,
    profile?.username,
    profile?.isPlatformAdmin,
    profile?.orgFeatures
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
      closeNotificationsPanel();
      setLogoutConfirmOpen(false);
      cancelOrganizationEdit();
      cancelRoleEdit();
      cancelPositionEdit();
      cancelNormEdit();
      closeProfileEditModal();
      closeAllUsersEditModal();
      closeAllUsersDeleteModal();
      closeClientsEditModal();
      closeClientsDeleteModal();
      closeClientMedicalHistoryModal();
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
    closeClientMedicalHistoryModal,
    closeMenu,
    closeProfileEditModal,
    closeSettingsDeleteModal,
    closeUserDropdown,
    closeNotificationsPanel,
    cancelOrganizationEdit,
    cancelRoleEdit,
    cancelPositionEdit,
    cancelNormEdit
  ]);

  const {
    openMyProfilePanel,
    closeMyProfilePanel,
    openCreateUserPanel,
    openAllClientsPanel,
    closeAllClientsPanel,
    openClientMedicalHistoryPanel,
    openAppointmentPanel,
    closeAppointmentPanel,
    openAppointmentBreaksPanel,
    closeAppointmentBreaksPanel,
    openAppointmentVipSchedulePanel,
    closeAppointmentVipSchedulePanel,
    openAppointmentVipAttendancePanel,
    closeAppointmentVipAttendancePanel,
    openAppointmentVipMyChildrenPanel,
    openAppointmentVipDailyRoutinesPanel,
    closeAppointmentVipDailyRoutinesPanel,
    openAppointmentVipAssignmentsPanel,
    closeAppointmentVipAssignmentsPanel,
    openAppointmentVipTutorAssignmentsPanel,
    closeAppointmentVipTutorAssignmentsPanel,
    openAppointmentSettingsPanel,
    closeAppointmentSettingsPanel,
    openAppointmentWorkSchedulePanel,
    closeAppointmentWorkSchedulePanel,
    openStatisticsClassPanel,
    openStatisticsPlannerReportPanel,
    closeStatisticsPanel,
    openOrganizationsPanel,
    closeOrganizationsPanel,
    openRolesPanel,
    closeRolesPanel,
    openPositionsPanel,
    closePositionsPanel,
    openNotificationsSendPanel,
    closeNotificationsSendPanel,
    openMonitoringPanel,
    closeMonitoringPanel,
    openNormsPanel,
    closeNormsPanel,
    closeCreateUserPanel,
    closeAllUsersPanel
  } = useProfilePanels({
    navigate,
    mainView,
    closeMenu,
    closeUserDropdown,
    setMyProfileModalOpen,
    isPlatformAdmin: Boolean(profile?.isPlatformAdmin),
    canCreateUsers,
    canReadClients,
    canReadClientMedicalHistory,
    canOpenAppointmentSchedule,
    canOpenAppointmentVipMyClass,
    canOpenAppointmentBreaks,
    canOpenAppointmentWorkSchedule,
    canOpenAppointmentVipClients,
    canOpenMyChildren,
    canOpenAppointmentVipDailyRoutines,
    canOpenAppointmentVipAssignments,
    canOpenAppointmentStatistics,
    canOpenAppointmentSettings,
    canOpenSettingsOrganizations,
    canOpenSettingsRoles,
    canOpenSettingsPositions,
    canOpenSettingsNorms,
    canSendNotifications,
    hasSettingsMenuAccess,
    hasAdminSettingsAccess
  });

  const handleOrganizationContextSwitch = useCallback(async (nextOrganizationCode) => {
    const normalizedNextCode = String(nextOrganizationCode || "").trim().toLowerCase();
    const currentCode = String(profile?.organizationCode || "").trim().toLowerCase();
    if (!hasAdminSettingsAccess || !normalizedNextCode || normalizedNextCode === currentCode) {
      return;
    }

    try {
      setOrganizationContextSwitching(true);
      const response = await apiFetch("/api/profile/organization-context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          organizationCode: normalizedNextCode
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        window.alert(getApiErrorMessage(data, "Failed to switch organization."));
        return;
      }

      window.location.reload();
    } catch {
      window.alert("Failed to switch organization.");
    } finally {
      setOrganizationContextSwitching(false);
    }
  }, [hasAdminSettingsAccess, navigate, profile?.organizationCode]);

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
      return false;
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
      return false;
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
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (data?.errors && typeof data.errors === "object") {
          setCreateErrors(data.errors);
        } else if (data?.field) {
          setCreateErrors({ [data.field]: data.message || "Invalid value." });
        } else {
          setCreateErrors({ username: getApiErrorMessage(response, data, "Failed to create employee account.") });
        }
        return false;
      }

      setCreateForm((prev) => ({ ...prev, username: "", fullName: "", role: "" }));
      setCreateErrors({});
      return true;
    } catch {
      setCreateErrors({ username: "Unexpected error. Please try again." });
      return false;
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
        const data = await readApiResponseData(response);

        if (!response.ok) {
          const apiField = String(data?.field || "").trim();
          const mappedField = apiField === "password"
            ? "newPassword"
            : (apiField === "currentPassword" ? "currentPassword" : "");
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: getApiErrorMessage(response, data, "Failed to update profile."),
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
        const data = await readApiResponseData(response);

        if (!response.ok) {
          const apiField = String(data?.field || field || "").trim();
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: getApiErrorMessage(response, data, "Failed to update profile."),
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
              aria-expanded="false"
              aria-controls="mainMenu"
              onMouseEnter={preloadSideMenu}
              onFocus={preloadSideMenu}
              onClick={() => {
                if (menuOpenRef.current) {
                  closeMenu();
                  return;
                }
                openMenu();
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
            {hasAdminSettingsAccess ? (
              <div className="header-org-switch">
                <CustomSelect
                  id="headerOrganizationContextSelect"
                  value={String(profile?.organizationCode || "").trim().toLowerCase()}
                  placeholder="Select organization"
                  options={createOrganizationOptions}
                  disabled={organizationContextSwitching || createOrganizationOptions.length === 0}
                  menuPortal
                  menuAlign="center"
                  forceOpenDown
                  searchable
                  searchThreshold={8}
                  searchPlaceholder="Search organization"
                  onChange={handleOrganizationContextSwitch}
                />
              </div>
            ) : null}
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
                <span id="headerUserNameText">{firstName}</span>
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

        <Suspense fallback={<main className="home-main" aria-label="Main content" />}>
          <ProfileMainContent
          mainView={mainView}
          allUsersMessage={allUsersMessage}
          allUsersLoading={allUsersLoading}
          allUsers={allUsers}
          canUpdateUsers={canUpdateUsers}
          canDeleteUsers={canDeleteUsers}
          openAllUsersEditModal={openAllUsersEditModal}
          openAllUsersDeleteModal={openAllUsersDeleteModal}
          allUsersPage={allUsersPage}
          allUsersTotalPages={allUsersTotalPages}
          allUsersSearch={allUsersSearch}
          setAllUsersSearch={setAllUsersSearch}
          loadAllUsers={loadAllUsers}
          closeAllUsersPanel={closeAllUsersPanel}
          closeAllClientsPanel={closeAllClientsPanel}
          clients={clients}
          clientsLoading={clientsLoading}
          clientsMessage={clientsMessage}
          clientsPage={clientsPage}
          clientsTotalPages={clientsTotalPages}
          clientsSearch={clientsSearch}
          setClientsSearch={setClientsSearch}
          clientsIsVip={clientsIsVip}
          setClientsIsVip={setClientsIsVip}
          loadClients={loadClients}
          loadClientMedicalHistoryClients={loadClientMedicalHistoryClients}
          navigate={navigate}
          canOpenMyChildren={canOpenMyChildren}
          canOpenAppointmentStatistics={canOpenAppointmentStatistics}
          canReadAppointmentVipClients={canReadAppointmentVipClients}
          canReadAppointmentVipAssignments={canReadAppointmentVipAssignments}
          canCreateAppointmentVipClients={canCreateAppointmentVipClients}
          canUpdateAppointmentVipClients={canUpdateAppointmentVipClients}
          canDeleteAppointmentVipClients={canDeleteAppointmentVipClients}
          canCreateAppointmentVipAssignments={canCreateAppointmentVipAssignments}
          canUpdateAppointmentVipAssignments={canUpdateAppointmentVipAssignments}
          canDeleteAppointmentVipAssignments={canDeleteAppointmentVipAssignments}
          canCreateClients={canCreateClients}
          canUpdateClients={canUpdateClients}
          canDeleteClients={canDeleteClients}
          canCreateClientMedicalHistory={hasCreateClientMedicalHistoryAccess}
          canBulkDeleteClientMedicalHistory={Boolean(profile?.isAdmin || profile?.isPlatformAdmin)}
          clientMedicalHistoryDelete={clientMedicalHistoryDelete}
          handleClientMedicalHistoryDeleteConfirm={handleClientMedicalHistoryDeleteConfirm}
          closeClientMedicalHistoryDeleteModal={closeClientMedicalHistoryDeleteModal}
          clientCreateForm={clientCreateForm}
          clientCreateErrors={clientCreateErrors}
          clientCreateSubmitting={clientCreateSubmitting}
          setClientCreateForm={setClientCreateForm}
          setClientCreateErrors={setClientCreateErrors}
          handleClientCreateSubmit={handleClientCreateSubmit}
          startClientEdit={startClientEdit}
          openClientsDeleteModal={openClientsDeleteModal}
          openClientMedicalHistoryModal={openClientMedicalHistoryModal}
          openClientMedicalHistoryCreateModal={openClientMedicalHistoryCreateModal}
          openClientMedicalHistoryDeleteModal={openClientMedicalHistoryDeleteModal}
          canCreateAppointments={canCreateAppointments}
          canUpdateAppointments={canUpdateAppointments}
          canUpdateSettingsAppointments={canUpdateSettingsAppointments}
          canCreateSettingsAppointmentNorms={canCreateSettingsAppointmentNorms}
          canUpdateSettingsAppointmentNorms={canUpdateSettingsAppointmentNorms}
          canDeleteSettingsAppointmentNorms={canDeleteSettingsAppointmentNorms}
          canDeleteAppointments={canDeleteAppointments}
          closeAppointmentPanel={closeAppointmentPanel}
          closeAppointmentBreaksPanel={closeAppointmentBreaksPanel}
          closeAppointmentVipSchedulePanel={closeAppointmentVipSchedulePanel}
          closeAppointmentVipAttendancePanel={closeAppointmentVipAttendancePanel}
          closeAppointmentVipDailyRoutinesPanel={closeAppointmentVipDailyRoutinesPanel}
          closeAppointmentVipAssignmentsPanel={closeAppointmentVipAssignmentsPanel}
          closeAppointmentVipTutorAssignmentsPanel={closeAppointmentVipTutorAssignmentsPanel}
          closeAppointmentSettingsPanel={closeAppointmentSettingsPanel}
          closeAppointmentWorkSchedulePanel={closeAppointmentWorkSchedulePanel}
          closeOrganizationsPanel={closeOrganizationsPanel}
          closeRolesPanel={closeRolesPanel}
          closePositionsPanel={closePositionsPanel}
          closeNotificationsSendPanel={closeNotificationsSendPanel}
          closeMonitoringPanel={closeMonitoringPanel}
          closeStatisticsPanel={closeStatisticsPanel}
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
          hasAdminSettingsAccess={hasAdminSettingsAccess}
          canCreateSettingsOrganizations={canCreateSettingsOrganizations}
          canUpdateSettingsOrganizations={canUpdateSettingsOrganizations}
          canDeleteSettingsOrganizations={canDeleteSettingsOrganizations}
          rolesSettings={rolesSettings}
          rolesSettingsMessage={rolesSettingsMessage}
          rolePermissionTree={rolePermissionTree}
          roleCreateForm={roleCreateForm}
          roleCreateError={roleCreateError}
          roleCreateSubmitting={roleCreateSubmitting}
          setRoleCreateForm={setRoleCreateForm}
          setRoleCreateError={setRoleCreateError}
          handleRoleCreateSubmit={handleRoleCreateSubmit}
          startRoleEdit={startRoleEdit}
          roleDeletingId={roleDeletingId}
          handleRoleDelete={handleRoleDelete}
          canCreateSettingsRoles={canCreateSettingsRoles}
          canUpdateSettingsRoles={canUpdateSettingsRoles}
          canDeleteSettingsRoles={canDeleteSettingsRoles}
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
          canCreateSettingsPositions={canCreateSettingsPositions}
          canUpdateSettingsPositions={canUpdateSettingsPositions}
          canDeleteSettingsPositions={canDeleteSettingsPositions}
          normsSettings={normsSettings}
          normsSettingsMessage={normsSettingsMessage}
          normCreateForm={normCreateForm}
          normCreateError={normCreateError}
          normCreateSubmitting={normCreateSubmitting}
          setNormCreateForm={setNormCreateForm}
          setNormCreateError={setNormCreateError}
          handleNormCreateSubmit={handleNormCreateSubmit}
          startNormEdit={startNormEdit}
          normDeletingId={normDeletingId}
          handleNormDelete={handleNormDelete}
          closeNormsPanel={closeNormsPanel}
          canCreateUsers={canCreateUsers}
          handleCreateUserSubmit={handleCreateUserSubmit}
          createForm={createForm}
          createErrors={createErrors}
          createSubmitting={createSubmitting}
          createOrganizationOptions={createOrganizationOptions}
          setCreateForm={setCreateForm}
          setCreateErrors={setCreateErrors}
          roleOptions={roleOptions}
          openCreateUserPanel={openCreateUserPanel}
          closeCreateUserPanel={closeCreateUserPanel}
          profile={profile}
          isOrgFeatureDisabledView={Boolean(profile?.isPlatformAdmin) && isViewBlockedByOrgFeatures(forcedView, profile?.orgFeatures)}
          onAppointmentNotification={handleAppointmentNotification}
          />
        </Suspense>

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
        <Suspense fallback={null}>
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
            clientMedicalHistoryOpen={clientMedicalHistoryOpen}
            clientMedicalHistoryClient={clientMedicalHistoryClient}
            clientMedicalHistoryClientSearch={clientMedicalHistoryClientSearch}
            clientMedicalHistoryClientOptions={clientMedicalHistoryClientOptions}
            clientMedicalHistoryClientOptionsLoading={clientMedicalHistoryClientOptionsLoading}
            clientMedicalHistoryMode={clientMedicalHistoryMode}
            clientMedicalHistoryItems={clientMedicalHistoryItems}
            clientMedicalHistorySkeletonCount={clientMedicalHistorySkeletonCount}
            clientMedicalHistoryLoading={clientMedicalHistoryLoading}
            clientMedicalHistoryMessage={clientMedicalHistoryMessage}
            clientMedicalHistoryForm={clientMedicalHistoryForm}
            clientMedicalHistoryErrors={clientMedicalHistoryErrors}
            clientMedicalHistorySubmitting={clientMedicalHistorySubmitting}
            clientMedicalHistoryDeletingId={clientMedicalHistoryDeletingId}
            clientMedicalHistoryDelete={clientMedicalHistoryDelete}
            canReadClientMedicalHistory={hasReadClientMedicalHistoryAccess}
            canCreateClientMedicalHistory={hasCreateClientMedicalHistoryAccess}
            canUpdateClientMedicalHistory={hasUpdateClientMedicalHistoryAccess}
            canDeleteClientMedicalHistory={hasDeleteClientMedicalHistoryAccess}
            setClientMedicalHistoryClientSearch={setClientMedicalHistoryClientSearch}
            setClientMedicalHistoryForm={setClientMedicalHistoryForm}
            setClientMedicalHistoryErrors={setClientMedicalHistoryErrors}
            selectClientMedicalHistoryClient={selectClientMedicalHistoryClient}
            closeClientMedicalHistoryModal={closeClientMedicalHistoryModal}
            closeClientMedicalHistoryDeleteModal={closeClientMedicalHistoryDeleteModal}
            resetClientMedicalHistoryForm={resetClientMedicalHistoryForm}
            startClientMedicalHistoryEdit={startClientMedicalHistoryEdit}
            handleClientMedicalHistorySubmit={handleClientMedicalHistorySubmit}
            openClientMedicalHistoryDeleteModal={openClientMedicalHistoryDeleteModal}
            handleClientMedicalHistoryDeleteConfirm={handleClientMedicalHistoryDeleteConfirm}
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
            rolePermissionTree={rolePermissionTree}
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
            normEditOpen={normEditOpen}
            handleNormEditSave={handleNormEditSave}
            normEditForm={normEditForm}
            setNormEditForm={setNormEditForm}
            normEditError={normEditError}
            setNormEditError={setNormEditError}
            normEditSubmitting={normEditSubmitting}
            cancelNormEdit={cancelNormEdit}
          />
        </Suspense>
      )}

      {sideMenuMounted ? (
        <Suspense fallback={null}>
          <ProfileSideMenu
            ref={bindSideMenuRef}
            menuRef={menuRef}
            isPlatformAdmin={Boolean(profile?.isPlatformAdmin)}
            hasClientsMenuAccess={hasClientsMenuAccess}
            canReadClients={canReadClients}
            canReadClientMedicalHistory={canReadClientMedicalHistory}
            openAllClientsPanel={openAllClientsPanel}
            openClientMedicalHistoryPanel={openClientMedicalHistoryPanel}
            hasAppointmentsMenuAccess={hasAppointmentsMenuAccess}
            canOpenAppointmentSchedule={canOpenAppointmentSchedule}
            canOpenAppointmentVipMyClass={canOpenAppointmentVipMyClass}
            canOpenAppointmentBreaks={canOpenAppointmentBreaks}
            canOpenAppointmentWorkSchedule={canOpenAppointmentWorkSchedule}
            canOpenAppointmentVipClients={canOpenAppointmentVipClients}
            canOpenMyChildren={canOpenMyChildren}
            canOpenAppointmentVipDailyRoutines={canOpenAppointmentVipDailyRoutines}
            canOpenAppointmentVipClassAssignments={canOpenAppointmentVipClassAssignments}
            canOpenAppointmentVipTutorAssignments={canOpenAppointmentVipTutorAssignments}
            canOpenAppointmentVipAssignments={canOpenAppointmentVipAssignments}
            canOpenAppointmentStatistics={canOpenAppointmentStatistics}
            canOpenStatisticsClassAttendance={canOpenStatisticsClassAttendance}
            canOpenStatisticsPlannerReport={canOpenStatisticsPlannerReport}
            canOpenAppointmentSettings={canOpenAppointmentSettings}
            canOpenSettingsOrganizations={canOpenSettingsOrganizations}
            canOpenSettingsRoles={canOpenSettingsRoles}
            canOpenSettingsPositions={canOpenSettingsPositions}
            canOpenSettingsNorms={canOpenSettingsNorms}
            openAppointmentPanel={openAppointmentPanel}
            openAppointmentBreaksPanel={openAppointmentBreaksPanel}
            openAppointmentVipSchedulePanel={openAppointmentVipSchedulePanel}
            openAppointmentVipAttendancePanel={openAppointmentVipAttendancePanel}
            openAppointmentVipMyChildrenPanel={openAppointmentVipMyChildrenPanel}
            openAppointmentVipDailyRoutinesPanel={openAppointmentVipDailyRoutinesPanel}
            openAppointmentVipAssignmentsPanel={openAppointmentVipAssignmentsPanel}
            openAppointmentVipTutorAssignmentsPanel={openAppointmentVipTutorAssignmentsPanel}
            openAppointmentSettingsPanel={openAppointmentSettingsPanel}
            openAppointmentWorkSchedulePanel={openAppointmentWorkSchedulePanel}
            openStatisticsClassPanel={openStatisticsClassPanel}
            openStatisticsPlannerReportPanel={openStatisticsPlannerReportPanel}
            hasUsersMenuAccess={hasUsersMenuAccess}
            canReadUsers={canReadUsers}
            closeMenu={closeMenu}
            navigate={navigate}
            hasSettingsMenuAccess={hasSettingsMenuAccess}
            hasAdminSettingsAccess={hasAdminSettingsAccess}
            canSendNotifications={canSendNotifications}
            openOrganizationsPanel={openOrganizationsPanel}
            openRolesPanel={openRolesPanel}
            openPositionsPanel={openPositionsPanel}
            openNormsPanel={openNormsPanel}
            openNotificationsSendPanel={openNotificationsSendPanel}
            openMonitoringPanel={openMonitoringPanel}
          />
        </Suspense>
      ) : null}
    </>
  );
}

export default ProfilePage;
