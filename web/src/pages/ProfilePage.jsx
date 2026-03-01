import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { getBirthdayValidationMessage } from "./profile/profile.validators.js";

function normalizeVipAttendanceStatus(value, fallback = "unmarked") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "present" || normalized === "absent") {
    return normalized;
  }
  return fallback;
}

function mapVipAttendanceClient(item) {
  const id = String(item?.id || "").trim();
  const firstName = String(item?.firstName || item?.first_name || "").trim();
  const lastName = String(item?.lastName || item?.last_name || "").trim();
  const middleName = String(item?.middleName || item?.middle_name || "").trim();
  const teacherId = String(item?.teacherId || item?.teacher_id || "").trim();
  const teacherName = String(item?.teacherName || item?.teacher_name || "").trim();
  const tutorName = String(
    item?.tutorName
    || item?.tutor_name
    || item?.teacherName
    || item?.teacher_name
    || item?.specialistName
    || item?.specialist_name
    || item?.specialistFullName
    || item?.specialist_full_name
    || teacherName
    || ""
  ).trim();
  const phone = String(item?.phone || item?.phone_number || "").trim();
  const attendanceNote = String(item?.attendanceNote || item?.attendance_note || "").trim();
  const note = attendanceNote;
  const attendanceStatusRaw = item?.attendanceStatus ?? item?.attendance_status ?? item?.attendance_state;
  const arrivedAtRaw = item?.arrivedAt ?? item?.arrived_at ?? item?.checkInAt ?? item?.check_in_at;
  const leftAtRaw = item?.leftAt ?? item?.left_at ?? item?.checkOutAt ?? item?.check_out_at;
  const attendanceStatus = normalizeVipAttendanceStatus(attendanceStatusRaw, "unmarked");
  const arrivedAt = normalizeVipAttendanceDateTime(arrivedAtRaw);
  const leftAt = normalizeVipAttendanceDateTime(leftAtRaw);
  const hasAttendanceData = attendanceStatus !== "unmarked"
    || Boolean(arrivedAt)
    || Boolean(leftAt)
    || Boolean(attendanceNote);
  return {
    id,
    firstName,
    lastName,
    middleName,
    teacherId,
    teacherName,
    tutorName,
    phone,
    note,
    attendanceStatus,
    arrivedAt,
    leftAt,
    hasAttendanceData
  };
}

function resolveVipAttendanceDate(period, fallbackYmd) {
  const from = String(period?.from || "").trim();
  const to = String(period?.to || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return to;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return from;
  }
  return String(fallbackYmd || "").trim();
}

function normalizeVipAttendanceDraftEntry(value) {
  if (value && typeof value === "object") {
    const status = normalizeVipAttendanceStatus(value.status, "unmarked");
    const arrivedAt = String(value.arrivedAt || "").trim();
    const leftAt = String(value.leftAt || "").trim();
    const note = String(value.note || "").trim();
    return {
      status,
      arrivedAt: status === "present" ? arrivedAt : "",
      leftAt: status === "present" ? leftAt : "",
      note
    };
  }
  const status = normalizeVipAttendanceStatus(value, "unmarked");
  return { status, arrivedAt: "", leftAt: "", note: "" };
}

