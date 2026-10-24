import { findRequester } from "../users/users.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { deleteInternalLesson, getInternalLessonOptions, listInternalLessons, normalizeInternalLesson, saveInternalLesson } from "./internal-lessons.service.js";
import { lessonActionPermission, performLessonAction } from "./internal-lesson-actions.service.js";

const positiveId = { type: "integer", minimum: 1, maximum: 2147483647 };
const params = { type: "object", required: ["id"], properties: { id: positiveId } };
const body = { type: "object", additionalProperties: false, required: ["clientId", "specialistId", "weekDays"], properties: {
  clientId: positiveId, specialistId: positiveId,
  weekDays: { type: "array", maxItems: 7, uniqueItems: true, items: { type: "integer", minimum: 1, maximum: 7 } }
} };

export default async function internalLessonsRoutes(fastify) {
  function handler(permission, action) {
    return async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const requester = await findRequester(request.authContext);
        if (!requester) return reply.status(401).send({ message: "Unauthorized." });
        if (!requester.is_platform_admin && !(await hasPermission(requester.role_id, permission))) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        return await action(request, reply);
      } catch (error) {
        if (["42P01", "42703"].includes(error.code)) return reply.status(503).send({ message: "MIGRATION_REQUIRED" });
        if (error.code === "23503") return reply.status(409).send({ message: "DATA_CHANGED" });
        if (error.statusCode) return reply.status(error.statusCode).send({ message: error.message });
        request.log.error({ err: error }, "Internal lesson operation failed");
        return reply.status(500).send({ message: "Internal server error." });
      }
    };
  }
  const config = { rateLimit: fastify.apiRateLimit };
  const days = { type: "array", minItems: 1, maxItems: 7, uniqueItems: true, items: { type: "integer", minimum: 1, maximum: 7 } };
  fastify.post("/actions", { config, schema: { body: {
    type: "object", additionalProperties: false, required: ["kind"],
    properties: { kind: { enum: ["create", "update", "delete", "move", "bulkUpdate", "bulkDelete"] }, input: body,
      items: { type: "array", minItems: 1, maxItems: 1000, items: { type: "object", additionalProperties: false, required: ["id", "revision"], properties: { id: positiveId, revision: positiveId } } },
      fromDay: days.items, toDay: days.items, specialistId: positiveId, weekDays: days,
      addDays: { ...days, minItems: 0 }, removeDays: { ...days, minItems: 0 } },
    allOf: [
      { if: { properties: { kind: { const: "create" } } }, then: { required: ["input"] }, else: { required: ["items"] } },
      { if: { properties: { kind: { const: "update" } } }, then: { required: ["input"] } },
      { if: { properties: { kind: { const: "move" } } }, then: { required: ["fromDay", "toDay"] } },
      { if: { properties: { kind: { enum: ["update", "delete", "move"] } } }, then: { properties: { items: { type: "array", maxItems: 1 } } } }
    ]
  } } }, async (request, reply) => handler(lessonActionPermission(request.body.kind), (req) =>
    performLessonAction({ organizationId: req.authContext.organizationId, action: req.body }))(request, reply));
  fastify.get("/export", { config }, handler(PERMISSIONS.INTERNAL_LESSONS_READ, (request) =>
    listInternalLessons({ organizationId: request.authContext.organizationId, exportAll: true })));
  fastify.get("/options", { config }, handler(PERMISSIONS.INTERNAL_LESSONS_READ, async (request) =>
    getInternalLessonOptions({ organizationId: request.authContext.organizationId })));
  fastify.get("/", { config, schema: { querystring: { type: "object", additionalProperties: false,
    properties: { clientId: positiveId, specialistId: positiveId } } } }, handler(PERMISSIONS.INTERNAL_LESSONS_READ, async (request) =>
    listInternalLessons({ organizationId: request.authContext.organizationId, clientId: request.query.clientId || null, specialistId: request.query.specialistId || null })));
  fastify.post("/", { config, schema: { body } }, handler(PERMISSIONS.INTERNAL_LESSONS_CREATE, async (request, reply) => {
    const item = await saveInternalLesson({ organizationId: request.authContext.organizationId, input: normalizeInternalLesson(request.body) });
    return reply.status(201).send({ item });
  }));
  fastify.put("/:id", { config, schema: { params, body } }, async (request, reply) => {
    const deleting = Array.isArray(request.body?.weekDays) && request.body.weekDays.length === 0;
    return handler(deleting ? PERMISSIONS.INTERNAL_LESSONS_DELETE : PERMISSIONS.INTERNAL_LESSONS_UPDATE, async (req) => {
      if (deleting) return deleteInternalLesson({ organizationId: req.authContext.organizationId, id: req.params.id });
      return { item: await saveInternalLesson({ organizationId: req.authContext.organizationId, id: req.params.id, input: normalizeInternalLesson(req.body) }) };
    })(request, reply);
  });
  fastify.delete("/:id", { config, schema: { params } }, handler(PERMISSIONS.INTERNAL_LESSONS_DELETE, async (request) =>
    deleteInternalLesson({ organizationId: request.authContext.organizationId, id: request.params.id })));
}
