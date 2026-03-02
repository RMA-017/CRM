import os from "node:os";
import { Pool } from "pg";

function toBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function resolvePoolMaxDefault() {
  const cpuCount = Math.max(1, Number.parseInt(String(os.cpus()?.length || 1), 10) || 1);
  // Practical default for bursty API reads without over-allocating DB connections.
  return Math.min(80, Math.max(20, cpuCount * 4));
}

const poolMax = toBoundedInteger(process.env.PG_POOL_MAX, resolvePoolMaxDefault(), 5, 200);
const poolMin = toBoundedInteger(process.env.PG_POOL_MIN, Math.min(5, poolMax), 0, poolMax);
const poolIdleTimeoutMs = toBoundedInteger(process.env.PG_IDLE_TIMEOUT_MS, 30000, 1000, 600000);
const poolConnectionTimeoutMs = toBoundedInteger(process.env.PG_CONNECTION_TIMEOUT_MS, 5000, 500, 60000);
const poolMaxUses = toBoundedInteger(process.env.PG_POOL_MAX_USES, 7500, 100, 1_000_000);

const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DBNAME,
  max: poolMax,
  min: poolMin,
  idleTimeoutMillis: poolIdleTimeoutMs,
  connectionTimeoutMillis: poolConnectionTimeoutMs,
  maxUses: poolMaxUses
});

pool.on("error", (error) => {
  console.error("Unexpected PG pool error:", error);
});

export default pool;
