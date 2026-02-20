import argon2 from "argon2";
import pool from "../../config/db.js";

export async function findAuthUserForLogin({ username }) {
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.organization_id,
       u.role_id,
       u.username,
       u.password_hash,
       r.label AS role,
       r.is_admin,
       o.code AS organization_code,
       o.name AS organization_name
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      JOIN role_options r ON r.id = u.role_id
      WHERE u.username = $1
        AND o.is_active = TRUE
      LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

export async function findAuthUserById(userId, organizationId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.role_id, u.username, u.password_hash, r.label AS role, r.is_admin
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

export async function verifyPassword(password, passwordHash) {
  try {
    return await argon2.verify(String(passwordHash || ""), password);
  } catch {
    return false;
  }
}
