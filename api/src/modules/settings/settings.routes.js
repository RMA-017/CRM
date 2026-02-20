import { setNoCacheHeaders } from "../../lib/http.js";
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
  listPositionOptionsForSettings,
  listRoleOptionsForSettings,
  updateOrganization,
  updatePositionOption,
  updateRoleOption
} from "./settings.service.js";

const ORGANIZATION_CODE_REGEX = /^[a-z0-9._-]{2,64}$/;
const ROLE_VALUE_REGEX = /^[a-z0-9._-]{2,32}$/;

function parsePositiveId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

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

function validateRolePayload({ value, label }) {
  if (!ROLE_VALUE_REGEX.test(value)) {
    return { field: "value", message: "Role value must be 2-32 chars and contain lowercase letters, numbers, ., _, -" };
  }
  if (!label) {
    return { field: "label", message: "Label is required." };
  }
  if (label.length > 64) {
    return { field: "label", message: "Label is too long (max 64)." };
  }
  return null;
}

function validatePositionPayload({ value, label }) {
  if (!value) {
    return { field: "value", message: "Value is required." };
  }
  if (value.length > 96) {
    return { field: "value", message: "Value is too long (max 96)." };
  }
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

  if (String(requester.role || "").trim().toLowerCase() !== "admin") {
    reply.status(403).send({ message: "You do not have permission to manage settings." });
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

        const item = await createOrganization({ code, name, isActive });
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

        const id = parsePositiveId(request.params?.id);
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

        const item = await updateOrganization({ id, code, name, isActive });
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

        const id = parsePositiveId(request.params?.id);
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

        const items = await listRoleOptionsForSettings();
        return reply.send({ items });
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

        const value = String(request.body?.value || "").trim().toLowerCase();
        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validateRolePayload({ value, label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await createRoleOption({ value, label, sortOrder, isActive });
        return reply.status(201).send({
          message: "Role created.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "value", message: "Role value already exists." });
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

        const id = parsePositiveId(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid role id." });
        }

        const existing = await getRoleOptionById(id);
        if (!existing) {
          return reply.status(404).send({ message: "Role not found." });
        }

        const value = String(request.body?.value || "").trim().toLowerCase();
        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validateRolePayload({ value, label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const isAdminRole = String(existing.value || "").trim().toLowerCase() === "admin";
        if (isAdminRole && value !== "admin") {
          return reply.status(400).send({ field: "value", message: "Admin role value cannot be changed." });
        }
        if (isAdminRole && !isActive) {
          return reply.status(400).send({ field: "isActive", message: "Admin role cannot be deactivated." });
        }

        const item = await updateRoleOption({ id, value, label, sortOrder, isActive });
        if (!item) {
          return reply.status(404).send({ message: "Role not found." });
        }

        return reply.send({
          message: "Role updated.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "value", message: "Role value already exists." });
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

        const id = parsePositiveId(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid role id." });
        }

        const existing = await getRoleOptionById(id);
        if (!existing) {
          return reply.status(404).send({ message: "Role not found." });
        }
        if (String(existing.value || "").trim().toLowerCase() === "admin") {
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

        const value = String(request.body?.value || "").trim();
        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validatePositionPayload({ value, label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await createPositionOption({ value, label, sortOrder, isActive });
        return reply.status(201).send({
          message: "Position created.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "value", message: "Position value already exists." });
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

        const id = parsePositiveId(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid position id." });
        }

        const value = String(request.body?.value || "").trim();
        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validatePositionPayload({ value, label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await updatePositionOption({ id, value, label, sortOrder, isActive });
        if (!item) {
          return reply.status(404).send({ message: "Position not found." });
        }

        return reply.send({
          message: "Position updated.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "value", message: "Position value already exists." });
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

        const id = parsePositiveId(request.params?.id);
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
