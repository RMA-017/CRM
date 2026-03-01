import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { getTodayYmd, isValidDateYmd, validateBirthdayYmd } from "../../lib/date.js";
import { PHONE_REGEX } from "../../constants/validation.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import {
  createClient,
  deleteVipClassAssignment,
  deleteClientById,
  findClientsRequester,
  getClientsPage,
  getVipAssignmentOptionsByOrganization,
  getVipClassAssignmentHistory,
  getVipClassAssignmentOptions,
  getVipClassAssignments,
  getVipClassDailyRoutines,
  getVipAttendanceHistory,
  getVipClientOptionsByOrganization,
  getVipDailyRoutines,
  getVipAttendanceTeachersByOrganization,
  getVipTutorAssignmentHistory,
  getVipTutorAssignments,
  deleteVipClassDailyRoutine,
  deleteVipDailyRoutine,
  resetVipClientAttendanceByDate,
  searchClientsForSchedule,
  upsertVipClassAssignment,
  upsertVipClassDailyRoutine,
  upsertVipDailyRoutine,
  upsertVipTutorAssignment,
  upsertVipClientAttendance,
  updateClientById
} from "./clients.service.js";

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

function parseNullableBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return null;
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

function toYmdFromDateObject(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateYmdValue(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return toYmdFromDateObject(value);
  }

  const raw = String(value).trim();
  if (!raw) {
    return "";
  }

  const ymdMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymdMatch && isValidDateYmd(ymdMatch[1])) {
    return ymdMatch[1];
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return toYmdFromDateObject(parsed);
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
  const normalized = `${String(requester?.role_label || "").trim().toLowerCase()} ${String(requester?.position_label || "").trim().toLowerCase()}`;
  return normalized.includes("director") || normalized.includes("direktor");
}

const VIP_DAILY_ROUTINE_DAY_KEY_TO_NUM = Object.freeze({
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
  dushanba: 1,
  seshanba: 2,
  chorshanba: 3,
  payshanba: 4,
  juma: 5,
  shanba: 6,
  yakshanba: 7
});

const VIP_DAILY_ROUTINE_DAY_NUM_TO_KEY = Object.freeze({
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
  7: "sun"
});

const VIP_DAILY_ROUTINE_ACTIVITY_ALIASES = Object.freeze({
  lesson: "lesson",
  dars: "lesson",
  class: "lesson",
  study: "lesson",
  sleep: "sleep",
  nap: "sleep",
  uxlash: "sleep",
  uyqu: "sleep"
});

const VIP_CLASS_DAILY_ROUTINE_ACTIVITY_ALIASES = Object.freeze({
  lesson: "lesson",
  dars: "lesson",
  class: "lesson",
  study: "lesson",
  sleep: "sleep",
  nap: "sleep",
  uxlash: "sleep",
  uyqu: "sleep",
  meal: "meal",
  food: "meal",
  breakfast: "meal",
  lunch: "meal",
  dinner: "meal",
  snack: "meal",
  poldnik: "meal",
  nonushta: "meal",
  tushlik: "meal",
  ovqat: "meal",
  other: "other",
  boshqa: "other"
});

function parseVipDailyRoutineDayOfWeek(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 7) {
    return parsed;
  }

  const normalized = String(value || "").trim().toLowerCase();
  return VIP_DAILY_ROUTINE_DAY_KEY_TO_NUM[normalized] || 0;
}

function normalizeVipDailyRoutineActivityType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VIP_DAILY_ROUTINE_ACTIVITY_ALIASES[normalized] || "";
}

function normalizeVipClassDailyRoutineActivityType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VIP_CLASS_DAILY_ROUTINE_ACTIVITY_ALIASES[normalized] || "";
}

function normalizeHmTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return "";
  }
  return `${match[1]}:${match[2]}`;
}

function toHmMinutes(value) {
  const normalized = normalizeHmTime(value);
  if (!normalized) {
    return null;
  }
  const [hourRaw, minuteRaw] = normalized.split(":");
  return (Number(hourRaw) * 60) + Number(minuteRaw);
}

