import { resolve } from "node:path";
import process from "node:process";
import pool from "../src/config/db.js";
import {
  getDatabaseMigrationReadiness as getSharedDatabaseMigrationReadiness,
  listMigrationFileMetadata
} from "../src/config/deployment-readiness.js";
import { getProductionPreflightReport } from "../src/config/production-preflight.js";

const MIGRATIONS_DIR = resolve(process.cwd(), "database", "migrations");

async function loadDatabaseMigrationReadiness() {
  await pool.query("SELECT 1 AS ok");
  const migrationFiles = await listMigrationFileMetadata({
    migrationsDir: MIGRATIONS_DIR
  });
  return getDatabaseMigrationReadinessFromManifest({
    db: pool,
    migrationFiles
  });
}

async function getDatabaseMigrationReadinessFromManifest({
  db,
  migrationFiles
}) {
  return getSharedDatabaseMigrationReadiness({
    db,
    migrationFiles
  });
}

const forceProduction = process.argv.includes("--production");
const report = getProductionPreflightReport(process.env, { forceProduction });

for (const warning of report.warnings) {
  console.warn(`[preflight:warn] ${warning}`);
}

if (report.errors.length > 0) {
  for (const error of report.errors) {
    console.error(`[preflight:error] ${error}`);
  }
  process.exit(1);
}

try {
  const migrationReport = await loadDatabaseMigrationReadiness();
  for (const warning of migrationReport.warnings) {
    console.warn(`[preflight:warn] ${warning}`);
  }
  if (migrationReport.errors.length > 0) {
    for (const error of migrationReport.errors) {
      console.error(`[preflight:error] ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `[preflight:ok] production config looks valid for ${report.allowedOrigins.join(", ")}; `
    + `migrations=${migrationReport.appliedCount}/${migrationReport.totalMigrations}`
  );
} finally {
  await pool.end().catch(() => {});
}
