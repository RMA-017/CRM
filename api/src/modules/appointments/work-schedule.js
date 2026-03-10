const TIME_HM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const WORK_SCHEDULE_SCOPE_SET = new Set(["weekly", "exception"]);

export function normalizeWorkScheduleScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return WORK_SCHEDULE_SCOPE_SET.has(normalized) ? normalized : "";
}

export function normalizeWorkScheduleDayOfWeek(value, toAppointmentDayNum = null) {
  const normalized = String(value || "").trim().toLowerCase();
  const parsed = Number.parseInt(normalized, 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 7) {
    return parsed;
  }

  if (typeof toAppointmentDayNum === "function") {
    const fromKey = toAppointmentDayNum(normalized);
    if (Number.isInteger(fromKey) && fromKey >= 1 && fromKey <= 7) {
      return fromKey;
    }
  }

  return 0;
}

export function normalizeWorkScheduleTime(value) {
  const normalized = String(value || "").trim().slice(0, 5);
  return TIME_HM_REGEX.test(normalized) ? normalized : "";
}

export function normalizeWorkScheduleReason(value) {
  return String(value || "").trim().slice(0, 120);
}
