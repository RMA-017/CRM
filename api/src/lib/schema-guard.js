import pool from "../config/db.js";

function normalizeNames(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

export function createMigrationRequiredError(message, details = {}) {
  const error = new Error(message);
  error.code = "MIGRATION_REQUIRED";
  if (details && typeof details === "object" && Object.keys(details).length > 0) {
    error.details = details;
  }
  return error;
}

export function getMissingNames(existingNames, requiredNames) {
  const existingSet = existingNames instanceof Set
    ? existingNames
    : new Set(normalizeNames(Array.from(existingNames || [])));

  return normalizeNames(requiredNames).filter((name) => !existingSet.has(name));
}

export async function getExistingTableNames({
  tableNames = [],
  db = pool,
  schema = "public"
} = {}) {
  const normalizedTableNames = normalizeNames(tableNames);
  if (normalizedTableNames.length === 0) {
    return new Set();
  }

  const { rows } = await db.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])`,
    [schema, normalizedTableNames]
  );

  return new Set(
    (rows || [])
      .map((row) => String(row?.table_name || "").trim())
      .filter(Boolean)
  );
}

export async function getTableColumnNames({
  tableName,
  db = pool,
  schema = "public"
} = {}) {
  const normalizedTableName = String(tableName || "").trim();
  if (!normalizedTableName) {
    return new Set();
  }

  const { rows } = await db.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2`,
    [schema, normalizedTableName]
  );

  return new Set(
    (rows || [])
      .map((row) => String(row?.column_name || "").trim())
      .filter(Boolean)
  );
}
