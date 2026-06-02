import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CustomSelect from "../components/CustomSelect.jsx";
import "../css/profile.css";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../lib/api.js";
import { LOGOUT_FLAG_KEY } from "../lib/auth-flags.js";
import { formatDateForInput, normalizeProfile } from "../lib/formatters.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import {
  createEmptyProfileEditState,
  EMPTY_PROFILE_EDIT_FORM,
  ORGANIZATION_CODE_REGEX,
  USERNAME_REGEX
} from "./profile/profile.constants.js";
import {
  handleProtectedStatus,
  mapValueLabelOptions
} from "./profile/profile.helpers.js";
import { useAllUsersSection } from "./profile/useAllUsersSection.js";
import { useClientsSection } from "./profile/useClientsSection.js";
import { useProfileAccess } from "./profile/useProfileAccess.js";
import { useProfileAvatar } from "./profile/useProfileAvatar.js";
import { useProfilePanels } from "./profile/useProfilePanels.js";
import { useSettingsSection } from "./profile/useSettingsSection.js";
import ProfileSideMenu from "./profile/ProfileSideMenu.jsx";
import HeaderNotifications from "./profile/HeaderNotifications.jsx";
import { getBirthdayValidationMessage } from "./profile/profile.validators.js";

let profileModalsPromise;
function loadProfileModals() {
  profileModalsPromise ??= import("./profile/ProfileModals.jsx");
  return profileModalsPromise;
}

const ProfileModals = lazy(loadProfileModals);
const ProfileMainContent = lazy(() => import("./profile/ProfileMainContent.jsx"));

