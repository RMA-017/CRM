import argon2 from "argon2";
import pool from "../../config/db.js";

export async function getActorForCreate({ userId, organizationId }) {
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

export async function createBasicUser({ organizationId, username, fullName, roleId, defaultPassword, actorUserId }) {
  const passwordHash = await argon2.hash(defaultPassword);
  const { rows } = await pool.query(
    `WITH created AS (
       INSERT INTO users (
         organization_id,
         username,
         email,
         full_name,
         birthday,
         password_hash,
         phone_number,
         position_id,
         role_id,
         created_by,
         updated_by
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         NULL,
         $8,
         $9,
         $9
       )
       RETURNING id, username, email, full_name, birthday, phone_number, position_id, role_id, created_at
     )
     SELECT
       c.id,
       c.username,
       c.email,
       c.full_name,
       c.birthday,
       c.phone_number,
       p.label AS position,
       r.label AS role,
       c.position_id::text AS position_id,
       c.role_id::text AS role_id,
       c.created_at
     FROM created c
     JOIN role_options r ON r.id = c.role_id
     LEFT JOIN position_options p ON p.id = c.position_id`,
    [organizationId, username, null, fullName, null, passwordHash, null, roleId, actorUserId || null]
  );
  return rows[0] || null;
}
