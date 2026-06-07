export function getTodayYmd() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getInitial(text) {
  const value = String(text || "").trim();
  return (value[0] || "U").toUpperCase();
}

const TASHKENT_TIME_ZONE = "Asia/Tashkent";

const tashkentDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TASHKENT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const tashkentDateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TASHKENT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function matchDateOnlyValue(raw) {
  return String(raw || "").trim().match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]00:00(?::00(?:\.0{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
  );
}

function normalizeDateTimeValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(" ", "T");
  const hasTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized);
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized);
  return hasTime && !hasTimeZone ? `${normalized}Z` : normalized;
}

function formatParts(formatter, date) {
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return parts;
}

export function formatDateYMD(value) {
  if (!value) {
    return "-";
  }

  const raw = String(value).trim();
  const dateOnlyMatch = matchDateOnlyValue(raw);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}.${month}.${year}`;
  }

  if (!/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(raw)) {
    return "-";
  }

  const date = new Date(normalizeDateTimeValue(raw));
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const { day, month, year } = formatParts(tashkentDateFormatter, date);
  return `${day}.${month}.${year}`;
}

export function formatDateTimeTashkent(value) {
  if (!value) {
    return "-";
  }

  const raw = String(value).trim();
  const dateOnlyMatch = matchDateOnlyValue(raw);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}.${month}.${year}`;
  }

  const normalized = normalizeDateTimeValue(raw);
  if (!/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(normalized)) {
    return "-";
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const { day, month, year, hour, minute } = formatParts(tashkentDateTimeFormatter, date);
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

export function formatDateForInput(value) {
  if (!value) {
    return "";
  }
  const raw = String(value).trim();
  const dateOnlyMatch = matchDateOnlyValue(raw);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${year}-${month}-${day}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return {};
  }

  const permissions = Array.isArray(profile.permissions)
    ? profile.permissions
      .map((permission) => String(permission || "").trim().toLowerCase())
      .filter(Boolean)
    : [];

  return {
    id: String(profile.id || profile.userId || profile.user_id || ""),
    username: profile.username || "",
    organizationId: profile.organizationId || profile.organization_id || "",
    organizationCode: profile.organizationCode || profile.organization_code || "",
    organizationName: profile.organizationName || profile.organization_name || "",
    roleId: String(profile.roleId || profile.role_id || ""),
    positionId: String(profile.positionId || profile.position_id || ""),
    isAdmin: Boolean(profile.isAdmin || profile.is_admin),
    isPlatformAdmin: Boolean(profile.isPlatformAdmin || profile.is_platform_admin),
    isOrganizationAdmin: Boolean(profile.isOrganizationAdmin || profile.is_organization_admin),
    email: profile.email || "",
    fullName: profile.fullName || profile.full_name || profile.name || "",
    birthday: profile.birthday || "",
    phone: profile.phone || profile.phone_number || "",
    position: profile.position || "",
    role: profile.role || "",
    permissions
  };
}
