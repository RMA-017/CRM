import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { isValidPhoneInput, normalizePhoneDigits, normalizePhoneNumber } from "../../lib/phone-number.js";

function inputError(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }

export function normalizeCaregiverInput(body = {}) {
  const fullName = String(body.fullName || "").trim();
  const phone = String(body.phone || "").trim();
  if (fullName.length > 255 || (phone && !fullName)) throw inputError("INVALID_NAME");
  if (phone && !isValidPhoneInput(phone)) throw inputError("INVALID_PHONE");
  if (body.clientId !== undefined && (!Number.isInteger(body.clientId) || body.clientId < 1 || body.clientId > 2147483647)) throw inputError("INVALID_CLIENTS");
  return { fullName, phone: phone ? normalizePhoneNumber(phone) : "", phoneDigits: phone ? normalizePhoneDigits(phone) : "", clientId: body.clientId };
}

export async function listCaregivers({ organizationId, search = "", page = 1 }) {
  const params = [organizationId, `%${search}%`];
  // Enrollment remains the source of the child roster, including legacy unassigned children.
  const join = `FROM internal_lesson_clients enrollment
    JOIN clients c ON c.organization_id = enrollment.organization_id AND c.id = enrollment.client_id
    LEFT JOIN LATERAL (SELECT cg.id, cg.full_name, cg.phone_number FROM caregiver_clients cc
      JOIN caregivers cg ON cg.organization_id = cc.organization_id AND cg.id = cc.caregiver_id
      WHERE cc.organization_id = enrollment.organization_id AND cc.client_id = enrollment.client_id
      ORDER BY cg.is_active DESC, cg.id LIMIT 1) cg ON TRUE`;
  const where = `enrollment.organization_id = $1 AND (concat_ws(' ', c.last_name, c.first_name, c.middle_name) ILIKE $2
    OR cg.full_name ILIKE $2 OR cg.phone_number ILIKE $2 OR c.id::text ILIKE $2)`;
  const count = await pool.query(`SELECT COUNT(*)::integer AS total ${join} WHERE ${where}`, params);
  const total = count.rows[0].total;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const safePage = Math.min(page, totalPages);
  const { rows } = await pool.query(`SELECT c.id, c.id AS "clientId",
    concat_ws(' ', c.last_name, c.first_name, c.middle_name) AS "clientName",
    cg.id AS "caregiverId", COALESCE(cg.full_name, enrollment.caregiver_name, '') AS "fullName", COALESCE(cg.phone_number, '') AS phone
    ${join} WHERE ${where} ORDER BY LOWER(c.last_name), LOWER(c.first_name), c.id LIMIT 20 OFFSET $3`, [...params, (safePage - 1) * 20]);
  return { items: rows, pagination: { page: safePage, totalPages, total } };
}

export async function searchCaregiverClients({ organizationId, search = "", page = 1 }) {
  search = search.trim();
  if (search.length < 3) return { items: [], hasNext: false };
  const { rows } = await pool.query(`SELECT c.id, concat_ws(' ', c.last_name, c.first_name, c.middle_name) AS name
    FROM clients c WHERE c.organization_id = $1
    AND (concat_ws(' ', c.last_name, c.first_name, c.middle_name) ILIKE $2 OR c.id::text = $3)
    AND NOT EXISTS (SELECT 1 FROM internal_lesson_clients e WHERE e.organization_id = c.organization_id AND e.client_id = c.id)
    ORDER BY LOWER(c.last_name), LOWER(c.first_name), c.id LIMIT 51 OFFSET $4`, [organizationId, `%${search}%`, search, (page - 1) * 50]);
  return { items: rows.slice(0, 50), hasNext: rows.length > 50 };
}

export async function getCaregiverContact({ organizationId, phone }) {
  if (!isValidPhoneInput(phone)) return { item: null };
  const { rows } = await pool.query(`SELECT id, full_name AS "fullName", phone_number AS phone,
    (SELECT COUNT(*)::integer FROM caregiver_clients cc WHERE cc.organization_id = cg.organization_id AND cc.caregiver_id = cg.id) AS "childCount"
    FROM caregivers cg WHERE organization_id = $1 AND phone_digits = $2`, [organizationId, normalizePhoneDigits(phone)]);
  return { item: rows[0] || null };
}

async function lockRoster(db, organizationId, clientId) {
  // Serialize roster writes so orphan cleanup cannot race another child assignment.
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`caregiver-roster:${organizationId}`]);
  const child = await db.query("SELECT id FROM clients WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, clientId]);
  if (!child.rows.length) throw inputError("INVALID_CLIENTS");
}

