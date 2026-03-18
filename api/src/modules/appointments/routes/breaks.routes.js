import { appointmentRouteSchemas } from "./appointment.route-schemas.js";

export function registerAppointmentBreakRoutes(fastify, context) {
  const {
    setNoCacheHeaders,
    requireAppointmentsAccess,
    requesterHasOrgFeature,
    hasPermission,
    PERMISSIONS,
    parsePositiveIntegerOr,
    resolveOwnAppointmentSpecialistUserId,
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
        const authContext = request.authContext;
        const requester = authContext?.requester;
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }

        const [
          canReadBreaksPermission,
          canReadPlannerPermission
        ] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_BREAKS_READ),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_PLANNER_READ)
        ]);
        const canReadBreaks = canReadBreaksPermission && requesterHasOrgFeature(requester, "appointments.breaks");
        const canReadPlanner = canReadPlannerPermission && requesterHasOrgFeature(requester, "appointments.planner");
        if (!canReadBreaks && !canReadPlanner) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const access = { authContext, requester };
        const specialistId = parsePositiveIntegerOr(request.query?.specialistId, 0);
        if (!specialistId) {
          return reply.status(400).send({ field: "specialistId", message: "Specialist is required." });
        }
        const ownSpecialistUserId = canReadPlanner
          ? null
          : resolveOwnAppointmentSpecialistUserId(access);
        if (ownSpecialistUserId && specialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
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
        const access = await requireAppointmentsAccess(
          request,
          reply,
          PERMISSIONS.APPOINTMENTS_BREAKS_UPDATE,
          "appointments.breaks"
        );
        if (!access) {
          return;
        }

        const specialistId = parsePositiveIntegerOr(request.body?.specialistId, 0);
        const items = normalizeBreakItems(request.body?.items);

        const validationError = validateBreaksPayload({ specialistId, items });
        if (validationError) {
          return reply.status(400).send(validationError);
        }
        const ownSpecialistUserId = resolveOwnAppointmentSpecialistUserId(access);
        if (ownSpecialistUserId && specialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
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
        if (error?.statusCode === 409) {
          return reply.status(409).send({ message: String(error?.message || "Break conflicts with existing appointment.") });
        }
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
