import Fastify from "fastify";
import { appConfig } from "./config/app-config.js";
import pool from "./config/db.js";
import securityPlugin from "./plugins/security.js";
import { authPreHandler } from "./lib/session.js";
import appointmentSettingsRoutes from "./modules/appointments/appointment-settings.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import clientsRoutes from "./modules/clients/clients.routes.js";
import createUserRoutes from "./modules/create-user/create-user.routes.js";
import metaRoutes from "./modules/meta/meta.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import { createOutboxWorker } from "./modules/notifications/outbox.worker.js";
import profileRoutes from "./modules/profile/profile.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import { ensureSystemPermissions } from "./modules/users/permissions.service.js";

async function checkDatabaseReadiness() {
  try {
    await pool.query("SELECT 1 AS ok");
    return {
      status: "up",
      details: null
    };
  } catch (error) {
    return {
      status: "down",
      details: {
        code: String(error?.code || "").trim() || "db_error",
        message: String(error?.message || "Database ping failed.").trim().slice(0, 200)
      }
    };
  }
}

function normalizeValidationField(validationError) {
  const missingProperty = String(validationError?.params?.missingProperty || "").trim();
  if (missingProperty) {
    return missingProperty;
  }

  const instancePath = String(validationError?.instancePath || "").trim();
  if (!instancePath) {
    return "";
  }

  return instancePath
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean)
    .join(".");
}

function mapValidationErrors(error) {
  const validationItems = Array.isArray(error?.validation) ? error.validation : [];
  return validationItems
    .map((item) => {
      const field = normalizeValidationField(item);
      const message = String(item?.message || "Invalid value.").trim() || "Invalid value.";
      return {
        field,
        message
      };
    })
    .filter((item) => item.message);
}

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: appConfig.trustProxy
  });
  const outboxWorker = createOutboxWorker({
    ...appConfig.outboxWorker,
    logger: app.log
  });

  if (appConfig.permissionsSync?.enabled) {
    const syncResult = await ensureSystemPermissions({
      useAdvisoryLock: appConfig.permissionsSync.useAdvisoryLock,
      advisoryLockKey: appConfig.permissionsSync.advisoryLockKey,
      skipIfLockUnavailable: appConfig.permissionsSync.skipIfLockUnavailable,
      logger: app.log
    });
    if (syncResult?.skipped) {
      app.log.info("Permissions sync was skipped on startup.");
    }
  } else {
    app.log.info("Permissions sync is disabled by startup config.");
  }
  await app.register(securityPlugin);

  // Public routes
  app.get("/", async () => ({ message: "CRM API is running." }));
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => {
    const dbCheck = await checkDatabaseReadiness();
    const outboxEnabled = Boolean(appConfig.outboxWorker?.enabled);
    const outboxStatus = outboxEnabled
      ? (outboxWorker.isRunning() ? "up" : "down")
      : "disabled";

    const status = dbCheck.status === "up"
      && (outboxStatus === "up" || outboxStatus === "disabled")
      ? "ready"
      : "not-ready";
    if (status !== "ready") {
      reply.status(503);
    }

    return {
      status,
      checks: {
        database: dbCheck.status,
        outboxWorker: outboxStatus
      },
      details: dbCheck.details || undefined,
      timestamp: new Date().toISOString()
    };
  });

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
    await fastify.register(notificationsRoutes, { prefix: "/api/notifications" });
    await fastify.register(settingsRoutes, { prefix: "/api/settings" });
  });

  app.setErrorHandler((error, request, reply) => {
    const validationErrors = mapValidationErrors(error);
    if (validationErrors.length > 0) {
      const primary = validationErrors[0];
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: primary?.message || "Validation error.",
        field: primary?.field || undefined,
        errors: validationErrors
      });
    }

    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled API error");
      return reply.status(500).send({ message: "Internal server error." });
    }

    return reply.status(statusCode).send({
      message: String(error?.message || "Request failed.").trim() || "Request failed."
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ message: "Not Found." });
  });

  app.addHook("onReady", async () => {
    const started = outboxWorker.start();
    if (started) {
      app.log.info("Outbox worker started");
    }
  });

  app.addHook("onClose", async () => {
    await outboxWorker.stop();
  });

  return app;
}
