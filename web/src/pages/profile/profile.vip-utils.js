import { formatDateForInput } from "../../lib/formatters.js";

export function normalizeVipAttendanceStatus(value, fallback = "unmarked") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "present" || normalized === "absent") {
    return normalized;
  }
  return fallback;
}

export function normalizeVipAttendanceDateTime(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  if (!hasExplicitTimezone) {
    const directMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (directMatch) {
      const [, year, month, day, hours, minutes] = directMatch;
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
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

export function mapVipAttendanceClient(item) {
  const id = String(item?.id || "").trim();
  const firstName = String(item?.firstName || item?.first_name || "").trim();
  const lastName = String(item?.lastName || item?.last_name || "").trim();
  const middleName = String(item?.middleName || item?.middle_name || "").trim();
  const className = String(item?.className || item?.class_name || "").trim();
  const teacherId = String(item?.teacherId || item?.teacher_id || "").trim();
  const teacherName = String(item?.teacherName || item?.teacher_name || "").trim();
  const tutorName = String(item?.tutorName || item?.tutor_name || "").trim();
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
    className,
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

export function resolveVipAttendanceDate(period, fallbackYmd) {
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

export function normalizeVipAttendanceDraftEntry(value) {
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

export function mapVipClassItem(item) {
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

export function mapVipAssignmentItem(item) {
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

export function formatMyChildrenOptionLabel(item) {
  const firstName = String(item?.firstName || item?.first_name || "").trim();
  const lastName = String(item?.lastName || item?.last_name || "").trim();
  const middleName = String(item?.middleName || item?.middle_name || "").trim();
  const fullName = `${firstName} ${lastName} ${middleName}`.replace(/\s+/g, " ").trim();
  const clientId = String(item?.id || "").trim();
  const className = String(item?.className || item?.class_name || "").trim();
  const tutorName = String(item?.tutorName || item?.tutor_name || "").trim();
  return {
    id: clientId,
    label: fullName || (clientId ? `Child #${clientId}` : "Child"),
    className,
    tutorName
  };
}

export function mapMyChildrenScheduleItem(item) {
  return {
    id: String(item?.id || "").trim(),
    appointmentDate: String(item?.appointmentDate || item?.appointment_date || "").trim(),
    startTime: String(item?.startTime || item?.start_time || "").trim(),
    endTime: String(item?.endTime || item?.end_time || "").trim(),
    status: String(item?.status || "").trim().toLowerCase(),
    serviceName: String(item?.serviceName || item?.service_name || "").trim(),
    specialistName: String(item?.specialistName || item?.specialist_name || "").trim(),
    specialistPosition: String(item?.specialistPosition || item?.specialist_position || "").trim(),
    note: String(item?.note || "").trim()
  };
}

export function mapVipClassDailyRoutineItem(item) {
  const id = String(item?.id || "").trim();
  const classId = String(item?.classId || item?.class_id || item?.class_assignment_id || "").trim();
  const className = String(item?.className || item?.class_name || "").trim();
  const teacherId = String(item?.teacherId || item?.teacher_id || item?.teacher_user_id || "").trim();
  const teacherName = String(item?.teacherName || item?.teacher_name || "").trim();
  const childrenCountRaw = Number.parseInt(String(item?.childrenCount ?? item?.children_count ?? "0"), 10);
  const childrenCount = Number.isInteger(childrenCountRaw) && childrenCountRaw > 0 ? childrenCountRaw : 0;
  const dayOfWeekRaw = Number.parseInt(String(item?.dayOfWeek ?? item?.day_of_week ?? "0"), 10);
  const dayOfWeek = Number.isInteger(dayOfWeekRaw) ? dayOfWeekRaw : 0;
  const activityType = String(item?.activityType || item?.activity_type || "").trim().toLowerCase();
  const startTime = String(item?.startTime || item?.start_time || "").trim();
  const endTime = String(item?.endTime || item?.end_time || "").trim();
  const note = String(item?.note || "").trim();
  return {
    id,
    classId,
    className,
    teacherId,
    teacherName,
    childrenCount,
    dayOfWeek,
    activityType,
    startTime,
    endTime,
    note
  };
}

export function shiftDateYmd(value, offsetDays = 0, fallbackYmd = "") {
  const baseRaw = String(value || "").trim();
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(baseRaw)
    ? new Date(`${baseRaw}T00:00:00`)
    : new Date(`${String(fallbackYmd || "").trim() || formatDateForInput(new Date())}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) {
    return String(fallbackYmd || "").trim() || formatDateForInput(new Date());
  }
  const safeOffset = Number.isInteger(offsetDays) ? offsetDays : 0;
  baseDate.setDate(baseDate.getDate() + safeOffset);
  return formatDateForInput(baseDate);
}

export function normalizeVipAssignmentDraftEntry(value) {
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
