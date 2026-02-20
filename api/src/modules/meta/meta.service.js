import pool from "../../config/db.js";

function mapOptionRows(rows) {
  return rows
    .map((row) => ({
      value: String(row?.value || "").trim(),
      label: String(row?.label || "").trim()
    }))
    .filter((option) => option.value && option.label);
}

async function loadRoleOptionsFromDb() {
  const { rows } = await pool.query(
    "SELECT value, label FROM role_options WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC"
  );
  return mapOptionRows(rows);
}

async function loadPositionOptionsFromDb() {
  const { rows } = await pool.query(
    "SELECT value, label FROM position_options WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC"
  );
  return mapOptionRows(rows);
}

async function loadPermissionOptionsFromDb() {
  const { rows } = await pool.query(
    "SELECT code AS value, label FROM permissions WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC"
  );
  return mapOptionRows(rows);
}

export async function getUserOptions() {
  const [roles, positions, permissions] = await Promise.all([
    loadRoleOptionsFromDb(),
    loadPositionOptionsFromDb(),
    loadPermissionOptionsFromDb()
  ]);

  return { roles, positions, permissions };
}
