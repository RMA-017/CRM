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

function matchDateOnlyValue(raw) {
  return String(raw || "").trim().match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]00:00(?::00(?:\.0{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
  );
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

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}.${month}.${year}`;
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
