import pool from "../../config/db.js";

function mapOrganization(row) {
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at
  };
}

function mapOption(row) {
  return {
    id: String(row.id),
    value: row.value,
    label: row.label,
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at
  };
}

export async function findSettingsRequester({ userId, organizationId }) {
  const { rows } = await pool.query(
    `SELECT u.id, u.role
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

export async function listOrganizations() {
  const { rows } = await pool.query(
    "SELECT id, code, name, is_active, created_at FROM organizations ORDER BY created_at DESC, id DESC"
  );
  return rows.map(mapOrganization);
}

export async function createOrganization({ code, name, isActive }) {
  const { rows } = await pool.query(
    "INSERT INTO organizations (code, name, is_active) VALUES ($1, $2, $3) RETURNING id, code, name, is_active, created_at",
    [code, name, isActive]
  );
  return rows[0] ? mapOrganization(rows[0]) : null;
}

export async function updateOrganization({ id, code, name, isActive }) {
  const { rows } = await pool.query(
    "UPDATE organizations SET code = $1, name = $2, is_active = $3 WHERE id = $4 RETURNING id, code, name, is_active, created_at",
    [code, name, isActive, id]
  );
  return rows[0] ? mapOrganization(rows[0]) : null;
}

export async function deleteOrganizationById(id) {
  return pool.query("DELETE FROM organizations WHERE id = $1", [id]);
}

export async function listRoleOptionsForSettings() {
  const { rows } = await pool.query(
    "SELECT id, value, label, sort_order, is_active, created_at FROM role_options ORDER BY sort_order ASC, id ASC"
  );
  return rows.map(mapOption);
}

export async function getRoleOptionById(id) {
  const { rows } = await pool.query(
    "SELECT id, value, label, sort_order, is_active, created_at FROM role_options WHERE id = $1 LIMIT 1",
    [id]
  );
  return rows[0] ? mapOption(rows[0]) : null;
}

export async function createRoleOption({ value, label, sortOrder, isActive }) {
  const { rows } = await pool.query(
    "INSERT INTO role_options (value, label, sort_order, is_active) VALUES ($1, $2, $3, $4) RETURNING id, value, label, sort_order, is_active, created_at",
    [value, label, sortOrder, isActive]
  );
  return rows[0] ? mapOption(rows[0]) : null;
}

export async function updateRoleOption({ id, value, label, sortOrder, isActive }) {
  const { rows } = await pool.query(
    "UPDATE role_options SET value = $1, label = $2, sort_order = $3, is_active = $4 WHERE id = $5 RETURNING id, value, label, sort_order, is_active, created_at",
    [value, label, sortOrder, isActive, id]
  );
  return rows[0] ? mapOption(rows[0]) : null;
}

export async function deleteRoleOptionById(id) {
  return pool.query("DELETE FROM role_options WHERE id = $1", [id]);
}

export async function listPositionOptionsForSettings() {
  const { rows } = await pool.query(
    "SELECT id, value, label, sort_order, is_active, created_at FROM position_options ORDER BY sort_order ASC, id ASC"
  );
  return rows.map(mapOption);
}

export async function getPositionOptionById(id) {
  const { rows } = await pool.query(
    "SELECT id, value, label, sort_order, is_active, created_at FROM position_options WHERE id = $1 LIMIT 1",
    [id]
  );
  return rows[0] ? mapOption(rows[0]) : null;
}

export async function createPositionOption({ value, label, sortOrder, isActive }) {
  const { rows } = await pool.query(
    "INSERT INTO position_options (value, label, sort_order, is_active) VALUES ($1, $2, $3, $4) RETURNING id, value, label, sort_order, is_active, created_at",
    [value, label, sortOrder, isActive]
  );
  return rows[0] ? mapOption(rows[0]) : null;
}

export async function updatePositionOption({ id, value, label, sortOrder, isActive }) {
  const { rows } = await pool.query(
    "UPDATE position_options SET value = $1, label = $2, sort_order = $3, is_active = $4 WHERE id = $5 RETURNING id, value, label, sort_order, is_active, created_at",
    [value, label, sortOrder, isActive, id]
  );
  return rows[0] ? mapOption(rows[0]) : null;
}

export async function deletePositionOptionById(id) {
  return pool.query("DELETE FROM position_options WHERE id = $1", [id]);
}
