import argon2 from "argon2";
import pool from "../../config/db.js";

export async function getActorForCreate({ userId, organizationId }) {
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

export async function createBasicUser({ organizationId, username, fullName, role, defaultPassword }) {
  const passwordHash = await argon2.hash(defaultPassword);
  const { rows } = await pool.query(
    `INSERT INTO users (
      organization_id, username, email, full_name, birthday, password_hash, phone_number, position, role
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, username, email, full_name, birthday, phone_number, position, role, created_at`,
    [organizationId, username, null, fullName, null, passwordHash, null, null, role]
  );
  return rows[0] || null;
}
