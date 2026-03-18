import { appointmentRouteSchemas } from "./appointment.route-schemas.js";

export function registerAppointmentAbsenceRoutes(fastify, context) {
  const {
    setNoCacheHeaders,
    requesterHasOrgFeature,
    hasPermission,
    PERMISSIONS,
    parsePositiveIntegerOr,
    resolveOwnAppointmentSpecialistUserId,
    listAppointmentSpecialistAbsences,
    createAppointmentSpecialistAbsence,
    deleteAppointmentSpecialistAbsenceById,
    broadcastAppointmentChange,
    DATE_REGEX
  } = context;

  fastify.get(
    "/absences",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: appointmentRouteSchemas.absencesQuery
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
          canReadPlannerPermission,
          canReadSpecialistAbsencesPermission
        ] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_PLANNER_READ),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_SPECIALIST_ABSENCES_READ)
        ]);
        const specialistAbsencesFeatureEnabled = requesterHasOrgFeature(requester, "appointments.specialist_absences");
        const canReadSpecialistAbsences = (
          specialistAbsencesFeatureEnabled
          && canReadSpecialistAbsencesPermission
        );
        const canReadPlannerAbsences = (
          specialistAbsencesFeatureEnabled
          && requesterHasOrgFeature(requester, "appointments.planner")
          && canReadPlannerPermission
        );
        if (!canReadSpecialistAbsences && !canReadPlannerAbsences) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const access = { authContext, requester };
        const ownSpecialistUserId = resolveOwnAppointmentSpecialistUserId(access);
        const requestedSpecialistId = parsePositiveIntegerOr(request.query?.specialistId, 0);
        const specialistId = ownSpecialistUserId || requestedSpecialistId;
        if (ownSpecialistUserId && requestedSpecialistId && requestedSpecialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (!specialistId) {
          return reply.status(400).send({ field: "specialistId", message: "Specialist is required." });
        }

        const dateFrom = String(request.query?.dateFrom || "").trim();
        const dateTo = String(request.query?.dateTo || "").trim();
        if ((dateFrom && !DATE_REGEX.test(dateFrom)) || (dateTo && !DATE_REGEX.test(dateTo))) {
          return reply.status(400).send({ field: "dateRange", message: "Invalid date range." });
        }
        if (dateFrom && dateTo && dateFrom > dateTo) {
          return reply.status(400).send({ field: "dateRange", message: "Invalid date range." });
        }

        const items = await listAppointmentSpecialistAbsences({
          organizationId: authContext.organizationId,
          specialistId,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null
        });

        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment specialist absences");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/absences",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: appointmentRouteSchemas.absenceCreateBody
      }
    },
    async (request, reply) => {
      try {
        const authContext = request.authContext;
        const requester = authContext?.requester;
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }

        const canCreateSpecialistAbsences = (
          requesterHasOrgFeature(requester, "appointments.specialist_absences")
          && await hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_SPECIALIST_ABSENCES_CREATE)
        );
        const access = { authContext, requester };
        const ownSpecialistUserId = resolveOwnAppointmentSpecialistUserId(access);
        const requestedSpecialistId = parsePositiveIntegerOr(request.body?.specialistId, 0);
        const specialistId = ownSpecialistUserId || requestedSpecialistId;
        if (!canCreateSpecialistAbsences) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (ownSpecialistUserId && requestedSpecialistId && requestedSpecialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const absenceDate = String(request.body?.absenceDate || "").trim();
        const reason = String(request.body?.reason || "").trim();
        if (!specialistId) {
          return reply.status(400).send({ field: "specialistId", message: "Specialist is required." });
        }
        if (!DATE_REGEX.test(absenceDate)) {
          return reply.status(400).send({ field: "absenceDate", message: "Valid date is required." });
        }

        const { item, cancelledItems } = await createAppointmentSpecialistAbsence({
          organizationId: authContext.organizationId,
          actorUserId: authContext.userId,
          specialistId,
          absenceDate,
          reason
        });

        const cancelledCount = Array.isArray(cancelledItems) ? cancelledItems.length : 0;
        const message = cancelledCount > 0
          ? `Specialist absence saved. ${cancelledCount} lessons cancelled.`
          : "Specialist absence saved.";

        await broadcastAppointmentChange(access, {
          type: "specialist-absence-updated",
          message,
          specialistIds: [specialistId],
          data: {
            specialistId: String(specialistId),
            absenceDate,
            cancelledCount
          }
        });

        return reply.status(201).send({
          message,
          item,
          cancelledCount,
          cancelledItems
        });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid specialist." });
        }
        if (error?.code === "23514") {
          return reply.status(400).send({ message: "Invalid absence data." });
        }
        request.log.error({ err: error }, "Error saving appointment specialist absence");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/absences/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: appointmentRouteSchemas.absenceIdParams
      }
    },
    async (request, reply) => {
      try {
        const authContext = request.authContext;
        const requester = authContext?.requester;
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }

        const canDeleteSpecialistAbsences = (
          requesterHasOrgFeature(requester, "appointments.specialist_absences")
          && await hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_SPECIALIST_ABSENCES_DELETE)
        );
        const access = { authContext, requester };
        const ownSpecialistUserId = resolveOwnAppointmentSpecialistUserId(access);
        if (!canDeleteSpecialistAbsences) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const id = parsePositiveIntegerOr(request.params?.id, 0);
        if (!id) {
          return reply.status(400).send({ message: "Invalid absence id." });
        }

        const result = await deleteAppointmentSpecialistAbsenceById({
          id,
          organizationId: authContext.organizationId,
          specialistId: ownSpecialistUserId || null
        });
        if (!result?.rowCount) {
          return reply.status(404).send({ message: "Absence not found." });
        }

        await broadcastAppointmentChange(access, {
          type: "specialist-absence-updated",
          message: "Specialist absence deleted.",
          specialistIds: [result?.item?.specialistId || ownSpecialistUserId].filter(Boolean),
          data: {
            absenceId: String(id),
            specialistId: String(result?.item?.specialistId || ownSpecialistUserId || "").trim(),
            absenceDate: String(result?.item?.absenceDate || "").trim()
          }
        });

        return reply.send({
          message: "Specialist absence deleted.",
          item: result.item
        });
      } catch (error) {
        request.log.error({ err: error }, "Error deleting appointment specialist absence");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}
