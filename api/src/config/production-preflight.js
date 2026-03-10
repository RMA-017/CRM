import { toBooleanFlag } from "../lib/boolean.js";

const PLACEHOLDER_SECRETS = new Set([
  "change-this",
  "changeme",
  "secret",
  "aaron_jwt_secret_key"
]);

const PLACEHOLDER_PASSWORDS = new Set([
  "change-this",
  "changeme",
  "password",
  "aaron2021"
]);

function toOriginList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPrivateIpv4Hostname(hostname) {
  const match = String(hostname || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }

  const octets = match.slice(1).map((value) => Number.parseInt(value, 10));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }

  const [first, second] = octets;
  if (first === 10 || first === 127) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  return false;
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost"
    || normalized.endsWith(".local")
    || isPrivateIpv4Hostname(normalized);
}

function isPlaceholderValue(value, placeholders) {
  const normalized = String(value || "").trim().toLowerCase();
  return placeholders.has(normalized);
}

export function getProductionPreflightReport(env = {}, options = {}) {
  const forceProduction = Boolean(options?.forceProduction);
  const rawNodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  const nodeEnv = forceProduction ? "production" : (rawNodeEnv || "development");
  const trustProxy = toBooleanFlag(env.TRUST_PROXY, forceProduction);
  const cookieSecure = toBooleanFlag(env.COOKIE_SECURE, forceProduction);
  const browserOriginCheckEnabled = toBooleanFlag(env.BROWSER_ORIGIN_CHECK_ENABLED, forceProduction);
  const allowedOrigins = toOriginList(env.WEB_ORIGIN);
  const jwtSecret = String(env.JWT_SECRET || "").trim();
  const defaultCreatedUserPassword = String(env.DEFAULT_CREATED_USER_PASSWORD || "").trim();

  const errors = [];
  const warnings = [];

  if (nodeEnv !== "production") {
    errors.push("NODE_ENV must be production for a production deploy.");
  }

  if (!trustProxy) {
    errors.push("TRUST_PROXY must be true behind the production Nginx reverse proxy.");
  }

  if (!cookieSecure) {
    errors.push("COOKIE_SECURE must be true in production.");
  }

  if (!browserOriginCheckEnabled) {
    errors.push("BROWSER_ORIGIN_CHECK_ENABLED must stay enabled in production.");
  }

  if (allowedOrigins.length === 0) {
    errors.push("WEB_ORIGIN must list at least one production HTTPS origin.");
  }

  for (const origin of allowedOrigins) {
    try {
      const parsed = new URL(origin);
      if (String(parsed.protocol || "").toLowerCase() !== "https:") {
        errors.push(`WEB_ORIGIN must use https in production: ${origin}`);
      }
      if (isLocalHostname(parsed.hostname)) {
        errors.push(`WEB_ORIGIN cannot use localhost or private network hosts in production: ${origin}`);
      }
    } catch {
      errors.push(`WEB_ORIGIN contains an invalid URL: ${origin}`);
    }
  }

  if (!jwtSecret || jwtSecret.length < 32 || isPlaceholderValue(jwtSecret, PLACEHOLDER_SECRETS)) {
    errors.push("JWT_SECRET must be replaced with a strong production secret (min 32 chars).");
  }

  if (
    !defaultCreatedUserPassword
    || defaultCreatedUserPassword.length < 12
    || isPlaceholderValue(defaultCreatedUserPassword, PLACEHOLDER_PASSWORDS)
  ) {
    errors.push("DEFAULT_CREATED_USER_PASSWORD must be replaced with a non-default production value (min 12 chars).");
  }

  if (allowedOrigins.some((origin) => String(origin).includes("www.")) && !allowedOrigins.some((origin) => String(origin).includes("https://aaron.uz"))) {
    warnings.push("WEB_ORIGIN includes www host but not the bare domain.");
  }

  return {
    nodeEnv,
    trustProxy,
    cookieSecure,
    browserOriginCheckEnabled,
    allowedOrigins,
    errors,
    warnings
  };
}
