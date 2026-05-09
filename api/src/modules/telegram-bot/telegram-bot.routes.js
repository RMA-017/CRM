import { normalizePermissionCode } from "../../lib/permission-codes.js";
import { normalizePositiveInteger } from "../../lib/number.js";
import { parseBooleanOr } from "../../lib/request-parsers.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { findSettingsRequester } from "../settings/settings.service.js";
import {
  deleteTelegramWebhookForOrganization,
  getTelegramBotSettingsByOrganization,
  handleTelegramUpdate,
  saveTelegramBotSettings,
  setTelegramWebhookForOrganization,
  testTelegramBotToken
} from "./telegram-bot.service.js";

const TELEGRAM_SETTINGS_PERMISSIONS = Object.freeze({
  read: PERMISSIONS.SETTINGS_TELEGRAM_BOT_READ,
  update: PERMISSIONS.SETTINGS_TELEGRAM_BOT_UPDATE
});

function getRequestBaseUrl(request) {
  const forwardedProto = String(request.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(request.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const protocol = forwardedProto || request.protocol || "https";
  const host = forwardedHost || String(request.headers?.host || "").trim();
  return host ? `${protocol}://${host}` : "";
}

async function getTelegramSettingsPermissionSnapshot(roleId) {
  const normalizedRoleId = normalizePositiveInteger(roleId);
  if (!normalizedRoleId) {
    return {
      usesAdvancedSettingsPermissions: false,
      read: false,
      update: false
    };
  }
  const [canRead, canUpdate] = await Promise.all([
    hasPermission(normalizedRoleId, TELEGRAM_SETTINGS_PERMISSIONS.read),
    hasPermission(normalizedRoleId, TELEGRAM_SETTINGS_PERMISSIONS.update)
  ]);
  return {
    usesAdvancedSettingsPermissions: Boolean(canRead || canUpdate),
    read: Boolean(canRead),
    update: Boolean(canUpdate)
  };
}

async function requireTelegramSettingsAccess(request, reply, action = "read") {
  const authContext = request.authContext;
  const requester = await findSettingsRequester(authContext);
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }

  const snapshot = await getTelegramSettingsPermissionSnapshot(requester.role_id);
  const isLegacyAllowed = Boolean(requester.is_admin);
  const hasActionPermission = action === "update" ? snapshot.update : (snapshot.read || snapshot.update);
  if (snapshot.usesAdvancedSettingsPermissions ? !hasActionPermission : !isLegacyAllowed) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }

  return {
    authContext,
    requester,
    permissionSnapshot: snapshot
  };
}

function parseTemplatePayload(value) {
  if (value === undefined) {
    return { value: undefined };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      error: {
        field: "templates",
        message: "Templates must be an object."
      }
    };
  }
  return { value };
}

function parsePermissionCodesPayload(value) {
  if (value === undefined) {
    return { value: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      error: {
        field: "managerNotificationPermissionCodes",
        message: "Permission codes must be an array."
      }
    };
  }
  const items = Array.from(
    new Set(
      value
        .map((item) => normalizePermissionCode(item))
        .filter(Boolean)
    )
  );
  if (items.length === 0) {
    return {
      error: {
        field: "managerNotificationPermissionCodes",
        message: "At least one permission code is required."
      }
    };
  }
  return { value: items };
}

function parseOptionalInteger(value, fallback = undefined) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