function normalizeVipAttendanceDateTime(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  const directMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (directMatch) {
    const [, year, month, day, hours, minutes] = directMatch;
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const year = String(parsed.getFullYear()).padStart(4, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function mapVipClassItem(item) {
  const id = String(item?.id || item?.classId || item?.class_id || "").trim();
  const className = String(item?.className || item?.class_name || "").trim();
  const teacherId = String(item?.teacherId || item?.teacher_id || "").trim();
  const teacherName = String(item?.teacherName || item?.teacher_name || "").trim();
  const childrenCountRaw = Number.parseInt(String(item?.childrenCount || item?.children_count || "0"), 10);
  const childrenCount = Number.isInteger(childrenCountRaw) && childrenCountRaw > 0 ? childrenCountRaw : 0;
  return {
    id,
    classId: id,
    className,
    teacherId,
    teacherName,
    childrenCount
  };
}

function mapVipAssignmentItem(item) {
  const id = String(item?.id || "").trim();
  const firstName = String(item?.firstName || item?.first_name || "").trim();
  const lastName = String(item?.lastName || item?.last_name || "").trim();
  const middleName = String(item?.middleName || item?.middle_name || "").trim();
  const classId = String(item?.classId || item?.class_id || item?.classAssignmentId || item?.class_assignment_id || "").trim();
  const className = String(item?.className || item?.class_name || "").trim();
  const teacherId = String(item?.teacherId || item?.teacher_id || "").trim();
  const teacherName = String(item?.teacherName || item?.teacher_name || "").trim();
  const tutorId = String(item?.tutorId || item?.tutor_id || "").trim();
  const tutorName = String(item?.tutorName || item?.tutor_name || "").trim();
  const updatedBy = String(
    item?.updatedBy
    || item?.updated_by
    || item?.updatedByName
    || item?.updated_by_name
    || ""
  ).trim();
  const updatedAt = item?.updatedAt || item?.updated_at || null;
  return {
    id,
    firstName,
    lastName,
    middleName,
    classId,
    className,
    teacherId,
    teacherName,
    tutorId,
    tutorName,
    updatedBy,
    updatedAt
  };
}

function normalizeVipAssignmentDraftEntry(value) {
  if (value && typeof value === "object") {
    return {
      classId: String(value.classId || "").trim(),
      tutorId: String(value.tutorId || "").trim()
    };
  }
  return {
    classId: "",
    tutorId: ""
  };
}

function ProfilePage({ forcedView = "none" }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const menuToggleRef = useRef(null);
  const avatarInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);
  const [clientsMenuOpen, setClientsMenuOpen] = useState(false);
  const [vipClientsMenuOpen, setVipClientsMenuOpen] = useState(false);
  const [assignmentsMenuOpen, setAssignmentsMenuOpen] = useState(false);
  const [appointmentMenuOpen, setAppointmentMenuOpen] = useState(false);
  const [usersMenuOpen, setUsersMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
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
    canOpenAppointmentBreaks,
    canOpenAppointmentVipClients,
    canOpenAppointmentVipAssignments,
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
    navigate,
    loadUserOptions
  });

  const ensureOrganizationsLoaded = useCallback(() => {
    if (hasSettingsMenuAccess && organizations.length === 0) {
      loadOrganizations();
    }
  }, [hasSettingsMenuAccess, organizations.length, loadOrganizations]);

  const {
    allUsers,
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
    clientsMessage,
    clientsPage,
    clientsTotalPages,
    vipClients,
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

  const loadVipAttendanceTeachers = useCallback(async () => {
    if (!canOpenAppointmentVipClients) {
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
  }, [canOpenAppointmentVipClients, navigate]);

  const loadVipAttendance = useCallback(async () => {
    if (!canOpenAppointmentVipClients) {
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
        setVipAttendanceMessage("No VIP clients found.");
      }
    } catch {
      setVipAttendanceItems([]);
      setVipAttendanceDraftByClientId({});
      setVipAttendanceMessage("Failed to load VIP attendance clients.");
    } finally {
      setVipAttendanceLoading(false);
    }
  }, [canOpenAppointmentVipClients, navigate, vipAttendancePeriod, todayYmd]);

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
  }, [navigate, todayYmd, vipAttendancePeriod]);

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
    arrivedAt = "",
    leftAt = "",
    note = ""
  } = {}) => {
    const normalizedArrivedAt = String(arrivedAt || "").trim();
    const normalizedLeftAt = String(leftAt || "").trim();
    const normalizedNote = String(note || "").trim();

    if (normalizedLeftAt && !normalizedArrivedAt) {
      return { ok: false, message: "Arrival time is required when departure time is set." };
    }
    if (normalizedArrivedAt && normalizedLeftAt && normalizedLeftAt < normalizedArrivedAt) {
      return { ok: false, message: "Departure time must be later than arrival time." };
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
    if (!canOpenAppointmentVipAssignments) {
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
      if (nextItems.length === 0) {
        setVipClassMessage("No classes found.");
      }
    } catch {
      setVipClassItems([]);
      setVipClassTeachers([]);
      setVipClassMessage("Failed to load class assignments.");
    } finally {
      setVipClassLoading(false);
    }
  }, [canOpenAppointmentVipAssignments, navigate]);

  const saveVipClassAssignment = useCallback(async ({
    classId = "",
    className = "",
    teacherId = ""
  } = {}) => {
    const normalizedClassId = String(classId || "").trim();
    const normalizedClassName = String(className || "").trim();
    const normalizedTeacherId = String(teacherId || "").trim();

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
  }, [navigate]);

  const deleteVipClassAssignment = useCallback(async (classId) => {
    const normalizedClassId = String(classId || "").trim();
    if (!normalizedClassId) {
      return { ok: false, message: "Class is required." };
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
  }, [navigate]);

  const loadVipAssignments = useCallback(async () => {
    if (!canOpenAppointmentVipAssignments) {
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
  }, [canOpenAppointmentVipAssignments, navigate]);

  const saveVipAssignment = useCallback(async (clientId, {
    classId = "",
    tutorId = ""
  } = {}) => {
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
  }, [navigate]);

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
    setSettingsMenuOpen(false);
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
    loadUserOptions();
  }, [loadUserOptions, profile?.username]);

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
    if (mainView === "appointment-vip-clients") {
      loadVipClients(1);
      return;
    }
    if (mainView === "appointment-vip-attendance") {
      loadVipAttendance();
      loadVipAttendanceTeachers();
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
    loadVipAttendance,
    loadVipAttendanceTeachers,
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
    openCreateClientPanel,
    closeCreateClientPanel,
    openAppointmentPanel,
    closeAppointmentPanel,
    openAppointmentBreaksPanel,
    closeAppointmentBreaksPanel,
    openAppointmentVipSchedulePanel,
    closeAppointmentVipSchedulePanel,
    openAppointmentVipAttendancePanel,
    closeAppointmentVipAttendancePanel,
    openAppointmentVipAssignmentsPanel,
    closeAppointmentVipAssignmentsPanel,
    openAppointmentVipTutorAssignmentsPanel,
    closeAppointmentVipTutorAssignmentsPanel,
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
    canOpenAppointmentVipAssignments,
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
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (data?.errors && typeof data.errors === "object") {
          setCreateErrors(data.errors);
        } else if (data?.field) {
          setCreateErrors({ [data.field]: data.message || "Invalid value." });
        } else {
          setCreateErrors({ username: getApiErrorMessage(response, data, "Failed to create employee account.") });
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
          allUsers={allUsers}
          canUpdateUsers={canUpdateUsers}
          canDeleteUsers={canDeleteUsers}
          openAllUsersEditModal={openAllUsersEditModal}
          openAllUsersDeleteModal={openAllUsersDeleteModal}
          allUsersPage={allUsersPage}
          allUsersTotalPages={allUsersTotalPages}
          loadAllUsers={loadAllUsers}
          closeAllUsersPanel={closeAllUsersPanel}
          closeAllClientsPanel={closeAllClientsPanel}
          closeCreateClientPanel={closeCreateClientPanel}
          clients={clients}
          clientsMessage={clientsMessage}
          clientsPage={clientsPage}
          clientsTotalPages={clientsTotalPages}
          loadClients={loadClients}
          vipClients={vipClients}
          vipClientsMessage={vipClientsMessage}
          vipClientsPage={vipClientsPage}
          vipClientsTotalPages={vipClientsTotalPages}
          loadVipClients={loadVipClients}
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
          closeAppointmentVipAssignmentsPanel={closeAppointmentVipAssignmentsPanel}
          closeAppointmentVipTutorAssignmentsPanel={closeAppointmentVipTutorAssignmentsPanel}
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
        canCreateClients={canCreateClients}
        clientsMenuOpen={clientsMenuOpen}
        setClientsMenuOpen={setClientsMenuOpen}
        openAllClientsPanel={openAllClientsPanel}
        openCreateClientPanel={openCreateClientPanel}
        vipClientsMenuOpen={vipClientsMenuOpen}
        setVipClientsMenuOpen={setVipClientsMenuOpen}
        assignmentsMenuOpen={assignmentsMenuOpen}
        setAssignmentsMenuOpen={setAssignmentsMenuOpen}
        hasAppointmentsMenuAccess={hasAppointmentsMenuAccess}
        canOpenAppointmentSchedule={canOpenAppointmentSchedule}
        canOpenAppointmentBreaks={canOpenAppointmentBreaks}
        canOpenAppointmentVipClients={canOpenAppointmentVipClients}
        canOpenAppointmentVipAssignments={canOpenAppointmentVipAssignments}
        appointmentMenuOpen={appointmentMenuOpen}
        setAppointmentMenuOpen={setAppointmentMenuOpen}
        openAppointmentPanel={openAppointmentPanel}
        openAppointmentBreaksPanel={openAppointmentBreaksPanel}
        openAppointmentVipSchedulePanel={openAppointmentVipSchedulePanel}
        openAppointmentVipAttendancePanel={openAppointmentVipAttendancePanel}
        openAppointmentVipAssignmentsPanel={openAppointmentVipAssignmentsPanel}
        openAppointmentVipTutorAssignmentsPanel={openAppointmentVipTutorAssignmentsPanel}
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
