import pool from "../../config/db.js";
import { createTtlCache } from "../../lib/ttl-cache.js";

const userOptionsCache = createTtlCache({
  maxEntries: 64,
  defaultTtlMs: 30_000
});

function buildUserOptionsCacheKey(organizationId) {
  const normalizedOrganizationId = Number.parseInt(String(organizationId || "").trim(), 10);
  return Number.isInteger(normalizedOrganizationId) && normalizedOrganizationId > 0
    ? `org:${normalizedOrganizationId}`
    : "org:all";
}

function cloneOptionList(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    value: String(item?.value || "").trim(),
    label: String(item?.label || "").trim()
  }));
}

function cloneUserOptionsPayload(payload) {
  const normalized = payload && typeof payload === "object" ? payload : {};
  return {
    roles: cloneOptionList(normalized.roles),
    positions: cloneOptionList(normalized.positions),
    permissions: cloneOptionList(normalized.permissions),
    specialists: cloneOptionList(normalized.specialists)
  };
}

function mapOptionRows(rows) {
  return rows
    .map((row) => ({
      value: String(row?.value || "").trim(),
      label: String(row?.label || "").trim()
    }))
    .filter((option) => option.value && option.label);
}

async function loadOptionsFromDb(table, valueExpr) {
  const { rows } = await pool.query(
    `SELECT ${valueExpr} AS value, label FROM ${table} WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC`
  );
  return mapOptionRows(rows);
}

async function loadScopedOptionsFromDb(table, valueExpr, organizationId) {
  const normalizedOrganizationId = Number.parseInt(String(organizationId || "").trim(), 10);
  if (!Number.isInteger(normalizedOrganizationId) || normalizedOrganizationId <= 0) {
    return loadOptionsFromDb(table, valueExpr);
  }

  const { rows } = await pool.query(
    `SELECT ${valueExpr} AS value, label
       FROM ${table}
      WHERE is_active = TRUE
        AND (organization_id = $1 OR organization_id IS NULL)
      ORDER BY
        CASE WHEN organization_id = $1 THEN 0 ELSE 1 END,
        sort_order ASC,
        id ASC`,
    [normalizedOrganizationId]
  );
  return mapOptionRows(rows);
}

async function loadScopedSpecialistOptions(organizationId) {
  const normalizedOrganizationId = Number.parseInt(String(organizationId || "").trim(), 10);
  if (!Number.isInteger(normalizedOrganizationId) || normalizedOrganizationId <= 0) {
    return [];
  }

  const { rows } = await pool.query(
    `SELECT
       u.id::text AS value,
       CASE
         WHEN COALESCE(NULLIF(TRIM(p.label), ''), '') <> ''
           THEN CONCAT(
             COALESCE(
               NULLIF(TRIM(u.full_name), ''),
               NULLIF(TRIM(u.username), ''),
               CONCAT('User #', u.id::text)
             ),
             ' (',
             p.label,
             ')'
           )
         ELSE COALESCE(
           NULLIF(TRIM(u.full_name), ''),
           NULLIF(TRIM(u.username), ''),
           CONCAT('User #', u.id::text)
         )
       END AS label
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      LEFT JOIN position_options p
        ON p.id = u.position_id
       AND (p.organization_id = u.organization_id OR p.organization_id IS NULL)
     WHERE u.organization_id = $1
       AND o.is_active = TRUE
     ORDER BY
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), u.id::text) ASC,
       u.id ASC`,
    [normalizedOrganizationId]
  );

  return mapOptionRows(rows);
}

export async function getUserOptions({ organizationId } = {}) {
  const cacheKey = buildUserOptionsCacheKey(organizationId);
  const cached = userOptionsCache.get(cacheKey);
  if (cached) {
    return cloneUserOptionsPayload(cached);
  }

  const [roles, positions, permissions, specialists] = await Promise.all([
    loadScopedOptionsFromDb("role_options", "id::text", organizationId),
    loadScopedOptionsFromDb("position_options", "id::text", organizationId),
    loadOptionsFromDb("permissions", "code"),
    loadScopedSpecialistOptions(organizationId)
  ]);

  const payload = { roles, positions, permissions, specialists };
  userOptionsCache.set(cacheKey, cloneUserOptionsPayload(payload));
  return payload;
}

export function clearUserOptionsCache() {
  userOptionsCache.clear();
}