const ADVANCED_APPOINTMENT_MENU_PERMISSIONS = Object.freeze([
  PERMISSIONS.CLIENTS_MENU,
  PERMISSIONS.APPOINTMENTS_MENU,
  PERMISSIONS.APPOINTMENTS_SUBMENU_SCHEDULE,
  PERMISSIONS.APPOINTMENTS_SUBMENU_BREAKS,
  PERMISSIONS.APPOINTMENTS_SUBMENU_VIP_CLIENTS,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_READ,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_CREATE,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_UPDATE,
  PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DELETE,
  PERMISSIONS.APPOINTMENTS_SUBMENU_ASSIGNMENTS,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_READ,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CREATE,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_UPDATE,
  PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_DELETE,
  PERMISSIONS.APPOINTMENTS_SUBMENU_STATISTICS
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
    canOpenVipClients,
    canReadVipClients,
    canCreateVipClients,
    canUpdateVipClients,
    canDeleteVipClients,
    canAccessMyChildren
  ] = await Promise.all([
    hasAdvancedAppointmentMenuPermissions(roleId),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_SUBMENU_VIP_CLIENTS),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_READ),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_CREATE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_UPDATE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_DELETE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN)
  ]);
  return {
    usesAdvancedMenuPermissions,
    canOpenVipClients,
    canReadVipClients,
    canCreateVipClients,
    canUpdateVipClients,
    canDeleteVipClients,
    canAccessMyChildren
  };
}

async function getAssignmentsPermissionSnapshot(roleId) {
  const [
    usesAdvancedMenuPermissions,
    canOpenAssignments,
    canReadAssignments,
    canCreateAssignments,
    canUpdateAssignments,
    canDeleteAssignments
  ] = await Promise.all([
    hasAdvancedAppointmentMenuPermissions(roleId),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_SUBMENU_ASSIGNMENTS),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_READ),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_CREATE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_UPDATE),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_ASSIGNMENTS_DELETE)
  ]);
  return {
    usesAdvancedMenuPermissions,
    canOpenAssignments,
    canReadAssignments,
    canCreateAssignments,
    canUpdateAssignments,
    canDeleteAssignments
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
  const vipClassName = String(row.vip_class_name || row.class_name || "").trim();
  const createdById = String(row.created_by || "").trim();
  const createdByName = String(row.created_by_name || row.created_by || "-").trim() || "-";
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

function mapVipDailyRoutineRecord(row) {
  const id = String(row?.id || "").trim();
  const clientId = String(row?.client_id || row?.clientId || "").trim();
  const firstName = String(row?.first_name || row?.firstName || "").trim();
  const lastName = String(row?.last_name || row?.lastName || "").trim();
  const middleName = String(row?.middle_name || row?.middleName || "").trim();
  const dayOfWeek = Number.parseInt(String(row?.day_of_week || row?.dayOfWeek || ""), 10) || 0;
  const dayKey = VIP_DAILY_ROUTINE_DAY_NUM_TO_KEY[dayOfWeek] || "";
  const activityType = normalizeVipDailyRoutineActivityType(row?.activity_type || row?.activityType);
  const title = String(row?.title || "").trim();
  const startTime = normalizeHmTime(row?.start_time || row?.startTime);
  const endTime = normalizeHmTime(row?.end_time || row?.endTime);
  const note = String(row?.note || "").trim();
  const isActive = row?.is_active === false ? false : row?.isActive !== false;
  const sortOrderRaw = Number.parseInt(String(row?.sort_order ?? row?.sortOrder ?? "100"), 10);
  const sortOrder = Number.isInteger(sortOrderRaw) ? sortOrderRaw : 100;
  const classId = String(row?.class_assignment_id || row?.class_id || row?.classId || "").trim();
  const className = String(row?.class_name || row?.className || "").trim();
  const teacherId = String(row?.teacher_user_id || row?.teacher_id || row?.teacherId || "").trim();
  const teacherName = String(row?.teacher_name || row?.teacherName || "").trim();
  const tutorId = String(row?.tutor_user_id || row?.tutor_id || row?.tutorId || "").trim();
  const tutorName = String(row?.tutor_name || row?.tutorName || "").trim();
  const createdAt = row?.created_at || row?.createdAt || null;
  const updatedAt = row?.updated_at || row?.updatedAt || null;

  return {
    id,
    clientId,
    client_id: clientId,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    middleName,
    middle_name: middleName,
    dayOfWeek,
    day_of_week: dayOfWeek,
    dayKey,
    day_key: dayKey,
    activityType,
    activity_type: activityType,
    title,
    startTime,
    start_time: startTime,
    endTime,
    end_time: endTime,
    note,
    isActive,
    is_active: isActive,
    sortOrder,
    sort_order: sortOrder,
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
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt
  };
}

function mapVipClassDailyRoutineRecord(row) {
  const id = String(row?.id || "").trim();
  const classId = String(row?.class_assignment_id || row?.classId || row?.class_id || "").trim();
  const className = String(row?.class_name || row?.className || "").trim();
  const teacherId = String(row?.teacher_user_id || row?.teacher_id || row?.teacherId || "").trim();
  const teacherName = String(row?.teacher_name || row?.teacherName || "").trim();
  const childrenCountRaw = Number.parseInt(String(row?.children_count ?? row?.childrenCount ?? "0"), 10);
  const childrenCount = Number.isInteger(childrenCountRaw) && childrenCountRaw > 0 ? childrenCountRaw : 0;
  const dayOfWeek = Number.parseInt(String(row?.day_of_week || row?.dayOfWeek || ""), 10) || 0;
  const dayKey = VIP_DAILY_ROUTINE_DAY_NUM_TO_KEY[dayOfWeek] || "";
  const activityType = normalizeVipClassDailyRoutineActivityType(row?.activity_type || row?.activityType);
  const title = String(row?.title || "").trim();
  const startTime = normalizeHmTime(row?.start_time || row?.startTime);
  const endTime = normalizeHmTime(row?.end_time || row?.endTime);
  const note = String(row?.note || "").trim();
  const isActive = row?.is_active === false ? false : row?.isActive !== false;
  const sortOrderRaw = Number.parseInt(String(row?.sort_order ?? row?.sortOrder ?? "100"), 10);
  const sortOrder = Number.isInteger(sortOrderRaw) ? sortOrderRaw : 100;
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
    childrenCount,
    children_count: childrenCount,
    dayOfWeek,
    day_of_week: dayOfWeek,
    dayKey,
    day_key: dayKey,
    activityType,
    activity_type: activityType,
    title,
    startTime,
    start_time: startTime,
    endTime,
    end_time: endTime,
    note,
    isActive,
    is_active: isActive,
    sortOrder,
    sort_order: sortOrder,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt
  };
}

