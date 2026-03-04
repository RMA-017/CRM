import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { clearRolePermissionsCache } from "../users/access.service.js";

function mapOrganization(row) {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at
  };
}

function mapOption(row) {
  return {
    id: String(row.id),
    label: row.label,
    sortOrder: Number(row.sort_order || 0),
    organizationId: String(row.organization_id || ""),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at
  };
}

function normalizePermissionCode(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePermissionCodes(codes) {
  if (!Array.isArray(codes)) {
    return [];
  }
  return Array.from(
    new Set(
      codes
        .map((code) => normalizePermissionCode(code))
        .filter(Boolean)
    )
  );
}

function mapPermissionOption(row) {
  return {
    id: String(row.id),
    code: normalizePermissionCode(row.code),
    label: row.label,
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at
  };
}

function mapRoleOption(row) {
  const permissionCodes = Array.isArray(row.permission_codes)
    ? row.permission_codes
        .map((code) => normalizePermissionCode(code))
        .filter(Boolean)
    : [];

  return {
    id: String(row.id),
    label: row.label,
    sortOrder: Number(row.sort_order || 0),
    organizationId: String(row.organization_id || ""),
    isAdmin: Boolean(row.is_admin),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    permissionCodes
  };
}

async function getRoleOptionByIdWithDb(db, id, organizationId = null, allowGlobal = true) {
  const params = [id];
  let scopeSql = "";
  if (organizationId) {
    params.push(organizationId);
    scopeSql = allowGlobal
      ? "AND (r.organization_id = $2 OR r.organization_id IS NULL)"
      : "AND r.organization_id = $2";
  }
  const { rows } = await db.query(
    `SELECT
       r.id,
       r.organization_id,
       r.label,
       r.sort_order,
       r.is_admin,
       r.is_active,
       r.created_at,
       COALESCE(
         ARRAY_AGG(LOWER(p.code) ORDER BY p.sort_order ASC, p.id ASC)
         FILTER (WHERE p.id IS NOT NULL AND p.is_active = TRUE),
         '{}'
       ) AS permission_codes
     FROM role_options r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE r.id = $1
      ${scopeSql}
    GROUP BY r.id
    LIMIT 1`,
    params
  );

  return rows[0] ? mapRoleOption(rows[0]) : null;
}

async function resolvePermissionIdsByCodes(db, permissionCodes) {
  const normalizedCodes = normalizePermissionCodes(permissionCodes);
  if (normalizedCodes.length === 0) {
    return [];
  }

  const { rows } = await db.query(
    `SELECT id, LOWER(code) AS code
       FROM permissions
      WHERE is_active = TRUE
        AND LOWER(code) = ANY($1::text[])`,
    [normalizedCodes]
  );

  const foundCodes = new Set(rows.map((row) => normalizePermissionCode(row.code)));
  if (foundCodes.size !== normalizedCodes.length) {
    const invalidCodes = normalizedCodes.filter((code) => !foundCodes.has(code));
    const error = new Error("Invalid permission code(s).");
    error.code = "INVALID_PERMISSION_CODES";
    error.invalidCodes = invalidCodes;
    throw error;
  }

  return rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function replaceRolePermissions(db, roleId, permissionIds, actorUserId = null) {
  await db.query("DELETE FROM role_permissions WHERE role_id = $1", [roleId]);

  if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
    return;
  }

  await db.query(
    `INSERT INTO role_permissions (role_id, permission_id, created_by, updated_by)
     SELECT $1, src.permission_id, $3, $3
       FROM UNNEST($2::int[]) AS src(permission_id)`,
    [roleId, permissionIds, actorUserId]
  );
}

export async function findSettingsRequester(authContext = {}) {
  const cachedRequester = authContext?.requester;
  if (cachedRequester) {
    const roleLabel = String(cachedRequester.role || cachedRequester.role_label || "").trim();
    return {
      id: cachedRequester.id,
      role_id: cachedRequester.role_id,
      role: roleLabel,
      is_admin: Boolean(cachedRequester.is_admin),
      is_platform_admin: Boolean(cachedRequester.is_platform_admin),
      organization_id: cachedRequester.organization_id
    };
  }

  const { userId, organizationId } = authContext;
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.role_id,
       r.label AS role,
       (COALESCE(u.is_platform_admin, FALSE) OR COALESCE(r.is_admin, FALSE)) AS is_admin,
       COALESCE(u.is_platform_admin, FALSE) AS is_platform_admin,
       u.organization_id
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       JOIN role_options r ON r.id = u.role_id
      WHERE u.id = $1
        AND u.organization_id = $2
        AND o.is_active = TRUE
      LIMIT 1`,
    [userId, organizationId]
  );
  return rows[0] || null;
}

export async function listOrganizations() {
  const { rows } = await pool.query(
    "SELECT id, code, name, is_active, created_at FROM organizations ORDER BY created_at DESC, id DESC"
  );
  return rows.map(mapOrganization);
}

export async function createOrganization({ code, name, isActive, actorUserId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO organizations (code, name, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $4)
     RETURNING id, code, name, is_active, created_at`,
    [code, name, isActive, actorUserId]
  );
  return rows[0] ? mapOrganization(rows[0]) : null;
}

