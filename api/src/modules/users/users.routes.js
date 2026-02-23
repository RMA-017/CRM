import { ORGANIZATION_CODE_REGEX } from "../../constants/validation.js";
import { validateBirthdayYmd } from "../../lib/date.js";
import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { findActiveOrganizationByCode } from "../organizations/organizations.service.js";
import { PERMISSIONS, USERNAME_REGEX } from "./users.constants.js";
import { hasPermission, isAllowedPosition, isAllowedRole } from "./access.service.js";
import {
  deleteUserById,
  findRequester,
  getUserScopeById,
  getUsersPage,
  updateUserByAdmin
} from "./users.service.js";

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

      const authContext = request.authContext;

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
          return reply.status(403).send({ message: "Forbidden." });
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
        request.log.error({ err: error }, "Error fetching all users");
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
      const authContext = request.authContext;

      const userId = Number(request.params?.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.status(400).send({ message: "Invalid user id." });
      }

      const username = String(request.body?.username || "").trim().toLowerCase();
      const email = String(request.body?.email || "").trim().toLowerCase();
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
      const birthdayError = validateBirthdayYmd(birthday);
      if (birthdayError) {
        errors.birthday = birthdayError;
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
          request.log.error({ err: error }, "Error validating position");
          return reply.status(500).send({ message: "Internal server error." });
        }
      }

      try {
        if (roleId && !(await isAllowedRole(roleId))) {
          errors.role = "Invalid role.";
        }
      } catch (error) {
        request.log.error({ err: error }, "Error validating role");
        return reply.status(500).send({ message: "Internal server error." });
      }

      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const requester = await findRequester(authContext);
        if (!requester || !(await hasPermission(requester.role_id, PERMISSIONS.USERS_UPDATE))) {
          return reply.status(403).send({ message: "Forbidden." });
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
          actorUserId: requester.id,
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
        request.log.error({ err: error }, "Error updating user");
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
      const authContext = request.authContext;

      const userId = Number(request.params?.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.status(400).send({ message: "Invalid user id." });
      }

      try {
        const requester = await findRequester(authContext);
        if (!requester || !(await hasPermission(requester.role_id, PERMISSIONS.USERS_DELETE))) {
          return reply.status(403).send({ message: "Forbidden." });
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
        request.log.error({ err: error }, "Error deleting user");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default usersRoutes;
