import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CustomSelect from "../components/CustomSelect.jsx";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../lib/api.js";
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
import { useProfileNotifications } from "./profile/useProfileNotifications.js";
import { useProfilePanels } from "./profile/useProfilePanels.js";
import { useSettingsSection } from "./profile/useSettingsSection.js";
import { useVipDailyRoutinesSection } from "./profile/useVipDailyRoutinesSection.js";
import { getBirthdayValidationMessage } from "./profile/profile.validators.js";
import {
  formatMyChildrenOptionLabel,
  getMyChildrenWeekStartYmd,
  mapMyChildrenScheduleItem,
  MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS,
  mapVipAssignmentItem,
  mapVipAttendanceClient,
  mapVipClassItem,
  normalizeMyChildrenVisibleWeekDays,
  normalizeVipAssignmentDraftEntry,
  normalizeVipAttendanceDateTime,
  normalizeVipAttendanceDraftEntry,
  normalizeVipAttendanceStatus,
  resolveVipAttendanceDate,
  shiftDateYmd
} from "./profile/profile.vip-utils.js";

function getInitialMyChildrenIsCompact() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 860px)").matches;
}

const AVATAR_STORAGE_PREFIX = "crm_avatar_";

function isStorageQuotaExceeded(error) {
  if (!error) {
    return false;
  }
  const code = Number(error.code);
  return error.name === "QuotaExceededError"
    || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || code === 22
    || code === 1014;
}

function removeStoredAvatarsExcept(currentKey = "") {
  const keysToRemove = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(AVATAR_STORAGE_PREFIX)) {
      continue;
    }
    if (key === currentKey) {
      continue;
    }
    keysToRemove.push(key);
  }

  keysToRemove.forEach((key) => {
    localStorage.removeItem(key);
  });
}

function persistAvatarDataUrl(storageKey, dataUrl) {
  try {
    localStorage.setItem(storageKey, dataUrl);
    return true;
  } catch (error) {
    if (!isStorageQuotaExceeded(error)) {
      return false;
    }
  }

  try {
    removeStoredAvatarsExcept(storageKey);
    localStorage.setItem(storageKey, dataUrl);
    return true;
  } catch {
    return false;
  }
}

