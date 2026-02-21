import pool from "../../config/db.js";

export async function findClientsRequester({ userId, organizationId }) {
  const { rows } = await pool.query(
    `SELECT u.id, u.role_id
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = $1
        AND u.organization_id = $2
        AND o.is_active = TRUE
      LIMIT 1`,
    [userId, organizationId]
  );
  return rows[0] || null;
}

export async function getClientsPage({ organizationId, page, limit, search = "" }) {
  const whereParts = ["c.organization_id = $1", "o.is_active = TRUE"];
  const params = [organizationId];

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch) {
    params.push(`%${normalizedSearch}%`);
    whereParts.push(`(
      c.first_name ILIKE $${params.length}
      OR c.last_name ILIKE $${params.length}
      OR COALESCE(c.middle_name, '') ILIKE $${params.length}
      OR COALESCE(c.phone_number, '') ILIKE $${params.length}
      OR COALESCE(c.tg_mail, '') ILIKE $${params.length}
      OR COALESCE(c.note, '') ILIKE $${params.length}
    )`);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;

  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM clients c
       JOIN organizations o ON o.id = c.organization_id
      ${whereSql}`,
    params
  );

  const total = Number(totalResult.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;

  const rowsResult = await pool.query(
    `SELECT
       c.id::text AS id,
       c.organization_id::text AS organization_id,
       c.first_name,
       c.last_name,
       c.middle_name,
       c.birthday,
       c.phone_number,
       c.tg_mail,
       c.is_vip,
       c.created_by::text AS created_by,
       c.updated_by::text AS updated_by,
       COALESCE(
         NULLIF(TRIM(u.full_name), ''),
         NULLIF(TRIM(u.username), ''),
         c.created_by::text
       ) AS created_by_name,
       COALESCE(
         NULLIF(TRIM(uu.full_name), ''),
         NULLIF(TRIM(uu.username), ''),
         c.updated_by::text
       ) AS updated_by_name,
       c.created_at,
       c.updated_at,
       c.note
      FROM clients c
      JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN users u ON u.id = c.created_by
       AND u.organization_id = c.organization_id
      LEFT JOIN users uu ON uu.id = c.updated_by
       AND uu.organization_id = c.organization_id
      ${whereSql}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    total,
    totalPages,
    page: safePage,
    rows: rowsResult.rows
  };
}

export async function createClient({
  organizationId,
  firstName,
  lastName,
  middleName,
  birthday,
  phone,
  tgMail,
  isVip,
  note,
  createdBy
}) {
  const { rows } = await pool.query(
    `INSERT INTO clients (
       organization_id,
       first_name,
       last_name,
       middle_name,
       birthday,
       phone_number,
       tg_mail,
       is_vip,
       created_by,
       updated_by,
       note
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING
       id::text AS id,
       organization_id::text AS organization_id,
       first_name,
       last_name,
       middle_name,
       birthday,
       phone_number,
       tg_mail,
       is_vip,
       created_by::text AS created_by,
       updated_by::text AS updated_by,
       created_at,
       updated_at,
       note`,
    [
      organizationId,
      firstName,
      lastName,
      middleName || null,
      birthday,
      phone || null,
      tgMail || null,
      Boolean(isVip),
      createdBy || null,
      createdBy || null,
      note || null
    ]
  );
  return rows[0] || null;
}

export async function updateClientById({
  id,
  organizationId,
  firstName,
  lastName,
  middleName,
  birthday,
  phone,
  tgMail,
  isVip,
  note,
  updatedBy
}) {
  const { rows } = await pool.query(
    `UPDATE clients
        SET first_name = $1,
            last_name = $2,
            middle_name = $3,
            birthday = $4,
            phone_number = $5,
            tg_mail = $6,
            note = $7,
            is_vip = COALESCE($8, is_vip),
            updated_by = $9,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
        AND organization_id = $11
      RETURNING
        id::text AS id,
        organization_id::text AS organization_id,
        first_name,
        last_name,
        middle_name,
        birthday,
        phone_number,
        tg_mail,
        is_vip,
        created_by::text AS created_by,
        updated_by::text AS updated_by,
        created_at,
        updated_at,
        note`,
    [
      firstName,
      lastName,
      middleName || null,
      birthday,
      phone || null,
      tgMail || null,
      note || null,
      isVip ?? null,
      updatedBy || null,
      id,
      organizationId
    ]
  );
  return rows[0] || null;
}

export async function deleteClientById({ id, organizationId }) {
  return pool.query(
    "DELETE FROM clients WHERE id = $1 AND organization_id = $2",
    [id, organizationId]
  );
}
