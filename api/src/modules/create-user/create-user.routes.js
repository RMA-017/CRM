import { appConfig } from "../../config/app-config.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { getAuthContext } from "../../lib/session.js";
import { PERMISSIONS, USERNAME_REGEX } from "../users/users.constants.js";
import { hasPermission, isAllowedRole } from "../users/access.service.js";
import { createBasicUser, findActiveOrganizationByCode, getActorForCreate } from "./create-user.service.js";

const ORGANIZATION_CODE_REGEX = /^[a-z0-9._-]{2,64}$/;

async function createUserRoutes(fastify) {
  fastify.post(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const username = String(request.body?.username || "").trim();
      const fullName = String(request.body?.fullName || request.body?.full_name || "").trim();
      const roleId = parsePositiveInteger(request.body?.role);
      const organizationCode = String(request.body?.organizationCode || "").trim().toLowerCase();

      const authContext = getAuthContext(request, reply);
      if (!authContext) {
        return;
      }

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
          console.error("Error validating role:", error);
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
          return reply.status(404).send({ message: "Not found." });
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
            return reply.status(404).send({ message: "Not found." });
          }

          targetOrganizationId = selectedOrganizationId;
        }

        const createdUser = await createBasicUser({
          organizationId: targetOrganizationId,
          username,
          fullName,
          roleId,
          defaultPassword: appConfig.defaultCreatedUserPassword
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
        console.error("Error executing SQL:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default createUserRoutes;
