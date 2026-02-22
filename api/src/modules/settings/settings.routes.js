import { ORGANIZATION_CODE_REGEX, PERMISSION_CODE_REGEX } from "../../constants/validation.js";
import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { getAuthContext } from "../../lib/session.js";
import {
  createOrganization,
  createPositionOption,
  createRoleOption,
  deleteOrganizationById,
  deletePositionOptionById,
  deleteRoleOptionById,
  findSettingsRequester,
  getPositionOptionById,
  getRoleOptionById,
  listOrganizations,
  listPermissionOptionsForSettings,
  listPositionOptionsForSettings,
  listRoleOptionsForSettings,
  updateOrganization,
  updatePositionOption,
  updateRoleOption
} from "./settings.service.js";

function parseSortOrder(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

function parseIsActive(value, fallback = true) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function parsePermissionCodes(value) {
  if (value == null) {
    return { codes: null };
  }

  if (!Array.isArray(value)) {
    return {
      error: {
        field: "permissionCodes",
        message: "permissionCodes must be an array."
      }
    };
  }

  const codes = Array.from(
    new Set(
      value
        .map((code) => String(code || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const invalidCode = codes.find((code) => !PERMISSION_CODE_REGEX.test(code));
  if (invalidCode) {
    return {
      error: {
        field: "permissionCodes",
        message: `Invalid permission code: ${invalidCode}`
      }
    };
  }

  return { codes };
}

function validateOrganizationPayload({ code, name }) {
  if (!ORGANIZATION_CODE_REGEX.test(code)) {
    return { field: "code", message: "Code must be 2-64 chars and contain lowercase letters, numbers, ., _, -" };
  }
  if (!name) {
    return { field: "name", message: "Name is required." };
  }
  if (name.length > 128) {
    return { field: "name", message: "Name is too long (max 128)." };
  }
  return null;
}

function validateRolePayload({ label }) {
  if (!label) {
    return { field: "label", message: "Label is required." };
  }
  if (label.length > 64) {
    return { field: "label", message: "Label is too long (max 64)." };
  }
  return null;
}

function validatePositionPayload({ label }) {
  if (!label) {
    return { field: "label", message: "Label is required." };
  }
  if (label.length > 96) {
    return { field: "label", message: "Label is too long (max 96)." };
  }
  return null;
}

async function requireAdmin(request, reply) {
  const authContext = getAuthContext(request, reply);
  if (!authContext) {
    return null;
  }

  const requester = await findSettingsRequester(authContext);
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }

  if (!Boolean(requester.is_admin)) {
    reply.status(404).send({ message: "Not found." });
    return null;
  }

  return { authContext, requester };
}

async function settingsRoutes(fastify) {
  fastify.get(
    "/organizations",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const items = await listOrganizations();
        return reply.send({ items });
      } catch (error) {
        console.error("Error fetching organizations:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/organizations",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const code = String(request.body?.code || "").trim().toLowerCase();
        const name = String(request.body?.name || "").trim();
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validateOrganizationPayload({ code, name });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await createOrganization({
          code,
          name,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        return reply.status(201).send({
          message: "Organization created.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "code", message: "Organization code already exists." });
        }
        console.error("Error creating organization:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/organizations/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid organization id." });
        }

        const code = String(request.body?.code || "").trim().toLowerCase();
        const name = String(request.body?.name || "").trim();
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validateOrganizationPayload({ code, name });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        if (id === adminContext.authContext.organizationId && !isActive) {
          return reply.status(400).send({ message: "You cannot deactivate your current organization." });
        }

        const item = await updateOrganization({
          id,
          code,
          name,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "Organization not found." });
        }

        return reply.send({
          message: "Organization updated.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "code", message: "Organization code already exists." });
        }
        console.error("Error updating organization:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/organizations/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid organization id." });
        }

        if (id === adminContext.authContext.organizationId) {
          return reply.status(400).send({ message: "You cannot delete your current organization." });
        }

        const result = await deleteOrganizationById(id);
        if (result.rowCount === 0) {
          return reply.status(404).send({ message: "Organization not found." });
        }

        return reply.send({ message: "Organization deleted." });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Organization is used by users and cannot be deleted." });
        }
        console.error("Error deleting organization:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/roles",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const [items, permissions] = await Promise.all([
          listRoleOptionsForSettings(),
          listPermissionOptionsForSettings()
        ]);
        return reply.send({ items, permissions });
      } catch (error) {
        console.error("Error fetching roles:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/roles",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const parsedPermissions = parsePermissionCodes(request.body?.permissionCodes);
        if (parsedPermissions.error) {
          return reply.status(400).send(parsedPermissions.error);
        }
        const validationError = validateRolePayload({ label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const permissionCodes = Array.isArray(parsedPermissions.codes) ? parsedPermissions.codes : [];

        const item = await createRoleOption({
          label,
          sortOrder,
          isActive,
          permissionCodes,
          actorUserId: adminContext.authContext.userId
        });
        return reply.status(201).send({
          message: "Role created.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "label", message: "Role label already exists." });
        }
        if (error?.code === "INVALID_PERMISSION_CODES") {
          const invalidCodes = Array.isArray(error.invalidCodes) ? error.invalidCodes.join(", ") : "";
          return reply.status(400).send({
            field: "permissionCodes",
            message: invalidCodes
              ? `Unknown permission code(s): ${invalidCodes}`
              : "Unknown permission code(s)."
          });
        }
        console.error("Error creating role:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/roles/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid role id." });
        }

        const existing = await getRoleOptionById(id);
        if (!existing) {
          return reply.status(404).send({ message: "Role not found." });
        }

        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const parsedPermissions = parsePermissionCodes(request.body?.permissionCodes);
        if (parsedPermissions.error) {
          return reply.status(400).send(parsedPermissions.error);
        }
        const validationError = validateRolePayload({ label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const isAdminRole = Boolean(existing.isAdmin);
        if (isAdminRole && String(existing.label || "").trim() !== label) {
          return reply.status(400).send({ field: "label", message: "Admin role label cannot be changed." });
        }
        if (isAdminRole && !isActive) {
          return reply.status(400).send({ field: "isActive", message: "Admin role cannot be deactivated." });
        }

        let permissionCodes = Array.isArray(parsedPermissions.codes)
          ? parsedPermissions.codes
          : (Array.isArray(existing.permissionCodes) ? existing.permissionCodes : []);
        if (isAdminRole) {
          const permissions = await listPermissionOptionsForSettings();
          permissionCodes = permissions
            .filter((permission) => Boolean(permission.isActive))
            .map((permission) => String(permission.code || "").trim().toLowerCase())
            .filter(Boolean);
        }

        const item = await updateRoleOption({
          id,
          label,
          sortOrder,
          isActive,
          permissionCodes,
          actorUserId: adminContext.authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "Role not found." });
        }

        return reply.send({
          message: "Role updated.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "label", message: "Role label already exists." });
        }
        if (error?.code === "INVALID_PERMISSION_CODES") {
          const invalidCodes = Array.isArray(error.invalidCodes) ? error.invalidCodes.join(", ") : "";
          return reply.status(400).send({
            field: "permissionCodes",
            message: invalidCodes
              ? `Unknown permission code(s): ${invalidCodes}`
              : "Unknown permission code(s)."
          });
        }
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Role is used by users and cannot be changed." });
        }
        console.error("Error updating role:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/roles/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid role id." });
        }

        const existing = await getRoleOptionById(id);
        if (!existing) {
          return reply.status(404).send({ message: "Role not found." });
        }
        if (Boolean(existing.isAdmin)) {
          return reply.status(400).send({ message: "Admin role cannot be deleted." });
        }

        const result = await deleteRoleOptionById(id);
        if (result.rowCount === 0) {
          return reply.status(404).send({ message: "Role not found." });
        }

        return reply.send({ message: "Role deleted." });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Role is used by users and cannot be deleted." });
        }
        console.error("Error deleting role:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/positions",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const items = await listPositionOptionsForSettings();
        return reply.send({ items });
      } catch (error) {
        console.error("Error fetching positions:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/positions",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validatePositionPayload({ label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await createPositionOption({
          label,
          sortOrder,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        return reply.status(201).send({
          message: "Position created.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "label", message: "Position label already exists." });
        }
        console.error("Error creating position:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/positions/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid position id." });
        }

        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validatePositionPayload({ label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await updatePositionOption({
          id,
          label,
          sortOrder,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "Position not found." });
        }

        return reply.send({
          message: "Position updated.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "label", message: "Position label already exists." });
        }
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Position is used by users and cannot be changed." });
        }
        console.error("Error updating position:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/positions/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid position id." });
        }

        const existing = await getPositionOptionById(id);
        if (!existing) {
          return reply.status(404).send({ message: "Position not found." });
        }

        const result = await deletePositionOptionById(id);
        if (result.rowCount === 0) {
          return reply.status(404).send({ message: "Position not found." });
        }

        return reply.send({ message: "Position deleted." });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Position is used by users and cannot be deleted." });
        }
        console.error("Error deleting position:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default settingsRoutes;
