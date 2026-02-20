import pool from "../../config/db.js";

function normalizeValue(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeValue(value).toLowerCase();
}

async function selectRole(roleValue) {
  const normalizedRole = normalizeLower(roleValue);
  if (!normalizedRole) {
    return null;
  }

  const { rows } = await pool.query(
    "SELECT id, value, label, is_active FROM role_options WHERE LOWER(value) = $1 LIMIT 1",
    [normalizedRole]
  );
  return rows[0] || null;
}

async function selectPosition(positionValue) {
  const normalizedPosition = normalizeLower(positionValue);
  if (!normalizedPosition) {
    return null;
  }

  const { rows } = await pool.query(
    "SELECT id, value, label, is_active FROM position_options WHERE LOWER(value) = $1 LIMIT 1",
    [normalizedPosition]
  );
  return rows[0] || null;
}

export async function isAllowedRole(roleValue) {
  const role = await selectRole(roleValue);
  return Boolean(role && role.is_active);
}

export async function isAllowedPosition(positionValue) {
  const position = await selectPosition(positionValue);
  return Boolean(position && position.is_active);
}

export async function getRolePermissions(roleValue) {
  const normalizedRole = normalizeLower(roleValue);
  if (!normalizedRole) {
    return [];
  }

  const { rows } = await pool.query(
    `SELECT p.code
       FROM role_options r
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE LOWER(r.value) = $1
        AND r.is_active = TRUE
        AND p.is_active = TRUE
      ORDER BY p.sort_order ASC, p.id ASC`,
    [normalizedRole]
  );

  return rows
    .map((row) => normalizeLower(row?.code))
    .filter(Boolean);
}

export async function hasPermission(roleValue, permissionCode) {
  const normalizedPermission = normalizeLower(permissionCode);
  if (!normalizedPermission) {
    return false;
  }

  const permissions = await getRolePermissions(roleValue);
  return permissions.includes(normalizedPermission);
}
