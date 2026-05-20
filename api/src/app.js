import Fastify from "fastify";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "./config/app-config.js";
import { getDatabaseMigrationReadiness, listMigrationFileMetadata } from "./config/deployment-readiness.js";
import pool from "./config/db.js";
import securityPlugin from "./plugins/security.js";
import { authPreHandler } from "./lib/session.js";
import { createErrorFileLogger } from "./lib/error-file-logger.js";
import appointmentSettingsRoutes from "./modules/appointments/appointment-settings.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import clientsRoutes from "./modules/clients/clients.routes.js";
import createUserRoutes from "./modules/create-user/create-user.routes.js";
import { crmProtectedRoutes, crmPublicRoutes } from "./modules/crm/crm.routes.js";
import financeRoutes from "./modules/finance/finance.routes.js";
import metaRoutes from "./modules/meta/meta.routes.js";
import monitoringRoutes from "./modules/monitoring/monitoring.routes.js";
import { recordRequest } from "./modules/monitoring/monitoring.store.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import profileRoutes from "./modules/profile/profile.routes.js";
import servicesRoutes from "./modules/services/services.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import siteContentPublicRoutes, { siteContentProtectedRoutes } from "./modules/site-content/site-content.routes.js";
import { telegramSettingsRoutes, telegramWebhookRoutes } from "./modules/telegram-bot/telegram-bot.routes.js";
import { startTelegramReminderWorker } from "./modules/telegram-bot/telegram-bot.service.js";
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

async function checkMigrationReadiness({
  db,
  migrationFilesPromise
}) {
  try {
    const migrationFiles = await migrationFilesPromise;
    const report = await getDatabaseMigrationReadiness({
      db,
      migrationFiles
    });

    if (report.errors.length > 0) {
      return {
        status: "down",
        details: {
          message: report.errors[0],
          pendingCount: report.pendingCount
        }
      };
    }

    return {
      status: "up",
      details: report.warnings.length > 0
        ? { warnings: report.warnings }
        : null
    };
  } catch (error) {
    return {
      status: "down",
      details: {
        code: "migration_readiness_error",
        message: String(error?.message || "Migration readiness check failed.").trim().slice(0, 200)
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
  const appFilePath = fileURLToPath(import.meta.url);
  const appDirPath = dirname(appFilePath);
  const errorLogFilePath = resolve(appDirPath, "..", "logs", "errors.log");
  const migrationsDirPath = resolve(appDirPath, "..", "database", "migrations");
  const app = Fastify({
    loggerInstance: createErrorFileLogger({
      filePath: errorLogFilePath
    }),
    trustProxy: appConfig.trustProxy
  });
  const migrationFilesPromise = listMigrationFileMetadata({
    migrationsDir: migrationsDirPath
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
    const migrationCheck = await checkMigrationReadiness({
      db: pool,
      migrationFilesPromise
    });
    const status = dbCheck.status === "up"
      && migrationCheck.status === "up"
      ? "ready"
      : "not-ready";
    if (status !== "ready") {
      reply.status(503);
    }

    return {
      status,
      checks: {
        database: dbCheck.status,
        migrations: migrationCheck.status
      },
      details: dbCheck.details || undefined,
      migrationDetails: migrationCheck.details || undefined,
      timestamp: new Date().toISOString()
    };
  });

  await app.register(authRoutes, { prefix: "/api/login" });
  await app.register(crmPublicRoutes, { prefix: "/api/crm" });
  await app.register(siteContentPublicRoutes, { prefix: "/api/site-content" });
  await app.register(telegramWebhookRoutes, { prefix: "/api/telegram" });

  // Protected routes — all require valid auth token
  await app.register(async function protectedRoutes(fastify) {
    fastify.addHook("preHandler", authPreHandler);

    await fastify.register(metaRoutes, { prefix: "/api/meta" });
    await fastify.register(profileRoutes, { prefix: "/api/profile" });
    await fastify.register(createUserRoutes, { prefix: "/api/users" });
    await fastify.register(usersRoutes, { prefix: "/api/users" });
    await fastify.register(clientsRoutes, { prefix: "/api/clients" });
    await fastify.register(servicesRoutes, { prefix: "/api/services" });
    await fastify.register(financeRoutes, { prefix: "/api/finance" });
    await fastify.register(crmProtectedRoutes, { prefix: "/api/crm" });
    await fastify.register(appointmentSettingsRoutes, { prefix: "/api/appointments" });
    await fastify.register(settingsRoutes, { prefix: "/api/settings" });
    await fastify.register(telegramSettingsRoutes, { prefix: "/api/settings" });
    await fastify.register(monitoringRoutes, { prefix: "/api/monitoring" });
    await fastify.register(notificationsRoutes, { prefix: "/api/notifications" });
    await fastify.register(siteContentProtectedRoutes, { prefix: "/api/site-content" });
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

  app.addHook("onResponse", (request, reply, done) => {
    const route = request.routeOptions?.url || "";
    if (route && route !== "/" && route !== "/health" && route !== "/ready") {
      const elapsedTime = Number(reply.elapsedTime);
      recordRequest({
        method: request.method,
        route,
        statusCode: reply.statusCode,
        responseTimeMs: Number.isFinite(elapsedTime) ? Math.round(elapsedTime) : 0
      });
    }
    done();
  });

  const stopTelegramReminderWorker = startTelegramReminderWorker({ logger: app.log });
  app.addHook("onClose", (_instance, done) => {
    stopTelegramReminderWorker();
    done();
  });

  return app;
}
