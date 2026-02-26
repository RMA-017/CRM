import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import pool from "../src/config/db.js";

const MIGRATIONS_DIR = resolve(process.cwd(), "database", "migrations");
const STATUS_MODE = process.argv.includes("--status");

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

