import pool from "../../config/db.js";

function mapService(row) {
  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    positionId: String(row?.position_id || "").trim(),
    positionName: String(row?.position_name || "").trim(),
    name: String(row?.name || "").trim(),
    priceUzs: Number.parseInt(String(row?.price_uzs ?? "0").trim(), 10) || 0,
    isActive: row?.is_active !== false,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

function parseServiceId(value) {
  const id = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export function normalizeServiceName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeServicePrice(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return 0;
  }
  const parsed = Number.parseInt(text, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function listServices({ organizationId, includeInactive = false, search = "", db = pool }) {
  const params = [organizationId];
  const filters = ["s.organization_id = $1"];
  if (!includeInactive) {
    filters.push("s.is_active = TRUE");
  }
  const query = normalizeServiceName(search).toLowerCase();
  if (query) {
    params.push(`%${query}%`);
    filters.push(`LOWER(s.name) LIKE $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT s.id,
            s.organization_id,
            s.position_id,
            p.label AS position_name,
            s.name,
            s.price_uzs,
            s.is_active,
            s.created_at,
            s.updated_at
       FROM service_catalog s
       JOIN position_options p
         ON p.organization_id = s.organization_id
        AND p.id = s.position_id
      WHERE ${filters.join(" AND ")}
      ORDER BY p.sort_order ASC, p.label ASC, s.name ASC, s.id ASC`,
    params
  );
  return rows.map(mapService);
}

export async function getServiceById({ organizationId, id, includeInactive = true, db = pool }) {
  const serviceId = parseServiceId(id);
  if (!serviceId) {
    return null;
  }
  const params = [organizationId, serviceId];
  const activeSql = includeInactive ? "" : "AND s.is_active = TRUE";
  const { rows } = await db.query(
    `SELECT s.id,
            s.organization_id,
            s.position_id,
            p.label AS position_name,
            s.name,
            s.price_uzs,
            s.is_active,
            s.created_at,
            s.updated_at
       FROM service_catalog s
       JOIN position_options p
         ON p.organization_id = s.organization_id
        AND p.id = s.position_id
      WHERE s.organization_id = $1
        AND s.id = $2
        ${activeSql}
      LIMIT 1`,
    params
  );
  return rows[0] ? mapService(rows[0]) : null;
}

export async function createService({ organizationId, positionId, name, priceUzs, actorUserId = null, db = pool }) {
  const { rows } = await db.query(
    `INSERT INTO service_catalog (organization_id, position_id, name, price_uzs, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5)
     RETURNING id`,
    [organizationId, positionId, name, priceUzs, actorUserId]
  );
  return getServiceById({ organizationId, id: rows[0]?.id, db });
}

export async function updateService({ organizationId, id, positionId, name, priceUzs, isActive, actorUserId = null, db = pool }) {
  const { rows } = await db.query(
    `UPDATE service_catalog
        SET position_id = $1,
            name = $2,
            price_uzs = $3,
            is_active = $4,
            updated_by = $5,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $6
        AND id = $7
      RETURNING id`,
    [positionId, name, priceUzs, isActive, actorUserId, organizationId, id]
  );
  return rows[0] ? getServiceById({ organizationId, id: rows[0].id, db }) : null;
}

export async function deactivateService({ organizationId, id, actorUserId = null, db = pool }) {
  const { rows } = await db.query(
    `UPDATE service_catalog
        SET is_active = FALSE,
            updated_by = $1,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $2
        AND id = $3
      RETURNING id`,
    [actorUserId, organizationId, id]
  );
  return rows[0] ? getServiceById({ organizationId, id: rows[0].id, db }) : null;
}

export async function hasActiveServicesForPosition({ organizationId, positionId, db = pool }) {
  const { rows } = await db.query(
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
