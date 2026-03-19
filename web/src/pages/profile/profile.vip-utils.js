import { formatDateForInput } from "../../lib/formatters.js";

export const MY_CHILDREN_DAY_ITEMS = Object.freeze([
  { key: "mon", label: "Monday", offset: 0 },
  { key: "tue", label: "Tuesday", offset: 1 },
  { key: "wed", label: "Wednesday", offset: 2 },
  { key: "thu", label: "Thursday", offset: 3 },
  { key: "fri", label: "Friday", offset: 4 },
  { key: "sat", label: "Saturday", offset: 5 },
  { key: "sun", label: "Sunday", offset: 6 }
]);

export const MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS = Object.freeze(["mon", "tue", "wed", "thu", "fri", "sat"]);

export const MY_CHILDREN_DAY_NUM_TO_KEY = Object.freeze(
  MY_CHILDREN_DAY_ITEMS.reduce((acc, item, index) => {
    acc[index + 1] = item.key;
    return acc;
  }, {})
);

export function getMyChildrenWeekStartYmd(value = "", fallbackYmd = "") {
  const normalized = String(value || "").trim();
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T00:00:00`)
    : new Date(`${String(fallbackYmd || "").trim() || formatDateForInput(new Date())}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) {
    return String(fallbackYmd || "").trim() || formatDateForInput(new Date());
  }
  baseDate.setDate(baseDate.getDate() - (baseDate.getDay() + 6) % 7);
  return formatDateForInput(baseDate);
}

export function normalizeMyChildrenVisibleWeekDays(days) {
  const validKeys = new Set(MY_CHILDREN_DAY_ITEMS.map((item) => item.key));
  const normalized = Array.from(
    new Set(
      (Array.isArray(days) ? days : [])
        .map((day) => String(day || "").trim().toLowerCase())
        .filter((day) => validKeys.has(day))
    )
  );

  if (normalized.length === 0) {
    return [...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS];
  }

  return MY_CHILDREN_DAY_ITEMS
    .map((item) => item.key)
    .filter((key) => normalized.includes(key));
}

export function normalizeVipAttendanceStatus(value, fallback = "unmarked") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "present" || normalized === "absent") {
    return normalized;
  }
  return fallback;
}

export const VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS = Object.freeze([
  { value: "lesson", label: "Group lesson" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "afternoon-snack", label: "Afternoon snack" },
  { value: "sleep", label: "Sleep time" },
  { value: "other", label: "Other" }
]);

const VIP_DAILY_ROUTINE_ACTIVITY_ALIASES = Object.freeze({
  lesson: "lesson",
  "group-lesson": "lesson",
  breakfast: "breakfast",
  lunch: "lunch",
  "afternoon-snack": "afternoon-snack",
  sleep: "sleep",
  "sleep-time": "sleep",
  other: "other"
});

const VIP_DAILY_ROUTINE_ACTIVITY_LABEL_BY_VALUE = Object.freeze(
  VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS.reduce((acc, item) => {
    acc[item.value] = item.label;
    return acc;
  }, {})
);

export function normalizeVipDailyRoutineActivityType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return VIP_DAILY_ROUTINE_ACTIVITY_ALIASES[normalized] || "";
}

export function formatVipDailyRoutineActivityLabel(activityType) {
  const normalized = normalizeVipDailyRoutineActivityType(activityType);
  return VIP_DAILY_ROUTINE_ACTIVITY_LABEL_BY_VALUE[normalized] || "-";
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
  const classId = String(item?.classId || item?.class_id || item?.classAssignmentId || item?.class_assignment_id || "").trim();
  const className = String(item?.className || item?.class_name || "").trim();
  const tutorName = String(item?.tutorName || item?.tutor_name || "").trim();
  return {
    id: clientId,
    label: fullName || (clientId ? `Child #${clientId}` : "Child"),
    classId,
    className,
    tutorName
  };
}

export function mapMyChildrenScheduleItem(item) {
  return {
    id: String(item?.id || "").trim(),
    specialistId: String(item?.specialistId || item?.specialist_id || "").trim(),
    clientId: String(item?.clientId || item?.client_id || "").trim(),
    appointmentDate: String(item?.appointmentDate || item?.appointment_date || "").trim(),
    startTime: String(item?.startTime || item?.start_time || "").trim(),
    endTime: String(item?.endTime || item?.end_time || "").trim(),
    durationMinutes: String(item?.durationMinutes || item?.duration_minutes || "").trim(),
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
  const specialistId = String(item?.specialistId || item?.specialist_id || item?.specialist_user_id || "").trim();
  const specialistName = String(item?.specialistName || item?.specialist_name || "").trim();
  const specialistRole = String(item?.specialistRole || item?.specialist_role || "").trim();
  const childrenCountRaw = Number.parseInt(String(item?.childrenCount ?? item?.children_count ?? "0"), 10);
  const childrenCount = Number.isInteger(childrenCountRaw) && childrenCountRaw > 0 ? childrenCountRaw : 0;
  const dayOfWeekRaw = Number.parseInt(String(item?.dayOfWeek ?? item?.day_of_week ?? "0"), 10);
  const dayOfWeek = Number.isInteger(dayOfWeekRaw) ? dayOfWeekRaw : 0;
  const activityType = String(item?.activityType || item?.activity_type || "").trim().toLowerCase();
  const startTime = String(item?.startTime || item?.start_time || "").trim();
  const endTime = String(item?.endTime || item?.end_time || "").trim();
  const mandatoryExercises = String(item?.mandatoryExercises || item?.mandatory_exercises || "").trim();
  const note = String(item?.note || "").trim();
  return {
    id,
    classId,
    className,
    teacherId,
    teacherName,
    specialistId,
    specialistName,
    specialistRole,
    childrenCount,
    dayOfWeek,
    activityType,
    startTime,
    endTime,
    mandatoryExercises,
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
