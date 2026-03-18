import { randomUUID } from "node:crypto";
import { setNoCacheHeaders } from "../../lib/http.js";
import { normalizePositiveInteger } from "../../lib/number.js";
import { parseNullableBoolean, parseOptionalOrganizationId } from "../../lib/request-parsers.js";
import { isUniqueOrExclusionConflict } from "../../lib/db-utils.js";
import { requesterHasOrgFeature } from "../../lib/org-features.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { isVipClientAssignedToUser } from "../clients/clients.service.js";
import {
  DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS,
  DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  listAppointmentWorkSchedule,
  listAppointmentWorkScheduleStaffByOrganization,
  createAppointmentWorkScheduleEntry,
  updateAppointmentWorkScheduleEntryById,
  deleteAppointmentWorkScheduleEntryById,
  replaceAppointmentDefaultWeeklyWorkSchedule,
  getAppointmentHistoryLockDaysByOrganization,
  getAppointmentSettingsByOrganization,
  saveAppointmentSettings
} from "./services/appointment-settings-config.service.js";
import {
  listAppointmentSpecialistAbsences,
  createAppointmentSpecialistAbsence,
  deleteAppointmentSpecialistAbsenceById,
  hasAppointmentSpecialistAbsenceConflict
} from "./services/appointment-absences.service.js";
import {
  getAppointmentBreaksBySpecialist,
  getAppointmentBreaksBySpecialistAndDays,
  replaceAppointmentBreaksBySpecialist
} from "./services/appointment-breaks.service.js";
import {
  createAppointmentSchedule,
  deleteAppointmentSchedulesByIds,
  ensureAutoRollingRecurringSchedulesCoverRange,
  hasAppointmentClientConflict,
  getAppointmentClientScopeInfo,
  getAppointmentClientNoShowSummary,
  getAppointmentPlannerReportFilters,
  getAppointmentPlannerReport,
  getAppointmentScheduleTargetsByScope,
  getAppointmentSchedulesByRange,
  getAppointmentSpecialistsByOrganization,
  isVipClassAssignedToUser,
  hasAppointmentScheduleConflict,
  toAppointmentDayNum,
  updateAppointmentScheduleByIdWithRepeatMeta,
  updateAppointmentSchedulesByIds,
  withAppointmentTransaction
} from "./services/appointment-schedules.service.js";
import { subscribeAppointmentEvents } from "./appointment-events.js";
import { isAllowedCorsOrigin } from "../../plugins/security.js";
import { registerAppointmentBreakRoutes } from "./routes/breaks.routes.js";
import { registerAppointmentAbsenceRoutes } from "./routes/absences.routes.js";
import { registerAppointmentEventRoutes } from "./routes/events.routes.js";
import { registerAppointmentReferenceRoutes } from "./routes/reference.routes.js";
import { registerAppointmentScheduleRoutes } from "./routes/schedules.routes.js";
import { registerAppointmentSettingsConfigRoutes } from "./routes/settings.routes.js";
import {
  normalizeDurationOptions as normalizeDurationOptionsBase,
  normalizeReminderChannels,
  normalizeScheduleScope
} from "./schedule-normalizers.js";
import {
  DATE_REGEX,
  buildBreakConflictMessage,
  buildBreakRangesByDay,
  buildWorkScheduleBlockConflictMessage,
  buildWorkScheduleBlockRangesByDay,
  buildScheduleNotification,
  buildWeeklyRecurringDates,
  collectDayNumsFromDates,
  createRouteError,
  getHistoryLockErrorForRequester,
  hasSpecialistBreakConflict,
  hasSpecialistWorkScheduleConflict,
  normalizeAppointmentStatus,
  normalizeBreakItems,
  normalizeScheduleRepeatPayload,
  normalizeVisibleWeekDays,
  parseDateYmdToUtcDate,
  resolveTargetOrganizationId,
  toDayKeyFromUtcDate,
  validateBreaksPayload,
  validateRepeatDaysAgainstVisibleWeekDays,
  validateSchedulePayload,
  validateScheduleRepeatPayload,
  validateSettingsPayload,
  validateSlotAgainstWorkingHours
} from "./appointment-route-helpers.js";
import {
  broadcastAppointmentChange,
    resolveAppointmentVipReadScope,
    resolveOwnAppointmentSpecialistUserId
  } from "./appointment-route-access.js";
