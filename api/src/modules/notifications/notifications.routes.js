import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { publishAppointmentEvent } from "../appointments/appointment-events.js";
import { getProfileByAuthContext } from "../profile/profile.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import {
  clearAllUserNotifications,
  isNotificationsSchemaMissing,
  listUserNotifications,
  markAllUserNotificationsRead,
  persistNotificationEvent,
  resolveNotificationRecipientIds
} from "./notifications.service.js";
import { notificationsRouteSchemas } from "./notifications.route-schemas.js";

function parseUnreadOnly(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseLimit(value) {
  const parsed = parsePositiveInteger(value);
  if (!parsed) {
    return 50;
  }
  return Math.min(parsed, 200);
}

function normalizeTargetUserIds(value) {
  const source = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      source
        .map((item) => parsePositiveInteger(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
}

function normalizeTargetRoles(value) {
  const source = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim().toLowerCase())
        .filter((item) => item.length > 0 && item.length <= 100)
    )
  );
}

async function notificationsRoutes(fastify) {
  fastify.get(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: notificationsRouteSchemas.listQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;
      const organizationId = authContext?.organizationId;
      const userId = authContext?.userId;
      if (!organizationId || !userId) {
        return reply.status(401).send({ message: "Unauthorized." });
      }

      try {
        const items = await listUserNotifications({
          organizationId,
          userId,
          unreadOnly: parseUnreadOnly(request.query?.unreadOnly),
          limit: parseLimit(request.query?.limit)
        });
        return reply.send({ items });
      } catch (error) {
        if (isNotificationsSchemaMissing(error)) {
          return reply.send({ items: [], schemaReady: false });
        }
        request.log.error({ err: error }, "Error fetching notifications");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/read-all",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const organizationId = authContext?.organizationId;
      const userId = authContext?.userId;
      if (!organizationId || !userId) {
        return reply.status(401).send({ message: "Unauthorized." });
      }

      try {
        const affectedCount = await markAllUserNotificationsRead({
          organizationId,
          userId
        });
        return reply.send({
          message: "Notifications marked as read.",
          affectedCount
        });
      } catch (error) {
        if (isNotificationsSchemaMissing(error)) {
          return reply.send({
            message: "Notifications marked as read.",
            affectedCount: 0,
            schemaReady: false
          });
        }
        request.log.error({ err: error }, "Error marking notifications as read");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const organizationId = authContext?.organizationId;
      const userId = authContext?.userId;
      if (!organizationId || !userId) {
        return reply.status(401).send({ message: "Unauthorized." });
      }

      try {
        const deletedCount = await clearAllUserNotifications({
          organizationId,
          userId
        });
        return reply.send({
          message: "Notifications cleared.",
          deletedCount
        });
      } catch (error) {
        if (isNotificationsSchemaMissing(error)) {
          return reply.send({
            message: "Notifications cleared.",
            deletedCount: 0,
            schemaReady: false
          });
        }
        request.log.error({ err: error }, "Error clearing notifications");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/send",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: notificationsRouteSchemas.sendBody
      }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const organizationId = authContext?.organizationId;
      const userId = authContext?.userId;
      if (!organizationId || !userId) {
        return reply.status(401).send({ message: "Unauthorized." });
      }

      const requester = await getProfileByAuthContext(authContext);
      if (!requester) {
        return reply.status(401).send({ message: "Unauthorized." });
      }

      const canSendNotifications = Boolean(requester.is_admin)
        || (await hasPermission(requester.role_id, PERMISSIONS.NOTIFICATIONS_SEND));
      if (!canSendNotifications) {
        return reply.status(403).send({ message: "Forbidden." });
      }

      const message = String(request.body?.message || "").trim();
      if (!message) {
        return reply.status(400).send({
          field: "message",
          message: "Message is required."
        });
      }
      if (message.length > 255) {
        return reply.status(400).send({
          field: "message",
          message: "Message is too long (max 255)."
        });
      }

      const targetUserIds = normalizeTargetUserIds(request.body?.targetUserIds);
      const targetRoles = normalizeTargetRoles(request.body?.targetRoles);
      if (targetUserIds.length === 0 && targetRoles.length === 0) {
        return reply.status(400).send({
          field: "target",
          message: "Provide at least one target user or role."
        });
      }

      const payloadData = request.body?.payload && typeof request.body.payload === "object"
        ? request.body.payload
        : {};

      try {
        const persisted = await persistNotificationEvent({
          organizationId,
          sourceUserId: userId,
          eventType: "notification-manual",
          message,
          targetUserIds,
          targetRoles,
          payload: payloadData,
          aggregateType: "notification",
          aggregateId: ""
        });

        const recipientUserIds = Array.isArray(persisted?.recipientUserIds)
          ? persisted.recipientUserIds
          : [];
        if (recipientUserIds.length === 0) {
          return reply.status(400).send({ message: "No matching recipients found." });
        }

        publishAppointmentEvent({
          organizationId,
          type: "notification-manual",
          message,
          sourceUserId: userId,
          sourceUsername: String(authContext.username || "").trim(),
          targetUserIds: recipientUserIds,
          data: payloadData
        });

        return reply.status(201).send({
          message: "Notification sent.",
          recipientCount: recipientUserIds.length
        });
      } catch (error) {
        if (isNotificationsSchemaMissing(error)) {
          const recipientUserIds = await resolveNotificationRecipientIds({
            organizationId,
            targetUserIds,
            targetRoles,
            excludeUserId: userId
          });

          if (recipientUserIds.length > 0) {
            publishAppointmentEvent({
              organizationId,
              type: "notification-manual",
              message,
              sourceUserId: userId,
              sourceUsername: String(authContext.username || "").trim(),
              targetUserIds: recipientUserIds,
              data: payloadData
            });
          }

          return reply.status(201).send({
            message: "Notification sent.",
            recipientCount: recipientUserIds.length,
            schemaReady: false
          });
        }

        request.log.error({ err: error }, "Error sending notifications");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export const __notificationsRouteContracts = Object.freeze({
  parseUnreadOnly,
  parseLimit,
  normalizeTargetUserIds,
  normalizeTargetRoles
});

export default notificationsRoutes;
