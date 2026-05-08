import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import {
  isNotificationsSchemaMissing,
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead
} from "./notifications.service.js";

function parseBooleanQuery(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return false;
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
      const organizationId = parsePositiveInteger(authContext?.organizationId);
      const userId = parsePositiveInteger(authContext?.userId);
      if (!organizationId || !userId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      try {
        const result = await listUserNotifications({
          organizationId,
          userId,
          limit: request.query?.limit,
          unreadOnly: parseBooleanQuery(request.query?.unreadOnly ?? request.query?.unread_only)
        });
        return reply.send(result);
      } catch (error) {
        if (isNotificationsSchemaMissing(error)) {
          return reply.send({ items: [], unreadCount: 0 });
        }
        request.log.error({ err: error }, "Error fetching notifications");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/:id/read",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;
      const organizationId = parsePositiveInteger(authContext?.organizationId);
      const userId = parsePositiveInteger(authContext?.userId);
      const notificationId = parsePositiveInteger(request.params?.id);
      if (!organizationId || !userId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }
      if (!notificationId) {
        return reply.status(400).send({ message: "Invalid notification id." });
      }

      try {
        const item = await markUserNotificationRead({
          organizationId,
          userId,
          notificationId
        });
        if (!item) {
          return reply.status(404).send({ message: "Notification not found." });
        }
        return reply.send({ item });
      } catch (error) {
        if (isNotificationsSchemaMissing(error)) {
          return reply.status(404).send({ message: "Notification not found." });
        }
        request.log.error({ err: error }, "Error marking notification as read");
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
      const organizationId = parsePositiveInteger(authContext?.organizationId);
      const userId = parsePositiveInteger(authContext?.userId);
      if (!organizationId || !userId) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      try {
        const updatedCount = await markAllUserNotificationsRead({
          organizationId,
          userId
        });
        return reply.send({ updatedCount });
      } catch (error) {
        if (isNotificationsSchemaMissing(error)) {
          return reply.send({ updatedCount: 0 });
        }
        request.log.error({ err: error }, "Error marking notifications as read");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default notificationsRoutes;