import { getDurationMinutesFromTimes } from "./time.js";

const parsePositiveIntegerOr = normalizePositiveInteger;
const normalizeDurationOptions = (value) => normalizeDurationOptionsBase(value, { allowCsv: true });

async function requireAppointmentsAccess(
  request,
  reply,
  requiredPermission = PERMISSIONS.APPOINTMENTS_PLANNER_READ,
  requiredFeature = null
) {
  const authContext = request.authContext;

  const requester = authContext?.requester;
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }

  if (!(await hasPermission(requester.role_id, requiredPermission))) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }
  if (requiredFeature && !requesterHasOrgFeature(requester, requiredFeature)) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }

  return { authContext, requester };
}

async function appointmentSettingsRoutes(fastify) {
  const routeContext = {
    randomUUID,
    setNoCacheHeaders,
    requireAppointmentsAccess,
    requesterHasOrgFeature,
    hasPermission,
    PERMISSIONS,
    DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS,
    DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
    parsePositiveIntegerOr,
    parseNullableBoolean,
    parseOptionalOrganizationId,
    resolveTargetOrganizationId,
    normalizeBreakItems,
    normalizeDurationOptions,
    normalizeReminderChannels,
    normalizeAppointmentStatus,
    normalizeScheduleScope,
    normalizeScheduleRepeatPayload,
    normalizeVisibleWeekDays,
    validateBreaksPayload,
    validateSchedulePayload,
    validateScheduleRepeatPayload,
    validateRepeatDaysAgainstVisibleWeekDays,
    validateSlotAgainstWorkingHours,
    validateSettingsPayload,
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
    getAppointmentSpecialistsByOrganization,
    getAppointmentPlannerReportFilters,
    getAppointmentPlannerReport,
    getAppointmentClientScopeInfo,
    getAppointmentClientNoShowSummary,
    ensureAutoRollingRecurringSchedulesCoverRange,
    getAppointmentBreaksBySpecialist,
    replaceAppointmentBreaksBySpecialist,
    subscribeAppointmentEvents,
    isAllowedCorsOrigin,
    getAppointmentSchedulesByRange,
    isVipClassAssignedToUser,
    isVipClientAssignedToUser,
    getAppointmentHistoryLockDaysByOrganization,
    getAppointmentSettingsByOrganization,
    listAppointmentSpecialistAbsences,
    listAppointmentWorkSchedule,
    listAppointmentWorkScheduleStaffByOrganization,
    createAppointmentSpecialistAbsence,
    createAppointmentWorkScheduleEntry,
    updateAppointmentWorkScheduleEntryById,
    deleteAppointmentSpecialistAbsenceById,
    deleteAppointmentWorkScheduleEntryById,
    hasAppointmentSpecialistAbsenceConflict,
    replaceAppointmentDefaultWeeklyWorkSchedule,
    getAppointmentBreaksBySpecialistAndDays,
    getAppointmentScheduleTargetsByScope,
    hasAppointmentClientConflict,
    hasAppointmentScheduleConflict,
    createAppointmentSchedule,
    updateAppointmentScheduleByIdWithRepeatMeta,
    updateAppointmentSchedulesByIds,
    deleteAppointmentSchedulesByIds,
    withAppointmentTransaction,
    toAppointmentDayNum,
    resolveAppointmentVipReadScope,
    resolveOwnAppointmentSpecialistUserId,
    saveAppointmentSettings,
    broadcastAppointmentChange,
    DATE_REGEX
  };

  registerAppointmentReferenceRoutes(fastify, routeContext);
  registerAppointmentAbsenceRoutes(fastify, routeContext);
  registerAppointmentBreakRoutes(fastify, routeContext);
  registerAppointmentEventRoutes(fastify, routeContext);
  registerAppointmentScheduleRoutes(fastify, routeContext);
  registerAppointmentSettingsConfigRoutes(fastify, routeContext);
}
export const __appointmentRouteContracts = Object.freeze({
  parsePositiveIntegerOr,
  parseNullableBoolean,
  parseOptionalOrganizationId,
  resolveTargetOrganizationId,
  normalizeVisibleWeekDays,
  normalizeDurationOptions,
  normalizeReminderChannels,
  normalizeScheduleScope
});

export default appointmentSettingsRoutes;
