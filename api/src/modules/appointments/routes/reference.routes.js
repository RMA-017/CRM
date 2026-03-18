import { appointmentRouteSchemas } from "./appointment.route-schemas.js";

export function registerAppointmentReferenceRoutes(fastify, context) {
  const {
    setNoCacheHeaders,
    requireAppointmentsAccess,
    requesterHasOrgFeature,
    hasPermission,
    PERMISSIONS,
    parsePositiveIntegerOr,
    resolveOwnAppointmentSpecialistUserId,
    resolveAppointmentVipReadScope,
    getAppointmentClientScopeInfo,
    getAppointmentSpecialistsByOrganization,
    getAppointmentClientNoShowSummary,
    isVipClientAssignedToUser
  } = context;

  fastify.get(
    "/specialists",
    {
      config: { rateLimit: fastify.apiRateLimit }
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
          canReadPlanner,
          canReadSpecialistAbsences,
          canCreateSpecialistAbsences
        ] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_PLANNER_READ),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_SPECIALIST_ABSENCES_READ),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_SPECIALIST_ABSENCES_CREATE)
        ]);
        const canUseSpecialistAbsenceAccess = (
          requesterHasOrgFeature(requester, "appointments.specialist_absences")
          && (canReadSpecialistAbsences || canCreateSpecialistAbsences)
        );
        if (!canReadPlanner && !canUseSpecialistAbsenceAccess) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const access = canReadPlanner
          ? await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_PLANNER_READ)
          : { authContext, requester };
        if (!access) {
          return;
        }

        const ownSpecialistUserId = canReadPlanner
          ? null
          : resolveOwnAppointmentSpecialistUserId(access);
        const items = await getAppointmentSpecialistsByOrganization(access.authContext.organizationId);
        const filteredItems = ownSpecialistUserId
          ? items.filter((item) => String(item?.id || "").trim() === String(ownSpecialistUserId))
          : items;
        return reply.send({ items: filteredItems });
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
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_PLANNER_READ);
        if (!access) {
          return;
        }

        const clientId = parsePositiveIntegerOr(request.query?.clientId, 0);
        if (!clientId) {
          return reply.status(400).send({ field: "clientId", message: "Client is required." });
        }

        const clientScopeInfo = await getAppointmentClientScopeInfo({
          organizationId: access.authContext.organizationId,
          clientId
        });
        if (!clientScopeInfo) {
          return reply.status(404).send({ message: "Client not found." });
        }

        if (clientScopeInfo.isVip) {
          const vipReadScope = await resolveAppointmentVipReadScope({
            roleId: access.requester?.role_id,
            requester: access.requester
          });
          if (vipReadScope !== "all") {
            const requesterUserId = parsePositiveIntegerOr(access.authContext?.userId, 0);
            if (!requesterUserId) {
              return reply.status(403).send({ message: "Forbidden." });
            }
            const isAssignedClient = await isVipClientAssignedToUser({
              organizationId: access.authContext.organizationId,
              clientId,
              userId: requesterUserId
            });
            if (!isAssignedClient) {
              return reply.status(403).send({ message: "Forbidden." });
            }
          }
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
