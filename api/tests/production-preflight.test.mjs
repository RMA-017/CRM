import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_MIGRATION_VERSIONS,
  buildMigrationReadinessReport
} from "../src/config/deployment-readiness.js";
import { getProductionPreflightReport } from "../src/config/production-preflight.js";

test("production preflight accepts hardened production env values", () => {
  const report = getProductionPreflightReport({
    NODE_ENV: "production",
    TRUST_PROXY: "true",
    COOKIE_SECURE: "true",
    BROWSER_ORIGIN_CHECK_ENABLED: "true",
    WEB_ORIGIN: "https://aaron.uz,https://www.aaron.uz",
    JWT_SECRET: "12345678901234567890123456789012",
    DEFAULT_CREATED_USER_PASSWORD: "StrongPassword42"
  });

  assert.deepEqual(report.errors, []);
});

test("production preflight rejects unsafe production defaults", () => {
  const report = getProductionPreflightReport({
    NODE_ENV: "production",
    TRUST_PROXY: "false",
    COOKIE_SECURE: "false",
    BROWSER_ORIGIN_CHECK_ENABLED: "false",
    WEB_ORIGIN: "http://localhost:5173",
    JWT_SECRET: "aaron_jwt_secret_key",
    DEFAULT_CREATED_USER_PASSWORD: "aaron2021"
  });

  assert.ok(report.errors.some((error) => error.includes("TRUST_PROXY must be true")));
  assert.ok(report.errors.some((error) => error.includes("COOKIE_SECURE must be true")));
  assert.ok(report.errors.some((error) => error.includes("BROWSER_ORIGIN_CHECK_ENABLED must stay enabled")));
  assert.ok(report.errors.some((error) => error.includes("WEB_ORIGIN must use https")));
  assert.ok(report.errors.some((error) => error.includes("JWT_SECRET must be replaced")));
  assert.ok(report.errors.some((error) => error.includes("DEFAULT_CREATED_USER_PASSWORD must be replaced")));
});

test("production preflight forceProduction mode applies production checks", () => {
  const report = getProductionPreflightReport({
    WEB_ORIGIN: "https://aaron.uz",
    JWT_SECRET: "12345678901234567890123456789012",
    DEFAULT_CREATED_USER_PASSWORD: "StrongPassword42"
  }, { forceProduction: true });

  assert.equal(report.nodeEnv, "production");
  assert.deepEqual(report.errors, []);
});

test("migration readiness report passes when repo and applied migrations match", () => {
  const requiredMigrationFiles = REQUIRED_MIGRATION_VERSIONS.map((version) => ({
    version,
    checksum: `checksum-${version}`
  }));
  const report = buildMigrationReadinessReport({
    migrationFiles: [
      { version: "20260309_000001_baseline.sql", checksum: "aaa" },
      ...requiredMigrationFiles
    ],
    appliedByVersion: new Map([
      ["20260309_000001_baseline.sql", { checksum: "aaa" }],
      ...requiredMigrationFiles.map((item) => [item.version, { checksum: item.checksum }])
    ])
  });

  assert.deepEqual(report.errors, []);
  assert.equal(report.pendingCount, 0);
});

test("migration readiness report rejects pending, missing and checksum-drift migrations", () => {
  const requiredMigrationFiles = REQUIRED_MIGRATION_VERSIONS.map((version) => ({
    version,
    checksum: `checksum-${version}`
  }));
  const report = buildMigrationReadinessReport({
    migrationFiles: [
      { version: "20260309_000001_baseline.sql", checksum: "aaa" },
      { version: "20260310_000002_next.sql", checksum: "bbb" },
      ...requiredMigrationFiles
    ],
    appliedByVersion: new Map([
      ["20260309_000001_baseline.sql", { checksum: "zzz" }],
      ["20260308_000000_old.sql", { checksum: "old" }],
      ...requiredMigrationFiles.map((item) => [item.version, { checksum: item.checksum }])
    ])
  });

  assert.ok(report.errors.some((error) => error.includes("checksum mismatch")));
  assert.ok(report.errors.some((error) => error.includes("Pending migrations detected")));
  assert.ok(report.errors.some((error) => error.includes("missing from the repo")));
});

test("migration readiness report requires finance migrations to stay in the repo", () => {
  const report = buildMigrationReadinessReport({
    migrationFiles: [
      { version: "20260309_000001_baseline.sql", checksum: "aaa" }
    ],
    appliedByVersion: new Map([
      ["20260309_000001_baseline.sql", { checksum: "aaa" }]
    ])
  });

  assert.ok(
    report.errors.some((error) => error.includes("20260518_000001_service_catalog.sql"))
  );
  assert.ok(
    report.errors.some((error) => error.includes("20260518_000006_finance_deposit_ticket_payments.sql"))
  );
  assert.ok(
    report.errors.some((error) => error.includes("20260525_000001_finance_payment_groups.sql"))
  );
  assert.ok(
    report.errors.some((error) => error.includes("20260525_000002_finance_cash_sessions_cashier_fk.sql"))
  );
  assert.ok(
    report.errors.some((error) => error.includes("20260606_000001_finance_payment_method_nullable_safety.sql"))
  );
  assert.ok(
    report.errors.some((error) => error.includes("20260720_000001_finance_client_discount_per_use.sql"))
  );
  assert.ok(
    report.errors.some((error) => error.includes("20260807_000001_finance_client_discount_service_values.sql"))
  );
});
