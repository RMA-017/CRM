import argon2 from "argon2";
import pool from "../../config/db.js";

export async function findRequester({ userId, organizationId }) {
  const { rows } = await pool.query(
    `SELECT u.id, u.role_id, r.is_admin, u.organization_id
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       JOIN role_options r ON r.id = u.role_id
      WHERE u.id = $1
        AND u.organization_id = $2
        AND o.is_active = TRUE`,
    [userId, organizationId]
  );
  return rows[0] || null;
}

export async function getUsersPage({
  organizationId,
  page,
  limit,
  canReadAllOrganizations = false,
  organizationCode = ""
}) {
  const baseParams = [];
  const whereParts = ["o.is_active = TRUE"];

  if (canReadAllOrganizations) {
    const normalizedOrganizationCode = String(organizationCode || "").trim().toLowerCase();
    if (normalizedOrganizationCode && normalizedOrganizationCode !== "all") {
      baseParams.push(normalizedOrganizationCode);
      whereParts.push(`LOWER(o.code) = $${baseParams.length}`);
    }
  } else {
    baseParams.push(organizationId);
    whereParts.push(`u.organization_id = $${baseParams.length}`);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;

  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      ${whereSql}`,
    baseParams
  );
  const total = Number(totalResult.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const pageParams = [...baseParams, limit, offset];

  const rowsResult = await pool.query(
    `SELECT
       u.id::text AS id,
       u.organization_id::text AS organization_id,
       o.code AS organization_code,
       o.name AS organization_name,
       u.username,
       u.email,
       u.full_name,
       u.birthday,
       u.phone_number,
       u.position_id::text AS position_id,
       u.role_id::text AS role_id,
       p.label AS position,
       r.label AS role,
       u.created_at
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      JOIN role_options r ON r.id = u.role_id
      LEFT JOIN position_options p ON p.id = u.position_id
      ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}`,
    pageParams
  );
  return {
    page: safePage,
    totalPages,
    total,
    rows: rowsResult.rows
  };
}

export async function getUserScopeById(userId) {
  const { rows } = await pool.query(
    "SELECT id::text AS id, organization_id::text AS organization_id FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  return rows[0] || null;
}

export async function findActiveOrganizationByCode(code) {
  const { rows } = await pool.query(
    `SELECT id, code, name
       FROM organizations
      WHERE LOWER(code) = LOWER($1)
        AND is_active = TRUE
      LIMIT 1`,
    [code]
  );
  return rows[0] || null;
}

export async function updateUserByAdmin({
  currentOrganizationId,
  nextOrganizationId = null,
  userId,
  username,
  email,
  fullName,
  birthday,
  phone,
  positionId,
  roleId,
  password
}) {
  let client = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const parsedNextOrganizationId = Number(nextOrganizationId);
    const targetOrganizationId = Number.isInteger(parsedNextOrganizationId) && parsedNextOrganizationId > 0
      ? parsedNextOrganizationId
      : Number(currentOrganizationId);

    const updateResult = await client.query(
      `UPDATE users
          SET organization_id = $1,
              username = $2,
              email = $3,
              full_name = $4,
              birthday = $5,
              phone_number = $6,
              position_id = $7::int,
              role_id = $8::int
        WHERE id = $9
          AND organization_id = $10`,
      [
        targetOrganizationId,
        username,
        email || null,
        fullName,
        birthday || null,
        phone || null,
        positionId,
        roleId,
        userId,
        currentOrganizationId
      ]
    );

    if (updateResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    if (password) {
      const passwordHash = await argon2.hash(password);
      await client.query(
        "UPDATE users SET password_hash = $1 WHERE id = $2 AND organization_id = $3",
        [passwordHash, userId, targetOrganizationId]
      );
    }

    const { rows } = await client.query(
      `SELECT
         u.id::text AS id,
         u.organization_id::text AS organization_id,
         o.code AS organization_code,
         o.name AS organization_name,
         u.username,
         u.email,
         u.full_name,
         u.birthday,
         u.role_id::text AS role_id,
         r.label AS role,
         u.phone_number,
         u.position_id::text AS position_id,
         p.label AS position,
         u.created_at
        FROM users u
        JOIN organizations o ON o.id = u.organization_id
        JOIN role_options r ON r.id = u.role_id
        LEFT JOIN position_options p ON p.id = u.position_id
       WHERE u.id = $1
         AND u.organization_id = $2`,
      [userId, targetOrganizationId]
    );
    const user = rows[0] || null;

    if (!user) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query("COMMIT");
    return user;
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function deleteUserById(userId, organizationId) {
  return pool.query(
    "DELETE FROM users WHERE id = $1 AND organization_id = $2",
    [userId, organizationId]
  );
}
