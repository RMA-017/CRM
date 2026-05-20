import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { createTtlCache } from "../../lib/ttl-cache.js";
import {
  normalizePermissionCode,
  normalizePermissionCodes
} from "../../lib/permission-codes.js";
import {
  filterKnownPermissionCodes,
  isKnownPermissionCode,
} from "../../lib/org-features.js";
import { clearRolePermissionsCache } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";

const settingsReadCache = createTtlCache({
  maxEntries: 128,
  defaultTtlMs: 30_000
});
const BASE_ROLE_PERMISSION_CODES = Object.freeze([PERMISSIONS.PROFILE_READ]);

function mergeBaseRolePermissionCodes(permissionCodes = []) {
  return normalizePermissionCodes([
    ...BASE_ROLE_PERMISSION_CODES,
    ...(Array.isArray(permissionCodes) ? permissionCodes : [])
  ]);
}

function cloneOrganizations(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    code: String(item?.code || "").trim(),
    name: String(item?.name || "").trim(),
    isActive: Boolean(item?.isActive),
    createdAt: item?.createdAt ?? null
  }));
}

function cloneOptionItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    label: String(item?.label || "").trim(),
    sortOrder: Number(item?.sortOrder || 0),
    organizationId: String(item?.organizationId || "").trim(),
    isActive: Boolean(item?.isActive),
    createdAt: item?.createdAt ?? null
  }));
}

function cloneServiceCatalogItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    organizationId: String(item?.organizationId || "").trim(),
    positionId: String(item?.positionId || "").trim(),
    positionLabel: String(item?.positionLabel || "").trim(),
    name: String(item?.name || "").trim(),
    priceUzs: Number.parseInt(String(item?.priceUzs ?? 0), 10) || 0,
    isActive: Boolean(item?.isActive),
    createdAt: item?.createdAt ?? null,
    updatedAt: item?.updatedAt ?? null
  }));
}

function cloneFinancePaymentMethodItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    organizationId: String(item?.organizationId || "").trim(),
    name: String(item?.name || "").trim(),
    sortOrder: Number(item?.sortOrder || 0),
    isActive: Boolean(item?.isActive),
    createdAt: item?.createdAt ?? null,
    updatedAt: item?.updatedAt ?? null
  }));
}

function clonePermissionOptions(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    code: normalizePermissionCode(item?.code),
    label: String(item?.label || "").trim(),
    sortOrder: Number(item?.sortOrder || 0),
    isActive: Boolean(item?.isActive),
    createdAt: item?.createdAt ?? null
  }));
}

function cloneRoleOptions(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    label: String(item?.label || "").trim(),
    sortOrder: Number(item?.sortOrder || 0),
    organizationId: String(item?.organizationId || "").trim(),
    isAdmin: Boolean(item?.isAdmin),
    isActive: Boolean(item?.isActive),
    createdAt: item?.createdAt ?? null,
    permissionCodes: mergeBaseRolePermissionCodes(item?.permissionCodes)
  }));
}

export function clearSettingsReadCaches() {
  settingsReadCache.clear();
}

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

