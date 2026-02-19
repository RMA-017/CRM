import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import loginRoutes from "./routes/login.js";
import adminRoutes from "./routes/createUser.js";
import profileRoutes from "./routes/profile.js";

const allowedOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";
const trustProxy = String(process.env.TRUST_PROXY || "").toLowerCase();

const app = Fastify({
  logger: false,
  trustProxy: trustProxy === "1" || trustProxy === "true"
});

const apiRateLimit = {
  max: Number(process.env.API_RATE_LIMIT_MAX || 300),
  timeWindow: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000)
};

const loginRateLimit = {
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  timeWindow: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000)
};

app.decorate("apiRateLimit", apiRateLimit);
app.decorate("loginRateLimit", loginRateLimit);

await app.register(helmet, {
  crossOriginResourcePolicy: { policy: "cross-origin" }
});

await app.register(cors, {
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
});

await app.register(cookie);

await app.register(rateLimit, {
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

app.get("/", async () => ({ message: "CRM API is running." }));

await app.register(loginRoutes, { prefix: "/api/login" });
await app.register(adminRoutes, { prefix: "/api/admin-create" });
await app.register(profileRoutes, { prefix: "/api/profile" });

app.setNotFoundHandler((request, reply) => {
  reply.status(404).send("Not Found");
});

const port = Number(process.env.PORT || 3003);

try {
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server is running on port ${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
