import { appointmentRouteSchemas } from "./appointment.route-schemas.js";

export function registerAppointmentReferenceRoutes(fastify, context) {
  const {
    setNoCacheHeaders,
    requireAppointmentsAccess,
    requesterHasOrgFeature,
    hasPermission,
    requesterHasPermission: contextRequesterHasPermission,
    PERMISSIONS,
    parsePositiveIntegerOr,
    getAppointmentClientScopeInfo,
    getAppointmentSpecialistsByOrganization,
    getAppointmentClientNoShowSummary
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

        const canReadPlanner = await requesterHasPermission(requester, PERMISSIONS.APPOINTMENTS_PLANNER_READ);
        if (!canReadPlanner || !requesterHasOrgFeature(requester, "appointments.planner")) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_PLANNER_READ);
        if (!access) {
          return;
        }

        const ownSpecialistUserId = null;
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
