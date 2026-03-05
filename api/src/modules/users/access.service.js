import pool from "../../config/db.js";
import { parsePositiveInteger } from "../../lib/number.js";

const ROLE_PERMISSIONS_CACHE_TTL_MS = 15000;
const rolePermissionsCache = new Map();

function normalizeRoleId(value) {
  return parsePositiveInteger(value);
}

function normalizePositionId(value) {
  return parsePositiveInteger(value);
}

function normalizeOrganizationId(value) {
  return parsePositiveInteger(value);
}

function normalizePermissionCode(value) {
  return String(value || "").trim().toLowerCase();
}

function readRolePermissionsFromCache(roleId) {
  const cached = rolePermissionsCache.get(roleId);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    rolePermissionsCache.delete(roleId);
    return null;
  }
  return Array.isArray(cached.permissions) ? [...cached.permissions] : null;
}

function writeRolePermissionsToCache(roleId, permissions) {
  rolePermissionsCache.set(roleId, {
    permissions: Array.isArray(permissions) ? [...permissions] : [],
    expiresAt: Date.now() + ROLE_PERMISSIONS_CACHE_TTL_MS
  });
}

export function clearRolePermissionsCache(roleId = null) {
  const normalizedRoleId = normalizeRoleId(roleId);
  if (normalizedRoleId) {
    rolePermissionsCache.delete(normalizedRoleId);
    return;
  }
  rolePermissionsCache.clear();
}

async function selectRoleById(roleId, organizationId = null, allowGlobal = true) {
  const normalizedRoleId = normalizeRoleId(roleId);
  if (!normalizedRoleId) {
    return null;
  }

  const normalizedOrganizationId = normalizeOrganizationId(organizationId);
  const params = [normalizedRoleId];
  let scopeSql = "";
  if (normalizedOrganizationId) {
    params.push(normalizedOrganizationId);
    scopeSql = allowGlobal
      ? "AND (organization_id = $2 OR organization_id IS NULL)"
      : "AND organization_id = $2";
  }

  const { rows } = await pool.query(
    `SELECT id, organization_id, label, is_admin, is_active
       FROM role_options
      WHERE id = $1
        ${scopeSql}
      LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function selectPositionById(positionId, organizationId = null, allowGlobal = true) {
  const normalizedPositionId = normalizePositionId(positionId);
  if (!normalizedPositionId) {
    return null;
  }

  const normalizedOrganizationId = normalizeOrganizationId(organizationId);
  const params = [normalizedPositionId];
  let scopeSql = "";
  if (normalizedOrganizationId) {
    params.push(normalizedOrganizationId);
    scopeSql = allowGlobal
      ? "AND (organization_id = $2 OR organization_id IS NULL)"
      : "AND organization_id = $2";
  }

  const { rows } = await pool.query(
    `SELECT id, organization_id, label, is_active
       FROM position_options
      WHERE id = $1
        ${scopeSql}
      LIMIT 1`,
    params
  );
  return rows[0] || null;
}

export async function isAllowedRole(roleId, options = {}) {
  const role = await selectRoleById(
    roleId,
    options?.organizationId ?? null,
    options?.allowGlobal !== false
  );
  return Boolean(role && role.is_active);
}

export async function isAdminRole(roleId, options = {}) {
  const role = await selectRoleById(
    roleId,
    options?.organizationId ?? null,
    options?.allowGlobal !== false
  );
  return Boolean(role && role.is_active && role.is_admin);
}

export async function isAllowedPosition(positionId, options = {}) {
  const position = await selectPositionById(
    positionId,
    options?.organizationId ?? null,
    options?.allowGlobal !== false
  );
  return Boolean(position && position.is_active);
}

export async function getRolePermissions(roleId) {
  const normalizedRoleId = normalizeRoleId(roleId);
  if (!normalizedRoleId) {
    return [];
  }

  const cachedPermissions = readRolePermissionsFromCache(normalizedRoleId);
  if (cachedPermissions) {
    return cachedPermissions;
  }

  const { rows } = await pool.query(
    `SELECT p.code
       FROM role_options r
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE r.id = $1
        AND r.is_active = TRUE
        AND p.is_active = TRUE
      ORDER BY p.sort_order ASC, p.id ASC`,
    [normalizedRoleId]
  );

  const permissions = rows
    .map((row) => normalizePermissionCode(row?.code))
    .filter(Boolean);
  writeRolePermissionsToCache(normalizedRoleId, permissions);
  return permissions;
}

export async function hasPermission(roleId, permissionCode) {
  const normalizedPermission = normalizePermissionCode(permissionCode);
  if (!normalizedPermission) {
    return false;
  }

  const permissions = await getRolePermissions(roleId);
  return permissions.includes(normalizedPermission);
}
