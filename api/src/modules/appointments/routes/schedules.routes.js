import { toBoundedInteger } from "../../../lib/bounded-integer.js";
import { createTtlCache } from "../../../lib/ttl-cache.js";
import { sendMigrationRequired } from "../../../lib/http.js";
import { requesterHasOrgFeature } from "../../../lib/org-features.js";
import { appointmentRouteSchemas } from "./appointment.route-schemas.js";
import { checkAppointmentNormViolations } from "../../settings/settings.service.js";

const schedulesReadCache = createTtlCache({
  maxEntries: toBoundedInteger(process.env.APPOINTMENT_SCHEDULES_CACHE_MAX, 5000, 100, 50_000),
  defaultTtlMs: toBoundedInteger(process.env.APPOINTMENT_SCHEDULES_CACHE_TTL_MS, 5000, 500, 60_000)
});

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

export function registerAppointmentScheduleRoutes(fastify, context) {
  const {
    randomUUID,
    setNoCacheHeaders,
    requireAppointmentsAccess,
    hasPermission,
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
    buildScheduleNotification,
    createRouteError,
    isUniqueOrExclusionConflict,
    getAppointmentPlannerReportFilters,
    getAppointmentPlannerReport,
    getAppointmentClientScopeInfo,
    getAppointmentSchedulesByRange,
    isVipClassAssignedToUser,
    getAppointmentHistoryLockDaysByOrganization,
    getAppointmentSettingsByOrganization,
    getAppointmentBreaksBySpecialistAndDays,
    getAppointmentScheduleTargetsByScope,
    hasAppointmentScheduleConflict,
    createAppointmentSchedule,
    updateAppointmentScheduleByIdWithRepeatMeta,
    updateAppointmentSchedulesByIds,
    deleteAppointmentSchedulesByIds,
    withAppointmentTransaction,
    toAppointmentDayNum,
    resolveAppointmentVipReadScope,
    resolveOwnAppointmentSpecialistUserId,
    isVipClientAssignedToUser,
    broadcastAppointmentChange,
    DATE_REGEX
  } = context;

  fastify.get(
    "/report/filters",
    { config: { rateLimit: fastify.apiRateLimit } },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const access = await requireAppointmentsAccess(
        request,
        reply,
        PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT,
        "statistics.planner_report"
      );
      if (!access) {
        return;
      }

      try {
        const ownSpecialistUserId = resolveOwnAppointmentSpecialistUserId(access);
        const vipReadScope = await resolveAppointmentVipReadScope({
          roleId: access.requester?.role_id,
          requester: access.requester
        });
        const requesterUserId = parsePositiveIntegerOr(access.authContext?.userId, 0);
        const assignedUserId = vipReadScope === "all"
          ? null
          : (requesterUserId || null);
        if (vipReadScope !== "all" && !assignedUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const data = await getAppointmentPlannerReportFilters({
          organizationId: access.authContext.organizationId,
          assignedUserId,
          specialistId: ownSpecialistUserId
        });
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

      const access = await requireAppointmentsAccess(
        request,
        reply,
        PERMISSIONS.APPOINTMENTS_STATISTICS_PLANNER_REPORT,
        "statistics.planner_report"
      );
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
        const ownSpecialistUserId = resolveOwnAppointmentSpecialistUserId(access);
        if (ownSpecialistUserId && specialistId && specialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const effectiveSpecialistId = ownSpecialistUserId || specialistId;
        const vipReadScope = await resolveAppointmentVipReadScope({
          roleId: access.requester?.role_id,
          requester: access.requester
        });
        const requesterUserId = parsePositiveIntegerOr(access.authContext?.userId, 0);
        const assignedUserId = vipReadScope === "all" ? null : (requesterUserId || null);
        if (vipReadScope !== "all" && !assignedUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }
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
        const isMyChildrenScheduleRequest = vipOnly && !requestedSpecialistId && !classId;

        const [rawCanReadAppointments, rawCanAccessMyChildren] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_READ),
          isMyChildrenScheduleRequest
            ? hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN)
            : Promise.resolve(false)
        ]);
        const canReadAppointments = requesterHasOrgFeature(requester, "appointments.planner")
          && rawCanReadAppointments;
        const canAccessMyChildren = requesterHasOrgFeature(requester, "vip_clients.my_children")
          && rawCanAccessMyChildren;
        if (!canReadAppointments && !canAccessMyChildren) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const access = { authContext, requester };
        const ownSpecialistUserId = !vipOnly && !classId
          ? resolveOwnAppointmentSpecialistUserId(access)
          : null;
        if (ownSpecialistUserId && requestedSpecialistId && requestedSpecialistId !== ownSpecialistUserId) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const specialistId = ownSpecialistUserId || requestedSpecialistId;

        if (!specialistId && !clientId && !classId && !isMyChildrenScheduleRequest) {
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
        const enforceVipScope = effectiveVipOnly || classId > 0;
        const scheduleReadScope = enforceVipScope
          ? await resolveAppointmentVipReadScope({
              roleId: access.requester?.role_id,
              requester: access.requester
            })
          : "all";
        const requesterUserId = parsePositiveIntegerOr(access.authContext?.userId, 0);
        const assignedUserId = isMyChildrenScheduleRequest
          ? requesterUserId
          : (
            scheduleReadScope === "all"
              ? 0
              : requesterUserId
          );
        if ((enforceVipScope && scheduleReadScope !== "all" && !assignedUserId) || (isMyChildrenScheduleRequest && !assignedUserId)) {
          return reply.status(403).send({ message: "Forbidden." });
        }
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
        if (classId && scheduleReadScope !== "all") {
          const requesterUserId = parsePositiveIntegerOr(access.authContext?.userId, 0);
          if (!requesterUserId) {
            return reply.status(403).send({ message: "Forbidden." });
          }
          const isAssignedClass = await isVipClassAssignedToUser({
            organizationId: access.authContext.organizationId,
            classId,
            userId: requesterUserId
          });
          if (!isAssignedClass) {
            return reply.status(403).send({ message: "Forbidden." });
          }
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
          assignedUserId: assignedUserId || null,
          dateFrom,
          dateTo,
          lightMode,
          vipOnly: effectiveVipOnly,
          recurringOnly
        });
        schedulesReadCache.set(cacheKey, items);

        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment schedules");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/schedules/norm-check",
    { config: { rateLimit: fastify.apiRateLimit } },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const access = await requireAppointmentsAccess(
        request,
        reply,
        PERMISSIONS.APPOINTMENTS_CREATE,
        "appointments"
      );
      if (!access) {
        return;
      }

      const specialistId = parsePositiveIntegerOr(request.query?.specialistId, 0);
      const clientId = parsePositiveIntegerOr(request.query?.clientId, 0);
      const date = String(request.query?.date || "").trim();

      if (!specialistId || !clientId || !DATE_REGEX.test(date)) {
        return reply.status(400).send({ message: "specialistId, clientId and date are required." });
      }

      try {
        const violations = await checkAppointmentNormViolations({
          organizationId: access.authContext.organizationId,
          specialistId,
          clientId,
          appointmentDate: date
        });
        return reply.send({ violations });
      } catch (error) {
        request.log.error({ err: error }, "Error checking appointment norm violations");
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
          PERMISSIONS.APPOINTMENTS_CREATE,
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
        const repeat = normalizeScheduleRepeatPayload(request.body?.repeat);

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

        const clientScopeInfo = await getAppointmentClientScopeInfo({
          organizationId: access.authContext.organizationId,
          clientId
        });
        if (clientScopeInfo?.isVip) {
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

          const repeatDayKeys = repeatDaysValidation.normalizedDayKeys;
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
          const historyLockError = getHistoryLockErrorForRequester(access.requester, recurringDates, historyLockDays);
          if (historyLockError) {
            return reply.status(403).send(historyLockError);
          }

          const repeatDayNums = repeatDayKeys
            .map((dayKey) => toAppointmentDayNum(dayKey))
            .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
          const repeatGroupKey = randomUUID();
          const shouldEnforceAvailability = status === "pending" || status === "confirmed";
          const breakRangesByDay = shouldEnforceAvailability
            ? buildBreakRangesByDay(
                await getAppointmentBreaksBySpecialistAndDays({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  dayNums: collectDayNumsFromDates(recurringDates)
                })
              )
            : new Map();
          const { createdItems, skippedDates } = await withAppointmentTransaction(async (db) => {
            const nextCreatedItems = [];
            const nextSkippedDates = [];
            let rootAssigned = false;

            for (const recurringDate of recurringDates) {
              if (shouldEnforceAvailability) {
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

        let normWarning = null;
        try {
          const violations = await checkAppointmentNormViolations({
            organizationId: access.authContext.organizationId,
            specialistId,
            clientId,
            appointmentDate
          });
          if (violations.length > 0) {
            const v = violations[0];
            normWarning = `${v.positionLabel}: this client has ${v.currentCount} sessions this week (max: ${v.maxPerWeek}).`;
          }
        } catch {
          // norm check failure must not prevent appointment creation
        }

        return reply.status(201).send({
          message: normWarning ? `Appointment created. Warning: ${normWarning}` : "Appointment created.",
          normWarning,
          item
        });
      } catch (error) {
        if (Number.isInteger(error?.statusCode) && error?.payload) {
          return reply.status(error.statusCode).send(error.payload);
        }
        if (isUniqueOrExclusionConflict(error)) {
          return reply.status(409).send({ message: "This slot is already occupied." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid specialist or client." });
        }
        if (error?.code === "23514") {
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

        const [rawCanUpdateAppointments, rawCanAccessMyChildren] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_UPDATE),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_MY_CHILDREN)
        ]);
        const canUpdateAppointments = requesterHasOrgFeature(requester, "appointments.planner")
          && rawCanUpdateAppointments;
        const canAccessMyChildren = requesterHasOrgFeature(requester, "vip_clients.my_children")
          && rawCanAccessMyChildren;
        if (!canUpdateAppointments && !canAccessMyChildren) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const access = { authContext, requester };
        const isMyChildrenConfirmOnly = !canUpdateAppointments && canAccessMyChildren;

        const id = parsePositiveIntegerOr(request.params?.id, 0);
        if (!id) {
          return reply.status(400).send({ message: "Invalid appointment id." });
        }
        const scope = normalizeScheduleScope(request.query?.scope);
        if (!scope) {
          return reply.status(400).send({ field: "scope", message: "Invalid scope." });
        }
        if (isMyChildrenConfirmOnly && scope !== "single") {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const specialistId = parsePositiveIntegerOr(request.body?.specialistId, 0);
        const ownSpecialistUserId = !isMyChildrenConfirmOnly
          ? resolveOwnAppointmentSpecialistUserId(access)
          : null;
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
        if (isMyChildrenConfirmOnly && status !== "confirmed") {
          return reply.status(403).send({ message: "Forbidden." });
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

        const updatedClientScopeInfo = await getAppointmentClientScopeInfo({
          organizationId: access.authContext.organizationId,
          clientId
        });
        const target = await getAppointmentScheduleTargetsByScope({
          organizationId: access.authContext.organizationId,
          id,
          scope
        });
        if (!Array.isArray(target.items) || target.items.length === 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }
        if (
          ownSpecialistUserId
          && target.items.some((item) => Number.parseInt(String(item?.specialistId || ""), 10) !== ownSpecialistUserId)
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        const requiresVipScopeGuard = target.items.some((item) => item?.isVip === true)
          || updatedClientScopeInfo?.isVip === true;
        if (requiresVipScopeGuard) {
          const vipReadScope = await resolveAppointmentVipReadScope({
            roleId: access.requester?.role_id,
            requester: access.requester
          });
          if (vipReadScope !== "all") {
            const requesterUserId = parsePositiveIntegerOr(access.authContext?.userId, 0);
            if (!requesterUserId) {
              return reply.status(403).send({ message: "Forbidden." });
            }
            const vipClientIds = new Set(
              target.items
                .filter((item) => item?.isVip === true)
                .map((item) => Number.parseInt(String(item?.clientId || ""), 10))
                .filter((value) => Number.isInteger(value) && value > 0)
            );
            if (updatedClientScopeInfo?.isVip === true) {
              vipClientIds.add(clientId);
            }
            for (const vipClientId of vipClientIds) {
              const isAssignedClient = await isVipClientAssignedToUser({
                organizationId: access.authContext.organizationId,
                clientId: vipClientId,
                userId: requesterUserId
              });
              if (!isAssignedClient) {
                return reply.status(403).send({ message: "Forbidden." });
              }
            }
          }
        }
        if (isMyChildrenConfirmOnly) {
          if (target.scope !== "single" || target.items.length !== 1) {
            return reply.status(403).send({ message: "Forbidden." });
          }
          const targetItem = target.items[0];
          const requesterUserId = parsePositiveIntegerOr(access.authContext?.userId, 0);
          if (!requesterUserId) {
            return reply.status(403).send({ message: "Forbidden." });
          }
          const isAssigned = await isVipClientAssignedToUser({
            organizationId: access.authContext.organizationId,
            clientId: targetItem?.clientId,
            userId: requesterUserId
          });
          if (!isAssigned) {
            return reply.status(403).send({ message: "Forbidden." });
          }
          const targetDurationMinutes = String(targetItem?.durationMinutes || "").trim();
          const requestDurationMinutes = String(durationMinutes || "").trim();
          const isSameSchedule = (
            Number(targetItem?.specialistId || 0) === specialistId
            && Number(targetItem?.clientId || 0) === clientId
            && String(targetItem?.appointmentDate || "").trim() === appointmentDate
            && String(targetItem?.startTime || "").trim() === startTime
            && String(targetItem?.endTime || "").trim() === endTime
            && targetDurationMinutes === requestDurationMinutes
            && String(targetItem?.serviceName || "").trim() === serviceName
            && String(targetItem?.note || "").trim() === note
          );
          if (!isSameSchedule || String(targetItem?.status || "").trim().toLowerCase() !== "pending") {
            return reply.status(403).send({ message: "Forbidden." });
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

          const shouldEnforceAvailability = status === "pending" || status === "confirmed";
          const repeatGroupKey = randomUUID();
          const repeatDayNums = repeatDayKeys
            .map((dayKey) => toAppointmentDayNum(dayKey))
            .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
          const breakRangesByDay = shouldEnforceAvailability
            ? buildBreakRangesByDay(
                await getAppointmentBreaksBySpecialistAndDays({
                  organizationId: access.authContext.organizationId,
                  specialistId,
                  dayNums: collectDayNumsFromDates(recurringDates)
                })
              )
            : new Map();
          const { anchorItem, createdItems, skippedDates } = await withAppointmentTransaction(async (db) => {
            if (shouldEnforceAvailability) {
              const anchorWorkingHoursError = validateSlotAgainstWorkingHours({
                settings: settingsForRepeat,
                appointmentDate,
                startTime,
                endTime
              });
              if (anchorWorkingHoursError) {
                throw createRouteError(400, anchorWorkingHoursError);
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
          const scheduleNotification = buildScheduleNotification("edit", items, access?.requester);

          await broadcastAppointmentChange(access, {
            type: "schedule-updated",
            message: scheduleNotification.message,
            specialistIds: [specialistId],
            data: scheduleNotification.data
          });
          schedulesReadCache.clear();

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

        const targetIds = target.items.map((item) => item.id);
        const applyAppointmentDate = target.scope === "single";

        if (status === "pending" || status === "confirmed") {
          const settingsForAvailability = await getAppointmentSettingsByOrganization(
            access.authContext.organizationId,
            { specialistId }
          );
          const validationDates = target.items.map((item) => (
            applyAppointmentDate ? appointmentDate : item.appointmentDate
          ));
          const breakRangesByDay = buildBreakRangesByDay(
            await getAppointmentBreaksBySpecialistAndDays({
              organizationId: access.authContext.organizationId,
              specialistId,
              dayNums: collectDayNumsFromDates(validationDates)
            })
          );

          for (const item of target.items) {
            const conflictDate = applyAppointmentDate ? appointmentDate : item.appointmentDate;
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
        const scheduleNotification = buildScheduleNotification("edit", items, access?.requester);

        await broadcastAppointmentChange(access, {
          type: "schedule-updated",
          message: scheduleNotification.message,
          specialistIds: [specialistId],
          data: scheduleNotification.data
        });
        schedulesReadCache.clear();

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
        if (Number.isInteger(error?.statusCode) && error?.payload) {
          return reply.status(error.statusCode).send(error.payload);
        }
        if (isUniqueOrExclusionConflict(error)) {
          return reply.status(409).send({ message: "This slot is already occupied." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ message: "Invalid specialist or client." });
        }
        if (error?.code === "23514") {
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
          PERMISSIONS.APPOINTMENTS_DELETE,
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

        const target = await getAppointmentScheduleTargetsByScope({
          organizationId: access.authContext.organizationId,
          id,
          scope
        });
        if (!Array.isArray(target.items) || target.items.length === 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }
        const ownSpecialistUserId = resolveOwnAppointmentSpecialistUserId(access);
        if (
          ownSpecialistUserId
          && target.items.some((item) => Number.parseInt(String(item?.specialistId || ""), 10) !== ownSpecialistUserId)
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }
        if (target.items.some((item) => item?.isVip === true)) {
          const vipReadScope = await resolveAppointmentVipReadScope({
            roleId: access.requester?.role_id,
            requester: access.requester
          });
          if (vipReadScope !== "all") {
            const requesterUserId = parsePositiveIntegerOr(access.authContext?.userId, 0);
            if (!requesterUserId) {
              return reply.status(403).send({ message: "Forbidden." });
            }
            for (const item of target.items) {
              if (item?.isVip !== true) {
                continue;
              }
              const isAssignedClient = await isVipClientAssignedToUser({
                organizationId: access.authContext.organizationId,
                clientId: item.clientId,
                userId: requesterUserId
              });
              if (!isAssignedClient) {
                return reply.status(403).send({ message: "Forbidden." });
              }
            }
          }
        }
        const historyLockDays = await getAppointmentHistoryLockDaysByOrganization(
          access.authContext.organizationId
        );
        const historyLockError = getHistoryLockErrorForRequester(
          access.requester,
          target.items.map((item) => item.appointmentDate),
          historyLockDays
        );
        if (historyLockError) {
          return reply.status(403).send(historyLockError);
        }

        const deletedCount = await deleteAppointmentSchedulesByIds({
          organizationId: access.authContext.organizationId,
          ids: target.items.map((item) => item.id),
          actorUserId: access.authContext.userId
        });

        if (deletedCount <= 0) {
          return reply.status(404).send({ message: "Appointment not found." });
        }

        const message = target.scope === "single"
          ? "Appointment deleted."
          : `${deletedCount} appointments deleted.`;
        const scheduleNotification = buildScheduleNotification("delete", target.items, access?.requester);

        await broadcastAppointmentChange(access, {
          type: "schedule-deleted",
          message: scheduleNotification.message,
          specialistIds: target.items.map((item) => item.specialistId),
          data: scheduleNotification.data
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
        request.log.error({ err: error }, "Error deleting appointment schedule");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

}
