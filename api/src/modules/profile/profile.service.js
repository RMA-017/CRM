import argon2 from "argon2";
import pool from "../../config/db.js";

export async function getProfileByAuthContext({ userId, organizationId }) {
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.role_id,
       u.position_id,
       u.username,
       u.email,
       u.full_name,
       u.birthday,
       r.label AS role,
       r.is_admin,
       u.phone_number,
       p.label AS position,
       o.id AS organization_id,
       o.code AS organization_code,
       o.name AS organization_name
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     JOIN role_options r ON r.id = u.role_id
     LEFT JOIN position_options p ON p.id = u.position_id
     WHERE u.id = $1
       AND u.organization_id = $2
       AND o.is_active = TRUE
     LIMIT 1`,
    [userId, organizationId]
  );
  return rows[0] || null;
}

export async function updateOwnProfileField({ userId, organizationId, actorUserId, field, value }) {
  let sql = "";
  let values = [];

  if (field === "password") {
    const passwordHash = await argon2.hash(value);
    sql = "UPDATE users SET password_hash = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND organization_id = $4";
    values = [passwordHash, actorUserId || null, userId, organizationId];
  } else if (field === "email") {
    sql = "UPDATE users SET email = LOWER($1), updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND organization_id = $4";
    values = [value || null, actorUserId || null, userId, organizationId];
  } else if (field === "fullName") {
    sql = "UPDATE users SET full_name = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND organization_id = $4";
    values = [value, actorUserId || null, userId, organizationId];
  } else if (field === "birthday") {
    sql = "UPDATE users SET birthday = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND organization_id = $4";
    values = [value || null, actorUserId || null, userId, organizationId];
  } else if (field === "phone") {
    sql = "UPDATE users SET phone_number = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND organization_id = $4";
    values = [value || null, actorUserId || null, userId, organizationId];
  } else if (field === "position") {
    sql = `UPDATE users
              SET position_id = CASE WHEN $1::int IS NULL THEN NULL ELSE $1::int END
                , updated_by = $2
                , updated_at = CURRENT_TIMESTAMP
            WHERE id = $3 AND organization_id = $4`;
    values = [value || null, actorUserId || null, userId, organizationId];
  }

  if (!sql) {
    throw new Error("Unsupported profile field.");
  }

  return pool.query(sql, values);
}