export async function updateOrganization({ id, code, name, isActive, actorUserId = null }) {
  const { rows } = await pool.query(
    `UPDATE organizations
        SET code = $1,
            name = $2,
            is_active = $3,
            updated_by = $4,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING id, code, name, is_active, created_at`,
    [code, name, isActive, actorUserId, id]
  );
  return rows[0] ? mapOrganization(rows[0]) : null;
}

export async function deleteOrganizationById(id) {
  return pool.query("DELETE FROM organizations WHERE id = $1", [id]);
}

export async function listRoleOptionsForSettings(organizationId) {
  const { rows } = await pool.query(
    `SELECT
       r.id,
       r.organization_id,
       r.label,
       r.sort_order,
       r.is_admin,
       r.is_active,
       r.created_at,
       COALESCE(
         ARRAY_AGG(LOWER(p.code) ORDER BY p.sort_order ASC, p.id ASC)
         FILTER (WHERE p.id IS NOT NULL AND p.is_active = TRUE),
         '{}'
       ) AS permission_codes
     FROM role_options r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE r.organization_id = $1
    GROUP BY r.id
    ORDER BY r.sort_order ASC, r.id ASC`,
    [organizationId]
  );
  return rows.map(mapRoleOption);
}

export async function getRoleOptionById(id, organizationId = null, allowGlobal = true) {
  return getRoleOptionByIdWithDb(pool, id, organizationId, allowGlobal);
}

export async function listPermissionOptionsForSettings() {
  const { rows } = await pool.query(
    `SELECT id, code, label, sort_order, is_active, created_at
       FROM permissions
      WHERE is_active = TRUE
        AND LOWER(code) <> ALL($1::text[])
        AND LOWER(code) NOT LIKE ANY($2::text[])
      ORDER BY sort_order ASC, id ASC`,
    [[
      "clients.menu",
      "appointments.menu",
      "appointments.vip-clients",
      "appointments.assignments",
      "appointments.statistics",
      "appointments.notify.to-manager",
      "appointments.notify.to-specialist",
      "notifications.schedule.to-manager",
      "notifications.schedule.to-specialist",
      "appointments.schedule.scope.all",
      "appointments.schedule.scope.assigned"
    ], [
      "appointments.notify.%",
      "notifications.schedule.%",
      "appointments.schedule.scope.%"
    ]]
  );
  return rows.map(mapPermissionOption);
}