async function cleanOrphans(db, organizationId, caregiverIds) {
  if (!caregiverIds.length) return;
  await db.query(`DELETE FROM caregivers cg WHERE cg.organization_id = $1 AND cg.id = ANY($2::integer[])
    AND NOT EXISTS (SELECT 1 FROM caregiver_clients cc WHERE cc.organization_id = cg.organization_id AND cc.caregiver_id = cg.id)`, [organizationId, caregiverIds]);
}

export async function saveCaregiver({ organizationId, id = null, input }) {
  const clientId = id || input.clientId;
  if (!Number.isInteger(clientId) || clientId < 1 || clientId > 2147483647) throw inputError("INVALID_CLIENTS");
  return executeTransaction(async (db) => {
    await lockRoster(db, organizationId, clientId);
    const enrollment = await db.query("SELECT client_id FROM internal_lesson_clients WHERE organization_id = $1 AND client_id = $2 FOR UPDATE", [organizationId, clientId]);
    if (id && !enrollment.rows.length) throw inputError("NOT_FOUND", 404);
    if (!id && enrollment.rows.length) throw inputError("ALREADY_ENROLLED", 409);
    const previous = await db.query("SELECT caregiver_id FROM caregiver_clients WHERE organization_id = $1 AND client_id = $2", [organizationId, clientId]);
    // A phone identifies one caregiver; name corrections apply to all children of that contact.
    const result = input.phone ? await db.query(`INSERT INTO caregivers (organization_id, full_name, phone_number, phone_digits, is_active)
      VALUES ($1,$2,$3,$4,TRUE) ON CONFLICT (organization_id, phone_digits)
      DO UPDATE SET full_name = EXCLUDED.full_name, phone_number = EXCLUDED.phone_number, is_active = TRUE, updated_at = CURRENT_TIMESTAMP
      RETURNING id`, [organizationId, input.fullName, input.phone, input.phoneDigits]) : { rows: [] };
    const caregiverId = result.rows[0]?.id || null;
    if (!id) await db.query("INSERT INTO internal_lesson_clients (organization_id, client_id) VALUES ($1,$2)", [organizationId, clientId]);
    await db.query("UPDATE internal_lesson_clients SET caregiver_name = $3 WHERE organization_id = $1 AND client_id = $2", [organizationId, clientId, input.fullName]);
    await db.query("DELETE FROM caregiver_clients WHERE organization_id = $1 AND client_id = $2", [organizationId, clientId]);
    if (caregiverId) await db.query("INSERT INTO caregiver_clients (organization_id, caregiver_id, client_id) VALUES ($1,$2,$3)", [organizationId, caregiverId, clientId]);
    await cleanOrphans(db, organizationId, previous.rows.map((row) => row.caregiver_id).filter((oldId) => oldId !== caregiverId));
    return { id: clientId, caregiverId };
  });
}

export async function deleteCaregiver({ organizationId, id }) {
  return executeTransaction(async (db) => {
    await lockRoster(db, organizationId, id);
    const previous = await db.query("SELECT caregiver_id FROM caregiver_clients WHERE organization_id = $1 AND client_id = $2", [organizationId, id]);
    const enrollment = await db.query("SELECT client_id FROM internal_lesson_clients WHERE organization_id = $1 AND client_id = $2 FOR UPDATE", [organizationId, id]);
    if (!enrollment.rows.length) throw inputError("NOT_FOUND", 404);
    await db.query("DELETE FROM caregiver_clients WHERE organization_id = $1 AND client_id = $2", [organizationId, id]);
    // FK cascade removes only recurring school lessons. Journal snapshots use SET NULL and remain intact.
    await db.query("DELETE FROM internal_lesson_clients WHERE organization_id = $1 AND client_id = $2", [organizationId, id]);
    await cleanOrphans(db, organizationId, previous.rows.map((row) => row.caregiver_id));
  });
}

export async function findCaregiverByPhone({ organizationId, phone }) {
  const { rows } = await pool.query(`SELECT id, full_name AS "fullName", phone_number AS phone FROM caregivers
    WHERE organization_id = $1 AND phone_digits = $2 AND is_active = TRUE`, [organizationId, normalizePhoneDigits(phone)]);
  if (!rows[0]) return null;
  const clients = await pool.query(`SELECT c.id, concat_ws(' ', c.last_name, c.first_name, c.middle_name) AS name
    FROM caregiver_clients cc JOIN clients c ON c.organization_id = cc.organization_id AND c.id = cc.client_id
    WHERE cc.organization_id = $1 AND cc.caregiver_id = $2 ORDER BY c.last_name, c.first_name, c.id`, [organizationId, rows[0].id]);
  return { ...rows[0], clients: clients.rows };
}
