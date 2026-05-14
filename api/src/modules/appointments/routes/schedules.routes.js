import { sendMigrationRequired } from "../../../lib/http.js";
import { requesterHasOrgFeature } from "../../../lib/org-features.js";
import { schedulesReadCache } from "../appointment-schedules-read-cache.js";
import { appointmentRouteSchemas } from "./appointment.route-schemas.js";

const VIP_AUTO_ROLLING_REPEAT_WINDOW_DAYS = 30;

function buildSchedulesReadCacheKey({
  organizationId,
  specialistId,
  clientId,
  classId,
  assignedUserId,
  dateFrom,
  dateTo,
  vipOnly,
  recurringOnly,
  lightMode
}) {
  return [
    `org:${organizationId}`,
    `sp:${specialistId || 0}`,
    `cl:${clientId || 0}`,
    `class:${classId || 0}`,
    `au:${assignedUserId || 0}`,
    `from:${dateFrom}`,
    `to:${dateTo}`,
    `vip:${vipOnly ? 1 : 0}`,
    `rec:${recurringOnly ? 1 : 0}`,
    `light:${lightMode ? 1 : 0}`
  ].join("|");
}

function buildClientScheduleConflictMessage(appointmentDate = "") {
  const normalizedDate = String(appointmentDate || "").trim();
  return normalizedDate
    ? `This client already has another appointment at this time (${normalizedDate}).`
    : "This client already has another appointment at this time.";
}

function getTodayYmdInTashkent() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function getConfirmedFutureDateError(status, appointmentDates) {
  if (String(status || "").trim().toLowerCase() !== "confirmed") {
    return null;
  }
  const today = getTodayYmdInTashkent();
  const futureDate = (Array.isArray(appointmentDates) ? appointmentDates : [appointmentDates])
    .map((date) => String(date || "").trim())
    .find((date) => date && today && date > today);
  return futureDate
    ? {
        field: "status",
        message: `Future appointments cannot be confirmed. Requested date: ${futureDate}.`
      }
    : null;
}

function buildDeleteScopeLabel(scope = "single") {
  return scope === "single" ? "appointment" : "appointment series";
}

function buildOwnPlannerDeleteForbiddenMessage(scope = "single") {
  return `You can only delete ${buildDeleteScopeLabel(scope)} in your own planner.`;
}

function buildOwnPlannerSingleOnlyEditForbiddenMessage() {
  return "Specialists can only edit a single appointment in their own planner.";
}

function buildOwnPlannerLimitedEditForbiddenMessage() {
  return "Specialists can only edit time, service, status and note on their own appointments.";
}

function buildOwnPlannerSingleOnlyDeleteForbiddenMessage() {
  return "Specialists can only delete a single appointment in their own planner.";
}

function normalizeScheduleCompareText(value) {
  return String(value ?? "").trim();
}

function normalizeScheduleCompareStatus(value) {
  return normalizeScheduleCompareText(value).toLowerCase();
}

function isScheduleItemChangedByPayload(item, {
  specialistId,
  clientId,
  appointmentDate,
  startTime,
  endTime,
  durationMinutes,
  serviceName,
  status,
  note,
  applyAppointmentDate = true,
  getDurationMinutesFromTimes: resolveDurationMinutes
}) {
  const previousDurationMinutes = Number.parseInt(String(item?.durationMinutes || "").trim(), 10)
    || (typeof resolveDurationMinutes === "function" ? resolveDurationMinutes(item?.startTime, item?.endTime) : 0);
  return (
    Number.parseInt(String(item?.specialistId || ""), 10) !== specialistId
    || Number.parseInt(String(item?.clientId || ""), 10) !== clientId
    || (applyAppointmentDate && normalizeScheduleCompareText(item?.appointmentDate) !== normalizeScheduleCompareText(appointmentDate))
    || normalizeScheduleCompareText(item?.startTime) !== normalizeScheduleCompareText(startTime)
    || normalizeScheduleCompareText(item?.endTime) !== normalizeScheduleCompareText(endTime)
    || previousDurationMinutes !== durationMinutes
    || normalizeScheduleCompareText(item?.serviceName) !== normalizeScheduleCompareText(serviceName)
    || normalizeScheduleCompareStatus(item?.status) !== normalizeScheduleCompareStatus(status)
    || normalizeScheduleCompareText(item?.note) !== normalizeScheduleCompareText(note)
  );
}

function toAbsenceTimeMinutes(value) {
  const normalized = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }
  const [hoursText, minutesText] = normalized.split(":");
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return (hours * 60) + minutes;
}

function buildSpecialistAbsenceRangesByDate(items) {
  const rangesByDate = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const absenceDate = String(item?.absenceDate || "").trim();
    if (!absenceDate) {
      return;
    }
    const startTime = String(item?.startTime || "").trim();
    const endTime = String(item?.endTime || "").trim();
    const startMinutes = toAbsenceTimeMinutes(startTime);
    const endMinutes = toAbsenceTimeMinutes(endTime);
    const list = rangesByDate.get(absenceDate) || [];
    list.push({
      startTime,
      endTime,
      startMinutes,
      endMinutes,
      reason: String(item?.reason || "").trim()
    });
    rangesByDate.set(absenceDate, list);
  });
  return rangesByDate;
}

function hasSpecialistAbsenceConflict({
  absenceRangesByDate,
  appointmentDate,
  startTime,
  endTime
}) {
  const normalizedAppointmentDate = String(appointmentDate || "").trim();
  if (!normalizedAppointmentDate) {
    return null;
  }
  const ranges = absenceRangesByDate instanceof Map ? (absenceRangesByDate.get(normalizedAppointmentDate) || []) : [];
  if (ranges.length === 0) {
    return null;
  }
  const appointmentStartMinutes = toAbsenceTimeMinutes(startTime);
  const appointmentEndMinutes = toAbsenceTimeMinutes(endTime);
  if (appointmentStartMinutes === null || appointmentEndMinutes === null || appointmentStartMinutes >= appointmentEndMinutes) {
    return null;
  }
  return ranges.find((range) => {
    if (range.startMinutes === null || range.endMinutes === null || range.startMinutes >= range.endMinutes) {
      return true;
    }
    return appointmentStartMinutes < range.endMinutes && range.startMinutes < appointmentEndMinutes;
  }) || null;
}

function buildSpecialistAbsenceConflictMessage(appointmentDate = "", conflict = null) {
  const normalizedDate = String(appointmentDate || "").trim();
  const startTime = String(conflict?.startTime || "").trim();
  const endTime = String(conflict?.endTime || "").trim();
  if (normalizedDate && startTime && endTime) {
    return `Specialist is marked absent on ${normalizedDate} from ${startTime} to ${endTime}.`;
  }
  return normalizedDate
    ? `Specialist is marked absent on ${normalizedDate}.`
    : "Specialist is marked absent on the selected date.";
}

function formatUtcDateYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function ensureVipAutoRollingRepeatUntilDate(appointmentDate, currentUntilDate, parseDateYmdToUtcDate) {
  const baseDate = parseDateYmdToUtcDate(appointmentDate);
  if (!baseDate) {
    return String(currentUntilDate || "").trim();
  }
  const minimumUntilDate = new Date(baseDate.getTime());
  minimumUntilDate.setUTCDate(minimumUntilDate.getUTCDate() + Math.max(0, VIP_AUTO_ROLLING_REPEAT_WINDOW_DAYS - 1));
  const normalizedCurrentUntilDate = String(currentUntilDate || "").trim();
  const currentDate = parseDateYmdToUtcDate(normalizedCurrentUntilDate);
  if (!currentDate || currentDate < minimumUntilDate) {
    return formatUtcDateYmd(minimumUntilDate);
  }
  return normalizedCurrentUntilDate;
}

function isClientOverlapConstraintConflict(error) {
  return (
    (error?.code === "23505" || error?.code === "23P01")
    && String(error?.constraint || "").trim().toLowerCase() === "ex_appointment_schedules_active_client_overlap"
  );
}

