import argon2 from "argon2";
import pool from "../../config/db.js";

export async function findRequester({ userId, organizationId }) {
  const { rows } = await pool.query(
    `SELECT u.id, u.role, u.organization_id
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = $1
        AND u.organization_id = $2
        AND o.is_active = TRUE`,
    [userId, organizationId]
  );
  return rows[0] || null;
}

export async function getUsersPage({ organizationId, page, limit }) {
  const totalResult = await pool.query(
    "SELECT COUNT(*)::int AS total FROM users WHERE organization_id = $1",
    [organizationId]
  );
  const total = Number(totalResult.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const rowsResult = await pool.query(
    `SELECT id::text AS id, username, email, full_name, birthday, phone_number, position, role, created_at
       FROM users
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [organizationId, limit, offset]
  );
  return {
    page: safePage,
    totalPages,
    total,
    rows: rowsResult.rows
  };
}

export async function updateUserByAdmin({
  organizationId,
  userId,
  username,
  email,
  fullName,
  birthday,
  phone,
  position,
  role,
  password
}) {
  let client = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const updateResult = await client.query(
      "UPDATE users SET username = $1, email = $2, full_name = $3, birthday = $4, phone_number = $5, position = $6, role = $7 WHERE id = $8 AND organization_id = $9",
      [username, email || null, fullName, birthday || null, phone || null, position || null, role, userId, organizationId]
    );

    if (updateResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    if (password) {
      const passwordHash = await argon2.hash(password);
      await client.query(
        "UPDATE users SET password_hash = $1 WHERE id = $2 AND organization_id = $3",
        [passwordHash, userId, organizationId]
      );
    }

    const { rows } = await client.query(
      "SELECT id::text AS id, username, email, full_name, birthday, role, phone_number, position, created_at FROM users WHERE id = $1 AND organization_id = $2",
      [userId, organizationId]
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
