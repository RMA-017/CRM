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
    max: toNumber(process.env.LOGIN_RATE_LIMIT_MAX, 1),
    timeWindow: toNumber(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 60 * 1000)
  },
  permissionsSync: {
    enabled: toBooleanFlag(process.env.PERMISSIONS_SYNC_ON_STARTUP, true),
    useAdvisoryLock: toBooleanFlag(process.env.PERMISSIONS_SYNC_USE_ADVISORY_LOCK, true),
    advisoryLockKey: toBoundedInteger(process.env.PERMISSIONS_SYNC_LOCK_KEY, 41003001, 1, 2147483647),
    skipIfLockUnavailable: toBooleanFlag(process.env.PERMISSIONS_SYNC_SKIP_IF_LOCKED, true)
  },
  defaultCreatedUserPassword: String(process.env.DEFAULT_CREATED_USER_PASSWORD || "")
};
