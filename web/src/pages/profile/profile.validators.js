const MIN_BIRTHDAY_YMD = "1950-01-01";

function getTodayYmd() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getBirthdayValidationMessage(value, { required = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    return required ? "Birthday is required." : "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "Invalid birthday format.";
  }

  const [yearRaw, monthRaw, dayRaw] = raw.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate = (
    !Number.isNaN(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
  if (!isRealDate) {
    return "Invalid birthday format.";
  }

  const todayYmd = getTodayYmd();
  if (raw < MIN_BIRTHDAY_YMD || raw > todayYmd) {
    return "Birthday is out of allowed range.";
  }

  return "";
}
