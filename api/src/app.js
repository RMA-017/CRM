import Fastify from "fastify";
import { appConfig } from "./config/app-config.js";
import pool from "./config/db.js";
import securityPlugin from "./plugins/security.js";
import { authPreHandler } from "./lib/session.js";
import { ensureVipRollingSchedulesByOrganization } from "./modules/appointments/appointment-settings.service.js";
import appointmentSettingsRoutes from "./modules/appointments/appointment-settings.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import clientsRoutes from "./modules/clients/clients.routes.js";
import createUserRoutes from "./modules/create-user/create-user.routes.js";
import metaRoutes from "./modules/meta/meta.routes.js";
import profileRoutes from "./modules/profile/profile.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import { ensureSystemPermissions } from "./modules/users/permissions.service.js";

async function runVipRollingRepeatCycle(app) {
  const { rows } = await pool.query(
    `SELECT id
       FROM organizations
      WHERE is_active = TRUE
      ORDER BY id ASC`
  );

  for (const row of rows || []) {
    const organizationId = Number.parseInt(String(row?.id ?? "").trim(), 10);
    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      continue;
    }

    try {
      await ensureVipRollingSchedulesByOrganization({ organizationId });
    } catch (error) {
      app.log.error({ err: error, organizationId }, "Failed to extend VIP rolling schedules");
    }
  }
}

function registerVipRollingRepeatWorker(app) {
  if (!appConfig.vipRollingRepeatEnabled || appConfig.nodeEnv === "test") {
    return;
  }

  const intervalMs = Number.isFinite(appConfig.vipRollingRepeatIntervalMs) && appConfig.vipRollingRepeatIntervalMs > 0
    ? appConfig.vipRollingRepeatIntervalMs
    : 60 * 60 * 1000;

  let isRunning = false;
  const runCycle = async () => {
    if (isRunning) {
      return;
    }
    isRunning = true;
    try {
      await runVipRollingRepeatCycle(app);
    } catch (error) {
      app.log.error({ err: error }, "VIP rolling repeat worker cycle failed");
    } finally {
      isRunning = false;
    }
  };

  const timerId = setInterval(() => {
    runCycle().catch((error) => {
      app.log.error({ err: error }, "VIP rolling repeat worker tick failed");
    });
  }, intervalMs);
  if (typeof timerId?.unref === "function") {
    timerId.unref();
  }

  runCycle().catch((error) => {
    app.log.error({ err: error }, "VIP rolling repeat worker bootstrap failed");
  });

  app.addHook("onClose", (_instance, done) => {
    clearInterval(timerId);
    done();
  });
}

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
  registerVipRollingRepeatWorker(app);

  return app;
}