function ProfilePage({ forcedView = "none" }) {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useI18n();
  const menuRef = useRef(null);
  const menuToggleRef = useRef(null);
  const sideMenuRef = useRef(null);
  const menuOpenRef = useRef(false);

  const [profile, setProfile] = useState(null);
  const [organizationContextSwitching, setOrganizationContextSwitching] = useState(false);
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
    canOpenAppointmentSchedule,
    canViewAppointmentSpecialistAbsenceBlocks,
    canReadAppointmentBreaks,
    canUpdateAppointmentBreaks,
    canCreateAppointmentWorkSchedule,
    canUpdateAppointmentWorkSchedule,
    canDeleteAppointmentWorkSchedule,
    canOpenAppointmentStatistics,
    canOpenStatisticsPlannerReport,
    canReadStatisticsPlannerReportPermission,
    canOpenAppointmentSettings,
    canUpdateSettingsAppointments,
    canOpenTelegramBotSettings,
    canUpdateSettingsTelegramBot,
    canOpenSmsNotifications,
    canSendSmsNotifications,
    canOpenCrm,
    canUpdateCrm,
    canOpenFinance,
    canOpenFinanceCashier,
    canOpenFinanceTickets,
    canOpenFinanceTransactions,
    canOpenFinanceBalances,
    canOpenFinanceDailyCash,
    canOpenFinanceReports,
    canCreateFinanceCashier,
    canUpdateFinanceCashier,
    canPayFinanceCashier,
    canUpdateFinanceBalances,
    canOpenServices,
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
    canOpenSettingsServices,
    canCreateSettingsServices,
    canUpdateSettingsServices,
    canDeleteSettingsServices,
    canOpenSettingsFinance,
    canCreateSettingsFinance,
    canUpdateSettingsFinance,
    canDeleteSettingsFinance,
    hasAppointmentsMenuAccess,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    hasAdminSettingsAccess,
    canOpenSiteContent,
    canCreateSiteContent,
    canUpdateSiteContent,
    canDeleteSiteContent,
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

      setRoleOptions(
        mapValueLabelOptions(
          data?.roles,
          (option) => option?.value,
          (option) => option?.label
        )
      );
      setPositionOptions(
        mapValueLabelOptions(
          data?.positions,
          (option) => option?.value,
          (option) => option?.label
        )
      );
    } catch {
      setRoleOptions([]);
      setPositionOptions([]);
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
    navigate,
    loadUserOptions
  });

  const ensureOrganizationsLoaded = useCallback(() => {
    if (hasAdminSettingsAccess && organizations.length === 0) {
      void loadOrganizations();
    }
  }, [hasAdminSettingsAccess, loadOrganizations, organizations.length]);

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
    clientsActiveOnly,
    clientsColumnFilters,
    setClientsSearch,
    setClientsActiveOnly,
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

    if (!hasAdminSettingsAccess) {
      return currentCode ? [{ value: currentCode, label: currentCode }] : [];
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

  const bindSideMenuRef = useCallback((instance) => {
    sideMenuRef.current = instance;
  }, []);

  const openMenu = useCallback(() => {
    menuOpenRef.current = true;
    menuToggleRef.current?.setAttribute("aria-expanded", "true");
    sideMenuRef.current?.open();
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
    menuOpenRef.current = false;
    menuToggleRef.current?.setAttribute("aria-expanded", "false");
    sideMenuRef.current?.close();
  }, []);

  const closeUserDropdown = useCallback(() => {}, []);

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

    void loadProfile();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!profile?.username) {
      return;
    }
    void loadUserOptions(activeUserOptionsOrganizationCode);
  }, [activeUserOptionsOrganizationCode, loadUserOptions, profile?.username]);

  useEffect(() => {
    if (!profile?.username || !hasAdminSettingsAccess || organizations.length > 0) {
      return;
    }
    void loadOrganizations();
  }, [hasAdminSettingsAccess, loadOrganizations, organizations.length, profile?.username]);

  useEffect(() => {
    setMainView(forcedView === "none" ? "statistics-planner-report" : forcedView);
  }, [forcedView, setMainView]);

  useEffect(() => {
    if (!profile?.username) {
      return;
    }
    if (!canAccessForcedView && !profile?.isPlatformAdmin) {
      navigate("/404", { replace: true });
    }
  }, [canAccessForcedView, navigate, profile?.isPlatformAdmin, profile?.username]);

  useEffect(() => {
    if (!profile?.username) {
      return;
    }

    if (mainView === "all-users") {
      void loadAllUsers(1);
      return;
    }
    if (mainView === "clients-all") {
      void loadClients(1);
      return;
    }
    if (mainView === "settings-organizations") {
      if (hasAdminSettingsAccess) {
        void loadOrganizations();
      }
      return;
    }
    if (mainView === "settings-roles") {
      void loadRolesSettings();
      return;
    }
    if (mainView === "settings-positions") {
      void loadPositionsSettings();
    }
  }, [
    hasAdminSettingsAccess,
    loadAllUsers,
    loadClients,
    loadOrganizations,
    loadPositionsSettings,
    loadRolesSettings,
    mainView,
    profile?.username
  ]);

  useEffect(() => {
    if (!profile?.username || mainView !== "create-user") {
      return;
    }

    if (canReadUsers && !allUsersLoadedOnce) {
      void loadAllUsers(1);
    }
    if (hasAdminSettingsAccess) {
      void loadOrganizations();
    }
  }, [
    allUsersLoadedOnce,
    canReadUsers,
    hasAdminSettingsAccess,
    loadAllUsers,
    loadOrganizations,
    mainView,
    profile?.username
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
    cancelOrganizationEdit,
    cancelPositionEdit,
    cancelRoleEdit,
    closeAllUsersDeleteModal,
    closeAllUsersEditModal,
    closeClientsDeleteModal,
    closeClientsEditModal,
    closeMenu,
    closeProfileEditModal,
    closeSettingsDeleteModal,
    closeUserDropdown
  ]);

  const {
    openMyProfilePanel,
    closeMyProfilePanel,
    closeCreateUserPanel,
    openAllClientsPanel,
    openCrmPanel,
    closeCrmPanel,
    openFinanceCashierPanel,
    closeFinanceCashierPanel,
    openFinanceTicketsPanel,
    closeFinanceTicketsPanel,
    openFinanceTransactionsPanel,
    closeFinanceTransactionsPanel,
    openFinanceBalancesPanel,
    closeFinanceBalancesPanel,
    openFinanceDailyCashPanel,
    closeFinanceDailyCashPanel,
    openFinanceReportsPanel,
    closeFinanceReportsPanel,
    openServicesPanel,
    closeServicesPanel,
    closeAllClientsPanel,
    openAppointmentPanel,
    closeAppointmentPanel,
    openAppointmentSettingsPanel,
    closeAppointmentSettingsPanel,
    openTelegramBotSettingsPanel,
    closeTelegramBotSettingsPanel,
    openSmsNotificationsPanel,
    closeSmsNotificationsPanel,
    openStatisticsPlannerReportPanel,
    closeStatisticsPanel,
    openOrganizationsPanel,
    closeOrganizationsPanel,
    openRolesPanel,
    closeRolesPanel,
    openPositionsPanel,
    closePositionsPanel,
    openSettingsServicesPanel,
    closeSettingsServicesPanel,
    openSettingsFinancePanel,
    closeSettingsFinancePanel,
    openMonitoringPanel,
    closeMonitoringPanel,
    openSiteContentPanel,
    closeSiteContentPanel,
    closeAllUsersPanel
  } = useProfilePanels({
    navigate,
    mainView,
    closeMenu,
    closeUserDropdown,
    setMyProfileModalOpen,
    canCreateUsers,
    canReadClients,
    canOpenCrm,
    canOpenFinanceCashier,
    canOpenFinanceTickets,
    canOpenFinanceTransactions,
    canOpenFinanceBalances,
    canOpenFinanceDailyCash,
    canOpenFinanceReports,
    canOpenServices,
    canOpenAppointmentSchedule,
    canOpenAppointmentStatistics,
    canOpenAppointmentSettings,
    canOpenTelegramBotSettings,
    canOpenSmsNotifications,
    canOpenSettingsOrganizations,
    canOpenSettingsRoles,
    canOpenSettingsPositions,
    canOpenSettingsServices,
    canOpenSettingsFinance,
    canOpenSiteContent,
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
        window.alert(getApiErrorMessage(response, data, "Failed to switch organization."));
        return;
      }

      window.location.reload();
    } catch {
      window.alert("Failed to switch organization.");
    } finally {
      setOrganizationContextSwitching(false);
    }
  }, [hasAdminSettingsAccess, navigate, profile?.organizationCode]);

  const validateCreatePayload = useCallback((payload) => {
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
  }, [allowedCreateOrganizationCodes, allowedRoleValues]);

  const handleCreateUserSubmit = useCallback(async (event) => {
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
  }, [
    canCreateUsers,
    createForm.fullName,
    createForm.organizationCode,
    createForm.role,
    createForm.username,
    profile?.organizationCode,
    validateCreatePayload
  ]);

  const openProfileEditModal = useCallback(() => {
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
  }, [profile?.birthday, profile?.email, profile?.fullName, profile?.phone, profile?.positionId]);

  const openPasswordEditModal = useCallback(() => {
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
  }, []);

  const handleProfileEditSubmit = useCallback(async (event) => {
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

        if (newPassword.length < 4) {
          setProfileEdit((prev) => ({
            ...prev,
            submitting: false,
            error: "Password must be at least 4 characters.",
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
  }, [closeProfileEditModal, profile?.birthday, profile?.email, profile?.fullName, profile?.phone, profile?.positionId, profileEdit]);

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch("/api/login/logout", {
        method: "POST"
      });
    } finally {
      sessionStorage.setItem(LOGOUT_FLAG_KEY, "1");
      navigate("/", { replace: true });
    }
  }, [navigate]);

  return (
    <>
      <div className="home-layout">
        <header className="home-header">
          <div className="home-header-inner">
            <div className="brand-wrap">
              <button
                id="menuToggle"
                ref={menuToggleRef}
                className="menu-toggle"
                type="button"
                aria-label={t("header.openMenu")}
                aria-expanded="false"
                aria-controls="mainMenu"
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
                    placeholder={t("header.selectOrganization")}
                    options={createOrganizationOptions}
                    disabled={organizationContextSwitching || createOrganizationOptions.length === 0}
                    menuPortal
                    menuAlign="center"
                    forceOpenDown
                    searchable
                    searchThreshold={8}
                    searchPlaceholder={t("header.searchOrganization")}
                    onChange={handleOrganizationContextSwitch}
                  />
                </div>
              ) : null}

              <HeaderNotifications enabled={Boolean(profile?.username)} navigate={navigate} />

              <button
                type="button"
                className="header-btn home-language-btn"
                aria-label={t("language.switch")}
                title={t("language.current")}
                onClick={() => setLanguage(language === "uz" ? "ru" : "uz")}
              >
                {t("language.next")}
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
                      alt={t("header.profilePhoto")}
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
                {t("header.logout")}
              </button>
            </nav>
          </div>
        </header>

        <Suspense fallback={<main className="home-main" aria-label="Main content" />}>
          <ProfileMainContent
            mainView={mainView}
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
            closeCreateUserPanel={closeCreateUserPanel}
            clients={clients}
            clientsLoading={clientsLoading}
            clientsMessage={clientsMessage}
            clientsPage={clientsPage}
            clientsTotalPages={clientsTotalPages}
            clientsSearch={clientsSearch}
            clientsActiveOnly={clientsActiveOnly}
            clientsColumnFilters={clientsColumnFilters}
            setClientsSearch={setClientsSearch}
            setClientsActiveOnly={setClientsActiveOnly}
            loadClients={loadClients}
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
            closeAllClientsPanel={closeAllClientsPanel}
            closeCrmPanel={closeCrmPanel}
            closeFinanceCashierPanel={closeFinanceCashierPanel}
            closeFinanceTicketsPanel={closeFinanceTicketsPanel}
            closeFinanceTransactionsPanel={closeFinanceTransactionsPanel}
            closeFinanceBalancesPanel={closeFinanceBalancesPanel}
            closeFinanceDailyCashPanel={closeFinanceDailyCashPanel}
            closeFinanceReportsPanel={closeFinanceReportsPanel}
            closeServicesPanel={closeServicesPanel}
            canUpdateCrm={canUpdateCrm}
            canCreateFinanceCashier={canCreateFinanceCashier}
            canUpdateFinanceCashier={canUpdateFinanceCashier}
            canPayFinanceCashier={canPayFinanceCashier}
            canUpdateFinanceBalances={canUpdateFinanceBalances}
            canReadAppointments={canReadAppointments}
            canCreateAppointments={canCreateAppointments}
            canUpdateAppointments={canUpdateAppointments}
            canDeleteAppointments={canDeleteAppointments}
            canReadAppointmentBreaks={canReadAppointmentBreaks}
            canViewAppointmentSpecialistAbsenceBlocks={canViewAppointmentSpecialistAbsenceBlocks}
            canReadStatisticsPlannerReportPermission={canReadStatisticsPlannerReportPermission}
            canUpdateAppointmentBreaks={canUpdateAppointmentBreaks}
            canUpdateSettingsAppointments={canUpdateSettingsAppointments}
            canUpdateSettingsTelegramBot={canUpdateSettingsTelegramBot}
            canSendSmsNotifications={canSendSmsNotifications}
            canCreateAppointmentWorkSchedule={canCreateAppointmentWorkSchedule}
            canUpdateAppointmentWorkSchedule={canUpdateAppointmentWorkSchedule}
            canDeleteAppointmentWorkSchedule={canDeleteAppointmentWorkSchedule}
            closeAppointmentPanel={closeAppointmentPanel}
            closeAppointmentSettingsPanel={closeAppointmentSettingsPanel}
            closeTelegramBotSettingsPanel={closeTelegramBotSettingsPanel}
            closeSmsNotificationsPanel={closeSmsNotificationsPanel}
            closeOrganizationsPanel={closeOrganizationsPanel}
            closeRolesPanel={closeRolesPanel}
            closePositionsPanel={closePositionsPanel}
            closeSettingsServicesPanel={closeSettingsServicesPanel}
            closeSettingsFinancePanel={closeSettingsFinancePanel}
            closeMonitoringPanel={closeMonitoringPanel}
            closeSiteContentPanel={closeSiteContentPanel}
            closeStatisticsPanel={closeStatisticsPanel}
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
            canCreateSettingsServices={canCreateSettingsServices}
            canUpdateSettingsServices={canUpdateSettingsServices}
            canDeleteSettingsServices={canDeleteSettingsServices}
            canCreateSettingsFinance={canCreateSettingsFinance}
            canUpdateSettingsFinance={canUpdateSettingsFinance}
            canDeleteSettingsFinance={canDeleteSettingsFinance}
            canCreateUsers={canCreateUsers}
            handleCreateUserSubmit={handleCreateUserSubmit}
            createForm={createForm}
            createErrors={createErrors}
            createSubmitting={createSubmitting}
            createOrganizationOptions={createOrganizationOptions}
            setCreateForm={setCreateForm}
            setCreateErrors={setCreateErrors}
            roleOptions={roleOptions}
            profile={profile}
            canOpenSiteContent={canOpenSiteContent}
            canCreateSiteContent={canCreateSiteContent}
            canUpdateSiteContent={canUpdateSiteContent}
            canDeleteSiteContent={canDeleteSiteContent}
          />
        </Suspense>

        <footer className="home-footer">
          <div className="home-footer-inner">
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
          </div>
        </footer>
      </div>

      {hasAnyModalOpen ? (
        <Suspense fallback={null}>
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
          />
        </Suspense>
      ) : null}

      <ProfileSideMenu
        ref={bindSideMenuRef}
        menuRef={menuRef}
        hasClientsMenuAccess={hasClientsMenuAccess}
        canReadClients={canReadClients}
        openAllClientsPanel={openAllClientsPanel}
        canOpenCrm={canOpenCrm}
        openCrmPanel={openCrmPanel}
        canOpenFinance={canOpenFinance}
        canOpenFinanceCashier={canOpenFinanceCashier}
        openFinanceCashierPanel={openFinanceCashierPanel}
        canOpenFinanceTickets={canOpenFinanceTickets}
        openFinanceTicketsPanel={openFinanceTicketsPanel}
        canOpenFinanceTransactions={canOpenFinanceTransactions}
        openFinanceTransactionsPanel={openFinanceTransactionsPanel}
        canOpenFinanceBalances={canOpenFinanceBalances}
        openFinanceBalancesPanel={openFinanceBalancesPanel}
        canOpenFinanceDailyCash={canOpenFinanceDailyCash}
        openFinanceDailyCashPanel={openFinanceDailyCashPanel}
        canOpenFinanceReports={canOpenFinanceReports}
        openFinanceReportsPanel={openFinanceReportsPanel}
        hasAppointmentsMenuAccess={hasAppointmentsMenuAccess}
        canOpenAppointmentSchedule={canOpenAppointmentSchedule}
        canOpenAppointmentSettings={canOpenAppointmentSettings}
        canOpenTelegramBotSettings={canOpenTelegramBotSettings}
        canOpenSmsNotifications={canOpenSmsNotifications}
        canOpenServices={canOpenServices}
        openAppointmentPanel={openAppointmentPanel}
        openAppointmentSettingsPanel={openAppointmentSettingsPanel}
        openTelegramBotSettingsPanel={openTelegramBotSettingsPanel}
        openSmsNotificationsPanel={openSmsNotificationsPanel}
        openServicesPanel={openServicesPanel}
        hasUsersMenuAccess={hasUsersMenuAccess}
        canReadUsers={canReadUsers}
        closeMenu={closeMenu}
        navigate={navigate}
        hasSettingsMenuAccess={hasSettingsMenuAccess}
        hasAdminSettingsAccess={hasAdminSettingsAccess}
        canOpenSettingsOrganizations={canOpenSettingsOrganizations}
        canOpenSettingsRoles={canOpenSettingsRoles}
        canOpenSettingsPositions={canOpenSettingsPositions}
        canOpenSettingsServices={canOpenSettingsServices}
        canOpenSettingsFinance={canOpenSettingsFinance}
        openOrganizationsPanel={openOrganizationsPanel}
        openRolesPanel={openRolesPanel}
        openPositionsPanel={openPositionsPanel}
        openSettingsServicesPanel={openSettingsServicesPanel}
        openSettingsFinancePanel={openSettingsFinancePanel}
        openMonitoringPanel={openMonitoringPanel}
        canOpenSiteContent={canOpenSiteContent}
        openSiteContentPanel={openSiteContentPanel}
      />
    </>
  );
}

export default ProfilePage;