export function registerAppointmentScheduleRoutes(fastify, context) {
  const {
    randomUUID,
    setNoCacheHeaders,
    requireAppointmentsAccess,
    hasPermission,
    requesterHasPermission: contextRequesterHasPermission,
    PERMISSIONS,
    parsePositiveIntegerOr,
    parseNullableBoolean,
    normalizeAppointmentStatus,
    normalizeScheduleScope,
    normalizeScheduleRepeatPayload,
    normalizeVisibleWeekDays,
    validateSchedulePayload,
    validateScheduleRepeatPayload,
    validateRepeatDaysAgainstVisibleWeekDays,
    validateSlotAgainstWorkingHours,
    getDurationMinutesFromTimes,
    getHistoryLockErrorForRequester,
    parseDateYmdToUtcDate,
    toDayKeyFromUtcDate,
    collectDayNumsFromDates,
    buildWeeklyRecurringDates,
    buildBreakRangesByDay,
    hasSpecialistBreakConflict,
    buildBreakConflictMessage,
    buildWorkScheduleBlockRangesByDay,
    hasSpecialistWorkScheduleConflict,
    buildWorkScheduleBlockConflictMessage,
    buildScheduleNotification,
    createRouteError,
    isUniqueOrExclusionConflict,
    getAppointmentPlannerReportFilters,
    getAppointmentPlannerReport,
    getAppointmentClientScopeInfo,
    ensureAutoRollingRecurringSchedulesCoverRange,
    getAppointmentSchedulesByRange,
    getAppointmentHistoryLockDaysByOrganization,
    getAppointmentSettingsByOrganization,
    listAppointmentSpecialistAbsences,
    getAppointmentBreaksBySpecialistAndDays,
    getAppointmentScheduleTargetsByScope,
    hasAppointmentClientConflict,
    hasAppointmentScheduleConflict,
    hasVipRoutineConflictForSpecialist,
    hasVipRoutineConflictForClient,
    createAppointmentSchedule,
    updateAppointmentScheduleByIdWithRepeatMeta,
    updateAppointmentSchedulesByIds,
    deleteAppointmentSchedulesByIds,
    withAppointmentTransaction,
    toAppointmentDayNum,
    resolveOwnAppointmentSpecialistUserId,
    isVipClientAssignedToUser,
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

  function hasScheduleDateTimeChanges(previousItems, nextItems) {
    const previousById = new Map(
      (Array.isArray(previousItems) ? previousItems : [])
        .map((item) => [String(item?.id || "").trim(), item])
        .filter(([id]) => Boolean(id))
    );
    return (Array.isArray(nextItems) ? nextItems : []).some((item) => {
      const previous = previousById.get(String(item?.id || "").trim());
      if (!previous) {
        return false;
      }
      return (
        String(previous?.appointmentDate || "").trim() !== String(item?.appointmentDate || "").trim()
        || String(previous?.startTime || "").trim() !== String(item?.startTime || "").trim()
        || String(previous?.endTime || "").trim() !== String(item?.endTime || "").trim()
      );
    });
  }

  async function notifyScheduleDateTimeEdit(access, previousItems, nextItems) {
    if (!hasScheduleDateTimeChanges(previousItems, nextItems)) {
      return;
    }
    const notificationItems = Array.isArray(nextItems) ? nextItems : [];
    if (notificationItems.length === 0) {
      return;
    }
    const scheduleNotification = buildScheduleNotification("edit", notificationItems, access?.requester);
    await broadcastAppointmentChange(access, {
      type: "schedule-updated",
      message: scheduleNotification.message,
      specialistIds: notificationItems.map((item) => item?.specialistId),
      data: scheduleNotification.data
    });
  }

  async function requirePlannerReportAccess(request, reply) {
    const authContext = request.authContext;
    const requester = authContext?.requester;
    if (!requester) {
      reply.status(401).send({ message: "Unauthorized." });
      return null;
    }

    const [canReadBase, canReadOnly, canReadAll] = await Promise.all([
      requesterHasPermission(requester, PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT),
      requesterHasPermission(requester, PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT_ONLY),
      requesterHasPermission(requester, PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT_ALL)
    ]);
    if (!canReadBase && !canReadOnly && !canReadAll) {
      reply.status(403).send({ message: "Forbidden." });
      return null;
    }

    return {
      authContext,
      requester,
      reportScope: canReadAll ? "all" : "only"
    };
  }

  function sortScheduleItems(items) {
    return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
      const leftDate = String(left?.appointmentDate || "").trim();
      const rightDate = String(right?.appointmentDate || "").trim();
      if (leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate);
      }
      const leftTime = String(left?.startTime || "").trim();
      const rightTime = String(right?.startTime || "").trim();
      if (leftTime !== rightTime) {
        return leftTime.localeCompare(rightTime);
      }
      const leftId = Number.parseInt(String(left?.id || ""), 10) || 0;
      const rightId = Number.parseInt(String(right?.id || ""), 10) || 0;
      return leftId - rightId;
    });
  }

  function buildScheduleItemsByDate(items) {
    const map = new Map();
    for (const item of sortScheduleItems(items)) {
      const appointmentDate = String(item?.appointmentDate || "").trim();
      if (!appointmentDate || map.has(appointmentDate)) {
        continue;
      }
      map.set(appointmentDate, item);
    }
    return map;
  }

  function shiftDateYmd(dateText, offsetDays = 0) {
    const baseDate = parseDateYmdToUtcDate(dateText);
    if (!baseDate) {
      return "";
    }
    const nextDate = new Date(baseDate.getTime());
    nextDate.setUTCDate(nextDate.getUTCDate() + Number(offsetDays || 0));
    return formatUtcDateYmd(nextDate);
  }

  function getWeekStartDateYmd(dateText) {
    const baseDate = parseDateYmdToUtcDate(dateText);
    if (!baseDate) {
      return "";
    }
    const nextDate = new Date(baseDate.getTime());
    const utcDay = nextDate.getUTCDay();
    const offsetDays = utcDay === 0 ? -6 : (1 - utcDay);
    nextDate.setUTCDate(nextDate.getUTCDate() + offsetDays);
    return formatUtcDateYmd(nextDate);
  }

  function isSameWeekDateYmd(leftDateText, rightDateText) {
    const leftWeekStart = getWeekStartDateYmd(leftDateText);
    const rightWeekStart = getWeekStartDateYmd(rightDateText);
    return Boolean(leftWeekStart) && leftWeekStart === rightWeekStart;
  }

  function inferRepeatDayKeysFromSeriesItems(items) {
    const dayKeys = [];
    for (const item of Array.isArray(items) ? items : []) {
      const dayKey = getScheduleItemDayKey(item);
      if (dayKey) {
        dayKeys.push(dayKey);
      }
    }
    return normalizeVisibleWeekDays(dayKeys);
  }

  function getScheduleItemDayKey(item) {
    const appointmentDate = String(item?.appointmentDate || "").trim();
    const appointmentUtcDate = parseDateYmdToUtcDate(appointmentDate);
    if (!appointmentUtcDate) {
      return "";
    }
    return String(toDayKeyFromUtcDate(appointmentUtcDate) || "").trim().toLowerCase();
  }

  function haveSameNormalizedDayKeys(left, right) {
    const normalizedLeft = normalizeVisibleWeekDays(Array.isArray(left) ? left : []);
    const normalizedRight = normalizeVisibleWeekDays(Array.isArray(right) ? right : []);
    if (normalizedLeft.length !== normalizedRight.length) {
      return false;
    }
    return normalizedLeft.every((dayKey, index) => dayKey === normalizedRight[index]);
  }

  function parseScheduleDayKeysQuery(value) {
    const rawItems = Array.isArray(value)
      ? value
      : [value];
    const dayKeys = rawItems.flatMap((item) => (
      String(item || "")
        .split(",")
        .map((part) => String(part || "").trim().toLowerCase())
        .filter(Boolean)
    ));
    return normalizeVisibleWeekDays(dayKeys);
  }

  function resolveRecurringSingleScopeTargetByDayKeys(target, requestedDayKeys) {
    if (!target?.isRecurring || target?.scope !== "single") {
      return target;
    }
    const seriesItems = sortScheduleItems(
      Array.isArray(target.seriesItems) && target.seriesItems.length > 0
        ? target.seriesItems
        : target.items
    );
    if (seriesItems.length === 0) {
      return target;
    }
    const originalRepeatDayKeys = normalizeVisibleWeekDays(
      Array.isArray(target.repeatDays) && target.repeatDays.length > 0
        ? target.repeatDays
        : inferRepeatDayKeysFromSeriesItems(seriesItems)
    );
    const sourceSeriesDayKey = String(
      toDayKeyFromUtcDate(parseDateYmdToUtcDate(target.anchorAppointmentDate)) || ""
    ).trim().toLowerCase();
    const scopedDayKeys = normalizeVisibleWeekDays(
      requestedDayKeys.length > 0
        ? requestedDayKeys.filter((dayKey) => originalRepeatDayKeys.includes(dayKey))
        : (sourceSeriesDayKey ? [sourceSeriesDayKey] : [])
    );
    const effectiveDayKey = scopedDayKeys[0] || sourceSeriesDayKey || "";
    if (!effectiveDayKey || !target.anchorAppointmentDate) {
      return target;
    }
    const scopedItems = seriesItems.filter((item) => (
      isSameWeekDateYmd(item?.appointmentDate, target.anchorAppointmentDate)
      && getScheduleItemDayKey(item) === effectiveDayKey
    ));
    if (scopedItems.length === 0) {
      return target;
    }
    const scopedAnchor = sortScheduleItems(scopedItems)[0];
    return {
      ...target,
      anchorId: Number.parseInt(String(scopedAnchor?.id || ""), 10) || target.anchorId,
      anchorAppointmentDate: String(scopedAnchor?.appointmentDate || target.anchorAppointmentDate || "").trim(),
      items: [scopedAnchor]
    };
  }

  async function assertRecurringSeriesUpdateHasNoConflicts({
    organizationId,
    appointmentDates,
    existingItemsByDate,
    specialistId,
    clientId,
    startTime,
    endTime,
    status,
    db
  }) {
    if (!(status === "pending" || status === "confirmed")) {
      return;
    }

    const normalizedDates = Array.from(
      new Set(
        (Array.isArray(appointmentDates) ? appointmentDates : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right));
    if (normalizedDates.length === 0) {
      return;
    }

    const settingsForAvailability = await getAppointmentSettingsByOrganization(
      organizationId,
      { specialistId, db }
    );
    const absenceRangesByDate = buildSpecialistAbsenceRangesByDate(
      await listAppointmentSpecialistAbsences({
        organizationId,
        specialistId,
        dateFrom: normalizedDates[0],
        dateTo: normalizedDates[normalizedDates.length - 1]
      })
    );
    const breakRangesByDay = buildBreakRangesByDay(
      await getAppointmentBreaksBySpecialistAndDays({
        organizationId,
        specialistId,
        dayNums: collectDayNumsFromDates(normalizedDates)
      })
    );
    const blockedRangesByDay = buildWorkScheduleBlockRangesByDay(settingsForAvailability?.blockedTimes);
    const includeDateInMessage = normalizedDates.length > 1;

    for (const appointmentDate of normalizedDates) {
      const existingItem = existingItemsByDate instanceof Map
        ? (existingItemsByDate.get(appointmentDate) || null)
        : null;
      const excludeId = existingItem?.id || null;

      const absenceConflict = hasSpecialistAbsenceConflict({
        absenceRangesByDate,
        appointmentDate,
        startTime,
        endTime
      });
      if (absenceConflict) {
        throw createRouteError(409, {
          message: buildSpecialistAbsenceConflictMessage(appointmentDate, absenceConflict)
        });
      }

      const workingHoursError = validateSlotAgainstWorkingHours({
        settings: settingsForAvailability,
        appointmentDate,
        startTime,
        endTime
      });
      if (workingHoursError) {
        throw createRouteError(
          400,
          includeDateInMessage
            ? {
                field: workingHoursError.field,
                message: `${workingHoursError.message} (${appointmentDate}).`
              }
            : workingHoursError
        );
      }

      const blockedConflict = hasSpecialistWorkScheduleConflict({
        blockedRangesByDay,
        appointmentDate,
        startTime,
        endTime
      });
      if (blockedConflict) {
        throw createRouteError(409, {
          message: includeDateInMessage
            ? buildWorkScheduleBlockConflictMessage({
                conflict: blockedConflict,
                appointmentDate
              })
            : buildWorkScheduleBlockConflictMessage({ conflict: blockedConflict })
        });
      }

      const breakConflict = hasSpecialistBreakConflict({
        breakRangesByDay,
        appointmentDate,
        startTime,
        endTime
      });
      if (breakConflict) {
        throw createRouteError(409, {
          message: includeDateInMessage
            ? buildBreakConflictMessage({
                conflict: breakConflict,
                appointmentDate
              })
            : buildBreakConflictMessage({ conflict: breakConflict })
        });
      }

      const hasConflict = await hasAppointmentScheduleConflict({
        organizationId,
        specialistId,
        appointmentDate,
        startTime,
        endTime,
        excludeId,
        db
      });
      if (hasConflict) {
        throw createRouteError(409, {
          message: includeDateInMessage
            ? `Slot conflict on ${appointmentDate}.`
            : "This slot conflicts with existing appointment."
        });
      }

      const hasVipSpecialistConflict = await hasVipRoutineConflictForSpecialist({
        organizationId,
        specialistId,
        appointmentDate,
        startTime,
        endTime,
        db
      });
      if (hasVipSpecialistConflict) {
        throw createRouteError(409, {
          message: includeDateInMessage
            ? `Specialist has a VIP Daily Routine conflict on ${appointmentDate}.`
            : "This slot conflicts with the specialist's VIP Daily Routine."
        });
      }

      const hasClientConflict = await hasAppointmentClientConflict({
        organizationId,
        clientId,
        appointmentDate,
        startTime,
        endTime,
        excludeId,
        db
      });
      if (hasClientConflict) {
        throw createRouteError(409, {
          message: includeDateInMessage
            ? buildClientScheduleConflictMessage(appointmentDate)
            : buildClientScheduleConflictMessage()
        });
      }

      const hasVipClientConflict = await hasVipRoutineConflictForClient({
        organizationId,
        clientId,
        appointmentDate,
        startTime,
        endTime,
        db
      });
      if (hasVipClientConflict) {
        throw createRouteError(409, {
          message: includeDateInMessage
            ? `Client has a VIP Daily Routine conflict on ${appointmentDate}.`
            : "This slot conflicts with the client's VIP Daily Routine."
        });
      }
    }
  }

  fastify.get(
    "/report/filters",
    { config: { rateLimit: fastify.apiRateLimit } },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const access = await requirePlannerReportAccess(request, reply);
      if (!access) {
        return;
      }

      try {
        const includeAllClients = parseNullableBoolean(
          request.query?.includeAllClients ?? request.query?.include_all_clients
        ) === true;
        const requesterUserId = parsePositiveIntegerOr(access.authContext?.userId, 0);
        const ownSpecialistUserId = access.reportScope === "only" ? (requesterUserId || null) : null;
        const assignedUserId = access.reportScope === "all"
          ? null
          : ownSpecialistUserId;
        if (access.reportScope !== "all" && !assignedUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const data = await getAppointmentPlannerReportFilters({
          organizationId: access.authContext.organizationId,
          assignedUserId,
          specialistId: ownSpecialistUserId,
          includeAllClients
        });
        data.scope = {
          specialistId: ownSpecialistUserId || null,
          specialistLocked: Boolean(ownSpecialistUserId)
        };
        if (ownSpecialistUserId) {
          data.specialists = (Array.isArray(data?.specialists) ? data.specialists : []).filter(
            (item) => String(item?.id || "").trim() === String(ownSpecialistUserId)
          );
        }
        return reply.send(data);
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Appointment planner report migration is required.")) {
          return;
        }
        request.log.error({ err: error }, "Error fetching appointment planner report filters");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/report",
    { config: { rateLimit: fastify.apiRateLimit } },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const access = await requirePlannerReportAccess(request, reply);
      if (!access) {
        return;
      }

      const fromRaw = String(request.query?.from || "").trim();
      const toRaw = String(request.query?.to || "").trim();
      if (!DATE_REGEX.test(fromRaw) || !DATE_REGEX.test(toRaw)) {
        return reply.status(400).send({ message: "Invalid date range. Use YYYY-MM-DD format." });
      }
      if (fromRaw > toRaw) {
        return reply.status(400).send({ message: "'from' must not be after 'to'." });
      }

      const specialistId = parsePositiveIntegerOr(request.query?.specialistId, 0) || null;
      const clientId = parsePositiveIntegerOr(request.query?.clientId, 0) || null;
      const isVip = parseNullableBoolean(request.query?.isVip ?? request.query?.is_vip);

      try {
        const requesterUserId = parsePositiveIntegerOr(access.authContext?.userId, 0);
        const ownSpecialistUserId = access.reportScope === "only" ? (requesterUserId || null) : null;
        if (access.reportScope !== "all" && !ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (ownSpecialistUserId && specialistId && specialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const effectiveSpecialistId = ownSpecialistUserId || specialistId;
        const assignedUserId = access.reportScope === "all" ? null : ownSpecialistUserId;
        const clientScopeInfo = clientId
          ? await getAppointmentClientScopeInfo({
              organizationId: access.authContext.organizationId,
              clientId
            })
          : null;
        if (clientScopeInfo?.isVip && assignedUserId) {
          const isAssignedClient = await isVipClientAssignedToUser({
            organizationId: access.authContext.organizationId,
            clientId,
            userId: assignedUserId
          });
          if (!isAssignedClient) {
            return reply.status(403).send({ message: "Forbidden." });
          }
        }

        const data = await getAppointmentPlannerReport({
          organizationId: access.authContext.organizationId,
          from: fromRaw,
          to: toRaw,
          specialistId: effectiveSpecialistId,
          clientId,
          isVip,
          assignedUserId
        });
        if (ownSpecialistUserId) {
          data.specialists = (Array.isArray(data?.specialists) ? data.specialists : []).filter(
            (item) => String(item?.id || "").trim() === String(ownSpecialistUserId)
          );
        }
        data.scope = {
          specialistId: ownSpecialistUserId || null,
          specialistLocked: Boolean(ownSpecialistUserId)
        };
        return reply.send(data);
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Appointment planner report migration is required.")) {
          return;
        }
        request.log.error({ err: error }, "Error fetching appointment planner report");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/schedules",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: appointmentRouteSchemas.schedulesQuery
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

        const requestedSpecialistId = parsePositiveIntegerOr(request.query?.specialistId, 0);
        const clientId = parsePositiveIntegerOr(request.query?.clientId, 0);
        const classId = parsePositiveIntegerOr(request.query?.classId, 0);
        const dateFrom = String(request.query?.dateFrom || "").trim();
        const dateTo = String(request.query?.dateTo || "").trim();
        const vipOnly = parseNullableBoolean(request.query?.vipOnly ?? request.query?.vip_only) === true;
        const lightMode = parseNullableBoolean(request.query?.light ?? request.query?.lite) === true;
        const recurringOnly = parseNullableBoolean(
          request.query?.recurringOnly ?? request.query?.recurring_only
        ) === true;

        const rawCanReadAppointments = await requesterHasPermission(
          requester,
          PERMISSIONS.APPOINTMENTS_PLANNER_READ
        );
        const canReadAppointments = requesterHasOrgFeature(requester, "appointments.planner")
          && rawCanReadAppointments;
        if (!canReadAppointments) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const access = { authContext, requester };
        const ownSpecialistUserId = null;
        if (ownSpecialistUserId && requestedSpecialistId && requestedSpecialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const specialistId = ownSpecialistUserId || requestedSpecialistId;

        if (!specialistId && !clientId && !classId) {
          return reply.status(400).send({ field: "specialistId", message: "Specialist, client or class is required." });
        }
        if (classId && !vipOnly) {
          return reply.status(400).send({ field: "vipOnly", message: "classId requires vipOnly=true." });
        }
        if (!DATE_REGEX.test(dateFrom) || !DATE_REGEX.test(dateTo)) {
          return reply.status(400).send({ field: "dateRange", message: "Invalid date range." });
        }
        if (dateFrom > dateTo) {
          return reply.status(400).send({ field: "dateRange", message: "Invalid date range." });
        }
        const clientScopeInfo = clientId
          ? await getAppointmentClientScopeInfo({
              organizationId: access.authContext.organizationId,
              clientId
            })
          : null;
        const effectiveVipOnly = vipOnly || clientScopeInfo?.isVip === true;
        const assignedUserId = 0;

        let autoRollingResult = null;
        try {
          autoRollingResult = await ensureAutoRollingRecurringSchedulesCoverRange({
            organizationId: access.authContext.organizationId,
            specialistId,
            clientId,
            classId,
            assignedUserId: null,
            dateTo,
            vipOnly: effectiveVipOnly
          });
        } catch (error) {
          request.log.error({ err: error }, "Error extending auto-rolling appointment schedules");
        }
        if (autoRollingResult?.changed) {
          schedulesReadCache.clear();
        }

        const cacheKey = buildSchedulesReadCacheKey({
          organizationId: access.authContext.organizationId,
          specialistId,
          clientId,
          classId,
          assignedUserId,
          dateFrom,
          dateTo,
          vipOnly: effectiveVipOnly,
          recurringOnly,
          lightMode
        });
        const cachedItems = schedulesReadCache.get(cacheKey);
        if (cachedItems) {
          return reply.send({ items: cachedItems });
        }

        const items = await getAppointmentSchedulesByRange({
          organizationId: access.authContext.organizationId,
          specialistId,
          clientId,
          classId,
          assignedUserId: null,
          dateFrom,
          dateTo,
          lightMode,
          vipOnly: effectiveVipOnly,
          recurringOnly
        });
        schedulesReadCache.set(cacheKey, items);

        return reply.send({ items });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "VIP class daily routine migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error fetching appointment schedules");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/schedules",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: appointmentRouteSchemas.scheduleCreateBody
      }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(
          request,
          reply,
          PERMISSIONS.APPOINTMENTS_PLANNER_CREATE,
          "appointments.planner"
        );
        if (!access) {
          return;
        }

        const specialistId = parsePositiveIntegerOr(request.body?.specialistId, 0);
        const ownSpecialistUserId = resolveOwnAppointmentSpecialistUserId(access);
        if (ownSpecialistUserId && specialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const clientId = parsePositiveIntegerOr(request.body?.clientId, 0);
        const appointmentDate = String(request.body?.appointmentDate || "").trim();
        const startTime = String(request.body?.startTime || "").trim();
        const endTime = String(request.body?.endTime || "").trim();
        const requestedDurationMinutes = parsePositiveIntegerOr(request.body?.durationMinutes, 0);
        const durationMinutes = requestedDurationMinutes || getDurationMinutesFromTimes(startTime, endTime);
        const serviceName = String(request.body?.service || request.body?.serviceName || "").trim();
        const status = normalizeAppointmentStatus(request.body?.status || "pending");
        const note = String(request.body?.note || "").trim();
        let repeat = normalizeScheduleRepeatPayload(request.body?.repeat);
        if (repeat.enabled && repeat.autoRolling) {
          repeat = {
            ...repeat,
            untilDate: ensureVipAutoRollingRepeatUntilDate(
              appointmentDate,
              repeat.untilDate,
              parseDateYmdToUtcDate
            )
          };
        }

        const errors = validateSchedulePayload({
          specialistId,
          clientId,
          appointmentDate,
          startTime,
          endTime,
          durationMinutes,
          serviceName,
          status,
          note
        });
        if (Object.keys(errors).length > 0) {
          return reply.status(400).send({ errors });
        }
        const confirmedDateError = getConfirmedFutureDateError(status, [appointmentDate]);
        if (confirmedDateError) {
          return reply.status(400).send(confirmedDateError);
        }

        const repeatError = validateScheduleRepeatPayload(repeat, appointmentDate);
        if (repeatError) {
          return reply.status(400).send(repeatError);
        }
        const historyLockDays = await getAppointmentHistoryLockDaysByOrganization(
          access.authContext.organizationId
        );

        if (repeat.enabled) {
          const settingsForRepeat = await getAppointmentSettingsByOrganization(
            access.authContext.organizationId,
            { specialistId }
          );
          const repeatDaysValidation = validateRepeatDaysAgainstVisibleWeekDays({
            repeatDayKeys: repeat.dayKeys,
            visibleWeekDayKeys: settingsForRepeat?.visibleWeekDays
          });
          if (repeatDaysValidation.error) {
            return reply.status(400).send(repeatDaysValidation.error);
          }

          let repeatDayKeys = repeatDaysValidation.normalizedDayKeys;
          const appointmentDayKey = toDayKeyFromUtcDate(parseDateYmdToUtcDate(appointmentDate));
          if (appointmentDayKey && !repeatDayKeys.includes(appointmentDayKey)) {
            repeatDayKeys = normalizeVisibleWeekDays([...repeatDayKeys, appointmentDayKey]);
          }
          if (repeatDayKeys.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "Select at least one repeat day."
            });
          }

          const recurringDates = buildWeeklyRecurringDates({
            startDate: appointmentDate,
            untilDate: repeat.untilDate,
            dayKeys: repeatDayKeys
          });
          if (recurringDates.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "No matching week days in selected range."
            });
          }
          if (!recurringDates.includes(appointmentDate)) {
            recurringDates.unshift(appointmentDate);
          }
          const historyLockError = getHistoryLockErrorForRequester(access.requester, recurringDates, historyLockDays);
          if (historyLockError) {
            return reply.status(403).send(historyLockError);
          }
          const repeatConfirmedDateError = getConfirmedFutureDateError(status, recurringDates);
          if (repeatConfirmedDateError) {
            return reply.status(400).send(repeatConfirmedDateError);
          }

          const repeatDayNums = repeatDayKeys
            .map((dayKey) => toAppointmentDayNum(dayKey))
            .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
          const repeatGroupKey = randomUUID();
          const shouldEnforceAvailability = status === "pending" || status === "confirmed";
          const blockedRangesByDay = shouldEnforceAvailability
            ? buildWorkScheduleBlockRangesByDay(settingsForRepeat?.blockedTimes)
            : new Map();
          const breakRangesByDay = shouldEnforceAvailability
            ? buildBreakRangesByDay(
                await getAppointmentBreaksBySpecialistAndDays({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  dayNums: collectDayNumsFromDates(recurringDates)
                })
              )
            : new Map();
          const absenceRangesByDate = shouldEnforceAvailability
            ? buildSpecialistAbsenceRangesByDate(
                await listAppointmentSpecialistAbsences({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  dateFrom: recurringDates[0],
                  dateTo: recurringDates[recurringDates.length - 1]
                })
              )
            : new Map();
          const { createdItems, skippedDates } = await withAppointmentTransaction(async (db) => {
            const nextCreatedItems = [];
            const nextSkippedDates = [];
            let rootAssigned = false;

            for (const recurringDate of recurringDates) {
              if (shouldEnforceAvailability) {
                const absenceConflict = hasSpecialistAbsenceConflict({
                  absenceRangesByDate,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (absenceConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: buildSpecialistAbsenceConflictMessage(recurringDate, absenceConflict)
                  });
                }

                const workingHoursError = validateSlotAgainstWorkingHours({
                  settings: settingsForRepeat,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (workingHoursError) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(400, workingHoursError);
                }

                const recurringBlockedConflict = hasSpecialistWorkScheduleConflict({
                  blockedRangesByDay,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (recurringBlockedConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: buildWorkScheduleBlockConflictMessage({
                      conflict: recurringBlockedConflict,
                      appointmentDate: recurringDate
                    })
                  });
                }

                const recurringBreakConflict = hasSpecialistBreakConflict({
                  breakRangesByDay,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (recurringBreakConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: buildBreakConflictMessage({
                      conflict: recurringBreakConflict,
                      appointmentDate: recurringDate
                    })
                  });
                }

                const hasConflict = await hasAppointmentScheduleConflict({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  db
                });
                if (hasConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, { message: `Slot conflict on ${recurringDate}.` });
                }

                const hasVipSpecialistConflict = await hasVipRoutineConflictForSpecialist({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  db
                });
                if (hasVipSpecialistConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: `Specialist has a VIP Daily Routine conflict on ${recurringDate}.`
                  });
                }

                const hasClientConflict = await hasAppointmentClientConflict({
                  organizationId: access.authContext.organizationId,
                  clientId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  db
                });
                if (hasClientConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: buildClientScheduleConflictMessage(recurringDate)
                  });
                }

                const hasVipClientConflict = await hasVipRoutineConflictForClient({
                  organizationId: access.authContext.organizationId,
                  clientId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  db
                });
                if (hasVipClientConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: `Client has a VIP Daily Routine conflict on ${recurringDate}.`
                  });
                }
              }

              try {
                const isRepeatRoot = !rootAssigned;
                const createdItem = await createAppointmentSchedule({
                  organizationId: access.authContext.organizationId,
                  actorUserId: access.authContext.userId,
                  specialistId,
                  clientId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  durationMinutes,
                  serviceName,
                  status,
                  note,
                  repeatGroupKey,
                  repeatType: "weekly",
                  repeatUntilDate: repeat.untilDate,
                  repeatDays: repeatDayNums,
                  repeatAnchorDate: appointmentDate,
                  isRepeatRoot,
                  isAutoRollingRepeat: repeat.autoRolling === true,
                  db
                });
                if (createdItem) {
                  nextCreatedItems.push(createdItem);
                  if (isRepeatRoot) {
                    rootAssigned = true;
                  }
                }
              } catch (error) {
                if (isUniqueOrExclusionConflict(error) && repeat.skipConflicts) {
                  nextSkippedDates.push(recurringDate);
                  continue;
                }
                throw error;
              }
            }

            return {
              createdItems: nextCreatedItems,
              skippedDates: nextSkippedDates
            };
          });

          if (createdItems.length === 0) {
            return reply.status(409).send({
              message: "No appointments were created. All selected slots conflict with existing appointments.",
              summary: {
                createdCount: 0,
                skippedCount: skippedDates.length,
                skippedDates
              }
            });
          }

          const createdCount = createdItems.length;
          const skippedCount = skippedDates.length;
          const message = skippedCount > 0
            ? `${createdCount} appointments created. ${skippedCount} conflicts skipped.`
            : `${createdCount} appointments created.`;
          const scheduleNotification = buildScheduleNotification("create", createdItems, access?.requester);

          await broadcastAppointmentChange(access, {
            type: "schedule-created",
            message: scheduleNotification.message,
            specialistIds: [specialistId],
            data: scheduleNotification.data
          });
          schedulesReadCache.clear();

          return reply.status(201).send({
            message,
            item: createdItems[0],
            items: createdItems,
            summary: {
              createdCount,
              skippedCount,
              skippedDates
            }
          });
        }
        const historyLockError = getHistoryLockErrorForRequester(access.requester, [appointmentDate], historyLockDays);
        if (historyLockError) {
          return reply.status(403).send(historyLockError);
        }

        if (status === "pending" || status === "confirmed") {
          const absenceItems = await listAppointmentSpecialistAbsences({
            organizationId: access.authContext.organizationId,
            specialistId,
            dateFrom: appointmentDate,
            dateTo: appointmentDate
          });
          const absenceConflict = hasSpecialistAbsenceConflict({
            absenceRangesByDate: buildSpecialistAbsenceRangesByDate(absenceItems),
            appointmentDate,
            startTime,
            endTime
          });
          if (absenceConflict) {
            return reply.status(409).send({
              message: buildSpecialistAbsenceConflictMessage(appointmentDate, absenceConflict)
            });
          }

          const settingsForSlot = await getAppointmentSettingsByOrganization(
            access.authContext.organizationId,
            { specialistId }
          );
          const workingHoursError = validateSlotAgainstWorkingHours({
            settings: settingsForSlot,
            appointmentDate,
            startTime,
            endTime
          });
          if (workingHoursError) {
            return reply.status(400).send(workingHoursError);
          }

          const blockedRangesByDay = buildWorkScheduleBlockRangesByDay(settingsForSlot?.blockedTimes);
          const blockedConflict = hasSpecialistWorkScheduleConflict({
            blockedRangesByDay,
            appointmentDate,
            startTime,
            endTime
          });
          if (blockedConflict) {
            return reply.status(409).send({
              message: buildWorkScheduleBlockConflictMessage({ conflict: blockedConflict })
            });
          }

          const breakRangesByDay = buildBreakRangesByDay(
            await getAppointmentBreaksBySpecialistAndDays({
              organizationId: access.authContext.organizationId,
              specialistId,
              dayNums: collectDayNumsFromDates([appointmentDate])
            })
          );
          const breakConflict = hasSpecialistBreakConflict({
            breakRangesByDay,
            appointmentDate,
            startTime,
            endTime
          });
          if (breakConflict) {
            return reply.status(409).send({
              message: buildBreakConflictMessage({ conflict: breakConflict })
            });
          }

          const hasConflict = await hasAppointmentScheduleConflict({
            organizationId: access.authContext.organizationId,
            specialistId,
            appointmentDate,
            startTime,
            endTime
          });
          if (hasConflict) {
            return reply.status(409).send({ message: "This slot conflicts with existing appointment." });
          }

          const hasVipSpecialistConflict = await hasVipRoutineConflictForSpecialist({
            organizationId: access.authContext.organizationId,
            specialistId,
            appointmentDate,
            startTime,
            endTime
          });
          if (hasVipSpecialistConflict) {
            return reply.status(409).send({
              message: "This slot conflicts with the specialist's VIP Daily Routine."
            });
          }

          const hasClientConflict = await hasAppointmentClientConflict({
            organizationId: access.authContext.organizationId,
            clientId,
            appointmentDate,
            startTime,
            endTime
          });
          if (hasClientConflict) {
            return reply.status(409).send({ message: buildClientScheduleConflictMessage() });
          }

          const hasVipClientConflict = await hasVipRoutineConflictForClient({
            organizationId: access.authContext.organizationId,
            clientId,
            appointmentDate,
            startTime,
            endTime
          });
          if (hasVipClientConflict) {
            return reply.status(409).send({
              message: "This slot conflicts with the client's VIP Daily Routine."
            });
          }
        }

        const item = await createAppointmentSchedule({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId,
          specialistId,
          clientId,
          appointmentDate,
          startTime,
          endTime,
          durationMinutes,
          serviceName,
          status,
          note
        });
        const scheduleNotification = buildScheduleNotification("create", [item], access?.requester);

        await broadcastAppointmentChange(access, {
          type: "schedule-created",
          message: scheduleNotification.message,
          specialistIds: [specialistId],
          data: scheduleNotification.data
        });
        schedulesReadCache.clear();

        return reply.status(201).send({
          message: "Appointment created.",
          item
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Appointment status history migration is required.", { includeDetails: true })) {
          return;
        }
        if (Number.isInteger(error?.statusCode) && error?.payload) {
          return reply.status(error.statusCode).send(error.payload);
        }
        if (isClientOverlapConstraintConflict(error)) {
          return reply.status(409).send({ message: buildClientScheduleConflictMessage() });
        }
        if (isUniqueOrExclusionConflict(error)) {
          return reply.status(409).send({ message: "This slot is already occupied." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid specialist or client." });
        }
        if (error?.code === "23514" || error?.code === "22P02" || error?.code === "22007") {
          return reply.status(400).send({ message: "Invalid appointment data." });
        }
        request.log.error({ err: error }, "Error creating appointment schedule");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/schedules/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: appointmentRouteSchemas.scheduleIdParams,
        querystring: appointmentRouteSchemas.scheduleScopeQuery,
        body: appointmentRouteSchemas.scheduleUpdateBody
      }
    },
    async (request, reply) => {
      try {
        const authContext = request.authContext;
        const requester = authContext?.requester;
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }

        const rawCanUpdateAppointments = await requesterHasPermission(
          requester,
          PERMISSIONS.APPOINTMENTS_PLANNER_UPDATE
        );
        const canUpdateAppointments = requesterHasOrgFeature(requester, "appointments.planner")
          && rawCanUpdateAppointments;
        if (!canUpdateAppointments) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const access = { authContext, requester };

        const id = parsePositiveIntegerOr(request.params?.id, 0);
        if (!id) {
          return reply.status(400).send({ message: "Invalid appointment id." });
        }
        const scope = normalizeScheduleScope(request.query?.scope);
        if (!scope) {
          return reply.status(400).send({ field: "scope", message: "Invalid scope." });
        }
        const requestedScopedDayKeys = parseScheduleDayKeysQuery(
          request.query?.dayKeys ?? request.query?.day_keys
        );

        const specialistId = parsePositiveIntegerOr(request.body?.specialistId, 0);
        const ownSpecialistUserId = resolveOwnAppointmentSpecialistUserId(access);
        if (ownSpecialistUserId && scope !== "single") {
          return reply.status(403).send({ message: buildOwnPlannerSingleOnlyEditForbiddenMessage() });
        }
        if (ownSpecialistUserId && specialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const clientId = parsePositiveIntegerOr(request.body?.clientId, 0);
        const appointmentDate = String(request.body?.appointmentDate || "").trim();
        const startTime = String(request.body?.startTime || "").trim();
        const endTime = String(request.body?.endTime || "").trim();
        const requestedDurationMinutes = parsePositiveIntegerOr(request.body?.durationMinutes, 0);
        const durationMinutes = requestedDurationMinutes || getDurationMinutesFromTimes(startTime, endTime);
        const serviceName = String(request.body?.service || request.body?.serviceName || "").trim();
        const status = normalizeAppointmentStatus(request.body?.status || "pending");
        const note = String(request.body?.note || "").trim();
        let repeat = normalizeScheduleRepeatPayload(request.body?.repeat);
        if (repeat.enabled && repeat.autoRolling) {
          repeat = {
            ...repeat,
            untilDate: ensureVipAutoRollingRepeatUntilDate(
              appointmentDate,
              repeat.untilDate,
              parseDateYmdToUtcDate
            )
          };
        }
        const errors = validateSchedulePayload({
          specialistId,
          clientId,
          appointmentDate,
          startTime,
          endTime,
          durationMinutes,
          serviceName,
          status,
          note
        });
        if (Object.keys(errors).length > 0) {
          return reply.status(400).send({ errors });
        }

        const rawTarget = await getAppointmentScheduleTargetsByScope({
          organizationId: access.authContext.organizationId,
          id,
          scope
        });
        const target = resolveRecurringSingleScopeTargetByDayKeys(rawTarget, requestedScopedDayKeys);
        if (!Array.isArray(target.items) || target.items.length === 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }
        if (
          ownSpecialistUserId
          && target.items.some((item) => Number.parseInt(String(item?.specialistId || ""), 10) !== ownSpecialistUserId)
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (ownSpecialistUserId) {
          if (target.scope !== "single" || target.items.length !== 1) {
            return reply.status(403).send({ message: buildOwnPlannerSingleOnlyEditForbiddenMessage() });
          }
          const targetItem = target.items[0];
          const targetDurationMinutes = parsePositiveIntegerOr(targetItem?.durationMinutes, 0)
            || getDurationMinutesFromTimes(targetItem?.startTime, targetItem?.endTime);
          const keepsLimitedEditScope = (
            Number.parseInt(String(targetItem?.specialistId || ""), 10) === specialistId
            && Number.parseInt(String(targetItem?.clientId || ""), 10) === clientId
            && String(targetItem?.appointmentDate || "").trim() === appointmentDate
            && targetDurationMinutes === durationMinutes
            && !repeat.enabled
          );
          if (!keepsLimitedEditScope) {
            return reply.status(403).send({ message: buildOwnPlannerLimitedEditForbiddenMessage() });
          }
        }
        const historyLockDays = await getAppointmentHistoryLockDaysByOrganization(
          access.authContext.organizationId
        );
        const targetHistoryLockError = getHistoryLockErrorForRequester(
          access.requester,
          target.items.map((item) => item.appointmentDate),
          historyLockDays
        );
        if (targetHistoryLockError) {
          return reply.status(403).send(targetHistoryLockError);
        }
        if (target.scope === "single") {
          const requestDateHistoryLockError = getHistoryLockErrorForRequester(
            access.requester,
            [appointmentDate],
            historyLockDays
          );
          if (requestDateHistoryLockError) {
            return reply.status(403).send(requestDateHistoryLockError);
          }
        }
        const targetDatesForConfirmedStatus = target.scope === "single"
          ? [appointmentDate]
          : target.items.map((item) => item.appointmentDate);
        const confirmedDateError = getConfirmedFutureDateError(status, targetDatesForConfirmedStatus);
        if (confirmedDateError) {
          return reply.status(400).send(confirmedDateError);
        }

        const hasSingleScopePayloadChanges = target.scope === "single"
          && target.items.some((item) => isScheduleItemChangedByPayload(item, {
            specialistId,
            clientId,
            appointmentDate,
            startTime,
            endTime,
            durationMinutes,
            serviceName,
            status,
            note,
            applyAppointmentDate: true,
            getDurationMinutesFromTimes
          }));
        if (target.scope === "single" && !repeat.enabled && !hasSingleScopePayloadChanges) {
          const unchangedItem = target.items[0] || null;
          return reply.send({
            message: "Appointment unchanged.",
            item: unchangedItem,
            items: target.items,
            summary: {
              scope: "single",
              affectedCount: 0,
              notificationSkipped: true
            }
          });
        }

        const shouldConvertSingleToRepeat = repeat.enabled && target.scope === "single" && !target.isRecurring;
        if (shouldConvertSingleToRepeat) {
          const repeatError = validateScheduleRepeatPayload(repeat, appointmentDate);
          if (repeatError) {
            return reply.status(400).send(repeatError);
          }

          const settingsForRepeat = await getAppointmentSettingsByOrganization(
            access.authContext.organizationId,
            { specialistId }
          );
          const repeatDaysValidation = validateRepeatDaysAgainstVisibleWeekDays({
            repeatDayKeys: repeat.dayKeys,
            visibleWeekDayKeys: settingsForRepeat?.visibleWeekDays
          });
          if (repeatDaysValidation.error) {
            return reply.status(400).send(repeatDaysValidation.error);
          }

          let repeatDayKeys = repeatDaysValidation.normalizedDayKeys;
          const appointmentDayKey = toDayKeyFromUtcDate(parseDateYmdToUtcDate(appointmentDate));
          if (appointmentDayKey && !repeatDayKeys.includes(appointmentDayKey)) {
            repeatDayKeys = normalizeVisibleWeekDays([...repeatDayKeys, appointmentDayKey]);
          }
          if (repeatDayKeys.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "Select at least one repeat day."
            });
          }

          const recurringDates = buildWeeklyRecurringDates({
            startDate: appointmentDate,
            untilDate: repeat.untilDate,
            dayKeys: repeatDayKeys
          });
          if (recurringDates.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "No matching week days in selected range."
            });
          }
          if (!recurringDates.includes(appointmentDate)) {
            recurringDates.unshift(appointmentDate);
          }
          const repeatHistoryLockError = getHistoryLockErrorForRequester(
            access.requester,
            recurringDates,
            historyLockDays
          );
          if (repeatHistoryLockError) {
            return reply.status(403).send(repeatHistoryLockError);
          }
          const repeatConfirmedDateError = getConfirmedFutureDateError(status, recurringDates);
          if (repeatConfirmedDateError) {
            return reply.status(400).send(repeatConfirmedDateError);
          }

          const shouldEnforceAvailability = status === "pending" || status === "confirmed";
          const repeatGroupKey = randomUUID();
          const repeatDayNums = repeatDayKeys
            .map((dayKey) => toAppointmentDayNum(dayKey))
            .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
          const blockedRangesByDay = shouldEnforceAvailability
            ? buildWorkScheduleBlockRangesByDay(settingsForRepeat?.blockedTimes)
            : new Map();
          const breakRangesByDay = shouldEnforceAvailability
            ? buildBreakRangesByDay(
                await getAppointmentBreaksBySpecialistAndDays({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  dayNums: collectDayNumsFromDates(recurringDates)
                })
              )
            : new Map();
          const absenceRangesByDate = shouldEnforceAvailability
            ? buildSpecialistAbsenceRangesByDate(
                await listAppointmentSpecialistAbsences({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  dateFrom: recurringDates[0],
                  dateTo: recurringDates[recurringDates.length - 1]
                })
              )
            : new Map();
          const { anchorItem, createdItems, skippedDates } = await withAppointmentTransaction(async (db) => {
            if (shouldEnforceAvailability) {
              const anchorAbsenceConflict = hasSpecialistAbsenceConflict({
                absenceRangesByDate,
                appointmentDate,
                startTime,
                endTime
              });
              if (anchorAbsenceConflict) {
                throw createRouteError(409, {
                  message: buildSpecialistAbsenceConflictMessage(appointmentDate, anchorAbsenceConflict)
                });
              }

              const anchorWorkingHoursError = validateSlotAgainstWorkingHours({
                settings: settingsForRepeat,
                appointmentDate,
                startTime,
                endTime
              });
              if (anchorWorkingHoursError) {
                throw createRouteError(400, anchorWorkingHoursError);
              }

              const anchorBlockedConflict = hasSpecialistWorkScheduleConflict({
                blockedRangesByDay,
                appointmentDate,
                startTime,
                endTime
              });
              if (anchorBlockedConflict) {
                throw createRouteError(409, {
                  message: buildWorkScheduleBlockConflictMessage({ conflict: anchorBlockedConflict })
                });
              }

              const anchorBreakConflict = hasSpecialistBreakConflict({
                breakRangesByDay,
                appointmentDate,
                startTime,
                endTime
              });
              if (anchorBreakConflict) {
                throw createRouteError(409, {
                  message: buildBreakConflictMessage({ conflict: anchorBreakConflict })
                });
              }

              const hasAnchorConflict = await hasAppointmentScheduleConflict({
                organizationId: access.authContext.organizationId,
                specialistId,
                appointmentDate,
                startTime,
                endTime,
                excludeId: id,
                db
              });
              if (hasAnchorConflict) {
                throw createRouteError(409, { message: "This slot conflicts with existing appointment." });
              }

              const hasAnchorVipSpecialistConflict = await hasVipRoutineConflictForSpecialist({
                organizationId: access.authContext.organizationId,
                specialistId,
                appointmentDate,
                startTime,
                endTime,
                db
              });
              if (hasAnchorVipSpecialistConflict) {
                throw createRouteError(409, {
                  message: "This slot conflicts with the specialist's VIP Daily Routine."
                });
              }

              const hasAnchorClientConflict = await hasAppointmentClientConflict({
                organizationId: access.authContext.organizationId,
                clientId,
                appointmentDate,
                startTime,
                endTime,
                excludeId: id,
                db
              });
              if (hasAnchorClientConflict) {
                throw createRouteError(409, {
                  message: buildClientScheduleConflictMessage()
                });
              }

              const hasAnchorVipClientConflict = await hasVipRoutineConflictForClient({
                organizationId: access.authContext.organizationId,
                clientId,
                appointmentDate,
                startTime,
                endTime,
                db
              });
              if (hasAnchorVipClientConflict) {
                throw createRouteError(409, {
                  message: "This slot conflicts with the client's VIP Daily Routine."
                });
              }
            }

            const updatedAnchorItem = await updateAppointmentScheduleByIdWithRepeatMeta({
              organizationId: access.authContext.organizationId,
              actorUserId: access.authContext.userId,
              id,
              specialistId,
              clientId,
              appointmentDate,
              startTime,
              endTime,
              durationMinutes,
              serviceName,
              status,
              note,
              repeatGroupKey,
              repeatUntilDate: repeat.untilDate,
              repeatDays: repeatDayNums,
              repeatAnchorDate: appointmentDate,
              isRepeatRoot: true,
              isAutoRollingRepeat: repeat.autoRolling === true,
              db
            });
            if (!updatedAnchorItem) {
              throw createRouteError(404, { message: "Appointment not found." });
            }

            const nextCreatedItems = [];
            const nextSkippedDates = [];
            for (const recurringDate of recurringDates) {
              if (recurringDate === appointmentDate) {
                continue;
              }

              if (shouldEnforceAvailability) {
                const recurringAbsenceConflict = hasSpecialistAbsenceConflict({
                  absenceRangesByDate,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (recurringAbsenceConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: buildSpecialistAbsenceConflictMessage(recurringDate, recurringAbsenceConflict)
                  });
                }

                const workingHoursError = validateSlotAgainstWorkingHours({
                  settings: settingsForRepeat,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (workingHoursError) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(400, workingHoursError);
                }

                const recurringBlockedConflict = hasSpecialistWorkScheduleConflict({
                  blockedRangesByDay,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (recurringBlockedConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: buildWorkScheduleBlockConflictMessage({
                      conflict: recurringBlockedConflict,
                      appointmentDate: recurringDate
                    })
                  });
                }

                const recurringBreakConflict = hasSpecialistBreakConflict({
                  breakRangesByDay,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime
                });
                if (recurringBreakConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: buildBreakConflictMessage({
                      conflict: recurringBreakConflict,
                      appointmentDate: recurringDate
                    })
                  });
                }

                const hasConflict = await hasAppointmentScheduleConflict({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  db
                });
                if (hasConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, { message: `Slot conflict on ${recurringDate}.` });
                }

                const hasVipSpecialistConflict2 = await hasVipRoutineConflictForSpecialist({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  db
                });
                if (hasVipSpecialistConflict2) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: `Specialist has a VIP Daily Routine conflict on ${recurringDate}.`
                  });
                }

                const hasClientConflict = await hasAppointmentClientConflict({
                  organizationId: access.authContext.organizationId,
                  clientId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  db
                });
                if (hasClientConflict) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: buildClientScheduleConflictMessage(recurringDate)
                  });
                }

                const hasVipClientConflict2 = await hasVipRoutineConflictForClient({
                  organizationId: access.authContext.organizationId,
                  clientId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  db
                });
                if (hasVipClientConflict2) {
                  if (repeat.skipConflicts) {
                    nextSkippedDates.push(recurringDate);
                    continue;
                  }
                  throw createRouteError(409, {
                    message: `Client has a VIP Daily Routine conflict on ${recurringDate}.`
                  });
                }
              }

              try {
                const createdItem = await createAppointmentSchedule({
                  organizationId: access.authContext.organizationId,
                  actorUserId: access.authContext.userId,
                  specialistId,
                  clientId,
                  appointmentDate: recurringDate,
                  startTime,
                  endTime,
                  durationMinutes,
                  serviceName,
                  status,
                  note,
                  repeatGroupKey,
                  repeatType: "weekly",
                  repeatUntilDate: repeat.untilDate,
                  repeatDays: repeatDayNums,
                  repeatAnchorDate: appointmentDate,
                  isRepeatRoot: false,
                  isAutoRollingRepeat: repeat.autoRolling === true,
                  db
                });
                if (createdItem) {
                  nextCreatedItems.push(createdItem);
                }
              } catch (error) {
                if (isUniqueOrExclusionConflict(error) && repeat.skipConflicts) {
                  nextSkippedDates.push(recurringDate);
                  continue;
                }
                throw error;
              }
            }

            return {
              anchorItem: updatedAnchorItem,
              createdItems: nextCreatedItems,
              skippedDates: nextSkippedDates
            };
          });

          const items = [anchorItem, ...createdItems];
          const affectedCount = items.length;
          const message = skippedDates.length > 0
            ? `${affectedCount} appointments updated. ${skippedDates.length} conflicts skipped.`
            : `${affectedCount} appointments updated.`;
          schedulesReadCache.clear();
          await notifyScheduleDateTimeEdit(access, target.items, items);

          return reply.send({
            message,
            item: anchorItem,
            items,
            summary: {
              scope: "single",
              affectedCount,
              skippedCount: skippedDates.length,
              skippedDates
            }
          });
        }

        const shouldDetachRecurringSingleEdit = target.isRecurring && target.scope === "single" && !repeat.enabled;
        if (shouldDetachRecurringSingleEdit) {
          const anchorItem = target.items[0] || null;
          const seriesItems = sortScheduleItems(
            Array.isArray(target.seriesItems) && target.seriesItems.length > 0
              ? target.seriesItems
              : target.items
          );
          const remainingSeriesItems = seriesItems.filter(
            (item) => Number.parseInt(String(item?.id || ""), 10) !== Number.parseInt(String(anchorItem?.id || ""), 10)
          );
          const nextRepeatDayKeys = normalizeVisibleWeekDays(
            Array.isArray(target.repeatDays) && target.repeatDays.length > 0
              ? target.repeatDays
              : inferRepeatDayKeysFromSeriesItems(remainingSeriesItems)
          );
          const nextRepeatDayNums = nextRepeatDayKeys
            .map((dayKey) => toAppointmentDayNum(dayKey))
            .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
          const nextSeriesRepeatGroupKey = String(target.repeatGroupKey || "").trim() || randomUUID();
          const nextSeriesRepeatUntilDate = String(
            target.repeatUntilDate
            || remainingSeriesItems[remainingSeriesItems.length - 1]?.appointmentDate
            || ""
          ).trim();
          const nextSeriesRepeatAnchorDate = String(
            remainingSeriesItems[0]?.appointmentDate
            || target.repeatAnchorDate
            || ""
          ).trim();

          const items = await withAppointmentTransaction(async (db) => {
            const updatedItems = await updateAppointmentSchedulesByIds({
              organizationId: access.authContext.organizationId,
              actorUserId: access.authContext.userId,
              ids: target.items.map((item) => item.id),
              specialistId,
              clientId,
              appointmentDate,
              startTime,
              endTime,
              durationMinutes,
              serviceName,
              status,
              note,
              applyAppointmentDate: true,
              clearRepeatMeta: true,
              db
            });

            if (anchorItem?.isRepeatRoot && remainingSeriesItems.length > 0) {
              const nextRootItem = remainingSeriesItems[0];
              for (const seriesItem of remainingSeriesItems) {
                await updateAppointmentScheduleByIdWithRepeatMeta({
                  organizationId: access.authContext.organizationId,
                  actorUserId: access.authContext.userId,
                  id: seriesItem.id,
                  specialistId: seriesItem.specialistId,
                  clientId: seriesItem.clientId,
                  appointmentDate: seriesItem.appointmentDate,
                  startTime: seriesItem.startTime,
                  endTime: seriesItem.endTime,
                  durationMinutes: seriesItem.durationMinutes,
                  serviceName: seriesItem.serviceName,
                  status: seriesItem.status,
                  note: seriesItem.note,
                  repeatGroupKey: nextSeriesRepeatGroupKey,
                  repeatUntilDate: nextSeriesRepeatUntilDate,
                  repeatDays: nextRepeatDayNums,
                  repeatAnchorDate: nextSeriesRepeatAnchorDate,
                  isRepeatRoot: Number.parseInt(String(seriesItem?.id || ""), 10) === Number.parseInt(String(nextRootItem?.id || ""), 10),
                  isAutoRollingRepeat: Boolean(target.isAutoRollingRepeat),
                  db
                });
              }
            }

            return sortScheduleItems(updatedItems);
          });

          const updatedAnchorItem = items[0] || anchorItem;
          schedulesReadCache.clear();
          await notifyScheduleDateTimeEdit(access, target.items, items);

          return reply.send({
            message: "Appointment updated.",
            item: updatedAnchorItem,
            items,
            summary: {
              scope: "single",
              affectedCount: items.length
            }
          });
        }

        const shouldReconcileRecurringSeries = repeat.enabled && target.isRecurring && target.scope !== "single";
        if (shouldReconcileRecurringSeries) {
          const repeatError = validateScheduleRepeatPayload(repeat, appointmentDate);
          if (repeatError) {
            return reply.status(400).send(repeatError);
          }

          const settingsForRepeat = await getAppointmentSettingsByOrganization(
            access.authContext.organizationId,
            { specialistId }
          );
          const repeatDaysValidation = validateRepeatDaysAgainstVisibleWeekDays({
            repeatDayKeys: repeat.dayKeys,
            visibleWeekDayKeys: settingsForRepeat?.visibleWeekDays
          });
          if (repeatDaysValidation.error) {
            return reply.status(400).send(repeatDaysValidation.error);
          }

          const requestedRepeatDayKeys = repeatDaysValidation.normalizedDayKeys;
          if (requestedRepeatDayKeys.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "Select at least one repeat day."
            });
          }

          const seriesItems = sortScheduleItems(
            Array.isArray(target.seriesItems) && target.seriesItems.length > 0
              ? target.seriesItems
              : target.items
          );
          const originalRepeatDayKeys = normalizeVisibleWeekDays(
            Array.isArray(target.repeatDays) && target.repeatDays.length > 0
              ? target.repeatDays
              : inferRepeatDayKeysFromSeriesItems(seriesItems)
          );
          const sourceSeriesDayKey = String(
            toDayKeyFromUtcDate(parseDateYmdToUtcDate(target.anchorAppointmentDate)) || ""
          ).trim().toLowerCase();
          const repeatDayKeys = (
            target.scope === "future"
            && originalRepeatDayKeys.length > 1
            && Boolean(sourceSeriesDayKey)
            && haveSameNormalizedDayKeys(requestedRepeatDayKeys, originalRepeatDayKeys)
          )
            ? [sourceSeriesDayKey]
            : requestedRepeatDayKeys;
          const recurringStartDate = target.scope === "all"
            ? String(target.repeatAnchorDate || target.anchorAppointmentDate || appointmentDate).trim()
            : String(target.anchorAppointmentDate || appointmentDate).trim();
          const recurringDates = buildWeeklyRecurringDates({
            startDate: recurringStartDate,
            untilDate: repeat.untilDate,
            dayKeys: repeatDayKeys
          });
          if (recurringDates.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "No matching week days in selected range."
            });
          }

          const repeatHistoryLockError = getHistoryLockErrorForRequester(
            access.requester,
            recurringDates,
            historyLockDays
          );
          if (repeatHistoryLockError) {
            return reply.status(403).send(repeatHistoryLockError);
          }

          const repeatDayNums = repeatDayKeys
            .map((dayKey) => toAppointmentDayNum(dayKey))
            .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
          if (repeatDayNums.length === 0) {
            return reply.status(400).send({
              field: "repeatDays",
              message: "Select at least one repeat day."
            });
          }
          const originalRepeatDayNums = originalRepeatDayKeys
            .map((dayKey) => toAppointmentDayNum(dayKey))
            .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
          const shouldSplitSelectedRecurringDay = (
            originalRepeatDayKeys.length > 1
            && Boolean(sourceSeriesDayKey)
            && repeatDayKeys.length === 1
          );
          if (shouldSplitSelectedRecurringDay) {
            const movedOriginalDayKeySet = new Set(
              normalizeVisibleWeekDays([
                sourceSeriesDayKey,
                ...originalRepeatDayKeys.filter((dayKey) => repeatDayKeys.includes(dayKey))
              ])
            );
            const splitSourceItems = seriesItems.filter(
              (item) => movedOriginalDayKeySet.has(getScheduleItemDayKey(item))
            );
            if (splitSourceItems.length > 0) {
              const scopedSourceItems = target.scope === "all"
                ? splitSourceItems
                : splitSourceItems.filter(
                    (item) => String(item?.appointmentDate || "").trim() >= String(target.anchorAppointmentDate || "").trim()
                  );
              const splitRecurringDateSet = new Set(recurringDates);
              const keptSplitItems = scopedSourceItems.filter(
                (item) => splitRecurringDateSet.has(String(item?.appointmentDate || "").trim())
              );
              const keptSplitDateSet = new Set(
                keptSplitItems.map((item) => String(item?.appointmentDate || "").trim())
              );
              const deletedSplitItems = scopedSourceItems.filter(
                (item) => !splitRecurringDateSet.has(String(item?.appointmentDate || "").trim())
              );
              const scopedSourceItemsByDate = buildScheduleItemsByDate(keptSplitItems);
              const createdSplitDates = recurringDates.filter((dateValue) => !keptSplitDateSet.has(dateValue));
              const remainingRepeatDayKeys = originalRepeatDayKeys.filter(
                (dayKey) => !movedOriginalDayKeySet.has(dayKey)
              );
              const remainingRepeatDayNums = remainingRepeatDayKeys
                .map((dayKey) => toAppointmentDayNum(dayKey))
                .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
              const previousSeriesItems = target.scope === "future"
                ? seriesItems.filter(
                    (item) => String(item?.appointmentDate || "").trim() < String(target.anchorAppointmentDate || "").trim()
                  )
                : [];
              const previousRepeatUntilDate = shiftDateYmd(target.anchorAppointmentDate, -1);
              const remainingContinuationItems = target.scope === "all"
                ? seriesItems.filter((item) => !movedOriginalDayKeySet.has(getScheduleItemDayKey(item)))
                : seriesItems.filter(
                    (item) => (
                      String(item?.appointmentDate || "").trim() >= String(target.anchorAppointmentDate || "").trim()
                      && !movedOriginalDayKeySet.has(getScheduleItemDayKey(item))
                    )
                  );
              const remainingContinuationGroupKey = remainingContinuationItems.length > 0
                ? (
                  target.scope === "all"
                    ? String(target.repeatGroupKey || "").trim()
                    : randomUUID()
                )
                : "";
              const remainingContinuationRepeatUntilDate = String(target.repeatUntilDate || "").trim();
              const remainingContinuationAnchorDate = String(
                remainingContinuationItems[0]?.appointmentDate || ""
              ).trim();
              const splitRepeatGroupKey = randomUUID();
              const splitRepeatAnchorDate = recurringDates[0];

              const items = await withAppointmentTransaction(async (db) => {
                await assertRecurringSeriesUpdateHasNoConflicts({
                  organizationId: access.authContext.organizationId,
                  appointmentDates: recurringDates,
                  existingItemsByDate: scopedSourceItemsByDate,
                  specialistId,
                  clientId,
                  startTime,
                  endTime,
                  status,
                  db
                });

                if (deletedSplitItems.length > 0) {
                  await deleteAppointmentSchedulesByIds({
                    organizationId: access.authContext.organizationId,
                    ids: deletedSplitItems.map((item) => item.id),
                    actorUserId: access.authContext.userId,
                    db
                  });
                }

                if (previousSeriesItems.length > 0 && previousRepeatUntilDate) {
                  const previousRepeatAnchorDate = String(previousSeriesItems[0]?.appointmentDate || "").trim();
                  for (const previousItem of previousSeriesItems) {
                    await updateAppointmentScheduleByIdWithRepeatMeta({
                      organizationId: access.authContext.organizationId,
                      actorUserId: access.authContext.userId,
                      id: previousItem.id,
                      specialistId: previousItem.specialistId,
                      clientId: previousItem.clientId,
                      appointmentDate: previousItem.appointmentDate,
                      startTime: previousItem.startTime,
                      endTime: previousItem.endTime,
                      durationMinutes: previousItem.durationMinutes,
                      serviceName: previousItem.serviceName,
                      status: previousItem.status,
                      note: previousItem.note,
                      repeatGroupKey: String(target.repeatGroupKey || "").trim(),
                      repeatUntilDate: previousRepeatUntilDate,
                      repeatDays: originalRepeatDayNums,
                      repeatAnchorDate: previousRepeatAnchorDate,
                      isRepeatRoot: String(previousItem?.appointmentDate || "").trim() === previousRepeatAnchorDate,
                      isAutoRollingRepeat: false,
                      db
                    });
                  }
                }

                if (
                  remainingContinuationItems.length > 0
                  && remainingRepeatDayNums.length > 0
                  && remainingContinuationGroupKey
                  && remainingContinuationAnchorDate
                  && remainingContinuationRepeatUntilDate
                ) {
                  for (const remainingItem of remainingContinuationItems) {
                    await updateAppointmentScheduleByIdWithRepeatMeta({
                      organizationId: access.authContext.organizationId,
                      actorUserId: access.authContext.userId,
                      id: remainingItem.id,
                      specialistId: remainingItem.specialistId,
                      clientId: remainingItem.clientId,
                      appointmentDate: remainingItem.appointmentDate,
                      startTime: remainingItem.startTime,
                      endTime: remainingItem.endTime,
                      durationMinutes: remainingItem.durationMinutes,
                      serviceName: remainingItem.serviceName,
                      status: remainingItem.status,
                      note: remainingItem.note,
                      repeatGroupKey: remainingContinuationGroupKey,
                      repeatUntilDate: remainingContinuationRepeatUntilDate,
                      repeatDays: remainingRepeatDayNums,
                      repeatAnchorDate: remainingContinuationAnchorDate,
                      isRepeatRoot: String(remainingItem?.appointmentDate || "").trim() === remainingContinuationAnchorDate,
                      isAutoRollingRepeat: Boolean(target.isAutoRollingRepeat),
                      db
                    });
                  }
                }

                const nextItems = [];
                for (const keptSplitItem of keptSplitItems) {
                  const updatedItem = await updateAppointmentScheduleByIdWithRepeatMeta({
                    organizationId: access.authContext.organizationId,
                    actorUserId: access.authContext.userId,
                    id: keptSplitItem.id,
                    specialistId,
                    clientId,
                    appointmentDate: keptSplitItem.appointmentDate,
                    startTime,
                    endTime,
                    durationMinutes,
                    serviceName,
                    status,
                    note,
                    repeatGroupKey: splitRepeatGroupKey,
                    repeatUntilDate: repeat.untilDate,
                    repeatDays: repeatDayNums,
                    repeatAnchorDate: splitRepeatAnchorDate,
                    isRepeatRoot: String(keptSplitItem?.appointmentDate || "").trim() === splitRepeatAnchorDate,
                    isAutoRollingRepeat: repeat.autoRolling === true,
                    db
                  });
                  if (updatedItem) {
                    nextItems.push(updatedItem);
                  }
                }

                for (const recurringDate of createdSplitDates) {
                  const createdItem = await createAppointmentSchedule({
                    organizationId: access.authContext.organizationId,
                    actorUserId: access.authContext.userId,
                    specialistId,
                    clientId,
                    appointmentDate: recurringDate,
                    startTime,
                    endTime,
                    durationMinutes,
                    serviceName,
                    status,
                    note,
                    repeatGroupKey: splitRepeatGroupKey,
                    repeatType: "weekly",
                    repeatUntilDate: repeat.untilDate,
                    repeatDays: repeatDayNums,
                    repeatAnchorDate: splitRepeatAnchorDate,
                    isRepeatRoot: recurringDate === splitRepeatAnchorDate,
                    isAutoRollingRepeat: repeat.autoRolling === true,
                    db
                  });
                  if (createdItem) {
                    nextItems.push(createdItem);
                  }
                }

                return sortScheduleItems(nextItems);
              });

              if (!Array.isArray(items) || items.length === 0) {
                return reply.status(404).send({ message: "Appointment not found." });
              }

              const anchorItem = items.find(
                (item) => String(item?.appointmentDate || "").trim() === String(target.anchorAppointmentDate || "").trim()
              ) || items[0];
              const affectedCount = items.length;
              schedulesReadCache.clear();
              await notifyScheduleDateTimeEdit(access, scopedSourceItems, items);

              return reply.send({
                message: `${affectedCount} appointments updated.`,
                item: anchorItem,
                items,
                summary: {
                  scope: target.scope,
                  affectedCount
                }
              });
            }
          }

          const scopedItems = sortScheduleItems(target.items);
          const scopedItemsByDate = buildScheduleItemsByDate(scopedItems);
          const recurringDateSet = new Set(recurringDates);
          const keptItems = scopedItems.filter((item) => recurringDateSet.has(String(item?.appointmentDate || "").trim()));
          const keptDateSet = new Set(keptItems.map((item) => String(item?.appointmentDate || "").trim()));
          const deletedItems = scopedItems.filter((item) => !recurringDateSet.has(String(item?.appointmentDate || "").trim()));
          const createdDates = recurringDates.filter((dateValue) => !keptDateSet.has(dateValue));
          const nextRepeatGroupKey = target.scope === "future"
            ? randomUUID()
            : String(target.repeatGroupKey || "").trim();
          const nextRepeatAnchorDate = recurringDates[0];
          const previousSeriesItems = target.scope === "future"
            ? seriesItems.filter((item) => String(item?.appointmentDate || "").trim() < String(target.anchorAppointmentDate || "").trim())
            : [];
          const previousRepeatDayNums = originalRepeatDayNums;
          const previousRepeatUntilDate = shiftDateYmd(target.anchorAppointmentDate, -1);

          const items = await withAppointmentTransaction(async (db) => {
            await assertRecurringSeriesUpdateHasNoConflicts({
              organizationId: access.authContext.organizationId,
              appointmentDates: recurringDates,
              existingItemsByDate: scopedItemsByDate,
              specialistId,
              clientId,
              startTime,
              endTime,
              status,
              db
            });

            if (deletedItems.length > 0) {
              await deleteAppointmentSchedulesByIds({
                organizationId: access.authContext.organizationId,
                ids: deletedItems.map((item) => item.id),
                actorUserId: access.authContext.userId,
                db
              });
            }

            if (previousSeriesItems.length > 0 && previousRepeatUntilDate) {
              const previousRepeatAnchorDate = String(previousSeriesItems[0]?.appointmentDate || "").trim();
              for (const previousItem of previousSeriesItems) {
                await updateAppointmentScheduleByIdWithRepeatMeta({
                  organizationId: access.authContext.organizationId,
                  actorUserId: access.authContext.userId,
                  id: previousItem.id,
                  specialistId: previousItem.specialistId,
                  clientId: previousItem.clientId,
                  appointmentDate: previousItem.appointmentDate,
                  startTime: previousItem.startTime,
                  endTime: previousItem.endTime,
                  durationMinutes: previousItem.durationMinutes,
                  serviceName: previousItem.serviceName,
                  status: previousItem.status,
                  note: previousItem.note,
                  repeatGroupKey: String(target.repeatGroupKey || "").trim(),
                  repeatUntilDate: previousRepeatUntilDate,
                  repeatDays: previousRepeatDayNums,
                  repeatAnchorDate: previousRepeatAnchorDate,
                  isRepeatRoot: String(previousItem?.appointmentDate || "").trim() === previousRepeatAnchorDate,
                  isAutoRollingRepeat: false,
                  db
                });
              }
            }

            const nextItems = [];
            for (const keptItem of keptItems) {
              const updatedItem = await updateAppointmentScheduleByIdWithRepeatMeta({
                organizationId: access.authContext.organizationId,
                actorUserId: access.authContext.userId,
                id: keptItem.id,
                specialistId,
                clientId,
                appointmentDate: keptItem.appointmentDate,
                startTime,
                endTime,
                durationMinutes,
                serviceName,
                status,
                note,
                repeatGroupKey: nextRepeatGroupKey,
                repeatUntilDate: repeat.untilDate,
                repeatDays: repeatDayNums,
                repeatAnchorDate: nextRepeatAnchorDate,
                isRepeatRoot: String(keptItem?.appointmentDate || "").trim() === nextRepeatAnchorDate,
                isAutoRollingRepeat: repeat.autoRolling === true,
                db
              });
              if (updatedItem) {
                nextItems.push(updatedItem);
              }
            }

            for (const recurringDate of createdDates) {
              const createdItem = await createAppointmentSchedule({
                organizationId: access.authContext.organizationId,
                actorUserId: access.authContext.userId,
                specialistId,
                clientId,
                appointmentDate: recurringDate,
                startTime,
                endTime,
                durationMinutes,
                serviceName,
                status,
                note,
                repeatGroupKey: nextRepeatGroupKey,
                repeatType: "weekly",
                repeatUntilDate: repeat.untilDate,
                repeatDays: repeatDayNums,
                repeatAnchorDate: nextRepeatAnchorDate,
                isRepeatRoot: recurringDate === nextRepeatAnchorDate,
                isAutoRollingRepeat: repeat.autoRolling === true,
                db
              });
              if (createdItem) {
                nextItems.push(createdItem);
              }
            }

            return sortScheduleItems(nextItems);
          });

          if (!Array.isArray(items) || items.length === 0) {
            return reply.status(404).send({ message: "Appointment not found." });
          }

          const anchorItem = items.find(
            (item) => String(item?.appointmentDate || "").trim() === String(target.anchorAppointmentDate || "").trim()
          ) || items[0];
          const affectedCount = items.length;
          schedulesReadCache.clear();
          await notifyScheduleDateTimeEdit(access, target.items, items);

          return reply.send({
            message: `${affectedCount} appointments updated.`,
            item: anchorItem,
            items,
            summary: {
              scope: target.scope,
              affectedCount
            }
          });
        }

        const targetIds = target.items.map((item) => item.id);
        const applyAppointmentDate = target.scope === "single";
        const changedTargetItems = target.items.filter((item) => isScheduleItemChangedByPayload(item, {
          specialistId,
          clientId,
          appointmentDate,
          startTime,
          endTime,
          durationMinutes,
          serviceName,
          status,
          note,
          applyAppointmentDate,
          getDurationMinutesFromTimes
        }));

        if (changedTargetItems.length === 0) {
          const unchangedAnchorItem = target.items.find((item) => Number.parseInt(String(item.id || ""), 10) === id) || target.items[0] || null;
          return reply.send({
            message: target.scope === "single" ? "Appointment unchanged." : "Appointments unchanged.",
            item: unchangedAnchorItem,
            items: target.items,
            summary: {
              scope: target.scope,
              affectedCount: 0,
              notificationSkipped: true
            }
          });
        }

        if (status === "pending" || status === "confirmed") {
          const settingsForAvailability = await getAppointmentSettingsByOrganization(
            access.authContext.organizationId,
            { specialistId }
          );
          const validationDates = target.items.map((item) => (
            applyAppointmentDate ? appointmentDate : item.appointmentDate
          ));
          const sortedValidationDates = [...validationDates].filter(Boolean).sort((left, right) => left.localeCompare(right));
          const absenceRangesByDate = sortedValidationDates.length > 0
            ? buildSpecialistAbsenceRangesByDate(
                await listAppointmentSpecialistAbsences({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  dateFrom: sortedValidationDates[0],
                  dateTo: sortedValidationDates[sortedValidationDates.length - 1]
                })
              )
            : new Map();
          const breakRangesByDay = buildBreakRangesByDay(
            await getAppointmentBreaksBySpecialistAndDays({
              organizationId: access.authContext.organizationId,
              specialistId,
              dayNums: collectDayNumsFromDates(validationDates)
            })
          );
          const blockedRangesByDay = buildWorkScheduleBlockRangesByDay(settingsForAvailability?.blockedTimes);

          for (const item of target.items) {
            const conflictDate = applyAppointmentDate ? appointmentDate : item.appointmentDate;
            const previousStatus = String(item?.status || "").trim().toLowerCase();
            const wasPreviouslyActive = previousStatus === "pending" || previousStatus === "confirmed";
            const previousDurationMinutes = Number.parseInt(String(item?.durationMinutes || "").trim(), 10)
              || getDurationMinutesFromTimes(item?.startTime, item?.endTime);
            const scheduleChanged = (
              Number.parseInt(String(item?.specialistId || ""), 10) !== specialistId
              || Number.parseInt(String(item?.clientId || ""), 10) !== clientId
              || (applyAppointmentDate && String(item?.appointmentDate || "").trim() !== appointmentDate)
              || String(item?.startTime || "").trim() !== startTime
              || String(item?.endTime || "").trim() !== endTime
              || previousDurationMinutes !== durationMinutes
            );
            if (!scheduleChanged && wasPreviouslyActive) {
              continue;
            }
            const isStatusOnlyReactivation = !scheduleChanged && !wasPreviouslyActive;
            const shouldValidateAvailabilityWindows = !isStatusOnlyReactivation;

            if (shouldValidateAvailabilityWindows) {
              const absenceConflict = hasSpecialistAbsenceConflict({
                absenceRangesByDate,
                appointmentDate: conflictDate,
                startTime,
                endTime
              });
              if (absenceConflict) {
                return reply.status(409).send({
                  message: buildSpecialistAbsenceConflictMessage(conflictDate, absenceConflict)
                });
              }

              const workingHoursError = validateSlotAgainstWorkingHours({
                settings: settingsForAvailability,
                appointmentDate: conflictDate,
                startTime,
                endTime
              });
              if (workingHoursError) {
                if (target.items.length > 1) {
                  return reply.status(400).send({
                    field: workingHoursError.field,
                    message: `${workingHoursError.message} (${conflictDate}).`
                  });
                }
                return reply.status(400).send(workingHoursError);
              }

              const blockedConflict = hasSpecialistWorkScheduleConflict({
                blockedRangesByDay,
                appointmentDate: conflictDate,
                startTime,
                endTime
              });
              if (blockedConflict) {
                if (target.items.length > 1) {
                  return reply.status(409).send({
                    message: buildWorkScheduleBlockConflictMessage({
                      conflict: blockedConflict,
                      appointmentDate: conflictDate
                    })
                  });
                }
                return reply.status(409).send({
                  message: buildWorkScheduleBlockConflictMessage({ conflict: blockedConflict })
                });
              }

              const breakConflict = hasSpecialistBreakConflict({
                breakRangesByDay,
                appointmentDate: conflictDate,
                startTime,
                endTime
              });
              if (breakConflict) {
                if (target.items.length > 1) {
                  return reply.status(409).send({
                    message: buildBreakConflictMessage({
                      conflict: breakConflict,
                      appointmentDate: conflictDate
                    })
                  });
                }
                return reply.status(409).send({
                  message: buildBreakConflictMessage({ conflict: breakConflict })
                });
              }
            }

            const hasConflict = await hasAppointmentScheduleConflict({
              organizationId: access.authContext.organizationId,
              specialistId,
              appointmentDate: conflictDate,
              startTime,
              endTime,
              excludeId: item.id
            });
            if (hasConflict) {
              if (target.items.length > 1) {
                return reply.status(409).send({ message: `Slot conflict on ${conflictDate}.` });
              }
              return reply.status(409).send({ message: "This slot conflicts with existing appointment." });
            }

            if (shouldValidateAvailabilityWindows) {
              const hasVipSpecialistConflict3 = await hasVipRoutineConflictForSpecialist({
                organizationId: access.authContext.organizationId,
                specialistId,
                appointmentDate: conflictDate,
                startTime,
                endTime
              });
              if (hasVipSpecialistConflict3) {
                return reply.status(409).send({
                  message: target.items.length > 1
                    ? `Specialist has a VIP Daily Routine conflict on ${conflictDate}.`
                    : "This slot conflicts with the specialist's VIP Daily Routine."
                });
              }
            }

            const hasClientConflict = await hasAppointmentClientConflict({
              organizationId: access.authContext.organizationId,
              clientId,
              appointmentDate: conflictDate,
              startTime,
              endTime,
              excludeId: item.id
            });
            if (hasClientConflict) {
              if (target.items.length > 1) {
                return reply.status(409).send({
                  message: buildClientScheduleConflictMessage(conflictDate)
                });
              }
              return reply.status(409).send({
                message: buildClientScheduleConflictMessage()
              });
            }

            if (shouldValidateAvailabilityWindows) {
              const hasVipClientConflict3 = await hasVipRoutineConflictForClient({
                organizationId: access.authContext.organizationId,
                clientId,
                appointmentDate: conflictDate,
                startTime,
                endTime
              });
              if (hasVipClientConflict3) {
                return reply.status(409).send({
                  message: target.items.length > 1
                    ? `Client has a VIP Daily Routine conflict on ${conflictDate}.`
                    : "This slot conflicts with the client's VIP Daily Routine."
                });
              }
            }
          }
        }

        const items = await updateAppointmentSchedulesByIds({
          organizationId: access.authContext.organizationId,
          actorUserId: access.authContext.userId,
          ids: targetIds,
          specialistId,
          clientId,
          appointmentDate,
          startTime,
          endTime,
          durationMinutes,
          serviceName,
          status,
          note,
          applyAppointmentDate
        });

        if (!Array.isArray(items) || items.length === 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }

        const anchorItem = items.find((item) => Number.parseInt(String(item.id || ""), 10) === id) || items[0];
        const affectedCount = items.length;
        const message = target.scope === "single"
          ? "Appointment updated."
          : `${affectedCount} appointments updated.`;
        schedulesReadCache.clear();
        await notifyScheduleDateTimeEdit(access, target.items, items);

        return reply.send({
          message,
          item: anchorItem,
          items,
          summary: {
            scope: target.scope,
            affectedCount
          }
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Appointment status history migration is required.", { includeDetails: true })) {
          return;
        }
        if (Number.isInteger(error?.statusCode) && error?.payload) {
          return reply.status(error.statusCode).send(error.payload);
        }
        if (isClientOverlapConstraintConflict(error)) {
          return reply.status(409).send({ message: buildClientScheduleConflictMessage() });
        }
        if (isUniqueOrExclusionConflict(error)) {
          return reply.status(409).send({ message: "This slot is already occupied." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid specialist or client." });
        }
        if (error?.code === "23514" || error?.code === "22P02" || error?.code === "22007") {
          return reply.status(400).send({ message: "Invalid appointment data." });
        }
        request.log.error({ err: error }, "Error updating appointment schedule");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/schedules/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: appointmentRouteSchemas.scheduleIdParams,
        querystring: appointmentRouteSchemas.scheduleScopeQuery
      }
    },
    async (request, reply) => {
      try {
        const access = await requireAppointmentsAccess(
          request,
          reply,
          PERMISSIONS.APPOINTMENTS_PLANNER_DELETE,
          "appointments.planner"
        );
        if (!access) {
          return;
        }

        const id = parsePositiveIntegerOr(request.params?.id, 0);
        if (!id) {
          return reply.status(400).send({ message: "Invalid appointment id." });
        }
        const scope = normalizeScheduleScope(request.query?.scope);
        if (!scope) {
          return reply.status(400).send({ field: "scope", message: "Invalid scope." });
        }
        const requestedDeleteDayKeys = parseScheduleDayKeysQuery(
          request.query?.dayKeys ?? request.query?.day_keys
        );
        const ownSpecialistUserId = resolveOwnAppointmentSpecialistUserId(access);
        if (ownSpecialistUserId && scope !== "single") {
          return reply.status(403).send({ message: buildOwnPlannerSingleOnlyDeleteForbiddenMessage() });
        }

        const rawTarget = await getAppointmentScheduleTargetsByScope({
          organizationId: access.authContext.organizationId,
          id,
          scope
        });
        const target = resolveRecurringSingleScopeTargetByDayKeys(rawTarget, requestedDeleteDayKeys);
        if (!Array.isArray(target.items) || target.items.length === 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }
        if (
          ownSpecialistUserId
          && target.items.some((item) => Number.parseInt(String(item?.specialistId || ""), 10) !== ownSpecialistUserId)
        ) {
          return reply.status(403).send({ message: buildOwnPlannerDeleteForbiddenMessage(target.scope) });
        }
        let effectiveDeleteItems = sortScheduleItems(target.items);
        const deleteSpecialistIds = Array.from(
          new Set(
            effectiveDeleteItems
              .map((item) => Number.parseInt(String(item?.specialistId || ""), 10))
              .filter((value) => Number.isInteger(value) && value > 0)
          )
        );
        const canSplitRecurringFutureDelete = target.isRecurring && target.scope === "future";
        if (canSplitRecurringFutureDelete) {
          const seriesItems = sortScheduleItems(
            Array.isArray(target.seriesItems) && target.seriesItems.length > 0
              ? target.seriesItems
              : target.items
          );
          const originalRepeatDayKeys = normalizeVisibleWeekDays(
            Array.isArray(target.repeatDays) && target.repeatDays.length > 0
              ? target.repeatDays
              : inferRepeatDayKeysFromSeriesItems(seriesItems)
          );
          const sourceSeriesDayKey = String(
            toDayKeyFromUtcDate(parseDateYmdToUtcDate(target.anchorAppointmentDate)) || ""
          ).trim().toLowerCase();
          const scopedDeleteDayKeys = normalizeVisibleWeekDays(
            requestedDeleteDayKeys.length > 0
              ? requestedDeleteDayKeys.filter((dayKey) => originalRepeatDayKeys.includes(dayKey))
              : (sourceSeriesDayKey ? [sourceSeriesDayKey] : [])
          );
          const effectiveDeleteDayKeys = scopedDeleteDayKeys.length > 0
            ? scopedDeleteDayKeys
            : (sourceSeriesDayKey ? [sourceSeriesDayKey] : []);
          const effectiveDeleteDayKeySet = new Set(effectiveDeleteDayKeys);
          if (originalRepeatDayKeys.length > 1 && effectiveDeleteDayKeySet.size > 0) {
            const branchItems = effectiveDeleteItems.filter(
              (item) => effectiveDeleteDayKeySet.has(getScheduleItemDayKey(item))
            );
            const branchDeletedIds = branchItems.map((item) => item.id);
            if (branchDeletedIds.length > 0 && branchDeletedIds.length !== effectiveDeleteItems.length) {
              const historyLockDays = await getAppointmentHistoryLockDaysByOrganization(
                access.authContext.organizationId
              );
              const historyLockError = getHistoryLockErrorForRequester(
                access.requester,
                branchItems.map((item) => item.appointmentDate),
                historyLockDays
              );
              if (historyLockError) {
                return reply.status(403).send(historyLockError);
              }

              const previousSeriesItems = seriesItems.filter(
                (item) => String(item?.appointmentDate || "").trim() < String(target.anchorAppointmentDate || "").trim()
              );
                const remainingFutureItems = seriesItems.filter(
                  (item) => (
                    String(item?.appointmentDate || "").trim() >= String(target.anchorAppointmentDate || "").trim()
                    && !effectiveDeleteDayKeySet.has(getScheduleItemDayKey(item))
                  )
                );
                const previousRepeatUntilDate = shiftDateYmd(target.anchorAppointmentDate, -1);
                const remainingRepeatDayKeys = originalRepeatDayKeys.filter(
                  (dayKey) => !effectiveDeleteDayKeySet.has(dayKey)
                );
                const remainingRepeatDayNums = remainingRepeatDayKeys
                  .map((dayKey) => toAppointmentDayNum(dayKey))
                  .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
              const remainingFutureGroupKey = (
                remainingFutureItems.length > 0
                && remainingRepeatDayNums.length > 0
              )
                ? randomUUID()
                : "";
              const remainingFutureAnchorDate = String(remainingFutureItems[0]?.appointmentDate || "").trim();

              const deletedCount = await withAppointmentTransaction(async (db) => {
                if (previousSeriesItems.length > 0 && previousRepeatUntilDate) {
                  const previousRepeatAnchorDate = String(previousSeriesItems[0]?.appointmentDate || "").trim();
                  for (const previousItem of previousSeriesItems) {
                    await updateAppointmentScheduleByIdWithRepeatMeta({
                      organizationId: access.authContext.organizationId,
                      actorUserId: access.authContext.userId,
                      id: previousItem.id,
                      specialistId: previousItem.specialistId,
                      clientId: previousItem.clientId,
                      appointmentDate: previousItem.appointmentDate,
                      startTime: previousItem.startTime,
                      endTime: previousItem.endTime,
                      durationMinutes: previousItem.durationMinutes,
                      serviceName: previousItem.serviceName,
                      status: previousItem.status,
                      note: previousItem.note,
                      repeatGroupKey: String(target.repeatGroupKey || "").trim(),
                      repeatUntilDate: previousRepeatUntilDate,
                      repeatDays: originalRepeatDayKeys
                        .map((dayKey) => toAppointmentDayNum(dayKey))
                        .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7),
                      repeatAnchorDate: previousRepeatAnchorDate,
                      isRepeatRoot: String(previousItem?.appointmentDate || "").trim() === previousRepeatAnchorDate,
                      isAutoRollingRepeat: false,
                      db
                    });
                  }
                }

                if (
                  remainingFutureItems.length > 0
                  && remainingRepeatDayNums.length > 0
                  && remainingFutureGroupKey
                  && remainingFutureAnchorDate
                ) {
                  for (const remainingItem of remainingFutureItems) {
                    await updateAppointmentScheduleByIdWithRepeatMeta({
                      organizationId: access.authContext.organizationId,
                      actorUserId: access.authContext.userId,
                      id: remainingItem.id,
                      specialistId: remainingItem.specialistId,
                      clientId: remainingItem.clientId,
                      appointmentDate: remainingItem.appointmentDate,
                      startTime: remainingItem.startTime,
                      endTime: remainingItem.endTime,
                      durationMinutes: remainingItem.durationMinutes,
                      serviceName: remainingItem.serviceName,
                      status: remainingItem.status,
                      note: remainingItem.note,
                      repeatGroupKey: remainingFutureGroupKey,
                      repeatUntilDate: String(target.repeatUntilDate || "").trim(),
                      repeatDays: remainingRepeatDayNums,
                      repeatAnchorDate: remainingFutureAnchorDate,
                      isRepeatRoot: String(remainingItem?.appointmentDate || "").trim() === remainingFutureAnchorDate,
                      isAutoRollingRepeat: Boolean(target.isAutoRollingRepeat),
                      db
                    });
                  }
                }

                return deleteAppointmentSchedulesByIds({
                  organizationId: access.authContext.organizationId,
                  ids: branchDeletedIds,
                  actorUserId: access.authContext.userId,
                  db
                });
              });

              if (deletedCount <= 0) {
                return reply.status(404).send({ message: "Appointment not found." });
              }

              const scheduleNotification = buildScheduleNotification("delete", branchItems, access?.requester);
              const specialistIds = Array.from(
                new Set(
                  [
                    ...deleteSpecialistIds,
                    ...seriesItems.map((item) => Number.parseInt(String(item?.specialistId || ""), 10))
                  ].filter((value) => Number.isInteger(value) && value > 0)
                )
              );

              await broadcastAppointmentChange(access, {
                type: "schedule-deleted",
                message: scheduleNotification.message,
                specialistIds,
                data: {
                  ...scheduleNotification.data,
                  scope: target.scope,
                  deletedCount
                }
              });
              schedulesReadCache.clear();

              return reply.send({
                message: `${deletedCount} appointments deleted.`,
                summary: {
                  scope: target.scope,
                  deletedCount
                }
              });
            }
            effectiveDeleteItems = branchItems;
          }
        }
        const historyLockDays = await getAppointmentHistoryLockDaysByOrganization(
          access.authContext.organizationId
        );
        const historyLockError = getHistoryLockErrorForRequester(
          access.requester,
          effectiveDeleteItems.map((item) => item.appointmentDate),
          historyLockDays
        );
        if (historyLockError) {
          return reply.status(403).send(historyLockError);
        }

        const canTruncateRecurringFutureDelete = target.isRecurring && target.scope === "future";
        if (canTruncateRecurringFutureDelete) {
          const seriesItems = sortScheduleItems(
            Array.isArray(target.seriesItems) && target.seriesItems.length > 0
              ? target.seriesItems
              : target.items
          );
          const previousSeriesItems = seriesItems.filter(
            (item) => String(item?.appointmentDate || "").trim() < String(target.anchorAppointmentDate || "").trim()
          );
          const previousRepeatUntilDate = shiftDateYmd(target.anchorAppointmentDate, -1);
          const previousRepeatDayNums = normalizeVisibleWeekDays(
            Array.isArray(target.repeatDays) && target.repeatDays.length > 0
              ? target.repeatDays
              : inferRepeatDayKeysFromSeriesItems(seriesItems)
          )
            .map((dayKey) => toAppointmentDayNum(dayKey))
            .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
          if (previousSeriesItems.length > 0 && previousRepeatUntilDate && previousRepeatDayNums.length > 0) {
            const deletedCount = await withAppointmentTransaction(async (db) => {
              const previousRepeatAnchorDate = String(previousSeriesItems[0]?.appointmentDate || "").trim();
              for (const previousItem of previousSeriesItems) {
                await updateAppointmentScheduleByIdWithRepeatMeta({
                  organizationId: access.authContext.organizationId,
                  actorUserId: access.authContext.userId,
                  id: previousItem.id,
                  specialistId: previousItem.specialistId,
                  clientId: previousItem.clientId,
                  appointmentDate: previousItem.appointmentDate,
                  startTime: previousItem.startTime,
                  endTime: previousItem.endTime,
                  durationMinutes: previousItem.durationMinutes,
                  serviceName: previousItem.serviceName,
                  status: previousItem.status,
                  note: previousItem.note,
                  repeatGroupKey: String(target.repeatGroupKey || "").trim(),
                  repeatUntilDate: previousRepeatUntilDate,
                  repeatDays: previousRepeatDayNums,
                  repeatAnchorDate: previousRepeatAnchorDate,
                  isRepeatRoot: String(previousItem?.appointmentDate || "").trim() === previousRepeatAnchorDate,
                  isAutoRollingRepeat: false,
                  db
                });
              }

              return deleteAppointmentSchedulesByIds({
                organizationId: access.authContext.organizationId,
                ids: effectiveDeleteItems.map((item) => item.id),
                actorUserId: access.authContext.userId,
                db
              });
            });

            if (deletedCount <= 0) {
              return reply.status(404).send({ message: "Appointment not found." });
            }

            const message = `${deletedCount} appointments deleted.`;
            const scheduleNotification = buildScheduleNotification("delete", effectiveDeleteItems, access?.requester);

            await broadcastAppointmentChange(access, {
              type: "schedule-deleted",
              message: scheduleNotification.message,
              specialistIds: deleteSpecialistIds,
              data: {
                ...scheduleNotification.data,
                scope: target.scope,
                deletedCount
              }
            });
            schedulesReadCache.clear();

            return reply.send({
              message,
              summary: {
                scope: target.scope,
                deletedCount
              }
            });
          }
        }

        const deletedCount = await deleteAppointmentSchedulesByIds({
          organizationId: access.authContext.organizationId,
          ids: effectiveDeleteItems.map((item) => item.id),
          actorUserId: access.authContext.userId
        });

        if (deletedCount <= 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }

        const message = target.scope === "single"
          ? "Appointment deleted."
          : `${deletedCount} appointments deleted.`;
        const scheduleNotification = buildScheduleNotification("delete", effectiveDeleteItems, access?.requester);

        await broadcastAppointmentChange(access, {
          type: "schedule-deleted",
          message: scheduleNotification.message,
          specialistIds: deleteSpecialistIds,
          data: {
            ...scheduleNotification.data,
            scope: target.scope,
            deletedCount
          }
        });
        schedulesReadCache.clear();

        return reply.send({
          message,
          summary: {
            scope: target.scope,
            deletedCount
          }
        });
      } catch (error) {
        if (sendMigrationRequired(reply, error, "Appointment status history migration is required.", { includeDetails: true })) {
          return;
        }
        request.log.error({ err: error }, "Error deleting appointment schedule");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

}