export async function telegramSettingsRoutes(fastify) {
  fastify.get(
    "/telegram-bot",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireTelegramSettingsAccess(request, reply, "read");
        if (!access) {
          return;
        }
        const item = await getTelegramBotSettingsByOrganization(access.authContext.organizationId, {
          actorUserId: access.authContext.userId
        });
        return reply.send({ item });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching Telegram bot settings");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/telegram-bot",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireTelegramSettingsAccess(request, reply, "update");
        if (!access) {
          return;
        }
        const body = request.body && typeof request.body === "object" ? request.body : {};
        const templates = parseTemplatePayload(body.templates);
        if (templates.error) {
          return reply.status(400).send(templates.error);
        }
        const permissionCodes = parsePermissionCodesPayload(body.managerNotificationPermissionCodes);
        if (permissionCodes.error) {
          return reply.status(400).send(permissionCodes.error);
        }
        const cancelLockMinutes = parseOptionalInteger(body.cancelLockMinutes);
        if (Number.isNaN(cancelLockMinutes) || (cancelLockMinutes !== undefined && (cancelLockMinutes < 0 || cancelLockMinutes > 10080))) {
          return reply.status(400).send({
            field: "cancelLockMinutes",
            message: "Cancel lock minutes must be between 0 and 10080."
          });
        }
        const botToken = body.botToken === undefined ? undefined : String(body.botToken || "").trim();
        if (botToken !== undefined && botToken && botToken.length < 20) {
          return reply.status(400).send({
            field: "botToken",
            message: "Bot token is too short."
          });
        }

        const item = await saveTelegramBotSettings({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId,
          botToken,
          clearBotToken: parseBooleanOr(body.clearBotToken, false),
          isActive: body.isActive === undefined ? undefined : parseBooleanOr(body.isActive, false),
          defaultLanguage: body.defaultLanguage,
          cancelLockMinutes,
          reminder24hEnabled: body.reminder24hEnabled === undefined ? undefined : parseBooleanOr(body.reminder24hEnabled, true),
          reminder2hEnabled: body.reminder2hEnabled === undefined ? undefined : parseBooleanOr(body.reminder2hEnabled, true),
          managerNotificationPermissionCodes: permissionCodes.value,
          templates: templates.value
        });
        return reply.send({ message: "Telegram bot settings updated.", item });
      } catch (error) {
        request.log.error({ err: error }, "Error updating Telegram bot settings");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/telegram-bot/webhook",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireTelegramSettingsAccess(request, reply, "update");
        if (!access) {
          return;
        }
        const baseUrl = String(request.body?.baseUrl || "").trim() || getRequestBaseUrl(request);
        const item = await setTelegramWebhookForOrganization({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId,
          baseUrl
        });
        return reply.send({ message: "Telegram webhook updated.", item });
      } catch (error) {
        const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
        if (statusCode >= 500) {
          request.log.error({ err: error }, "Error setting Telegram webhook");
        }
        return reply.status(statusCode).send({ message: error?.message || "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/telegram-bot/webhook",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireTelegramSettingsAccess(request, reply, "update");
        if (!access) {
          return;
        }
        const item = await deleteTelegramWebhookForOrganization({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId
        });
        return reply.send({ message: "Telegram webhook deleted.", item });
      } catch (error) {
        const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
        if (statusCode >= 500) {
          request.log.error({ err: error }, "Error deleting Telegram webhook");
        }
        return reply.status(statusCode).send({ message: error?.message || "Internal server error." });
      }
    }
  );

  fastify.post(
    "/telegram-bot/test",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const access = await requireTelegramSettingsAccess(request, reply, "read");
        if (!access) {
          return;
        }
        const bot = await testTelegramBotToken(access.authContext.organizationId);
        return reply.send({ bot });
      } catch (error) {
        const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
        if (statusCode >= 500) {
          request.log.error({ err: error }, "Error testing Telegram bot token");
        }
        return reply.status(statusCode).send({ message: error?.message || "Internal server error." });
      }
    }
  );
}

export async function telegramWebhookRoutes(fastify) {
  fastify.post(
    "/webhook/:organizationId/:secret",
    {
      config: { rateLimit: false }
    },
    async (request, reply) => {
      try {
        await handleTelegramUpdate({
          organizationId: request.params?.organizationId,
          webhookSecret: request.params?.secret,
          update: request.body
        });
        return reply.send({ ok: true });
      } catch (error) {
        request.log.error({ err: error }, "Error handling Telegram webhook update");
        return reply.send({ ok: true });
      }
    }
  );
}
