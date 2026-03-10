import { toBooleanFlag } from "../lib/boolean.js";
import { toBoundedInteger } from "../lib/bounded-integer.js";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOriginList(value, fallback) {
  const source = String(value || fallback || "").trim();
  if (!source) {
    return [];
  }

  return source
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function readRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const appConfig = {
  nodeEnv: String(process.env.NODE_ENV || "development").trim().toLowerCase(),
  port: toNumber(process.env.PORT, 3003),
  trustProxy: toBooleanFlag(process.env.TRUST_PROXY, false),
  gracefulShutdownTimeoutMs: toBoundedInteger(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS, 10000, 1000, 120000),
  allowedOrigins: toOriginList(process.env.WEB_ORIGIN, "http://localhost:5173"),
  jwtSecret: readRequiredEnv("JWT_SECRET"),
  jwtExpiresIn: String(process.env.JWT_EXPIRES_IN || "7d").trim(),
  cookieSecure: toBooleanFlag(process.env.COOKIE_SECURE, String(process.env.NODE_ENV || "").toLowerCase() === "production"),
  browserOriginCheckEnabled: toBooleanFlag(
    process.env.BROWSER_ORIGIN_CHECK_ENABLED,
    String(process.env.NODE_ENV || "").toLowerCase() === "production"
  ),
  apiRateLimit: {
    max: toNumber(process.env.API_RATE_LIMIT_MAX, 300),
    timeWindow: toNumber(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
  },
  loginRateLimit: {
    max: toNumber(process.env.LOGIN_RATE_LIMIT_MAX, 10),
    timeWindow: toNumber(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
  },
  permissionsSync: {
    enabled: toBooleanFlag(process.env.PERMISSIONS_SYNC_ON_STARTUP, true),
    useAdvisoryLock: toBooleanFlag(process.env.PERMISSIONS_SYNC_USE_ADVISORY_LOCK, true),
    advisoryLockKey: toBoundedInteger(process.env.PERMISSIONS_SYNC_LOCK_KEY, 41003001, 1, 2147483647),
    skipIfLockUnavailable: toBooleanFlag(process.env.PERMISSIONS_SYNC_SKIP_IF_LOCKED, true)
  },
  outboxWorker: {
    enabled: toBooleanFlag(process.env.OUTBOX_WORKER_ENABLED, true),
    pollIntervalMs: toBoundedInteger(process.env.OUTBOX_WORKER_POLL_MS, 5000, 250, 300000),
    processLimit: toBoundedInteger(process.env.OUTBOX_WORKER_PROCESS_LIMIT, 100, 1, 1000),
    claimTtlSeconds: toBoundedInteger(process.env.OUTBOX_WORKER_CLAIM_TTL_SECONDS, 120, 5, 86400),
    retryDelaySeconds: toBoundedInteger(process.env.OUTBOX_WORKER_RETRY_DELAY_SECONDS, 30, 1, 86400),
    retentionDays: toBoundedInteger(process.env.OUTBOX_WORKER_RETENTION_DAYS, 30, 0, 3650),
    retentionLimit: toBoundedInteger(process.env.OUTBOX_WORKER_RETENTION_LIMIT, 500, 1, 5000),
    retentionEveryCycles: toBoundedInteger(process.env.OUTBOX_WORKER_RETENTION_EVERY_CYCLES, 120, 1, 10000),
    userNotificationsRetentionDays: toBoundedInteger(process.env.USER_NOTIFICATIONS_RETENTION_DAYS, 0, 0, 3650),
    userNotificationsRetentionLimit: toBoundedInteger(process.env.USER_NOTIFICATIONS_RETENTION_LIMIT, 500, 1, 5000)
  },
  defaultCreatedUserPassword: String(process.env.DEFAULT_CREATED_USER_PASSWORD || "")
};
