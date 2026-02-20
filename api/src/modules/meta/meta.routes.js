import { setNoCacheHeaders } from "../../lib/http.js";
import { getAuthContext } from "../../lib/session.js";
import { getProfileByAuthContext } from "../profile/profile.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { hasPermission } from "../users/access.service.js";
import { getUserOptions } from "./meta.service.js";

async function metaRoutes(fastify) {
  fastify.get(
    "/user-options",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = getAuthContext(request, reply);
      if (!authContext) {
        return;
      }

      try {
        const user = await getProfileByAuthContext(authContext);
        if (!user) {
          return reply.status(401).send({ message: "Unauthorized" });
        }
        if (!(await hasPermission(user.role_id, PERMISSIONS.PROFILE_READ))) {
          return reply.status(404).send({ message: "Not found." });
        }

        const options = await getUserOptions();
        return reply.send(options);
      } catch (error) {
        console.error("Error fetching user options:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default metaRoutes;
