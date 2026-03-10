import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { normalizeOrganizationCode } from "../../lib/organization-code.js";
import { ORGANIZATION_CODE_REGEX } from "../../constants/validation.js";
import { findActiveOrganizationByCode } from "../organizations/organizations.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { hasPermission } from "../users/access.service.js";
import { getUserOptions } from "./meta.service.js";
import { metaRouteSchemas } from "./meta.route-schemas.js";

async function metaRoutes(fastify) {
  fastify.get(
    "/user-options",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: metaRouteSchemas.userOptionsQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;

      try {
        const user = authContext?.requester;
        if (!user) {
          return reply.status(401).send({ message: "Unauthorized" });
        }
        if (!(await hasPermission(user.role_id, PERMISSIONS.PROFILE_READ))) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        let targetOrganizationId = Number(authContext?.organizationId);
        const requestedOrganizationId = parsePositiveInteger(request.query?.organizationId || request.query?.organization_id);
        const requestedOrganizationCode = normalizeOrganizationCode(
          request.query?.organizationCode || request.query?.organization_code
        );

        if (requestedOrganizationCode && !ORGANIZATION_CODE_REGEX.test(requestedOrganizationCode)) {
          return reply.status(400).send({ field: "organizationCode", message: "Invalid organisation." });
        }

        if (user.is_platform_admin) {
          if (requestedOrganizationId) {
            targetOrganizationId = requestedOrganizationId;
          } else if (requestedOrganizationCode) {
            const organization = await findActiveOrganizationByCode(requestedOrganizationCode);
            if (!organization) {
              return reply.status(400).send({
                field: "organizationCode",
                message: "Organization not found or inactive."
              });
            }
            targetOrganizationId = Number(organization.id);
          }
        }

        const options = await getUserOptions({ organizationId: targetOrganizationId });
        return reply.send(options);
      } catch (error) {
        request.log.error({ err: error }, "Error fetching user options");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default metaRoutes;
