import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import pool from "../src/config/db.js";

const MIGRATIONS_DIR = resolve(process.cwd(), "database", "migrations");
const STATUS_MODE = process.argv.includes("--status");
const ADOPT_EXISTING_MODE = process.argv.includes("--adopt-existing");
const ADOPT_REQUIRED_TABLES = Object.freeze([
  "organizations",
  "role_options",
  "permissions",
  "role_permissions",
  "position_options",
  "users",
  "clients",
  "client_medical_history_entries",
  "vip_client_attendance",
  "vip_class_teacher_assignments",
  "vip_class_teacher_assignment_history",
  "vip_client_tutor_assignments",
  "vip_client_tutor_assignment_history",
  "vip_class_daily_routines",
  "appointment_settings",
  "appointment_working_hours",
  "appointment_breaks",
  "appointment_schedules",
  "user_notifications",
  "outbox_events",
  "appointment_status_history"
]);
const ADOPT_REQUIRED_COLUMNS_BY_TABLE = Object.freeze({
  organizations: ["allowed_features"],
  appointment_settings: [
    "slot_sub_divisions",
    "appointment_duration_minutes",
    "appointment_duration_options_minutes",
    "reminder_channels",
    "history_lock_days",
    "slot_cell_height_px",
    "outbox_retention_days",
    "user_notifications_retention_days"
  ],
  outbox_events: ["retry_count", "max_retries", "next_retry_at"],
  appointment_status_history: [
    "event_type",
    "previous_status",
    "next_status",
    "changed_fields",
    "details",
    "changed_by",
    "changed_at"
  ]
});

function toSha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

async function listMigrationFiles() {
  try {
    const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function ensureSchemaMigrationsTable(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version VARCHAR(128) PRIMARY KEY,
       checksum CHAR(64) NOT NULL,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  );
}

async function readAppliedMigrations(client) {
  const { rows } = await client.query(
    `SELECT version, checksum, applied_at
       FROM schema_migrations
      ORDER BY version ASC`
  );

  const byVersion = new Map();
  (rows || []).forEach((row) => {
    const version = String(row?.version || "").trim();
    if (!version) {
      return;
    }
    byVersion.set(version, {
      checksum: String(row?.checksum || "").trim(),
      appliedAt: row?.applied_at || null
    });
  });
  return byVersion;
}

function printStatusRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    process.stdout.write("[migrate] no migration files found.\n");
    return;
  }

  process.stdout.write("Status   Version\n");
  process.stdout.write("-------  ---------------------------------------------\n");
  rows.forEach((row) => {
    process.stdout.write(`${row.status.padEnd(7)}  ${row.version}\n`);
  });
}

async function validateAdoptableExistingSchema(client) {
  const userTablesResult = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name <> 'schema_migrations'`
  );
  const existingUserTables = new Set(
    (userTablesResult?.rows || [])
      .map((row) => String(row?.table_name || "").trim())
      .filter(Boolean)
  );

  if (existingUserTables.size === 0) {
    throw new Error("Cannot adopt migrations into an empty database. Run the normal migrate command instead.");
  }

  const missingTables = ADOPT_REQUIRED_TABLES.filter((tableName) => !existingUserTables.has(tableName));
  if (missingTables.length > 0) {
    throw new Error(
      `Cannot adopt existing schema because required tables are missing: ${missingTables.join(", ")}.`
    );
  }

  const requiredColumnTables = Object.keys(ADOPT_REQUIRED_COLUMNS_BY_TABLE);
  const columnsResult = await client.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])`,
    [requiredColumnTables]
  );
  const existingColumnsByTable = new Map();
  (columnsResult?.rows || []).forEach((row) => {
    const tableName = String(row?.table_name || "").trim();
    const columnName = String(row?.column_name || "").trim();
    if (!tableName || !columnName) {
      return;
    }
    if (!existingColumnsByTable.has(tableName)) {
      existingColumnsByTable.set(tableName, new Set());
    }
    existingColumnsByTable.get(tableName).add(columnName);
  });

  const missingColumnMessages = [];
  for (const [tableName, requiredColumns] of Object.entries(ADOPT_REQUIRED_COLUMNS_BY_TABLE)) {
    const existingColumns = existingColumnsByTable.get(tableName) || new Set();
    const missingColumns = requiredColumns.filter((columnName) => !existingColumns.has(columnName));
    if (missingColumns.length > 0) {
      missingColumnMessages.push(`${tableName}: ${missingColumns.join(", ")}`);
    }
  }

  if (missingColumnMessages.length > 0) {
    throw new Error(
      `Cannot adopt existing schema because required columns are missing: ${missingColumnMessages.join("; ")}.`
    );
  }
}

