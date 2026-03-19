import { sendMigrationRequired, setNoCacheHeaders } from "../../lib/http.js";
import { toBoundedInteger } from "../../lib/bounded-integer.js";
import { parsePositiveInteger } from "../../lib/number.js";
import {
  getTodayYmd,
  isValidDateYmd,
  normalizeDateYmd as normalizeLooseDateYmd,
  validateBirthdayYmd
} from "../../lib/date.js";
import { parseNullableBoolean } from "../../lib/request-parsers.js";
import {
  isDirectorLikeRoleLabel,
  joinNormalizedRoleLabelParts
} from "../../lib/role-labels.js";
import { createTtlCache } from "../../lib/ttl-cache.js";
import { PHONE_REGEX } from "../../constants/validation.js";
import { requesterHasOrgFeature } from "../../lib/org-features.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import {
  getVipDailyRoutineDayKey,
  normalizeVipClassDailyRoutineActivityType,
  normalizeVipDailyRoutineDayOfWeek
} from "./vip-daily-routines.js";
import { normalizeTimeHm, toTimeMinutes } from "../appointments/time.js";
import {
  hasAppointmentConflictForVipRoutine,
  hasBreakConflictForVipRoutine,
  hasWorkScheduleAbsenceForVipRoutine
} from "../appointments/services/appointment-schedules.service.js";
import {
  createClientMedicalHistoryEntry,
  createClient,
  deleteAllClientMedicalHistoryEntries,
  deleteClientMedicalHistoryEntry,
  deleteVipClassAssignment,
  deleteClientById,
  findVipClientAttendanceByDate,
  findVipClassDailyRoutineById,
  findVipClassDailyRoutineConflictForSpecialist,
  findClientsRequester,
  findVipTutorAssignmentByClientId,
  getClientMedicalHistoryClientsPage,
  getClientMedicalHistoryClientOptions,
  getClientMedicalHistoryEntries,
  getClientSummaryById,
  getClientsPage,
  getVipAssignmentOptionsByOrganization,
  getVipClassAssignmentHistory,
  getVipClassAssignmentOptions,
  getVipClassAssignments,
  getVipClassDailyRoutines,
  getVipClassDailyRoutineSpecialists,
  getVipAttendanceHistory,
  getVipNormMonitoringRows,
  getVipClientOptionsByOrganization,
  getVipAttendanceTeachersByOrganization,
  isVipClientAssignedToUser,
  isVipClassAssignedToUser,
  getVipTutorAssignmentHistory,
  getVipTutorAssignments,
  deleteVipClassDailyRoutine,
  resetVipClientAttendanceByDate,
  searchClientsForSchedule,
  upsertVipClassAssignment,
  upsertVipClassDailyRoutine,
  upsertVipTutorAssignment,
  upsertVipClientAttendance,
  updateClientMedicalHistoryEntry,
  updateClientById
} from "./clients.service.js";

const myChildrenSearchCache = createTtlCache({
  maxEntries: toBoundedInteger(process.env.MY_CHILDREN_CACHE_MAX, 5000, 100, 50_000),
  defaultTtlMs: toBoundedInteger(process.env.MY_CHILDREN_CACHE_TTL_MS, 15_000, 500, 60_000)
});

function splitLegacyFullName(value) {
  const tokens = String(value || "").trim().split(/\s+/).filter(Boolean);
  return {
    lastName: tokens[0] || "",
    firstName: tokens[1] || "",
    middleName: tokens.slice(2).join(" ")
  };
}

function parseLegacyNotes(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { birthday: "", contact: "", note: "" };
  }

  const chunks = raw.split("|").map((item) => item.trim()).filter(Boolean);
  let birthday = "";
  let contact = "";
  const noteParts = [];

  chunks.forEach((chunk) => {
    const birthdayMatch = chunk.match(/^Birthday:\s*(\d{4}-\d{2}-\d{2})$/i);
    if (birthdayMatch) {
      birthday = birthdayMatch[1];
      return;
    }

    const contactMatch = chunk.match(/^Contact:\s*(.+)$/i);
    if (contactMatch) {
      contact = String(contactMatch[1] || "").trim();
      return;
    }

    noteParts.push(chunk);
  });

  return { birthday, contact, note: noteParts.join(" | ") };
}

async function hasMedicalHistoryPermission(requester, permissionCode) {
  if (requester?.is_admin) {
    return true;
  }
  return hasPermission(requester?.role_id, permissionCode);
}

function buildClientMedicalHistoryPreview(row) {
  const parts = [
    String(row?.history_condition_name || "").trim(),
    String(row?.history_diagnosis || "").trim(),
    String(row?.history_note || "").trim(),
    String(row?.history_symptoms || "").trim(),
    String(row?.history_treatment_plan || "").trim()
  ].filter(Boolean);

  return parts.join(" | ");
}

function parseAttendanceDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { value: null };
  }
  const normalized = raw.replace(/\s+/, "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    return { value: null, error: "Datetime must be in YYYY-MM-DDTHH:mm format." };
  }
  const parsed = new Date(`${normalized}:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { value: null, error: "Invalid datetime value." };
  }
  return { value: normalized };
}

function normalizeDateYmdValue(value) {
  return normalizeLooseDateYmd(value, {
    allowPrefix: true,
    allowDateParsing: true,
    requireValidExact: true
  });
}

function isTeacherLike(...parts) {
  const normalized = parts
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("teacher")
    || normalized.includes("tutor")
    || normalized.includes("oqituvchi")
    || normalized.includes("o'qituvchi")
    || normalized.includes("ustoz")
  );
}

function isDirectorLikeRequester(requester) {
  if (requester?.is_admin === true) {
    return true;
  }
  return isDirectorLikeRoleLabel(
    joinNormalizedRoleLabelParts(
      requester?.role_label,
      requester?.position_label
    )
  );
}

const ADVANCED_APPOINTMENT_MENU_PERMISSIONS = Object.freeze([
  PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE,
  PERMISSIONS.APPOINTMENTS_SUBMENU_BREAKS,
  PERMISSIONS.APPOINTMENTS_PLANNER_READ,
  PERMISSIONS.APPOINTMENTS_PLANNER_CREATE,
  PERMISSIONS.APPOINTMENTS_PLANNER_UPDATE,
  PERMISSIONS.APPOINTMENTS_PLANNER_DELETE,
  PERMISSIONS.APPOINTMENTS_BREAKS_READ,
  PERMISSIONS.APPOINTMENTS_BREAKS_CREATE,
  PERMISSIONS.APPOINTMENTS_BREAKS_UPDATE,
  PERMISSIONS.APPOINTMENTS_BREAKS_DELETE,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_READ,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_CREATE,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_UPDATE,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DELETE,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CLASS,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_NORM_MONITORING,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DAILY_ROUTINES,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_READ,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_CREATE,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_UPDATE,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_DELETE,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_READ,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_CREATE,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_UPDATE,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_DELETE,
  PERMISSIONS.APPOINTMENTS_STATISTICS_CLASS_ATTENDANCE
]);

async function hasAdvancedAppointmentMenuPermissions(roleId) {
  const checks = await Promise.all(
    ADVANCED_APPOINTMENT_MENU_PERMISSIONS.map((code) => hasPermission(roleId, code))
  );
  return checks.some(Boolean);
}

async function getVipClientsPermissionSnapshot(roleId) {
  const [
    usesAdvancedMenuPermissions,
    canReadVipClients,
    canCreateVipClients,
    canUpdateVipClients,
    canDeleteVipClients,
    canAccessMyClass,
    canAccessNormMonitoring,
    canAccessMyChildren,
    canAccessDailyRoutines,
    canReadVipScopeAll,
    canReadVipScopeAssigned
  ] = await Promise.all([
    hasAdvancedAppointmentMenuPermissions(roleId),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_READ),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_CREATE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_UPDATE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DELETE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CLASS),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_NORM_MONITORING),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DAILY_ROUTINES),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_SCOPE_ALL),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_SCOPE_ASSIGNED)
  ]);
  return {
    usesAdvancedMenuPermissions,
    canReadVipClients,
    canCreateVipClients,
    canUpdateVipClients,
    canDeleteVipClients,
    canAccessMyClass,
    canAccessNormMonitoring,
    canAccessMyChildren,
    canAccessDailyRoutines,
    canReadVipScopeAll,
    canReadVipScopeAssigned
  };
}

function resolveVipClientReadScope(vipPermissions, requester) {
  if (vipPermissions?.canReadVipScopeAll) {
    return "all";
  }
  if (vipPermissions?.canReadVipScopeAssigned) {
    return "assigned";
  }
  return isDirectorLikeRequester(requester) ? "all" : "assigned";
}

async function getAssignmentsPermissionSnapshot(roleId) {
  const [
    usesAdvancedMenuPermissions,
    canReadClassAssignments,
    canCreateClassAssignments,
    canUpdateClassAssignments,
    canDeleteClassAssignments,
    canReadTutorAssignments,
    canCreateTutorAssignments,
    canUpdateTutorAssignments,
    canDeleteTutorAssignments
  ] = await Promise.all([
    hasAdvancedAppointmentMenuPermissions(roleId),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_READ),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_CREATE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_UPDATE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CLASS_DELETE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_READ),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_CREATE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_UPDATE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_TUTOR_DELETE)
  ]);
  return {
    usesAdvancedMenuPermissions,
    canReadClassAssignments,
    canCreateClassAssignments,
    canUpdateClassAssignments,
    canDeleteClassAssignments,
    canReadTutorAssignments,
    canCreateTutorAssignments,
    canUpdateTutorAssignments,
    canDeleteTutorAssignments
  };
}

function normalizeClientPayload(body) {
  const payload = body && typeof body === "object" ? body : {};
  const legacyFullName = String(payload?.fullName || "").trim();
  const legacyNotes = String(payload?.notes || "").trim();
  const legacyNameParts = splitLegacyFullName(legacyFullName);
  const legacyNotesParts = parseLegacyNotes(legacyNotes);

  return {
    firstName: String(payload?.firstName || legacyNameParts.firstName || "").trim(),
    lastName: String(payload?.lastName || legacyNameParts.lastName || "").trim(),
    middleName: String(payload?.middleName || legacyNameParts.middleName || "").trim(),
    birthday: String(payload?.birthday || legacyNotesParts.birthday || "").trim(),
    phone: String(payload?.phone || payload?.phoneNumber || "").trim(),
    tgMail: String(payload?.tgMail || payload?.telegramOrEmail || legacyNotesParts.contact || "").trim(),
    isVip: parseNullableBoolean(payload?.isVip ?? payload?.is_vip),
    note: String(payload?.note || legacyNotesParts.note || "").trim()
  };
}

function mapClient(row) {
  const firstName = String(row.first_name || "").trim();
  const lastName = String(row.last_name || "").trim();
  const middleName = String(row.middle_name || "").trim();
  const birthday = normalizeDateYmdValue(row?.birthday);
  const tgMail = String(row.tg_mail || "").trim();
  const note = String(row.note || "").trim();
  const attendanceNote = String(row.attendance_note || "").trim();
  const attendanceStatusRaw = String(row.attendance_status || "").trim().toLowerCase();
  const attendanceStatus = attendanceStatusRaw === "present" || attendanceStatusRaw === "absent"
    ? attendanceStatusRaw
    : "";
  const attendanceDate = normalizeDateYmdValue(row?.attendance_date);
  const assignedTeacherId = String(row.teacher_id || row.teacher_user_id || "").trim();
  const assignedTeacherName = String(row.teacher_name || "").trim();
  const assignedTutorId = String(row.tutor_id || row.tutor_user_id || "").trim();
  const assignedTutorName = String(row.tutor_name || "").trim();
  const assignedClassId = String(row.class_id || row.class_assignment_id || "").trim();
  const vipClassName = String(row.vip_class_name || row.class_name || "").trim();
  const createdById = String(row.created_by || "").trim();
  const createdByName = String(row.created_by_name || row.created_by || "-").trim() || "-";
  const historyEntryId = String(row.history_entry_id || "").trim();
  const medicalHistoryCount = Number.parseInt(row.history_count, 10);
  const historyEntryDate = normalizeDateYmdValue(row?.history_entry_date);
  const historySpecialistName = String(row.history_specialist_name || "").trim();
  const historySpecialistPosition = String(row.history_specialist_position || "").trim();
  const historyPreview = buildClientMedicalHistoryPreview(row);
  const hasCreatorTeacher = isTeacherLike(row.creator_role_label, row.creator_position_label);
  const teacherId = assignedTeacherId || (hasCreatorTeacher ? createdById : "");
  const teacherName = assignedTeacherName || (hasCreatorTeacher ? createdByName : "");
  const fullName = [lastName, firstName, middleName].filter(Boolean).join(" ");
  const notes = [birthday ? `Birthday: ${birthday}` : "", tgMail ? `Contact: ${tgMail}` : "", note]
    .filter(Boolean)
    .join(" | ");

  return {
    id: row.id,
    organizationId: row.organization_id,
    firstName,
    lastName,
    middleName,
    birthday,
    phone: row.phone_number,
    tgMail,
    telegramOrEmail: tgMail,
    isVip: Boolean(row.is_vip),
    is_vip: Boolean(row.is_vip),
    createdById: createdById || row.created_by,
    createdByName,
    createdBy: createdByName,
    updatedById: row.updated_by,
    updatedByName: row.updated_by_name || row.updated_by || "-",
    updatedBy: row.updated_by_name || row.updated_by || "-",
    classId: assignedClassId,
    class_id: assignedClassId,
    className: vipClassName,
    class_name: vipClassName,
    teacherId,
    teacherName,
    teacher_id: teacherId,
    teacher_name: teacherName,
    tutorId: assignedTutorId,
    tutorName: assignedTutorName,
    tutor_id: assignedTutorId,
    tutor_name: assignedTutorName,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    medicalHistoryCount: Number.isFinite(medicalHistoryCount) && medicalHistoryCount > 0 ? medicalHistoryCount : 0,
    historyEntryId,
    historyEntryDate,
    historySpecialistName: historySpecialistName || "-",
    historySpecialistPosition: historySpecialistPosition || "-",
    historyPreview,
    note,
    attendanceDate,
    attendanceStatus,
    arrivedAt: row.arrived_at || null,
    leftAt: row.left_at || null,
    attendanceNote,
    fullName,
    notes
  };
}

function validateClientPayload({ firstName, lastName, middleName, birthday, phone, tgMail, note }) {
  const errors = {};

  if (!firstName) {
    errors.firstName = "First name is required.";
  } else if (firstName.length > 64) {
    errors.firstName = "First name must be max 64 chars.";
  }

  if (!lastName) {
    errors.lastName = "Last name is required.";
  } else if (lastName.length > 64) {
    errors.lastName = "Last name must be max 64 chars.";
  }

  if (middleName.length > 64) {
    errors.middleName = "Middle name must be max 64 chars.";
  }

  const birthdayError = validateBirthdayYmd(birthday, { required: true });
  if (birthdayError) {
    errors.birthday = birthdayError;
  }

  if (phone && !PHONE_REGEX.test(phone)) {
    errors.phone = "Invalid phone number.";
  }

  if (tgMail.length > 96) {
    errors.tgMail = "Telegram or email is too long (max 96).";
  }

  if (note.length > 255) {
    errors.note = "Note is too long (max 255).";
  }

  return errors;
}

function normalizeClientMedicalHistoryPayload(body) {
  const payload = body && typeof body === "object" ? body : {};
  return {
    entryDate: String(
      payload?.entryDate
      || payload?.entry_date
      || payload?.date
      || ""
    ).trim(),
    conditionName: String(
      payload?.conditionName
      || payload?.condition_name
      || payload?.title
      || ""
    ).trim(),
    symptoms: String(payload?.symptoms || "").trim(),
    diagnosis: String(payload?.diagnosis || "").trim(),
    treatmentPlan: String(payload?.treatmentPlan || payload?.treatment_plan || "").trim(),
    note: String(payload?.note || "").trim()
  };
}

function validateClientMedicalHistoryPayload({
  entryDate,
  conditionName,
  symptoms,
  diagnosis,
  treatmentPlan,
  note
}) {
  const errors = {};

  if (!entryDate) {
    errors.entryDate = "Entry date is required.";
  } else if (!isValidDateYmd(entryDate)) {
    errors.entryDate = "Entry date must be YYYY-MM-DD.";
  }

  if (!conditionName) {
    errors.conditionName = "Condition is required.";
  } else if (conditionName.length > 160) {
    errors.conditionName = "Condition is too long (max 160).";
  }

  if (symptoms.length > 2000) {
    errors.symptoms = "Symptoms are too long (max 2000).";
  }

  if (diagnosis.length > 2000) {
    errors.diagnosis = "Diagnosis is too long (max 2000).";
  }

  if (treatmentPlan.length > 4000) {
    errors.treatmentPlan = "Treatment plan is too long (max 4000).";
  }

  if (note.length > 4000) {
    errors.note = "Note is too long (max 4000).";
  }

  return errors;
}

function mapClientSummary(row) {
  const firstName = String(row?.first_name || "").trim();
  const lastName = String(row?.last_name || "").trim();
  const middleName = String(row?.middle_name || "").trim();
  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    firstName,
    lastName,
    middleName,
    fullName: [lastName, firstName, middleName].filter(Boolean).join(" ").trim(),
    birthday: normalizeDateYmdValue(row?.birthday),
    isVip: Boolean(row?.is_vip),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

function mapClientMedicalHistoryEntry(row) {
  const specialistId = String(row?.author_user_id || "").trim();
  const specialistName = String(row?.author_name || "").trim();
  const specialistPosition = String(row?.author_position_label || "").trim();
  const createdById = String(row?.created_by || "").trim();
  const updatedById = String(row?.updated_by || "").trim();

  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    clientId: String(row?.client_id || "").trim(),
    entryDate: normalizeDateYmdValue(row?.entry_date),
    conditionName: String(row?.condition_name || "").trim(),
    symptoms: String(row?.symptoms || "").trim(),
    diagnosis: String(row?.diagnosis || "").trim(),
    treatmentPlan: String(row?.treatment_plan || "").trim(),
    note: String(row?.note || "").trim(),
    specialistId,
    specialistPosition,
    specialistName: specialistName || (specialistId ? `User #${specialistId}` : "-"),
    authorUserId: specialistId,
    authorName: specialistName || (specialistId ? `User #${specialistId}` : "-"),
    createdById,
    createdByName: String(row?.created_by_name || "").trim() || (createdById ? `User #${createdById}` : "-"),
    updatedById,
    updatedByName: String(row?.updated_by_name || "").trim() || (updatedById ? `User #${updatedById}` : "-"),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

function mapClientMedicalHistoryClientOption(row) {
  const id = String(row?.id || "").trim();
  const firstName = String(row?.first_name || "").trim();
  const lastName = String(row?.last_name || "").trim();
  const middleName = String(row?.middle_name || "").trim();
  const label = [lastName, firstName, middleName].filter(Boolean).join(" ").trim();

  return {
    value: id,
    label: label || (id ? `Client #${id}` : "Client")
  };
}

function mapVipAttendanceRecord(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  const note = String(row?.note || "").trim();
  return {
    clientId: String(row?.client_id || "").trim(),
    attendanceDate: normalizeDateYmdValue(row?.attendance_date),
    attendanceStatus: status === "present" ? "present" : "absent",
    arrivedAt: row?.arrived_at || null,
    leftAt: row?.left_at || null,
    attendanceNote: note,
    note
  };
}

function mapVipAttendanceHistoryRecord(row) {
  const statusRaw = String(row?.status || row?.attendance_status || "").trim().toLowerCase();
  const attendanceStatus = statusRaw === "present" ? "present" : "absent";
  const attendanceDate = normalizeDateYmdValue(row?.attendance_date);
  const note = String(row?.note || row?.attendance_note || "").trim();
  const classId = String(row?.class_id || row?.class_assignment_id || row?.classId || "").trim();
  const className = String(row?.class_name || row?.className || "").trim();
  const teacherId = String(row?.teacher_user_id || row?.teacher_id || row?.teacherId || "").trim();
  const teacherName = String(row?.teacher_name || row?.teacherName || "").trim();
  const tutorId = String(row?.tutor_user_id || row?.tutor_id || row?.tutorId || "").trim();
  const tutorName = String(row?.tutor_name || row?.tutorName || "").trim();
  const clientId = String(row?.client_id || row?.clientId || "").trim();
  const firstName = String(row?.first_name || row?.firstName || "").trim();
  const lastName = String(row?.last_name || row?.lastName || "").trim();
  const middleName = String(row?.middle_name || row?.middleName || "").trim();
  return {
    id: String(row?.id || "").trim(),
    clientId,
    client_id: clientId,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    middleName,
    middle_name: middleName,
    classId,
    class_id: classId,
    className,
    class_name: className,
    teacherId,
    teacher_id: teacherId,
    teacherName,
    teacher_name: teacherName,
    tutorId,
    tutor_id: tutorId,
    tutorName,
    tutor_name: tutorName,
    attendanceDate,
    attendance_date: attendanceDate,
    attendanceStatus,
    attendance_status: attendanceStatus,
    arrivedAt: row?.arrived_at || row?.arrivedAt || null,
    arrived_at: row?.arrived_at || row?.arrivedAt || null,
    leftAt: row?.left_at || row?.leftAt || null,
    left_at: row?.left_at || row?.leftAt || null,
    note,
    attendanceNote: note,
    attendance_note: note
  };
}

function normalizeVipNormMonitoringSpecialists(...groups) {
  const map = new Map();
  groups.forEach((group) => {
    const items = Array.isArray(group) ? group : [];
    items.forEach((item) => {
      const id = String(item?.id || "").trim();
      const name = String(item?.name || "").trim();
      if (!id || map.has(id)) {
        return;
      }
      map.set(id, {
        id,
        name: name || `User #${id}`
      });
    });
  });
  return Array.from(map.values())
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

function mapVipNormMonitoringRecord(row) {
  const clientId = String(row?.client_id || row?.clientId || "").trim();
  const firstName = String(row?.first_name || row?.firstName || "").trim();
  const lastName = String(row?.last_name || row?.lastName || "").trim();
  const middleName = String(row?.middle_name || row?.middleName || "").trim();
  const classId = String(row?.class_assignment_id || row?.classId || "").trim();
  const className = String(row?.class_name || row?.className || "").trim();
  const positionId = String(row?.position_id || row?.positionId || "").trim();
  const positionLabel = String(row?.position_label || row?.positionLabel || "").trim();
  const weeklyNorm = Number.parseInt(String(row?.max_per_week || row?.maxPerWeek || "0"), 10) || 0;
  const currentBooked = Number.parseInt(String(row?.current_booked || row?.currentBooked || "0"), 10) || 0;
  const confirmedCount = Number.parseInt(String(row?.confirmed_count || row?.confirmedCount || "0"), 10) || 0;
  const cancelledCount = Number.parseInt(String(row?.cancelled_count || row?.cancelledCount || "0"), 10) || 0;
  const specialists = normalizeVipNormMonitoringSpecialists(
    row?.linked_specialists,
    row?.linkedSpecialists,
    row?.scheduled_specialists,
    row?.scheduledSpecialists
  );
  const rawStatusKey = String(row?.status_key || row?.statusKey || "").trim().toLowerCase();
  const statusKey = rawStatusKey || (
    currentBooked > weeklyNorm
      ? "exceeded"
      : currentBooked < weeklyNorm
        ? "limit-reached"
        : "normal"
  );
  const rawStatus = String(row?.status || row?.statusLabel || "").trim();
  const status = rawStatus || (
    statusKey === "no-assignment"
      ? "No assignment"
      : statusKey === "no-position"
        ? "No position"
        : statusKey === "no-norm"
          ? "No norm configured"
          : statusKey === "exceeded"
            ? "Exceeded"
            : statusKey === "limit-reached"
              ? "Limit reached"
              : "Normal"
  );

  return {
    id: `${clientId}_${positionId}`,
    clientId,
    client_id: clientId,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    middleName,
    middle_name: middleName,
    classId,
    class_id: classId,
    className,
    class_name: className,
    positionId,
    position_id: positionId,
    positionLabel,
    position_label: positionLabel,
    weeklyNorm,
    weekly_norm: weeklyNorm,
    currentBooked,
    current_booked: currentBooked,
    confirmedCount,
    confirmed_count: confirmedCount,
    cancelledCount,
    cancelled_count: cancelledCount,
    status,
    statusKey,
    status_key: statusKey,
    specialists
  };
}

function mapVipTeacherOption(row) {
  const id = String(row?.teacher_user_id || row?.teacherId || row?.teacher_id || row?.id || "").trim();
  const name = String(row?.name || row?.teacher_name || row?.teacherName || "").trim();
  return {
    id,
    name
  };
}

function collectVipTeacherOptionsFromClassAssignments(items) {
  return Array.from(
    (Array.isArray(items) ? items : []).reduce((map, item) => {
      const teacherOption = mapVipTeacherOption(item);
      if (!teacherOption.id || map.has(teacherOption.id)) {
        return map;
      }
      map.set(teacherOption.id, teacherOption);
      return map;
    }, new Map()).values()
  );
}

function collectVipTutorOptionsFromTutorAssignments(items) {
  return Array.from(
    (Array.isArray(items) ? items : []).reduce((map, item) => {
      const id = String(item?.tutor_user_id || item?.tutorId || item?.tutor_id || "").trim();
      const name = String(item?.tutor_name || item?.tutorName || "").trim();
      if (!id || map.has(id)) {
        return map;
      }
      map.set(id, { id, name });
      return map;
    }, new Map()).values()
  );
}

function mapVipClassAssignmentRecord(row) {
  const id = String(row?.id || "").trim();
  const className = String(row?.class_name || row?.className || "").trim();
  const teacherId = String(row?.teacher_user_id || row?.teacher_id || row?.teacherId || "").trim();
  const teacherName = String(row?.teacher_name || row?.teacherName || "").trim();
  const childrenCountRaw = Number.parseInt(String(row?.children_count || row?.childrenCount || "0"), 10);
  const childrenCount = Number.isInteger(childrenCountRaw) && childrenCountRaw > 0 ? childrenCountRaw : 0;
  const createdBy = String(
    row?.created_by_name
    || row?.createdByName
    || row?.created_by
    || row?.createdBy
    || ""
  ).trim();
  const createdAt = row?.created_at || row?.createdAt || null;
  return {
    id,
    classId: id,
    class_id: id,
    className,
    class_name: className,
    teacherId,
    teacherName,
    teacher_id: teacherId,
    teacher_name: teacherName,
    childrenCount,
    children_count: childrenCount,
    createdBy,
    created_by: createdBy,
    createdAt,
    created_at: createdAt
  };
}

function mapVipClassAssignmentHistoryRecord(row) {
  const id = String(row?.id || "").trim();
  const classId = String(row?.class_assignment_id || row?.classId || row?.class_id || "").trim();
  const className = String(row?.class_name || row?.className || "").trim();
  const teacherId = String(row?.teacher_user_id || row?.teacherId || row?.teacher_id || "").trim();
  const teacherName = String(row?.teacher_name || row?.teacherName || "").trim();
  const assignedBy = String(
    row?.assigned_by_name
    || row?.assignedByName
    || row?.assigned_by
    || row?.assignedBy
    || ""
  ).trim();
  const changedBy = String(
    row?.changed_by_name
    || row?.changedByName
    || row?.changed_by
    || row?.changedBy
    || ""
  ).trim();
  const assignedAt = row?.assigned_at || row?.assignedAt || null;
  const changedAt = row?.changed_at || row?.changedAt || null;
  return {
    id,
    classId,
    class_id: classId,
    className,
    class_name: className,
    teacherId,
    teacherName,
    teacher_id: teacherId,
    teacher_name: teacherName,
    assignedBy,
    assigned_by: assignedBy,
    assignedAt,
    assigned_at: assignedAt,
    changedBy,
    changed_by: changedBy,
    changedAt,
    changed_at: changedAt
  };
}

function mapVipTutorAssignmentRecord(row) {
  const id = String(row?.id || row?.client_id || row?.clientId || "").trim();
  const firstName = String(row?.first_name || row?.firstName || "").trim();
  const lastName = String(row?.last_name || row?.lastName || "").trim();
  const middleName = String(row?.middle_name || row?.middleName || "").trim();
  const classId = String(row?.class_assignment_id || row?.class_id || row?.classId || "").trim();
  const className = String(row?.class_name || row?.className || "").trim();
  const teacherId = String(row?.teacher_user_id || row?.teacher_id || row?.teacherId || "").trim();
  const teacherName = String(row?.teacher_name || row?.teacherName || "").trim();
  const tutorId = String(row?.tutor_user_id || row?.tutor_id || row?.tutorId || "").trim();
  const tutorName = String(row?.tutor_name || row?.tutorName || "").trim();
  const updatedBy = String(
    row?.updated_by_name
    || row?.updatedByName
    || row?.updated_by
    || row?.updatedBy
    || ""
  ).trim();
  const updatedAt = row?.updated_at || row?.updatedAt || null;
  return {
    id,
    firstName,
    lastName,
    middleName,
    classId,
    class_id: classId,
    className,
    class_name: className,
    teacherId,
    teacherName,
    teacher_id: teacherId,
    teacher_name: teacherName,
    tutorId,
    tutorName,
    tutor_id: tutorId,
    tutor_name: tutorName,
    updatedBy,
    updated_by: updatedBy,
    updatedAt,
    updated_at: updatedAt
  };
}

function mapVipTutorAssignmentHistoryRecord(row) {
  const id = String(row?.id || "").trim();
  const clientId = String(row?.client_id || row?.clientId || "").trim();
  const firstName = String(row?.first_name || row?.firstName || "").trim();
  const lastName = String(row?.last_name || row?.lastName || "").trim();
  const middleName = String(row?.middle_name || row?.middleName || "").trim();
  const classId = String(row?.class_assignment_id || row?.class_id || row?.classId || "").trim();
  const className = String(row?.class_name || row?.className || "").trim();
  const teacherId = String(row?.teacher_user_id || row?.teacher_id || row?.teacherId || "").trim();
  const teacherName = String(row?.teacher_name || row?.teacherName || "").trim();
  const tutorId = String(row?.tutor_user_id || row?.tutor_id || row?.tutorId || "").trim();
  const tutorName = String(row?.tutor_name || row?.tutorName || "").trim();
  const assignedBy = String(
    row?.assigned_by_name
    || row?.assignedByName
    || row?.assigned_by
    || row?.assignedBy
    || ""
  ).trim();
  const changedBy = String(
    row?.changed_by_name
    || row?.changedByName
    || row?.changed_by
    || row?.changedBy
    || ""
  ).trim();
  const assignedAt = row?.assigned_at || row?.assignedAt || null;
  const changedAt = row?.changed_at || row?.changedAt || null;

  return {
    id,
    clientId,
    client_id: clientId,
    firstName,
    lastName,
    middleName,
    classId,
    class_id: classId,
    className,
    class_name: className,
    teacherId,
    teacherName,
    teacher_id: teacherId,
    teacher_name: teacherName,
    tutorId,
    tutorName,
    tutor_id: tutorId,
    tutor_name: tutorName,
    assignedBy,
    assigned_by: assignedBy,
    assignedAt,
    assigned_at: assignedAt,
    changedBy,
    changed_by: changedBy,
    changedAt,
    changed_at: changedAt
  };
}

function mapVipClassDailyRoutineRecord(row) {
  const id = String(row?.id || "").trim();
  const classId = String(row?.class_assignment_id || row?.classId || row?.class_id || "").trim();
  const className = String(row?.class_name || row?.className || "").trim();
  const teacherId = String(row?.teacher_user_id || row?.teacher_id || row?.teacherId || "").trim();
  const teacherName = String(row?.teacher_name || row?.teacherName || "").trim();
  const specialistId = String(row?.specialist_user_id || row?.specialistId || row?.specialist_id || "").trim();
  const specialistName = String(row?.specialist_name || row?.specialistName || "").trim();
  const specialistRole = String(row?.specialist_role || row?.specialistRole || "").trim();
  const childrenCountRaw = Number.parseInt(String(row?.children_count ?? row?.childrenCount ?? "0"), 10);
  const childrenCount = Number.isInteger(childrenCountRaw) && childrenCountRaw > 0 ? childrenCountRaw : 0;
  const dayOfWeek = Number.parseInt(String(row?.day_of_week || row?.dayOfWeek || ""), 10) || 0;
  const dayKey = getVipDailyRoutineDayKey(dayOfWeek);
  const activityType = normalizeVipClassDailyRoutineActivityType(row?.activity_type || row?.activityType, {
    allowAliases: true
  });
  const startTime = normalizeTimeHm(row?.start_time || row?.startTime);
  const endTime = normalizeTimeHm(row?.end_time || row?.endTime);
  const mandatoryExercises = String(row?.mandatory_exercises || row?.mandatoryExercises || "").trim();
  const note = String(row?.note || "").trim();
  const createdAt = row?.created_at || row?.createdAt || null;
  const updatedAt = row?.updated_at || row?.updatedAt || null;

  return {
    id,
    classId,
    class_id: classId,
    className,
    class_name: className,
    teacherId,
    teacher_id: teacherId,
    teacherName,
    teacher_name: teacherName,
    specialistId,
    specialist_id: specialistId,
    specialist_user_id: specialistId,
    specialistName,
    specialist_name: specialistName,
    specialistRole,
    specialist_role: specialistRole,
    childrenCount,
    children_count: childrenCount,
    dayOfWeek,
    day_of_week: dayOfWeek,
    dayKey,
    day_key: dayKey,
    activityType,
    activity_type: activityType,
    startTime,
    start_time: startTime,
    endTime,
    end_time: endTime,
    mandatoryExercises,
    mandatory_exercises: mandatoryExercises,
    note,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt
  };
}

async function clientsRoutes(fastify) {
  fastify.addHook("onResponse", async (request, reply) => {
    const method = String(request?.method || "").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return;
    }
    if (Number(reply?.statusCode || 500) >= 400) {
      return;
    }
    myChildrenSearchCache.clear();
  });

  fastify.get(
    "/vip-attendance/teachers",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "vip_clients.attendance")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipPermissions = await getVipClientsPermissionSnapshot(requester.role_id);
        if (!vipPermissions.canReadVipClients) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserIdRaw = vipReadScope === "all" ? null : authContext.userId;
        const assignedUserId = Number.parseInt(String(assignedUserIdRaw || "").trim(), 10);
        const hasAssignedScope = Number.isInteger(assignedUserId) && assignedUserId > 0;
        if (vipReadScope !== "all" && !hasAssignedScope) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const items = hasAssignedScope
          ? collectVipTeacherOptionsFromClassAssignments(await getVipClassAssignmentOptions({
            organizationId: authContext.organizationId,
            assignedUserId,
            limit: 1000
          }))
          : await getVipAttendanceTeachersByOrganization(authContext.organizationId);
        return reply.send({
          items: (Array.isArray(items) ? items : []).map((item) => ({
            id: String(item?.id || "").trim(),
            name: String(item?.name || "").trim()
          })).filter((item) => Boolean(item.id))
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP assignment migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching VIP attendance teachers");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/vip-attendance/history",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const fromRaw = String(
        request.query?.from
        ?? request.query?.fromDate
        ?? request.query?.from_date
        ?? ""
      ).trim();
      const toRaw = String(
        request.query?.to
        ?? request.query?.toDate
        ?? request.query?.to_date
        ?? ""
      ).trim();
      const fromDate = fromRaw ? fromRaw : null;
      const toDate = toRaw ? toRaw : null;
      if (fromDate && !isValidDateYmd(fromDate)) {
        return reply.status(400).send({ field: "from", message: "From date must be YYYY-MM-DD." });
      }
      if (toDate && !isValidDateYmd(toDate)) {
        return reply.status(400).send({ field: "to", message: "To date must be YYYY-MM-DD." });
      }
      if (fromDate && toDate && fromDate > toDate) {
        return reply.status(400).send({ field: "from", message: "From date must be earlier than To date." });
      }

      const classId = parsePositiveInteger(request.query?.classId ?? request.query?.class_id);
      const teacherId = parsePositiveInteger(request.query?.teacherId ?? request.query?.teacher_id);
      const tutorId = parsePositiveInteger(request.query?.tutorId ?? request.query?.tutor_id);
      const clientId = parsePositiveInteger(request.query?.clientId ?? request.query?.client_id);
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 3000) : 1000;

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "statistics.class_attendance")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const [usesAdvancedMenuPermissions, canReadStatistics, vipPermissions] = await Promise.all([
          hasAdvancedAppointmentMenuPermissions(requester.role_id),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_STATISTICS_CLASS_ATTENDANCE),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        if (usesAdvancedMenuPermissions && !canReadStatistics) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserIdRaw = vipReadScope === "all"
          ? null
          : authContext.userId;
        const assignedUserId = Number.parseInt(String(assignedUserIdRaw || "").trim(), 10);
        const hasAssignedScope = Number.isInteger(assignedUserId) && assignedUserId > 0;
        if (vipReadScope !== "all" && !hasAssignedScope) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [rows, classOptions, teacherOptions, clientOptions, assignmentOptions] = await Promise.all([
          getVipAttendanceHistory({
            organizationId: authContext.organizationId,
            fromDate,
            toDate,
            classId: classId || null,
            teacherId: teacherId || null,
            tutorId: tutorId || null,
            clientId: clientId || null,
            assignedUserId: hasAssignedScope ? assignedUserId : null,
            limit
          }),
          getVipClassAssignmentOptions({
            organizationId: authContext.organizationId,
            assignedUserId: hasAssignedScope ? assignedUserId : null,
            limit: 1000
          }),
          hasAssignedScope
            ? Promise.resolve([])
            : getVipAttendanceTeachersByOrganization(authContext.organizationId),
          hasAssignedScope
            ? Promise.resolve([])
            : getVipClientOptionsByOrganization({
              organizationId: authContext.organizationId,
              limit: 2000
            }),
          hasAssignedScope
            ? Promise.resolve({ tutors: [] })
            : getVipAssignmentOptionsByOrganization(authContext.organizationId)
        ]);
        const historyRows = Array.isArray(rows) ? rows : [];
        const scopedTeachers = Array.from(
          historyRows.reduce((map, row) => {
            const id = String(row?.teacher_user_id || "").trim();
            if (!id || map.has(id)) {
              return map;
            }
            map.set(id, {
              id,
              name: String(row?.teacher_name || "").trim()
            });
            return map;
          }, new Map()).values()
        );
        const scopedTutors = Array.from(
          historyRows.reduce((map, row) => {
            const id = String(row?.tutor_user_id || "").trim();
            if (!id || map.has(id)) {
              return map;
            }
            map.set(id, {
              id,
              name: String(row?.tutor_name || "").trim()
            });
            return map;
          }, new Map()).values()
        );
        const scopedClients = Array.from(
          historyRows.reduce((map, row) => {
            const id = String(row?.client_id || "").trim();
            if (!id || map.has(id)) {
              return map;
            }
            map.set(id, {
              id,
              firstName: String(row?.first_name || "").trim(),
              lastName: String(row?.last_name || "").trim(),
              middleName: String(row?.middle_name || "").trim()
            });
            return map;
          }, new Map()).values()
        );

        return reply.send({
          items: historyRows.map(mapVipAttendanceHistoryRecord),
          classes: (Array.isArray(classOptions) ? classOptions : [])
            .map((item) => ({
              id: String(item?.id || "").trim(),
              className: String(item?.class_name || item?.className || "").trim(),
              teacherId: String(item?.teacher_user_id || item?.teacherId || "").trim(),
              teacherName: String(item?.teacher_name || item?.teacherName || "").trim()
            }))
            .filter((item) => Boolean(item.id)),
          teachers: hasAssignedScope
            ? scopedTeachers
            : (Array.isArray(teacherOptions) ? teacherOptions : [])
              .map((item) => ({
                id: String(item?.id || "").trim(),
                name: String(item?.name || "").trim()
              }))
              .filter((item) => Boolean(item.id)),
          tutors: hasAssignedScope
            ? scopedTutors
            : (Array.isArray(assignmentOptions?.tutors) ? assignmentOptions.tutors : [])
              .map((item) => ({
                id: String(item?.id || "").trim(),
                name: String(item?.name || "").trim()
              }))
              .filter((item) => Boolean(item.id)),
          clients: hasAssignedScope
            ? scopedClients
            : (Array.isArray(clientOptions) ? clientOptions : [])
              .map((item) => ({
                id: String(item?.id || "").trim(),
                firstName: String(item?.first_name || item?.firstName || "").trim(),
                lastName: String(item?.last_name || item?.lastName || "").trim(),
                middleName: String(item?.middle_name || item?.middleName || "").trim()
              }))
              .filter((item) => Boolean(item.id))
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP attendance migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching VIP attendance history");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/vip-norm-monitoring",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "vip_clients.norm_monitoring")) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const vipPermissions = await getVipClientsPermissionSnapshot(requester.role_id);
        if (!vipPermissions.canAccessNormMonitoring) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const monitoringRows = await getVipNormMonitoringRows({
          organizationId: authContext.organizationId,
          assignedUserId: null,
          limit: 5000
        });
        const monitoringItems = (Array.isArray(monitoringRows) ? monitoringRows : []).map(mapVipNormMonitoringRecord);

        const clientMap = new Map();
        const classMap = new Map();
        const positionMap = new Map();
        const specialistMap = new Map();

        monitoringItems.forEach((item) => {
          const clientId = String(item?.clientId || "").trim();
          if (clientId && !clientMap.has(clientId)) {
            clientMap.set(clientId, {
              id: clientId,
              firstName: String(item?.firstName || "").trim(),
              lastName: String(item?.lastName || "").trim(),
              middleName: String(item?.middleName || "").trim()
            });
          }

          const classId = String(item?.classId || "").trim();
          if (classId && !classMap.has(classId)) {
            classMap.set(classId, {
              id: classId,
              className: String(item?.className || "").trim()
            });
          }

          const positionId = String(item?.positionId || "").trim();
          if (positionId && !positionMap.has(positionId)) {
            positionMap.set(positionId, {
              id: positionId,
              label: String(item?.positionLabel || "").trim()
            });
          }

          (Array.isArray(item?.specialists) ? item.specialists : []).forEach((specialist) => {
            const id = String(specialist?.id || "").trim();
            if (!id || specialistMap.has(id)) {
              return;
            }
            specialistMap.set(id, {
              id,
              name: String(specialist?.name || "").trim()
            });
          });
        });

        return reply.send({
          items: monitoringItems,
          clients: Array.from(clientMap.values()),
          classes: Array.from(classMap.values())
            .sort((left, right) => String(left?.className || "").localeCompare(String(right?.className || ""), undefined, { sensitivity: "base" })),
          positions: Array.from(positionMap.values())
            .sort((left, right) => String(left?.label || "").localeCompare(String(right?.label || ""), undefined, { sensitivity: "base" })),
          specialists: Array.from(specialistMap.values())
            .sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || ""), undefined, { sensitivity: "base" }))
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP assignment migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching VIP norm monitoring");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/vip-class-assignments",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "assignments.class")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const [canReadClients, assignmentsPermissions, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getAssignmentsPermissionSnapshot(requester.role_id),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const canReadAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? assignmentsPermissions.canReadClassAssignments
          : (canReadClients && isDirectorLikeRequester(requester));
        if (!canReadAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserId = vipReadScope === "all"
          ? null
          : authContext.userId;

        const [rows, options] = await Promise.all([
          getVipClassAssignments({
            organizationId: authContext.organizationId,
            assignedUserId,
            limit
          }),
          assignedUserId
            ? Promise.resolve(null)
            : getVipAssignmentOptionsByOrganization(authContext.organizationId)
        ]);

        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipClassAssignmentRecord),
          teachers: assignedUserId
            ? collectVipTeacherOptionsFromClassAssignments(rows)
            : (Array.isArray(options?.teachers) ? options.teachers : []).map((item) => ({
              id: String(item?.id || "").trim(),
              name: String(item?.name || "").trim()
            })).filter((item) => Boolean(item.id))
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP assignment migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching VIP class assignments");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/vip-class-assignments/history",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const classIdParam = Number.parseInt(
        String(request.query?.classId || request.query?.class_id || ""),
        10
      );
      const classId = Number.isInteger(classIdParam) && classIdParam > 0 ? classIdParam : null;
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "assignments.class")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const [canReadClients, assignmentsPermissions, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getAssignmentsPermissionSnapshot(requester.role_id),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const canReadAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? assignmentsPermissions.canReadClassAssignments
          : (canReadClients && isDirectorLikeRequester(requester));
        if (!canReadAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserId = vipReadScope === "all"
          ? null
          : authContext.userId;

        const rows = await getVipClassAssignmentHistory({
          organizationId: authContext.organizationId,
          classId,
          assignedUserId,
          limit
        });
        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipClassAssignmentHistoryRecord)
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP assignment migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching VIP class assignment history");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.put(
    "/vip-class-assignments",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const payload = request.body && typeof request.body === "object" ? request.body : {};

      const classId = parsePositiveInteger(payload?.classId ?? payload?.class_id);
      const className = String(payload?.className ?? payload?.class_name ?? "").trim();
      if (!className) {
        return reply.status(400).send({ field: "className", message: "Class is required." });
      }
      if (className.length > 64) {
        return reply.status(400).send({ field: "className", message: "Class is too long (max 64)." });
      }

      const teacherId = parsePositiveInteger(payload?.teacherId ?? payload?.teacher_id);
      if (!teacherId) {
        return reply.status(400).send({ field: "teacherId", message: "Educator is required." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "assignments.class")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const [canUpdateClients, assignmentsPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE),
          getAssignmentsPermissionSnapshot(requester.role_id)
        ]);
        const isEditMode = Boolean(classId);
        const canWriteAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (
            assignmentsPermissions.canReadClassAssignments
            && (
              isEditMode
                ? assignmentsPermissions.canUpdateClassAssignments
                : assignmentsPermissions.canCreateClassAssignments
            )
          )
          : (canUpdateClients && isDirectorLikeRequester(requester));
        if (!canWriteAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const options = await getVipAssignmentOptionsByOrganization(authContext.organizationId);
        const teacherAllowed = (Array.isArray(options?.teachers) ? options.teachers : [])
          .some((item) => Number.parseInt(String(item?.id || ""), 10) === teacherId);
        if (!teacherAllowed) {
          return reply.status(400).send({ field: "teacherId", message: "Selected educator is not allowed." });
        }

        const item = await upsertVipClassAssignment({
          organizationId: authContext.organizationId,
          classId: classId || null,
          className,
          teacherUserId: teacherId,
          updatedBy: authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "Class not found." });
        }

        return reply.send({
          message: classId ? "Class updated." : "Class saved.",
          item: mapVipClassAssignmentRecord(item)
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "className", message: "Class already exists." });
        }
        if (sendMigrationRequired(reply, error, "VIP assignment migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error saving VIP class assignment");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/vip-class-assignments/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const classId = parsePositiveInteger(request.params?.id);
      if (!classId) {
        return reply.status(400).send({ message: "Invalid class id." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "assignments.class")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const [canUpdateClients, assignmentsPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE),
          getAssignmentsPermissionSnapshot(requester.role_id)
        ]);
        const canDeleteAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (
            assignmentsPermissions.canReadClassAssignments
            && assignmentsPermissions.canDeleteClassAssignments
          )
          : (canUpdateClients && isDirectorLikeRequester(requester));
        if (!canDeleteAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const result = await deleteVipClassAssignment({
          organizationId: authContext.organizationId,
          classId
        });
        if ((result?.rowCount || 0) === 0) {
          return reply.status(404).send({ message: "Class not found." });
        }
        return reply.send({ message: "Class deleted." });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Class is used in tutor assignments." });
        }
        if (sendMigrationRequired(reply, error, "VIP assignment migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error deleting VIP class assignment");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/vip-tutor-assignments",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        const hasTutorAssignmentsFeature = requesterHasOrgFeature(requester, "assignments.tutor");
        const hasMyClassFeature = requesterHasOrgFeature(requester, "vip_clients.my_class");
        if (!hasTutorAssignmentsFeature && !hasMyClassFeature) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const [canReadClients, assignmentsPermissions, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getAssignmentsPermissionSnapshot(requester.role_id),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const canAccessMyClass = hasMyClassFeature
          && vipPermissions.canAccessMyClass;
        const canReadAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (assignmentsPermissions.canReadTutorAssignments || canAccessMyClass)
          : (canReadClients && isDirectorLikeRequester(requester));
        if (!canReadAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserId = vipReadScope === "all"
          ? null
          : authContext.userId;

        const [rows, classOptions, options] = await Promise.all([
          getVipTutorAssignments({
            organizationId: authContext.organizationId,
            assignedUserId,
            limit
          }),
          getVipClassAssignmentOptions({
            organizationId: authContext.organizationId,
            assignedUserId
          }),
          assignedUserId
            ? Promise.resolve(null)
            : getVipAssignmentOptionsByOrganization(authContext.organizationId)
        ]);

        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipTutorAssignmentRecord),
          classes: (Array.isArray(classOptions) ? classOptions : []).map((item) => ({
            id: String(item?.id || "").trim(),
            className: String(item?.class_name || item?.className || "").trim(),
            teacherId: String(item?.teacher_user_id || item?.teacherId || "").trim(),
            teacherName: String(item?.teacher_name || item?.teacherName || "").trim()
          })).filter((item) => Boolean(item.id)),
          tutors: assignedUserId
            ? collectVipTutorOptionsFromTutorAssignments(rows)
            : (Array.isArray(options?.tutors) ? options.tutors : []).map((item) => ({
              id: String(item?.id || "").trim(),
              name: String(item?.name || "").trim()
            })).filter((item) => Boolean(item.id))
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP assignment migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching VIP tutor assignments");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/vip-tutor-assignments/history",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const clientIdParam = Number.parseInt(String(request.query?.clientId || request.query?.client_id || ""), 10);
      const clientId = Number.isInteger(clientIdParam) && clientIdParam > 0 ? clientIdParam : null;
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "assignments.tutor")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const [canReadClients, assignmentsPermissions, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getAssignmentsPermissionSnapshot(requester.role_id),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const canReadAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? assignmentsPermissions.canReadTutorAssignments
          : (canReadClients && isDirectorLikeRequester(requester));
        if (!canReadAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserId = vipReadScope === "all"
          ? null
          : authContext.userId;

        const rows = await getVipTutorAssignmentHistory({
          organizationId: authContext.organizationId,
          clientId,
          assignedUserId,
          limit
        });
        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipTutorAssignmentHistoryRecord)
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP assignment migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching VIP tutor assignment history");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.put(
    "/vip-tutor-assignments",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const payload = request.body && typeof request.body === "object" ? request.body : {};

      const clientId = parsePositiveInteger(payload?.clientId ?? payload?.client_id);
      if (!clientId) {
        return reply.status(400).send({ field: "clientId", message: "Client is required." });
      }

      const classId = parsePositiveInteger(
        payload?.classId
        ?? payload?.class_id
        ?? payload?.classAssignmentId
        ?? payload?.class_assignment_id
      );
      if (!classId) {
        return reply.status(400).send({ field: "classId", message: "Class is required." });
      }

      const tutorId = parsePositiveInteger(payload?.tutorId ?? payload?.tutor_id);
      if (!tutorId) {
        return reply.status(400).send({ field: "tutorId", message: "Tutor is required." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "assignments.tutor")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const [canUpdateClients, assignmentsPermissions, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE),
          getAssignmentsPermissionSnapshot(requester.role_id),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const existingAssignment = await findVipTutorAssignmentByClientId({
          organizationId: authContext.organizationId,
          clientId
        });
        const isEditMode = Boolean(existingAssignment);
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserId = vipReadScope === "all"
          ? null
          : parsePositiveInteger(authContext.userId);
        const canWriteAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (
            assignmentsPermissions.canReadTutorAssignments
            && (
              isEditMode
                ? assignmentsPermissions.canUpdateTutorAssignments
                : assignmentsPermissions.canCreateTutorAssignments
            )
          )
          : (canUpdateClients && isDirectorLikeRequester(requester));
        if (!canWriteAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (assignedUserId && isEditMode) {
          const canManageExistingAssignment = await isVipClientAssignedToUser({
            organizationId: authContext.organizationId,
            clientId,
            userId: assignedUserId
          });
          if (!canManageExistingAssignment) {
            return reply.status(403).send({ message: "Forbidden." });
          }
        }

        const [classOptions, options] = await Promise.all([
          getVipClassAssignmentOptions({
            organizationId: authContext.organizationId,
            assignedUserId
          }),
          getVipAssignmentOptionsByOrganization(authContext.organizationId)
        ]);
        const classAllowed = (Array.isArray(classOptions) ? classOptions : [])
          .some((item) => Number.parseInt(String(item?.id || ""), 10) === classId);
        if (!classAllowed) {
          return reply.status(400).send({ field: "classId", message: "Selected class is not allowed." });
        }
        const tutorAllowed = (Array.isArray(options?.tutors) ? options.tutors : [])
          .some((item) => Number.parseInt(String(item?.id || ""), 10) === tutorId);
        if (!tutorAllowed) {
          return reply.status(400).send({ field: "tutorId", message: "Selected tutor is not allowed." });
        }

        const item = await upsertVipTutorAssignment({
          organizationId: authContext.organizationId,
          clientId,
          classAssignmentId: classId,
          tutorUserId: tutorId,
          updatedBy: authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "VIP client or class not found." });
        }

        return reply.send({
          message: isEditMode ? "VIP tutor assignment updated." : "VIP tutor assignment saved.",
          item: mapVipTutorAssignmentRecord({
            id: String(clientId),
            ...item
          })
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP assignment migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error updating VIP tutor assignment");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/vip-class-daily-routines",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const classId = parsePositiveInteger(request.query?.classId ?? request.query?.class_id);
      const dayOfWeekRaw = request.query?.dayOfWeek ?? request.query?.day_of_week ?? request.query?.day ?? "";
      const dayOfWeek = normalizeVipDailyRoutineDayOfWeek(dayOfWeekRaw, { allowAliases: true });
      if (String(dayOfWeekRaw || "").trim() && !dayOfWeek) {
        return reply.status(400).send({ field: "dayOfWeek", message: "Day of week must be between 1 and 7." });
      }

      const includeInactiveRaw = request.query?.includeInactive ?? request.query?.include_inactive;
      const includeInactiveParsed = includeInactiveRaw === undefined
        ? true
        : parseNullableBoolean(includeInactiveRaw);
      if (includeInactiveRaw !== undefined && includeInactiveParsed === null) {
        return reply.status(400).send({
          field: "includeInactive",
          message: "includeInactive must be boolean."
        });
      }
      const includeInactive = includeInactiveParsed !== false;
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 3000) : 1000;

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "vip_clients.daily_routines")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipPermissions = await getVipClientsPermissionSnapshot(requester.role_id);
        const canReadVipClassDailyRoutines = (
          (vipPermissions.canAccessDailyRoutines && vipPermissions.canReadVipClients)
          || vipPermissions.canAccessMyChildren
        );
        if (!canReadVipClassDailyRoutines) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserId = vipReadScope === "all"
          ? null
          : authContext.userId;

        const [rows, classOptions, specialistOptions] = await Promise.all([
          getVipClassDailyRoutines({
            organizationId: authContext.organizationId,
            classId: classId || null,
            dayOfWeek: dayOfWeek || null,
            assignedUserId,
            limit
          }),
          getVipClassAssignmentOptions({
            organizationId: authContext.organizationId,
            assignedUserId,
            limit: 2000
          }),
          getVipClassDailyRoutineSpecialists({
            organizationId: authContext.organizationId,
            assignedUserId,
            limit: 3000
          })
        ]);

        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipClassDailyRoutineRecord),
          classes: (Array.isArray(classOptions) ? classOptions : [])
            .map((item) => ({
              id: String(item?.id || "").trim(),
              className: String(item?.class_name || item?.className || "").trim(),
              teacherId: String(item?.teacher_user_id || item?.teacherId || "").trim(),
              teacherName: String(item?.teacher_name || item?.teacherName || "").trim()
            }))
            .filter((item) => Boolean(item.id)),
          specialists: (Array.isArray(specialistOptions) ? specialistOptions : [])
            .map((item) => ({
              classId: String(item?.class_assignment_id || item?.classId || "").trim(),
              specialistId: String(item?.specialist_user_id || item?.specialistId || "").trim(),
              specialistName: String(item?.specialist_name || item?.specialistName || "").trim(),
              specialistRole: String(item?.specialist_role || item?.specialistRole || "").trim()
            }))
            .filter((item) => Boolean(item.classId) && Boolean(item.specialistId))
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP class daily routine migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching VIP class daily routines");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.put(
    "/vip-class-daily-routines",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const payload = request.body && typeof request.body === "object" ? request.body : {};

      const routineId = parsePositiveInteger(payload?.id ?? payload?.routineId ?? payload?.routine_id);
      const classId = parsePositiveInteger(
        payload?.classId
        ?? payload?.class_id
        ?? payload?.classAssignmentId
        ?? payload?.class_assignment_id
      );
      if (!classId) {
        return reply.status(400).send({ field: "classId", message: "Class is required." });
      }
      const specialistId = parsePositiveInteger(
        payload?.specialistId
        ?? payload?.specialist_id
        ?? payload?.specialistUserId
        ?? payload?.specialist_user_id
      );

      const dayOfWeek = normalizeVipDailyRoutineDayOfWeek(
        payload?.dayOfWeek
        ?? payload?.day_of_week
        ?? payload?.day
        ?? payload?.dayKey
        ?? payload?.day_key,
        { allowAliases: true }
      );
      if (!dayOfWeek) {
        return reply.status(400).send({
          field: "dayOfWeek",
          message: "Day of week must be between 1 and 7."
        });
      }

      const activityType = normalizeVipClassDailyRoutineActivityType(
        payload?.activityType
        ?? payload?.activity_type
        ?? payload?.type,
        { allowAliases: true }
      );
      if (!activityType) {
        return reply.status(400).send({
          field: "activityType",
          message: "Activity type must be lesson, breakfast, lunch, afternoon-snack, sleep or other."
        });
      }

      const startTime = normalizeTimeHm(payload?.startTime ?? payload?.start_time);
      const endTime = normalizeTimeHm(payload?.endTime ?? payload?.end_time);
      if (!startTime) {
        return reply.status(400).send({ field: "startTime", message: "Start time must be HH:mm." });
      }
      if (!endTime) {
        return reply.status(400).send({ field: "endTime", message: "End time must be HH:mm." });
      }
      const startMinutes = toTimeMinutes(startTime);
      const endMinutes = toTimeMinutes(endTime);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return reply.status(400).send({
          field: "endTime",
          message: "End time must be later than start time."
        });
      }

      const mandatoryExercises = String(payload?.mandatoryExercises ?? payload?.mandatory_exercises ?? "").trim();
      if (mandatoryExercises.length > 500) {
        return reply.status(400).send({
          field: "mandatoryExercises",
          message: "Mandatory exercises are too long (max 500)."
        });
      }
      const note = String(payload?.note || "").trim();
      if (note.length > 255) {
        return reply.status(400).send({ field: "note", message: "Note is too long (max 255)." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "vip_clients.daily_routines")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipPermissions = await getVipClientsPermissionSnapshot(requester.role_id);
        const isEditMode = Boolean(routineId);
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserId = vipReadScope === "all"
          ? null
          : parsePositiveInteger(authContext.userId);
        const canWriteVipClassDailyRoutines = (
          vipPermissions.canAccessDailyRoutines
          && vipPermissions.canReadVipClients
          && (isEditMode ? vipPermissions.canUpdateVipClients : vipPermissions.canCreateVipClients)
        );
        if (!canWriteVipClassDailyRoutines) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (assignedUserId && isEditMode) {
          const existingRoutine = await findVipClassDailyRoutineById({
            organizationId: authContext.organizationId,
            routineId
          });
          if (!existingRoutine) {
            return reply.status(404).send({ message: "Class or routine not found." });
          }
          const canManageExistingRoutine = await isVipClassAssignedToUser({
            organizationId: authContext.organizationId,
            classId: existingRoutine.class_assignment_id,
            userId: assignedUserId
          });
          if (!canManageExistingRoutine) {
            return reply.status(403).send({ message: "Forbidden." });
          }
        }
        if (assignedUserId) {
          const classAllowed = await isVipClassAssignedToUser({
            organizationId: authContext.organizationId,
            classId,
            userId: assignedUserId
          });
          if (!classAllowed) {
            return reply.status(400).send({ field: "classId", message: "Selected class is not allowed." });
          }
        }
        if (specialistId) {
          const allowedSpecialists = await getVipClassDailyRoutineSpecialists({
            organizationId: authContext.organizationId,
            classId,
            assignedUserId,
            limit: 200
          });
          const isAllowedSpecialist = (Array.isArray(allowedSpecialists) ? allowedSpecialists : []).some(
            (item) => (
              String(item?.class_assignment_id || "").trim() === String(classId)
              && String(item?.specialist_user_id || "").trim() === String(specialistId)
            )
          );
          if (!isAllowedSpecialist) {
            return reply.status(400).send({ field: "specialistId", message: "Selected specialist is not allowed for this class." });
          }

          const hasRoutineConflict = await findVipClassDailyRoutineConflictForSpecialist({
            organizationId: authContext.organizationId,
            routineId,
            specialistId,
            dayOfWeek,
            startTime,
            endTime
          });
          if (hasRoutineConflict) {
            const conflictClassName = String(hasRoutineConflict?.className || "").trim();
            const conflictStart = String(hasRoutineConflict?.startTime || "").trim();
            const conflictEnd = String(hasRoutineConflict?.endTime || "").trim();
            const conflictActivityType = String(hasRoutineConflict?.activityType || "").trim().replace(/-/g, " ");
            const conflictDetails = [
              conflictClassName,
              conflictStart && conflictEnd ? `${conflictStart}-${conflictEnd}` : "",
              conflictActivityType ? `(${conflictActivityType})` : ""
            ].filter(Boolean).join(" ");
            return reply.status(409).send({
              message: conflictDetails
                ? `The selected specialist already has another VIP daily routine at this time: ${conflictDetails}.`
                : "The selected specialist already has another VIP daily routine at this time."
            });
          }

          const hasAppointmentConflict = await hasAppointmentConflictForVipRoutine({
            organizationId: authContext.organizationId,
            classId,
            specialistId,
            dayOfWeek,
            startTime,
            endTime
          });
          if (hasAppointmentConflict) {
            const conflictDate = String(hasAppointmentConflict?.appointmentDate || "").trim();
            const conflictStart = String(hasAppointmentConflict?.startTime || "").trim();
            const conflictEnd = String(hasAppointmentConflict?.endTime || "").trim();
            const conflictClientName = String(hasAppointmentConflict?.clientName || "").trim();
            const conflictDetails = [
              conflictDate,
              conflictStart && conflictEnd ? `${conflictStart}-${conflictEnd}` : "",
              conflictClientName ? `(${conflictClientName})` : ""
            ].filter(Boolean).join(" ");
            return reply.status(409).send({
              message: conflictDetails
                ? `The selected specialist already has an appointment at this time: ${conflictDetails}.`
                : "The selected specialist already has an appointment at this time."
            });
          }

          const hasBreakConflict = await hasBreakConflictForVipRoutine({
            organizationId: authContext.organizationId,
            classId,
            specialistId,
            dayOfWeek,
            startTime,
            endTime
          });
          if (hasBreakConflict) {
            return reply.status(409).send({
              message: "This time slot conflicts with a scheduled break for the selected specialist."
            });
          }

          const hasAbsenceConflict = await hasWorkScheduleAbsenceForVipRoutine({
            organizationId: authContext.organizationId,
            specialistId,
            dayOfWeek
          });
          if (hasAbsenceConflict) {
            return reply.status(409).send({
              message: "The selected specialist is marked as unavailable on this day of week."
            });
          }
        }

        const item = await upsertVipClassDailyRoutine({
          organizationId: authContext.organizationId,
          routineId: routineId || null,
          classId,
          specialistId: specialistId || null,
          dayOfWeek,
          activityType,
          startTime,
          endTime,
          mandatoryExercises,
          note,
          updatedBy: authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "Class or routine not found." });
        }

        return reply.send({
          message: routineId ? "VIP class daily routine updated." : "VIP class daily routine saved.",
          item: mapVipClassDailyRoutineRecord(item)
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({
            field: "time",
            message: "A routine with the same time slot already exists."
          });
        }
        if (error?.code === "23514" || error?.code === "22P02") {
          return reply.status(400).send({ message: "Invalid daily routine data." });
        }
        if (sendMigrationRequired(reply, error, "VIP class daily routine migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error saving VIP class daily routine");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/vip-class-daily-routines/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const routineId = parsePositiveInteger(request.params?.id);
      if (!routineId) {
        return reply.status(400).send({ message: "Invalid routine id." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "vip_clients.daily_routines")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipPermissions = await getVipClientsPermissionSnapshot(requester.role_id);
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserId = vipReadScope === "all"
          ? null
          : parsePositiveInteger(authContext.userId);
        const canDeleteVipClassDailyRoutines = (
          vipPermissions.canAccessDailyRoutines
          && vipPermissions.canReadVipClients
          && vipPermissions.canDeleteVipClients
        );
        if (!canDeleteVipClassDailyRoutines) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (assignedUserId) {
          const existingRoutine = await findVipClassDailyRoutineById({
            organizationId: authContext.organizationId,
            routineId
          });
          if (!existingRoutine) {
            return reply.status(404).send({ message: "Routine not found." });
          }
          const canManageExistingRoutine = await isVipClassAssignedToUser({
            organizationId: authContext.organizationId,
            classId: existingRoutine.class_assignment_id,
            userId: assignedUserId
          });
          if (!canManageExistingRoutine) {
            return reply.status(403).send({ message: "Forbidden." });
          }
        }

        const result = await deleteVipClassDailyRoutine({
          organizationId: authContext.organizationId,
          routineId
        });
        if ((result?.rowCount || 0) === 0) {
          return reply.status(404).send({ message: "Routine not found." });
        }
        return reply.send({ message: "VIP class daily routine deleted." });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP class daily routine migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error deleting VIP class daily routine");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/search",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;

      const clientId = parsePositiveInteger(request.query?.clientId ?? request.query?.client_id);
      const firstName = String(request.query?.firstName || "").trim();
      const lastName = String(request.query?.lastName || "").trim();
      const middleName = String(request.query?.middleName || "").trim();
      const isVip = parseNullableBoolean(request.query?.isVip ?? request.query?.is_vip);
      const assignmentScope = String(
        request.query?.assignmentScope
        ?? request.query?.scope
        ?? ""
      ).trim().toLowerCase();
      const mineOnly = assignmentScope === "mine"
        || parseNullableBoolean(request.query?.mineOnly ?? request.query?.onlyMine) === true;
      const attendanceDateRaw = String(request.query?.attendanceDate ?? request.query?.attendance_date ?? "").trim();
      const attendanceDate = attendanceDateRaw
        ? (isValidDateYmd(attendanceDateRaw) ? attendanceDateRaw : getTodayYmd())
        : null;
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;

      const combinedLength = `${firstName}${lastName}${middleName}`.length;
      const isVipOnlySearch = isVip === true;
      const useMyChildrenCache = (
        mineOnly
        && isVipOnlySearch
        && !firstName
        && !lastName
        && !middleName
      );
      if (!clientId && !isVipOnlySearch && combinedLength < 3) {
        return reply.send({ items: [] });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        const [canReadClients, canSearchAppointmentClients, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_CLIENT_SEARCH),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const canSearchVipClients = vipPermissions.canReadVipClients;
        const canSearchMyChildren = vipPermissions.canAccessMyChildren;
        if (isVipOnlySearch && !canSearchVipClients && !(mineOnly && canSearchMyChildren)) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (!isVipOnlySearch && !canReadClients && !canSearchAppointmentClients) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const shouldRestrictVipAttendanceToAssignments = (
          isVipOnlySearch
          && Boolean(attendanceDate)
          && vipReadScope !== "all"
        );
        const assignedUserId = (
          isVipOnlySearch
          && (mineOnly || shouldRestrictVipAttendanceToAssignments)
        )
          ? authContext.userId
          : null;
        const cacheKey = useMyChildrenCache
          ? [
            `org:${authContext.organizationId}`,
            `user:${authContext.userId}`,
            `attendance:${attendanceDate || "none"}`,
            `limit:${limit}`
          ].join("|")
          : "";
        if (cacheKey) {
          const cachedItems = myChildrenSearchCache.get(cacheKey);
          if (cachedItems) {
            return reply.send({ items: cachedItems });
          }
        }

        const rows = await searchClientsForSchedule({
          organizationId: authContext.organizationId,
          clientId,
          firstName,
          lastName,
          middleName,
          isVip,
          attendanceDate,
          assignedUserId,
          limit
        });
        const items = rows.map(mapClient);
        if (cacheKey) {
          myChildrenSearchCache.set(cacheKey, items);
        }

        return reply.send({
          items
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error searching clients");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.put(
    "/vip-attendance",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const payload = request.body && typeof request.body === "object" ? request.body : {};

      const clientId = parsePositiveInteger(payload?.clientId);
      if (!clientId) {
        return reply.status(400).send({ field: "clientId", message: "Client is required." });
      }

      const resetAttendance = parseNullableBoolean(payload?.reset ?? payload?.clear) === true;
      const statusRaw = String(payload?.status || "").trim().toLowerCase();
      const status = statusRaw === "present" || statusRaw === "absent"
        ? statusRaw
        : "";
      if (!resetAttendance && !status) {
        return reply.status(400).send({ field: "status", message: "Status must be present or absent." });
      }
      const markLeft = parseNullableBoolean(payload?.markLeft ?? payload?.mark_left) === true;
      if (!resetAttendance && markLeft && status !== "present") {
        return reply.status(400).send({ field: "markLeft", message: "Left time can be set only for present status." });
      }

      const arrivedAtResult = parseAttendanceDateTime(payload?.arrivedAt ?? payload?.arrived_at);
      if (!resetAttendance && arrivedAtResult.error) {
        return reply.status(400).send({ field: "arrivedAt", message: arrivedAtResult.error });
      }
      const leftAtResult = parseAttendanceDateTime(payload?.leftAt ?? payload?.left_at);
      if (!resetAttendance && leftAtResult.error) {
        return reply.status(400).send({ field: "leftAt", message: leftAtResult.error });
      }
      const arrivedAt = arrivedAtResult.value;
      const leftAt = leftAtResult.value;

      if (!resetAttendance && status === "absent" && (arrivedAt || leftAt)) {
        return reply.status(400).send({ field: "status", message: "Absent status cannot have arrival or departure time." });
      }
      if (!resetAttendance && status === "present" && leftAt && !arrivedAt) {
        return reply.status(400).send({ field: "arrivedAt", message: "Arrival time is required when departure time is set." });
      }
      if (!resetAttendance && status === "present" && arrivedAt && leftAt && leftAt < arrivedAt) {
        return reply.status(400).send({ field: "leftAt", message: "Departure time must be later than arrival time." });
      }

      const attendanceDateRaw = String(payload?.attendanceDate ?? payload?.attendance_date ?? "").trim();
      const attendanceDate = isValidDateYmd(attendanceDateRaw)
        ? attendanceDateRaw
        : getTodayYmd();

      const note = String(payload?.note || "").trim();
      if (!resetAttendance && note.length > 128) {
        return reply.status(400).send({ field: "note", message: "Reason is too long (max 128)." });
      }
      if (!resetAttendance && status === "absent" && !note) {
        return reply.status(400).send({ field: "note", message: "Reason is required for absent." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "vip_clients.attendance")) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const vipPermissions = await getVipClientsPermissionSnapshot(requester.role_id);
        const existingAttendance = resetAttendance
          ? null
          : await findVipClientAttendanceByDate({
            organizationId: authContext.organizationId,
            clientId,
            attendanceDate
          });
        const canWriteVipAttendance = resetAttendance
          ? vipPermissions.canDeleteVipClients
          : (existingAttendance ? vipPermissions.canUpdateVipClients : vipPermissions.canCreateVipClients);
        if (!vipPermissions.canReadVipClients || !canWriteVipAttendance) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const vipReadScope = resolveVipClientReadScope(vipPermissions, requester);
        const assignedUserIdRaw = vipReadScope === "all"
          ? null
          : authContext.userId;
        const assignedUserId = Number.parseInt(String(assignedUserIdRaw || "").trim(), 10);
        if (Number.isInteger(assignedUserId) && assignedUserId > 0) {
          const isAssigned = await isVipClientAssignedToUser({
            organizationId: authContext.organizationId,
            clientId,
            userId: assignedUserId
          });
          if (!isAssigned) {
            return reply.status(403).send({ message: "Forbidden." });
          }
        }

        if (resetAttendance) {
          const resetResult = await resetVipClientAttendanceByDate({
            organizationId: authContext.organizationId,
            clientId,
            attendanceDate
          });
          if (!resetResult) {
            return reply.status(404).send({ message: "VIP client not found." });
          }
          return reply.send({
            message: "VIP attendance reset.",
            item: {
              clientId: String(resetResult.client_id || "").trim() || String(clientId),
              attendanceDate,
              attendanceStatus: "",
              arrivedAt: null,
              leftAt: null,
              attendanceNote: "",
              note: ""
            }
          });
        }

        const item = await upsertVipClientAttendance({
          organizationId: authContext.organizationId,
          clientId,
          attendanceDate,
          status,
          note,
          markLeft,
          arrivedAt,
          leftAt,
          updatedBy: authContext.userId
        });

        if (!item) {
          return reply.status(404).send({ message: "VIP client not found." });
        }

        return reply.send({
          message: existingAttendance ? "VIP attendance updated." : "VIP attendance saved.",
          item: mapVipAttendanceRecord(item)
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP attendance migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error updating VIP attendance");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/medical-history",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const pageParam = Number.parseInt(String(request.query?.page || ""), 10);
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const search = String(request.query?.q || "").trim();
      const isVip = parseNullableBoolean(request.query?.isVip ?? request.query?.is_vip);
      const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (
          !requesterHasOrgFeature(requester, "clients.all_clients")
          || !requesterHasOrgFeature(requester, "clients.medical_history")
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [canReadClients, canReadMedicalHistory] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          hasMedicalHistoryPermission(requester, PERMISSIONS.CLIENT_MEDICAL_HISTORY_READ)
        ]);
        if (!canReadClients || !canReadMedicalHistory) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const { total, totalPages, rows, page: safePage } = await getClientMedicalHistoryClientsPage({
          organizationId: authContext.organizationId,
          page,
          limit,
          search,
          isVip
        });

        return reply.send({
          items: rows.map(mapClient),
          pagination: {
            page: safePage,
            limit,
            total,
            totalPages,
            hasPrev: safePage > 1,
            hasNext: safePage < totalPages
          }
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Client medical history migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching client medical history list");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/medical-history/client-options",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 2000) : 1000;

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (
          !requesterHasOrgFeature(requester, "clients.all_clients")
          || !requesterHasOrgFeature(requester, "clients.medical_history")
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [canReadClients, canReadMedicalHistory, canCreateMedicalHistory] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          hasMedicalHistoryPermission(requester, PERMISSIONS.CLIENT_MEDICAL_HISTORY_READ),
          hasMedicalHistoryPermission(requester, PERMISSIONS.CLIENT_MEDICAL_HISTORY_CREATE)
        ]);
        if (!canReadClients || (!canReadMedicalHistory && !canCreateMedicalHistory)) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const rows = await getClientMedicalHistoryClientOptions({
          organizationId: authContext.organizationId,
          limit
        });

        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapClientMedicalHistoryClientOption)
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Client medical history migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching medical history client options");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/:id/medical-history",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const clientId = parsePositiveInteger(request.params?.id);
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

      if (!clientId) {
        return reply.status(400).send({ message: "Invalid client id." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (
          !requesterHasOrgFeature(requester, "clients.all_clients")
          || !requesterHasOrgFeature(requester, "clients.medical_history")
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [canReadClients, canReadMedicalHistory] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          hasMedicalHistoryPermission(requester, PERMISSIONS.CLIENT_MEDICAL_HISTORY_READ)
        ]);
        if (!canReadClients || !canReadMedicalHistory) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const client = await getClientSummaryById({
          organizationId: authContext.organizationId,
          clientId
        });
        if (!client) {
          return reply.status(404).send({ message: "Client not found." });
        }

        const items = await getClientMedicalHistoryEntries({
          organizationId: authContext.organizationId,
          clientId,
          limit
        });

        return reply.send({
          client: mapClientSummary(client),
          items: (Array.isArray(items) ? items : []).map(mapClientMedicalHistoryEntry)
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Client medical history migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching client medical history");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/:id/medical-history",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const clientId = parsePositiveInteger(request.params?.id);
      if (!clientId) {
        return reply.status(400).send({ message: "Invalid client id." });
      }

      const input = normalizeClientMedicalHistoryPayload(request.body);
      const errors = validateClientMedicalHistoryPayload(input);
      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (
          !requesterHasOrgFeature(requester, "clients.all_clients")
          || !requesterHasOrgFeature(requester, "clients.medical_history")
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [canReadClients, canCreateMedicalHistory] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          hasMedicalHistoryPermission(requester, PERMISSIONS.CLIENT_MEDICAL_HISTORY_CREATE)
        ]);
        if (!canReadClients || !canCreateMedicalHistory) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const client = await getClientSummaryById({
          organizationId: authContext.organizationId,
          clientId
        });
        if (!client) {
          return reply.status(404).send({ message: "Client not found." });
        }

        const item = await createClientMedicalHistoryEntry({
          organizationId: authContext.organizationId,
          clientId,
          entryDate: input.entryDate,
          conditionName: input.conditionName,
          symptoms: input.symptoms,
          diagnosis: input.diagnosis,
          treatmentPlan: input.treatmentPlan,
          note: input.note,
          authorUserId: authContext.userId
        });

        if (!item) {
          return reply.status(404).send({ message: "Client not found." });
        }

        return reply.status(201).send({
          message: "Medical history entry created.",
          client: mapClientSummary(client),
          item: mapClientMedicalHistoryEntry(item)
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Client medical history migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error creating client medical history entry");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/:id/medical-history",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const clientId = parsePositiveInteger(request.params?.id);
      if (!clientId) {
        return reply.status(400).send({ message: "Invalid client id." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (
          !requesterHasOrgFeature(requester, "clients.all_clients")
          || !requesterHasOrgFeature(requester, "clients.medical_history")
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [canReadClients, canDeleteMedicalHistory] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          hasMedicalHistoryPermission(requester, PERMISSIONS.CLIENT_MEDICAL_HISTORY_DELETE)
        ]);
        if (!canReadClients || !canDeleteMedicalHistory) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const client = await getClientSummaryById({
          organizationId: authContext.organizationId,
          clientId
        });
        if (!client) {
          return reply.status(404).send({ message: "Client not found." });
        }

        const items = await deleteAllClientMedicalHistoryEntries({
          organizationId: authContext.organizationId,
          clientId
        });

        if (!Array.isArray(items) || items.length === 0) {
          return reply.status(404).send({ message: "Medical history entries not found." });
        }

        return reply.send({
          message: "Client medical history deleted.",
          client: mapClientSummary(client),
          deletedCount: items.length
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Client medical history migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error deleting client medical history");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/:id/medical-history/:entryId",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const clientId = parsePositiveInteger(request.params?.id);
      const entryId = parsePositiveInteger(request.params?.entryId);
      if (!clientId || !entryId) {
        return reply.status(400).send({ message: "Invalid medical history entry id." });
      }

      const input = normalizeClientMedicalHistoryPayload(request.body);
      const errors = validateClientMedicalHistoryPayload(input);
      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (
          !requesterHasOrgFeature(requester, "clients.all_clients")
          || !requesterHasOrgFeature(requester, "clients.medical_history")
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [canReadClients, canUpdateMedicalHistory] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          hasMedicalHistoryPermission(requester, PERMISSIONS.CLIENT_MEDICAL_HISTORY_UPDATE)
        ]);
        if (!canReadClients || !canUpdateMedicalHistory) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const client = await getClientSummaryById({
          organizationId: authContext.organizationId,
          clientId
        });
        if (!client) {
          return reply.status(404).send({ message: "Client not found." });
        }

        const item = await updateClientMedicalHistoryEntry({
          organizationId: authContext.organizationId,
          clientId,
          entryId,
          entryDate: input.entryDate,
          conditionName: input.conditionName,
          symptoms: input.symptoms,
          diagnosis: input.diagnosis,
          treatmentPlan: input.treatmentPlan,
          note: input.note,
          updatedBy: authContext.userId,
          isAdmin: requester.is_admin === true
        });

        if (!item) {
          return reply.status(404).send({ message: "Medical history entry not found." });
        }

        return reply.send({
          message: "Medical history entry updated.",
          client: mapClientSummary(client),
          item: mapClientMedicalHistoryEntry(item)
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Client medical history migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error updating client medical history entry");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/:id/medical-history/:entryId",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const clientId = parsePositiveInteger(request.params?.id);
      const entryId = parsePositiveInteger(request.params?.entryId);
      if (!clientId || !entryId) {
        return reply.status(400).send({ message: "Invalid medical history entry id." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (
          !requesterHasOrgFeature(requester, "clients.all_clients")
          || !requesterHasOrgFeature(requester, "clients.medical_history")
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [canReadClients, canDeleteMedicalHistory] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          hasMedicalHistoryPermission(requester, PERMISSIONS.CLIENT_MEDICAL_HISTORY_DELETE)
        ]);
        if (!canReadClients || !canDeleteMedicalHistory) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const client = await getClientSummaryById({
          organizationId: authContext.organizationId,
          clientId
        });
        if (!client) {
          return reply.status(404).send({ message: "Client not found." });
        }

        const item = await deleteClientMedicalHistoryEntry({
          organizationId: authContext.organizationId,
          clientId,
          entryId,
          deletedBy: authContext.userId,
          isAdmin: requester.is_admin === true
        });

        if (!item) {
          return reply.status(404).send({ message: "Medical history entry not found." });
        }

        return reply.send({
          message: "Medical history entry deleted.",
          client: mapClientSummary(client),
          item
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Client medical history migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error deleting client medical history entry");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;

      const pageParam = Number.parseInt(String(request.query?.page || ""), 10);
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const search = String(request.query?.q || "").trim();
      const historyNameSearch = String(
        request.query?.historyNameSearch ?? request.query?.history_name_search ?? ""
      ).trim();
      const firstName = String(request.query?.firstName || "").trim();
      const lastName = String(request.query?.lastName || "").trim();
      const middleName = String(request.query?.middleName || "").trim();
      const clientId = parsePositiveInteger(request.query?.clientId ?? request.query?.client_id);
      const isVip = parseNullableBoolean(request.query?.isVip ?? request.query?.is_vip);
      const historyDateFrom = String(
        request.query?.historyDateFrom ?? request.query?.history_date_from ?? ""
      ).trim();
      const historyDateTo = String(
        request.query?.historyDateTo ?? request.query?.history_date_to ?? ""
      ).trim();
      const historyPositionId = parsePositiveInteger(
        request.query?.historyPositionId ?? request.query?.history_position_id
      );
      const historySpecialistId = parsePositiveInteger(
        request.query?.historySpecialistId ?? request.query?.history_specialist_id
      );
      const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

      if (historyDateFrom && !isValidDateYmd(historyDateFrom)) {
        return reply.status(400).send({ field: "historyDateFrom", message: "Invalid from date." });
      }
      if (historyDateTo && !isValidDateYmd(historyDateTo)) {
        return reply.status(400).send({ field: "historyDateTo", message: "Invalid to date." });
      }
      if (historyDateFrom && historyDateTo && historyDateFrom > historyDateTo) {
        return reply.status(400).send({ field: "historyDateFrom", message: "From date must be before to date." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "clients.all_clients")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ))) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const { total, totalPages, rows, page: safePage } = await getClientsPage({
          organizationId: authContext.organizationId,
          page,
          limit,
          search,
          historyNameSearch,
          firstName,
          lastName,
          middleName,
          clientId,
          isVip,
          historyDateFrom,
          historyDateTo,
          historyPositionId,
          historySpecialistId
        });

        return reply.send({
          items: rows.map(mapClient),
          pagination: {
            page: safePage,
            limit,
            total,
            totalPages,
            hasPrev: safePage > 1,
            hasNext: safePage < totalPages
          }
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Client medical history migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching clients");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;

      const input = normalizeClientPayload(request.body);
      const errors = validateClientPayload(input);

      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "clients.all_clients")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.CLIENTS_CREATE))) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const item = await createClient({
          organizationId: authContext.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          birthday: input.birthday,
          phone: input.phone,
          tgMail: input.tgMail,
          isVip: input.isVip ?? false,
          note: input.note,
          createdBy: authContext.userId
        });

        return reply.status(201).send({
          message: "Client created.",
          item: mapClient(item)
        });
      } catch (error) {
        request.log.error({ err: error }, "Error creating client");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;

      const id = parsePositiveInteger(request.params?.id);
      if (!id) {
        return reply.status(400).send({ message: "Invalid client id." });
      }

      const input = normalizeClientPayload(request.body);
      const errors = validateClientPayload(input);

      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "clients.all_clients")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE))) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const item = await updateClientById({
          id,
          organizationId: authContext.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          birthday: input.birthday,
          phone: input.phone,
          tgMail: input.tgMail,
          isVip: input.isVip,
          note: input.note,
          updatedBy: authContext.userId
        });

        if (!item) {
          return reply.status(404).send({ message: "Client not found." });
        }

        return reply.send({
          message: "Client updated.",
          item: mapClient(item)
        });
      } catch (error) {
        request.log.error({ err: error }, "Error updating client");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;

      const id = parsePositiveInteger(request.params?.id);
      if (!id) {
        return reply.status(400).send({ message: "Invalid client id." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requesterHasOrgFeature(requester, "clients.all_clients")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.CLIENTS_DELETE))) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const result = await deleteClientById({ id, organizationId: authContext.organizationId });
        if (result.rowCount === 0) {
          return reply.status(404).send({ message: "Client not found." });
        }

        return reply.send({ message: "Client deleted." });
      } catch (error) {
        request.log.error({ err: error }, "Error deleting client");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default clientsRoutes;
