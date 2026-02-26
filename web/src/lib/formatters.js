export function getInitial(text) {
  const value = String(text || "").trim();
  return (value[0] || "U").toUpperCase();
}

export function formatDateYMD(value) {
  if (!value) {
    return "-";
  }

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return `${day}.${month}.${year}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
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
    email: profile.email || "",
    fullName: profile.fullName || profile.full_name || profile.name || "",
    birthday: profile.birthday || "",
    phone: profile.phone || profile.phone_number || "",
    position: profile.position || "",
    role: profile.role || "",
    permissions
  };
}
