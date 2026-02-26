function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
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
  trustProxy: toBoolean(process.env.TRUST_PROXY, false),
  gracefulShutdownTimeoutMs: toBoundedInteger(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS, 10000, 1000, 120000),
  allowedOrigins: toOriginList(process.env.WEB_ORIGIN, "http://localhost:5173"),
  jwtSecret: readRequiredEnv("JWT_SECRET"),
  cookieSecure: toBoolean(process.env.COOKIE_SECURE, String(process.env.NODE_ENV || "").toLowerCase() === "production"),
  apiRateLimit: {
    max: toNumber(process.env.API_RATE_LIMIT_MAX, 300),
    timeWindow: toNumber(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
  },
  loginRateLimit: {
    max: toNumber(process.env.LOGIN_RATE_LIMIT_MAX, 10),
    timeWindow: toNumber(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
  },
  permissionsSync: {
    enabled: toBoolean(process.env.PERMISSIONS_SYNC_ON_STARTUP, true),
    useAdvisoryLock: toBoolean(process.env.PERMISSIONS_SYNC_USE_ADVISORY_LOCK, true),
    advisoryLockKey: toBoundedInteger(process.env.PERMISSIONS_SYNC_LOCK_KEY, 41003001, 1, 2147483647),
    skipIfLockUnavailable: toBoolean(process.env.PERMISSIONS_SYNC_SKIP_IF_LOCKED, true)
  },
  outboxWorker: {
    enabled: toBoolean(process.env.OUTBOX_WORKER_ENABLED, true),
    pollIntervalMs: toBoundedInteger(process.env.OUTBOX_WORKER_POLL_MS, 5000, 250, 300000),
    processLimit: toBoundedInteger(process.env.OUTBOX_WORKER_PROCESS_LIMIT, 100, 1, 1000),
    retryDelaySeconds: toBoundedInteger(process.env.OUTBOX_WORKER_RETRY_DELAY_SECONDS, 30, 1, 86400),
    retentionDays: toBoundedInteger(process.env.OUTBOX_WORKER_RETENTION_DAYS, 30, 0, 3650),
    retentionLimit: toBoundedInteger(process.env.OUTBOX_WORKER_RETENTION_LIMIT, 500, 1, 5000),
    retentionEveryCycles: toBoundedInteger(process.env.OUTBOX_WORKER_RETENTION_EVERY_CYCLES, 120, 1, 10000)
  },
  defaultCreatedUserPassword: String(process.env.DEFAULT_CREATED_USER_PASSWORD || "")
};
