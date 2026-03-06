import { appointmentRouteSchemas } from "./appointment.route-schemas.js";

const DATE_YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const WORK_SCHEDULE_SCOPE_SET = new Set(["weekly", "exception"]);

function normalizeWorkScheduleScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return WORK_SCHEDULE_SCOPE_SET.has(normalized) ? normalized : "";
}

function normalizeWorkScheduleDayOfWeek(value, toAppointmentDayNum) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 7) {
    return parsed;
  }
  const fromKey = toAppointmentDayNum(String(value || "").trim().toLowerCase());
  if (Number.isInteger(fromKey) && fromKey >= 1 && fromKey <= 7) {
    return fromKey;
  }
  return 0;
}

function normalizeWorkScheduleIsActive(value, parseNullableBoolean) {
  const parsed = parseNullableBoolean(value);
  if (parsed === true) {
    return true;
  }
  if (parsed === false) {
    return false;
  }
  return false;
}

function normalizeWorkScheduleTime(value) {
  const normalized = String(value || "").trim().slice(0, 5);
  return TIME_HM_REGEX.test(normalized) ? normalized : "";
}

function normalizeWorkScheduleReason(value) {
  return String(value || "").trim().slice(0, 120);
}

function parseWorkSchedulePayload({
  body,
  parseNullableBoolean,
  toAppointmentDayNum
}) {
  const ruleScope = normalizeWorkScheduleScope(body?.ruleScope ?? body?.rule_scope);
  if (!ruleScope) {
    return {
      error: {
        field: "ruleScope",
        message: "Invalid rule scope. Use 'weekly' or 'exception'."
      }
    };
  }

  const userIdText = String(body?.userId ?? body?.user_id ?? "").trim();
  const userIdRaw = Number.parseInt(userIdText, 10);
  if (userIdText && (!Number.isInteger(userIdRaw) || userIdRaw <= 0)) {
    return {
      error: {
        field: "userId",
        message: "Invalid user id."
      }
    };
  }
  const userId = Number.isInteger(userIdRaw) && userIdRaw > 0 ? userIdRaw : null;

  const isActive = normalizeWorkScheduleIsActive(body?.isActive ?? body?.is_active, parseNullableBoolean);
  const startTime = normalizeWorkScheduleTime(body?.startTime ?? body?.start_time);
  const endTime = normalizeWorkScheduleTime(body?.endTime ?? body?.end_time);
  const reason = normalizeWorkScheduleReason(body?.reason);

  if (isActive && (!startTime || !endTime)) {
    return {
      error: {
        field: "time",
        message: "Start and end time are required for active schedule."
      }
    };
  }
  if (isActive && startTime >= endTime) {
    return {
      error: {
        field: "time",
        message: "End time must be after start time."
      }
    };
  }

  if (ruleScope === "weekly") {
    const dayOfWeek = normalizeWorkScheduleDayOfWeek(
      body?.dayOfWeek ?? body?.day_of_week ?? body?.dayKey ?? body?.day_key,
      toAppointmentDayNum
    );
    if (!dayOfWeek) {
      return {
        error: {
          field: "dayOfWeek",
          message: "Invalid day of week."
        }
      };
    }
    return {
      value: {
        userId,
        ruleScope,
        dayOfWeek,
        workDate: null,
        isActive,
        startTime: isActive ? startTime : null,
        endTime: isActive ? endTime : null,
        reason
      }
    };
  }

  const workDate = String(body?.workDate ?? body?.work_date ?? "").trim();
  if (!DATE_YMD_REGEX.test(workDate)) {
    return {
      error: {
        field: "workDate",
        message: "Invalid work date. Use YYYY-MM-DD."
      }
    };
  }

  return {
    value: {
      userId,
      ruleScope,
      dayOfWeek: null,
      workDate,
      isActive,
      startTime: isActive ? startTime : null,
      endTime: isActive ? endTime : null,
      reason
    }
  };
}

