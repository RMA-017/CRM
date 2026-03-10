import compress from "@fastify/compress";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { appConfig } from "../config/app-config.js";
import { AUTH_COOKIE_NAME } from "../lib/cookies.js";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TRUSTED_SEC_FETCH_SITE_VALUES = new Set(["same-origin", "same-site", "none"]);

function isPrivateIpv4Hostname(hostname) {
  const host = String(hostname || "").trim();
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }

  const octets = match.slice(1).map((value) => Number.parseInt(value, 10));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }

  const [first, second] = octets;
  if (first === 10) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 127) {
    return true;
  }
  return false;
}

function isDevLocalOrigin(origin) {
  if (appConfig.nodeEnv === "production") {
    return false;
  }

  try {
    const parsed = new URL(String(origin || ""));
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return false;
    }

    const hostname = String(parsed.hostname || "").toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".local")) {
      return true;
    }
    return isPrivateIpv4Hostname(hostname);
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (appConfig.allowedOrigins.includes("*")) {
    return true;
  }

  return appConfig.allowedOrigins.includes(origin) || isDevLocalOrigin(origin);
}

function toNormalizedOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

export function shouldRejectBrowserOrigin({
  method,
  origin,
  referer,
  secFetchSite,
  hasAuthCookie = false
}) {
  const normalizedMethod = String(method || "GET").trim().toUpperCase();
  if (SAFE_HTTP_METHODS.has(normalizedMethod)) {
    return false;
  }

  const normalizedOrigin = toNormalizedOrigin(origin);
  const normalizedRefererOrigin = toNormalizedOrigin(referer);
  const normalizedSecFetchSite = String(secFetchSite || "").trim().toLowerCase();
  const hasBrowserContextSignals = Boolean(normalizedOrigin || normalizedRefererOrigin || normalizedSecFetchSite);

  if (!hasAuthCookie && !hasBrowserContextSignals) {
    return false;
  }

  if (normalizedSecFetchSite && !TRUSTED_SEC_FETCH_SITE_VALUES.has(normalizedSecFetchSite)) {
    return true;
  }

  if (normalizedOrigin) {
    return !isAllowedCorsOrigin(normalizedOrigin);
  }

  if (normalizedRefererOrigin) {
    return !isAllowedCorsOrigin(normalizedRefererOrigin);
  }

  return false;
}

async function securityPlugin(fastify) {
  fastify.decorate("apiRateLimit", appConfig.apiRateLimit);
  fastify.decorate("loginRateLimit", appConfig.loginRateLimit);

  await fastify.register(compress);

  await fastify.register(helmet, {
    crossOriginResourcePolicy: { policy: "cross-origin" }
  });

  await fastify.register(cors, {
    origin: (origin, callback) => {
      callback(null, isAllowedCorsOrigin(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });

  await fastify.register(cookie);

  if (appConfig.browserOriginCheckEnabled) {
    fastify.addHook("onRequest", async (request, reply) => {
      const shouldReject = shouldRejectBrowserOrigin({
        method: request.method,
        origin: request.headers?.origin,
        referer: request.headers?.referer,
        secFetchSite: request.headers?.["sec-fetch-site"],
        hasAuthCookie: Boolean(request.cookies?.[AUTH_COOKIE_NAME])
      });

      if (shouldReject) {
        return reply.status(403).send({ message: "Forbidden origin." });
      }
    });
  }

  await fastify.register(rateLimit, {
    global: false,
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true
    },
    errorResponseBuilder: () => ({
      message: "Too many requests. Please try again later."
    })
  });
}

// Make this plugin global (non-encapsulated) so hooks apply to all routes.
securityPlugin[Symbol.for("skip-override")] = true;

export default securityPlugin;
