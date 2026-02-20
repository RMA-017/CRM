import Fastify from "fastify";
import { appConfig } from "./config/app-config.js";
import securityPlugin from "./plugins/security.js";
import authRoutes from "./modules/auth/auth.routes.js";
import createUserRoutes from "./modules/create-user/create-user.routes.js";
import metaRoutes from "./modules/meta/meta.routes.js";
import profileRoutes from "./modules/profile/profile.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import usersRoutes from "./modules/users/users.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: false,
    trustProxy: appConfig.trustProxy
  });

  await app.register(securityPlugin);

  app.get("/", async () => ({ message: "CRM API is running." }));

  await app.register(authRoutes, { prefix: "/api/login" });
  await app.register(metaRoutes, { prefix: "/api/meta" });
  await app.register(profileRoutes, { prefix: "/api/profile" });
  await app.register(createUserRoutes, { prefix: "/api/users" });
  await app.register(usersRoutes, { prefix: "/api/users" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send("Not Found");
  });

  return app;
}
