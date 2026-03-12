import { EMAIL_REGEX, ORGANIZATION_CODE_REGEX, PHONE_REGEX } from "../../constants/validation.js";
import { validateBirthdayYmd } from "../../lib/date.js";
import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { normalizeOrganizationCode } from "../../lib/organization-code.js";
import { requesterHasOrgFeature } from "../../lib/org-features.js";
import { findActiveOrganizationByCode } from "../organizations/organizations.service.js";
import { PERMISSIONS, USERNAME_REGEX } from "./users.constants.js";
import { hasPermission, isAdminRole, isAllowedPosition, isAllowedRole } from "./access.service.js";
import { usersRouteSchemas } from "./users.route-schemas.js";
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

function mapUsersUniqueConflict(error) {
  const constraint = String(error?.constraint || "").trim().toLowerCase();
  if (constraint === "users_username_unique_ci" || constraint === "users_username_key") {
    return {
      field: "username",
      message: "Username already exists."
    };
  }
  if (constraint === "users_email_unique_ci" || constraint === "users_email_key") {
    return {
      field: "email",
      message: "Email already exists."
    };
  }
  return {
    message: "Username or email already exists."
  };
}

async function usersRoutes(fastify) {
  fastify.get(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: usersRouteSchemas.listQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;

      const pageParam = Number.parseInt(String(request.query?.page || ""), 10);
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const organizationCodeParam = normalizeOrganizationCode(request.query?.organizationCode);
      const search = String(request.query?.q || "").trim();
      const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

      try {
        const requester = await findRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized" });
        }
        if (!requesterHasOrgFeature(requester, "users.all_users")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.USERS_READ))) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const canReadAllOrganizations = Boolean(requester.is_platform_admin);

        if (organizationCodeParam && organizationCodeParam !== "all" && !ORGANIZATION_CODE_REGEX.test(organizationCodeParam)) {
          return reply.status(400).send({ field: "organizationCode", message: "Invalid organisation." });
        }

        const { total, rows, page: safePage, totalPages } = await getUsersPage({
          organizationId: authContext.organizationId,
          page,
          limit,
          canReadAllOrganizations,
          organizationCode: canReadAllOrganizations
            ? (organizationCodeParam || normalizeOrganizationCode(authContext.organizationCode))
            : normalizeOrganizationCode(authContext.organizationCode),
          search
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
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: usersRouteSchemas.idParams,
        body: usersRouteSchemas.updateBody
      }
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
      const organizationCode = normalizeOrganizationCode(request.body?.organizationCode);
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
      if (email && !EMAIL_REGEX.test(email)) {
        errors.email = "Invalid email format.";
      }
      if (!fullName) {
        errors.fullName = "Full name is required.";
      }
      const birthdayError = validateBirthdayYmd(birthday);
      if (birthdayError) {
        errors.birthday = birthdayError;
      }
      if (phone && !PHONE_REGEX.test(phone)) {
        errors.phone = "Invalid phone number.";
      }
      if (password && password.length < 6) {
        errors.password = "Password must be at least 6 characters.";
      }

      if (String(request.body?.position || "").trim() && !positionId) {
        errors.position = "Invalid position.";
      }

      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const requester = await findRequester(authContext);
        if (!requester || !(await hasPermission(requester.role_id, PERMISSIONS.USERS_UPDATE))) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (!requesterHasOrgFeature(requester, "users.all_users")) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const targetUser = await getUserScopeById(userId);
        if (!targetUser) {
          return reply.status(404).send({ message: "User not found." });
        }
        if (Boolean(targetUser.is_admin) && !requester.is_platform_admin) {
          return reply.status(403).send({
            field: "role",
            message: "Only platform admin can manage admin users."
          });
        }
        const isSelfTarget = Number(requester.id) === userId;

        const scopedOrganizationId = Number(targetUser.organization_id);
        if (!requester.is_platform_admin && scopedOrganizationId !== Number(authContext.organizationId)) {
          return reply.status(404).send({ message: "User not found." });
        }

        const currentRoleId = parsePositiveInteger(targetUser.role_id);
        if (isSelfTarget && roleId && Number(roleId) !== Number(currentRoleId)) {
          return reply.status(400).send({
            field: "role",
            message: "Use another admin account to change your own role."
          });
        }
        if (isSelfTarget && password) {
          return reply.status(400).send({
            field: "password",
            message: "Use profile password change to update your own password."
          });
        }

        let nextOrganizationId = null;
        if (organizationCode) {
          const targetOrganization = await findActiveOrganizationByCode(organizationCode);
          if (!targetOrganization) {
            return reply.status(400).send({ field: "organizationCode", message: "Invalid organisation." });
          }

          const resolvedOrganizationId = Number(targetOrganization.id);
          if (!requester.is_platform_admin && resolvedOrganizationId !== Number(authContext.organizationId)) {
            return reply.status(403).send({ message: "Forbidden." });
          }
          nextOrganizationId = resolvedOrganizationId;
        }
        if (isSelfTarget && nextOrganizationId && nextOrganizationId !== scopedOrganizationId) {
          return reply.status(400).send({
            field: "organizationCode",
            message: "Use another admin account to move your own account to another organization."
          });
        }

        const validationOrganizationId = nextOrganizationId || scopedOrganizationId;
        if (positionId) {
          try {
            if (!(await isAllowedPosition(positionId, { organizationId: validationOrganizationId }))) {
              return reply.status(400).send({ errors: { position: "Invalid position." } });
            }
          } catch (error) {
            request.log.error({ err: error }, "Error validating position");
            return reply.status(500).send({ message: "Internal server error." });
          }
        }
        try {
          if (roleId && !(await isAllowedRole(roleId, { organizationId: validationOrganizationId }))) {
            return reply.status(400).send({ errors: { role: "Invalid role." } });
          }
          const currentRoleId = parsePositiveInteger(targetUser.role_id);
          if (
            !requester.is_platform_admin
            && roleId
            && (await isAdminRole(roleId, { organizationId: validationOrganizationId, allowGlobal: false }))
            && Number(roleId) !== Number(currentRoleId)
          ) {
            return reply.status(403).send({
              field: "role",
              message: "Only platform admin can assign admin role."
            });
          }
        } catch (error) {
          request.log.error({ err: error }, "Error validating role");
          return reply.status(500).send({ message: "Internal server error." });
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
        if (error?.code === "ROLE_CHANGE_BLOCKED_TEACHER_ASSIGNED") {
          return reply.status(409).send({
            field: error?.field || "role",
            message: error?.message || "Cannot change role while user is assigned as class teacher."
          });
        }
        if (error?.code === "USER_TRANSFER_BLOCKED_LINKED_DATA") {
          return reply.status(409).send({
            field: error?.field || "organizationCode",
            message: error?.message || "User has linked organization data and cannot be moved to another organization."
          });
        }
        if (error?.code === "23505") {
          return reply.status(409).send(mapUsersUniqueConflict(error));
        }
        request.log.error({ err: error }, "Error updating user");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: usersRouteSchemas.idParams
      }
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
        if (!requesterHasOrgFeature(requester, "users.all_users")) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        if (Number(requester.id) === userId) {
          return reply.status(400).send({ message: "You cannot delete your own account." });
        }

        const targetUser = await getUserScopeById(userId);
        if (!targetUser) {
          return reply.status(404).send({ message: "User not found." });
        }
        if (Boolean(targetUser.is_admin) && !requester.is_platform_admin) {
          return reply.status(403).send({ message: "Only platform admin can manage admin users." });
        }
        const scopedOrganizationId = Number(targetUser.organization_id);
        if (!requester.is_platform_admin && scopedOrganizationId !== Number(authContext.organizationId)) {
          return reply.status(404).send({ message: "User not found." });
        }

        const deleteResult = await deleteUserById(userId, scopedOrganizationId);
        if (deleteResult.rowCount === 0) {
          return reply.status(404).send({ message: "User not found." });
        }

        return reply.send({ message: "User deleted successfully." });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(409).send({
            message: "User has linked records and cannot be deleted."
          });
        }
        request.log.error({ err: error }, "Error deleting user");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default usersRoutes;