function parseDefaultWeeklyItems({
  items,
  parseNullableBoolean,
  toAppointmentDayNum
}) {
  if (!Array.isArray(items)) {
    return {
      error: {
        field: "items",
        message: "Items array is required."
      }
    };
  }

  const seen = new Set();
  const normalizedItems = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const dayOfWeek = normalizeWorkScheduleDayOfWeek(
      item?.dayOfWeek ?? item?.day_of_week ?? item?.dayKey ?? item?.day_key,
      toAppointmentDayNum
    );
    if (!dayOfWeek) {
      return {
        error: {
          field: `items.${index}.dayOfWeek`,
          message: "Invalid day of week."
        }
      };
    }
    if (seen.has(dayOfWeek)) {
      return {
        error: {
          field: `items.${index}.dayOfWeek`,
          message: "Duplicate day of week."
        }
      };
    }
    seen.add(dayOfWeek);

    const isActive = normalizeWorkScheduleIsActive(item?.isActive ?? item?.is_active, parseNullableBoolean);
    const startTime = normalizeWorkScheduleTime(item?.startTime ?? item?.start_time);
    const endTime = normalizeWorkScheduleTime(item?.endTime ?? item?.end_time);
    if (isActive && (!startTime || !endTime)) {
      return {
        error: {
          field: `items.${index}.time`,
          message: "Start and end time are required for active schedule."
        }
      };
    }
    if (isActive && startTime >= endTime) {
      return {
        error: {
          field: `items.${index}.time`,
          message: "End time must be after start time."
        }
      };
    }

    normalizedItems.push({
      dayOfWeek,
      isActive,
      startTime: isActive ? startTime : null,
      endTime: isActive ? endTime : null,
      reason: normalizeWorkScheduleReason(item?.reason)
    });
  }

  return {
    value: normalizedItems
  };
}

