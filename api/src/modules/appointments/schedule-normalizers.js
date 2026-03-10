const MAX_DURATION_MINUTES = 1440;
const REMINDER_CHANNEL_SET = new Set(["sms", "email", "telegram"]);
const SCHEDULE_SCOPE_SET = new Set(["single", "future", "all"]);

export function normalizeDurationOptions(value, { allowCsv = false } = {}) {
  const source = Array.isArray(value)
    ? value
    : allowCsv
      ? String(value || "").split(",")
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => Number.parseInt(String(item ?? "").trim(), 10))
        .filter((item) => Number.isInteger(item) && item > 0 && item <= MAX_DURATION_MINUTES)
    )
  );
}

export function normalizeReminderChannels(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim().toLowerCase())
        .filter((item) => REMINDER_CHANNEL_SET.has(item))
    )
  );
}

export function normalizeScheduleScope(value, fallback = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return SCHEDULE_SCOPE_SET.has(normalized) ? normalized : fallback;
}
