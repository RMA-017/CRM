import Fastify from "fastify";
import { appConfig } from "./config/app-config.js";
import securityPlugin from "./plugins/security.js";
import { authPreHandler } from "./lib/session.js";
import appointmentSettingsRoutes from "./modules/appointments/appointment-settings.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import clientsRoutes from "./modules/clients/clients.routes.js";
import createUserRoutes from "./modules/create-user/create-user.routes.js";
import metaRoutes from "./modules/meta/meta.routes.js";
import profileRoutes from "./modules/profile/profile.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import { ensureSystemPermissions } from "./modules/users/permissions.service.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: appConfig.trustProxy
  });

  await ensureSystemPermissions();
  await app.register(securityPlugin);

  // Public routes
  app.get("/", async () => ({ message: "CRM API is running." }));
  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes, { prefix: "/api/login" });

  // Protected routes — all require valid auth token
  await app.register(async function protectedRoutes(fastify) {
    fastify.addHook("preHandler", authPreHandler);

    await fastify.register(metaRoutes, { prefix: "/api/meta" });
    await fastify.register(profileRoutes, { prefix: "/api/profile" });
    await fastify.register(createUserRoutes, { prefix: "/api/users" });
    await fastify.register(usersRoutes, { prefix: "/api/users" });
    await fastify.register(clientsRoutes, { prefix: "/api/clients" });
    await fastify.register(appointmentSettingsRoutes, { prefix: "/api/appointments" });
    await fastify.register(settingsRoutes, { prefix: "/api/settings" });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send("Not Found");
  });

  return app;
}
