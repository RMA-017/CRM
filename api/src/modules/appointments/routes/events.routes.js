export function registerAppointmentEventRoutes(fastify, context) {
  const {
    requireAppointmentsAccess,
    PERMISSIONS,
    isAllowedCorsOrigin,
    subscribeAppointmentEvents
  } = context;

  fastify.get(
    "/events",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_READ);
      if (!access) {
        return;
      }

      const requestOrigin = String(request.headers?.origin || "").trim();
      if (requestOrigin && !isAllowedCorsOrigin(requestOrigin)) {
        return reply.status(403).send({ message: "Forbidden origin." });
      }

      reply.hijack();
      if (requestOrigin) {
        reply.raw.setHeader("Access-Control-Allow-Origin", requestOrigin);
        reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
        reply.raw.setHeader("Vary", "Origin");
      }
      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      if (typeof reply.raw.flushHeaders === "function") {
        reply.raw.flushHeaders();
      }

      let cleaned = false;
      const unsubscribe = subscribeAppointmentEvents(
        {
          organizationId: access.authContext.organizationId,
          userId: access.authContext.userId,
          roleLabel: access.requester?.role,
          isAdmin: Boolean(access.requester?.is_admin),
          listener: (eventPayload) => {
          if (cleaned || reply.raw.writableEnded) {
            return;
          }
          reply.raw.write("event: appointment-change\n");
          reply.raw.write(`data: ${JSON.stringify(eventPayload)}\n\n`);
          }
        }
      );

      const pingTimer = setInterval(() => {
        if (cleaned || reply.raw.writableEnded) {
          return;
        }
        reply.raw.write(": ping\n\n");
      }, 25000);

      const cleanUp = () => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        clearInterval(pingTimer);
        unsubscribe();
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      };

      request.raw.on("close", cleanUp);
      request.raw.on("error", cleanUp);

      reply.raw.write("event: appointment-connected\n");
      reply.raw.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
    }
  );
}
