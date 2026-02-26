import { appointmentRouteSchemas } from "./appointment.route-schemas.js";

export function registerAppointmentBreakRoutes(fastify, context) {
  const {
    setNoCacheHeaders,
    requireAppointmentsAccess,
    PERMISSIONS,
    parsePositiveIntegerOr,
    getAppointmentBreaksBySpecialist,
    normalizeBreakItems,
    validateBreaksPayload,
    replaceAppointmentBreaksBySpecialist,
    isUniqueOrExclusionConflict
  } = context;

  fastify.get(
    "/breaks",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: appointmentRouteSchemas.breaksQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_READ);
        if (!access) {
          return;
        }

        const specialistId = parsePositiveIntegerOr(request.query?.specialistId, 0);
        if (!specialistId) {
          return reply.status(400).send({ field: "specialistId", message: "Specialist is required." });
        }

        const items = await getAppointmentBreaksBySpecialist({
          organizationId: access.authContext.organizationId,
          specialistId
        });

        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment breaks");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.put(
    "/breaks",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: appointmentRouteSchemas.breaksUpdateBody
      }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_UPDATE);
        if (!access) {
          return;
        }

        const specialistId = parsePositiveIntegerOr(request.body?.specialistId, 0);
        const items = normalizeBreakItems(request.body?.items);

        const validationError = validateBreaksPayload({ specialistId, items });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const savedItems = await replaceAppointmentBreaksBySpecialist({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId,
          specialistId,
          items
        });

        return reply.send({
          message: "Appointment breaks updated.",
          items: savedItems
        });
      } catch (error) {
        if (isUniqueOrExclusionConflict(error)) {
          return reply.status(409).send({ message: "Duplicate break slot for this specialist." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid specialist." });
        }
        if (error?.code === "23514") {
          return reply.status(400).send({ message: "Invalid break data." });
        }
        request.log.error({ err: error }, "Error updating appointment breaks");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}
