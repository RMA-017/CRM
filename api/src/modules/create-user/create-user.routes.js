import { appConfig } from "../../config/app-config.js";
import { ORGANIZATION_CODE_REGEX } from "../../constants/validation.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { findActiveOrganizationByCode } from "../organizations/organizations.service.js";
import { PERMISSIONS, USERNAME_REGEX } from "../users/users.constants.js";
import { hasPermission, isAllowedRole } from "../users/access.service.js";
import { createBasicUser, getActorForCreate } from "./create-user.service.js";

async function createUserRoutes(fastify) {
  fastify.post(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = request.authContext;

      const username = String(request.body?.username || "").trim().toLowerCase();
      const fullName = String(request.body?.fullName || request.body?.full_name || "").trim();
      const roleId = parsePositiveInteger(request.body?.role);
      const organizationCode = String(request.body?.organizationCode || "").trim().toLowerCase();

      const errors = {};
      if (!USERNAME_REGEX.test(username)) {
        errors.username = "Username must be 3-30 chars and contain letters, numbers, ., _, -";
      }
      if (!fullName) {
        errors.fullName = "Full name is required.";
      }
      if (!roleId) {
        errors.role = "Role is required.";
      }
      if (organizationCode && !ORGANIZATION_CODE_REGEX.test(organizationCode)) {
        errors.organizationCode = "Invalid organisation.";
      }

      if (roleId) {
        try {
          if (!(await isAllowedRole(roleId))) {
            errors.role = "Invalid role.";
          }
        } catch (error) {
          request.log.error({ err: error }, "Error validating role");
          return reply.status(500).send({ message: "Internal server error." });
        }
      }

      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const actor = await getActorForCreate(authContext);
        if (!actor) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!(await hasPermission(actor.role_id, PERMISSIONS.USERS_CREATE))) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        let targetOrganizationId = authContext.organizationId;
        if (organizationCode) {
          const selectedOrganization = await findActiveOrganizationByCode(organizationCode);
          if (!selectedOrganization) {
            return reply.status(400).send({
              field: "organizationCode",
              message: "Organization not found or inactive."
            });
          }

          const isAdmin = Boolean(actor.is_admin);
          const selectedOrganizationId = Number(selectedOrganization.id);
          if (!isAdmin && selectedOrganizationId !== Number(authContext.organizationId)) {
            return reply.status(403).send({ message: "Forbidden." });
          }

          targetOrganizationId = selectedOrganizationId;
        }

        const defaultPassword = String(appConfig.defaultCreatedUserPassword || "");
        if (!defaultPassword) {
          request.log.error("DEFAULT_CREATED_USER_PASSWORD is not configured");
          return reply.status(500).send({ message: "Server configuration error." });
        }

        const createdUser = await createBasicUser({
          organizationId: targetOrganizationId,
          username,
          fullName,
          roleId,
          defaultPassword,
          actorUserId: actor.id
        });

        return reply.status(201).send({
          message: "User successfully created.",
          user: createdUser
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({
            field: "username",
            message: "Username already exists."
          });
        }
        request.log.error({ err: error }, "Error creating user");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default createUserRoutes;
