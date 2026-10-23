import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { isValidPhoneInput, normalizePhoneDigits, normalizePhoneNumber } from "../../lib/phone-number.js";

function inputError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

export function normalizeCaregiverInput(body = {}) {
  const fullName = String(body.fullName || "").trim();
  if (!fullName || fullName.length > 255) throw inputError("INVALID_NAME");
  if (!isValidPhoneInput(body.phone)) throw inputError("INVALID_PHONE");
  if (typeof body.isActive !== "boolean") throw inputError("INVALID_STATUS");
  if (!Array.isArray(body.clientIds) || body.clientIds.length > 10000
    || body.clientIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw inputError("INVALID_CLIENTS");
  }
  return {
    fullName,
    phone: normalizePhoneNumber(body.phone),
    phoneDigits: normalizePhoneDigits(body.phone),
    isActive: body.isActive,
    clientIds: [...new Set(body.clientIds)]
  };
}

export async function listCaregivers({ organizationId, search = "", page = 1 }) {
  const params = [organizationId, `%${search}%`];
  const where = `organization_id = $1 AND (full_name ILIKE $2 OR phone_number ILIKE $2)`;
  const count = await pool.query(`SELECT COUNT(*)::integer AS total FROM caregivers WHERE ${where}`, params);
  const total = count.rows[0].total;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const safePage = Math.min(page, totalPages);
  const { rows } = await pool.query(
    `SELECT cg.id, cg.full_name AS "fullName", cg.phone_number AS phone, cg.is_active AS "isActive",
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'id', c.id, 'name', concat_ws(' ', c.last_name, c.first_name, c.middle_name))
         ORDER BY c.last_name, c.first_name, c.id)
         FROM caregiver_clients cc JOIN clients c
           ON c.organization_id = cc.organization_id AND c.id = cc.client_id
         WHERE cc.organization_id = cg.organization_id AND cc.caregiver_id = cg.id), '[]'::jsonb) AS clients
     FROM caregivers cg WHERE ${where}
     ORDER BY LOWER(full_name), id LIMIT 20 OFFSET $3`, [...params, (safePage - 1) * 20]
  );
  return { items: rows, pagination: { page: safePage, totalPages, total } };
}

export async function searchCaregiverClients({ organizationId, search = "", page = 1 }) {
  const { rows } = await pool.query(
    `SELECT id, concat_ws(' ', last_name, first_name, middle_name) AS name
       FROM clients WHERE organization_id = $1
       AND (concat_ws(' ', last_name, first_name, middle_name) ILIKE $2 OR id::text = $3)
       ORDER BY LOWER(last_name), LOWER(first_name), id LIMIT 51 OFFSET $4`,
    [organizationId, `%${search}%`, search, (page - 1) * 50]
  );
  return { items: rows.slice(0, 50), hasNext: rows.length > 50 };
}

async function getCaregiverClientIds(db, organizationId, id) {
  const { rows } = await db.query(
    `SELECT id FROM caregivers WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [organizationId, id]
  );
  if (!rows[0]) throw inputError("NOT_FOUND", 404);
  const clients = await db.query(
    `SELECT client_id AS id FROM caregiver_clients WHERE organization_id = $1 AND caregiver_id = $2`, [organizationId, id]
  );
  return clients.rows.map((client) => client.id);
}

export async function saveCaregiver({ organizationId, id = null, input }) {
  return executeTransaction(async (db) => {
    const previousClientIds = id ? await getCaregiverClientIds(db, organizationId, id) : [];
    if (input.clientIds.length) {
      const clients = await db.query(
        "SELECT id, concat_ws(' ', last_name, first_name, middle_name) AS name FROM clients WHERE organization_id = $1 AND id = ANY($2::integer[]) ORDER BY id FOR KEY SHARE",
        [organizationId, input.clientIds]
      );
      if (clients.rows.length !== input.clientIds.length) throw inputError("INVALID_CLIENTS");
      await db.query(`INSERT INTO internal_lesson_clients (organization_id, client_id)
        SELECT $1, unnest($2::integer[]) ON CONFLICT (organization_id, client_id) DO NOTHING`, [organizationId, input.clientIds]);
    }
    const values = [organizationId, input.fullName, input.phone, input.phoneDigits, input.isActive];
    const result = id
      ? await db.query(`UPDATE caregivers SET full_name = $2, phone_number = $3, phone_digits = $4,
          is_active = $5, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $1 AND id = $6 RETURNING id`, [...values, id])
      : await db.query(`INSERT INTO caregivers (organization_id, full_name, phone_number, phone_digits, is_active)
          VALUES ($1,$2,$3,$4,$5) RETURNING id`, values);
    const caregiverId = result.rows[0].id;
    const oldIds = new Set(previousClientIds);
    const removedIds = [...oldIds].filter((clientId) => !input.clientIds.includes(clientId));
    const addedIds = input.clientIds.filter((clientId) => !oldIds.has(clientId));
    if (removedIds.length) await db.query(
      "DELETE FROM caregiver_clients WHERE organization_id = $1 AND caregiver_id = $2 AND client_id = ANY($3::integer[])",
      [organizationId, caregiverId, removedIds]
    );
    if (addedIds.length) {
      await db.query(`INSERT INTO caregiver_clients (organization_id, caregiver_id, client_id)
        SELECT $1, $2, unnest($3::integer[])`, [organizationId, caregiverId, addedIds]);
    }
    return { id: caregiverId };
  });
}

export async function deleteCaregiver({ organizationId, id }) {
  const result = await pool.query("DELETE FROM caregivers WHERE organization_id = $1 AND id = $2 RETURNING id", [organizationId, id]);
  if (!result.rows.length) throw inputError("NOT_FOUND", 404);
}

// Shared lookup for the future Telegram caregiver flow; no Telegram account is created here.
export async function findCaregiverByPhone({ organizationId, phone }) {
  const { rows } = await pool.query(
    `SELECT id, full_name AS "fullName", phone_number AS phone FROM caregivers
      WHERE organization_id = $1 AND phone_digits = $2 AND is_active = TRUE`,
    [organizationId, normalizePhoneDigits(phone)]
  );
  if (!rows[0]) return null;
  const clients = await pool.query(
    `SELECT c.id, concat_ws(' ', c.last_name, c.first_name, c.middle_name) AS name
     FROM caregiver_clients cc JOIN clients c ON c.organization_id = cc.organization_id AND c.id = cc.client_id
     WHERE cc.organization_id = $1 AND cc.caregiver_id = $2 ORDER BY c.last_name, c.first_name, c.id`,
    [organizationId, rows[0].id]
  );
  return { ...rows[0], clients: clients.rows };
}
