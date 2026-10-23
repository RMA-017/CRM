import { findRequester } from "../users/users.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { correctInternalLessonCompletion, listInternalLessonJournal } from "./internal-lesson-journal.service.js";

export default async function internalLessonJournalRoutes(fastify) {
  function handler(permission, action) {
    return async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const requester = await findRequester(request.authContext);
        if (!requester) return reply.status(401).send({ message: "Unauthorized." });
        if (!requester.is_platform_admin && !(await hasPermission(requester.role_id, permission))) return reply.status(403).send({ message: "Forbidden." });
        return await action(request);
      } catch (error) {
        if (["42P01", "42703"].includes(error.code)) return reply.status(503).send({ message: "MIGRATION_REQUIRED" });
        if (error.statusCode) return reply.status(error.statusCode).send({ message: error.message });
        request.log.error({ err: error }, "Internal lesson journal operation failed");
        return reply.status(500).send({ message: "Internal server error." });
      }
    };
  }
  const config = { rateLimit: fastify.apiRateLimit };
  const querystring = { type: "object", additionalProperties: false, properties: {
    q: { type: "string", maxLength: 255 }, dateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    dateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, completed: { type: "string", enum: ["true", "false"] },
    child: { type: "string", maxLength: 255 }, specialist: { type: "string", maxLength: 255 }, position: { type: "string", maxLength: 255 },
    page: { type: "integer", minimum: 1, maximum: 1000000 }
  } };
  const list = (request, exportAll = false) => listInternalLessonJournal({
    organizationId: request.authContext.organizationId, search: request.query.q || "", dateFrom: request.query.dateFrom || "",
    dateTo: request.query.dateTo || "", completed: request.query.completed === undefined ? null : request.query.completed === "true", page: request.query.page || 1,
    child: request.query.child || "", specialist: request.query.specialist || "", position: request.query.position || "", exportAll
  });
  fastify.get("/export", { config, schema: { querystring } }, handler(PERMISSIONS.INTERNAL_JOURNAL_READ, (request) => list(request, true)));
  fastify.get("/", { config, schema: { querystring } }, handler(PERMISSIONS.INTERNAL_JOURNAL_READ, (request) => list(request)));
  fastify.put("/:id", { config, schema: {
    params: { type: "object", required: ["id"], properties: { id: { type: "string", pattern: "^[1-9][0-9]{0,17}$" } } },
    body: { type: "object", additionalProperties: false, required: ["completed", "expectedVersion"], properties: {
      completed: { type: "boolean" }, expectedVersion: { type: "integer", minimum: 1, maximum: 2147483647 }
    } }
  } }, handler(PERMISSIONS.INTERNAL_JOURNAL_UPDATE, async (request) => ({ item: await correctInternalLessonCompletion({
    organizationId: request.authContext.organizationId, id: request.params.id, completed: request.body.completed,
    expectedVersion: request.body.expectedVersion, actorUserId: request.authContext.userId
  }) })));
}
