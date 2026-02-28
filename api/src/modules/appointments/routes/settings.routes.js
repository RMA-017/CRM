import { appointmentRouteSchemas } from "./appointment.route-schemas.js";

export function registerAppointmentSettingsConfigRoutes(fastify, context) {
  const {
    setNoCacheHeaders,
    requireAppointmentsAccess,
    PERMISSIONS,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
    parseOptionalOrganizationId,
    resolveTargetOrganizationId,
    parsePositiveIntegerOr,
    normalizeDurationOptions,
    normalizeReminderChannels,
    normalizeVisibleWeekDays,
    normalizeWorkingHours,
    validateSettingsPayload,
    getAppointmentSettingsByOrganization,
    saveAppointmentSettings
  } = context;

  fastify.get(
    "/settings",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: appointmentRouteSchemas.settingsQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_READ);
        if (!access) {
          return;
        }

        const { value: requestedOrganizationId, error: organizationError } = parseOptionalOrganizationId(
          request.query?.organizationId ?? request.query?.organization_id
        );
        if (organizationError) {
          return reply.status(400).send(organizationError);
        }
        const targetOrganizationId = resolveTargetOrganizationId(access, requestedOrganizationId);
        if (!targetOrganizationId) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const settings = await getAppointmentSettingsByOrganization(
          targetOrganizationId
        );
        return reply.send({
          item: settings || null,
          organizationId: String(targetOrganizationId)
        });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment settings");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/settings",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: appointmentRouteSchemas.settingsPatchBody
      }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_UPDATE);
        if (!access) {
          return;
        }

        const { value: requestedOrganizationId, error: organizationError } = parseOptionalOrganizationId(
          request.body?.organizationId ?? request.body?.organization_id
        );
        if (organizationError) {
          return reply.status(400).send(organizationError);
        }
        const targetOrganizationId = resolveTargetOrganizationId(access, requestedOrganizationId);
        if (!targetOrganizationId) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const slotIntervalMinutes = parsePositiveIntegerOr(request.body?.slotInterval, 0);
        const slotSubDivisions = parsePositiveIntegerOr(request.body?.slotSubDivisions, 1);
        const slotCellHeightPx = parsePositiveIntegerOr(
          request.body?.slotCellHeightPx
          ?? request.body?.appointmentSlotCellHeightPx
          ?? request.body?.slot_cell_height_px,
          DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX
        );
        const appointmentDurationOptionsMinutes = normalizeDurationOptions(request.body?.appointmentDurationOptions);
        const appointmentDurationMinutes = appointmentDurationOptionsMinutes[0]
          || parsePositiveIntegerOr(request.body?.appointmentDuration, 0);
        const noShowThreshold = parsePositiveIntegerOr(request.body?.noShowThreshold, 0);
        const reminderHours = parsePositiveIntegerOr(request.body?.reminderHours, 0);
        const reminderChannels = normalizeReminderChannels(request.body?.reminderChannels);
        const visibleWeekDays = normalizeVisibleWeekDays(request.body?.visibleWeekDays);
        const workingHours = normalizeWorkingHours(request.body?.workingHours);

        const validationError = validateSettingsPayload({
          slotIntervalMinutes,
          slotCellHeightPx,
          appointmentDurationMinutes,
          appointmentDurationOptionsMinutes,
          noShowThreshold,
          reminderHours,
          reminderChannels,
          visibleWeekDays,
          workingHours
        });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await saveAppointmentSettings({
          organizationId: targetOrganizationId,
          actorUserId: access.authContext.userId,
          slotIntervalMinutes,
          slotSubDivisions,
          slotCellHeightPx,
          appointmentDurationMinutes,
          appointmentDurationOptionsMinutes,
          noShowThreshold,
          reminderHours,
          reminderChannels,
          visibleWeekDays,
          workingHours
        });

        return reply.send({
          message: "Appointment settings updated.",
          item,
          organizationId: String(targetOrganizationId)
        });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(400).send({
            field: "organizationId",
            message: "Invalid organization id."
          });
        }
        if (error?.code === "MIGRATION_REQUIRED") {
          return reply.status(500).send({
            message: "DB migration required: appointment settings table is missing required columns."
          });
        }
        request.log.error({ err: error }, "Error updating appointment settings");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}
