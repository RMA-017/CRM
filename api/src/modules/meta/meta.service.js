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

async function loadScopedOptionsFromDb(table, valueExpr, organizationId) {
  const normalizedOrganizationId = Number.parseInt(String(organizationId || "").trim(), 10);
  if (!Number.isInteger(normalizedOrganizationId) || normalizedOrganizationId <= 0) {
    return loadOptionsFromDb(table, valueExpr);
  }

  const { rows } = await pool.query(
    `SELECT ${valueExpr} AS value, label
       FROM ${table}
      WHERE is_active = TRUE
        AND (organization_id = $1 OR organization_id IS NULL)
      ORDER BY
        CASE WHEN organization_id = $1 THEN 0 ELSE 1 END,
        sort_order ASC,
        id ASC`,
    [normalizedOrganizationId]
  );
  return mapOptionRows(rows);
}

export async function getUserOptions({ organizationId } = {}) {
  const [roles, positions, permissions] = await Promise.all([
    loadScopedOptionsFromDb("role_options", "id::text", organizationId),
    loadScopedOptionsFromDb("position_options", "id::text", organizationId),
    loadOptionsFromDb("permissions", "code")
  ]);

  return { roles, positions, permissions };
}
