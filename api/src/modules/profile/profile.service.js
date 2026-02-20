import argon2 from "argon2";
import pool from "../../config/db.js";

export async function getProfileByAuthContext({ userId, organizationId }) {
  const { rows } = await pool.query(
    `SELECT
       u.username,
       u.email,
       u.full_name,
       u.birthday,
       u.role,
       u.phone_number,
       u.position,
       o.id AS organization_id,
       o.code AS organization_code,
       o.name AS organization_name
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

export async function updateOwnProfileField({ userId, organizationId, field, value }) {
  let sql = "";
  let values = [];

  if (field === "password") {
    const passwordHash = await argon2.hash(value);
    sql = "UPDATE users SET password_hash = $1 WHERE id = $2 AND organization_id = $3";
    values = [passwordHash, userId, organizationId];
  } else if (field === "email") {
    sql = "UPDATE users SET email = $1 WHERE id = $2 AND organization_id = $3";
    values = [value || null, userId, organizationId];
  } else if (field === "fullName") {
    sql = "UPDATE users SET full_name = $1 WHERE id = $2 AND organization_id = $3";
    values = [value, userId, organizationId];
  } else if (field === "birthday") {
    sql = "UPDATE users SET birthday = $1 WHERE id = $2 AND organization_id = $3";
    values = [value || null, userId, organizationId];
  } else if (field === "phone") {
    sql = "UPDATE users SET phone_number = $1 WHERE id = $2 AND organization_id = $3";
    values = [value || null, userId, organizationId];
  } else if (field === "position") {
    sql = "UPDATE users SET position = $1 WHERE id = $2 AND organization_id = $3";
    values = [value || null, userId, organizationId];
  }

  return pool.query(sql, values);
}
