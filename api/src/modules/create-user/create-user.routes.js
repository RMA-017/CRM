import { appConfig } from "../../config/app-config.js";
import { getAuthContext } from "../../lib/session.js";
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
      const username = String(request.body?.username || "").trim();
      const fullName = String(request.body?.fullName || request.body?.full_name || "").trim();
      const role = String(request.body?.role || "").trim().toLowerCase();

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
      if (!role) {
        errors.role = "Role is required.";
      }

      if (role) {
        try {
          if (!(await isAllowedRole(role))) {
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
        if (!(await hasPermission(actor.role, PERMISSIONS.USERS_CREATE))) {
          return reply.status(403).send({ message: "You do not have permission to create users." });
        }

        const createdUser = await createBasicUser({
          organizationId: authContext.organizationId,
          username,
          fullName,
          role,
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
