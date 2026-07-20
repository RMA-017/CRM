import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

function toSha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export const REQUIRED_MIGRATION_VERSIONS = Object.freeze([
  "20260518_000001_service_catalog.sql",
  "20260518_000002_finance_payment_methods.sql",
  "20260518_000003_finance_cashier_tickets.sql",
  "20260518_000004_finance_ticket_items_core.sql",
  "20260518_000005_finance_cash_sessions_transactions.sql",
  "20260518_000006_finance_deposit_ticket_payments.sql",
  "20260525_000001_finance_payment_groups.sql",
  "20260525_000002_finance_cash_sessions_cashier_fk.sql",
  "20260606_000001_finance_payment_method_nullable_safety.sql",
  "20260717_000001_finance_client_discounts.sql",
  "20260720_000001_finance_client_discount_per_use.sql"
]);

export async function listMigrationFileMetadata({
  migrationsDir
} = {}) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const result = [];
  for (const fileName of fileNames) {
    const sql = await readFile(join(migrationsDir, fileName), "utf8");
    result.push({
      version: fileName,
      checksum: toSha256(sql)
    });
  }
  return result;
}

async function readAppliedMigrations({ db }) {
  const tableCheck = await db.query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'schema_migrations'
     ) AS exists`
  );

  if (!tableCheck?.rows?.[0]?.exists) {
    return new Map();
  }

  const { rows } = await db.query(
    `SELECT version, checksum
       FROM schema_migrations
      ORDER BY version ASC`
  );

  const result = new Map();
  for (const row of rows || []) {
    const version = String(row?.version || "").trim();
    if (!version) {
      continue;
    }
    result.set(version, {
      checksum: String(row?.checksum || "").trim()
    });
  }
  return result;
}

export function buildMigrationReadinessReport({
  migrationFiles = [],
  appliedByVersion = new Map()
} = {}) {
  const normalizedAppliedByVersion = appliedByVersion instanceof Map
    ? appliedByVersion
    : new Map(Object.entries(appliedByVersion || {}));
  const normalizedMigrationFiles = Array.isArray(migrationFiles) ? migrationFiles : [];

  const errors = [];
  const warnings = [];
  const pendingVersions = [];

  if (normalizedMigrationFiles.length === 0) {
    errors.push("No migration files were found in database/migrations.");
  }

  const knownVersions = new Set();
  for (const item of normalizedMigrationFiles) {
    const version = String(item?.version || "").trim();
    const checksum = String(item?.checksum || "").trim();
    if (!version) {
      continue;
    }
    knownVersions.add(version);
    const applied = normalizedAppliedByVersion.get(version);
    if (!applied) {
      pendingVersions.push(version);
      continue;
    }

    const appliedChecksum = String(applied?.checksum || "").trim();
    if (checksum && appliedChecksum && checksum !== appliedChecksum) {
      errors.push(`Applied migration checksum mismatch: ${version}`);
    }
  }

  for (const version of normalizedAppliedByVersion.keys()) {
    if (!knownVersions.has(version)) {
      errors.push(`Applied migration is missing from the repo: ${version}`);
    }
  }

  for (const version of REQUIRED_MIGRATION_VERSIONS) {
    if (!knownVersions.has(version)) {
      errors.push(`Required migration file is missing from the repo: ${version}`);
    }
  }

  if (pendingVersions.length > 0) {
    errors.push(`Pending migrations detected: ${pendingVersions.join(", ")}`);
  }

  if (normalizedAppliedByVersion.size === 0 && normalizedMigrationFiles.length > 0) {
    warnings.push("schema_migrations is empty; deployment expects migrate or adopt to run first.");
  }

  return {
    errors,
    warnings,
    pendingVersions,
    pendingCount: pendingVersions.length,
    appliedCount: normalizedAppliedByVersion.size,
    totalMigrations: normalizedMigrationFiles.length
  };
}

export async function getDatabaseMigrationReadiness({
  db,
  migrationFiles = []
} = {}) {
  const appliedByVersion = await readAppliedMigrations({ db });
  return buildMigrationReadinessReport({
    migrationFiles,
    appliedByVersion
  });
}
