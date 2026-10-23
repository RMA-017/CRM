import { findRequester } from "../users/users.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { deleteCaregiver, getCaregiverContact, listCaregivers, normalizeCaregiverInput, saveCaregiver, searchCaregiverClients } from "./caregivers.service.js";

const idSchema = { type: "object", required: ["id"], properties: { id: { type: "integer", minimum: 1 } } };
const querySchema = {
  type: "object", additionalProperties: false,
  properties: { q: { type: "string", maxLength: 255 }, page: { type: "integer", minimum: 1, maximum: 1000000 } }
};
const bodySchema = {
  type: "object", additionalProperties: false, required: [],
  properties: {
    fullName: { type: "string", maxLength: 255 },
    phone: { type: "string", maxLength: 40 }, clientId: { not: {} }
  }
};

export default async function caregiversRoutes(fastify) {
  function handler(permission, action) {
    return async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const requester = await findRequester(request.authContext);
        if (!requester) return reply.status(401).send({ message: "Unauthorized." });
        if (!requester.is_platform_admin && !(await hasPermission(requester.role_id, permission))) return reply.status(403).send({ message: "Forbidden." });
        return await action(request, reply);
      } catch (error) {
        if (error.code === "23505") return reply.status(409).send({ message: "PHONE_EXISTS" });
        if (["42P01", "42703"].includes(error.code)) return reply.status(503).send({ message: "MIGRATION_REQUIRED" });
        if (error.statusCode) return reply.status(error.statusCode).send({ message: error.message });
        request.log.error({ err: error }, "Caregiver operation failed");
        return reply.status(500).send({ message: "Internal server error." });
      }
    };
  }
  const config = { rateLimit: fastify.apiRateLimit };
  fastify.get("/by-phone", { config, schema: { querystring: { type: "object", required: ["phone"], properties: { phone: { type: "string", maxLength: 40 } } } } }, handler(PERMISSIONS.USERS_READ, (request) =>
    getCaregiverContact({ organizationId: request.authContext.organizationId, phone: request.query.phone })));
  fastify.get("/", { config, schema: { querystring: querySchema } }, handler(PERMISSIONS.USERS_READ, async (request) =>
    listCaregivers({ organizationId: request.authContext.organizationId, search: request.query.q || "", page: request.query.page || 1 })));
  fastify.get("/clients", { config, schema: { querystring: querySchema } }, handler(PERMISSIONS.USERS_READ, async (request) =>
    searchCaregiverClients({ organizationId: request.authContext.organizationId, search: request.query.q || "", page: request.query.page || 1 })));
  fastify.post("/", { config, schema: { body: { ...bodySchema, required: [...bodySchema.required, "clientId"], properties: { ...bodySchema.properties, clientId: { type: "integer", minimum: 1, maximum: 2147483647 } } } } }, handler(PERMISSIONS.USERS_CREATE, async (request, reply) => {
    const item = await saveCaregiver({ organizationId: request.authContext.organizationId, input: normalizeCaregiverInput(request.body) });
    return reply.status(201).send({ item });
  }));
  fastify.put("/:id", { config, schema: { params: idSchema, body: bodySchema } }, handler(PERMISSIONS.USERS_UPDATE, async (request) => ({
    item: await saveCaregiver({ organizationId: request.authContext.organizationId, id: request.params.id, input: normalizeCaregiverInput(request.body) })
  })));
  fastify.delete("/:id", { config, schema: { params: idSchema } }, handler(PERMISSIONS.USERS_DELETE, async (request) => {
    await deleteCaregiver({ organizationId: request.authContext.organizationId, id: request.params.id });
    return { ok: true };
  }));
}
