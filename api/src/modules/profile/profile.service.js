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
       (COALESCE(u.is_platform_admin, FALSE) OR COALESCE(r.is_admin, FALSE)) AS is_admin,
       COALESCE(u.is_platform_admin, FALSE) AS is_platform_admin,
       COALESCE(r.is_admin, FALSE) AS is_organization_admin,
       u.phone_number,
       p.label AS position,
       o.id AS organization_id,
       o.code AS organization_code,
       o.name AS organization_name
     FROM users u
     JOIN organizations o ON o.id = $2
     JOIN role_options r ON r.id = u.role_id
     LEFT JOIN position_options p ON p.id = u.position_id
     WHERE u.id = $1
       AND (u.organization_id = $2 OR COALESCE(u.is_platform_admin, FALSE) = TRUE)
       AND o.is_active = TRUE
     LIMIT 1`,
    [userId, organizationId]
  );
  return rows[0] || null;
}

const FIELD_CONFIG = {
  email:    { column: "email",        setExpr: "LOWER($1)", nullify: true  },
  fullName: { column: "full_name",    setExpr: "$1",        nullify: false },
  birthday: { column: "birthday",     setExpr: "$1",        nullify: true  },
  phone:    { column: "phone_number", setExpr: "$1",        nullify: true  },
  position: { column: "position_id",  setExpr: "$1::int",   nullify: true  },
};

export async function updateOwnProfileField({
  userId,
  organizationId,
  actorUserId,
  field,
  value,
  allowCrossOrganization = false
}) {
  if (field === "password") {
    const passwordHash = await argon2.hash(value);
    return pool.query(
      `UPDATE users
          SET password_hash = $1,
              updated_by = $2,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
          AND ($5::boolean = TRUE OR organization_id = $4)`,
      [passwordHash, actorUserId || null, userId, organizationId, allowCrossOrganization]
    );
  }

  const config = FIELD_CONFIG[field];
  if (!config) {
    throw new Error("Unsupported profile field.");
  }

  const dbValue = config.nullify ? (value || null) : value;
  return pool.query(
    `UPDATE users
        SET ${config.column} = ${config.setExpr},
            updated_by = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
        AND ($5::boolean = TRUE OR organization_id = $4)`,
    [dbValue, actorUserId || null, userId, organizationId, allowCrossOrganization]
  );
}
