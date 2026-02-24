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
  vipRollingRepeatEnabled: toBoolean(process.env.VIP_ROLLING_REPEAT_ENABLED, true),
  vipRollingRepeatIntervalMs: toNumber(process.env.VIP_ROLLING_REPEAT_INTERVAL_MS, 60 * 60 * 1000),
  defaultCreatedUserPassword: String(process.env.DEFAULT_CREATED_USER_PASSWORD || "")
};