export function registerAppointmentSettingsConfigRoutes(fastify, context) {
  const {
    setNoCacheHeaders,
    requireAppointmentsAccess,
    hasPermission,
    PERMISSIONS,
    DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
    parseOptionalOrganizationId,
    resolveTargetOrganizationId,
    parsePositiveIntegerOr,
    parseNullableBoolean,
    toAppointmentDayNum,
    normalizeDurationOptions,
    normalizeReminderChannels,
    normalizeVisibleWeekDays,
    validateSettingsPayload,
    getAppointmentSettingsByOrganization,
    saveAppointmentSettings,
    listAppointmentWorkSchedule,
    listAppointmentWorkScheduleStaffByOrganization,
    createAppointmentWorkScheduleEntry,
    updateAppointmentWorkScheduleEntryById,
    deleteAppointmentWorkScheduleEntryById,
    replaceAppointmentDefaultWeeklyWorkSchedule
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
        const authContext = request.authContext;
        const requester = authContext?.requester;
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }

        const [
          canReadAppointments,
          canAccessMyClass,
          canAccessMyChildren
        ] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_READ),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CLASS),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN)
        ]);
        if (!canReadAppointments && !canAccessMyClass && !canAccessMyChildren) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const access = { authContext, requester };

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
        const historyLockDays = Number.parseInt(
          String(
            request.body?.historyLockDays
            ?? request.body?.appointmentHistoryLockDays
            ?? request.body?.history_lock_days
            ?? DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS
          ).trim(),
          10
        );
        const appointmentDurationOptionsMinutes = normalizeDurationOptions(request.body?.appointmentDurationOptions);
        const appointmentDurationMinutes = appointmentDurationOptionsMinutes[0]
          || parsePositiveIntegerOr(request.body?.appointmentDuration, 0);
        const noShowThreshold = parsePositiveIntegerOr(request.body?.noShowThreshold, 0);
        const reminderHours = parsePositiveIntegerOr(request.body?.reminderHours, 0);
        const reminderChannels = normalizeReminderChannels(request.body?.reminderChannels);
        const visibleWeekDays = normalizeVisibleWeekDays(request.body?.visibleWeekDays);

        const validationError = validateSettingsPayload({
          slotIntervalMinutes,
          slotCellHeightPx,
          historyLockDays,
          appointmentDurationMinutes,
          appointmentDurationOptionsMinutes,
          noShowThreshold,
          reminderHours,
          reminderChannels,
          visibleWeekDays
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
          historyLockDays,
          appointmentDurationMinutes,
          appointmentDurationOptionsMinutes,
          noShowThreshold,
          reminderHours,
          reminderChannels,
          visibleWeekDays
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

  fastify.get(
    "/work-schedule",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: appointmentRouteSchemas.workScheduleQuery
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

        const userId = parsePositiveIntegerOr(request.query?.userId ?? request.query?.user_id, 0) || null;
        const requestedRuleScope = String(request.query?.ruleScope ?? request.query?.rule_scope ?? "").trim().toLowerCase();
        if (requestedRuleScope && requestedRuleScope !== "all" && !WORK_SCHEDULE_SCOPE_SET.has(requestedRuleScope)) {
          return reply.status(400).send({
            field: "ruleScope",
            message: "Invalid rule scope."
          });
        }
        const ruleScope = requestedRuleScope && requestedRuleScope !== "all"
          ? requestedRuleScope
          : null;

        const [staff, items] = await Promise.all([
          listAppointmentWorkScheduleStaffByOrganization(targetOrganizationId),
          listAppointmentWorkSchedule({
            organizationId: targetOrganizationId,
            userId,
            ruleScope
          })
        ]);

        return reply.send({
          organizationId: String(targetOrganizationId),
          staff,
          items
        });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching work schedule");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.put(
    "/work-schedule/default-weekly",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: appointmentRouteSchemas.workScheduleDefaultWeeklyBody
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

        const parsedItems = parseDefaultWeeklyItems({
          items: request.body?.items,
          parseNullableBoolean,
          toAppointmentDayNum
        });
        if (parsedItems.error) {
          return reply.status(400).send(parsedItems.error);
        }

        const items = await replaceAppointmentDefaultWeeklyWorkSchedule({
          organizationId: targetOrganizationId,
          actorUserId: access.authContext.userId,
          items: parsedItems.value || []
        });

        return reply.send({
          message: "Default weekly work schedule updated.",
          organizationId: String(targetOrganizationId),
          items
        });
      } catch (error) {
        if (error?.code === "23514") {
          return reply.status(400).send({ message: "Invalid schedule data." });
        }
        request.log.error({ err: error }, "Error updating default weekly work schedule");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/work-schedule",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: appointmentRouteSchemas.workScheduleCreateBody
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

        const parsedPayload = parseWorkSchedulePayload({
          body: request.body,
          parseNullableBoolean,
          toAppointmentDayNum
        });
        if (parsedPayload.error) {
          return reply.status(400).send(parsedPayload.error);
        }

        const item = await createAppointmentWorkScheduleEntry({
          organizationId: targetOrganizationId,
          actorUserId: access.authContext.userId,
          ...parsedPayload.value
        });
        if (!item) {
          return reply.status(400).send({ message: "Unable to create work schedule entry." });
        }

        return reply.status(201).send({
          message: "Work schedule entry created.",
          organizationId: String(targetOrganizationId),
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ message: "Duplicate work schedule entry for selected scope." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid user or organization." });
        }
        if (error?.code === "23514") {
          return reply.status(400).send({ message: "Invalid schedule data." });
        }
        request.log.error({ err: error }, "Error creating work schedule entry");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/work-schedule/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: appointmentRouteSchemas.workScheduleIdParams,
        body: appointmentRouteSchemas.workScheduleUpdateBody
      }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_UPDATE);
        if (!access) {
          return;
        }

        const id = parsePositiveIntegerOr(request.params?.id, 0);
        if (!id) {
          return reply.status(400).send({ field: "id", message: "Invalid schedule entry id." });
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

        const parsedPayload = parseWorkSchedulePayload({
          body: request.body,
          parseNullableBoolean,
          toAppointmentDayNum
        });
        if (parsedPayload.error) {
          return reply.status(400).send(parsedPayload.error);
        }

        const item = await updateAppointmentWorkScheduleEntryById({
          id,
          organizationId: targetOrganizationId,
          actorUserId: access.authContext.userId,
          ...parsedPayload.value
        });
        if (!item) {
          return reply.status(404).send({ message: "Work schedule entry not found." });
        }

        return reply.send({
          message: "Work schedule entry updated.",
          organizationId: String(targetOrganizationId),
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ message: "Duplicate work schedule entry for selected scope." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid user or organization." });
        }
        if (error?.code === "23514") {
          return reply.status(400).send({ message: "Invalid schedule data." });
        }
        request.log.error({ err: error }, "Error updating work schedule entry");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/work-schedule/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: appointmentRouteSchemas.workScheduleIdParams,
        querystring: appointmentRouteSchemas.settingsQuery
      }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(request, reply, PERMISSIONS.APPOINTMENTS_UPDATE);
        if (!access) {
          return;
        }

        const id = parsePositiveIntegerOr(request.params?.id, 0);
        if (!id) {
          return reply.status(400).send({ field: "id", message: "Invalid schedule entry id." });
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

        const result = await deleteAppointmentWorkScheduleEntryById({
          id,
          organizationId: targetOrganizationId
        });
        if (!result || result.rowCount === 0) {
          return reply.status(404).send({ message: "Work schedule entry not found." });
        }

        return reply.send({
          message: "Work schedule entry deleted.",
          organizationId: String(targetOrganizationId)
        });
      } catch (error) {
        request.log.error({ err: error }, "Error deleting work schedule entry");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}
