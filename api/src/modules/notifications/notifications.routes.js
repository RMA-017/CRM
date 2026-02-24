import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import {
  clearAllUserNotifications,
  isNotificationsSchemaMissing,
  listUserNotifications,
  markAllUserNotificationsRead
} from "./notifications.service.js";

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

async function notificationsRoutes(fastify) {
  fastify.get(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
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
}

export default notificationsRoutes;