function mapServiceCatalogItem(row) {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id || ""),
    positionId: String(row.position_id || ""),
    positionLabel: String(row.position_label || "").trim(),
    name: String(row.name || "").trim(),
    priceUzs: Number.parseInt(String(row.price_uzs ?? 0), 10) || 0,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFinancePaymentMethod(row) {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id || ""),
    name: String(row.name || "").trim(),
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function selectPermissionCodesForRoleWrite({
  requestedPermissionCodes = [],
  activePermissionCodes = [],
  isAdmin = false
}) {
  if (Boolean(isAdmin)) {
    return mergeBaseRolePermissionCodes(
      (Array.isArray(activePermissionCodes) ? activePermissionCodes : [])
        .map((code) => normalizePermissionCode(code))
        .filter(Boolean)
    );
  }

  return mergeBaseRolePermissionCodes(filterKnownPermissionCodes(requestedPermissionCodes));
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
  const permissionCodes = mergeBaseRolePermissionCodes(filterKnownPermissionCodes(
    Array.isArray(row.permission_codes)
      ? row.permission_codes.map((code) => normalizePermissionCode(code))
      : []
  ));

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

  const unknownCodes = normalizedCodes.filter((code) => !isKnownPermissionCode(code));
  if (unknownCodes.length > 0) {
    const error = new Error("Invalid permission code(s).");
    error.code = "INVALID_PERMISSION_CODES";
    error.invalidCodes = unknownCodes;
    throw error;
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

async function countUsersByRoleIdWithDb(db, roleId, organizationId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total
       FROM users
      WHERE role_id = $1
        AND organization_id = $2`,
    [roleId, organizationId]
  );

  return Number(rows[0]?.total || 0);
}

async function listActivePermissionRowsWithDb(db) {
  const { rows } = await db.query(
    `SELECT id, LOWER(code) AS code
       FROM permissions
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, id ASC`
  );

  return (rows || [])
    .map((row) => ({
      id: Number(row?.id || 0),
      code: normalizePermissionCode(row?.code)
    }))
    .filter((row) => Number.isInteger(row.id) && row.id > 0 && isKnownPermissionCode(row.code));
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

async function resolvePermissionIdsForRoleWrite(db, {
  organizationId,
  requestedPermissionCodes = [],
  isAdmin = false
}) {
  if (Boolean(isAdmin)) {
    const activePermissionRows = await listActivePermissionRowsWithDb(db);
    const selectedCodes = new Set(
      selectPermissionCodesForRoleWrite({
        activePermissionCodes: activePermissionRows.map((row) => row.code),
        isAdmin: true
      })
    );
    return activePermissionRows
      .filter((row) => selectedCodes.has(row.code))
      .map((row) => row.id);
  }

  return resolvePermissionIdsByCodes(
    db,
    selectPermissionCodesForRoleWrite({
      requestedPermissionCodes,
      isAdmin: false
    })
  );
}

async function syncAdminRolePermissionsByOrganizationWithDb(db, organizationId, actorUserId = null) {
  const { rows } = await db.query(
    `SELECT id
       FROM role_options
      WHERE organization_id = $1
        AND is_admin = TRUE`,
    [organizationId]
  );

  const roleIds = (rows || [])
    .map((row) => Number(row?.id || 0))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (roleIds.length === 0) {
    return [];
  }

  const permissionIds = await resolvePermissionIdsForRoleWrite(db, {
    organizationId,
    isAdmin: true
  });

  for (const roleId of roleIds) {
    await replaceRolePermissions(db, roleId, permissionIds, actorUserId);
  }

  return roleIds;
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
        AND r.is_active = TRUE
      WHERE u.id = $1
        AND u.organization_id = $2
        AND o.is_active = TRUE
      LIMIT 1`,
    [userId, organizationId]
  );
  return rows[0] || null;
}

export async function listOrganizations() {
  const cached = settingsReadCache.get("organizations");
  if (cached) {
    return cloneOrganizations(cached);
  }
  const { rows } = await pool.query(
    "SELECT id, code, name, is_active, created_at FROM organizations ORDER BY created_at DESC, id DESC"
  );
  const items = rows.map(mapOrganization);
  settingsReadCache.set("organizations", cloneOrganizations(items));
  return items;
}

export async function createOrganization({ code, name, isActive, actorUserId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO organizations (code, name, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $4)
     RETURNING id, code, name, is_active, created_at`,
    [code, name, isActive, actorUserId]
  );
  const item = rows[0] ? mapOrganization(rows[0]) : null;
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export async function updateOrganization({ id, code, name, isActive, actorUserId = null }) {
  const affectedRoleIds = new Set();
  const item = await executeTransaction(async (client) => {
    const { rows } = await client.query(
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
    if (!rows[0]) {
      return null;
    }

    const syncedAdminRoleIds = await syncAdminRolePermissionsByOrganizationWithDb(client, id, actorUserId);
    syncedAdminRoleIds.forEach((roleId) => affectedRoleIds.add(roleId));
    return mapOrganization(rows[0]);
  });

  affectedRoleIds.forEach((roleId) => {
    clearRolePermissionsCache(roleId);
  });
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export async function deleteOrganizationById(id) {
  const result = await executeTransaction(async (client) => {
    // Remove rows protected by RESTRICT constraints before deleting the org.
    await client.query("DELETE FROM appointment_schedules WHERE organization_id = $1", [id]);
    await client.query("DELETE FROM appointment_breaks WHERE organization_id = $1", [id]);
    await client.query("DELETE FROM clients WHERE organization_id = $1", [id]);
    await client.query("DELETE FROM users WHERE organization_id = $1", [id]);
    return client.query("DELETE FROM organizations WHERE id = $1", [id]);
  });
  if ((result?.rowCount || 0) > 0) {
    clearSettingsReadCaches();
  }
  return result;
}

export async function listRoleOptionsForSettings(organizationId) {
  const cacheKey = `roles|org:${organizationId}`;
  const cached = settingsReadCache.get(cacheKey);
  if (cached) {
    return cloneRoleOptions(cached);
  }
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
  const items = rows.map(mapRoleOption);
  settingsReadCache.set(cacheKey, cloneRoleOptions(items));
  return items;
}

export async function getRoleOptionById(id, organizationId = null, allowGlobal = true) {
  return getRoleOptionByIdWithDb(pool, id, organizationId, allowGlobal);
}

export async function listPermissionOptionsForSettings() {
  const cacheKey = "permissions";
  const cached = settingsReadCache.get(cacheKey);
  if (cached) {
    return clonePermissionOptions(cached);
  }
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
      "appointments.statistics",
      "appointments.schedule.scope.all",
      "appointments.schedule.scope.assigned"
    ], [
      "appointments.schedule.scope.%"
    ]]
  );
  const items = rows
    .map(mapPermissionOption)
    .filter((item) => isKnownPermissionCode(item?.code));
  settingsReadCache.set(cacheKey, clonePermissionOptions(items));
  return items;
}

export async function createRoleOption({ organizationId, label, sortOrder, isActive, isAdmin = false, permissionCodes = [], actorUserId = null }) {
  let roleId = null;
  const item = await executeTransaction(async (client) => {
    const normalizedIsAdmin = Boolean(isAdmin);
    const insertResult = await client.query(
      `INSERT INTO role_options (organization_id, label, sort_order, is_active, is_admin, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id`,
      [organizationId, label, sortOrder, isActive, normalizedIsAdmin, actorUserId]
    );

    roleId = Number(insertResult.rows[0]?.id || 0);
    if (!roleId) {
      return null;
    }

    const permissionIds = await resolvePermissionIdsForRoleWrite(client, {
      organizationId,
      requestedPermissionCodes: permissionCodes,
      isAdmin: normalizedIsAdmin
    });
    await replaceRolePermissions(client, roleId, permissionIds, actorUserId);
    return getRoleOptionByIdWithDb(client, roleId, organizationId);
  });
  if (roleId) clearRolePermissionsCache(roleId);
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export async function updateRoleOption({
  id,
  organizationId,
  label,
  sortOrder,
  isActive,
  isAdmin = null,
  permissionCodes = [],
  actorUserId = null
}) {
  const item = await executeTransaction(async (client) => {
    const existingRoleResult = await client.query(
      `SELECT is_admin
         FROM role_options
        WHERE id = $1
          AND organization_id = $2
        LIMIT 1
        FOR UPDATE`,
      [id, organizationId]
    );

    if ((existingRoleResult.rowCount || 0) === 0) {
      return null;
    }

    const nextIsAdmin = typeof isAdmin === "boolean"
      ? isAdmin
      : Boolean(existingRoleResult.rows[0]?.is_admin);
    if (isActive === false) {
      const assignedUsersCount = await countUsersByRoleIdWithDb(client, id, organizationId);
      if (assignedUsersCount > 0) {
        const error = new Error("Role cannot be deactivated while users are assigned to it.");
        error.code = "ROLE_DEACTIVATION_BLOCKED_ASSIGNED_USERS";
        throw error;
      }
    }
    const updateResult = await client.query(
      `UPDATE role_options
          SET label = $1,
              sort_order = $2,
              is_active = $3,
              is_admin = $4,
              updated_by = $5,
              updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
        AND organization_id = $7
        RETURNING id`,
      [label, sortOrder, isActive, nextIsAdmin, actorUserId, id, organizationId]
    );

    if (updateResult.rowCount === 0) {
      return null;
    }

    const permissionIds = await resolvePermissionIdsForRoleWrite(client, {
      organizationId,
      requestedPermissionCodes: permissionCodes,
      isAdmin: nextIsAdmin
    });
    await replaceRolePermissions(client, id, permissionIds, actorUserId);
    return getRoleOptionByIdWithDb(client, id, organizationId);
  });
  if (item) clearRolePermissionsCache(id);
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export async function deleteRoleOptionById(id, organizationId) {
  const result = await pool.query(
    "DELETE FROM role_options WHERE id = $1 AND organization_id = $2",
    [id, organizationId]
  );
  if ((result?.rowCount || 0) > 0) {
    clearRolePermissionsCache(id);
    clearSettingsReadCaches();
  }
  return result;
}

export async function listPositionOptionsForSettings(organizationId) {
  const cacheKey = `positions|org:${organizationId}`;
  const cached = settingsReadCache.get(cacheKey);
  if (cached) {
    return cloneOptionItems(cached);
  }
  const { rows } = await pool.query(
    `SELECT id, organization_id, label, sort_order, is_active, created_at
       FROM position_options
      WHERE organization_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [organizationId]
  );
  const items = rows.map(mapOption);
  settingsReadCache.set(cacheKey, cloneOptionItems(items));
  return items;
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
  const item = rows[0] ? mapOption(rows[0]) : null;
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
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
  const item = rows[0] ? mapOption(rows[0]) : null;
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export async function deletePositionOptionById(id, organizationId) {
  const result = await pool.query("DELETE FROM position_options WHERE id = $1 AND organization_id = $2", [id, organizationId]);
  if ((result?.rowCount || 0) > 0) {
    clearSettingsReadCaches();
  }
  return result;
}

function normalizeServiceCatalogStatus(status) {
  const normalized = String(status || "active").trim().toLowerCase();
  return ["active", "inactive", "all"].includes(normalized) ? normalized : "active";
}

async function fetchServiceCatalogItems(organizationId, status = "active") {
  const normalizedStatus = normalizeServiceCatalogStatus(status);
  const params = [organizationId];
  let statusSql = "";
  if (normalizedStatus === "active") {
    statusSql = "AND sc.is_active = TRUE";
  } else if (normalizedStatus === "inactive") {
    statusSql = "AND sc.is_active = FALSE";
  }
  const { rows } = await pool.query(
    `SELECT
       sc.id,
       sc.organization_id,
       sc.position_id,
       p.label AS position_label,
       sc.name,
       sc.price_uzs,
       sc.is_active,
       sc.created_at,
       sc.updated_at
      FROM service_catalog sc
      JOIN position_options p
        ON p.organization_id = sc.organization_id
       AND p.id = sc.position_id
     WHERE sc.organization_id = $1
       ${statusSql}
     ORDER BY p.sort_order ASC, p.label ASC, sc.name ASC, sc.id ASC`,
    params
  );
  return rows.map(mapServiceCatalogItem);
}

export async function listServiceCatalogForSettings(organizationId, status = "active") {
  const normalizedStatus = normalizeServiceCatalogStatus(status);
  const cacheKey = `services-settings|org:${organizationId}|status:${normalizedStatus}`;
  const cached = settingsReadCache.get(cacheKey);
  if (cached) {
    return cloneServiceCatalogItems(cached);
  }
  const items = await fetchServiceCatalogItems(organizationId, normalizedStatus);
  settingsReadCache.set(cacheKey, cloneServiceCatalogItems(items));
  return items;
}

export async function listActiveServices(organizationId) {
  const cacheKey = `services-active|org:${organizationId}`;
  const cached = settingsReadCache.get(cacheKey);
  if (cached) {
    return cloneServiceCatalogItems(cached);
  }
  const items = await fetchServiceCatalogItems(organizationId, "active");
  settingsReadCache.set(cacheKey, cloneServiceCatalogItems(items));
  return items;
}

export async function getServiceCatalogItemById(id, organizationId) {
  const { rows } = await pool.query(
    `SELECT
       sc.id,
       sc.organization_id,
       sc.position_id,
       p.label AS position_label,
       sc.name,
       sc.price_uzs,
       sc.is_active,
       sc.created_at,
       sc.updated_at
      FROM service_catalog sc
      JOIN position_options p
        ON p.organization_id = sc.organization_id
       AND p.id = sc.position_id
     WHERE sc.id = $1
       AND sc.organization_id = $2
     LIMIT 1`,
    [id, organizationId]
  );
  return rows[0] ? mapServiceCatalogItem(rows[0]) : null;
}

export async function createServiceCatalogItem({
  organizationId,
  positionId,
  name,
  priceUzs = 0,
  isActive = true,
  actorUserId = null
}) {
  const { rows } = await pool.query(
    `INSERT INTO service_catalog (
       organization_id,
       position_id,
       name,
       price_uzs,
       is_active,
       created_by,
       updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING id`,
    [organizationId, positionId, name, priceUzs, isActive, actorUserId]
  );
  const item = rows[0] ? await getServiceCatalogItemById(rows[0].id, organizationId) : null;
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export async function updateServiceCatalogItem({
  id,
  organizationId,
  positionId,
  name,
  priceUzs = 0,
  isActive = true,
  actorUserId = null
}) {
  const { rows } = await pool.query(
    `UPDATE service_catalog
        SET position_id = $1,
            name = $2,
            price_uzs = $3,
            is_active = $4,
            updated_by = $5,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
        AND organization_id = $7
      RETURNING id`,
    [positionId, name, priceUzs, isActive, actorUserId, id, organizationId]
  );
  const item = rows[0] ? await getServiceCatalogItemById(rows[0].id, organizationId) : null;
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export async function deactivateServiceCatalogItemById(id, organizationId, actorUserId = null) {
  const { rows } = await pool.query(
    `UPDATE service_catalog
        SET is_active = FALSE,
            updated_by = $3,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND organization_id = $2
      RETURNING id`,
    [id, organizationId, actorUserId]
  );
  const item = rows[0] ? await getServiceCatalogItemById(rows[0].id, organizationId) : null;
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export async function hasActiveServicesForPosition({ organizationId, positionId }) {
  const { rows } = await pool.query(
    `SELECT 1
       FROM service_catalog
      WHERE organization_id = $1
        AND position_id = $2
        AND is_active = TRUE
      LIMIT 1`,
    [organizationId, positionId]
  );
  return Boolean(rows[0]);
}

function normalizeSettingsStatus(status) {
  const normalized = String(status || "active").trim().toLowerCase();
  return ["active", "inactive", "all"].includes(normalized) ? normalized : "active";
}

export async function listFinancePaymentMethodsForSettings(organizationId, status = "active") {
  const normalizedStatus = normalizeSettingsStatus(status);
  const cacheKey = `finance-payment-methods|org:${organizationId}|status:${normalizedStatus}`;
  const cached = settingsReadCache.get(cacheKey);
  if (cached) {
    return cloneFinancePaymentMethodItems(cached);
  }

  let statusSql = "";
  if (normalizedStatus === "active") {
    statusSql = "AND is_active = TRUE";
  } else if (normalizedStatus === "inactive") {
    statusSql = "AND is_active = FALSE";
  }
  const { rows } = await pool.query(
    `SELECT id, organization_id, name, sort_order, is_active, created_at, updated_at
       FROM finance_payment_methods
      WHERE organization_id = $1
        ${statusSql}
      ORDER BY sort_order ASC, name ASC, id ASC`,
    [organizationId]
  );
  const items = rows.map(mapFinancePaymentMethod);
  settingsReadCache.set(cacheKey, cloneFinancePaymentMethodItems(items));
  return items;
}

export async function getFinancePaymentMethodById(id, organizationId) {
  const { rows } = await pool.query(
    `SELECT id, organization_id, name, sort_order, is_active, created_at, updated_at
       FROM finance_payment_methods
      WHERE id = $1
        AND organization_id = $2
      LIMIT 1`,
    [id, organizationId]
  );
  return rows[0] ? mapFinancePaymentMethod(rows[0]) : null;
}

export async function createFinancePaymentMethod({
  organizationId,
  name,
  sortOrder = 0,
  isActive = true,
  actorUserId = null
}) {
  const { rows } = await pool.query(
    `INSERT INTO finance_payment_methods (organization_id, name, sort_order, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5)
     RETURNING id`,
    [organizationId, name, sortOrder, isActive, actorUserId]
  );
  const item = rows[0] ? await getFinancePaymentMethodById(rows[0].id, organizationId) : null;
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export async function updateFinancePaymentMethod({
  id,
  organizationId,
  name,
  sortOrder = 0,
  isActive = true,
  actorUserId = null
}) {
  const { rows } = await pool.query(
    `UPDATE finance_payment_methods
        SET name = $1,
            sort_order = $2,
            is_active = $3,
            updated_by = $4,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
        AND organization_id = $6
      RETURNING id`,
    [name, sortOrder, isActive, actorUserId, id, organizationId]
  );
  const item = rows[0] ? await getFinancePaymentMethodById(rows[0].id, organizationId) : null;
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export async function deactivateFinancePaymentMethodById(id, organizationId, actorUserId = null) {
  const { rows } = await pool.query(
    `UPDATE finance_payment_methods
        SET is_active = FALSE,
            updated_by = $3,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND organization_id = $2
      RETURNING id`,
    [id, organizationId, actorUserId]
  );
  const item = rows[0] ? await getFinancePaymentMethodById(rows[0].id, organizationId) : null;
  if (item) {
    clearSettingsReadCaches();
  }
  return item;
}

export const __settingsServiceContracts = Object.freeze({
  selectPermissionCodesForRoleWrite
});
