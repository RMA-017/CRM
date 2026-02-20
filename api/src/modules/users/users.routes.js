import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { getAuthContext } from "../../lib/session.js";
import { PERMISSIONS, USERNAME_REGEX } from "./users.constants.js";
import { hasPermission, isAllowedPosition, isAllowedRole } from "./access.service.js";
import {
  deleteUserById,
  findActiveOrganizationByCode,
  findRequester,
  getUserScopeById,
  getUsersPage,
  updateUserByAdmin
} from "./users.service.js";

const ORGANIZATION_CODE_REGEX = /^[a-z0-9._-]{2,64}$/;

function mapUser(user) {
  return {
    id: user.id,
    organizationId: user.organization_id,
    organizationCode: user.organization_code,
    organizationName: user.organization_name,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    birthday: user.birthday,
    roleId: user.role_id,
    role: user.role,
    positionId: user.position_id,
    phone: user.phone_number,
    position: user.position,
    createdAt: user.created_at
  };
}

async function usersRoutes(fastify) {
  fastify.get(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = getAuthContext(request, reply);
      if (!authContext) {
        return;
      }

      const pageParam = Number.parseInt(String(request.query?.page || ""), 10);
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const organizationCodeParam = String(request.query?.organizationCode || "").trim().toLowerCase();
      const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

      try {
        const requester = await findRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized" });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.USERS_READ))) {
          return reply.status(404).send({ message: "Not found." });
        }
        const isAdmin = Boolean(requester.is_admin);

        if (organizationCodeParam && organizationCodeParam !== "all" && !ORGANIZATION_CODE_REGEX.test(organizationCodeParam)) {
          return reply.status(400).send({ field: "organizationCode", message: "Invalid organisation." });
        }

        const { total, rows, page: safePage, totalPages } = await getUsersPage({
          organizationId: authContext.organizationId,
          page,
          limit,
          canReadAllOrganizations: isAdmin,
          organizationCode: isAdmin
            ? organizationCodeParam
            : String(authContext.organizationCode || "").trim().toLowerCase()
        });
        const users = rows.map(mapUser);

        return reply.send({
          users,
          pagination: {
            page: safePage,
            limit,
            total,
            totalPages,
            hasPrev: safePage > 1,
            hasNext: safePage < totalPages
          }
        });
      } catch (error) {
        console.error("Error fetching all users:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = getAuthContext(request, reply);
      if (!authContext) {
        return;
      }

      const userId = Number(request.params?.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.status(400).send({ message: "Invalid user id." });
      }

      const username = String(request.body?.username || "").trim();
      const email = String(request.body?.email || "").trim();
      const fullName = String(request.body?.fullName || "").trim();
      const birthday = String(request.body?.birthday || "").trim();
      const phone = String(request.body?.phone || "").trim();
      const positionId = String(request.body?.position || "").trim()
        ? parsePositiveInteger(request.body?.position)
        : null;
      const roleId = parsePositiveInteger(request.body?.role);
      const organizationCode = String(request.body?.organizationCode || "").trim().toLowerCase();
      const password = String(request.body?.password || "");

      const errors = {};
      if (!roleId) {
        errors.role = "Role is required.";
      }
      if (organizationCode && !ORGANIZATION_CODE_REGEX.test(organizationCode)) {
        errors.organizationCode = "Invalid organisation.";
      }
      if (!USERNAME_REGEX.test(username)) {
        errors.username = "Username must be 3-30 chars and contain letters, numbers, ., _, -";
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = "Invalid email format.";
      }
      if (!fullName) {
        errors.fullName = "Full name is required.";
      }
      if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
        errors.birthday = "Invalid birthday format.";
      }
      if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
        errors.phone = "Invalid phone number.";
      }
      if (password && password.length < 6) {
        errors.password = "Password must be at least 6 characters.";
      }

      if (String(request.body?.position || "").trim() && !positionId) {
        errors.position = "Invalid position.";
      } else if (positionId) {
        try {
          if (!(await isAllowedPosition(positionId))) {
            errors.position = "Invalid position.";
          }
        } catch (error) {
          console.error("Error validating position:", error);
          return reply.status(500).send({ message: "Internal server error." });
        }
      }

      try {
        if (roleId && !(await isAllowedRole(roleId))) {
          errors.role = "Invalid role.";
        }
      } catch (error) {
        console.error("Error validating role:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }

      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const requester = await findRequester(authContext);
        if (!requester || !(await hasPermission(requester.role_id, PERMISSIONS.USERS_UPDATE))) {
          return reply.status(404).send({ message: "Not found." });
        }
        const isAdmin = Boolean(requester.is_admin);

        let scopedOrganizationId = authContext.organizationId;
        let nextOrganizationId = null;
        if (isAdmin) {
          const targetUser = await getUserScopeById(userId);
          if (!targetUser) {
            return reply.status(404).send({ message: "User not found." });
          }
          scopedOrganizationId = Number(targetUser.organization_id);

          if (organizationCode) {
            const targetOrganization = await findActiveOrganizationByCode(organizationCode);
            if (!targetOrganization) {
              return reply.status(400).send({ field: "organizationCode", message: "Invalid organisation." });
            }
            nextOrganizationId = Number(targetOrganization.id);
          }
        }

        const user = await updateUserByAdmin({
          currentOrganizationId: scopedOrganizationId,
          nextOrganizationId,
          userId,
          username,
          email,
          fullName,
          birthday,
          phone,
          positionId,
          roleId,
          password
        });

        if (!user) {
          return reply.status(404).send({ message: "User not found." });
        }

        return reply.send({
          message: "User updated successfully.",
          user: mapUser(user)
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ message: "Username or email already exists." });
        }
        console.error("Error updating user:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = getAuthContext(request, reply);
      if (!authContext) {
        return;
      }

      const userId = Number(request.params?.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.status(400).send({ message: "Invalid user id." });
      }

      try {
        const requester = await findRequester(authContext);
        if (!requester || !(await hasPermission(requester.role_id, PERMISSIONS.USERS_DELETE))) {
          return reply.status(404).send({ message: "Not found." });
        }
        const isAdmin = Boolean(requester.is_admin);

        if (Number(requester.id) === userId) {
          return reply.status(400).send({ message: "You cannot delete your own account." });
        }

        let scopedOrganizationId = authContext.organizationId;
        if (isAdmin) {
          const targetUser = await getUserScopeById(userId);
          if (!targetUser) {
            return reply.status(404).send({ message: "User not found." });
          }
          scopedOrganizationId = Number(targetUser.organization_id);
        }

        const deleteResult = await deleteUserById(userId, scopedOrganizationId);
        if (deleteResult.rowCount === 0) {
          return reply.status(404).send({ message: "User not found." });
        }

        return reply.send({ message: "User deleted successfully." });
      } catch (error) {
        console.error("Error deleting user:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default usersRoutes;
