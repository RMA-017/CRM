export const MIN_BIRTHDAY_YMD = "1950-01-01";
const DATE_YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function getTodayYmd() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidDateYmd(value) {
  const raw = String(value || "").trim();
  if (!DATE_YMD_REGEX.test(raw)) {
    return false;
  }

  const [yearRaw, monthRaw, dayRaw] = raw.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    !Number.isNaN(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}

export function formatDateYmd(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeDateYmd(
  value,
  {
    allowPrefix = false,
    allowDateParsing = false,
    requireValidExact = false
  } = {}
) {
  if (value instanceof Date) {
    return formatDateYmd(value);
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (requireValidExact ? isValidDateYmd(raw) : DATE_YMD_REGEX.test(raw)) {
    return raw;
  }

  if (allowPrefix) {
    const ymdMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (ymdMatch && isValidDateYmd(ymdMatch[1])) {
      return ymdMatch[1];
    }
  }

  if (!allowDateParsing) {
    return "";
  }

  return formatDateYmd(new Date(raw));
}

export function validateBirthdayYmd(value, { required = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    return required ? "Birthday is required." : null;
  }

  if (!isValidDateYmd(raw)) {
    return "Invalid birthday format.";
  }

  const todayYmd = getTodayYmd();
  if (raw < MIN_BIRTHDAY_YMD || raw > todayYmd) {
    return "Birthday is out of allowed range.";
  }

  return null;
}
