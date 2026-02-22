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

function normalizeSearchToken(value) {
  return String(value || "").trim().toLowerCase();
}

export async function getClientsPage({
  organizationId,
  page,
  limit,
  search = "",
  firstName = "",
  lastName = "",
  middleName = ""
}) {
  const whereParts = ["c.organization_id = $1", "o.is_active = TRUE"];
  const params = [organizationId];

  const normalizedFirstName = String(firstName || "").trim().toLowerCase();
  if (normalizedFirstName) {
    params.push(`${normalizedFirstName}%`);
    whereParts.push(`LOWER(COALESCE(c.first_name, '')) LIKE $${params.length}`);
  }

  const normalizedLastName = String(lastName || "").trim().toLowerCase();
  if (normalizedLastName) {
    params.push(`${normalizedLastName}%`);
    whereParts.push(`LOWER(COALESCE(c.last_name, '')) LIKE $${params.length}`);
  }

  const normalizedMiddleName = String(middleName || "").trim().toLowerCase();
  if (normalizedMiddleName) {
    params.push(`${normalizedMiddleName}%`);
    whereParts.push(`LOWER(COALESCE(c.middle_name, '')) LIKE $${params.length}`);
  }

  const normalizedSearch = String(search || "").trim().toLowerCase();
  if (normalizedSearch) {
    const usePrefixOnly = normalizedSearch.length < 4;
    params.push(`${normalizedSearch}%`);
    const prefixParamIndex = params.length;

    if (usePrefixOnly) {
      whereParts.push(`(
        LOWER(COALESCE(c.first_name, '')) LIKE $${prefixParamIndex}
        OR LOWER(COALESCE(c.last_name, '')) LIKE $${prefixParamIndex}
        OR LOWER(COALESCE(c.middle_name, '')) LIKE $${prefixParamIndex}
        OR COALESCE(c.phone_number, '') LIKE $${prefixParamIndex}
      )`);
    } else {
      params.push(`%${normalizedSearch}%`);
      const containsParamIndex = params.length;
      whereParts.push(`(
        LOWER(COALESCE(c.first_name, '')) LIKE $${prefixParamIndex}
        OR LOWER(COALESCE(c.last_name, '')) LIKE $${prefixParamIndex}
        OR LOWER(COALESCE(c.middle_name, '')) LIKE $${prefixParamIndex}
        OR COALESCE(c.phone_number, '') LIKE $${prefixParamIndex}
        OR LOWER(COALESCE(c.tg_mail, '')) LIKE $${containsParamIndex}
        OR LOWER(COALESCE(c.note, '')) LIKE $${containsParamIndex}
      )`);
    }
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

export async function searchClientsForSchedule({
  organizationId,
  firstName = "",
  lastName = "",
  middleName = "",
  limit = 50
}) {
  const normalizedFirstName = normalizeSearchToken(firstName);
  const normalizedLastName = normalizeSearchToken(lastName);
  const normalizedMiddleName = normalizeSearchToken(middleName);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50;

  const { rows } = await pool.query(
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
       c.note
      FROM clients c
      JOIN organizations o ON o.id = c.organization_id
     WHERE c.organization_id = $1
       AND o.is_active = TRUE
       AND ($2 = '' OR LOWER(c.first_name) LIKE $2 || '%')
       AND ($3 = '' OR LOWER(c.last_name) LIKE $3 || '%')
       AND ($4 = '' OR (c.middle_name IS NOT NULL AND LOWER(c.middle_name) LIKE $4 || '%'))
     ORDER BY
       LOWER(c.last_name) ASC,
       LOWER(c.first_name) ASC,
       LOWER(COALESCE(c.middle_name, '')) ASC,
       c.id ASC
     LIMIT $5`,
    [
      organizationId,
      normalizedFirstName,
      normalizedLastName,
      normalizedMiddleName,
      safeLimit
    ]
  );

  return rows || [];
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