function ProfilePage({ forcedView = "none" }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const menuToggleRef = useRef(null);
  const avatarInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [organizationContextSwitching, setOrganizationContextSwitching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clientsMenuOpen, setClientsMenuOpen] = useState(false);
  const [vipClientsMenuOpen, setVipClientsMenuOpen] = useState(false);
  const [assignmentsMenuOpen, setAssignmentsMenuOpen] = useState(false);
  const [appointmentMenuOpen, setAppointmentMenuOpen] = useState(false);
  const [usersMenuOpen, setUsersMenuOpen] = useState(false);
  const [statisticsMenuOpen, setStatisticsMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [adminSettingsMenuOpen, setAdminSettingsMenuOpen] = useState(false);
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
    canSendNotifications,
    canOpenAppointmentSchedule,
    canOpenAppointmentVipMyClass,
    canOpenAppointmentBreaks,
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
    hasAppointmentsMenuAccess,
    hasUsersMenuAccess,
    hasSettingsMenuAccess,
    hasAdminSettingsAccess,
    hasNotificationsSettingsAccess,
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
    hasAdminSettingsAccess,
    navigate,
    loadUserOptions,
    orgFeatures: profile?.orgFeatures ?? null
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
  const todayYmd = formatDateForInput(new Date());
  const [vipAttendancePeriod, setVipAttendancePeriod] = useState(() => ({
    from: todayYmd,
    to: todayYmd
  }));
  const [vipAttendanceItems, setVipAttendanceItems] = useState([]);
  const [vipAttendanceTeacherOptions, setVipAttendanceTeacherOptions] = useState([]);
  const [vipAttendanceDraftByClientId, setVipAttendanceDraftByClientId] = useState({});
  const [vipAttendanceMessage, setVipAttendanceMessage] = useState("");
  const [vipAttendanceLoading, setVipAttendanceLoading] = useState(false);
  const [vipAttendanceSavingByClientId, setVipAttendanceSavingByClientId] = useState({});
  const [myChildrenIsCompact, setMyChildrenIsCompact] = useState(getInitialMyChildrenIsCompact);
  const [myChildrenDateYmd, setMyChildrenDateYmd] = useState(() => (
    getInitialMyChildrenIsCompact()
      ? todayYmd
      : getMyChildrenWeekStartYmd(todayYmd, todayYmd)
  ));
  const [myChildrenVisibleWeekDays, setMyChildrenVisibleWeekDays] = useState(() => [...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]);
  const [myChildrenOptions, setMyChildrenOptions] = useState([]);
  const [myChildrenOptionsLoading, setMyChildrenOptionsLoading] = useState(false);
  const [myChildrenOptionsReady, setMyChildrenOptionsReady] = useState(false);
  const [myChildrenSelectedClientId, setMyChildrenSelectedClientId] = useState("");
  const [myChildrenScheduleItems, setMyChildrenScheduleItems] = useState([]);
  const [myChildrenScheduleLoading, setMyChildrenScheduleLoading] = useState(false);
  const [myChildrenScheduleMessage, setMyChildrenScheduleMessage] = useState("");
  const [myChildrenConfirmingByAppointmentId, setMyChildrenConfirmingByAppointmentId] = useState({});
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
  const [vipClassItems, setVipClassItems] = useState([]);
  const [vipClassTeachers, setVipClassTeachers] = useState([]);
  const [vipClassMessage, setVipClassMessage] = useState("");
  const [vipClassLoading, setVipClassLoading] = useState(false);
  const [vipClassSavingById, setVipClassSavingById] = useState({});
  const [vipAssignmentItems, setVipAssignmentItems] = useState([]);
  const [vipAssignmentDraftByClientId, setVipAssignmentDraftByClientId] = useState({});
  const [vipAssignmentClasses, setVipAssignmentClasses] = useState([]);
  const [vipAssignmentTutors, setVipAssignmentTutors] = useState([]);
  const [vipAssignmentMessage, setVipAssignmentMessage] = useState("");
  const [vipAssignmentLoading, setVipAssignmentLoading] = useState(false);
  const [vipAssignmentSavingByClientId, setVipAssignmentSavingByClientId] = useState({});
  const [statisticsVipAttendanceHistoryItems, setStatisticsVipAttendanceHistoryItems] = useState([]);
  const [statisticsVipAttendanceHistoryFilters, setStatisticsVipAttendanceHistoryFilters] = useState({
    classes: [],
    teachers: [],
    tutors: [],
    clients: []
  });
  const [statisticsVipAttendanceHistoryMessage, setStatisticsVipAttendanceHistoryMessage] = useState("");
  const [statisticsVipAttendanceHistoryLoading, setStatisticsVipAttendanceHistoryLoading] = useState(false);
  const setVipAttendancePeriodField = useCallback((field, nextDate) => {
    const normalizedField = String(field || "").trim().toLowerCase();
    if (normalizedField !== "from" && normalizedField !== "to") {
      return;
    }
    const normalizedDate = String(nextDate || "").trim() || todayYmd;
    setVipAttendancePeriod((prev) => {
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
    setVipAttendanceDraftByClientId({});
  }, [todayYmd]);

  const loadStatisticsVipAttendanceHistory = useCallback(async ({
    from = "",
    to = "",
    classId = "",
    teacherId = "",
    tutorId = "",
    clientId = ""
  } = {}) => {
    if (!profile?.username) {
      return;
    }
    if (!canOpenAppointmentStatistics) {
      setStatisticsVipAttendanceHistoryItems([]);
      setStatisticsVipAttendanceHistoryFilters({
        classes: [],
        teachers: [],
        tutors: [],
        clients: []
      });
      setStatisticsVipAttendanceHistoryMessage("You do not have permission to view VIP attendance history.");
      return;
    }

    const normalizedFrom = String(from || "").trim() || todayYmd;
    const normalizedTo = String(to || "").trim() || normalizedFrom;
    const normalizedClassId = String(classId || "").trim();
    const normalizedTeacherId = String(teacherId || "").trim();
    const normalizedTutorId = String(tutorId || "").trim();
    const normalizedClientId = String(clientId || "").trim();

    const query = new URLSearchParams({
      from: normalizedFrom,
      to: normalizedTo,
      limit: "1000"
    });
    if (normalizedClassId && normalizedClassId !== "all") {
      query.set("classId", normalizedClassId);
    }
    if (normalizedTeacherId && normalizedTeacherId !== "all") {
      query.set("teacherId", normalizedTeacherId);
    }
    if (normalizedTutorId && normalizedTutorId !== "all") {
      query.set("tutorId", normalizedTutorId);
    }
    if (normalizedClientId && normalizedClientId !== "all") {
      query.set("clientId", normalizedClientId);
    }

    setStatisticsVipAttendanceHistoryLoading(true);
    setStatisticsVipAttendanceHistoryMessage("");
    try {
      const response = await apiFetch(`/api/clients/vip-attendance/history?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setStatisticsVipAttendanceHistoryItems([]);
        setStatisticsVipAttendanceHistoryFilters({
          classes: [],
          teachers: [],
          tutors: [],
          clients: []
        });
        setStatisticsVipAttendanceHistoryMessage(data?.message || "Failed to load attendance history.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : []).map((item) => ({
        id: String(item?.id || "").trim(),
        clientId: String(item?.clientId || item?.client_id || "").trim(),
        firstName: String(item?.firstName || item?.first_name || "").trim(),
        lastName: String(item?.lastName || item?.last_name || "").trim(),
        middleName: String(item?.middleName || item?.middle_name || "").trim(),
        classId: String(item?.classId || item?.class_id || "").trim(),
        className: String(item?.className || item?.class_name || "").trim(),
        teacherId: String(item?.teacherId || item?.teacher_id || "").trim(),
        teacherName: String(item?.teacherName || item?.teacher_name || "").trim(),
        tutorId: String(item?.tutorId || item?.tutor_id || "").trim(),
        tutorName: String(item?.tutorName || item?.tutor_name || "").trim(),
        attendanceDate: String(item?.attendanceDate || item?.attendance_date || "").trim(),
        attendanceStatus: String(item?.attendanceStatus || item?.attendance_status || "").trim().toLowerCase() === "present"
          ? "present"
          : "absent",
        arrivedAt: String(item?.arrivedAt || item?.arrived_at || "").trim(),
        leftAt: String(item?.leftAt || item?.left_at || "").trim(),
        note: String(item?.note || item?.attendanceNote || item?.attendance_note || "").trim()
      }));

      const nextClasses = (Array.isArray(data?.classes) ? data.classes : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          className: String(item?.className || item?.class_name || "").trim(),
          teacherId: String(item?.teacherId || item?.teacher_id || "").trim(),
          teacherName: String(item?.teacherName || item?.teacher_name || "").trim()
        }))
        .filter((item) => Boolean(item.id) && Boolean(item.className));

      const nextTeachers = (Array.isArray(data?.teachers) ? data.teachers : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      const nextTutors = (Array.isArray(data?.tutors) ? data.tutors : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      const nextClients = (Array.isArray(data?.clients) ? data.clients : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          firstName: String(item?.firstName || item?.first_name || "").trim(),
          lastName: String(item?.lastName || item?.last_name || "").trim(),
          middleName: String(item?.middleName || item?.middle_name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      setStatisticsVipAttendanceHistoryItems(nextItems);
      setStatisticsVipAttendanceHistoryFilters({
        classes: nextClasses,
        teachers: nextTeachers,
        tutors: nextTutors,
        clients: nextClients
      });
      if (nextItems.length === 0) {
        setStatisticsVipAttendanceHistoryMessage("No attendance history found.");
      }
    } catch {
      setStatisticsVipAttendanceHistoryItems([]);
      setStatisticsVipAttendanceHistoryMessage("Failed to load attendance history.");
    } finally {
      setStatisticsVipAttendanceHistoryLoading(false);
    }
  }, [canOpenAppointmentStatistics, navigate, profile?.username, todayYmd]);

  const loadVipAttendanceTeachers = useCallback(async () => {
    if (!canReadAppointmentVipClients) {
      setVipAttendanceTeacherOptions([]);
      return;
    }

    try {
      const response = await apiFetch("/api/clients/vip-attendance/teachers", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setVipAttendanceTeacherOptions([]);
        return;
      }
      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setVipAttendanceTeacherOptions(nextItems);
    } catch {
      setVipAttendanceTeacherOptions([]);
    }
  }, [canReadAppointmentVipClients, navigate]);

  const loadVipAttendance = useCallback(async ({
    mineOnly = false
  } = {}) => {
    if (!canReadAppointmentVipClients) {
      setVipAttendanceItems([]);
      setVipAttendanceTeacherOptions([]);
      setVipAttendanceDraftByClientId({});
      setVipAttendanceMessage("You do not have permission to view VIP attendance.");
      return;
    }

    setVipAttendanceLoading(true);
    setVipAttendanceMessage("");
    try {
      const attendanceDate = resolveVipAttendanceDate(vipAttendancePeriod, todayYmd);
      const query = new URLSearchParams({
        isVip: "true",
        limit: "100",
        attendanceDate
      });
      if (mineOnly) {
        query.set("assignmentScope", "mine");
      }
      const response = await apiFetch(`/api/clients/search?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setVipAttendanceItems([]);
        setVipAttendanceDraftByClientId({});
        setVipAttendanceMessage(data?.message || "Failed to load VIP attendance clients.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => mapVipAttendanceClient(item))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => {
          const nameA = `${a.firstName} ${a.lastName} ${a.middleName}`.trim();
          const nameB = `${b.firstName} ${b.lastName} ${b.middleName}`.trim();
          return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
        });

      setVipAttendanceItems(nextItems);
      setVipAttendanceDraftByClientId((prev) => {
        const next = {};
        nextItems.forEach((item) => {
          const previous = normalizeVipAttendanceDraftEntry(prev[item.id]);
          const fromServer = normalizeVipAttendanceDraftEntry({
            status: item.attendanceStatus,
            arrivedAt: item.arrivedAt,
            leftAt: item.leftAt,
            note: item.note
          });
          const source = item.hasAttendanceData ? fromServer : previous;
          const nextStatus = normalizeVipAttendanceStatus(source.status, "unmarked");
          const normalizedSourceNote = String(source.note || "").trim();
          const normalizedItemNote = String(item.note || "").trim();
          next[item.id] = {
            status: nextStatus,
            arrivedAt: nextStatus === "present" ? String(source.arrivedAt || "").trim() : "",
            leftAt: nextStatus === "present" ? String(source.leftAt || "").trim() : "",
            note: normalizedSourceNote || normalizedItemNote
          };
        });
        return next;
      });
      if (nextItems.length === 0) {
        setVipAttendanceMessage(
          mineOnly
            ? "No assigned children found."
            : "No VIP clients found."
        );
      }
    } catch {
      setVipAttendanceItems([]);
      setVipAttendanceDraftByClientId({});
      setVipAttendanceMessage(
        mineOnly
          ? "Failed to load assigned children."
          : "Failed to load VIP attendance clients."
      );
    } finally {
      setVipAttendanceLoading(false);
    }
  }, [canReadAppointmentVipClients, navigate, vipAttendancePeriod, todayYmd]);

  const loadMyChildrenOptions = useCallback(async () => {
    if (!canOpenMyChildren) {
      setMyChildrenOptionsLoading(false);
      setMyChildrenOptionsReady(true);
      setMyChildrenOptions([]);
      setMyChildrenSelectedClientId("");
      setMyChildrenScheduleItems([]);
      setMyChildrenScheduleMessage("You do not have permission to view assigned children.");
      return;
    }

    setMyChildrenOptionsLoading(true);
    setMyChildrenOptionsReady(false);
    setMyChildrenScheduleMessage("");
    try {
      const query = new URLSearchParams({
        isVip: "true",
        assignmentScope: "mine",
        limit: "500"
      });
      const response = await apiFetch(`/api/clients/search?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setMyChildrenOptions([]);
        setMyChildrenSelectedClientId("");
        setMyChildrenScheduleItems([]);
        setMyChildrenScheduleMessage(data?.message || "Failed to load assigned children.");
        return;
      }

      const nextOptions = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => formatMyChildrenOptionLabel(item))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" }));

      setMyChildrenOptions(nextOptions);
      setMyChildrenSelectedClientId((prev) => {
        const current = String(prev || "").trim();
        if (current && nextOptions.some((item) => item.id === current)) {
          return current;
        }
        return "";
      });

      if (nextOptions.length === 0) {
        setMyChildrenScheduleItems([]);
        setMyChildrenScheduleMessage("");
      }
    } catch {
      setMyChildrenOptions([]);
      setMyChildrenSelectedClientId("");
      setMyChildrenScheduleItems([]);
      setMyChildrenScheduleMessage("Failed to load assigned children.");
    } finally {
      setMyChildrenOptionsLoading(false);
      setMyChildrenOptionsReady(true);
    }
  }, [canOpenMyChildren, navigate]);

  const loadMyChildrenVisibleWeekDays = useCallback(async () => {
    if (!canOpenMyChildren) {
      setMyChildrenVisibleWeekDays([...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]);
      return;
    }

    try {
      const response = await apiFetch("/api/appointments/settings", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMyChildrenVisibleWeekDays([...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]);
        return;
      }

      setMyChildrenVisibleWeekDays(normalizeMyChildrenVisibleWeekDays(data?.item?.visibleWeekDays));
    } catch {
      setMyChildrenVisibleWeekDays([...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]);
    }
  }, [canOpenMyChildren]);

  const loadMyChildrenSchedule = useCallback(async ({
    clientId = "",
    dateYmd = ""
  } = {}) => {
    if (!canOpenMyChildren) {
      setMyChildrenScheduleItems([]);
      setMyChildrenScheduleMessage("You do not have permission to view assigned children schedule.");
      return;
    }

    const normalizedClientId = String(clientId || "").trim();
    const dateFromYmd = String(dateYmd || "").trim() || todayYmd;
    const dateToYmd = myChildrenIsCompact ? dateFromYmd : shiftDateYmd(dateFromYmd, 6, todayYmd);
    const hasChildren = Array.isArray(myChildrenOptions) && myChildrenOptions.length > 0;
    if (!normalizedClientId && !hasChildren) {
      setMyChildrenScheduleItems([]);
      setMyChildrenScheduleMessage("");
      return;
    }

    setMyChildrenScheduleLoading(true);
    setMyChildrenScheduleMessage("");
    try {
      const query = new URLSearchParams({
        dateFrom: dateFromYmd,
        dateTo: dateToYmd,
        vipOnly: "true",
        light: "true"
      });
      if (normalizedClientId) {
        query.set("clientId", normalizedClientId);
      }

      const response = await apiFetch(`/api/appointments/schedules?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setMyChildrenScheduleItems([]);
        setMyChildrenScheduleMessage(data?.message || "Failed to load child schedule.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => mapMyChildrenScheduleItem(item))
        .filter((item) => Boolean(item.id))
        .filter((item) => item.status !== "cancelled")
        .sort((a, b) => {
          const dateCompare = String(a.appointmentDate || "").localeCompare(String(b.appointmentDate || ""));
          if (dateCompare !== 0) {
            return dateCompare;
          }
          const startCompare = String(a.startTime || "").localeCompare(String(b.startTime || ""));
          if (startCompare !== 0) {
            return startCompare;
          }
          return String(a.id || "").localeCompare(String(b.id || ""));
        });

      setMyChildrenScheduleItems(nextItems);
      if (nextItems.length === 0) {
        setMyChildrenScheduleMessage(myChildrenIsCompact ? "No lessons scheduled for selected day." : "No lessons scheduled for selected week.");
      }
    } catch {
      setMyChildrenScheduleItems([]);
      setMyChildrenScheduleMessage("Failed to load child schedule.");
    } finally {
      setMyChildrenScheduleLoading(false);
    }
  }, [canOpenMyChildren, myChildrenIsCompact, myChildrenOptions, navigate, todayYmd]);

  const goToPreviousMyChildrenDay = useCallback(() => {
    setMyChildrenDateYmd((prev) => shiftDateYmd(prev, myChildrenIsCompact ? -1 : -7, todayYmd));
  }, [myChildrenIsCompact, todayYmd]);

  const goToNextMyChildrenDay = useCallback(() => {
    setMyChildrenDateYmd((prev) => shiftDateYmd(prev, myChildrenIsCompact ? 1 : 7, todayYmd));
  }, [myChildrenIsCompact, todayYmd]);

  const confirmMyChildrenPendingAppointment = useCallback(async (item) => {
    const status = String(item?.status || "").trim().toLowerCase();
    if (status !== "pending") {
      return;
    }

    const appointmentId = String(item?.id || item?.appointmentId || "").trim();
    const specialistId = String(item?.specialistId || item?.specialist_id || "").trim();
    const clientId = String(item?.clientId || item?.client_id || "").trim();
    const appointmentDate = String(item?.appointmentDate || item?.appointment_date || "").trim();
    const startTime = String(item?.startTime || item?.start_time || "").trim();
    const endTime = String(item?.endTime || item?.end_time || "").trim();
    const durationMinutes = String(item?.durationMinutes || item?.duration_minutes || "").trim();
    const serviceName = String(item?.serviceName || item?.service_name || "").trim() || "Service";
    const note = String(item?.note || "").trim();

    if (!appointmentId || !specialistId || !clientId || !appointmentDate || !startTime || !endTime || !durationMinutes) {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert("Failed to confirm lesson.");
      }
      return;
    }
    if (myChildrenConfirmingByAppointmentId[appointmentId]) {
      return;
    }

    try {
      setMyChildrenConfirmingByAppointmentId((prev) => ({
        ...prev,
        [appointmentId]: true
      }));

      const response = await apiFetch(
        `/api/appointments/schedules/${encodeURIComponent(appointmentId)}?scope=single`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            specialistId,
            clientId,
            appointmentDate,
            startTime,
            endTime,
            durationMinutes,
            service: serviceName,
            status: "confirmed",
            note
          })
        }
      );
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert(String(data?.message || "Failed to confirm lesson.").trim());
        }
        return;
      }

      await loadMyChildrenSchedule({
        clientId: myChildrenSelectedClientId,
        dateYmd: myChildrenDateYmd
      });
    } catch {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert("Failed to confirm lesson.");
      }
    } finally {
      setMyChildrenConfirmingByAppointmentId((prev) => {
        const next = { ...prev };
        delete next[appointmentId];
        return next;
      });
    }
  }, [
    loadMyChildrenSchedule,
    myChildrenConfirmingByAppointmentId,
    myChildrenDateYmd,
    myChildrenSelectedClientId
  ]);

  const saveVipAttendanceRecord = useCallback(async ({
    clientId,
    status,
    note = "",
    markLeft = false,
    arrivedAt = "",
    leftAt = "",
    reset = false
  }) => {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      return { ok: false, message: "Client is required." };
    }

    const shouldReset = reset === true;
    if (shouldReset && !canDeleteAppointmentVipClients) {
      return { ok: false, message: "You do not have permission to delete VIP attendance." };
    }
    if (!shouldReset && !canCreateAppointmentVipClients && !canUpdateAppointmentVipClients) {
      return { ok: false, message: "You do not have permission to save VIP attendance." };
    }
    const normalizedStatus = ["present", "absent"].includes(String(status || "").trim().toLowerCase())
      ? String(status || "").trim().toLowerCase()
      : (shouldReset ? "unmarked" : "");
    if (!shouldReset && !normalizedStatus) {
      return { ok: false, message: "Invalid attendance status." };
    }

    const normalizedNote = String(note || "").trim();
    const normalizedArrivedAt = String(arrivedAt || "").trim();
    const normalizedLeftAt = String(leftAt || "").trim();
    const attendanceDate = resolveVipAttendanceDate(vipAttendancePeriod, todayYmd);
    setVipAttendanceSavingByClientId((prev) => ({ ...prev, [normalizedClientId]: true }));
    setVipAttendanceMessage("");

    try {
      const response = await apiFetch("/api/clients/vip-attendance", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clientId: normalizedClientId,
          attendanceDate,
          status: shouldReset ? null : normalizedStatus,
          note: normalizedNote,
          markLeft: markLeft === true,
          arrivedAt: shouldReset ? null : (normalizedArrivedAt || null),
          leftAt: shouldReset ? null : (normalizedLeftAt || null),
          reset: shouldReset
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return { ok: false, message: "Unauthorized." };
        }
        const message = getApiErrorMessage(response, data, "Failed to save VIP attendance.");
        setVipAttendanceMessage(message);
        return { ok: false, message };
      }

      const item = data?.item && typeof data.item === "object" ? data.item : {};
      const nextStatus = normalizeVipAttendanceStatus(
        item?.attendanceStatus || normalizedStatus,
        shouldReset ? "unmarked" : normalizedStatus
      );
      const nextArrivedAt = normalizeVipAttendanceDateTime(item?.arrivedAt || item?.arrived_at);
      const nextLeftAt = normalizeVipAttendanceDateTime(item?.leftAt || item?.left_at);
      const nextNote = String(item?.attendanceNote || item?.attendance_note || item?.note || normalizedNote).trim();

      setVipAttendanceDraftByClientId((prev) => ({
        ...prev,
        [normalizedClientId]: {
          status: nextStatus,
          arrivedAt: nextStatus === "present" ? nextArrivedAt : "",
          leftAt: nextStatus === "present" ? nextLeftAt : "",
          note: nextStatus === "unmarked" ? "" : nextNote
        }
      }));

      return {
        ok: true,
        status: nextStatus,
        arrivedAt: nextArrivedAt,
        leftAt: nextLeftAt,
        note: nextStatus === "unmarked" ? "" : nextNote
      };
    } catch {
      const message = "Failed to save VIP attendance.";
      setVipAttendanceMessage(message);
      return { ok: false, message };
    } finally {
      setVipAttendanceSavingByClientId((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, normalizedClientId)) {
          return prev;
        }
        const next = { ...prev };
        delete next[normalizedClientId];
        return next;
      });
    }
  }, [
    canCreateAppointmentVipClients,
    canUpdateAppointmentVipClients,
    canDeleteAppointmentVipClients,
    navigate,
    todayYmd,
    vipAttendancePeriod
  ]);

  const markVipAttendancePresent = useCallback(async (clientId) => {
    const result = await saveVipAttendanceRecord({
      clientId,
      status: "present"
    });
    return result;
  }, [saveVipAttendanceRecord]);

  const saveVipAttendanceAbsentReason = useCallback(async (clientId, reason) => {
    const result = await saveVipAttendanceRecord({
      clientId,
      status: "absent",
      note: reason
    });
    return result;
  }, [saveVipAttendanceRecord]);

  const markVipAttendanceLeft = useCallback(async (clientId) => {
    const result = await saveVipAttendanceRecord({
      clientId,
      status: "present",
      markLeft: true
    });
    return result;
  }, [saveVipAttendanceRecord]);

  const saveVipAttendanceEdit = useCallback(async (clientId, {
    status = "",
    arrivedAt = "",
    leftAt = "",
    note = "",
    reset = false
  } = {}) => {
    const shouldReset = reset === true;
    if (shouldReset) {
      return saveVipAttendanceRecord({
        clientId,
        reset: true
      });
    }

    const normalizedStatus = ["present", "absent"].includes(String(status || "").trim().toLowerCase())
      ? String(status || "").trim().toLowerCase()
      : "";
    const normalizedArrivedAt = String(arrivedAt || "").trim();
    const normalizedLeftAt = String(leftAt || "").trim();
    const normalizedNote = String(note || "").trim();

    if (normalizedStatus === "present" && normalizedLeftAt && !normalizedArrivedAt) {
      return { ok: false, message: "Arrival time is required when departure time is set." };
    }
    if (normalizedStatus === "present" && normalizedArrivedAt && normalizedLeftAt && normalizedLeftAt < normalizedArrivedAt) {
      return { ok: false, message: "Departure time must be later than arrival time." };
    }
    if (normalizedStatus === "absent" && !normalizedNote) {
      return { ok: false, message: "Reason is required for absent." };
    }

    if (normalizedStatus === "present") {
      return saveVipAttendanceRecord({
        clientId,
        status: "present",
        note: "",
        arrivedAt: normalizedArrivedAt,
        leftAt: normalizedLeftAt
      });
    }

    if (normalizedStatus === "absent") {
      return saveVipAttendanceRecord({
        clientId,
        status: "absent",
        note: normalizedNote,
        arrivedAt: "",
        leftAt: ""
      });
    }

    if (!normalizedArrivedAt && !normalizedNote) {
      return saveVipAttendanceRecord({
        clientId,
        reset: true
      });
    }

    const nextStatus = normalizedArrivedAt ? "present" : "absent";

    return saveVipAttendanceRecord({
      clientId,
      status: nextStatus,
      note: normalizedNote,
      arrivedAt: normalizedArrivedAt,
      leftAt: normalizedLeftAt
    });
  }, [saveVipAttendanceRecord]);

  const loadVipClassAssignments = useCallback(async () => {
    if (!canReadAppointmentVipAssignments) {
      setVipClassItems([]);
      setVipClassTeachers([]);
      setVipClassMessage("You do not have permission to manage VIP class assignments.");
      return;
    }

    setVipClassLoading(true);
    setVipClassMessage("");
    try {
      const query = new URLSearchParams({
        limit: "300"
      });
      const response = await apiFetch(`/api/clients/vip-class-assignments?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setVipClassItems([]);
        setVipClassTeachers([]);
        setVipClassMessage(data?.message || "Failed to load class assignments.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => mapVipClassItem(item))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => String(a.className || "").localeCompare(String(b.className || ""), undefined, { sensitivity: "base" }));
      const nextTeachers = (Array.isArray(data?.teachers) ? data.teachers : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      setVipClassItems(nextItems);
      setVipClassTeachers(nextTeachers);
      setVipAssignmentClasses(nextItems.map((item) => ({
        id: String(item.id || "").trim(),
        className: String(item.className || "").trim(),
        teacherId: String(item.teacherId || "").trim(),
        teacherName: String(item.teacherName || "").trim()
      })));
    } catch {
      setVipClassItems([]);
      setVipClassTeachers([]);
      setVipClassMessage("Failed to load class assignments.");
    } finally {
      setVipClassLoading(false);
    }
  }, [canReadAppointmentVipAssignments, navigate]);

  const saveVipClassAssignment = useCallback(async ({
    classId = "",
    className = "",
    teacherId = ""
  } = {}) => {
    const normalizedClassId = String(classId || "").trim();
    const normalizedClassName = String(className || "").trim();
    const normalizedTeacherId = String(teacherId || "").trim();
    const isEditMode = Boolean(normalizedClassId);

    if (isEditMode && !canUpdateAppointmentVipAssignments) {
      const message = "You do not have permission to update class assignments.";
      setVipClassMessage(message);
      return { ok: false, message };
    }
    if (!isEditMode && !canCreateAppointmentVipAssignments) {
      const message = "You do not have permission to create class assignments.";
      setVipClassMessage(message);
      return { ok: false, message };
    }

    if (!normalizedClassName) {
      const message = "Class name is required.";
      setVipClassMessage(message);
      return { ok: false, message };
    }
    if (normalizedClassName.length > 64) {
      const message = "Class name is too long (max 64).";
      setVipClassMessage(message);
      return { ok: false, message };
    }
    if (!normalizedTeacherId) {
      const message = "Teacher is required.";
      setVipClassMessage(message);
      return { ok: false, message };
    }

    const savingKey = normalizedClassId || "__new__";
    setVipClassSavingById((prev) => ({ ...prev, [savingKey]: true }));
    setVipClassMessage("");

    try {
      const response = await apiFetch("/api/clients/vip-class-assignments", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          classId: normalizedClassId || null,
          className: normalizedClassName,
          teacherId: normalizedTeacherId
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return { ok: false, message: "Unauthorized." };
        }
        const message = getApiErrorMessage(response, data, "Failed to save class assignment.");
        setVipClassMessage(message);
        return { ok: false, message };
      }

      const item = mapVipClassItem(data?.item || {});
      setVipClassItems((prev) => {
        const filtered = prev.filter((row) => String(row?.id || "") !== String(item.id || ""));
        filtered.push(item);
        filtered.sort((a, b) => String(a.className || "").localeCompare(String(b.className || ""), undefined, { sensitivity: "base" }));
        return filtered;
      });
      setVipAssignmentClasses((prev) => {
        const filtered = prev.filter((row) => String(row?.id || "") !== String(item.id || ""));
        filtered.push({
          id: String(item.id || ""),
          className: String(item.className || ""),
          teacherId: String(item.teacherId || ""),
          teacherName: String(item.teacherName || "")
        });
        filtered.sort((a, b) => String(a.className || "").localeCompare(String(b.className || ""), undefined, { sensitivity: "base" }));
        return filtered;
      });

      return { ok: true, item };
    } catch {
      const message = "Failed to save class assignment.";
      setVipClassMessage(message);
      return { ok: false, message };
    } finally {
      setVipClassSavingById((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, savingKey)) {
          return prev;
        }
        const next = { ...prev };
        delete next[savingKey];
        return next;
      });
    }
  }, [canCreateAppointmentVipAssignments, canUpdateAppointmentVipAssignments, navigate]);

  const deleteVipClassAssignment = useCallback(async (classId) => {
    const normalizedClassId = String(classId || "").trim();
    if (!normalizedClassId) {
      return { ok: false, message: "Class is required." };
    }
    if (!canDeleteAppointmentVipAssignments) {
      return { ok: false, message: "You do not have permission to delete class assignments." };
    }

    setVipClassSavingById((prev) => ({ ...prev, [normalizedClassId]: true }));
    setVipClassMessage("");
    try {
      const response = await apiFetch(`/api/clients/vip-class-assignments/${encodeURIComponent(normalizedClassId)}`, {
        method: "DELETE"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return { ok: false, message: "Unauthorized." };
        }
        const message = getApiErrorMessage(response, data, "Failed to delete class assignment.");
        setVipClassMessage(message);
        return { ok: false, message };
      }
      setVipClassItems((prev) => prev.filter((row) => String(row?.id || "") !== normalizedClassId));
      setVipAssignmentClasses((prev) => prev.filter((row) => String(row?.id || "") !== normalizedClassId));
      return { ok: true };
    } catch {
      const message = "Failed to delete class assignment.";
      setVipClassMessage(message);
      return { ok: false, message };
    } finally {
      setVipClassSavingById((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, normalizedClassId)) {
          return prev;
        }
        const next = { ...prev };
        delete next[normalizedClassId];
        return next;
      });
    }
  }, [canDeleteAppointmentVipAssignments, navigate]);

  const loadVipAssignments = useCallback(async () => {
    if (!canReadAppointmentVipAssignments) {
      setVipAssignmentItems([]);
      setVipAssignmentDraftByClientId({});
      setVipAssignmentClasses([]);
      setVipAssignmentTutors([]);
      setVipAssignmentMessage("You do not have permission to manage VIP tutor assignments.");
      return;
    }

    setVipAssignmentLoading(true);
    setVipAssignmentMessage("");
    try {
      const query = new URLSearchParams({
        limit: "300"
      });
      const response = await apiFetch(`/api/clients/vip-tutor-assignments?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setVipAssignmentItems([]);
        setVipAssignmentDraftByClientId({});
        setVipAssignmentClasses([]);
        setVipAssignmentTutors([]);
        setVipAssignmentMessage(data?.message || "Failed to load VIP tutor assignments.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => mapVipAssignmentItem(item))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => {
          const nameA = `${a.firstName} ${a.lastName} ${a.middleName}`.trim();
          const nameB = `${b.firstName} ${b.lastName} ${b.middleName}`.trim();
          return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
        });
      const nextClasses = (Array.isArray(data?.classes) ? data.classes : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          className: String(item?.className || item?.class_name || "").trim(),
          teacherId: String(item?.teacherId || item?.teacher_id || "").trim(),
          teacherName: String(item?.teacherName || item?.teacher_name || "").trim()
        }))
        .filter((item) => Boolean(item.id));
      const nextTutors = (Array.isArray(data?.tutors) ? data.tutors : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      setVipAssignmentItems(nextItems);
      setVipAssignmentClasses(nextClasses);
      setVipAssignmentTutors(nextTutors);
      setVipAssignmentDraftByClientId((prev) => {
        const next = {};
        nextItems.forEach((item) => {
          const previous = normalizeVipAssignmentDraftEntry(prev[item.id]);
          const source = item.classId || item.tutorId
            ? {
                classId: item.classId,
                tutorId: item.tutorId
              }
            : previous;
          next[item.id] = normalizeVipAssignmentDraftEntry(source);
        });
        return next;
      });
      if (nextItems.length === 0) {
        setVipAssignmentMessage("No VIP clients found.");
      }
    } catch {
      setVipAssignmentItems([]);
      setVipAssignmentDraftByClientId({});
      setVipAssignmentClasses([]);
      setVipAssignmentTutors([]);
      setVipAssignmentMessage("Failed to load VIP tutor assignments.");
    } finally {
      setVipAssignmentLoading(false);
    }
  }, [canReadAppointmentVipAssignments, navigate]);

  const saveVipAssignment = useCallback(async (clientId, {
    classId = "",
    tutorId = ""
  } = {}) => {
    if (!canCreateAppointmentVipAssignments && !canUpdateAppointmentVipAssignments) {
      const message = "You do not have permission to save VIP tutor assignments.";
      setVipAssignmentMessage(message);
      return { ok: false, message };
    }
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      const message = "Client is required.";
      setVipAssignmentMessage(message);
      return { ok: false, message };
    }
    const normalizedClassId = String(classId || "").trim();
    const normalizedTutorId = String(tutorId || "").trim();
    if (!normalizedClassId) {
      const message = "Class is required.";
      setVipAssignmentMessage(message);
      return { ok: false, message };
    }
    if (!normalizedTutorId) {
      const message = "Tutor is required.";
      setVipAssignmentMessage(message);
      return { ok: false, message };
    }

    setVipAssignmentSavingByClientId((prev) => ({ ...prev, [normalizedClientId]: true }));
    setVipAssignmentMessage("");
    try {
      const response = await apiFetch("/api/clients/vip-tutor-assignments", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clientId: normalizedClientId,
          classId: normalizedClassId,
          tutorId: normalizedTutorId
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return { ok: false, message: "Unauthorized." };
        }
        const message = getApiErrorMessage(response, data, "Failed to save VIP tutor assignment.");
        setVipAssignmentMessage(message);
        return { ok: false, message };
      }

      const item = mapVipAssignmentItem(data?.item || {});
      setVipAssignmentItems((prev) => prev.map((row) => {
        if (String(row?.id || "") !== normalizedClientId) {
          return row;
        }
        return {
          ...row,
          classId: item.classId || normalizedClassId,
          className: item.className || row.className,
          teacherId: item.teacherId || row.teacherId,
          teacherName: item.teacherName || row.teacherName,
          tutorId: item.tutorId || normalizedTutorId,
          tutorName: item.tutorName || row.tutorName,
          updatedBy: item.updatedBy || row.updatedBy,
          updatedAt: item.updatedAt || row.updatedAt
        };
      }));
      setVipAssignmentDraftByClientId((prev) => ({
        ...prev,
        [normalizedClientId]: {
          classId: item.classId || normalizedClassId,
          tutorId: item.tutorId || normalizedTutorId
        }
      }));
      return {
        ok: true
      };
    } catch {
      const message = "Failed to save VIP tutor assignment.";
      setVipAssignmentMessage(message);
      return { ok: false, message };
    } finally {
      setVipAssignmentSavingByClientId((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, normalizedClientId)) {
          return prev;
        }
        const next = { ...prev };
        delete next[normalizedClientId];
        return next;
      });
    }
  }, [canCreateAppointmentVipAssignments, canUpdateAppointmentVipAssignments, navigate]);

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
    setVipClientsMenuOpen(false);
    setAssignmentsMenuOpen(false);
    setAppointmentMenuOpen(false);
    setUsersMenuOpen(false);
    setStatisticsMenuOpen(false);
    setSettingsMenuOpen(false);
    setAdminSettingsMenuOpen(false);
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
      setAvatarDataUrl(dataUrl);
      const isStored = persistAvatarDataUrl(avatarStorageKey, dataUrl);
      if (!isStored) {
        window.alert("Avatar saqlash uchun browser xotirasi yetarli emas.");
      }
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
    if (!avatarStorageKey) {
      setAvatarDataUrl("");
      return;
    }
    try {
      setAvatarDataUrl(localStorage.getItem(avatarStorageKey) || "");
    } catch {
      setAvatarDataUrl("");
    }
  }, [avatarStorageKey]);

  useEffect(() => {
    setMainView(forcedView);
  }, [forcedView, setMainView]);

  useEffect(() => {
    if (!profile?.username) {
      return;
    }
    if (!canAccessForcedView) {
      navigate("/404", { replace: true });
    }
  }, [canAccessForcedView, navigate, profile?.username]);

  useEffect(() => {
    if (!profile?.username) {
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
    if (mainView === "appointment-vip-schedule") {
      loadVipDailyRoutines();
      return;
    }
    if (mainView === "appointment-vip-attendance") {
      loadVipAttendance();
      loadVipAttendanceTeachers();
      return;
    }
    if (mainView === "appointment-vip-my-children") {
      loadMyChildrenOptions();
      loadVipDailyRoutines();
      return;
    }
    if (mainView === "appointment-vip-daily-routines") {
      loadVipDailyRoutines();
      return;
    }
    if (mainView === "appointment-vip-assignments") {
      loadVipClassAssignments();
      return;
    }
    if (mainView === "appointment-vip-tutor-assignments") {
      loadVipAssignments();
      return;
    }
    if (mainView === "create-user") {
      if (canReadUsers) {
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
    if (mainView === "settings-admin-options") {
      if (hasAdminSettingsAccess) {
        loadOrganizations();
      }
      loadAdminOptions();
      return;
    }
    if (mainView === "settings-notifications") {
      loadRolesSettings();
      return;
    }
  }, [
    canReadUsers,
    hasAdminSettingsAccess,
    loadClients,
    loadVipAttendance,
    loadVipAttendanceTeachers,
    loadMyChildrenOptions,
    loadVipDailyRoutines,
    loadVipClassAssignments,
    loadVipAssignments,
    loadAllUsers,
    loadAdminOptions,
    loadOrganizations,
    loadPositionsSettings,
    loadRolesSettings,
    mainView,
    profile?.username
  ]);

  useEffect(() => {
    if (!profile?.username || mainView !== "appointment-vip-my-children") {
      return;
    }
    if (!myChildrenOptionsReady) {
      return;
    }
    loadMyChildrenSchedule({
      clientId: myChildrenSelectedClientId,
      dateYmd: myChildrenDateYmd
    });
  }, [
    loadMyChildrenSchedule,
    mainView,
    myChildrenDateYmd,
    myChildrenOptionsReady,
    myChildrenSelectedClientId,
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
    if (typeof window === "undefined") {
      return;
    }
    const mq = window.matchMedia("(max-width: 860px)");
    const handleViewportChange = (event) => {
      setMyChildrenIsCompact(event.matches);
      if (!event.matches) {
        setMyChildrenDateYmd((prev) => getMyChildrenWeekStartYmd(prev, todayYmd));
      }
    };
    mq.addEventListener("change", handleViewportChange);
    return () => {
      mq.removeEventListener("change", handleViewportChange);
    };
  }, [todayYmd]);

  useEffect(() => {
    void loadMyChildrenVisibleWeekDays();
  }, [loadMyChildrenVisibleWeekDays]);

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
    closeNotificationsPanel,
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
    openAdminOptionsPanel,
    closeAdminOptionsPanel,
    openNotificationsSettingsPanel,
    closeNotificationsSettingsPanel,
    openMonitoringPanel,
    closeMonitoringPanel,
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
    canOpenAppointmentSchedule,
    canOpenAppointmentVipMyClass,
    canOpenAppointmentBreaks,
    canOpenAppointmentVipClients,
    canOpenMyChildren,
    canOpenAppointmentVipDailyRoutines,
    canOpenAppointmentVipAssignments,
    canOpenAppointmentStatistics,
    hasSettingsMenuAccess,
    hasAdminSettingsAccess,
    hasNotificationsSettingsAccess
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
            {hasAdminSettingsAccess ? (
              <div className="header-org-switch">
                <CustomSelect
                  id="headerOrganizationContextSelect"
                  value={String(profile?.organizationCode || "").trim().toLowerCase()}
                  placeholder="Select organization"
                  options={createOrganizationOptions}
                  disabled={organizationContextSwitching || createOrganizationOptions.length === 0}
                  menuPortal
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
          vipAttendancePeriod={vipAttendancePeriod}
          setVipAttendancePeriodField={setVipAttendancePeriodField}
          vipAttendanceItems={vipAttendanceItems}
          vipAttendanceTeacherOptions={vipAttendanceTeacherOptions}
          vipAttendanceDraftByClientId={vipAttendanceDraftByClientId}
          vipAttendanceMessage={vipAttendanceMessage}
          vipAttendanceLoading={vipAttendanceLoading}
          vipAttendanceSavingByClientId={vipAttendanceSavingByClientId}
          markVipAttendancePresent={markVipAttendancePresent}
          markVipAttendanceLeft={markVipAttendanceLeft}
          saveVipAttendanceAbsentReason={saveVipAttendanceAbsentReason}
          saveVipAttendanceEdit={saveVipAttendanceEdit}
          loadVipAttendance={loadVipAttendance}
          myChildrenIsCompact={myChildrenIsCompact}
          myChildrenDateYmd={myChildrenDateYmd}
          myChildrenVisibleWeekDays={myChildrenVisibleWeekDays}
          myChildrenOptions={myChildrenOptions}
          myChildrenOptionsLoading={myChildrenOptionsLoading}
          myChildrenSelectedClientId={myChildrenSelectedClientId}
          setMyChildrenSelectedClientId={setMyChildrenSelectedClientId}
          myChildrenScheduleItems={myChildrenScheduleItems}
          myChildrenScheduleLoading={myChildrenScheduleLoading}
          myChildrenScheduleMessage={myChildrenScheduleMessage}
          myChildrenConfirmingByAppointmentId={myChildrenConfirmingByAppointmentId}
          confirmMyChildrenPendingAppointment={confirmMyChildrenPendingAppointment}
          goToPreviousMyChildrenDay={goToPreviousMyChildrenDay}
          goToNextMyChildrenDay={goToNextMyChildrenDay}
          vipDailyRoutineItems={vipDailyRoutineItems}
          vipDailyRoutineClasses={vipDailyRoutineClasses}
          vipDailyRoutineMessage={vipDailyRoutineMessage}
          vipDailyRoutineLoading={vipDailyRoutineLoading}
          vipDailyRoutineSavingById={vipDailyRoutineSavingById}
          loadVipDailyRoutines={loadVipDailyRoutines}
          saveVipDailyRoutine={saveVipDailyRoutine}
          deleteVipDailyRoutine={deleteVipDailyRoutine}
          vipClassItems={vipClassItems}
          vipClassTeachers={vipClassTeachers}
          vipClassMessage={vipClassMessage}
          vipClassLoading={vipClassLoading}
          vipClassSavingById={vipClassSavingById}
          saveVipClassAssignment={saveVipClassAssignment}
          deleteVipClassAssignment={deleteVipClassAssignment}
          vipAssignmentItems={vipAssignmentItems}
          vipAssignmentClasses={vipAssignmentClasses}
          vipAssignmentTutors={vipAssignmentTutors}
          vipAssignmentMessage={vipAssignmentMessage}
          vipAssignmentLoading={vipAssignmentLoading}
          vipAssignmentSavingByClientId={vipAssignmentSavingByClientId}
          saveVipAssignment={saveVipAssignment}
          canCreateAppointmentVipClients={canCreateAppointmentVipClients}
          canUpdateAppointmentVipClients={canUpdateAppointmentVipClients}
          canDeleteAppointmentVipClients={canDeleteAppointmentVipClients}
          canCreateAppointmentVipAssignments={canCreateAppointmentVipAssignments}
          canUpdateAppointmentVipAssignments={canUpdateAppointmentVipAssignments}
          canDeleteAppointmentVipAssignments={canDeleteAppointmentVipAssignments}
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
          closeAdminOptionsPanel={closeAdminOptionsPanel}
          closeNotificationsSettingsPanel={closeNotificationsSettingsPanel}
          closeMonitoringPanel={closeMonitoringPanel}
          closeStatisticsPanel={closeStatisticsPanel}
          statisticsVipAttendanceHistoryItems={statisticsVipAttendanceHistoryItems}
          statisticsVipAttendanceHistoryFilters={statisticsVipAttendanceHistoryFilters}
          statisticsVipAttendanceHistoryMessage={statisticsVipAttendanceHistoryMessage}
          statisticsVipAttendanceHistoryLoading={statisticsVipAttendanceHistoryLoading}
          loadStatisticsVipAttendanceHistory={loadStatisticsVipAttendanceHistory}
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
          createOrganizationOptions={createOrganizationOptions}
          setCreateForm={setCreateForm}
          setCreateErrors={setCreateErrors}
          roleOptions={roleOptions}
          openCreateUserPanel={openCreateUserPanel}
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
        clientsMenuOpen={clientsMenuOpen}
        setClientsMenuOpen={setClientsMenuOpen}
        openAllClientsPanel={openAllClientsPanel}
        vipClientsMenuOpen={vipClientsMenuOpen}
        setVipClientsMenuOpen={setVipClientsMenuOpen}
        assignmentsMenuOpen={assignmentsMenuOpen}
        setAssignmentsMenuOpen={setAssignmentsMenuOpen}
        hasAppointmentsMenuAccess={hasAppointmentsMenuAccess}
        canOpenAppointmentSchedule={canOpenAppointmentSchedule}
        canOpenAppointmentVipMyClass={canOpenAppointmentVipMyClass}
        canOpenAppointmentBreaks={canOpenAppointmentBreaks}
        canOpenAppointmentVipClients={canOpenAppointmentVipClients}
        canOpenMyChildren={canOpenMyChildren}
        canOpenAppointmentVipDailyRoutines={canOpenAppointmentVipDailyRoutines}
        canOpenAppointmentVipClassAssignments={canOpenAppointmentVipClassAssignments}
        canOpenAppointmentVipTutorAssignments={canOpenAppointmentVipTutorAssignments}
        canOpenAppointmentVipAssignments={canOpenAppointmentVipAssignments}
        canOpenAppointmentStatistics={canOpenAppointmentStatistics}
        canOpenStatisticsClassAttendance={canOpenStatisticsClassAttendance}
        canOpenStatisticsPlannerReport={canOpenStatisticsPlannerReport}
        appointmentMenuOpen={appointmentMenuOpen}
        setAppointmentMenuOpen={setAppointmentMenuOpen}
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
        statisticsMenuOpen={statisticsMenuOpen}
        setStatisticsMenuOpen={setStatisticsMenuOpen}
        openStatisticsClassPanel={openStatisticsClassPanel}
        openStatisticsPlannerReportPanel={openStatisticsPlannerReportPanel}
        hasUsersMenuAccess={hasUsersMenuAccess}
        usersMenuOpen={usersMenuOpen}
        setUsersMenuOpen={setUsersMenuOpen}
        setSettingsMenuOpen={setSettingsMenuOpen}
        adminSettingsMenuOpen={adminSettingsMenuOpen}
        setAdminSettingsMenuOpen={setAdminSettingsMenuOpen}
        canReadUsers={canReadUsers}
        closeMenu={closeMenu}
        navigate={navigate}
        hasSettingsMenuAccess={hasSettingsMenuAccess}
        hasAdminSettingsAccess={hasAdminSettingsAccess}
        hasNotificationsSettingsAccess={hasNotificationsSettingsAccess}
        settingsMenuOpen={settingsMenuOpen}
        openOrganizationsPanel={openOrganizationsPanel}
        openRolesPanel={openRolesPanel}
        openPositionsPanel={openPositionsPanel}
        openAdminOptionsPanel={openAdminOptionsPanel}
        openNotificationsSettingsPanel={openNotificationsSettingsPanel}
        openMonitoringPanel={openMonitoringPanel}
      />
    </>
  );
}

export default ProfilePage;
