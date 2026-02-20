import argon2 from "argon2";
import pool from "../../config/db.js";

export async function findAuthUserForLogin({ organizationCode, username }) {
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.organization_id,
       u.username,
       u.password_hash,
       u.role,
       o.code AS organization_code,
       o.name AS organization_name
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE LOWER(o.code) = LOWER($1)
       AND u.username = $2
       AND o.is_active = TRUE
     LIMIT 1`,
    [organizationCode, username]
  );
  return rows[0] || null;
}

export async function findAuthUserById(userId, organizationId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.password_hash, u.role
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = $1
        AND u.organization_id = $2
        AND o.is_active = TRUE`,
    [userId, organizationId]
  );
  return rows[0] || null;
}

export async function verifyPassword(password, passwordHash) {
  try {
    return await argon2.verify(String(passwordHash || ""), password);
  } catch {
    return false;
  }
}
