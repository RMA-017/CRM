import { lazy, memo, Suspense, useEffect, useState } from "react";
import { formatDateForInput, formatDateYMD } from "../../lib/formatters.js";
import useProfileStatisticsHistory from "./useProfileStatisticsHistory.js";
import useProfileVipManagement from "./useProfileVipManagement.js";
import {
  VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS,
  formatVipDailyRoutineActivityLabel,
  normalizeVipAttendanceStatus
} from "./profile.vip-utils.js";
import { useProfileMyChildren } from "./useProfileMyChildren.js";
import { useProfileVipAttendance } from "./useProfileVipAttendance.js";
import { useProfileVipAssignments } from "./useProfileVipAssignments.js";
import { useVipNormMonitoringSection } from "./useVipNormMonitoringSection.js";
import { useVipDailyRoutinesSection } from "./useVipDailyRoutinesSection.js";

const AllUsersPanel = lazy(() => import("./panels/AllUsersPanel.jsx"));
const ClientsPanel = lazy(() => import("./panels/ClientsPanel.jsx"));
const MonitoringPanel = lazy(() => import("./MonitoringPanel.jsx"));
const NotificationSendPanel = lazy(() => import("./panels/NotificationSendPanel.jsx"));
const OrganizationsSettingsPanel = lazy(() => import("./panels/OrganizationsSettingsPanel.jsx"));
const PositionsSettingsPanel = lazy(() => import("./panels/PositionsSettingsPanel.jsx"));
const ProfileEntityModals = lazy(() => import("./panels/ProfileEntityModals.jsx"));
const RolesSettingsPanel = lazy(() => import("./panels/RolesSettingsPanel.jsx"));
const SettingsCreateModals = lazy(() => import("./panels/SettingsCreateModals.jsx"));
const StatisticsClassPanel = lazy(() => import("./panels/StatisticsClassPanel.jsx"));
const AppointmentBreaksShellPanel = lazy(() => import("./panels/AppointmentBreaksShellPanel.jsx"));
const AppointmentNormsPanel = lazy(() => import("./panels/AppointmentNormsPanel.jsx"));
const AppointmentPlannerPanel = lazy(() => import("./panels/AppointmentPlannerPanel.jsx"));
const AppointmentSettingsShellPanel = lazy(() => import("./panels/AppointmentSettingsShellPanel.jsx"));
const StatisticsPlannerReportPanel = lazy(() => import("./panels/StatisticsPlannerReportPanel.jsx"));
const VipAssignmentModals = lazy(() => import("./panels/VipAssignmentModals.jsx"));
const VipAttendanceModals = lazy(() => import("./panels/VipAttendanceModals.jsx"));
const VipAttendancePanel = lazy(() => import("./panels/VipAttendancePanel.jsx"));
const VipClassAssignmentsPanel = lazy(() => import("./panels/VipClassAssignmentsPanel.jsx"));
const VipDailyRoutinesPanel = lazy(() => import("./panels/VipDailyRoutinesPanel.jsx"));
const VipNormMonitoringPanel = lazy(() => import("./panels/VipNormMonitoringPanel.jsx"));
const WorkScheduleShellPanel = lazy(() => import("./panels/WorkScheduleShellPanel.jsx"));
const VipMyChildrenPanel = lazy(() => import("./panels/VipMyChildrenPanel.jsx"));
const VipSchedulePanel = lazy(() => import("./panels/VipSchedulePanel.jsx"));
const VipTutorAssignmentsPanel = lazy(() => import("./panels/VipTutorAssignmentsPanel.jsx"));

const VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH = 64;
const VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH = 128;

const VIP_DAILY_ROUTINE_DAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "7", label: "Sunday" }
];
const VIP_DAILY_ROUTINE_DAY_LABEL_BY_VALUE = Object.freeze(
  VIP_DAILY_ROUTINE_DAY_OPTIONS.reduce((acc, item) => {
    acc[item.value] = item.label;
    return acc;
  }, {})
);
const VIP_DAILY_ROUTINE_NOTE_MAX_LENGTH = 255;
const PANEL_LOADING_FALLBACK = (
  <div className="all-users-panel" aria-hidden="true" />
);
const MODAL_LOADING_FALLBACK = null;

function formatVipDailyRoutineDayLabel(dayOfWeek) {
  const normalized = String(dayOfWeek || "").trim();
  return VIP_DAILY_ROUTINE_DAY_LABEL_BY_VALUE[normalized] || "-";
}