async function clientsRoutes(fastify) {
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
        const [canReadClients, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const canReadVipAttendance = vipPermissions.usesAdvancedMenuPermissions
          ? (vipPermissions.canOpenVipClients && vipPermissions.canReadVipClients)
          : canReadClients;
        if (!canReadVipAttendance) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const items = await getVipAttendanceTeachersByOrganization(authContext.organizationId);
        return reply.send({
          items: (Array.isArray(items) ? items : []).map((item) => ({
            id: String(item?.id || "").trim(),
            name: String(item?.name || "").trim()
          })).filter((item) => Boolean(item.id))
        });
      } catch (error) {
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
        const [canReadClients, canReadAppointments, usesAdvancedMenuPermissions, canOpenStatistics] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_READ),
          hasAdvancedAppointmentMenuPermissions(requester.role_id),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_SUBMENU_STATISTICS)
        ]);
        if (!canReadClients || !canReadAppointments || (usesAdvancedMenuPermissions && !canOpenStatistics)) {
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
            limit
          }),
          getVipClassAssignmentOptions({
            organizationId: authContext.organizationId,
            limit: 1000
          }),
          getVipAttendanceTeachersByOrganization(authContext.organizationId),
          getVipClientOptionsByOrganization({
            organizationId: authContext.organizationId,
            limit: 2000
          }),
          getVipAssignmentOptionsByOrganization(authContext.organizationId)
        ]);

        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipAttendanceHistoryRecord),
          classes: (Array.isArray(classOptions) ? classOptions : [])
            .map((item) => ({
              id: String(item?.id || "").trim(),
              className: String(item?.class_name || item?.className || "").trim(),
              teacherId: String(item?.teacher_user_id || item?.teacherId || "").trim(),
              teacherName: String(item?.teacher_name || item?.teacherName || "").trim()
            }))
            .filter((item) => Boolean(item.id)),
          teachers: (Array.isArray(teacherOptions) ? teacherOptions : [])
            .map((item) => ({
              id: String(item?.id || "").trim(),
              name: String(item?.name || "").trim()
            }))
            .filter((item) => Boolean(item.id)),
          tutors: (Array.isArray(assignmentOptions?.tutors) ? assignmentOptions.tutors : [])
            .map((item) => ({
              id: String(item?.id || "").trim(),
              name: String(item?.name || "").trim()
            }))
            .filter((item) => Boolean(item.id)),
          clients: (Array.isArray(clientOptions) ? clientOptions : [])
            .map((item) => ({
              id: String(item?.id || "").trim(),
              firstName: String(item?.first_name || item?.firstName || "").trim(),
              lastName: String(item?.last_name || item?.lastName || "").trim(),
              middleName: String(item?.middle_name || item?.middleName || "").trim()
            }))
            .filter((item) => Boolean(item.id))
        });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching VIP attendance history");
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
        const [canReadClients, assignmentsPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getAssignmentsPermissionSnapshot(requester.role_id)
        ]);
        const canReadAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (assignmentsPermissions.canOpenAssignments && assignmentsPermissions.canReadAssignments)
          : (canReadClients && isDirectorLikeRequester(requester));
        if (!canReadAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [rows, options] = await Promise.all([
          getVipClassAssignments({
            organizationId: authContext.organizationId,
            limit
          }),
          getVipAssignmentOptionsByOrganization(authContext.organizationId)
        ]);

        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipClassAssignmentRecord),
          teachers: (Array.isArray(options?.teachers) ? options.teachers : []).map((item) => ({
            id: String(item?.id || "").trim(),
            name: String(item?.name || "").trim()
          })).filter((item) => Boolean(item.id))
        });
      } catch (error) {
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
        const [canReadClients, assignmentsPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getAssignmentsPermissionSnapshot(requester.role_id)
        ]);
        const canReadAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (assignmentsPermissions.canOpenAssignments && assignmentsPermissions.canReadAssignments)
          : (canReadClients && isDirectorLikeRequester(requester));
        if (!canReadAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const rows = await getVipClassAssignmentHistory({
          organizationId: authContext.organizationId,
          classId,
          limit
        });
        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipClassAssignmentHistoryRecord)
        });
      } catch (error) {
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
        return reply.status(400).send({ field: "teacherId", message: "Teacher is required." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        const [canUpdateClients, assignmentsPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE),
          getAssignmentsPermissionSnapshot(requester.role_id)
        ]);
        const isEditMode = Boolean(classId);
        const canWriteAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (
            assignmentsPermissions.canOpenAssignments
            && (isEditMode ? assignmentsPermissions.canUpdateAssignments : assignmentsPermissions.canCreateAssignments)
          )
          : (canUpdateClients && isDirectorLikeRequester(requester));
        if (!canWriteAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const options = await getVipAssignmentOptionsByOrganization(authContext.organizationId);
        const teacherAllowed = (Array.isArray(options?.teachers) ? options.teachers : [])
          .some((item) => Number.parseInt(String(item?.id || ""), 10) === teacherId);
        if (!teacherAllowed) {
          return reply.status(400).send({ field: "teacherId", message: "Selected teacher is not allowed." });
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
        const [canUpdateClients, assignmentsPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE),
          getAssignmentsPermissionSnapshot(requester.role_id)
        ]);
        const canDeleteAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (assignmentsPermissions.canOpenAssignments && assignmentsPermissions.canDeleteAssignments)
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
        const [canReadClients, assignmentsPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getAssignmentsPermissionSnapshot(requester.role_id)
        ]);
        const canReadAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (assignmentsPermissions.canOpenAssignments && assignmentsPermissions.canReadAssignments)
          : (canReadClients && isDirectorLikeRequester(requester));
        if (!canReadAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [rows, classOptions, options] = await Promise.all([
          getVipTutorAssignments({
            organizationId: authContext.organizationId,
            limit
          }),
          getVipClassAssignmentOptions({
            organizationId: authContext.organizationId
          }),
          getVipAssignmentOptionsByOrganization(authContext.organizationId)
        ]);

        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipTutorAssignmentRecord),
          classes: (Array.isArray(classOptions) ? classOptions : []).map((item) => ({
            id: String(item?.id || "").trim(),
            className: String(item?.class_name || item?.className || "").trim(),
            teacherId: String(item?.teacher_user_id || item?.teacherId || "").trim(),
            teacherName: String(item?.teacher_name || item?.teacherName || "").trim()
          })).filter((item) => Boolean(item.id)),
          tutors: (Array.isArray(options?.tutors) ? options.tutors : []).map((item) => ({
            id: String(item?.id || "").trim(),
            name: String(item?.name || "").trim()
          })).filter((item) => Boolean(item.id))
        });
      } catch (error) {
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
        const [canReadClients, assignmentsPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getAssignmentsPermissionSnapshot(requester.role_id)
        ]);
        const canReadAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (assignmentsPermissions.canOpenAssignments && assignmentsPermissions.canReadAssignments)
          : (canReadClients && isDirectorLikeRequester(requester));
        if (!canReadAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const rows = await getVipTutorAssignmentHistory({
          organizationId: authContext.organizationId,
          clientId,
          limit
        });
        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipTutorAssignmentHistoryRecord)
        });
      } catch (error) {
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
        const [canUpdateClients, assignmentsPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE),
          getAssignmentsPermissionSnapshot(requester.role_id)
        ]);
        const canWriteAssignments = assignmentsPermissions.usesAdvancedMenuPermissions
          ? (
            assignmentsPermissions.canOpenAssignments
            && (assignmentsPermissions.canCreateAssignments || assignmentsPermissions.canUpdateAssignments)
          )
          : (canUpdateClients && isDirectorLikeRequester(requester));
        if (!canWriteAssignments) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [classOptions, options] = await Promise.all([
          getVipClassAssignmentOptions({
            organizationId: authContext.organizationId
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
          message: "VIP tutor assignment updated.",
          item: mapVipTutorAssignmentRecord({
            id: String(clientId),
            ...item
          })
        });
      } catch (error) {
        request.log.error({ err: error }, "Error updating VIP tutor assignment");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/vip-daily-routines",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const clientId = parsePositiveInteger(request.query?.clientId ?? request.query?.client_id);
      const dayOfWeekRaw = request.query?.dayOfWeek ?? request.query?.day_of_week ?? request.query?.day ?? "";
      const dayOfWeek = parseVipDailyRoutineDayOfWeek(dayOfWeekRaw);
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
        const [canReadClients, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const canReadVipDailyRoutines = vipPermissions.usesAdvancedMenuPermissions
          ? (vipPermissions.canOpenVipClients && vipPermissions.canReadVipClients)
          : canReadClients;
        if (!canReadVipDailyRoutines) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [rows, clientOptions] = await Promise.all([
          getVipDailyRoutines({
            organizationId: authContext.organizationId,
            clientId: clientId || null,
            dayOfWeek: dayOfWeek || null,
            includeInactive,
            limit
          }),
          getVipClientOptionsByOrganization({
            organizationId: authContext.organizationId,
            limit: 2000
          })
        ]);

        return reply.send({
          items: (Array.isArray(rows) ? rows : []).map(mapVipDailyRoutineRecord),
          clients: (Array.isArray(clientOptions) ? clientOptions : [])
            .map((item) => ({
              id: String(item?.id || "").trim(),
              firstName: String(item?.first_name || item?.firstName || "").trim(),
              lastName: String(item?.last_name || item?.lastName || "").trim(),
              middleName: String(item?.middle_name || item?.middleName || "").trim()
            }))
            .filter((item) => Boolean(item.id))
        });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching VIP daily routines");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.put(
    "/vip-daily-routines",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const payload = request.body && typeof request.body === "object" ? request.body : {};

      const routineId = parsePositiveInteger(payload?.id ?? payload?.routineId ?? payload?.routine_id);
      const clientId = parsePositiveInteger(payload?.clientId ?? payload?.client_id);
      if (!clientId) {
        return reply.status(400).send({ field: "clientId", message: "VIP client is required." });
      }

      const dayOfWeek = parseVipDailyRoutineDayOfWeek(
        payload?.dayOfWeek
        ?? payload?.day_of_week
        ?? payload?.day
        ?? payload?.dayKey
        ?? payload?.day_key
      );
      if (!dayOfWeek) {
        return reply.status(400).send({
          field: "dayOfWeek",
          message: "Day of week must be between 1 and 7."
        });
      }

      const activityType = normalizeVipDailyRoutineActivityType(
        payload?.activityType
        ?? payload?.activity_type
        ?? payload?.type
      );
      if (!activityType) {
        return reply.status(400).send({
          field: "activityType",
          message: "Activity type must be lesson or sleep."
        });
      }

      const title = String(payload?.title || payload?.serviceName || payload?.service_name || "").trim();
      if (!title) {
        return reply.status(400).send({ field: "title", message: "Title is required." });
      }
      if (title.length > 128) {
        return reply.status(400).send({ field: "title", message: "Title is too long (max 128)." });
      }

      const startTime = normalizeHmTime(payload?.startTime ?? payload?.start_time);
      const endTime = normalizeHmTime(payload?.endTime ?? payload?.end_time);
      if (!startTime) {
        return reply.status(400).send({ field: "startTime", message: "Start time must be HH:mm." });
      }
      if (!endTime) {
        return reply.status(400).send({ field: "endTime", message: "End time must be HH:mm." });
      }
      const startMinutes = toHmMinutes(startTime);
      const endMinutes = toHmMinutes(endTime);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return reply.status(400).send({
          field: "endTime",
          message: "End time must be later than start time."
        });
      }

      const note = String(payload?.note || "").trim();
      if (note.length > 255) {
        return reply.status(400).send({ field: "note", message: "Note is too long (max 255)." });
      }

      const sortOrderRaw = payload?.sortOrder ?? payload?.sort_order ?? 100;
      const parsedSortOrder = Number.parseInt(String(sortOrderRaw ?? "").trim(), 10);
      if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0 || parsedSortOrder > 10000) {
        return reply.status(400).send({
          field: "sortOrder",
          message: "Sort order must be integer between 0 and 10000."
        });
      }

      const hasIsActiveField = Object.prototype.hasOwnProperty.call(payload, "isActive")
        || Object.prototype.hasOwnProperty.call(payload, "is_active");
      const parsedIsActive = hasIsActiveField
        ? parseNullableBoolean(payload?.isActive ?? payload?.is_active)
        : true;
      if (hasIsActiveField && parsedIsActive === null) {
        return reply.status(400).send({ field: "isActive", message: "isActive must be boolean." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        const [canUpdateClients, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const isEditMode = Boolean(routineId);
        const canWriteVipDailyRoutines = vipPermissions.usesAdvancedMenuPermissions
          ? (
            vipPermissions.canOpenVipClients
            && (isEditMode ? vipPermissions.canUpdateVipClients : vipPermissions.canCreateVipClients)
          )
          : (canUpdateClients && isDirectorLikeRequester(requester));
        if (!canWriteVipDailyRoutines) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const item = await upsertVipDailyRoutine({
          organizationId: authContext.organizationId,
          routineId: routineId || null,
          clientId,
          dayOfWeek,
          activityType,
          title,
          startTime,
          endTime,
          note,
          isActive: parsedIsActive !== false,
          sortOrder: parsedSortOrder,
          updatedBy: authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "VIP client or routine not found." });
        }

        return reply.send({
          message: routineId ? "VIP daily routine updated." : "VIP daily routine saved.",
          item: mapVipDailyRoutineRecord(item)
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
        request.log.error({ err: error }, "Error saving VIP daily routine");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/vip-daily-routines/:id",
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
        const [canUpdateClients, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const canDeleteVipDailyRoutines = vipPermissions.usesAdvancedMenuPermissions
          ? (vipPermissions.canOpenVipClients && vipPermissions.canDeleteVipClients)
          : (canUpdateClients && isDirectorLikeRequester(requester));
        if (!canDeleteVipDailyRoutines) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const result = await deleteVipDailyRoutine({
          organizationId: authContext.organizationId,
          routineId
        });
        if ((result?.rowCount || 0) === 0) {
          return reply.status(404).send({ message: "Routine not found." });
        }
        return reply.send({ message: "VIP daily routine deleted." });
      } catch (error) {
        request.log.error({ err: error }, "Error deleting VIP daily routine");
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
      const dayOfWeek = parseVipDailyRoutineDayOfWeek(dayOfWeekRaw);
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
        const [canReadClients, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const canReadVipClassDailyRoutines = vipPermissions.usesAdvancedMenuPermissions
          ? (vipPermissions.canOpenVipClients && vipPermissions.canReadVipClients)
          : canReadClients;
        if (!canReadVipClassDailyRoutines) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const [rows, classOptions] = await Promise.all([
          getVipClassDailyRoutines({
            organizationId: authContext.organizationId,
            classId: classId || null,
            dayOfWeek: dayOfWeek || null,
            includeInactive,
            limit
          }),
          getVipClassAssignmentOptions({
            organizationId: authContext.organizationId,
            limit: 2000
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
            .filter((item) => Boolean(item.id))
        });
      } catch (error) {
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

      const dayOfWeek = parseVipDailyRoutineDayOfWeek(
        payload?.dayOfWeek
        ?? payload?.day_of_week
        ?? payload?.day
        ?? payload?.dayKey
        ?? payload?.day_key
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
        ?? payload?.type
      );
      if (!activityType) {
        return reply.status(400).send({
          field: "activityType",
          message: "Activity type must be lesson, sleep, meal or other."
        });
      }

      const startTime = normalizeHmTime(payload?.startTime ?? payload?.start_time);
      const endTime = normalizeHmTime(payload?.endTime ?? payload?.end_time);
      if (!startTime) {
        return reply.status(400).send({ field: "startTime", message: "Start time must be HH:mm." });
      }
      if (!endTime) {
        return reply.status(400).send({ field: "endTime", message: "End time must be HH:mm." });
      }
      const startMinutes = toHmMinutes(startTime);
      const endMinutes = toHmMinutes(endTime);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return reply.status(400).send({
          field: "endTime",
          message: "End time must be later than start time."
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
        const [canUpdateClients, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const isEditMode = Boolean(routineId);
        const canWriteVipClassDailyRoutines = vipPermissions.usesAdvancedMenuPermissions
          ? (
            vipPermissions.canOpenVipClients
            && (isEditMode ? vipPermissions.canUpdateVipClients : vipPermissions.canCreateVipClients)
          )
          : (canUpdateClients && isDirectorLikeRequester(requester));
        if (!canWriteVipClassDailyRoutines) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const item = await upsertVipClassDailyRoutine({
          organizationId: authContext.organizationId,
          routineId: routineId || null,
          classId,
          dayOfWeek,
          activityType,
          startTime,
          endTime,
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
        const [canUpdateClients, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        const canDeleteVipClassDailyRoutines = vipPermissions.usesAdvancedMenuPermissions
          ? (vipPermissions.canOpenVipClients && vipPermissions.canDeleteVipClients)
          : (canUpdateClients && isDirectorLikeRequester(requester));
        if (!canDeleteVipClassDailyRoutines) {
          return reply.status(403).send({ message: "Forbidden." });
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
      const attendanceDate = isValidDateYmd(attendanceDateRaw)
        ? attendanceDateRaw
        : getTodayYmd();
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;

      const combinedLength = `${firstName}${lastName}${middleName}`.length;
      const isVipOnlySearch = isVip === true;
      const assignedUserId = mineOnly && isVipOnlySearch ? authContext.userId : null;
      if (!isVipOnlySearch && combinedLength < 3) {
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
        const canSearchVipClients = vipPermissions.usesAdvancedMenuPermissions
          ? (vipPermissions.canOpenVipClients && vipPermissions.canReadVipClients)
          : canReadClients;
        const canSearchMyChildren = vipPermissions.usesAdvancedMenuPermissions
          ? vipPermissions.canAccessMyChildren
          : canReadClients;
        if (isVipOnlySearch && !canSearchVipClients && !(mineOnly && canSearchMyChildren)) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (!isVipOnlySearch && !canReadClients && !canSearchAppointmentClients) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const rows = await searchClientsForSchedule({
          organizationId: authContext.organizationId,
          firstName,
          lastName,
          middleName,
          isVip,
          attendanceDate,
          assignedUserId,
          limit
        });

        return reply.send({
          items: rows.map(mapClient)
        });
      } catch (error) {
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

        const [canReadClients, vipPermissions] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          getVipClientsPermissionSnapshot(requester.role_id)
        ]);
        if (vipPermissions.usesAdvancedMenuPermissions) {
          const canWriteVipAttendance = resetAttendance
            ? vipPermissions.canDeleteVipClients
            : (vipPermissions.canCreateVipClients || vipPermissions.canUpdateVipClients);
          if (!vipPermissions.canOpenVipClients || !canWriteVipAttendance) {
            return reply.status(403).send({ message: "Forbidden." });
          }
        } else if (!canReadClients) {
          return reply.status(403).send({ message: "Forbidden." });
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
          message: "VIP attendance updated.",
          item: mapVipAttendanceRecord(item)
        });
      } catch (error) {
        request.log.error({ err: error }, "Error updating VIP attendance");
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
      const firstName = String(request.query?.firstName || "").trim();
      const lastName = String(request.query?.lastName || "").trim();
      const middleName = String(request.query?.middleName || "").trim();
      const isVip = parseNullableBoolean(request.query?.isVip ?? request.query?.is_vip);
      const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ))) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const { total, totalPages, rows, page: safePage } = await getClientsPage({
          organizationId: authContext.organizationId,
          page,
          limit,
          search,
          firstName,
          lastName,
          middleName,
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
