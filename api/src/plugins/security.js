import compress from "@fastify/compress";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { appConfig } from "../config/app-config.js";

function isAllowedCorsOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (appConfig.allowedOrigins.includes("*")) {
    return true;
  }

  return appConfig.allowedOrigins.includes(origin);
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
