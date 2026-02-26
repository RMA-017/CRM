import compress from "@fastify/compress";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { appConfig } from "../config/app-config.js";

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