export async function createRoleOption({ organizationId, label, sortOrder, isActive, permissionCodes = [], actorUserId = null }) {
  let roleId = null;
  const item = await executeTransaction(async (client) => {
    const insertResult = await client.query(
      `INSERT INTO role_options (organization_id, label, sort_order, is_active, is_admin, created_by, updated_by)
       VALUES ($1, $2, $3, $4, FALSE, $5, $5)
       RETURNING id`,
      [organizationId, label, sortOrder, isActive, actorUserId]
    );

    roleId = Number(insertResult.rows[0]?.id || 0);
    if (!roleId) {
      return null;
    }

    const permissionIds = await resolvePermissionIdsByCodes(client, permissionCodes);
    await replaceRolePermissions(client, roleId, permissionIds, actorUserId);
    return getRoleOptionByIdWithDb(client, roleId, organizationId);
  });
  if (roleId) clearRolePermissionsCache(roleId);
  return item;
}

export async function updateRoleOption({ id, organizationId, label, sortOrder, isActive, permissionCodes = [], actorUserId = null }) {
  const item = await executeTransaction(async (client) => {
    const updateResult = await client.query(
      `UPDATE role_options
          SET label = $1,
              sort_order = $2,
              is_active = $3,
              updated_by = $4,
              updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
        AND organization_id = $6
        RETURNING id`,
      [label, sortOrder, isActive, actorUserId, id, organizationId]
    );

    if (updateResult.rowCount === 0) {
      return null;
    }

    const permissionIds = await resolvePermissionIdsByCodes(client, permissionCodes);
    await replaceRolePermissions(client, id, permissionIds, actorUserId);
    return getRoleOptionByIdWithDb(client, id, organizationId);
  });
  if (item) clearRolePermissionsCache(id);
  return item;
}

export async function deleteRoleOptionById(id, organizationId) {
  const result = await pool.query(
    "DELETE FROM role_options WHERE id = $1 AND organization_id = $2",
    [id, organizationId]
  );
  if ((result?.rowCount || 0) > 0) {
    clearRolePermissionsCache(id);
  }
  return result;
}

export async function listPositionOptionsForSettings(organizationId) {
  const { rows } = await pool.query(
    `SELECT id, organization_id, label, sort_order, is_active, created_at
       FROM position_options
      WHERE organization_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [organizationId]
  );
  return rows.map(mapOption);
}

export async function getPositionOptionById(id, organizationId, allowGlobal = true) {
  const params = [id];
  let scopeSql = "";
  if (organizationId) {
    params.push(organizationId);
    scopeSql = allowGlobal
      ? "AND (organization_id = $2 OR organization_id IS NULL)"
      : "AND organization_id = $2";
  }
  const { rows } = await pool.query(
    `SELECT id, organization_id, label, sort_order, is_active, created_at
       FROM position_options
      WHERE id = $1
        ${scopeSql}
      LIMIT 1`,
    params
  );
  return rows[0] ? mapOption(rows[0]) : null;
}

export async function createPositionOption({ organizationId, label, sortOrder, isActive, actorUserId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO position_options (organization_id, label, sort_order, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5)
     RETURNING id, organization_id, label, sort_order, is_active, created_at`,
    [organizationId, label, sortOrder, isActive, actorUserId]
  );
  return rows[0] ? mapOption(rows[0]) : null;
}

export async function updatePositionOption({ id, organizationId, label, sortOrder, isActive, actorUserId = null }) {
  const { rows } = await pool.query(
    `UPDATE position_options
        SET label = $1,
            sort_order = $2,
            is_active = $3,
            updated_by = $4,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
        AND organization_id = $6
      RETURNING id, organization_id, label, sort_order, is_active, created_at`,
    [label, sortOrder, isActive, actorUserId, id, organizationId]
  );
  return rows[0] ? mapOption(rows[0]) : null;
}

export async function deletePositionOptionById(id, organizationId) {
  return pool.query("DELETE FROM position_options WHERE id = $1 AND organization_id = $2", [id, organizationId]);
}
