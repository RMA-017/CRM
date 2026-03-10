const TIME_HM_CAPTURE_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeTimeHm(value, { allowSeconds = false } = {}) {
  const raw = String(value || "").trim();
  const candidate = allowSeconds ? raw.slice(0, 5) : raw;
  const match = candidate.match(TIME_HM_CAPTURE_REGEX);
  if (!match) {
    return "";
  }

  return `${match[1]}:${match[2]}`;
}

export function toTimeMinutes(value, { allowSeconds = false } = {}) {
  const normalized = normalizeTimeHm(value, { allowSeconds });
  if (!normalized) {
    return null;
  }

  const [hourRaw, minuteRaw] = normalized.split(":");
  return (Number(hourRaw) * 60) + Number(minuteRaw);
}

export function getDurationMinutesFromTimes(startTime, endTime, options = {}) {
  const start = toTimeMinutes(startTime, options);
  const end = toTimeMinutes(endTime, options);
  if (start === null || end === null || end <= start) {
    return 0;
  }

  return end - start;
}
