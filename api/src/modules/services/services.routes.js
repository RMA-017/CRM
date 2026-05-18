import { setNoCacheHeaders } from "../../lib/http.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { findSettingsRequester, listActiveServices } from "../settings/settings.service.js";

async function servicesRoutes(fastify) {
  fastify.get(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const requester = await findSettingsRequester(request.authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }

        const canRead = Boolean(requester.is_admin)
          || Boolean(requester.is_platform_admin)
          || await hasPermission(requester.role_id, PERMISSIONS.SERVICES_READ);
        if (!canRead) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const items = await listActiveServices(request.authContext.organizationId);
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching services:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default servicesRoutes;
