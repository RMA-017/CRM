import { getClearCookieOptions, AUTH_COOKIE_NAME } from "../../lib/cookies.js";
import { validateBirthdayYmd } from "../../lib/date.js";
import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { getAuthContext } from "../../lib/session.js";
import { findAuthUserById, verifyPassword } from "../auth/auth.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { getRolePermissions, hasPermission, isAllowedPosition } from "../users/access.service.js";
import { getProfileByAuthContext, updateOwnProfileField } from "./profile.service.js";

const PROFILE_EDITABLE_FIELDS = new Set(["email", "fullName", "birthday", "password", "phone", "position"]);

function validateOwnProfileUpdate(field, value, currentPassword) {
  if (!PROFILE_EDITABLE_FIELDS.has(field)) {
    return { message: "Invalid field." };
  }

  if (field === "password" && !currentPassword) {
    return { field: "currentPassword", message: "Current password is required." };
  }
  if (field === "password" && value.length < 6) {
    return { field: "password", message: "Password must be at least 6 characters." };
  }
  if (field === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { field: "email", message: "Invalid email format." };
  }
  if (field === "fullName" && !value) {
    return { field: "fullName", message: "Full name is required." };
  }
  if (field === "birthday") {
    const birthdayError = validateBirthdayYmd(value);
    if (birthdayError) {
      return { field: "birthday", message: birthdayError };
    }
  }
  if (field === "phone" && value && !/^\+?[0-9]{7,15}$/.test(value)) {
    return { field: "phone", message: "Invalid phone number." };
  }
  return null;
}

function mapProfile(user, permissions) {
  return {
    roleId: user.role_id,
    positionId: user.position_id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    birthday: user.birthday,
    role: user.role,
    isAdmin: Boolean(user.is_admin),
    phone: user.phone_number,
    position: user.position,
    organizationId: user.organization_id,
    organizationCode: user.organization_code,
    organizationName: user.organization_name,
    permissions
  };
}

async function profileRoutes(fastify) {
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

      try {
        const user = await getProfileByAuthContext(authContext);
        if (!user) {
          reply.clearCookie(AUTH_COOKIE_NAME, getClearCookieOptions());
          return reply.status(401).send({ message: "Unauthorized" });
        }
        if (!(await hasPermission(user.role_id, PERMISSIONS.PROFILE_READ))) {
          return reply.status(404).send({ message: "Not found." });
        }
        const permissions = await getRolePermissions(user.role_id);
        return reply.send(mapProfile(user, permissions));
      } catch (error) {
        console.error("Error fetching profile:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = getAuthContext(request, reply);
      if (!authContext) {
        return;
      }

      const field = String(request.body?.field || "").trim();
      const value = String(request.body?.value || "").trim();
      const normalizedValue = field === "email" ? value.toLowerCase() : value;
      const positionId = field === "position" ? parsePositiveInteger(value) : null;
      const currentPassword = String(request.body?.currentPassword || "");
      const validationError = validateOwnProfileUpdate(field, normalizedValue, currentPassword);
      if (validationError) {
        return reply.status(400).send(validationError);
      }

      try {
        const currentUser = await getProfileByAuthContext(authContext);
        if (!currentUser) {
          return reply.status(404).send({ message: "User not found." });
        }
        if (!(await hasPermission(currentUser.role_id, PERMISSIONS.PROFILE_UPDATE))) {
          return reply.status(404).send({ message: "Not found." });
        }
        if (field === "position" && value && !positionId) {
          return reply.status(400).send({ field: "position", message: "Invalid position." });
        }
        if (field === "position" && positionId && !(await isAllowedPosition(positionId))) {
          return reply.status(400).send({ field: "position", message: "Invalid position." });
        }

        if (field === "password") {
          const authUser = await findAuthUserById(authContext.userId, authContext.organizationId);
          if (!authUser) {
            return reply.status(404).send({ message: "User not found." });
          }

          const isCurrentPasswordValid = await verifyPassword(currentPassword, authUser.password_hash);
          if (!isCurrentPasswordValid) {
            return reply.status(400).send({
              field: "currentPassword",
              message: "Current password is incorrect."
            });
          }
          if (currentPassword === value) {
            return reply.status(400).send({
              field: "password",
              message: "New password must be different from current password."
            });
          }
        }

        const result = await updateOwnProfileField({
          userId: authContext.userId,
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          field,
          value: field === "position" ? (positionId ? String(positionId) : "") : normalizedValue
        });
        if (result.rowCount === 0) {
          return reply.status(404).send({ message: "User not found." });
        }

        const user = await getProfileByAuthContext(authContext);
        if (!user) {
          return reply.status(404).send({ message: "User not found." });
        }
        const permissions = await getRolePermissions(user.role_id);

        return reply.send({
          message: "Profile updated.",
          profile: mapProfile(user, permissions)
        });
      } catch (error) {
        if (error?.code === "23505" && field === "email") {
          return reply.status(409).send({ field: "email", message: "Email already exists." });
        }
        console.error("Error updating profile:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default profileRoutes;
