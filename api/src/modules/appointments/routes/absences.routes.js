import { appointmentRouteSchemas } from "./appointment.route-schemas.js";

export function registerAppointmentAbsenceRoutes(fastify, context) {
  const {
    setNoCacheHeaders,
    requesterHasOrgFeature,
    hasPermission,
    requesterHasPermission: contextRequesterHasPermission,
    PERMISSIONS,
    parsePositiveIntegerOr,
    resolveOwnAppointmentSpecialistUserId,
    listAppointmentSpecialistAbsences,
    createAppointmentSpecialistAbsence,
    withAppointmentTransaction,
    deleteAppointmentSpecialistAbsenceById,
    broadcastAppointmentChange,
    DATE_REGEX
  } = context;
  const requesterHasPermission = typeof contextRequesterHasPermission === "function"
    ? contextRequesterHasPermission
    : async (requester, permissionCode) => {
        if (requester?.is_admin || requester?.is_platform_admin) {
          return true;
        }
        return typeof hasPermission === "function"
          ? hasPermission(requester?.role_id, permissionCode)
          : false;
      };

  function buildDateRange(dateFrom, dateTo) {
    const dates = [];
    if (!DATE_REGEX.test(dateFrom) || !DATE_REGEX.test(dateTo) || dateFrom > dateTo) {
      return dates;
    }
    const cursor = new Date(`${dateFrom}T00:00:00.000Z`);
    const end = new Date(`${dateTo}T00:00:00.000Z`);
    while (cursor.getTime() <= end.getTime()) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  function resolveSelfScopedSpecialistUserId({
    authContext,
    requester,
    fallbackToOwnUser = false,
    requestedSpecialistId = 0,
    fallbackOnlyWhenSpecialistIsUnspecified = false
  }) {
    const roleScopedSpecialistUserId = resolveOwnAppointmentSpecialistUserId({ authContext, requester });
    if (roleScopedSpecialistUserId) {
      return roleScopedSpecialistUserId;
    }
    if (
      fallbackToOwnUser
      && !Boolean(requester?.is_admin)
      && !Boolean(requester?.is_platform_admin)
      && (
        !fallbackOnlyWhenSpecialistIsUnspecified
        || !parsePositiveIntegerOr(requestedSpecialistId, 0)
      )
    ) {
      return parsePositiveIntegerOr(authContext?.userId, 0);
    }
    return 0;
  }

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

        const canReadPlannerAbsences = (
          requesterHasOrgFeature(requester, "appointments.planner")
          && await requesterHasPermission(requester, PERMISSIONS.APPOINTMENTS_PLANNER_READ)
        );
        if (!canReadPlannerAbsences) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const requestedSpecialistId = parsePositiveIntegerOr(request.query?.specialistId, 0);
        const ownSpecialistUserId = 0;
        const specialistId = ownSpecialistUserId || requestedSpecialistId;
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
          specialistId: specialistId || null,
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
          requesterHasOrgFeature(requester, "appointments.planner")
          && await requesterHasPermission(requester, PERMISSIONS.APPOINTMENTS_PLANNER_UPDATE)
        );
        const ownSpecialistUserId = resolveSelfScopedSpecialistUserId({
          authContext,
          requester
        });
        const requestedSpecialistId = parsePositiveIntegerOr(request.body?.specialistId, 0);
        const specialistId = ownSpecialistUserId || requestedSpecialistId;
        if (!canCreateSpecialistAbsences) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (ownSpecialistUserId && requestedSpecialistId && requestedSpecialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const access = { authContext, requester };

        const dateFrom = String(request.body?.dateFrom || request.body?.absenceDate || "").trim();
        const dateTo = String(request.body?.dateTo || dateFrom).trim();
        const startTime = String(request.body?.startTime || "").trim();
        const endTime = String(request.body?.endTime || "").trim();
        const reason = String(request.body?.reason || "").trim();
        if (!specialistId) {
          return reply.status(400).send({ field: "specialistId", message: "Specialist is required." });
        }
        if (!DATE_REGEX.test(dateFrom)) {
          return reply.status(400).send({ field: "dateFrom", message: "Valid date from is required." });
        }
        if (!DATE_REGEX.test(dateTo)) {
          return reply.status(400).send({ field: "dateTo", message: "Valid date to is required." });
        }
        if (dateFrom > dateTo) {
          return reply.status(400).send({ field: "dateRange", message: "Date to must be on or after date from." });
        }
        if ((startTime && !endTime) || (!startTime && endTime)) {
          return reply.status(400).send({ field: "timeRange", message: "Both start and end time are required." });
        }
        if ((startTime && !/^\d{2}:\d{2}$/.test(startTime)) || (endTime && !/^\d{2}:\d{2}$/.test(endTime))) {
          return reply.status(400).send({ field: "timeRange", message: "Invalid time range." });
        }
        if (startTime && endTime && startTime >= endTime) {
          return reply.status(400).send({ field: "timeRange", message: "End time must be after start time." });
        }

        const absenceDates = buildDateRange(dateFrom, dateTo);
        if (absenceDates.length === 0) {
          return reply.status(400).send({ field: "dateRange", message: "Invalid date range." });
        }

        const { items, cancelledItems } = await withAppointmentTransaction(async (db) => {
          const savedItems = [];
          let nextCancelledItems = [];
          for (const absenceDate of absenceDates) {
            const result = await createAppointmentSpecialistAbsence({
              organizationId: authContext.organizationId,
              actorUserId: authContext.userId,
              specialistId,
              absenceDate,
              startTime,
              endTime,
              reason,
              db
            });
            if (result?.item) {
              savedItems.push(result.item);
            }
            if (Array.isArray(result?.cancelledItems) && result.cancelledItems.length > 0) {
              nextCancelledItems = nextCancelledItems.concat(result.cancelledItems);
            }
          }
          return {
            items: savedItems,
            cancelledItems: nextCancelledItems
          };
        });

        const cancelledCount = Array.isArray(cancelledItems) ? cancelledItems.length : 0;
        const savedCount = Array.isArray(items) ? items.length : 0;
        const message = savedCount > 1
          ? (
            cancelledCount > 0
              ? `Specialist absence saved for ${savedCount} days. ${cancelledCount} lessons cancelled.`
              : `Specialist absence saved for ${savedCount} days.`
          )
          : (
            cancelledCount > 0
              ? `Specialist absence saved. ${cancelledCount} lessons cancelled.`
              : "Specialist absence saved."
          );

        await broadcastAppointmentChange(access, {
          type: "specialist-absence-updated",
          message,
          specialistIds: [specialistId],
          data: {
            specialistId: String(specialistId),
            specialistName: String(items?.[0]?.specialistName || "").trim(),
            absenceDate: dateFrom,
            dateFrom,
            dateTo,
            startTime,
            endTime,
            savedCount,
            cancelledCount
          }
        });

        return reply.status(201).send({
          message,
          item: Array.isArray(items) && items.length > 0 ? items[0] : null,
          items,
          dateFrom,
          dateTo,
          startTime,
          endTime,
          savedCount,
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
          requesterHasOrgFeature(requester, "appointments.planner")
          && await requesterHasPermission(requester, PERMISSIONS.APPOINTMENTS_PLANNER_DELETE)
        );
        const access = { authContext, requester };
        const ownSpecialistUserId = resolveSelfScopedSpecialistUserId({
          authContext,
          requester
        });
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
            specialistName: String(result?.item?.specialistName || "").trim(),
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
