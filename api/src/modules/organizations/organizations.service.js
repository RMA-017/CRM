import pool from "../../config/db.js";

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

export async function findActiveOrganizationById(id) {
  const { rows } = await pool.query(
    `SELECT id, code, name
       FROM organizations
      WHERE id = $1
        AND is_active = TRUE
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}