function ProfileMainContent({
  mainView,
  allUsersMessage,
  allUsersLoading,
  allUsers,
  canUpdateUsers,
  canDeleteUsers,
  openAllUsersEditModal,
  openAllUsersDeleteModal,
  allUsersPage,
  allUsersTotalPages,
  allUsersSearch,
  setAllUsersSearch,
  loadAllUsers,
  closeAllUsersPanel,
  closeAllClientsPanel,
  clients,
  clientsLoading,
  clientsMessage,
  clientsPage,
  clientsTotalPages,
  clientsSearch,
  setClientsSearch,
  clientsIsVip,
  setClientsIsVip,
  loadClients,
  loadClientMedicalHistoryClients,
  navigate,
  canOpenMyChildren,
  canOpenAppointmentStatistics,
  canOpenAppointmentVipNormMonitoring,
  canReadAppointmentVipClients,
  canCreateAppointmentVipClients,
  canUpdateAppointmentVipClients,
  canDeleteAppointmentVipClients,
  canReadAppointmentVipClassAssignments,
  canCreateAppointmentVipClassAssignments,
  canUpdateAppointmentVipClassAssignments,
  canDeleteAppointmentVipClassAssignments,
  canReadAppointmentVipTutorAssignments,
  canCreateAppointmentVipTutorAssignments,
  canUpdateAppointmentVipTutorAssignments,
  canCreateClients,
  canUpdateClients,
  canDeleteClients,
  canCreateClientMedicalHistory,
  canBulkDeleteClientMedicalHistory,
  clientMedicalHistoryDelete,
  handleClientMedicalHistoryDeleteConfirm,
  closeClientMedicalHistoryDeleteModal,
  clientCreateForm,
  clientCreateErrors,
  clientCreateSubmitting,
  setClientCreateForm,
  setClientCreateErrors,
  handleClientCreateSubmit,
  startClientEdit,
  openClientsDeleteModal,
  openClientMedicalHistoryModal,
  openClientMedicalHistoryCreateModal,
  openClientMedicalHistoryDeleteModal,
  canCreateAppointments,
  canReadAppointments,
  canUpdateAppointments,
  canReadAppointmentBreaks,
  canCreateAppointmentBreaks,
  canUpdateAppointmentBreaks,
  canDeleteAppointmentBreaks,
  canUpdateSettingsAppointments,
  canCreateAppointmentWorkSchedule,
  canUpdateAppointmentWorkSchedule,
  canDeleteAppointmentWorkSchedule,
  canCreateSettingsAppointmentNorms,
  canUpdateSettingsAppointmentNorms,
  canDeleteSettingsAppointmentNorms,
  canDeleteAppointments,
  closeAppointmentPanel,
  closeAppointmentBreaksPanel,
  closeAppointmentVipSchedulePanel,
  closeAppointmentVipAttendancePanel,
  closeAppointmentVipNormMonitoringPanel,
  closeAppointmentVipDailyRoutinesPanel,
  closeAppointmentVipAssignmentsPanel,
  closeAppointmentVipTutorAssignmentsPanel,
  closeAppointmentSettingsPanel,
  closeAppointmentWorkSchedulePanel,
  closeOrganizationsPanel,
  closeRolesPanel,
  closePositionsPanel,
  closeNotificationsSendPanel,
  closeMonitoringPanel,
  closeStatisticsPanel,
  canSendNotifications,
  notificationSendForm,
  notificationSendSubmitting,
  setNotificationSendForm,
  sendManualNotification,
  organizations,
  organizationsMessage,
  organizationCreateForm,
  organizationCreateError,
  organizationCreateSubmitting,
  setOrganizationCreateForm,
  setOrganizationCreateError,
  handleOrganizationCreateSubmit,
  startOrganizationEdit,
  organizationDeletingId,
  handleOrganizationDelete,
  hasAdminSettingsAccess,
  canCreateSettingsOrganizations,
  canUpdateSettingsOrganizations,
  canDeleteSettingsOrganizations,
  rolesSettings,
  rolesSettingsMessage,
  rolePermissionTree,
  roleCreateForm,
  roleCreateError,
  roleCreateSubmitting,
  setRoleCreateForm,
  setRoleCreateError,
  handleRoleCreateSubmit,
  startRoleEdit,
  roleDeletingId,
  handleRoleDelete,
  canCreateSettingsRoles,
  canUpdateSettingsRoles,
  canDeleteSettingsRoles,
  positionsSettings,
  positionsSettingsMessage,
  positionCreateForm,
  positionCreateError,
  positionCreateSubmitting,
  setPositionCreateForm,
  setPositionCreateError,
  handlePositionCreateSubmit,
  startPositionEdit,
  positionDeletingId,
  handlePositionDelete,
  canCreateSettingsPositions,
  canUpdateSettingsPositions,
  canDeleteSettingsPositions,
  normsSettings,
  normsSettingsMessage,
  normCreateForm,
  normCreateError,
  normCreateSubmitting,
  setNormCreateForm,
  setNormCreateError,
  handleNormCreateSubmit,
  startNormEdit,
  normDeletingId,
  handleNormDelete,
  closeNormsPanel,
  canCreateUsers,
  handleCreateUserSubmit,
  createForm,
  createErrors,
  createSubmitting,
  createOrganizationOptions,
  setCreateForm,
  setCreateErrors,
  roleOptions,
  openCreateUserPanel,
  closeCreateUserPanel,
  profile,
  isOrgFeatureDisabledView = false,
  onAppointmentNotification
}) {
  const profileRoleText = `${String(profile?.role || "").trim().toLowerCase()} ${String(profile?.position || "").trim().toLowerCase()}`;
  const isSpecialistUser = profileRoleText.includes("specialist") || profileRoleText.includes("spetsialist");
  const isProfileReady = Boolean(profile?.username);
  const showStatisticsBootstrapSkeleton = mainView === "statistics-class" && !isProfileReady;
  const showStatisticsPlannerReportBootstrapSkeleton = mainView === "statistics-planner-report" && !isProfileReady;
  const isVipAttendancePanelView = mainView === "appointment-vip-attendance";
  const [workScheduleUserOverridesModalOpen, setWorkScheduleUserOverridesModalOpen] = useState(false);
  const [userCreateModalOpen, setUserCreateModalOpen] = useState(false);
  const [clientCreateModalOpen, setClientCreateModalOpen] = useState(false);
  const [organizationCreateModalOpen, setOrganizationCreateModalOpen] = useState(false);
  const [orgCreateTab, setOrgCreateTab] = useState("edit");
  const [expandedCreateFeatures, setExpandedCreateFeatures] = useState(new Set());
  const [roleCreateModalOpen, setRoleCreateModalOpen] = useState(false);
  const [positionCreateModalOpen, setPositionCreateModalOpen] = useState(false);
  const [normCreateModalOpen, setNormCreateModalOpen] = useState(false);
  const isClientMedicalHistoryView = mainView === "clients-medical-history";
  const loadCurrentClientsView = isClientMedicalHistoryView ? loadClientMedicalHistoryClients : loadClients;
  const todayYmd = formatDateForInput(new Date());
  const profileUsername = profile?.username;
  const {
    myChildrenIsCompact,
    myChildrenDateYmd,
    myChildrenVisibleWeekDays,
    myChildrenOptions,
    myChildrenOptionsLoading,
    myChildrenSelectedClientId,
    setMyChildrenSelectedClientId,
    myChildrenScheduleItems,
    myChildrenScheduleLoading,
    myChildrenScheduleMessage,
    myChildrenConfirmingByAppointmentId,
    loadMyChildrenOptions,
    goToPreviousMyChildrenDay,
    goToNextMyChildrenDay,
    confirmMyChildrenPendingAppointment
  } = useProfileMyChildren({
    canOpenMyChildren,
    navigate,
    todayYmd,
    mainView,
    profileUsername
  });
  const {
    vipDailyRoutineItems,
    vipDailyRoutineClasses,
    vipDailyRoutineMessage,
    vipDailyRoutineLoading,
    vipDailyRoutineSavingById,
    loadVipDailyRoutines,
    saveVipDailyRoutine,
    deleteVipDailyRoutine
  } = useVipDailyRoutinesSection({
    canReadAppointmentVipClients,
    canOpenMyChildren,
    canCreateAppointmentVipClients,
    canUpdateAppointmentVipClients,
    canDeleteAppointmentVipClients,
    navigate
  });
  const {
    vipClassItems,
    vipClassTeachers,
    vipClassMessage,
    vipClassLoading,
    vipClassSavingById,
    vipAssignmentItems,
    vipAssignmentClasses,
    vipAssignmentTutors,
    vipAssignmentMessage,
    vipAssignmentLoading,
    vipAssignmentSavingByClientId,
    loadVipClassAssignments,
    saveVipClassAssignment,
    deleteVipClassAssignment,
    loadVipAssignments,
    saveVipAssignment
  } = useProfileVipAssignments({
    canReadAppointmentVipClassAssignments,
    canCreateAppointmentVipClassAssignments,
    canUpdateAppointmentVipClassAssignments,
    canDeleteAppointmentVipClassAssignments,
    canReadAppointmentVipTutorAssignments,
    canCreateAppointmentVipTutorAssignments,
    canUpdateAppointmentVipTutorAssignments,
    navigate
  });
  const {
    vipAttendanceItems,
    vipAttendanceDraftByClientId,
    vipAttendanceMessage,
    vipAttendanceLoading,
    vipAttendanceSavingByClientId,
    statisticsVipAttendanceHistoryItems,
    statisticsVipAttendanceHistoryFilters,
    statisticsVipAttendanceHistoryMessage,
    statisticsVipAttendanceHistoryLoading,
    loadStatisticsVipAttendanceHistory,
    loadVipAttendanceTeachers,
    loadVipAttendance,
    markVipAttendancePresent,
    saveVipAttendanceAbsentReason,
    markVipAttendanceLeft,
    saveVipAttendanceEdit
  } = useProfileVipAttendance({
    canReadAppointmentVipClients,
    canCreateAppointmentVipClients,
    canUpdateAppointmentVipClients,
    canDeleteAppointmentVipClients,
    canOpenAppointmentStatistics,
    navigate,
    profileUsername,
    todayYmd
  });
  const {
    vipNormMonitoringItems,
    vipNormMonitoringFilters,
    vipNormMonitoringMessage,
    vipNormMonitoringLoading
  } = useVipNormMonitoringSection({
    mainView,
    canOpenAppointmentVipNormMonitoring,
    navigate
  });
  const {
    statisticsHistoryPeriod,
    statisticsHistoryClassId,
    statisticsHistoryTeacherId,
    statisticsHistoryTutorId,
    statisticsHistoryClientId,
    setStatisticsHistoryClassId,
    setStatisticsHistoryTeacherId,
    setStatisticsHistoryTutorId,
    setStatisticsHistoryClientId,
    setStatisticsHistoryPeriodField,
    reloadStatisticsHistory
  } = useProfileStatisticsHistory({
    mainView,
    profile,
    statisticsVipAttendanceHistoryFilters,
    loadStatisticsVipAttendanceHistory
  });
  const {
    vipAttendanceFilter,
    setVipAttendanceFilter,
    vipAttendanceClassFilter,
    setVipAttendanceClassFilter,
    vipAttendanceAbsentModal,
    setVipAttendanceAbsentModal,
    vipAttendanceAbsentSaving,
    vipAttendanceEditModal,
    setVipAttendanceEditModal,
    vipAttendanceEditSaving,
    vipAttendanceEditAction,
    vipDailyRoutineEditModal,
    setVipDailyRoutineEditModal,
    vipDailyRoutineEditSaving,
    vipDailyRoutineDeleteModal,
    vipDailyRoutineDeleteSaving,
    vipClassDraft,
    setVipClassDraft,
    vipClassFormError,
    setVipClassFormError,
    vipClassAddModalOpen,
    vipClassModalMode,
    vipClassModalSaving,
    vipClassDeleteModal,
    vipClassDeleteSaving,
    vipTutorEditModal,
    setVipTutorEditModal,
    vipTutorEditSaving,
    vipClassTeacherOptions,
    vipClassRows,
    vipAssignmentClassOptions,
    vipAssignmentTutorOptions,
    vipDailyRoutineClassOptions,
    vipDailyRoutineRows,
    openVipAttendanceAbsentModal,
    closeVipAttendanceAbsentModal,
    openVipAttendanceEditModal,
    closeVipAttendanceEditModal,
    handleVipAttendanceAbsentReasonSave,
    handleVipAttendanceEditSave,
    handleVipAttendanceEditDelete,
    openVipDailyRoutineAddModal,
    openVipDailyRoutineEditModal,
    closeVipDailyRoutineEditModal,
    openVipDailyRoutineDeleteModal,
    closeVipDailyRoutineDeleteModal,
    handleVipDailyRoutineSave,
    confirmVipDailyRoutineDelete,
    openVipClassAddModal,
    openVipClassEditModal,
    closeVipClassAddModal,
    openVipClassDeleteModal,
    closeVipClassDeleteModal,
    handleVipClassSave,
    confirmVipClassDelete,
    openVipTutorEditModal,
    closeVipTutorEditModal,
    handleVipTutorEditSave
  } = useProfileVipManagement({
    mainView,
    isVipAttendancePanelView,
    vipAttendanceItems,
    vipDailyRoutineItems,
    vipDailyRoutineClasses,
    vipClassTeachers,
    vipClassItems,
    vipAssignmentClasses,
    vipAssignmentTutors,
    saveVipAttendanceAbsentReason,
    saveVipAttendanceEdit,
    saveVipDailyRoutine,
    deleteVipDailyRoutine,
    saveVipClassAssignment,
    deleteVipClassAssignment,
    saveVipAssignment,
    maxAbsentReasonLength: VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH,
    maxEditNoteLength: VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH,
    vipDailyRoutineNoteMaxLength: VIP_DAILY_ROUTINE_NOTE_MAX_LENGTH
  });

  useEffect(() => {
    if (!profileUsername) {
      return;
    }

    if (mainView === "appointment-vip-schedule") {
      void loadVipDailyRoutines();
      return;
    }
    if (mainView === "appointment-vip-attendance") {
      void loadVipAttendance();
      void loadVipAttendanceTeachers();
      return;
    }
    if (mainView === "appointment-vip-my-children") {
      void loadMyChildrenOptions();
      void loadVipDailyRoutines();
      return;
    }
    if (mainView === "appointment-vip-daily-routines") {
      void loadVipDailyRoutines();
      return;
    }
    if (mainView === "appointment-vip-assignments") {
      void loadVipClassAssignments();
      return;
    }
    if (mainView === "appointment-vip-tutor-assignments") {
      void loadVipAssignments();
    }
  }, [
    loadMyChildrenOptions,
    loadVipAssignments,
    loadVipAttendance,
    loadVipAttendanceTeachers,
    loadVipClassAssignments,
    loadVipDailyRoutines,
    mainView,
    profileUsername
  ]);

  useEffect(() => {
    const message = String(organizationCreateError || "").trim();
    if (!message) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
    setOrganizationCreateError("");
  }, [organizationCreateError, setOrganizationCreateError]);

  useEffect(() => {
    const message = String(roleCreateError || "").trim();
    if (!message) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
    setRoleCreateError("");
  }, [roleCreateError, setRoleCreateError]);

  useEffect(() => {
    const message = String(positionCreateError || "").trim();
    if (!message) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
    setPositionCreateError("");
  }, [positionCreateError, setPositionCreateError]);

  useEffect(() => {
    if (mainView === "create-user") {
      setUserCreateModalOpen(true);
      return;
    }
    setUserCreateModalOpen(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "clients-all") {
      return;
    }
    setClientCreateModalOpen(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "settings-organizations") {
      return;
    }
    setOrganizationCreateModalOpen(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "settings-roles") {
      return;
    }
    setRoleCreateModalOpen(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "settings-positions") {
      return;
    }
    setPositionCreateModalOpen(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "settings-appointment-norms") {
      return;
    }
    setNormCreateModalOpen(false);
  }, [mainView]);

  useEffect(() => {
    if (
      !vipAttendanceAbsentModal.open &&
      !vipAttendanceEditModal.open &&
      !vipDailyRoutineEditModal.open &&
      !vipDailyRoutineDeleteModal.open &&
      !vipClassAddModalOpen &&
      !vipClassDeleteModal.open &&
      !vipTutorEditModal.open &&
      !userCreateModalOpen &&
      !clientCreateModalOpen &&
      !organizationCreateModalOpen &&
      !roleCreateModalOpen &&
      !positionCreateModalOpen &&
      !normCreateModalOpen
    ) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [
    vipAttendanceAbsentModal.open,
    vipAttendanceEditModal.open,
    vipDailyRoutineEditModal.open,
    vipDailyRoutineDeleteModal.open,
    vipClassAddModalOpen,
    vipClassDeleteModal.open,
    vipTutorEditModal.open,
    userCreateModalOpen,
    clientCreateModalOpen,
    organizationCreateModalOpen,
    roleCreateModalOpen,
    positionCreateModalOpen,
    normCreateModalOpen
  ]);

  function openOrganizationCreateModal() {
    setOrganizationCreateForm({
      code: "",
      name: "",
      isActive: true,
      allowedFeatures: null
    });
    setOrganizationCreateError("");
    setOrgCreateTab("edit");
    setExpandedCreateFeatures(new Set());
    setOrganizationCreateModalOpen(true);
  }

  function openUserCreateModal() {
    if (!canCreateUsers) {
      return;
    }
    setCreateForm((prev) => ({
      ...prev,
      username: "",
      fullName: "",
      role: ""
    }));
    setCreateErrors({});
    setUserCreateModalOpen(true);
  }

  function closeUserCreateModal() {
    if (createSubmitting) {
      return;
    }
    if (mainView === "create-user") {
      closeCreateUserPanel();
      return;
    }
    setUserCreateModalOpen(false);
  }

  function openClientCreateModal() {
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
    setClientCreateModalOpen(true);
  }

  function closeClientCreateModal() {
    if (clientCreateSubmitting) {
      return;
    }
    setClientCreateModalOpen(false);
  }

  function closeOrganizationCreateModal() {
    if (organizationCreateSubmitting) {
      return;
    }
    setOrganizationCreateModalOpen(false);
  }

  function openRoleCreateModal() {
    setRoleCreateForm({
      label: "",
      sortOrder: "0",
      isActive: true,
      isAdmin: false,
      permissionCodes: []
    });
    setRoleCreateError("");
    setRoleCreateModalOpen(true);
  }

  function closeRoleCreateModal() {
    if (roleCreateSubmitting) {
      return;
    }
    setRoleCreateModalOpen(false);
  }

  function openPositionCreateModal() {
    setPositionCreateForm({
      label: "",
      sortOrder: "0",
      isActive: true
    });
    setPositionCreateError("");
    setPositionCreateModalOpen(true);
  }

  function closePositionCreateModal() {
    if (positionCreateSubmitting) {
      return;
    }
    setPositionCreateModalOpen(false);
  }

  function openNormCreateModal() {
    setNormCreateForm({
      positionId: "",
      maxPerWeek: "2",
      isActive: true
    });
    setNormCreateError("");
    setNormCreateModalOpen(true);
  }

  function closeNormCreateModal() {
    if (normCreateSubmitting) {
      return;
    }
    setNormCreateModalOpen(false);
  }

  const clientsTable = (
    <table
      className="all-users-table"
      aria-label={isClientMedicalHistoryView ? "Client medical history table" : "Clients table"}
    >
      <thead>
        <tr>
          <th>ID</th>
          <th>First Name</th>
          <th>Last Name</th>
          <th>Middle Name</th>
          <th>Birthday</th>
          <th>Phone</th>
          <th>Email</th>
          <th>VIP</th>
          <th>Created At</th>
          <th>Note</th>
          <th>{isClientMedicalHistoryView ? "View" : "Edit"}</th>
          <th>Delete</th>
        </tr>
      </thead>
      <tbody>
        {clientsLoading ? (
          [0, 1, 2, 3, 4].map((i) => (
            <tr key={i} aria-hidden="true">
              <td colSpan="12" className="skel" />
            </tr>
          ))
        ) : clients.map((item) => {
          const rowId = String(item.id || "");
          const firstName = String(item.firstName || item.first_name || "").trim();
          const lastName = String(item.lastName || item.last_name || "").trim();
          const middleName = String(item.middleName || item.middle_name || "").trim();
          const displayBirthday = String(item.birthday || item.birthdate || "").trim();
          const displayTgMail = String(
            item.tgMail || item.telegramOrEmail || item.telegram_or_email || item.tg_mail || ""
          ).trim();
          const displayNote = String(item.note || "").trim() || "-";
          const isVip = Boolean(item.isVip ?? item.is_vip);
          const createdAt = item.createdAt || item.created_at || "";

          return (
            <tr
              key={rowId}
            >
              <td>{rowId || "-"}</td>
              <td>{firstName || "-"}</td>
              <td>{lastName || "-"}</td>
              <td>{middleName || "-"}</td>
              <td>{formatDateYMD(displayBirthday)}</td>
              <td>{item.phone || item.phone_number || "-"}</td>
              <td>{displayTgMail || "-"}</td>
              <td>{isVip ? "Yes" : "No"}</td>
              <td>{formatDateYMD(createdAt)}</td>
              <td>{displayNote}</td>
              <td>
                <button
                  type="button"
                  className="table-action-btn"
                  disabled={isClientMedicalHistoryView ? false : !canUpdateClients}
                  onClick={() => {
                    if (isClientMedicalHistoryView) {
                      openClientMedicalHistoryModal(item);
                      return;
                    }
                    startClientEdit(item);
                  }}
                >
                  {isClientMedicalHistoryView ? "View" : "Edit"}
                </button>
              </td>
              <td>
                <button
                  type="button"
                  className="table-action-btn table-action-btn-danger"
                  disabled={isClientMedicalHistoryView ? !canBulkDeleteClientMedicalHistory : !canDeleteClients}
                  onClick={() => {
                    if (isClientMedicalHistoryView) {
                      void openClientMedicalHistoryDeleteModal({ ...item, deleteAll: true });
                      return;
                    }
                    openClientsDeleteModal(item);
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  const shouldRenderVipAttendanceModals = vipAttendanceAbsentModal.open || vipAttendanceEditModal.open;
  const shouldRenderVipAssignmentModals = (
    vipDailyRoutineEditModal.open
    || vipDailyRoutineDeleteModal.open
    || vipClassAddModalOpen
    || vipClassDeleteModal.open
    || vipTutorEditModal.open
  );
  const shouldRenderProfileEntityModals = (
    userCreateModalOpen
    || clientCreateModalOpen
    || Boolean(clientMedicalHistoryDelete?.open)
  );
  const shouldRenderSettingsCreateModals = (
    organizationCreateModalOpen
    || roleCreateModalOpen
    || positionCreateModalOpen
    || normCreateModalOpen
  );

  if (isOrgFeatureDisabledView) {
    return (
      <main className="home-main" aria-label="Main content">
        <div className="all-users-panel">
          <p className="all-users-state">This feature is not enabled for the selected organization.</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="home-main" aria-label="Main content">
      {(mainView === "all-users" || mainView === "create-user") && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <AllUsersPanel
            isCreateUserView={mainView === "create-user"}
            canCreateUsers={canCreateUsers}
            openUserCreateModal={openUserCreateModal}
            closeCreateUserPanel={closeCreateUserPanel}
            closeAllUsersPanel={closeAllUsersPanel}
            allUsersSearch={allUsersSearch}
            setAllUsersSearch={setAllUsersSearch}
            loadAllUsers={loadAllUsers}
            allUsersLoading={allUsersLoading}
            allUsers={allUsers}
            canUpdateUsers={canUpdateUsers}
            canDeleteUsers={canDeleteUsers}
            openAllUsersEditModal={openAllUsersEditModal}
            openAllUsersDeleteModal={openAllUsersDeleteModal}
            allUsersPage={allUsersPage}
            allUsersTotalPages={allUsersTotalPages}
          />
        </Suspense>
      )}

      {(mainView === "clients-all" || mainView === "clients-medical-history") && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <ClientsPanel
            isClientMedicalHistoryView={isClientMedicalHistoryView}
            canCreateClients={canCreateClients}
            canCreateClientMedicalHistory={canCreateClientMedicalHistory}
            openClientCreateModal={openClientCreateModal}
            openClientMedicalHistoryCreateModal={openClientMedicalHistoryCreateModal}
            closeAllClientsPanel={closeAllClientsPanel}
            clientsSearch={clientsSearch}
            setClientsSearch={setClientsSearch}
            clientsIsVip={clientsIsVip}
            setClientsIsVip={setClientsIsVip}
            loadCurrentClientsView={loadCurrentClientsView}
            clientsLoading={clientsLoading}
            clientsMessage={clientsMessage}
            clientsTable={clientsTable}
            clients={clients}
            clientsPage={clientsPage}
            clientsTotalPages={clientsTotalPages}
          />
        </Suspense>
      )}

      {mainView === "appointment" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <AppointmentPlannerPanel
            canReadAppointments={canReadAppointments}
            canCreateAppointments={canCreateAppointments}
            canUpdateAppointments={canUpdateAppointments}
            canDeleteAppointments={canDeleteAppointments}
            currentUserId={String(profile?.id || "").trim()}
            restrictCreateToOwnSpecialist={isSpecialistUser}
            onNotification={onAppointmentNotification}
            onClose={closeAppointmentPanel}
          />
        </Suspense>
      )}

      {mainView === "appointment-settings" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <AppointmentSettingsShellPanel
            canUpdateAppointments={canUpdateAppointments}
            canUpdateSettingsAppointments={canUpdateSettingsAppointments}
            organizations={organizations}
            profile={profile}
            onClose={closeAppointmentSettingsPanel}
          />
        </Suspense>
      )}

      {mainView === "appointment-work-schedule" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <WorkScheduleShellPanel
            canCreateAppointmentWorkSchedule={canCreateAppointmentWorkSchedule}
            canUpdateAppointmentWorkSchedule={canUpdateAppointmentWorkSchedule}
            canDeleteAppointmentWorkSchedule={canDeleteAppointmentWorkSchedule}
            profile={profile}
            workScheduleUserOverridesModalOpen={workScheduleUserOverridesModalOpen}
            setWorkScheduleUserOverridesModalOpen={setWorkScheduleUserOverridesModalOpen}
            closeAppointmentWorkSchedulePanel={closeAppointmentWorkSchedulePanel}
          />
        </Suspense>
      )}

      {mainView === "appointment-vip-schedule" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <VipSchedulePanel
            canReadAppointments={canReadAppointments}
            canCreateAppointments={canCreateAppointments}
            canUpdateAppointments={canUpdateAppointments}
            canDeleteAppointments={canDeleteAppointments}
            currentUserId={String(profile?.id || "").trim()}
            restrictCreateToOwnSpecialist={isSpecialistUser}
            vipClassDailyRoutines={vipDailyRoutineItems}
            onNotification={onAppointmentNotification}
            onClose={closeAppointmentVipSchedulePanel}
          />
        </Suspense>
      )}

      {mainView === "appointment-breaks" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <AppointmentBreaksShellPanel
            canReadAppointmentBreaks={canReadAppointmentBreaks}
            canCreateAppointmentBreaks={canCreateAppointmentBreaks}
            canUpdateAppointmentBreaks={canUpdateAppointmentBreaks}
            canDeleteAppointmentBreaks={canDeleteAppointmentBreaks}
            organizations={organizations}
            profile={profile}
            closeAppointmentBreaksPanel={closeAppointmentBreaksPanel}
          />
        </Suspense>
      )}

      {isVipAttendancePanelView && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <VipAttendancePanel
            vipAttendanceFilter={vipAttendanceFilter}
            setVipAttendanceFilter={setVipAttendanceFilter}
            vipAttendanceClassFilter={vipAttendanceClassFilter}
            setVipAttendanceClassFilter={setVipAttendanceClassFilter}
            vipAttendanceItems={vipAttendanceItems}
            vipAttendanceDraftByClientId={vipAttendanceDraftByClientId}
            vipAttendanceMessage={vipAttendanceMessage}
            vipAttendanceLoading={vipAttendanceLoading}
            vipAttendanceSavingByClientId={vipAttendanceSavingByClientId}
            canCreateAppointmentVipClients={canCreateAppointmentVipClients}
            canUpdateAppointmentVipClients={canUpdateAppointmentVipClients}
            canDeleteAppointmentVipClients={canDeleteAppointmentVipClients}
            normalizeVipAttendanceStatus={normalizeVipAttendanceStatus}
            markVipAttendancePresent={markVipAttendancePresent}
            markVipAttendanceLeft={markVipAttendanceLeft}
            openVipAttendanceAbsentModal={openVipAttendanceAbsentModal}
            openVipAttendanceEditModal={openVipAttendanceEditModal}
            closeAppointmentVipAttendancePanel={closeAppointmentVipAttendancePanel}
          />
        </Suspense>
      )}

      {mainView === "appointment-vip-my-children" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <VipMyChildrenPanel
            isCompact={myChildrenIsCompact}
            dateYmd={myChildrenDateYmd}
            visibleWeekDays={myChildrenVisibleWeekDays}
            options={myChildrenOptions}
            optionsLoading={myChildrenOptionsLoading}
            selectedClientId={myChildrenSelectedClientId}
            onSelectedClientIdChange={setMyChildrenSelectedClientId}
            scheduleItems={myChildrenScheduleItems}
            scheduleLoading={myChildrenScheduleLoading}
            scheduleMessage={myChildrenScheduleMessage}
            confirmingByAppointmentId={myChildrenConfirmingByAppointmentId}
            onConfirmPendingAppointment={confirmMyChildrenPendingAppointment}
            onPreviousDay={goToPreviousMyChildrenDay}
            onNextDay={goToNextMyChildrenDay}
            vipDailyRoutineItems={vipDailyRoutineItems}
            formatVipDailyRoutineActivityLabel={formatVipDailyRoutineActivityLabel}
            onClose={closeAppointmentVipAttendancePanel}
          />
        </Suspense>
      )}

      {mainView === "appointment-vip-norm-monitoring" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <VipNormMonitoringPanel
            vipNormMonitoringItems={vipNormMonitoringItems}
            vipNormMonitoringFilters={vipNormMonitoringFilters}
            vipNormMonitoringMessage={vipNormMonitoringMessage}
            vipNormMonitoringLoading={vipNormMonitoringLoading}
            closeAppointmentVipNormMonitoringPanel={closeAppointmentVipNormMonitoringPanel}
          />
        </Suspense>
      )}

      {mainView === "appointment-vip-daily-routines" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <VipDailyRoutinesPanel
            canCreateAppointmentVipClients={canCreateAppointmentVipClients}
            canUpdateAppointmentVipClients={canUpdateAppointmentVipClients}
            canDeleteAppointmentVipClients={canDeleteAppointmentVipClients}
            closeAppointmentVipDailyRoutinesPanel={closeAppointmentVipDailyRoutinesPanel}
            vipDailyRoutineLoading={vipDailyRoutineLoading}
            vipDailyRoutineMessage={vipDailyRoutineMessage}
            vipDailyRoutineRows={vipDailyRoutineRows}
            vipDailyRoutineSavingById={vipDailyRoutineSavingById}
            openVipDailyRoutineAddModal={openVipDailyRoutineAddModal}
            openVipDailyRoutineEditModal={openVipDailyRoutineEditModal}
            openVipDailyRoutineDeleteModal={openVipDailyRoutineDeleteModal}
            formatVipDailyRoutineDayLabel={formatVipDailyRoutineDayLabel}
            formatVipDailyRoutineActivityLabel={formatVipDailyRoutineActivityLabel}
          />
        </Suspense>
      )}

      {mainView === "appointment-vip-assignments" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <VipClassAssignmentsPanel
            canCreateAppointmentVipClassAssignments={canCreateAppointmentVipClassAssignments}
            canUpdateAppointmentVipClassAssignments={canUpdateAppointmentVipClassAssignments}
            canDeleteAppointmentVipClassAssignments={canDeleteAppointmentVipClassAssignments}
            closeAppointmentVipAssignmentsPanel={closeAppointmentVipAssignmentsPanel}
            vipClassMessage={vipClassMessage}
            vipClassLoading={vipClassLoading}
            vipClassRows={vipClassRows}
            vipClassSavingById={vipClassSavingById}
            vipClassModalSaving={vipClassModalSaving}
            vipClassDeleteSaving={vipClassDeleteSaving}
            openVipClassAddModal={openVipClassAddModal}
            openVipClassEditModal={openVipClassEditModal}
            openVipClassDeleteModal={openVipClassDeleteModal}
          />
        </Suspense>
      )}

      {mainView === "appointment-vip-tutor-assignments" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <VipTutorAssignmentsPanel
            closeAppointmentVipTutorAssignmentsPanel={closeAppointmentVipTutorAssignmentsPanel}
            vipAssignmentMessage={vipAssignmentMessage}
            vipAssignmentLoading={vipAssignmentLoading}
            vipAssignmentItems={vipAssignmentItems}
            vipAssignmentSavingByClientId={vipAssignmentSavingByClientId}
            canCreateAppointmentVipTutorAssignments={canCreateAppointmentVipTutorAssignments}
            canUpdateAppointmentVipTutorAssignments={canUpdateAppointmentVipTutorAssignments}
            openVipTutorEditModal={openVipTutorEditModal}
          />
        </Suspense>
      )}

      {mainView === "settings-organizations" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <OrganizationsSettingsPanel
            canCreateSettingsOrganizations={canCreateSettingsOrganizations}
            canUpdateSettingsOrganizations={canUpdateSettingsOrganizations}
            canDeleteSettingsOrganizations={canDeleteSettingsOrganizations}
            openOrganizationCreateModal={openOrganizationCreateModal}
            closeOrganizationsPanel={closeOrganizationsPanel}
            organizationsMessage={organizationsMessage}
            organizations={organizations}
            startOrganizationEdit={startOrganizationEdit}
            organizationDeletingId={organizationDeletingId}
            handleOrganizationDelete={handleOrganizationDelete}
          />
        </Suspense>
      )}

      {mainView === "settings-roles" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <RolesSettingsPanel
            canCreateSettingsRoles={canCreateSettingsRoles}
            canUpdateSettingsRoles={canUpdateSettingsRoles}
            canDeleteSettingsRoles={canDeleteSettingsRoles}
            hasAdminSettingsAccess={hasAdminSettingsAccess}
            openRoleCreateModal={openRoleCreateModal}
            closeRolesPanel={closeRolesPanel}
            rolesSettingsMessage={rolesSettingsMessage}
            rolesSettings={rolesSettings}
            startRoleEdit={startRoleEdit}
            roleDeletingId={roleDeletingId}
            handleRoleDelete={handleRoleDelete}
          />
        </Suspense>
      )}

      {mainView === "settings-positions" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <PositionsSettingsPanel
            canCreateSettingsPositions={canCreateSettingsPositions}
            canUpdateSettingsPositions={canUpdateSettingsPositions}
            canDeleteSettingsPositions={canDeleteSettingsPositions}
            openPositionCreateModal={openPositionCreateModal}
            closePositionsPanel={closePositionsPanel}
            positionsSettingsMessage={positionsSettingsMessage}
            positionsSettings={positionsSettings}
            startPositionEdit={startPositionEdit}
            positionDeletingId={positionDeletingId}
            handlePositionDelete={handlePositionDelete}
          />
        </Suspense>
      )}

      {mainView === "settings-appointment-norms" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <AppointmentNormsPanel
            canCreateSettingsAppointmentNorms={canCreateSettingsAppointmentNorms}
            canUpdateSettingsAppointmentNorms={canUpdateSettingsAppointmentNorms}
            canDeleteSettingsAppointmentNorms={canDeleteSettingsAppointmentNorms}
            openNormCreateModal={openNormCreateModal}
            closeNormsPanel={closeNormsPanel}
            normsSettingsMessage={normsSettingsMessage}
            normsSettings={normsSettings}
            startNormEdit={startNormEdit}
            normDeletingId={normDeletingId}
            handleNormDelete={handleNormDelete}
          />
        </Suspense>
      )}

      {mainView === "statistics-class" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <StatisticsClassPanel
            closeStatisticsPanel={closeStatisticsPanel}
            statisticsVipAttendanceHistoryFilters={statisticsVipAttendanceHistoryFilters}
            statisticsHistoryClassId={statisticsHistoryClassId}
            statisticsHistoryTeacherId={statisticsHistoryTeacherId}
            statisticsHistoryTutorId={statisticsHistoryTutorId}
            statisticsHistoryClientId={statisticsHistoryClientId}
            statisticsHistoryPeriod={statisticsHistoryPeriod}
            setStatisticsHistoryClassId={setStatisticsHistoryClassId}
            setStatisticsHistoryTeacherId={setStatisticsHistoryTeacherId}
            setStatisticsHistoryTutorId={setStatisticsHistoryTutorId}
            setStatisticsHistoryClientId={setStatisticsHistoryClientId}
            setStatisticsHistoryPeriodField={setStatisticsHistoryPeriodField}
            reloadStatisticsHistory={reloadStatisticsHistory}
            statisticsVipAttendanceHistoryLoading={statisticsVipAttendanceHistoryLoading}
            showStatisticsBootstrapSkeleton={showStatisticsBootstrapSkeleton}
            statisticsVipAttendanceHistoryItems={statisticsVipAttendanceHistoryItems}
            canUpdateAppointments={canUpdateAppointments}
            canDeleteAppointments={canDeleteAppointments}
          />
        </Suspense>
      )}

      {mainView === "statistics-planner-report" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <StatisticsPlannerReportPanel
            closeStatisticsPanel={closeStatisticsPanel}
            showBootstrapSkeleton={showStatisticsPlannerReportBootstrapSkeleton}
          />
        </Suspense>
      )}

      {mainView === "notifications-send" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <NotificationSendPanel
            closeNotificationsSendPanel={closeNotificationsSendPanel}
            notificationSendForm={notificationSendForm}
            setNotificationSendForm={setNotificationSendForm}
            sendManualNotification={sendManualNotification}
            notificationSendSubmitting={notificationSendSubmitting}
            roleOptions={roleOptions}
          />
        </Suspense>
      )}

      {mainView === "settings-monitoring" && (
        <Suspense fallback={PANEL_LOADING_FALLBACK}>
          <MonitoringPanel onClose={closeMonitoringPanel} />
        </Suspense>
      )}


      </main>
      {shouldRenderVipAttendanceModals ? (
        <Suspense fallback={MODAL_LOADING_FALLBACK}>
          <VipAttendanceModals
            vipAttendanceAbsentModal={vipAttendanceAbsentModal}
            setVipAttendanceAbsentModal={setVipAttendanceAbsentModal}
            vipAttendanceAbsentSaving={vipAttendanceAbsentSaving}
            maxAbsentReasonLength={VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH}
            canCreateAppointmentVipClients={canCreateAppointmentVipClients}
            canUpdateAppointmentVipClients={canUpdateAppointmentVipClients}
            handleVipAttendanceAbsentReasonSave={handleVipAttendanceAbsentReasonSave}
            closeVipAttendanceAbsentModal={closeVipAttendanceAbsentModal}
            vipAttendanceEditModal={vipAttendanceEditModal}
            setVipAttendanceEditModal={setVipAttendanceEditModal}
            vipAttendanceEditSaving={vipAttendanceEditSaving}
            vipAttendanceEditAction={vipAttendanceEditAction}
            maxEditNoteLength={VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH}
            canDeleteAppointmentVipClients={canDeleteAppointmentVipClients}
            handleVipAttendanceEditDelete={handleVipAttendanceEditDelete}
            handleVipAttendanceEditSave={handleVipAttendanceEditSave}
            closeVipAttendanceEditModal={closeVipAttendanceEditModal}
          />
        </Suspense>
      ) : null}
      {shouldRenderVipAssignmentModals ? (
        <Suspense fallback={MODAL_LOADING_FALLBACK}>
          <VipAssignmentModals
            vipDailyRoutineEditModal={vipDailyRoutineEditModal}
            closeVipDailyRoutineEditModal={closeVipDailyRoutineEditModal}
            handleVipDailyRoutineSave={handleVipDailyRoutineSave}
            vipDailyRoutineClassOptions={vipDailyRoutineClassOptions}
            vipDailyRoutineActivityOptions={VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS}
            setVipDailyRoutineEditModal={setVipDailyRoutineEditModal}
            vipDailyRoutineNoteMaxLength={VIP_DAILY_ROUTINE_NOTE_MAX_LENGTH}
            vipDailyRoutineEditSaving={vipDailyRoutineEditSaving}
            vipDailyRoutineDeleteModal={vipDailyRoutineDeleteModal}
            vipDailyRoutineDeleteSaving={vipDailyRoutineDeleteSaving}
            confirmVipDailyRoutineDelete={confirmVipDailyRoutineDelete}
            closeVipDailyRoutineDeleteModal={closeVipDailyRoutineDeleteModal}
            vipClassAddModalOpen={vipClassAddModalOpen}
            vipClassModalMode={vipClassModalMode}
            closeVipClassAddModal={closeVipClassAddModal}
            handleVipClassSave={handleVipClassSave}
            vipClassDraft={vipClassDraft}
            setVipClassDraft={setVipClassDraft}
            vipClassFormError={vipClassFormError}
            setVipClassFormError={setVipClassFormError}
            vipClassTeacherOptions={vipClassTeacherOptions}
            vipClassModalSaving={vipClassModalSaving}
            vipClassDeleteModal={vipClassDeleteModal}
            vipClassDeleteSaving={vipClassDeleteSaving}
            confirmVipClassDelete={confirmVipClassDelete}
            closeVipClassDeleteModal={closeVipClassDeleteModal}
            vipTutorEditModal={vipTutorEditModal}
            closeVipTutorEditModal={closeVipTutorEditModal}
            handleVipTutorEditSave={handleVipTutorEditSave}
            vipAssignmentClassOptions={vipAssignmentClassOptions}
            vipAssignmentTutorOptions={vipAssignmentTutorOptions}
            setVipTutorEditModal={setVipTutorEditModal}
            vipTutorEditSaving={vipTutorEditSaving}
          />
        </Suspense>
      ) : null}
      {shouldRenderProfileEntityModals ? (
        <Suspense fallback={MODAL_LOADING_FALLBACK}>
          <ProfileEntityModals
            clientCreateModalOpen={clientCreateModalOpen}
            setClientCreateModalOpen={setClientCreateModalOpen}
            closeClientCreateModal={closeClientCreateModal}
            canCreateClients={canCreateClients}
            clientCreateForm={clientCreateForm}
            clientCreateErrors={clientCreateErrors}
            clientCreateSubmitting={clientCreateSubmitting}
            setClientCreateForm={setClientCreateForm}
            setClientCreateErrors={setClientCreateErrors}
            handleClientCreateSubmit={handleClientCreateSubmit}
            clientMedicalHistoryDelete={clientMedicalHistoryDelete}
            handleClientMedicalHistoryDeleteConfirm={handleClientMedicalHistoryDeleteConfirm}
            closeClientMedicalHistoryDeleteModal={closeClientMedicalHistoryDeleteModal}
            userCreateModalOpen={userCreateModalOpen}
            closeUserCreateModal={closeUserCreateModal}
            canCreateUsers={canCreateUsers}
            handleCreateUserSubmit={handleCreateUserSubmit}
            createForm={createForm}
            createErrors={createErrors}
            createSubmitting={createSubmitting}
            createOrganizationOptions={createOrganizationOptions}
            setCreateForm={setCreateForm}
            setCreateErrors={setCreateErrors}
            roleOptions={roleOptions}
          />
        </Suspense>
      ) : null}
      {shouldRenderSettingsCreateModals ? (
        <Suspense fallback={MODAL_LOADING_FALLBACK}>
          <SettingsCreateModals
            organizationCreateModalOpen={organizationCreateModalOpen}
            setOrganizationCreateModalOpen={setOrganizationCreateModalOpen}
            closeOrganizationCreateModal={closeOrganizationCreateModal}
            orgCreateTab={orgCreateTab}
            setOrgCreateTab={setOrgCreateTab}
            organizationCreateForm={organizationCreateForm}
            organizationCreateError={organizationCreateError}
            organizationCreateSubmitting={organizationCreateSubmitting}
            setOrganizationCreateForm={setOrganizationCreateForm}
            setOrganizationCreateError={setOrganizationCreateError}
            handleOrganizationCreateSubmit={handleOrganizationCreateSubmit}
            expandedCreateFeatures={expandedCreateFeatures}
            setExpandedCreateFeatures={setExpandedCreateFeatures}
            roleCreateModalOpen={roleCreateModalOpen}
            setRoleCreateModalOpen={setRoleCreateModalOpen}
            closeRoleCreateModal={closeRoleCreateModal}
            rolePermissionTree={rolePermissionTree}
            roleCreateForm={roleCreateForm}
            roleCreateError={roleCreateError}
            roleCreateSubmitting={roleCreateSubmitting}
            setRoleCreateForm={setRoleCreateForm}
            setRoleCreateError={setRoleCreateError}
            handleRoleCreateSubmit={handleRoleCreateSubmit}
            positionCreateModalOpen={positionCreateModalOpen}
            setPositionCreateModalOpen={setPositionCreateModalOpen}
            closePositionCreateModal={closePositionCreateModal}
            positionCreateForm={positionCreateForm}
            positionCreateError={positionCreateError}
            positionCreateSubmitting={positionCreateSubmitting}
            setPositionCreateForm={setPositionCreateForm}
            setPositionCreateError={setPositionCreateError}
            handlePositionCreateSubmit={handlePositionCreateSubmit}
            normCreateModalOpen={normCreateModalOpen}
            closeNormCreateModal={closeNormCreateModal}
            normCreateForm={normCreateForm}
            normCreateError={normCreateError}
            normCreateSubmitting={normCreateSubmitting}
            setNormCreateForm={setNormCreateForm}
            setNormCreateError={setNormCreateError}
            handleNormCreateSubmit={handleNormCreateSubmit}
            positionsSettings={positionsSettings}
          />
        </Suspense>
      ) : null}
    </>
  );
}

export default memo(ProfileMainContent);
