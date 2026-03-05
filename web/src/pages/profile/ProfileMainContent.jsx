import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../components/CustomSelect.jsx";
import { formatDateYMD } from "../../lib/formatters.js";
import AppointmentScheduler from "./AppointmentScheduler.jsx";
import AppointmentSettingsPanel from "./AppointmentSettingsPanel.jsx";
import MonitoringPanel from "./MonitoringPanel.jsx";
import { sortVipClassDailyRoutineRows } from "./profile.helpers.js";
import {
  MY_CHILDREN_DAY_ITEMS,
  MY_CHILDREN_DAY_NUM_TO_KEY,
  normalizeMyChildrenVisibleWeekDays
} from "./profile.vip-utils.js";
import StatisticsClassPanel from "./panels/StatisticsClassPanel.jsx";
import StatisticsPlannerReportPanel from "./panels/StatisticsPlannerReportPanel.jsx";
import VipDailyRoutinesPanel from "./panels/VipDailyRoutinesPanel.jsx";

function formatMyChildrenHeaderDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMyChildrenWeekRange(days, { compact = false } = {}) {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!(first instanceof Date) || Number.isNaN(first.getTime()) || !(last instanceof Date) || Number.isNaN(last.getTime())) {
    return "";
  }
  if (compact) {
    const day = String(first.getDate()).padStart(2, "0");
    const month = String(first.getMonth() + 1).padStart(2, "0");
    return `${day}.${month}`;
  }
  return `${first.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} - ${last.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
}

function normalizeMyChildrenTimeToMinutes(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }
  return (Number(match[1]) * 60) + Number(match[2]);
}

function compareMyChildrenItems(left, right) {
  const leftStartMinutes = Number.isFinite(left?.startMinutes)
    ? left.startMinutes
    : normalizeMyChildrenTimeToMinutes(left?.startTime);
  const rightStartMinutes = Number.isFinite(right?.startMinutes)
    ? right.startMinutes
    : normalizeMyChildrenTimeToMinutes(right?.startTime);
  if (leftStartMinutes !== rightStartMinutes) {
    return leftStartMinutes - rightStartMinutes;
  }

  const leftTypeRank = String(left?.itemType || "").trim().toLowerCase() === "daily-routine" ? 0 : 1;
  const rightTypeRank = String(right?.itemType || "").trim().toLowerCase() === "daily-routine" ? 0 : 1;
  if (leftTypeRank !== rightTypeRank) {
    return leftTypeRank - rightTypeRank;
  }

  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function formatAttendanceDateTime(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "-";
  }
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  if (!hasExplicitTimezone) {
    const directMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (directMatch) {
      const [, year, month, day, hours, minutes] = directMatch;
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    }
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear()).padStart(4, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function normalizeVipAttendanceStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "present" || normalized === "absent") {
    return normalized;
  }
  return "unmarked";
}

const VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH = 64;
const VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH = 128;
const STATISTICS_HISTORY_FILTERS_STORAGE_PREFIX = "crm.statistics.class.filters.v1";

function normalizeDateYmdValue(value, fallback) {
  const normalized = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  return String(fallback || "").trim();
}

function normalizeStatisticsFilterValue(value) {
  const normalized = String(value || "").trim();
  return normalized || "all";
}

function formatAppointmentStatusLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending") {
    return "Pending";
  }
  if (normalized === "confirmed") {
    return "Confirmed";
  }
  if (normalized === "no-show") {
    return "No show";
  }
  if (normalized === "cancelled") {
    return "Cancelled";
  }
  return normalized ? `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}` : "-";
}

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
const VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS = [
  { value: "group-lesson", label: "Group lesson" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "afternoon-snack", label: "Afternoon snack" },
  { value: "sleep-time", label: "Sleep time" },
  { value: "other", label: "Other" }
];
const VIP_DAILY_ROUTINE_NOTE_MAX_LENGTH = 255;

function formatVipDailyRoutineDayLabel(dayOfWeek) {
  const normalized = String(dayOfWeek || "").trim();
  return VIP_DAILY_ROUTINE_DAY_LABEL_BY_VALUE[normalized] || "-";
}

function formatVipDailyRoutineActivityLabel(activityType) {
  const normalized = String(activityType || "").trim().toLowerCase();
  if (normalized === "lesson") {
    return "Group lesson";
  }
  if (normalized === "sleep") {
    return "Sleep time";
  }
  if (normalized === "meal") {
    return "Meal";
  }
  if (normalized === "other") {
    return "Other";
  }
  return "-";
}

function normalizeVipDailyRoutineActivityForSave(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "group-lesson") {
    return "lesson";
  }
  if (normalized === "breakfast" || normalized === "lunch" || normalized === "afternoon-snack") {
    return "meal";
  }
  if (normalized === "sleep-time") {
    return "sleep";
  }
  if (normalized === "other") {
    return "other";
  }
  return "";
}

function inferVipDailyRoutineActivitySelectValue(activityType) {
  const normalizedActivity = String(activityType || "").trim().toLowerCase();
  if (normalizedActivity === "lesson") {
    return "group-lesson";
  }
  if (normalizedActivity === "sleep") {
    return "sleep-time";
  }
  if (normalizedActivity === "meal") {
    return "breakfast";
  }
  if (normalizedActivity === "other") {
    return "other";
  }
  return "group-lesson";
}

function formatVipDailyRoutineClassLabel(item) {
  const classId = String(item?.id || item?.classId || item?.class_id || "").trim();
  const className = String(item?.className || item?.class_name || "").trim();
  const teacherName = String(item?.teacherName || item?.teacher_name || "").trim();
  const fullName = className
    ? (teacherName ? `${className} (${teacherName})` : className)
    : "";
  return {
    id: classId,
    label: fullName || (classId ? `Class #${classId}` : "Class")
  };
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
  vipAttendanceItems,
  vipAttendanceTeacherOptions,
  vipAttendanceDraftByClientId,
  vipAttendanceMessage,
  vipAttendanceLoading,
  vipAttendanceSavingByClientId,
  markVipAttendancePresent,
  markVipAttendanceLeft,
  saveVipAttendanceAbsentReason,
  saveVipAttendanceEdit,
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
  confirmMyChildrenPendingAppointment,
  goToPreviousMyChildrenDay,
  goToNextMyChildrenDay,
  vipDailyRoutineItems,
  vipDailyRoutineClasses,
  vipDailyRoutineMessage,
  vipDailyRoutineLoading,
  vipDailyRoutineSavingById,
  saveVipDailyRoutine,
  deleteVipDailyRoutine,
  vipClassItems,
  vipClassTeachers,
  vipClassMessage,
  vipClassLoading,
  vipClassSavingById,
  saveVipClassAssignment,
  deleteVipClassAssignment,
  vipAssignmentItems,
  vipAssignmentClasses,
  vipAssignmentTutors,
  vipAssignmentMessage,
  vipAssignmentLoading,
  vipAssignmentSavingByClientId,
  saveVipAssignment,
  canCreateAppointmentVipClients,
  canUpdateAppointmentVipClients,
  canDeleteAppointmentVipClients,
  canCreateAppointmentVipAssignments,
  canUpdateAppointmentVipAssignments,
  canDeleteAppointmentVipAssignments,
  canCreateClients,
  canUpdateClients,
  canDeleteClients,
  clientCreateForm,
  clientCreateErrors,
  clientCreateSubmitting,
  setClientCreateForm,
  setClientCreateErrors,
  handleClientCreateSubmit,
  startClientEdit,
  openClientsDeleteModal,
  canCreateAppointments,
  canUpdateAppointments,
  canDeleteAppointments,
  closeAppointmentPanel,
  closeAppointmentBreaksPanel,
  closeAppointmentVipSchedulePanel,
  closeAppointmentVipAttendancePanel,
  closeAppointmentVipDailyRoutinesPanel,
  closeAppointmentVipAssignmentsPanel,
  closeAppointmentVipTutorAssignmentsPanel,
  closeAppointmentSettingsPanel,
  closeOrganizationsPanel,
  closeRolesPanel,
  closePositionsPanel,
  closeAdminOptionsPanel,
  closeNotificationsSettingsPanel,
  closeMonitoringPanel,
  closeStatisticsPanel,
  statisticsVipAttendanceHistoryItems,
  statisticsVipAttendanceHistoryFilters,
  statisticsVipAttendanceHistoryMessage,
  statisticsVipAttendanceHistoryLoading,
  loadStatisticsVipAttendanceHistory,
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
  rolesSettings,
  rolesSettingsMessage,
  roleCreateForm,
  roleCreateError,
  roleCreateSubmitting,
  setRoleCreateForm,
  setRoleCreateError,
  handleRoleCreateSubmit,
  startRoleEdit,
  roleDeletingId,
  handleRoleDelete,
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
  adminOptionsForm,
  adminOptionsError,
  adminOptionsSubmitting,
  setAdminOptionsForm,
  setAdminOptionsError,
  loadAdminOptions,
  handleAdminOptionsSubmit,
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
  onAppointmentNotification
}) {
  const maxBirthdayYmd = new Date().toISOString().slice(0, 10);
  const profileRoleText = `${String(profile?.role || "").trim().toLowerCase()} ${String(profile?.position || "").trim().toLowerCase()}`;
  const isSpecialistUser = profileRoleText.includes("specialist") || profileRoleText.includes("spetsialist");
  const isProfileReady = Boolean(profile?.username);
  const showStatisticsBootstrapSkeleton = mainView === "statistics-class" && !isProfileReady;
  const showStatisticsPlannerReportBootstrapSkeleton = mainView === "statistics-planner-report" && !isProfileReady;
  const isVipAttendancePanelView = mainView === "appointment-vip-attendance";
  const [vipAttendanceFilter, setVipAttendanceFilter] = useState("all");
  const [vipAttendanceTeacherFilter, setVipAttendanceTeacherFilter] = useState("all");
  const [vipAttendanceClassFilter, setVipAttendanceClassFilter] = useState("all");
  const [vipAttendanceAbsentModal, setVipAttendanceAbsentModal] = useState({
    open: false,
    clientId: "",
    reason: "",
    error: ""
  });
  const [vipAttendanceAbsentSaving, setVipAttendanceAbsentSaving] = useState(false);
  const [vipAttendanceEditModal, setVipAttendanceEditModal] = useState({
    open: false,
    clientId: "",
    status: "unmarked",
    arrivalTime: "",
    departureTime: "",
    note: "",
    error: ""
  });
  const [vipAttendanceEditSaving, setVipAttendanceEditSaving] = useState(false);
  const [vipAttendanceEditAction, setVipAttendanceEditAction] = useState("save");
  const [vipDailyRoutineEditModal, setVipDailyRoutineEditModal] = useState({
    open: false,
    id: "",
    classId: "",
    dayOfWeek: "1",
    activityType: "group-lesson",
    startTime: "",
    endTime: "",
    note: "",
    error: ""
  });
  const [vipDailyRoutineEditSaving, setVipDailyRoutineEditSaving] = useState(false);
  const [vipDailyRoutineDeleteModal, setVipDailyRoutineDeleteModal] = useState({
    open: false,
    id: ""
  });
  const [vipDailyRoutineDeleteSaving, setVipDailyRoutineDeleteSaving] = useState(false);
  const [vipClassDraft, setVipClassDraft] = useState({
    classId: "",
    className: "",
    teacherId: ""
  });
  const [vipClassFormError, setVipClassFormError] = useState("");
  const [vipClassAddModalOpen, setVipClassAddModalOpen] = useState(false);
  const [vipClassModalMode, setVipClassModalMode] = useState("add");
  const [vipClassModalSaving, setVipClassModalSaving] = useState(false);
  const [vipClassDeleteModal, setVipClassDeleteModal] = useState({
    open: false,
    classId: "",
    className: "",
    error: ""
  });
  const [vipClassDeleteSaving, setVipClassDeleteSaving] = useState(false);
  const [vipTutorEditModal, setVipTutorEditModal] = useState({
    open: false,
    clientId: "",
    classId: "",
    tutorId: "",
    error: ""
  });
  const [vipTutorEditSaving, setVipTutorEditSaving] = useState(false);
  const [userCreateModalOpen, setUserCreateModalOpen] = useState(false);
  const [clientCreateModalOpen, setClientCreateModalOpen] = useState(false);
  const [organizationCreateModalOpen, setOrganizationCreateModalOpen] = useState(false);
  const [roleCreateModalOpen, setRoleCreateModalOpen] = useState(false);
  const [positionCreateModalOpen, setPositionCreateModalOpen] = useState(false);
  const todayYmd = new Date().toISOString().slice(0, 10);
  const [statisticsHistoryPeriod, setStatisticsHistoryPeriod] = useState(() => ({
    from: todayYmd,
    to: todayYmd
  }));
  const [statisticsHistoryClassId, setStatisticsHistoryClassId] = useState("all");
  const [statisticsHistoryTeacherId, setStatisticsHistoryTeacherId] = useState("all");
  const [statisticsHistoryTutorId, setStatisticsHistoryTutorId] = useState("all");
  const [statisticsHistoryClientId, setStatisticsHistoryClientId] = useState("all");
  const [statisticsHistoryHydrated, setStatisticsHistoryHydrated] = useState(false);
  const statisticsHistoryStorageKey = [
    STATISTICS_HISTORY_FILTERS_STORAGE_PREFIX,
    String(profile?.organizationCode || "").trim().toLowerCase() || "global",
    String(profile?.username || "").trim().toLowerCase() || "anonymous"
  ].join(":");

  useEffect(() => {
    const message = String(vipAttendanceAbsentModal.error || "").trim();
    if (!message) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
    setVipAttendanceAbsentModal((prev) => ({ ...prev, error: "" }));
  }, [vipAttendanceAbsentModal.error]);

  useEffect(() => {
    const message = String(vipAttendanceEditModal.error || "").trim();
    if (!message) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
    setVipAttendanceEditModal((prev) => ({ ...prev, error: "" }));
  }, [vipAttendanceEditModal.error]);

  useEffect(() => {
    const message = String(vipClassDeleteModal.error || "").trim();
    if (!message) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
    setVipClassDeleteModal((prev) => ({ ...prev, error: "" }));
  }, [vipClassDeleteModal.error]);

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
    if (mainView === "appointment-vip-assignments") {
      return;
    }
    setVipClassDraft({
      classId: "",
      className: "",
      teacherId: ""
    });
    setVipClassFormError("");
    setVipClassAddModalOpen(false);
    setVipClassModalMode("add");
    setVipClassModalSaving(false);
    setVipClassDeleteModal({
      open: false,
      classId: "",
      className: "",
      error: ""
    });
    setVipClassDeleteSaving(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "appointment-vip-tutor-assignments") {
      return;
    }
    setVipTutorEditModal({
      open: false,
      clientId: "",
      classId: "",
      tutorId: "",
      error: ""
    });
    setVipTutorEditSaving(false);
  }, [mainView]);

  useEffect(() => {
    if (mainView === "appointment-vip-daily-routines") {
      return;
    }
    setVipDailyRoutineEditModal({
      open: false,
      id: "",
      classId: "",
      dayOfWeek: "1",
      activityType: "group-lesson",
      startTime: "",
      endTime: "",
      note: "",
      error: ""
    });
    setVipDailyRoutineEditSaving(false);
    setVipDailyRoutineDeleteModal({
      open: false,
      id: ""
    });
    setVipDailyRoutineDeleteSaving(false);
  }, [mainView]);

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
      !positionCreateModalOpen
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
    positionCreateModalOpen
  ]);

  function closeVipAttendanceAbsentModal() {
    setVipAttendanceAbsentModal({
      open: false,
      clientId: "",
      reason: "",
      error: ""
    });
    setVipAttendanceAbsentSaving(false);
  }

  function closeVipAttendanceEditModal() {
    setVipAttendanceEditModal({
      open: false,
      clientId: "",
      status: "unmarked",
      arrivalTime: "",
      departureTime: "",
      note: "",
      error: ""
    });
    setVipAttendanceEditSaving(false);
    setVipAttendanceEditAction("save");
  }

  useEffect(() => {
    if (!isVipAttendancePanelView && (vipAttendanceAbsentModal.open || vipAttendanceEditModal.open)) {
      setVipAttendanceAbsentModal({
        open: false,
        clientId: "",
        reason: "",
        error: ""
      });
      setVipAttendanceAbsentSaving(false);
      setVipAttendanceEditModal({
        open: false,
        clientId: "",
        status: "unmarked",
        arrivalTime: "",
        departureTime: "",
        note: "",
        error: ""
      });
      setVipAttendanceEditSaving(false);
      setVipAttendanceEditAction("save");
    }
  }, [isVipAttendancePanelView, vipAttendanceAbsentModal.open, vipAttendanceEditModal.open]);

  useEffect(() => {
    const normalizedTeacherId = String(vipAttendanceTeacherFilter || "").trim();
    if (!normalizedTeacherId || normalizedTeacherId === "all") {
      return;
    }
    const existsInList = (Array.isArray(vipAttendanceTeacherOptions) ? vipAttendanceTeacherOptions : [])
      .some((item) => String(item?.id || "").trim() === normalizedTeacherId);
    if (!existsInList) {
      setVipAttendanceTeacherFilter("all");
    }
  }, [vipAttendanceTeacherFilter, vipAttendanceTeacherOptions]);

  useEffect(() => {
    const normalizedClassName = String(vipAttendanceClassFilter || "").trim();
    if (!normalizedClassName || normalizedClassName === "all") {
      return;
    }
    const existsInList = vipAttendanceItems.some((item) => String(item?.className || item?.class_name || "").trim() === normalizedClassName);
    if (!existsInList) {
      setVipAttendanceClassFilter("all");
    }
  }, [vipAttendanceClassFilter, vipAttendanceItems]);

  useEffect(() => {
    if (mainView !== "statistics-class") {
      return;
    }
    if (!isProfileReady) {
      setStatisticsHistoryHydrated(false);
      return;
    }
    let nextPeriodFrom = todayYmd;
    let nextPeriodTo = todayYmd;
    let nextClassId = "all";
    let nextTeacherId = "all";
    let nextTutorId = "all";
    let nextClientId = "all";
    if (typeof window !== "undefined") {
      try {
        const rawValue = window.localStorage.getItem(statisticsHistoryStorageKey);
        if (rawValue) {
          const parsed = JSON.parse(rawValue);
          nextPeriodFrom = normalizeDateYmdValue(parsed?.from, todayYmd);
          nextPeriodTo = normalizeDateYmdValue(parsed?.to, nextPeriodFrom || todayYmd);
          if (nextPeriodFrom && nextPeriodTo && nextPeriodFrom > nextPeriodTo) {
            nextPeriodTo = nextPeriodFrom;
          }
          nextClassId = normalizeStatisticsFilterValue(parsed?.classId);
          nextTeacherId = normalizeStatisticsFilterValue(parsed?.teacherId);
          nextTutorId = normalizeStatisticsFilterValue(parsed?.tutorId);
          nextClientId = normalizeStatisticsFilterValue(parsed?.clientId);
        }
      } catch {}
    }
    setStatisticsHistoryPeriod({
      from: nextPeriodFrom,
      to: nextPeriodTo
    });
    setStatisticsHistoryClassId(nextClassId);
    setStatisticsHistoryTeacherId(nextTeacherId);
    setStatisticsHistoryTutorId(nextTutorId);
    setStatisticsHistoryClientId(nextClientId);
    setStatisticsHistoryHydrated(true);
  }, [isProfileReady, mainView, statisticsHistoryStorageKey, todayYmd]);

  useEffect(() => {
    if (!isProfileReady || !statisticsHistoryHydrated) {
      return;
    }
    const nextFrom = normalizeDateYmdValue(statisticsHistoryPeriod.from, todayYmd);
    let nextTo = normalizeDateYmdValue(statisticsHistoryPeriod.to, nextFrom || todayYmd);
    if (nextFrom && nextTo && nextFrom > nextTo) {
      nextTo = nextFrom;
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(statisticsHistoryStorageKey, JSON.stringify({
          from: nextFrom,
          to: nextTo,
          classId: normalizeStatisticsFilterValue(statisticsHistoryClassId),
          teacherId: normalizeStatisticsFilterValue(statisticsHistoryTeacherId),
          tutorId: normalizeStatisticsFilterValue(statisticsHistoryTutorId),
          clientId: normalizeStatisticsFilterValue(statisticsHistoryClientId)
        }));
      } catch {}
    }
  }, [
    isProfileReady,
    statisticsHistoryHydrated,
    statisticsHistoryStorageKey,
    statisticsHistoryPeriod.from,
    statisticsHistoryPeriod.to,
    statisticsHistoryClassId,
    statisticsHistoryTeacherId,
    statisticsHistoryTutorId,
    statisticsHistoryClientId,
    todayYmd
  ]);

  useEffect(() => {
    if (mainView !== "statistics-class") {
      return;
    }
    const classExists = (
      statisticsHistoryClassId === "all"
    );
    if (classExists) {
      return;
    }
    const classItems = Array.isArray(statisticsVipAttendanceHistoryFilters?.classes)
      ? statisticsVipAttendanceHistoryFilters.classes
      : [];
    if (classItems.length === 0) {
      return;
    }
    const existsInList = classItems.some((item) => String(item?.id || "").trim() === statisticsHistoryClassId);
    if (!existsInList) {
      setStatisticsHistoryClassId("all");
    }
  }, [mainView, statisticsHistoryClassId, statisticsVipAttendanceHistoryFilters?.classes]);

  useEffect(() => {
    if (mainView !== "statistics-class") {
      return;
    }
    const teacherExists = (
      statisticsHistoryTeacherId === "all"
    );
    if (teacherExists) {
      return;
    }
    const teacherItems = Array.isArray(statisticsVipAttendanceHistoryFilters?.teachers)
      ? statisticsVipAttendanceHistoryFilters.teachers
      : [];
    if (teacherItems.length === 0) {
      return;
    }
    const existsInList = teacherItems.some((item) => String(item?.id || "").trim() === statisticsHistoryTeacherId);
    if (!existsInList) {
      setStatisticsHistoryTeacherId("all");
    }
  }, [mainView, statisticsHistoryTeacherId, statisticsVipAttendanceHistoryFilters?.teachers]);

  useEffect(() => {
    if (mainView !== "statistics-class") {
      return;
    }
    const tutorExists = (
      statisticsHistoryTutorId === "all"
    );
    if (tutorExists) {
      return;
    }
    const tutorItems = Array.isArray(statisticsVipAttendanceHistoryFilters?.tutors)
      ? statisticsVipAttendanceHistoryFilters.tutors
      : [];
    if (tutorItems.length === 0) {
      return;
    }
    const existsInList = tutorItems.some((item) => String(item?.id || "").trim() === statisticsHistoryTutorId);
    if (!existsInList) {
      setStatisticsHistoryTutorId("all");
    }
  }, [mainView, statisticsHistoryTutorId, statisticsVipAttendanceHistoryFilters?.tutors]);

  useEffect(() => {
    if (mainView !== "statistics-class") {
      return;
    }
    const clientExists = (
      statisticsHistoryClientId === "all"
    );
    if (clientExists) {
      return;
    }
    const clientItems = Array.isArray(statisticsVipAttendanceHistoryFilters?.clients)
      ? statisticsVipAttendanceHistoryFilters.clients
      : [];
    if (clientItems.length === 0) {
      return;
    }
    const existsInList = clientItems.some((item) => String(item?.id || "").trim() === statisticsHistoryClientId);
    if (!existsInList) {
      setStatisticsHistoryClientId("all");
    }
  }, [mainView, statisticsHistoryClientId, statisticsVipAttendanceHistoryFilters?.clients]);

  useEffect(() => {
    if (mainView !== "statistics-class") {
      return;
    }
    if (!statisticsHistoryHydrated) {
      return;
    }
    void loadStatisticsVipAttendanceHistory({
      from: statisticsHistoryPeriod.from,
      to: statisticsHistoryPeriod.to,
      classId: statisticsHistoryClassId,
      teacherId: statisticsHistoryTeacherId,
      tutorId: statisticsHistoryTutorId,
      clientId: statisticsHistoryClientId
    });
  }, [loadStatisticsVipAttendanceHistory, mainView, statisticsHistoryHydrated]);

  function setStatisticsHistoryPeriodField(field, nextDate) {
    const normalizedField = String(field || "").trim().toLowerCase();
    if (normalizedField !== "from" && normalizedField !== "to") {
      return;
    }
    const normalizedDate = String(nextDate || "").trim() || todayYmd;
    setStatisticsHistoryPeriod((prev) => {
      const base = prev && typeof prev === "object"
        ? prev
        : { from: todayYmd, to: todayYmd };
      const next = {
        from: String(base.from || "").trim() || todayYmd,
        to: String(base.to || "").trim() || todayYmd
      };
      next[normalizedField] = normalizedDate;
      if (next.from && next.to && next.from > next.to) {
        if (normalizedField === "from") {
          next.to = next.from;
        } else {
          next.from = next.to;
        }
      }
      return next;
    });
  }

  function reloadStatisticsHistory() {
    if (mainView !== "statistics-class") {
      return;
    }
    void loadStatisticsVipAttendanceHistory({
      from: statisticsHistoryPeriod.from,
      to: statisticsHistoryPeriod.to,
      classId: statisticsHistoryClassId,
      teacherId: statisticsHistoryTeacherId,
      tutorId: statisticsHistoryTutorId,
      clientId: statisticsHistoryClientId
    });
  }

  function openVipAttendanceAbsentModal(clientId, currentReason) {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      return;
    }
    setVipAttendanceAbsentSaving(false);
    setVipAttendanceAbsentModal({
      open: true,
      clientId: normalizedClientId,
      reason: String(currentReason || "").trim().slice(0, VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH),
      error: ""
    });
  }

  function openVipAttendanceEditModal(clientId, {
    status = "",
    arrivedAt = "",
    leftAt = "",
    note = ""
  } = {}) {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      return;
    }
    const normalizedStatus = normalizeVipAttendanceStatus(status);
    const isPresentMode = normalizedStatus === "present";
    const isAbsentMode = normalizedStatus === "absent";
    setVipAttendanceEditSaving(false);
    setVipAttendanceEditAction("save");
    setVipAttendanceEditModal({
      open: true,
      clientId: normalizedClientId,
      status: normalizedStatus,
      arrivalTime: isAbsentMode ? "" : String(arrivedAt || "").trim(),
      departureTime: isAbsentMode ? "" : String(leftAt || "").trim(),
      note: isPresentMode
        ? ""
        : String(note || "").trim().slice(0, VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH),
      error: ""
    });
  }

  async function handleVipAttendanceAbsentReasonSave() {
    const normalizedClientId = String(vipAttendanceAbsentModal.clientId || "").trim();
    if (!normalizedClientId) {
      closeVipAttendanceAbsentModal();
      return;
    }
    const normalizedReason = String(vipAttendanceAbsentModal.reason || "").trim();
    if (!normalizedReason) {
      setVipAttendanceAbsentModal((prev) => ({ ...prev, error: "Reason is required." }));
      return;
    }
    if (normalizedReason.length > VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH) {
      setVipAttendanceAbsentModal((prev) => ({ ...prev, error: `Reason is too long (max ${VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH}).` }));
      return;
    }
    setVipAttendanceAbsentSaving(true);
    const saveResult = await saveVipAttendanceAbsentReason(normalizedClientId, normalizedReason);
    if (!saveResult?.ok) {
      setVipAttendanceAbsentModal((prev) => ({
        ...prev,
        error: String(saveResult?.message || "Failed to save absent reason.").trim()
      }));
      setVipAttendanceAbsentSaving(false);
      return;
    }
    closeVipAttendanceAbsentModal();
  }

  async function handleVipAttendanceEditSave() {
    const normalizedClientId = String(vipAttendanceEditModal.clientId || "").trim();
    if (!normalizedClientId) {
      closeVipAttendanceEditModal();
      return;
    }
    const normalizedStatus = normalizeVipAttendanceStatus(vipAttendanceEditModal.status);
    const isPresentMode = normalizedStatus === "present";
    const isAbsentMode = normalizedStatus === "absent";
    const normalizedArrivalTime = String(vipAttendanceEditModal.arrivalTime || "").trim();
    const normalizedDepartureTime = String(vipAttendanceEditModal.departureTime || "").trim();
    const normalizedNote = String(vipAttendanceEditModal.note || "").trim();

    if (!isAbsentMode && normalizedDepartureTime && !normalizedArrivalTime) {
      setVipAttendanceEditModalError("Arrival time is required when departure time is set.");
      return;
    }
    if (!isAbsentMode && normalizedArrivalTime && normalizedDepartureTime && normalizedDepartureTime < normalizedArrivalTime) {
      setVipAttendanceEditModalError("Departure time must be later than arrival time.");
      return;
    }
    if (!isPresentMode && normalizedNote.length > VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH) {
      setVipAttendanceEditModalError(`Note is too long (max ${VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH}).`);
      return;
    }
    if (isAbsentMode && !normalizedNote) {
      setVipAttendanceEditModalError("Reason is required for absent.");
      return;
    }

    setVipAttendanceEditAction("save");
    setVipAttendanceEditSaving(true);
    const saveResult = await saveVipAttendanceEdit(normalizedClientId, {
      status: normalizedStatus,
      arrivedAt: isAbsentMode ? "" : normalizedArrivalTime,
      leftAt: isAbsentMode ? "" : normalizedDepartureTime,
      note: isPresentMode ? "" : normalizedNote
    });
    if (!saveResult?.ok) {
      setVipAttendanceEditModalError(String(saveResult?.message || "Failed to save VIP attendance.").trim());
      setVipAttendanceEditSaving(false);
      return;
    }
    closeVipAttendanceEditModal();
  }

  async function handleVipAttendanceEditDelete() {
    const normalizedClientId = String(vipAttendanceEditModal.clientId || "").trim();
    if (!normalizedClientId) {
      closeVipAttendanceEditModal();
      return;
    }
    setVipAttendanceEditAction("delete");
    setVipAttendanceEditSaving(true);
    const resetResult = await saveVipAttendanceEdit(normalizedClientId, { reset: true });
    if (!resetResult?.ok) {
      setVipAttendanceEditModalError(String(resetResult?.message || "Failed to reset VIP attendance.").trim());
      setVipAttendanceEditSaving(false);
      setVipAttendanceEditAction("save");
      return;
    }
    closeVipAttendanceEditModal();
  }

  const vipClassTeacherOptions = (Array.isArray(vipClassTeachers) ? vipClassTeachers : [])
    .map((item) => ({
      value: String(item?.id || "").trim(),
      label: String(item?.name || "").trim() || `Teacher #${String(item?.id || "").trim()}`
    }))
    .filter((item) => Boolean(item.value));
  const vipClassRows = (Array.isArray(vipClassItems) ? vipClassItems : [])
    .map((item) => ({
      id: String(item?.id || item?.classId || "").trim(),
      className: String(item?.className || item?.class_name || "").trim(),
      teacherId: String(item?.teacherId || item?.teacher_id || "").trim(),
      teacherName: String(item?.teacherName || item?.teacher_name || "").trim(),
      childrenCount: Math.max(0, Number.parseInt(String(item?.childrenCount || item?.children_count || "0"), 10) || 0)
    }))
    .filter((item) => Boolean(item.id));
  const vipAssignmentClassOptions = (Array.isArray(vipAssignmentClasses) ? vipAssignmentClasses : [])
    .map((item) => {
      const classId = String(item?.id || item?.classId || "").trim();
      const className = String(item?.className || item?.class_name || "").trim();
      const teacherName = String(item?.teacherName || item?.teacher_name || "").trim();
      if (!classId || !className) {
        return null;
      }
      return {
        value: classId,
        label: teacherName ? `${className} (${teacherName})` : className
      };
    })
    .filter(Boolean);
  const vipAssignmentTutorOptions = (Array.isArray(vipAssignmentTutors) ? vipAssignmentTutors : [])
    .map((item) => ({
      value: String(item?.id || "").trim(),
      label: String(item?.name || "").trim() || `Tutor #${String(item?.id || "").trim()}`
    }))
    .filter((item) => Boolean(item.value));

  const vipDailyRoutineClassOptions = (Array.isArray(vipDailyRoutineClasses) ? vipDailyRoutineClasses : [])
    .map((item) => {
      const formatted = formatVipDailyRoutineClassLabel(item);
      if (!formatted.id) {
        return null;
      }
      return {
        value: formatted.id,
        label: formatted.label
      };
    })
    .filter(Boolean);
  const vipDailyRoutineRows = sortVipClassDailyRoutineRows(vipDailyRoutineItems);

  function openVipDailyRoutineAddModal() {
    const preferredClassId = String(vipDailyRoutineClassOptions[0]?.value || "").trim();
    setVipDailyRoutineEditModal({
      open: true,
      id: "",
      classId: preferredClassId,
      dayOfWeek: "1",
      activityType: "group-lesson",
      startTime: "",
      endTime: "",
      note: "",
      error: ""
    });
    setVipDailyRoutineEditSaving(false);
  }

  function openVipDailyRoutineEditModal(row) {
    const routineId = String(row?.id || "").trim();
    if (!routineId) {
      return;
    }
    setVipDailyRoutineEditModal({
      open: true,
      id: routineId,
      classId: String(row?.classId || "").trim(),
      dayOfWeek: String(row?.dayOfWeek || "").trim() || "1",
      activityType: inferVipDailyRoutineActivitySelectValue(row?.activityType),
      startTime: String(row?.startTime || "").trim(),
      endTime: String(row?.endTime || "").trim(),
      note: String(row?.note || "").trim(),
      error: ""
    });
    setVipDailyRoutineEditSaving(false);
  }

  function closeVipDailyRoutineEditModal() {
    setVipDailyRoutineEditModal({
      open: false,
      id: "",
      classId: "",
      dayOfWeek: "1",
      activityType: "group-lesson",
      startTime: "",
      endTime: "",
      note: "",
      error: ""
    });
    setVipDailyRoutineEditSaving(false);
  }

  function openVipDailyRoutineDeleteModal(row) {
    const routineId = String(row?.id || "").trim();
    if (!routineId) {
      return;
    }
    setVipDailyRoutineDeleteModal({
      open: true,
      id: routineId
    });
    setVipDailyRoutineDeleteSaving(false);
  }

  function closeVipDailyRoutineDeleteModal() {
    setVipDailyRoutineDeleteModal({
      open: false,
      id: ""
    });
    setVipDailyRoutineDeleteSaving(false);
  }

  function showVipClassModalAlert(message) {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(normalizedMessage);
    }
  }

  function setVipAttendanceEditModalError(message) {
    const normalizedMessage = String(message || "").trim();
    setVipAttendanceEditModal((prev) => ({ ...prev, error: normalizedMessage }));
  }

  function setVipDailyRoutineModalError(message) {
    const normalizedMessage = String(message || "").trim();
    setVipDailyRoutineEditModal((prev) => ({ ...prev, error: normalizedMessage }));
    showVipClassModalAlert(normalizedMessage);
  }

  function setVipClassModalError(message) {
    const normalizedMessage = String(message || "").trim();
    setVipClassFormError(normalizedMessage);
    showVipClassModalAlert(normalizedMessage);
  }

  function setVipTutorModalError(message) {
    const normalizedMessage = String(message || "").trim();
    setVipTutorEditModal((prev) => ({ ...prev, error: normalizedMessage }));
    showVipClassModalAlert(normalizedMessage);
  }

  async function handleVipDailyRoutineSave() {
    const routineId = String(vipDailyRoutineEditModal.id || "").trim();
    const isEditMode = Boolean(routineId);
    const classId = String(vipDailyRoutineEditModal.classId || "").trim();
    const dayOfWeek = String(vipDailyRoutineEditModal.dayOfWeek || "").trim();
    const activityValue = String(vipDailyRoutineEditModal.activityType || "").trim().toLowerCase();
    const activityType = normalizeVipDailyRoutineActivityForSave(activityValue);
    const startTime = String(vipDailyRoutineEditModal.startTime || "").trim();
    const endTime = String(vipDailyRoutineEditModal.endTime || "").trim();
    const note = String(vipDailyRoutineEditModal.note || "").trim();

    if (!classId) {
      setVipDailyRoutineModalError("Class is required.");
      return;
    }
    if (!/^[1-7]$/.test(dayOfWeek)) {
      setVipDailyRoutineModalError("Day must be between 1 and 7.");
      return;
    }
    if (!activityType) {
      setVipDailyRoutineModalError("Activity is required.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      setVipDailyRoutineModalError("Start and end time must be HH:mm.");
      return;
    }
    if (endTime <= startTime) {
      setVipDailyRoutineModalError("End time must be later than start time.");
      return;
    }
    if (note.length > VIP_DAILY_ROUTINE_NOTE_MAX_LENGTH) {
      setVipDailyRoutineModalError(`Note is too long (max ${VIP_DAILY_ROUTINE_NOTE_MAX_LENGTH}).`);
      return;
    }

    setVipDailyRoutineEditSaving(true);
    const saveResult = await saveVipDailyRoutine({
      id: isEditMode ? routineId : "",
      classId,
      dayOfWeek: Number.parseInt(dayOfWeek, 10),
      activityType,
      startTime,
      endTime,
      note
    });
    if (!saveResult?.ok) {
      setVipDailyRoutineModalError(saveResult?.message || "Failed to save routine.");
      setVipDailyRoutineEditSaving(false);
      return;
    }
    closeVipDailyRoutineEditModal();
  }

  async function confirmVipDailyRoutineDelete() {
    const routineId = String(vipDailyRoutineDeleteModal.id || "").trim();
    if (!routineId) {
      closeVipDailyRoutineDeleteModal();
      return;
    }
    setVipDailyRoutineDeleteSaving(true);
    const result = await deleteVipDailyRoutine(routineId);
    if (!result?.ok) {
      showVipClassModalAlert(result?.message || "Failed to delete routine.");
      setVipDailyRoutineDeleteSaving(false);
      return;
    }
    closeVipDailyRoutineDeleteModal();
  }

  function openVipClassAddModal() {
    setVipClassModalMode("add");
    setVipClassDraft({
      classId: "",
      className: "",
      teacherId: ""
    });
    setVipClassFormError("");
    setVipClassModalSaving(false);
    setVipClassAddModalOpen(true);
  }

  function openVipClassEditModal(row) {
    const normalizedId = String(row?.id || row?.classId || "").trim();
    if (!normalizedId) {
      return;
    }
    setVipClassModalMode("edit");
    setVipClassDraft({
      classId: normalizedId,
      className: String(row?.className || "").trim(),
      teacherId: String(row?.teacherId || "").trim()
    });
    setVipClassFormError("");
    setVipClassModalSaving(false);
    setVipClassAddModalOpen(true);
  }

  function closeVipClassAddModal() {
    setVipClassAddModalOpen(false);
    setVipClassModalMode("add");
    setVipClassDraft({
      classId: "",
      className: "",
      teacherId: ""
    });
    setVipClassFormError("");
    setVipClassModalSaving(false);
  }

  function openVipClassDeleteModal(row) {
    const classId = String(row?.id || row?.classId || "").trim();
    if (!classId) {
      return;
    }
    setVipClassDeleteModal({
      open: true,
      classId,
      className: String(row?.className || "").trim(),
      error: ""
    });
    setVipClassDeleteSaving(false);
  }

  function closeVipClassDeleteModal() {
    setVipClassDeleteModal({
      open: false,
      classId: "",
      className: "",
      error: ""
    });
    setVipClassDeleteSaving(false);
  }

  async function handleVipClassSave() {
    const className = String(vipClassDraft?.className || "").trim();
    const teacherId = String(vipClassDraft?.teacherId || "").trim();
    const classId = String(vipClassDraft?.classId || "").trim();
    if (!className) {
      setVipClassModalError("Class name is required.");
      return;
    }
    if (className.length > 64) {
      setVipClassModalError("Class name is too long (max 64).");
      return;
    }
    if (!teacherId) {
      setVipClassModalError("Teacher is required.");
      return;
    }
    setVipClassModalSaving(true);
    const result = await saveVipClassAssignment({
      classId: classId || null,
      className,
      teacherId
    });
    if (!result?.ok) {
      setVipClassModalError(result?.message || "Failed to save class assignment.");
      setVipClassModalSaving(false);
      return;
    }
    closeVipClassAddModal();
  }

  async function confirmVipClassDelete() {
    const classId = String(vipClassDeleteModal.classId || "").trim();
    if (!classId) {
      closeVipClassDeleteModal();
      return;
    }
    setVipClassDeleteSaving(true);
    const result = await deleteVipClassAssignment(classId);
    if (!result?.ok) {
      setVipClassDeleteModal((prev) => ({
        ...prev,
        error: String(result?.message || "Failed to delete class assignment.").trim()
      }));
      setVipClassDeleteSaving(false);
      return;
    }
    closeVipClassDeleteModal();
  }

  function openVipTutorEditModal(row) {
    const clientId = String(row?.id || "").trim();
    if (!clientId) {
      return;
    }
    setVipTutorEditModal({
      open: true,
      clientId,
      classId: String(row?.classId || "").trim(),
      tutorId: String(row?.tutorId || "").trim(),
      error: ""
    });
  }

  function closeVipTutorEditModal() {
    setVipTutorEditModal({
      open: false,
      clientId: "",
      classId: "",
      tutorId: "",
      error: ""
    });
    setVipTutorEditSaving(false);
  }

  async function handleVipTutorEditSave() {
    const clientId = String(vipTutorEditModal.clientId || "").trim();
    const classId = String(vipTutorEditModal.classId || "").trim();
    const tutorId = String(vipTutorEditModal.tutorId || "").trim();
    if (!clientId) {
      closeVipTutorEditModal();
      return;
    }
    if (!classId) {
      setVipTutorModalError("Class is required.");
      return;
    }
    if (!tutorId) {
      setVipTutorModalError("Tutor is required.");
      return;
    }
    setVipTutorEditSaving(true);
    const saveResult = await saveVipAssignment(clientId, {
      classId,
      tutorId
    });
    if (!saveResult?.ok) {
      setVipTutorModalError(saveResult?.message || "Failed to save tutor assignment.");
      setVipTutorEditSaving(false);
      return;
    }
    closeVipTutorEditModal();
  }

  function openOrganizationCreateModal() {
    setOrganizationCreateForm({
      code: "",
      name: "",
      isActive: true
    });
    setOrganizationCreateError("");
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
    if (mainView === "all-users") {
      openCreateUserPanel();
      return;
    }
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
      isActive: true
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

  const adminOptionsOrganizationOptions = (() => {
    const seen = new Set();
    const mapped = (Array.isArray(organizations) ? organizations : [])
      .map((item) => {
        const id = String(item?.id || "").trim();
        if (!id || seen.has(id)) {
          return null;
        }
        seen.add(id);
        const name = String(item?.name || "").trim();
        const code = String(item?.code || "").trim().toLowerCase();
        const label = name && code
          ? `${name} (${code})`
          : (name || code || `Organization #${id}`);
        return { value: id, label };
      })
      .filter(Boolean);

    const currentOrganizationId = String(profile?.organizationId || "").trim();
    if (currentOrganizationId && !seen.has(currentOrganizationId)) {
      const currentOrganizationName = String(profile?.organizationName || "").trim();
      const currentOrganizationCode = String(profile?.organizationCode || "").trim().toLowerCase();
      mapped.unshift({
        value: currentOrganizationId,
        label: currentOrganizationName && currentOrganizationCode
          ? `${currentOrganizationName} (${currentOrganizationCode})`
          : (currentOrganizationName || currentOrganizationCode || `Organization #${currentOrganizationId}`)
      });
    }
    return mapped;
  })();

  const vipAttendanceAbsentModalLayer = (
    <>
      <section
        id="vipAttendanceAbsentReasonModal"
        className="logout-confirm-modal vip-attendance-absent-modal"
        hidden={!vipAttendanceAbsentModal.open}
      >
        <div className="all-users-head">
          <h3>Why absent?</h3>
          <button
            id="closeVipAttendanceAbsentReasonModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close absent reason modal"
            onClick={closeVipAttendanceAbsentModal}
          >
            ×
          </button>
        </div>

        <label className="field" htmlFor="vipAttendanceAbsentReasonInput">
          <span>Reason</span>
          <textarea
            id="vipAttendanceAbsentReasonInput"
            className="notify-textarea vip-attendance-absent-textarea"
            value={vipAttendanceAbsentModal.reason}
            maxLength={VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH}
            placeholder="Write reason"
            onChange={(event) => {
              const nextValue = String(event.currentTarget.value || "").slice(0, VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH);
              setVipAttendanceAbsentModal((prev) => ({
                ...prev,
                reason: nextValue,
                error: ""
              }));
            }}
          />
        </label>
        <p className="vip-attendance-absent-reason-count">
          {vipAttendanceAbsentModal.reason.length}/{VIP_ATTENDANCE_ABSENT_REASON_MAX_LENGTH}
        </p>

        <div className="edit-actions vip-attendance-absent-actions">
          <button
            id="saveVipAttendanceAbsentReasonBtn"
            type="button"
            className="btn"
            disabled={vipAttendanceAbsentSaving || (!canCreateAppointmentVipClients && !canUpdateAppointmentVipClients)}
            onClick={() => {
              void handleVipAttendanceAbsentReasonSave();
            }}
          >
            {vipAttendanceAbsentSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        hidden={!vipAttendanceAbsentModal.open}
        onClick={closeVipAttendanceAbsentModal}
      />
    </>
  );

  const vipAttendanceEditModalLayer = (
    <>
      <section
        id="vipAttendanceEditModal"
        className="logout-confirm-modal vip-attendance-edit-modal"
        hidden={!vipAttendanceEditModal.open}
      >
        <div className="all-users-head">
          <h3>Edit attendance</h3>
          <button
            id="closeVipAttendanceEditModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close edit attendance modal"
            onClick={closeVipAttendanceEditModal}
          >
            ×
          </button>
        </div>

        {(() => {
          const normalizedStatus = normalizeVipAttendanceStatus(vipAttendanceEditModal.status);
          const isPresentMode = normalizedStatus === "present";
          const isAbsentMode = normalizedStatus === "absent";
          return (
            <>
              <div className="vip-attendance-edit-grid">
                <label className="field" htmlFor="vipAttendanceEditArrivalInput">
                  <span>Arrival time</span>
                  <input
                    id="vipAttendanceEditArrivalInput"
                    type="datetime-local"
                    value={vipAttendanceEditModal.arrivalTime}
                    disabled={isAbsentMode}
                    onChange={(event) => {
                      const nextValue = String(event.currentTarget.value || "").trim();
                      setVipAttendanceEditModal((prev) => ({
                        ...prev,
                        arrivalTime: nextValue,
                        departureTime: nextValue ? prev.departureTime : "",
                        error: ""
                      }));
                    }}
                  />
                </label>
                <label className="field" htmlFor="vipAttendanceEditDepartureInput">
                  <span>Departure time</span>
                  <input
                    id="vipAttendanceEditDepartureInput"
                    type="datetime-local"
                    value={vipAttendanceEditModal.departureTime}
                    disabled={isAbsentMode || !vipAttendanceEditModal.arrivalTime}
                    onChange={(event) => {
                      const nextValue = String(event.currentTarget.value || "").trim();
                      setVipAttendanceEditModal((prev) => ({
                        ...prev,
                        departureTime: nextValue,
                        error: ""
                      }));
                    }}
                  />
                </label>
              </div>

              <label className="field" htmlFor="vipAttendanceEditNoteInput">
                <span>Absent</span>
                <textarea
                  id="vipAttendanceEditNoteInput"
                  className="notify-textarea vip-attendance-edit-textarea"
                  value={vipAttendanceEditModal.note}
                  maxLength={VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH}
                  placeholder="Write note"
                  disabled={isPresentMode}
                  onChange={(event) => {
                    const nextValue = String(event.currentTarget.value || "").slice(0, VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH);
                    setVipAttendanceEditModal((prev) => ({
                      ...prev,
                      note: nextValue,
                      error: ""
                    }));
                  }}
                />
              </label>
              <p className="vip-attendance-edit-note-count">
                {vipAttendanceEditModal.note.length}/{VIP_ATTENDANCE_EDIT_NOTE_MAX_LENGTH}
              </p>
            </>
          );
        })()}

        <div className="edit-actions vip-attendance-edit-actions">
          <button
            id="deleteVipAttendanceEditBtn"
            type="button"
            className="table-action-btn table-action-btn-danger"
            disabled={vipAttendanceEditSaving || !canDeleteAppointmentVipClients}
            onClick={() => {
              void handleVipAttendanceEditDelete();
            }}
          >
            {vipAttendanceEditSaving && vipAttendanceEditAction === "delete" ? "Deleting..." : "Delete"}
          </button>
          <button
            id="saveVipAttendanceEditBtn"
            type="button"
            className="btn"
            disabled={vipAttendanceEditSaving || (!canCreateAppointmentVipClients && !canUpdateAppointmentVipClients)}
            onClick={() => {
              void handleVipAttendanceEditSave();
            }}
          >
            {vipAttendanceEditSaving && vipAttendanceEditAction === "save" ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        hidden={!vipAttendanceEditModal.open}
        onClick={closeVipAttendanceEditModal}
      />
    </>
  );

  const vipDailyRoutineEditModalLayer = (
    <>
      <section
        id="vipDailyRoutineEditModal"
        className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal vip-class-add-modal"
        hidden={!vipDailyRoutineEditModal.open}
        aria-modal="true"
        role="dialog"
        aria-label={vipDailyRoutineEditModal.id ? "Edit VIP daily routine" : "Add VIP daily routine"}
      >
        <div className="appointment-breaks-add-modal-head">
          <h3>{vipDailyRoutineEditModal.id ? "Edit routine" : "Add routine"}</h3>
          <button
            id="closeVipDailyRoutineEditModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close routine modal"
            onClick={closeVipDailyRoutineEditModal}
          >
            ×
          </button>
        </div>

        <form
          className="appointment-breaks-add-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleVipDailyRoutineSave();
          }}
        >
          <div className="vip-daily-routine-form-scroll">
            <div className="vip-class-add-grid">
              <div>
                <span>Class</span>
                <CustomSelect
                  id="vipDailyRoutineClassSelect"
                  placeholder="Select class"
                  value={String(vipDailyRoutineEditModal.classId || "")}
                  options={vipDailyRoutineClassOptions}
                  searchable
                  searchThreshold={8}
                  menuPortal
                  maxVisibleOptions={8}
                  onChange={(nextValue) => {
                    setVipDailyRoutineEditModal((prev) => ({
                      ...prev,
                      classId: String(nextValue || "").trim(),
                      error: ""
                    }));
                  }}
                />
              </div>
              <div>
                <span>Day</span>
                <CustomSelect
                  id="vipDailyRoutineDaySelect"
                  placeholder="Select day"
                  value={String(vipDailyRoutineEditModal.dayOfWeek || "1")}
                  options={VIP_DAILY_ROUTINE_DAY_OPTIONS}
                  menuPortal
                  onChange={(nextValue) => {
                    setVipDailyRoutineEditModal((prev) => ({
                      ...prev,
                      dayOfWeek: String(nextValue || "1"),
                      error: ""
                    }));
                  }}
                />
              </div>
              <div>
                <span>Activity</span>
              <CustomSelect
                id="vipDailyRoutineActivitySelect"
                placeholder="Select activity"
                value={String(vipDailyRoutineEditModal.activityType || "group-lesson")}
                options={VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS}
                menuPortal
                onChange={(nextValue) => {
                  setVipDailyRoutineEditModal((prev) => ({
                    ...prev,
                    activityType: String(nextValue || "group-lesson"),
                    error: ""
                  }));
                }}
              />
              </div>
              <div className="vip-daily-routine-time-row">
                <label htmlFor="vipDailyRoutineStartTimeInput">
                  <span>Start</span>
                  <input
                    id="vipDailyRoutineStartTimeInput"
                    type="time"
                    value={vipDailyRoutineEditModal.startTime}
                    onChange={(event) => {
                      const nextValue = String(event.currentTarget.value || "").trim();
                      setVipDailyRoutineEditModal((prev) => ({
                        ...prev,
                        startTime: nextValue,
                        error: ""
                      }));
                    }}
                  />
                </label>
                <label htmlFor="vipDailyRoutineEndTimeInput">
                  <span>End</span>
                  <input
                    id="vipDailyRoutineEndTimeInput"
                    type="time"
                    value={vipDailyRoutineEditModal.endTime}
                    onChange={(event) => {
                      const nextValue = String(event.currentTarget.value || "").trim();
                      setVipDailyRoutineEditModal((prev) => ({
                        ...prev,
                        endTime: nextValue,
                        error: ""
                      }));
                    }}
                  />
                </label>
              </div>
            </div>

            <label htmlFor="vipDailyRoutineNoteInput">
              <span>Note</span>
              <textarea
                id="vipDailyRoutineNoteInput"
                className="notify-textarea"
                value={vipDailyRoutineEditModal.note}
                maxLength={VIP_DAILY_ROUTINE_NOTE_MAX_LENGTH}
                placeholder="Optional note"
                onChange={(event) => {
                  const nextValue = String(event.currentTarget.value || "").slice(0, VIP_DAILY_ROUTINE_NOTE_MAX_LENGTH);
                  setVipDailyRoutineEditModal((prev) => ({
                    ...prev,
                    note: nextValue,
                    error: ""
                  }));
                }}
              />
            </label>

          </div>

          <div className="edit-actions appointment-breaks-add-modal-actions">
            <button
              id="saveVipDailyRoutineModalBtn"
              className="header-btn"
              type="submit"
              disabled={vipDailyRoutineEditSaving}
            >
              {vipDailyRoutineEditSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div
        className="login-overlay"
        hidden={!vipDailyRoutineEditModal.open}
        onClick={closeVipDailyRoutineEditModal}
      />
    </>
  );

  const vipDailyRoutineDeleteModalLayer = (
    <>
      <section
        id="vipDailyRoutineDeleteModal"
        className="logout-confirm-modal settings-edit-modal"
        hidden={!vipDailyRoutineDeleteModal.open}
        aria-modal="true"
        role="dialog"
        aria-label="Delete VIP routine confirmation"
      >
        <h3>Delete this routine?</h3>
        <p className="all-users-state">
          This action cannot be undone.
        </p>
        <div className="logout-confirm-actions">
          <button
            id="vipDailyRoutineDeleteConfirmBtn"
            type="button"
            className="table-action-btn table-action-btn-danger"
            disabled={vipDailyRoutineDeleteSaving}
            onClick={() => {
              void confirmVipDailyRoutineDelete();
            }}
          >
            {vipDailyRoutineDeleteSaving ? "Deleting..." : "Yes"}
          </button>
          <button
            id="vipDailyRoutineDeleteNoBtn"
            type="button"
            className="btn header-btn"
            disabled={vipDailyRoutineDeleteSaving}
            onClick={closeVipDailyRoutineDeleteModal}
          >
            No
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        hidden={!vipDailyRoutineDeleteModal.open}
        onClick={() => {
          if (!vipDailyRoutineDeleteSaving) {
            closeVipDailyRoutineDeleteModal();
          }
        }}
      />
    </>
  );

  const vipClassAddModalLayer = (
    <>
      <section
        id="vipClassAddModal"
        className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal vip-class-add-modal"
        hidden={!vipClassAddModalOpen}
        aria-modal="true"
        role="dialog"
        aria-label="Add class"
      >
        <div className="appointment-breaks-add-modal-head">
          <h3>{vipClassModalMode === "edit" ? "Edit class" : "Add class"}</h3>
          <button
            id="closeVipClassAddModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close add class modal"
            onClick={closeVipClassAddModal}
          >
            ×
          </button>
        </div>

        <form
          className="appointment-breaks-add-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleVipClassSave();
          }}
        >
          <div className="vip-class-add-grid">
            <label htmlFor="vipClassModalNameInput">
              <span>Class name</span>
              <input
                id="vipClassModalNameInput"
                type="text"
                maxLength={64}
                placeholder="Class name"
                value={String(vipClassDraft?.className || "")}
                onChange={(event) => {
                  const nextValue = String(event.currentTarget.value || "");
                  setVipClassDraft((prev) => ({
                    ...prev,
                    className: nextValue
                  }));
                  if (vipClassFormError) {
                    setVipClassFormError("");
                  }
                }}
              />
            </label>

            <div>
              <span>Teacher</span>
              <CustomSelect
                id="vipClassModalTeacherSelect"
                placeholder="Select teacher"
                value={String(vipClassDraft?.teacherId || "")}
                options={vipClassTeacherOptions}
                searchable
                searchThreshold={8}
                menuPortal
                maxVisibleOptions={6}
                onChange={(nextValue) => {
                  setVipClassDraft((prev) => ({
                    ...prev,
                    teacherId: String(nextValue || "")
                  }));
                  if (vipClassFormError) {
                    setVipClassFormError("");
                  }
                }}
              />
            </div>
          </div>

          <div className="edit-actions appointment-breaks-add-modal-actions">
            <button
              id="saveVipClassAddModalBtn"
              className="header-btn"
              type="submit"
              disabled={vipClassModalSaving}
            >
              {vipClassModalSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div
        className="login-overlay"
        hidden={!vipClassAddModalOpen}
        onClick={closeVipClassAddModal}
      />
    </>
  );

  const vipClassDeleteModalLayer = (
    <>
      <section
        id="vipClassDeleteModal"
        className="logout-confirm-modal settings-edit-modal"
        hidden={!vipClassDeleteModal.open}
        aria-modal="true"
        role="dialog"
        aria-label="Delete class confirmation"
      >
        <h3>Delete this class?</h3>
        <p className="all-users-state">
          {vipClassDeleteModal.className
            ? `Class: ${vipClassDeleteModal.className}`
            : "This action cannot be undone."}
        </p>
        <div className="logout-confirm-actions">
          <button
            id="vipClassDeleteConfirmBtn"
            type="button"
            className="table-action-btn table-action-btn-danger"
            disabled={vipClassDeleteSaving}
            onClick={() => {
              void confirmVipClassDelete();
            }}
          >
            {vipClassDeleteSaving ? "Deleting..." : "Yes"}
          </button>
          <button
            id="vipClassDeleteNoBtn"
            type="button"
            className="btn header-btn"
            disabled={vipClassDeleteSaving}
            onClick={closeVipClassDeleteModal}
          >
            No
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        hidden={!vipClassDeleteModal.open}
        onClick={() => {
          if (!vipClassDeleteSaving) {
            closeVipClassDeleteModal();
          }
        }}
      />
    </>
  );

  const vipTutorEditModalLayer = (
    <>
      <section
        id="vipTutorEditModal"
        className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal vip-class-add-modal"
        hidden={!vipTutorEditModal.open}
        aria-modal="true"
        role="dialog"
        aria-label="Edit tutor assignment"
      >
        <div className="appointment-breaks-add-modal-head">
          <h3>Edit tutor assignment</h3>
          <button
            id="closeVipTutorEditModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close tutor assignment modal"
            onClick={closeVipTutorEditModal}
          >
            ×
          </button>
        </div>

        <form
          className="appointment-breaks-add-modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleVipTutorEditSave();
          }}
        >
          <div className="vip-class-add-grid">
            <div>
              <span>Class</span>
              <CustomSelect
                id="vipTutorEditClassSelect"
                placeholder="Select class"
                value={String(vipTutorEditModal.classId || "")}
                options={vipAssignmentClassOptions}
                searchable
                searchThreshold={8}
                menuPortal
                maxVisibleOptions={6}
                onChange={(nextValue) => {
                  setVipTutorEditModal((prev) => ({
                    ...prev,
                    classId: String(nextValue || ""),
                    error: ""
                  }));
                }}
              />
            </div>

            <div>
              <span>Tutor</span>
              <CustomSelect
                id="vipTutorEditTutorSelect"
                placeholder="Select tutor"
                value={String(vipTutorEditModal.tutorId || "")}
                options={vipAssignmentTutorOptions}
                searchable
                searchThreshold={8}
                menuPortal
                maxVisibleOptions={6}
                onChange={(nextValue) => {
                  setVipTutorEditModal((prev) => ({
                    ...prev,
                    tutorId: String(nextValue || ""),
                    error: ""
                  }));
                }}
              />
            </div>
          </div>

          <div className="edit-actions appointment-breaks-add-modal-actions">
            <button
              id="saveVipTutorEditModalBtn"
              className="header-btn"
              type="submit"
              disabled={vipTutorEditSaving}
            >
              {vipTutorEditSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
      <div
        className="login-overlay"
        hidden={!vipTutorEditModal.open}
        onClick={closeVipTutorEditModal}
      />
    </>
  );

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

  const clientCreateModalLayer = (
    <>
      <section id="clientsCreateModal" className="logout-confirm-modal all-users-edit-modal" hidden={!clientCreateModalOpen}>
        <div className="all-users-head">
          <h3>Create Client</h3>
          <button
            id="closeClientsCreateModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close create client modal"
            onClick={closeClientCreateModal}
          >
            ×
          </button>
        </div>

        {!canCreateClients ? (
          <p className="all-users-state">You do not have permission to create clients.</p>
        ) : (
          <form
            className="auth-form"
            noValidate
            onSubmit={async (event) => {
              const isCreated = await handleClientCreateSubmit(event);
              if (isCreated) {
                setClientCreateModalOpen(false);
              }
            }}
          >
            <div className="all-users-edit-fields">
              <div className="field">
                <label htmlFor="clientCreateModalFirstName">First Name</label>
                <input
                  id="clientCreateModalFirstName"
                  name="firstName"
                  type="text"
                  required
                  placeholder="First Name"
                  className={clientCreateErrors.firstName ? "input-error" : ""}
                  value={clientCreateForm.firstName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, firstName: nextValue }));
                    if (clientCreateErrors.firstName) {
                      setClientCreateErrors((prev) => ({ ...prev, firstName: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.firstName || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreateModalLastName">Last Name</label>
                <input
                  id="clientCreateModalLastName"
                  name="lastName"
                  type="text"
                  required
                  placeholder="Last Name"
                  className={clientCreateErrors.lastName ? "input-error" : ""}
                  value={clientCreateForm.lastName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, lastName: nextValue }));
                    if (clientCreateErrors.lastName) {
                      setClientCreateErrors((prev) => ({ ...prev, lastName: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.lastName || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreateModalMiddleName">Middle Name</label>
                <input
                  id="clientCreateModalMiddleName"
                  name="middleName"
                  type="text"
                  placeholder="Middle Name"
                  className={clientCreateErrors.middleName ? "input-error" : ""}
                  value={clientCreateForm.middleName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, middleName: nextValue }));
                    if (clientCreateErrors.middleName) {
                      setClientCreateErrors((prev) => ({ ...prev, middleName: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.middleName || ""}</small>
              </div>

              <div className="client-birthday-vip-row">
                <div className="field">
                  <label htmlFor="clientCreateModalBirthday">Birthday</label>
                  <input
                    id="clientCreateModalBirthday"
                    name="birthday"
                    type="date"
                    required
                    min="1950-01-01"
                    max={maxBirthdayYmd}
                    className={clientCreateErrors.birthday ? "input-error" : ""}
                    value={clientCreateForm.birthday}
                    onInput={(event) => {
                      const nextValue = event.currentTarget.value;
                      setClientCreateForm((prev) => ({ ...prev, birthday: nextValue }));
                      if (clientCreateErrors.birthday) {
                        setClientCreateErrors((prev) => ({ ...prev, birthday: "" }));
                      }
                    }}
                  />
                  <small className="field-error">{clientCreateErrors.birthday || ""}</small>
                </div>

                <div className="field clients-create-vip-field">
                  <label htmlFor="clientCreateModalIsVip">VIP</label>
                  <label
                    className={`clients-create-vip-toggle${clientCreateForm.isVip ? " is-active" : ""}`}
                    htmlFor="clientCreateModalIsVip"
                  >
                    <input
                      id="clientCreateModalIsVip"
                      type="checkbox"
                      checked={Boolean(clientCreateForm.isVip)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setClientCreateForm((prev) => ({ ...prev, isVip: checked }));
                      }}
                    />
                  </label>
                  <small className="field-error">{clientCreateErrors.isVip || ""}</small>
                </div>
              </div>

              <div className="field">
                <label htmlFor="clientCreateModalPhone">Phone Number</label>
                <input
                  id="clientCreateModalPhone"
                  name="phone"
                  type="tel"
                  placeholder="+998977861070"
                  className={clientCreateErrors.phone ? "input-error" : ""}
                  value={clientCreateForm.phone}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, phone: nextValue }));
                    if (clientCreateErrors.phone) {
                      setClientCreateErrors((prev) => ({ ...prev, phone: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.phone || ""}</small>
              </div>

              <div className="field">
                <label htmlFor="clientCreateModalTelegramOrEmail">Email</label>
                <input
                  id="clientCreateModalTelegramOrEmail"
                  name="telegramOrEmail"
                  type="text"
                  placeholder="user@gmail.com"
                  className={clientCreateErrors.telegramOrEmail ? "input-error" : ""}
                  value={clientCreateForm.telegramOrEmail}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setClientCreateForm((prev) => ({ ...prev, telegramOrEmail: nextValue }));
                    if (clientCreateErrors.telegramOrEmail) {
                      setClientCreateErrors((prev) => ({ ...prev, telegramOrEmail: "" }));
                    }
                  }}
                />
                <small className="field-error">{clientCreateErrors.telegramOrEmail || ""}</small>
              </div>
            </div>

            <div className="edit-actions">
              <button id="createClientModalBtn" className="btn" type="submit" disabled={clientCreateSubmitting}>
                {clientCreateSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}
      </section>
      <div id="clientsCreateOverlay" className="login-overlay" hidden={!clientCreateModalOpen} onClick={closeClientCreateModal} />
    </>
  );

  const userCreateModalLayer = (
    <>
      <section id="usersCreateModal" className="logout-confirm-modal all-users-edit-modal" hidden={!userCreateModalOpen}>
        <div className="all-users-head">
          <h3>Create User</h3>
          <button
            id="closeUsersCreateModalBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close create user modal"
            onClick={closeUserCreateModal}
          >
            ×
          </button>
        </div>

        {!canCreateUsers ? (
          <p className="all-users-state">You do not have permission to create users.</p>
        ) : (
          <form
            className="auth-form"
            id="adminCreateForm"
            noValidate
            onSubmit={async (event) => {
              const isCreated = await handleCreateUserSubmit(event);
              if (isCreated) {
                closeUserCreateModal();
              }
            }}
          >
            <div className="all-users-edit-fields">
              <div className="field">
                <label htmlFor="createUserOrganizationCode">Organisation</label>
                <CustomSelect
                  id="createUserOrganizationCode"
                  placeholder="Select organisation"
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
            </div>

            <div className="edit-actions">
              <button id="adminCreateBtn" className="btn" type="submit" disabled={createSubmitting}>
                {createSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}
      </section>
      <div id="usersCreateOverlay" className="login-overlay" hidden={!userCreateModalOpen} onClick={closeUserCreateModal} />
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

  return (
    <>
      <main className="home-main" aria-label="Main content">
      {(mainView === "all-users" || mainView === "create-user") && (
        <section id="allUsersPanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>All Users</h3>
            <div className="all-users-head-actions">
              <button
                id="openUsersCreateModalBtn"
                type="button"
                className="header-btn appointment-breaks-add-icon-btn"
                aria-label="Add user"
                title="Add user"
                hidden={!canCreateUsers}
                onClick={openUserCreateModal}
              >
                +
              </button>
              <button
                id="closeAllUsersBtn"
                type="button"
                className="header-btn panel-close-btn"
                aria-label="Close all users panel"
                onClick={mainView === "create-user" ? closeCreateUserPanel : closeAllUsersPanel}
              >
                ×
              </button>
            </div>
          </div>

          <form
            className="panel-search-bar"
            onSubmit={(e) => {
              e.preventDefault();
              void loadAllUsers(1);
            }}
          >
            <input
              type="search"
              className="panel-search-input"
              placeholder="Search by ID, name, username, email, phone..."
              value={allUsersSearch}
              onChange={(e) => setAllUsersSearch(e.currentTarget.value)}
            />
            <button type="submit" className="btn panel-search-btn" disabled={allUsersLoading}>
              Search
            </button>
          </form>

          <div id="allUsersTableWrap" className="all-users-table-wrap">
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
                {allUsersLoading ? (
                  [0, 1, 2, 3, 4].map((i) => (
                    <tr key={i} aria-hidden="true">
                      <td colSpan="12" className="skel" />
                    </tr>
                  ))
                ) : allUsers.map((user) => {
                  return (
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
                  );
                })}
              </tbody>
            </table>
          </div>

          <div id="allUsersPagination" className="all-users-pagination" hidden={allUsersLoading || allUsers.length === 0}>
            <button
              id="allUsersPrevBtn"
              type="button"
              className="header-btn"
              disabled={allUsersPage <= 1}
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
              disabled={allUsersPage >= allUsersTotalPages}
              onClick={() => loadAllUsers(allUsersPage + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {mainView === "clients-all" && (
        <section id="clientsPanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>All Clients</h3>
            <div className="all-users-head-actions">
              <button
                id="openClientsCreateModalBtn"
                type="button"
                className="header-btn appointment-breaks-add-icon-btn"
                aria-label="Add client"
                title="Add client"
                hidden={!canCreateClients}
                onClick={openClientCreateModal}
              >
                +
              </button>
              <button
                id="closeAllClientsBtn"
                type="button"
                className="header-btn panel-close-btn"
                aria-label="Close all clients panel"
                onClick={closeAllClientsPanel}
              >
                ×
              </button>
            </div>
          </div>

          <form
            className="panel-search-bar"
            onSubmit={(e) => {
              e.preventDefault();
              void loadClients(1);
            }}
          >
            <input
              type="search"
              className="panel-search-input"
              placeholder="Search by ID, name, phone..."
              value={clientsSearch}
              onChange={(e) => setClientsSearch(e.currentTarget.value)}
            />
            <div className="panel-search-select">
              <CustomSelect
                id="clientsVipFilterSelect"
                value={clientsIsVip}
                placeholder="All"
                options={[
                  { value: "", label: "All" },
                  { value: "true", label: "VIP" },
                  { value: "false", label: "Non-VIP" }
                ]}
                onChange={(val) => {
                  setClientsIsVip(val);
                  void loadClients(1, undefined, val);
                }}
                menuPortal
                maxVisibleOptions={3}
              />
            </div>
            <button type="submit" className="btn panel-search-btn" disabled={clientsLoading}>
              Search
            </button>
          </form>

          <div className="all-users-table-wrap">
            <table className="all-users-table" aria-label="Clients table">
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
                  <th>Edit</th>
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
                    <tr key={rowId}>
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
                          disabled={!canUpdateClients}
                          onClick={() => startClientEdit(item)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
                          disabled={!canDeleteClients}
                          onClick={() => openClientsDeleteModal(item)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="all-users-pagination" hidden={clientsLoading || clients.length === 0}>
            <button
              type="button"
              className="header-btn"
              disabled={clientsPage <= 1}
              onClick={() => loadClients(clientsPage - 1)}
            >
              Previous
            </button>
            <span className="all-users-page-info">
              Page {clientsPage} of {clientsTotalPages}
            </span>
            <button
              type="button"
              className="header-btn"
              disabled={clientsPage >= clientsTotalPages}
              onClick={() => loadClients(clientsPage + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {mainView === "appointment" && (
        <section id="appointmentPanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>Appointment Planner</h3>
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
          <AppointmentScheduler
            canCreateAppointments={canCreateAppointments}
            canUpdateAppointments={canUpdateAppointments}
            canDeleteAppointments={canDeleteAppointments}
            currentUserId={String(profile?.id || "").trim()}
            restrictCreateToOwnSpecialist={isSpecialistUser}
            onNotification={onAppointmentNotification}
          />
        </section>
      )}

      {mainView === "appointment-settings" && (
        <section id="appointmentSettingsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Appointment Settings</h3>
            <button
              id="closeAppointmentSettingsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close appointment settings panel"
              onClick={closeAppointmentSettingsPanel}
            >
              ×
            </button>
          </div>
          <AppointmentSettingsPanel
            canUpdateAppointments={canUpdateAppointments}
            panelMode="settings"
            organizations={organizations}
            profile={profile}
          />
        </section>
      )}

      {mainView === "appointment-vip-schedule" && (
        <section id="appointmentVipSchedulePanel" className="all-users-panel">
          <div className="all-users-head">
            <h3>My Class</h3>
            <button
              id="closeAppointmentVipScheduleBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close my class panel"
              onClick={closeAppointmentVipSchedulePanel}
            >
              ×
            </button>
          </div>
          <AppointmentScheduler
            canCreateAppointments={canCreateAppointments}
            canUpdateAppointments={canUpdateAppointments}
            canDeleteAppointments={canDeleteAppointments}
            currentUserId={String(profile?.id || "").trim()}
            restrictCreateToOwnSpecialist={isSpecialistUser}
            vipOnly
            vipClassDailyRoutines={vipDailyRoutineItems}
            onNotification={onAppointmentNotification}
          />
        </section>
      )}

      {mainView === "appointment-breaks" && (
        <section id="appointmentBreaksPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Appointment Breaks</h3>
            <div className="all-users-head-actions">
              <button
                id="openAppointmentBreaksAddModalBtn"
                type="button"
                className="header-btn appointment-breaks-add-icon-btn"
                aria-label="Add break"
                title="Add break"
                onClick={() => {
                  if (typeof document === "undefined") {
                    return;
                  }
                  const addBtn = document.getElementById("appointmentBreaksAddBtn");
                  addBtn?.click();
                }}
              >
                +
              </button>
              <button
                id="closeAppointmentBreaksBtn"
                type="button"
                className="header-btn panel-close-btn"
                aria-label="Close appointment breaks panel"
                onClick={closeAppointmentBreaksPanel}
              >
                ×
              </button>
            </div>
          </div>
          <AppointmentSettingsPanel
            canUpdateAppointments={canUpdateAppointments}
            panelMode="breaks"
            organizations={organizations}
            profile={profile}
          />
        </section>
      )}

      {isVipAttendancePanelView && (() => {
        const normalizedFilter = ["all", "present", "absent"].includes(String(vipAttendanceFilter || "").trim().toLowerCase())
          ? String(vipAttendanceFilter || "").trim().toLowerCase()
          : "all";
        const normalizedTeacherFilter = String(vipAttendanceTeacherFilter || "").trim() || "all";
        const normalizedClassFilter = String(vipAttendanceClassFilter || "").trim() || "all";
        const vipAttendanceClassFilterOptions = [
          { value: "all", label: "All" },
          ...Array.from(
            new Set(
              vipAttendanceItems
                .map((item) => String(item?.className || item?.class_name || "").trim())
                .filter(Boolean)
            )
            )
            .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
            .map((className) => ({ value: className, label: className }))
        ];
        const teacherFilteredItems = vipAttendanceItems.filter((item) => {
          if (normalizedTeacherFilter === "all") {
            return true;
          }
          return String(item.teacherId || item.teacher_id || "").trim() === normalizedTeacherFilter;
        });
        const classFilteredItems = teacherFilteredItems.filter((item) => {
          if (normalizedClassFilter === "all") {
            return true;
          }
          return String(item.className || item.class_name || "").trim() === normalizedClassFilter;
        });
        const presentCount = classFilteredItems.reduce((sum, item) => {
          const rowId = String(item.id || "").trim();
          const status = normalizeVipAttendanceStatus(vipAttendanceDraftByClientId?.[rowId]?.status);
          return status === "present"
            ? sum + 1
            : sum;
        }, 0);
        const absentCount = classFilteredItems.reduce((sum, item) => {
          const rowId = String(item.id || "").trim();
          const status = normalizeVipAttendanceStatus(vipAttendanceDraftByClientId?.[rowId]?.status);
          return status === "absent"
            ? sum + 1
            : sum;
        }, 0);
        const filteredAttendanceItems = classFilteredItems.filter((item) => {
          const status = normalizeVipAttendanceStatus(vipAttendanceDraftByClientId?.[String(item.id || "")]?.status);
          if (normalizedFilter === "present") {
            return status === "present";
          }
          if (normalizedFilter === "absent") {
            return status === "absent";
          }
          return true;
        });
        const showVipAttendanceSkeleton = Boolean(vipAttendanceLoading);
        const canSaveVipAttendance = canCreateAppointmentVipClients || canUpdateAppointmentVipClients;
        const canManageVipAttendance = canSaveVipAttendance || canDeleteAppointmentVipClients;

        return (
          <section id="appointmentVipAttendancePanel" className="all-users-panel">
            <div className="all-users-head">
              <h3>VIP Attendance</h3>
              <button
                id="closeAppointmentVipAttendanceBtn"
                type="button"
                className="header-btn panel-close-btn"
                aria-label="Close VIP attendance panel"
                onClick={closeAppointmentVipAttendancePanel}
              >
                ×
              </button>
            </div>

            <div className="vip-attendance-toolbar">
              <label className="field vip-attendance-class-field" htmlFor="vipAttendanceClassFilterSelect">
                <span>Class</span>
                <CustomSelect
                  id="vipAttendanceClassFilterSelect"
                  value={normalizedClassFilter}
                  options={vipAttendanceClassFilterOptions}
                  placeholder="All"
                  searchable
                  searchThreshold={8}
                  onChange={(nextValue) => {
                    const normalizedValue = String(nextValue || "").trim() || "all";
                    setVipAttendanceClassFilter(normalizedValue);
                  }}
                />
              </label>
              <div className="vip-attendance-summary">
                <button
                  id="vipAttendanceFilterAllBtn"
                  type="button"
                  className={`vip-attendance-filter-btn${normalizedFilter === "all" ? " is-active" : ""}`}
                  onClick={() => setVipAttendanceFilter("all")}
                >
                  Total: {classFilteredItems.length}
                </button>
                <button
                  id="vipAttendanceFilterPresentBtn"
                  type="button"
                  className={`vip-attendance-filter-btn${normalizedFilter === "present" ? " is-active" : ""}`}
                  onClick={() => setVipAttendanceFilter("present")}
                >
                  Present: {presentCount}
                </button>
                <button
                  id="vipAttendanceFilterAbsentBtn"
                  type="button"
                  className={`vip-attendance-filter-btn${normalizedFilter === "absent" ? " is-active" : ""}`}
                  onClick={() => setVipAttendanceFilter("absent")}
                >
                  Absent: {absentCount}
                </button>
              </div>
            </div>

            <p className="all-users-state" hidden={showVipAttendanceSkeleton || !vipAttendanceMessage}>
              {vipAttendanceMessage}
            </p>
            <p className="all-users-state" hidden={showVipAttendanceSkeleton || vipAttendanceItems.length === 0 || filteredAttendanceItems.length > 0}>
              No children in selected filter.
            </p>

            <div className="all-users-table-wrap" hidden={!showVipAttendanceSkeleton && filteredAttendanceItems.length === 0}>
              <table className="all-users-table" aria-label="VIP attendance table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Child name</th>
                    <th>Tutor name</th>
                    <th>Arrival time</th>
                    <th>Departure time</th>
                    <th>Absent</th>
                    <th>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {showVipAttendanceSkeleton ? (
                    [0, 1, 2, 3, 4].map((i) => (
                      <tr key={i} aria-hidden="true">
                        <td colSpan="7" className="skel" />
                      </tr>
                    ))
                  ) : filteredAttendanceItems.map((item) => {
                    const rowId = String(item.id || "").trim();
                    const fullName = `${String(item.firstName || "").trim()} ${String(item.lastName || "").trim()} ${String(item.middleName || "").trim()}`
                      .replace(/\s+/g, " ")
                      .trim();
                    const attendanceEntry = vipAttendanceDraftByClientId?.[rowId] || {};
                    const status = normalizeVipAttendanceStatus(attendanceEntry?.status);
                    const arrivedAt = String(attendanceEntry?.arrivedAt || "").trim();
                    const leftAt = String(attendanceEntry?.leftAt || "").trim();
                    const note = String(attendanceEntry?.note || item.note || "").trim();
                    const isSaving = Boolean(vipAttendanceSavingByClientId?.[rowId]);
                    const isPresent = status === "present";
                    const isUnmarked = status === "unmarked";
                    return (
                      <tr key={`vipAttendanceRow_${rowId}`}>
                        <td>{rowId || "-"}</td>
                        <td>{fullName || "-"}</td>
                        <td>{String(item.tutorName || "").trim() || "-"}</td>
                        <td>
                          {arrivedAt ? (
                            formatAttendanceDateTime(arrivedAt)
                          ) : isUnmarked ? (
                            <button
                              id={`vipAttendancePresentBtn_${rowId}`}
                              type="button"
                              className="table-action-btn"
                              disabled={isSaving || !canSaveVipAttendance}
                              onClick={() => {
                                void markVipAttendancePresent(rowId);
                              }}
                            >
                              {isSaving ? "Saving..." : "Present"}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          {leftAt ? (
                            formatAttendanceDateTime(leftAt)
                          ) : (isPresent && Boolean(arrivedAt) ? (
                            <button
                              id={`vipAttendanceLeftBtn_${rowId}`}
                              type="button"
                              className="table-action-btn"
                              disabled={isSaving || !canSaveVipAttendance}
                              onClick={() => {
                                void markVipAttendanceLeft(rowId);
                              }}
                            >
                              {isSaving ? "Saving..." : "Left"}
                            </button>
                          ) : "-")}
                        </td>
                        <td className="vip-attendance-note-cell">
                          {status === "absent" ? (
                            <div className="vip-attendance-note-inline">
                              <span className="vip-attendance-note-text">{note || "Absent"}</span>
                            </div>
                          ) : isUnmarked ? (
                            <button
                              id={`vipAttendanceAbsentBtn_${rowId}`}
                              type="button"
                              className="table-action-btn table-action-btn-danger"
                              disabled={isSaving || !canSaveVipAttendance}
                              onClick={() => openVipAttendanceAbsentModal(rowId, note)}
                            >
                              {isSaving ? "Saving..." : "Absent"}
                            </button>
                          ) : "-"}
                        </td>
                        <td>
                          <button
                            id={`vipAttendanceEditBtn_${rowId}`}
                            type="button"
                            className="table-action-btn"
                            disabled={isSaving || !canManageVipAttendance}
                            onClick={() => openVipAttendanceEditModal(rowId, {
                              status,
                              arrivedAt,
                              leftAt,
                              note
                            })}
                          >
                            {isSaving ? "Saving..." : "Edit"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
              </table>
            </div>

          </section>
        );
      })()}

      {mainView === "appointment-vip-my-children" && (() => {
        const normalizedSelectedClientId = String(myChildrenSelectedClientId || "").trim();
        const rawChildOptions = Array.isArray(myChildrenOptions) ? myChildrenOptions : [];
        const childOptions = [
          { value: "", label: "All" },
          ...rawChildOptions
            .map((item) => ({
              value: String(item?.id || "").trim(),
              label: String(item?.label || "").trim()
            }))
            .filter((item) => Boolean(item.value))
        ];
        const hasAssignedChildren = childOptions.length > 1;
        const showAllChildren = !normalizedSelectedClientId;
        const selectedChild = rawChildOptions.find((item) => String(item?.id || "").trim() === normalizedSelectedClientId) || null;
        const selectedChildOption = childOptions.find((item) => item.value === normalizedSelectedClientId) || null;
        const currentDate = /^\d{4}-\d{2}-\d{2}$/.test(myChildrenDateYmd)
          ? new Date(`${myChildrenDateYmd}T00:00:00`)
          : null;
        const today = new Date();
        const fmtYmd = (d) => `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const visibleMyChildrenDayKeys = normalizeMyChildrenVisibleWeekDays(myChildrenVisibleWeekDays);
        const myChildrenWeekDays = !myChildrenIsCompact && currentDate
          ? MY_CHILDREN_DAY_ITEMS
            .filter((day) => visibleMyChildrenDayKeys.includes(day.key))
            .map((day) => {
              const date = new Date(currentDate);
              date.setDate(currentDate.getDate() + day.offset);
              const isToday = (
                date.getFullYear() === today.getFullYear()
                && date.getMonth() === today.getMonth()
                && date.getDate() === today.getDate()
              );
              return {
                key: day.key,
                label: day.label,
                offset: day.offset,
                date,
                dateYmd: fmtYmd(date),
                isToday
              };
            })
          : [];
        const selectedDayLabel = currentDate
          ? currentDate.toLocaleDateString("en-US", { weekday: "short" })
          : "Day";
        const selectedDateLabel = (() => {
          if (!currentDate) {
            return myChildrenDateYmd || "-";
          }
          if (myChildrenIsCompact) {
            return currentDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
          }
          return formatMyChildrenWeekRange(myChildrenWeekDays);
        })();
        const isSelectedDayToday = Boolean(
          currentDate
          && currentDate.getFullYear() === today.getFullYear()
          && currentDate.getMonth() === today.getMonth()
          && currentDate.getDate() === today.getDate()
        );
        const selectedChildLabel = String(selectedChild?.label || selectedChildOption?.label || "").trim() || "Selected child";
        const selectedChildMeta = [
          String(selectedChild?.className || "").trim() ? `Class: ${String(selectedChild?.className || "").trim()}` : "",
          String(selectedChild?.tutorName || "").trim() ? `Tutor: ${String(selectedChild?.tutorName || "").trim()}` : ""
        ].filter(Boolean).join(" / ");
        const showMyChildrenSkeleton = Boolean(myChildrenOptionsLoading || myChildrenScheduleLoading);
        const myChildrenRows = Array.isArray(myChildrenScheduleItems) ? myChildrenScheduleItems : [];
        const childMetaById = rawChildOptions.reduce((acc, item) => {
          const id = String(item?.id || "").trim();
          if (!id) {
            return acc;
          }
          acc[id] = {
            label: String(item?.label || "").trim() || `Child #${id}`,
            classId: String(item?.classId || "").trim(),
            className: String(item?.className || "").trim(),
            tutorName: String(item?.tutorName || "").trim()
          };
          return acc;
        }, {});
        const rowClientIds = Array.from(
          new Set(
            myChildrenRows
              .map((item) => String(item?.clientId || "").trim())
              .filter(Boolean)
          )
        );
        const myChildrenClientIdsToRender = showAllChildren
          ? Array.from(
            new Set([
              ...rawChildOptions.map((item) => String(item?.id || "").trim()).filter(Boolean),
              ...rowClientIds
            ])
          )
          : [normalizedSelectedClientId].filter(Boolean);
        const myChildrenClientIdsForDesktop = myChildrenClientIdsToRender.length > 0
          ? myChildrenClientIdsToRender
          : (showMyChildrenSkeleton ? ["__loading__"] : []);
        const showMyChildrenBoard = showMyChildrenSkeleton || hasAssignedChildren;
        const emptyMyChildrenMessage = !showMyChildrenSkeleton && !hasAssignedChildren
          ? ""
          : (myChildrenScheduleMessage || (myChildrenIsCompact ? "No lessons scheduled for selected day." : "No lessons scheduled for selected week."));
        const currentDayKey = currentDate
          ? (["sun", "mon", "tue", "wed", "thu", "fri", "sat"][currentDate.getDay()] || "")
          : "";
        const visibleMyChildrenWeekDays = myChildrenWeekDays.length > 0
          ? myChildrenWeekDays
          : [{
            key: currentDayKey || "day",
            label: "Day",
            dateYmd: myChildrenDateYmd || "day",
            shortDate: "-",
            isToday: false
          }];
        const myChildrenItemsByClientIdAndDate = myChildrenRows.reduce((acc, item) => {
          const clientKey = String(item?.clientId || "").trim() || "unknown";
          const key = String(item?.appointmentDate || "").trim();
          if (!key) {
            return acc;
          }
          if (!acc[clientKey] || typeof acc[clientKey] !== "object") {
            acc[clientKey] = {};
          }
          if (!Array.isArray(acc[clientKey][key])) {
            acc[clientKey][key] = [];
          }
          acc[clientKey][key].push({
            ...item,
            itemType: "appointment",
            startMinutes: normalizeMyChildrenTimeToMinutes(item?.startTime)
          });
          return acc;
        }, {});
        const myChildrenRoutineItemsByClassIdAndDayKey = (Array.isArray(vipDailyRoutineItems) ? vipDailyRoutineItems : []).reduce((acc, routine, index) => {
          const classId = String(routine?.classId || routine?.class_assignment_id || "").trim();
          if (!classId) {
            return acc;
          }
          const dayOfWeek = Number.parseInt(String(routine?.dayOfWeek ?? routine?.day_of_week ?? "").trim(), 10);
          const dayKey = MY_CHILDREN_DAY_NUM_TO_KEY[dayOfWeek] || "";
          if (!dayKey) {
            return acc;
          }
          const startTime = String(routine?.startTime || routine?.start_time || "").trim();
          const endTime = String(routine?.endTime || routine?.end_time || "").trim();
          if (!startTime) {
            return acc;
          }
          if (!acc[classId] || typeof acc[classId] !== "object") {
            acc[classId] = {};
          }
          if (!Array.isArray(acc[classId][dayKey])) {
            acc[classId][dayKey] = [];
          }
          const routineId = String(routine?.id || "").trim() || `${classId}_${dayKey}_${startTime}_${index}`;
          acc[classId][dayKey].push({
            id: `routine-${routineId}`,
            itemType: "daily-routine",
            status: "routine",
            routineLabel: formatVipDailyRoutineActivityLabel(routine?.activityType || routine?.activity_type),
            note: String(routine?.note || "").trim(),
            startTime,
            endTime,
            startMinutes: normalizeMyChildrenTimeToMinutes(startTime)
          });
          return acc;
        }, {});
        Object.values(myChildrenRoutineItemsByClassIdAndDayKey).forEach((dayItemsByKey) => {
          if (!dayItemsByKey || typeof dayItemsByKey !== "object") {
            return;
          }
          Object.keys(dayItemsByKey).forEach((dayKey) => {
            if (Array.isArray(dayItemsByKey[dayKey])) {
              dayItemsByKey[dayKey].sort(compareMyChildrenItems);
            }
          });
        });
        const myChildrenMergedItemsByClientIdAndDate = myChildrenClientIdsToRender.reduce((acc, clientId) => {
          const normalizedClientId = String(clientId || "").trim();
          if (!normalizedClientId) {
            return acc;
          }
          const classId = String(childMetaById?.[normalizedClientId]?.classId || "").trim();
          visibleMyChildrenWeekDays.forEach((day) => {
            const dateKey = String(day?.dateYmd || "").trim();
            if (!dateKey) {
              return;
            }
            const scheduleItems = Array.isArray(myChildrenItemsByClientIdAndDate?.[normalizedClientId]?.[dateKey])
              ? myChildrenItemsByClientIdAndDate[normalizedClientId][dateKey]
              : [];
            const routineItems = classId && Array.isArray(myChildrenRoutineItemsByClassIdAndDayKey?.[classId]?.[day.key])
              ? myChildrenRoutineItemsByClassIdAndDayKey[classId][day.key]
              : [];
            const mergedItems = [...scheduleItems, ...routineItems].sort(compareMyChildrenItems);
            if (mergedItems.length === 0) {
              return;
            }
            if (!acc[normalizedClientId] || typeof acc[normalizedClientId] !== "object") {
              acc[normalizedClientId] = {};
            }
            acc[normalizedClientId][dateKey] = mergedItems;
          });
          return acc;
        }, {});
        const renderMyChildrenCard = (item) => {
          const rowId = String(item?.id || "").trim();
          const isRoutineItem = String(item?.itemType || "").trim().toLowerCase() === "daily-routine";
          const startTime = String(item?.startTime || "").trim();
          const endTime = String(item?.endTime || "").trim();
          const timeRange = startTime && endTime
            ? `${startTime} - ${endTime}`
            : (startTime || endTime || "-");
          const teacherName = isRoutineItem
            ? (String(item?.routineLabel || "").trim() || "Daily routine")
            : (String(item?.specialistName || "").trim() || "-");
          const specialistPosition = String(item?.specialistPosition || "").trim();
          const serviceName = String(item?.serviceName || "").trim();
          const note = String(item?.note || "").trim();
          const secondaryLabel = isRoutineItem
            ? (note || "Daily routine")
            : (specialistPosition || serviceName || "-");
          const status = isRoutineItem
            ? "routine"
            : String(item?.status || "").trim().toLowerCase();
          const statusLabel = isRoutineItem ? "Routine" : formatAppointmentStatusLabel(status);
          const extraNote = isRoutineItem ? "" : note;
          const isPending = !isRoutineItem && status === "pending";
          const itemIdKey = String(item?.id || item?.appointmentId || "").trim();
          const isConfirming = Boolean(itemIdKey && myChildrenConfirmingByAppointmentId?.[itemIdKey]);
          const canConfirmPending = isPending && typeof confirmMyChildrenPendingAppointment === "function";
          const cardStatusClassName = (
            status === "confirmed"
            || status === "pending"
            || status === "cancelled"
            || status === "no-show"
          )
            ? `appointment-status-${status}`
            : "";
          const statusClassName = [
            "appointment-vip-my-children-status",
            cardStatusClassName ? `appointment-vip-weekly-status-${status}` : ""
          ].filter(Boolean).join(" ");

          return (
            <article
              key={`myChildrenScheduleRow_${rowId}`}
              className={[
                "appointment-vip-weekly-card",
                "appointment-vip-my-children-card",
                cardStatusClassName,
                canConfirmPending ? "appointment-vip-pending-confirmable" : "",
                isConfirming ? "is-loading" : ""
              ].filter(Boolean).join(" ")}
              onDoubleClick={canConfirmPending && !isConfirming ? () => confirmMyChildrenPendingAppointment(item) : undefined}
              title={canConfirmPending ? "Double-click to confirm attendance" : undefined}
            >
              <div className="appointment-vip-my-children-row appointment-vip-my-children-row-top">
                <p className="appointment-vip-my-children-teacher">{teacherName}</p>
                <p className={statusClassName}>{isConfirming ? "Saving..." : statusLabel}</p>
              </div>
              <div className="appointment-vip-my-children-row appointment-vip-my-children-row-bottom">
                <p className="appointment-vip-my-children-time">{timeRange}</p>
                <p className="appointment-vip-my-children-service">{secondaryLabel}</p>
              </div>
              {extraNote ? <p className="appointment-vip-my-children-note">{extraNote}</p> : null}
            </article>
          );
        };
        const selectedDateKey = String(visibleMyChildrenWeekDays[0]?.dateYmd || myChildrenDateYmd || "").trim();
        const myChildrenCardItems = Array.isArray(myChildrenMergedItemsByClientIdAndDate?.[normalizedSelectedClientId]?.[selectedDateKey])
          ? myChildrenMergedItemsByClientIdAndDate[normalizedSelectedClientId][selectedDateKey].map((item) => renderMyChildrenCard(item))
          : [];

        return (
          <section id="appointmentVipMyChildrenPanel" className="all-users-panel">
            <div className="all-users-head">
              <h3>My Children</h3>
              <button
                id="closeAppointmentVipMyChildrenBtn"
                type="button"
                className="header-btn panel-close-btn"
                aria-label="Close My Children panel"
                onClick={closeAppointmentVipAttendancePanel}
              >
                ×
              </button>
            </div>

            <div className="appointment-toolbar">
              <div className="appointment-toolbar-block">
                <div className="appointment-specialist-control">
                  <span className="appointment-toolbar-label">Child</span>
                  <div className="appointment-specialist-select-wrap">
                    <CustomSelect
                      id="myChildrenClientSelect"
                      placeholder="All"
                      value={normalizedSelectedClientId}
                      options={childOptions}
                      searchable
                      searchThreshold={8}
                      onChange={(nextValue) => {
                        setMyChildrenSelectedClientId(String(nextValue || "").trim());
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="appointment-toolbar-block appointment-week-switcher">
                <button
                  id="myChildrenPrevDayBtn"
                  type="button"
                  className="header-btn"
                  onClick={goToPreviousMyChildrenDay}
                >
                  Prev
                </button>
                <p className="appointment-week-range">{selectedDateLabel}</p>
                <button
                  id="myChildrenNextDayBtn"
                  type="button"
                  className="header-btn"
                  onClick={goToNextMyChildrenDay}
                >
                  Next
                </button>
              </div>
            </div>

            <p className="all-users-state" hidden={showMyChildrenBoard || !emptyMyChildrenMessage}>
              {emptyMyChildrenMessage}
            </p>
            {!myChildrenIsCompact ? (
              <div
                className="appointment-vip-weekly-grid-wrap appointment-vip-my-children-grid-wrap"
                hidden={!showMyChildrenBoard}
              >
                <table className="appointment-vip-weekly-grid appointment-vip-my-children-grid" aria-label="My children weekly schedule table">
                  <thead>
                    <tr>
                      {visibleMyChildrenWeekDays.map((day) => (
                        <th key={day.key} className={day.isToday ? "appointment-day-is-today" : undefined}>
                          <div className="appointment-day-head">
                            <span>{day.label}</span>
                            <small>{formatMyChildrenHeaderDate(day.date)}</small>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {myChildrenClientIdsForDesktop.map((clientId) => {
                      const isSkeletonClientRow = clientId === "__loading__";
                      const clientLabel = isSkeletonClientRow
                        ? "Loading..."
                        : (String(childMetaById?.[clientId]?.label || "").trim() || selectedChildLabel || `Child #${clientId}`);
                      return (
                        <tr key={`myChildrenRow_${clientId || "all"}`}>
                          <td className="appointment-vip-client-wrap-cell" colSpan={Math.max(1, visibleMyChildrenWeekDays.length)}>
                            <div className="appointment-vip-client-wrap">
                              <p className="appointment-vip-client-name">{clientLabel}</p>
                              <div
                                className="appointment-vip-client-days-grid"
                                style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleMyChildrenWeekDays.length)}, minmax(0, 1fr))` }}
                              >
                                {visibleMyChildrenWeekDays.map((day) => {
                                  const dayItems = Array.isArray(myChildrenMergedItemsByClientIdAndDate?.[clientId]?.[day.dateYmd])
                                    ? myChildrenMergedItemsByClientIdAndDate[clientId][day.dateYmd]
                                    : [];
                                  const dayCellClassName = [
                                    "appointment-vip-client-day",
                                    day.isToday ? "appointment-day-is-today" : ""
                                  ].filter(Boolean).join(" ") || undefined;
                                  return (
                                    <div key={`${clientId}_${day.key}`} className={dayCellClassName}>
                                      {showMyChildrenSkeleton ? (
                                        <div className="appointment-vip-weekly-list">
                                          {[0, 1].map((i) => (
                                            <div key={`${clientId}_${day.key}_myChildrenScheduleSkeleton_${i}`} className="appointment-vip-my-children-loading-card skel" aria-hidden="true" />
                                          ))}
                                        </div>
                                      ) : dayItems.length > 0 ? (
                                        <div className="appointment-vip-weekly-list">
                                          {dayItems.map((item) => renderMyChildrenCard(item))}
                                        </div>
                                      ) : (
                                        <p className="appointment-vip-weekly-empty">-</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className="appointment-vip-my-children-board is-compact"
                hidden={!showMyChildrenBoard}
              >
                <div className="appointment-vip-my-children-board-head">
                  <div className="appointment-vip-my-children-summary">
                    <p className="appointment-vip-client-name appointment-vip-my-children-name">{selectedChildLabel}</p>
                    {selectedChildMeta ? (
                      <p className="appointment-vip-my-children-meta">{selectedChildMeta}</p>
                    ) : null}
                  </div>
                  <div className={`appointment-vip-my-children-date${isSelectedDayToday ? " appointment-day-is-today" : ""}`}>
                    <div className="appointment-day-head">
                      <span>{selectedDayLabel}</span>
                      <small>{selectedDateLabel}</small>
                    </div>
                  </div>
                </div>
                <div className="appointment-vip-my-children-list" aria-label="My children daily schedule">
                  {showMyChildrenSkeleton ? (
                    [0, 1, 2].map((i) => (
                      <div key={`myChildrenScheduleSkeleton_${i}`} className="appointment-vip-my-children-loading-card skel" aria-hidden="true" />
                    ))
                  ) : showAllChildren ? (
                    myChildrenClientIdsToRender.map((clientId) => {
                      const clientLabel = String(childMetaById?.[clientId]?.label || "").trim() || `Child #${clientId}`;
                      const clientItems = Array.isArray(myChildrenMergedItemsByClientIdAndDate?.[clientId]?.[selectedDateKey])
                        ? myChildrenMergedItemsByClientIdAndDate[clientId][selectedDateKey]
                        : [];
                      return (
                        <div key={`myChildrenMobileGroup_${clientId}`} className="appointment-vip-my-children-mobile-group">
                          <p className="appointment-vip-client-name appointment-vip-my-children-mobile-title">{clientLabel}</p>
                          {clientItems.length > 0 ? (
                            <div className="appointment-vip-my-children-mobile-list">
                              {clientItems.map((item) => renderMyChildrenCard(item))}
                            </div>
                          ) : (
                            <p className="appointment-vip-weekly-empty appointment-vip-my-children-empty">-</p>
                          )}
                        </div>
                      );
                    })
                  ) : myChildrenCardItems.length > 0 ? (
                    myChildrenCardItems
                  ) : (
                    <p className="appointment-vip-weekly-empty appointment-vip-my-children-empty">{emptyMyChildrenMessage}</p>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {mainView === "appointment-vip-daily-routines" && (
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
      )}

      {mainView === "appointment-vip-assignments" && (
        <section id="appointmentBreaksPanel">
          <div className="all-users-head">
            <h3>Class</h3>
            <div className="all-users-head-actions">
              <button
                id="openVipClassAddModalBtn"
                type="button"
                className="header-btn appointment-breaks-add-icon-btn"
                aria-label="Add class"
                title="Add class"
                disabled={!canCreateAppointmentVipAssignments}
                onClick={openVipClassAddModal}
              >
                +
              </button>
              <button
                id="closeAppointmentVipAssignmentsBtn"
                type="button"
                className="header-btn panel-close-btn"
                aria-label="Close VIP assignments panel"
                onClick={closeAppointmentVipAssignmentsPanel}
              >
                ×
              </button>
            </div>
          </div>

          {vipClassMessage && (
            <p style={{ marginTop: "12px", color: "var(--danger)" }}>{vipClassMessage}</p>
          )}

          <div className="appointment-breaks-view" aria-label="Class assignments list">
            <div className="appointment-breaks-table-wrap all-users-table-wrap">
              <table className="appointment-breaks-table class-assignments-table all-users-table" aria-label="Class table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Class</th>
                    <th>Teacher</th>
                    <th>Children</th>
                    <th>Edit</th>
                    <th>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {vipClassLoading ? (
                    [0, 1, 2, 3].map((i) => (
                      <tr key={i} aria-hidden="true">
                        <td colSpan="6" className="skel" />
                      </tr>
                    ))
                  ) : vipClassRows.map((row, index) => {
                      const classId = String(row?.id || "").trim();
                      const isClassSaving = Boolean(vipClassSavingById?.[classId]);
                      return (
                      <tr key={`vipClassRow_${String(classId || index)}`}>
                        <td>{String(row?.id || index + 1)}</td>
                        <td>{String(row?.className || "-")}</td>
                        <td>{String(row?.teacherName || "-")}</td>
                        <td>{row.childrenCount}</td>
                        <td>
                          <button
                            type="button"
                            className="table-action-btn"
                            disabled={isClassSaving || vipClassModalSaving || !canUpdateAppointmentVipAssignments}
                            onClick={() => openVipClassEditModal(row)}
                          >
                            Edit
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="table-action-btn table-action-btn-danger"
                            disabled={isClassSaving || vipClassModalSaving || vipClassDeleteSaving || !canDeleteAppointmentVipAssignments}
                            onClick={() => {
                              openVipClassDeleteModal(row);
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
            </div>
          </div>
        </section>
      )}

      {mainView === "appointment-vip-tutor-assignments" && (
        <section id="appointmentVipTutorAssignmentsPanel">
          <div className="all-users-head">
            <h3>Tutor</h3>
            <button
              id="closeAppointmentVipTutorAssignmentsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close VIP tutor assignments panel"
              onClick={closeAppointmentVipTutorAssignmentsPanel}
            >
              ×
            </button>
          </div>

          {vipAssignmentMessage && (
            <p style={{ marginTop: "12px", color: "var(--danger)" }}>{vipAssignmentMessage}</p>
          )}

          <div className="appointment-breaks-view" aria-label="VIP tutor assignments list">
            <div className="appointment-breaks-table-wrap all-users-table-wrap">
              <table className="appointment-breaks-table tutor-assignments-table all-users-table" aria-label="Tutor assignments table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Child</th>
                    <th>Class</th>
                    <th>Tutor</th>
                    <th>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {vipAssignmentLoading ? (
                    [0, 1, 2, 3].map((i) => (
                      <tr key={i} aria-hidden="true">
                        <td colSpan="5" className="skel" />
                      </tr>
                    ))
                  ) : vipAssignmentItems.map((row, index) => {
                      const rowId = String(row?.id || "").trim();
                      const fullName = [row?.lastName, row?.firstName, row?.middleName]
                        .map((part) => String(part || "").trim())
                        .filter(Boolean)
                        .join(" ");
                      const isSaving = Boolean(vipAssignmentSavingByClientId?.[rowId]);
                      return (
                        <tr key={`vipTutorAssignRow_${String(rowId || index)}`}>
                          <td>{String(row?.id || index + 1)}</td>
                          <td>{fullName || "-"}</td>
                          <td>{String(row?.className || "-")}</td>
                          <td>{String(row?.tutorName || "-")}</td>
                          <td>
                            <button
                              type="button"
                              className="table-action-btn"
                              disabled={isSaving || (!canCreateAppointmentVipAssignments && !canUpdateAppointmentVipAssignments)}
                              onClick={() => openVipTutorEditModal(row)}
                            >
                              {isSaving ? "Saving..." : "Edit"}
                            </button>
                          </td>
                        </tr>
                      );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {mainView === "settings-organizations" && (
        <section id="organizationsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Organization Settings</h3>
            <div className="all-users-head-actions">
              <button
                id="openOrganizationCreateModalBtn"
                type="button"
                className="header-btn appointment-breaks-add-icon-btn"
                aria-label="Add organization"
                title="Add organization"
                onClick={openOrganizationCreateModal}
              >
                +
              </button>
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
          </div>

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
            <h3>Role Settings</h3>
            <div className="all-users-head-actions">
              <button
                id="openRoleCreateModalBtn"
                type="button"
                className="header-btn appointment-breaks-add-icon-btn"
                aria-label="Add role"
                title="Add role"
                onClick={openRoleCreateModal}
              >
                +
              </button>
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
          </div>

          <p id="rolesState" className="all-users-state" hidden={!rolesSettingsMessage}>
            {rolesSettingsMessage}
          </p>

          <div className="all-users-table-wrap settings-table-wrap" hidden={rolesSettings.length === 0}>
            <table className="all-users-table settings-table" aria-label="Roles table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Label</th>
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
                      <td>{item.label || "-"}{item.isAdmin ? " (Admin)" : ""}</td>
                      <td>{item.isActive ? "Yes" : "No"}</td>
                      <td>{formatDateYMD(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-role-permissions"
                          hidden={item.isAdmin && !hasAdminSettingsAccess}
                          onClick={() => startRoleEdit(item)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-action-btn table-action-btn-danger"
                          hidden={item.isAdmin && !hasAdminSettingsAccess}
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
            <h3>Position Settings</h3>
            <div className="all-users-head-actions">
              <button
                id="openPositionCreateModalBtn"
                type="button"
                className="header-btn appointment-breaks-add-icon-btn"
                aria-label="Add position"
                title="Add position"
                onClick={openPositionCreateModal}
              >
                +
              </button>
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
          </div>

          <p id="positionsState" className="all-users-state" hidden={!positionsSettingsMessage}>
            {positionsSettingsMessage}
          </p>

          <div className="all-users-table-wrap settings-table-wrap" hidden={positionsSettings.length === 0}>
            <table className="all-users-table settings-table" aria-label="Positions table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Label</th>
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

      {mainView === "statistics-class" && (
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
      )}

      {mainView === "statistics-planner-report" && (
        <StatisticsPlannerReportPanel
          closeStatisticsPanel={closeStatisticsPanel}
          showBootstrapSkeleton={showStatisticsPlannerReportBootstrapSkeleton}
        />
      )}

      {mainView === "settings-notifications" && (
        <section id="notificationsSettingsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Notification Settings</h3>
            <button
              id="closeNotificationsSettingsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close notifications settings panel"
              onClick={closeNotificationsSettingsPanel}
            >
              ×
            </button>
          </div>

          <form
            className="auth-form settings-create-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void sendManualNotification();
            }}
            hidden={!canSendNotifications}
          >
            <div className="settings-form-grid settings-form-grid-notify">
              <div className="field">
                <label htmlFor="notificationTargetRole">Recipients</label>
                <CustomSelect
                  id="notificationTargetRole"
                  value={String(notificationSendForm?.targetRole || "all")}
                  options={[
                    { value: "all", label: "All Users" },
                    ...(rolesSettings || [])
                      .filter((r) => r.isActive)
                      .map((r) => ({
                        value: String(r.label || "").trim().toLowerCase(),
                        label: String(r.label || "").trim()
                      }))
                  ]}
                  onChange={(nextValue) => {
                    setNotificationSendForm((prev) => ({ ...prev, targetRole: nextValue }));
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="notificationMessageInput">Message</label>
                <textarea
                  id="notificationMessageInput"
                  name="message"
                  maxLength={255}
                  placeholder="Write notification message"
                  className="notify-textarea"
                  rows={1}
                  value={String(notificationSendForm?.message || "")}
                  onInput={(event) => {
                    const el = event.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                    const nextValue = el.value;
                    setNotificationSendForm((prev) => ({ ...prev, message: nextValue }));
                  }}
                />
              </div>
              <div className="field settings-inline-control settings-action-field">
                <label aria-hidden="true">&nbsp;</label>
                <button className="btn settings-add-btn" type="submit" disabled={notificationSendSubmitting}>
                  {notificationSendSubmitting ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {mainView === "settings-admin-options" && (
        <section id="adminOptionsPanel" className="all-users-panel settings-panel">
          <div className="all-users-head">
            <h3>Admin Options</h3>
            <button
              id="closeAdminOptionsBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close admin options panel"
              onClick={closeAdminOptionsPanel}
            >
              ×
            </button>
          </div>

          <form className="auth-form settings-create-form" noValidate onSubmit={handleAdminOptionsSubmit}>
            <div className="settings-form-grid settings-form-grid-org">
              <div className="field">
                <label htmlFor="adminOptionsOrganizationSelect">Organization</label>
                <CustomSelect
                  id="adminOptionsOrganizationSelect"
                  value={String(adminOptionsForm?.organizationId || "")}
                  placeholder={adminOptionsOrganizationOptions.length === 0 ? "No organizations" : "Select organization"}
                  options={adminOptionsOrganizationOptions}
                  onChange={(nextValue) => {
                    const nextOrganizationId = String(nextValue || "").trim();
                    setAdminOptionsForm((prev) => ({
                      ...prev,
                      organizationId: nextOrganizationId
                    }));
                    setAdminOptionsError("");
                    if (nextOrganizationId) {
                      void loadAdminOptions(nextOrganizationId);
                    }
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="adminOptionsOutboxRetentionDaysInput">Outbox Retention (days)</label>
                <input
                  id="adminOptionsOutboxRetentionDaysInput"
                  name="outboxWorkerRetentionDays"
                  type="number"
                  min={0}
                  max={3650}
                  step={1}
                  value={String(adminOptionsForm?.outboxWorkerRetentionDays ?? "")}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setAdminOptionsForm((prev) => ({
                      ...prev,
                      outboxWorkerRetentionDays: nextValue
                    }));
                    if (adminOptionsError) {
                      setAdminOptionsError("");
                    }
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="adminOptionsUserNotificationsRetentionDaysInput">User Notifications Retention (days)</label>
                <input
                  id="adminOptionsUserNotificationsRetentionDaysInput"
                  name="userNotificationsRetentionDays"
                  type="number"
                  min={0}
                  max={3650}
                  step={1}
                  value={String(adminOptionsForm?.userNotificationsRetentionDays ?? "")}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setAdminOptionsForm((prev) => ({
                      ...prev,
                      userNotificationsRetentionDays: nextValue
                    }));
                    if (adminOptionsError) {
                      setAdminOptionsError("");
                    }
                  }}
                />
              </div>
              <div className="field settings-inline-control settings-action-field">
                <label aria-hidden="true">&nbsp;</label>
                <button className="btn settings-add-btn" type="submit" disabled={adminOptionsSubmitting}>
                  {adminOptionsSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {mainView === "settings-monitoring" && (
        <MonitoringPanel onClose={closeMonitoringPanel} />
      )}


      </main>
      {typeof document !== "undefined" ? createPortal(vipAttendanceAbsentModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(vipAttendanceEditModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(vipDailyRoutineEditModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(vipDailyRoutineDeleteModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(vipClassAddModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(vipClassDeleteModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(vipTutorEditModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(userCreateModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(clientCreateModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(organizationCreateModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(roleCreateModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(positionCreateModalLayer, document.body) : null}
    </>
  );
}

export default ProfileMainContent;
