import { appointmentRouteSchemas } from "./appointment.route-schemas.js";

export function registerAppointmentReferenceRoutes(fastify, context) {
  const {
    setNoCacheHeaders,
    requireAppointmentsAccess,
    PERMISSIONS,
    parsePositiveIntegerOr,
    getAppointmentSpecialistsByOrganization,
    getAppointmentClientNoShowSummary
  } = context;

  fastify.get(
    "/specialists",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_READ);
        if (!access) {
          return;
        }

        const items = await getAppointmentSpecialistsByOrganization(access.authContext.organizationId);
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment specialists");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/client-no-show-summary",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: appointmentRouteSchemas.clientNoShowSummaryQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_READ);
        if (!access) {
          return;
        }

        const clientId = parsePositiveIntegerOr(request.query?.clientId, 0);
        if (!clientId) {
          return reply.status(400).send({ field: "clientId", message: "Client is required." });
        }

        const item = await getAppointmentClientNoShowSummary({
          organizationId: access.authContext.organizationId,
          clientId
        });

        return reply.send({ item });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment client no-show summary");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}