async function adoptExistingSchema(client, pendingFiles) {
  if (!Array.isArray(pendingFiles) || pendingFiles.length === 0) {
    process.stdout.write("[migrate] nothing to adopt.\n");
    return;
  }

  const appliedByVersion = await readAppliedMigrations(client);
  if (appliedByVersion.size > 0) {
    throw new Error("Cannot adopt existing schema when schema_migrations already contains rows.");
  }

  await validateAdoptableExistingSchema(client);

  const filesToAdopt = pendingFiles.slice(0, 1);
  await client.query("BEGIN");
  try {
    for (const migration of filesToAdopt) {
      await client.query(
        `INSERT INTO schema_migrations (version, checksum)
         VALUES ($1, $2)`,
        [migration.fileName, migration.checksum]
      );
      process.stdout.write(`[migrate] adopted ${migration.fileName}\n`);
    }
    await client.query("COMMIT");
    process.stdout.write(`[migrate] adopt complete. adopted=${filesToAdopt.length}\n`);
    if (pendingFiles.length > filesToAdopt.length) {
      process.stdout.write("[migrate] run the normal migrate command next to apply pending incremental migrations.\n");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function main() {
  const client = await pool.connect();

  try {
    await ensureSchemaMigrationsTable(client);

    const migrationFiles = await listMigrationFiles();
    const appliedByVersion = await readAppliedMigrations(client);
    const statusRows = [];
    const pendingFiles = [];

    for (const fileName of migrationFiles) {
      const fullPath = join(MIGRATIONS_DIR, fileName);
      const sql = await readFile(fullPath, "utf8");
      const checksum = toSha256(sql);
      const applied = appliedByVersion.get(fileName);

      if (applied) {
        if (applied.checksum && applied.checksum !== checksum) {
          throw new Error(`Checksum mismatch for applied migration: ${fileName}`);
        }
        statusRows.push({ status: "APPLIED", version: fileName });
        continue;
      }

      statusRows.push({ status: "PENDING", version: fileName });
      pendingFiles.push({ fileName, sql, checksum });
    }

    if (STATUS_MODE) {
      printStatusRows(statusRows);
      process.stdout.write(`[migrate] total=${statusRows.length}, pending=${pendingFiles.length}\n`);
      return;
    }

    if (ADOPT_EXISTING_MODE) {
      await adoptExistingSchema(client, pendingFiles);
      return;
    }

    if (pendingFiles.length === 0) {
      process.stdout.write("[migrate] up to date.\n");
      return;
    }

    for (const migration of pendingFiles) {
      process.stdout.write(`[migrate] applying ${migration.fileName} ...\n`);
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO schema_migrations (version, checksum)
           VALUES ($1, $2)`,
          [migration.fileName, migration.checksum]
        );
        await client.query("COMMIT");
        process.stdout.write(`[migrate] applied ${migration.fileName}\n`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    }

    process.stdout.write(`[migrate] done. applied=${pendingFiles.length}\n`);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`[migrate] failed: ${error?.message || error}\n`);
  process.exitCode = 1;
});
