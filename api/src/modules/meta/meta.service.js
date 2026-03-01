import pool from "../../config/db.js";

function mapOptionRows(rows) {
  return rows
    .map((row) => ({
      value: String(row?.value || "").trim(),
      label: String(row?.label || "").trim()
    }))
    .filter((option) => option.value && option.label);
}

async function loadOptionsFromDb(table, valueExpr) {
  const { rows } = await pool.query(
    `SELECT ${valueExpr} AS value, label FROM ${table} WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC`
  );
  return mapOptionRows(rows);
}

export async function getUserOptions() {
  const [roles, positions, permissions] = await Promise.all([
    loadOptionsFromDb("role_options", "id::text"),
    loadOptionsFromDb("position_options", "id::text"),
    loadOptionsFromDb("permissions", "code")
  ]);

  return { roles, positions, permissions };
}
