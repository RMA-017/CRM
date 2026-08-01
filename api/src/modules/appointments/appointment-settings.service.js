import pool from "../../config/db.js";
import { normalizeDateYmd } from "../../lib/date.js";
import { isUniqueOrExclusionConflict } from "../../lib/db-utils.js";
import { createTtlCache } from "../../lib/ttl-cache.js";
import {
  createMigrationRequiredError,
  getExistingTableNames,
  getMissingNames,
  getTableColumnNames
} from "../../lib/schema-guard.js";
import {
  normalizeWorkScheduleDayOfWeek,
  normalizeWorkScheduleReason,
  normalizeWorkScheduleScope,
  normalizeWorkScheduleTime
} from "./work-schedule.js";
import {
  normalizeDurationOptions,
  normalizeReminderChannels,
  normalizeScheduleScope
} from "./schedule-normalizers.js";
import {
  buildWeeklyRecurringDates,
  buildBreakRangesByDay,
  hasSpecialistBreakConflict,
  buildWorkScheduleBlockRangesByDay,
  hasSpecialistWorkScheduleConflict,
  validateSlotAgainstWorkingHours,
  collectDayNumsFromDates
} from "./appointment-route-helpers.js";
import {
  DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS,
  DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  MAX_APPOINTMENT_HISTORY_LOCK_DAYS,
  MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  MIN_APPOINTMENT_HISTORY_LOCK_DAYS,
  MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  createDefaultSettings,
  createEmptySettings,
  mapRepeatDayNumsToKeys,
  mapSettingsRow,
  mapWorkScheduleItem,
  mapWorkingHours,
  normalizeHistoryLockDays,
  normalizeRepeatType,
  normalizeScheduleIds,
  normalizeSlotCellHeightPx,
  normalizeTimeHm,
  normalizeWorkScheduleDate,
  toAppointmentDayKey,
  toAppointmentDayNum
} from "./appointment-settings-helpers.js";
import {
  getDurationMinutesFromTimes as getDurationMinutesFromAppointmentTimes,
  toTimeMinutes
} from "./time.js";

const appointmentReferenceCache = createTtlCache({
  maxEntries: 128,
  defaultTtlMs: 30_000
});
const appointmentPlannerFilterCache = createTtlCache({
  maxEntries: 128,
  defaultTtlMs: 30_000
});

function cloneAppointmentSpecialistItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    name: String(item?.name || "").trim(),
    role: String(item?.role || "").trim()
  }));
}

function cloneAppointmentStaffItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || "").trim(),
    name: String(item?.name || "").trim(),
    username: String(item?.username || "").trim()
  }));
}

function mapAppointmentSpecialistAbsenceItem(row) {
  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    specialistId: String(row?.user_id || row?.specialist_id || "").trim(),
    specialistName: String(row?.specialist_name || row?.user_name || "").trim(),
    specialistUsername: String(row?.specialist_username || row?.user_username || "").trim(),
    absenceDate: normalizeWorkScheduleDate(row?.work_date || row?.absence_date),
    startTime: normalizeTimeHm(row?.start_time),
    endTime: normalizeTimeHm(row?.end_time),
    reason: String(row?.reason || "").trim(),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

function cloneAppointmentPlannerFilterResult(value) {
  const data = value && typeof value === "object" ? value : {};
  return {
    specialists: (Array.isArray(data.specialists) ? data.specialists : []).map((item) => ({
      id: String(item?.id || "").trim(),
      name: String(item?.name || "").trim()
    })),
    clients: (Array.isArray(data.clients) ? data.clients : []).map((item) => ({
      id: String(item?.id || "").trim(),
      firstName: String(item?.firstName || "").trim(),
      lastName: String(item?.lastName || "").trim(),
      middleName: String(item?.middleName || "").trim(),
      isVip: Boolean(item?.isVip)
    }))
  };
}

export function clearAppointmentReferenceCaches() {
  appointmentReferenceCache.clear();
}

export function clearAppointmentPlannerReportFilterCaches() {
  appointmentPlannerFilterCache.clear();
}

export function resetAppointmentServiceSchemaCacheForTests() {
  appointmentStatusHistorySchemaInitPromise = null;
  appointmentPlannerReportIndexInitPromise = null;
  appointmentSettingsColumnFlagsPromise = null;
  vipClassDailyRoutineSchemaInitPromise = null;
  clearAppointmentReferenceCaches();
  clearAppointmentPlannerReportFilterCaches();
}

const APPOINTMENT_SCHEDULES_TABLE = "appointment_schedules";
const APPOINTMENT_STATUS_HISTORY_TABLE = "appointment_status_history";
const APPOINTMENT_SETTINGS_TABLE = "appointment_settings";
const VIP_CLASS_DAILY_ROUTINES_TABLE = "vip_class_daily_routines";
const WORK_SCHEDULE_CONFLICT_CODE = "WORK_SCHEDULE_CONFLICT";
const WORK_SCHEDULE_BREAK_CONFLICT_CODE = "WORK_SCHEDULE_BREAK_CONFLICT";
const WORK_SCHEDULE_PARENT_CONFLICT_CODE = "WORK_SCHEDULE_PARENT_CONFLICT";
const VIP_AUTO_ROLLING_REPEAT_WINDOW_DAYS = 30;
const VIP_CLASS_DAILY_ROUTINE_REQUIRED_COLUMNS = [
  "organization_id",
  "class_assignment_id",
  "day_of_week",
  "activity_type",
  "start_time",
  "end_time",
  "specialist_user_id",
  "mandatory_exercises",
  "note",
  "created_at",
  "updated_at"
];
const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let appointmentStatusHistorySchemaInitPromise = null;
let appointmentPlannerReportIndexInitPromise = null;
let appointmentSettingsColumnFlagsPromise = null;
let vipClassDailyRoutineSchemaInitPromise = null;

function isAppointmentParentResponsesSchemaMissing(error) {
  if (error?.code !== "42P01" && error?.code !== "42703") {
    return false;
  }
  const message = String(error?.message || "").trim().toLowerCase();
  return message.includes("appointment_parent_responses")
    || message.includes("parent_response_status")
    || message.includes("response_status");
}

function isAppointmentAutoRollingRepeatSchemaMissing(error) {
  if (String(error?.code || "").trim() !== "42703") {
    return false;
  }
  return String(error?.message || "").trim().toLowerCase().includes("is_auto_rolling_repeat");
}

function createAppointmentAutoRollingRepeatMigrationError() {
  return createMigrationRequiredError("Appointment auto-rolling repeat migration is required.", {
    missingColumns: {
      [APPOINTMENT_SCHEDULES_TABLE]: ["is_auto_rolling_repeat"]
    }
  });
}

export {
  DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS,
  DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  MAX_APPOINTMENT_HISTORY_LOCK_DAYS,
  MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  MIN_APPOINTMENT_HISTORY_LOCK_DAYS,
  MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  getAppointmentDayKeys,
  toAppointmentDayNum
} from "./appointment-settings-helpers.js";

function buildScheduleSnapshotSql(alias, previousPrefix = "") {
  const col = (name) => `${alias}.${previousPrefix}${name}`;
  return `jsonb_build_object(
    'specialistId', ${col("specialist_id")},
    'clientId', ${col("client_id")},
    'appointmentDate', ${col("appointment_date")},
    'startTime', ${col("start_time")},
    'endTime', ${col("end_time")},
    'serviceId', ${col("service_id")},
    'serviceName', ${col("service_name")},
    'servicePriceUzs', ${col("service_price_uzs")},
    'status', ${col("status")}
  )`;
}

function buildEffectiveAppointmentServicePriceSql(scheduleAlias = "s", serviceAlias = "sc") {
  return `CASE
    WHEN ${serviceAlias}.id IS NOT NULL
     AND ${scheduleAlias}.created_at >= ${serviceAlias}.updated_at
     AND COALESCE(${serviceAlias}.price_uzs, 0) > 0
    THEN ${serviceAlias}.price_uzs
    ELSE ${scheduleAlias}.service_price_uzs
  END`;
}

function buildScheduleChangedFieldsSql(alias, previousPrefix = "prev_") {
  const prev = (name) => `${alias}.${previousPrefix}${name}`;
  const next = (name) => `${alias}.${name}`;
  return `ARRAY_REMOVE(ARRAY[
    CASE WHEN ${prev("specialist_id")} IS DISTINCT FROM ${next("specialist_id")} THEN 'specialist_id' END,
    CASE WHEN ${prev("client_id")} IS DISTINCT FROM ${next("client_id")} THEN 'client_id' END,
    CASE WHEN ${prev("appointment_date")} IS DISTINCT FROM ${next("appointment_date")} THEN 'appointment_date' END,
    CASE WHEN ${prev("start_time")} IS DISTINCT FROM ${next("start_time")} THEN 'start_time' END,
    CASE WHEN ${prev("end_time")} IS DISTINCT FROM ${next("end_time")} THEN 'end_time' END,
    CASE WHEN ${prev("service_id")} IS DISTINCT FROM ${next("service_id")} THEN 'service_id' END,
    CASE WHEN ${prev("service_name")} IS DISTINCT FROM ${next("service_name")} THEN 'service_name' END,
    CASE WHEN ${prev("service_price_uzs")} IS DISTINCT FROM ${next("service_price_uzs")} THEN 'service_price_uzs' END,
    CASE WHEN ${prev("status")} IS DISTINCT FROM ${next("status")} THEN 'status' END
  ]::text[], NULL)`;
}

function parseDateYmdToUtcDate(value) {
  const normalized = normalizeDateYmd(value);
  if (!normalized) {
    return null;
  }
  const [yearRaw, monthRaw, dayRaw] = normalized.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatUtcDateYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function normalizeUuidString(value) {
  const normalized = String(value || "").trim();
  return UUID_LIKE_REGEX.test(normalized) ? normalized : "";
}

function addDaysToDateYmd(value, days) {
  const date = parseDateYmdToUtcDate(value);
  if (!date) {
    return "";
  }
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDateYmd(date);
}

function getVipAutoRollingRepeatHorizonDate(dateTo) {
  const requested = parseDateYmdToUtcDate(dateTo);
  if (!requested) {
    return "";
  }
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rollingHorizon = new Date(todayUtc.getTime());
  rollingHorizon.setUTCDate(rollingHorizon.getUTCDate() + Math.max(0, VIP_AUTO_ROLLING_REPEAT_WINDOW_DAYS - 1));
  return formatUtcDateYmd(requested > rollingHorizon ? requested : rollingHorizon);
}

async function ensureAppointmentStatusHistorySchema() {
  if (!appointmentStatusHistorySchemaInitPromise) {
    appointmentStatusHistorySchemaInitPromise = (async () => {
      const existingTables = await getExistingTableNames({
        tableNames: [APPOINTMENT_STATUS_HISTORY_TABLE]
      });
      if (!existingTables.has(APPOINTMENT_STATUS_HISTORY_TABLE)) {
        throw createMigrationRequiredError("Appointment status history migration is required.", {
          missingTables: [APPOINTMENT_STATUS_HISTORY_TABLE]
        });
      }

      const requiredColumns = [
        "organization_id",
        "appointment_schedule_id",
        "event_type",
        "previous_status",
        "next_status",
        "changed_fields",
        "details",
        "changed_by",
        "changed_at"
      ];
      const existingColumns = await getTableColumnNames({
        tableName: APPOINTMENT_STATUS_HISTORY_TABLE
      });
      const missingColumns = getMissingNames(existingColumns, requiredColumns);
      if (missingColumns.length > 0) {
        throw createMigrationRequiredError("Appointment status history migration is required.", {
          missingColumns: {
            [APPOINTMENT_STATUS_HISTORY_TABLE]: missingColumns
          }
        });
      }
    })().catch((error) => {
      appointmentStatusHistorySchemaInitPromise = null;
      throw error;
    });
  }

  return appointmentStatusHistorySchemaInitPromise;
}

async function ensureAppointmentPlannerReportIndexes() {
  if (!appointmentPlannerReportIndexInitPromise) {
    appointmentPlannerReportIndexInitPromise = Promise.resolve();
  }

  return appointmentPlannerReportIndexInitPromise;
}

async function ensureVipClassDailyRoutineSchema() {
  if (!vipClassDailyRoutineSchemaInitPromise) {
    vipClassDailyRoutineSchemaInitPromise = (async () => {
      const existingTables = await getExistingTableNames({
        tableNames: [VIP_CLASS_DAILY_ROUTINES_TABLE]
      });
      if (!existingTables.has(VIP_CLASS_DAILY_ROUTINES_TABLE)) {
        throw createMigrationRequiredError("VIP class daily routine migration is required.", {
          missingTables: [VIP_CLASS_DAILY_ROUTINES_TABLE]
        });
      }

      const existingColumns = await getTableColumnNames({
        tableName: VIP_CLASS_DAILY_ROUTINES_TABLE
      });
      const missingColumns = getMissingNames(existingColumns, VIP_CLASS_DAILY_ROUTINE_REQUIRED_COLUMNS);
      if (missingColumns.length > 0) {
        throw createMigrationRequiredError("VIP class daily routine migration is required.", {
          missingColumns: {
            [VIP_CLASS_DAILY_ROUTINES_TABLE]: missingColumns
          }
        });
      }
    })().catch((error) => {
      vipClassDailyRoutineSchemaInitPromise = null;
      throw error;
    });
  }

  return vipClassDailyRoutineSchemaInitPromise;
}

async function hasVipClassDailyRoutineSchema() {
  try {
    await ensureVipClassDailyRoutineSchema();
    return true;
  } catch (error) {
    if (error?.code === "MIGRATION_REQUIRED") {
      return false;
    }
    throw error;
  }
}

function getAppointmentSchedulesTableName() {
  return APPOINTMENT_SCHEDULES_TABLE;
}

function toBreakItem(row) {
  const dayOfWeek = Number.parseInt(String(row?.day_of_week ?? "").trim(), 10) || 0;
  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    specialistId: String(row?.specialist_id || "").trim(),
    specialistName: String(row?.specialist_name || "").trim(),
    dayOfWeek,
    dayKey: toAppointmentDayKey(dayOfWeek),
    breakType: String(row?.break_type || "lunch").trim().toLowerCase(),
    title: String(row?.title || "").trim(),
    note: String(row?.note || "").trim(),
    startTime: normalizeTimeHm(row?.start_time),
    endTime: normalizeTimeHm(row?.end_time),
    isActive: Boolean(row?.is_active),
    createdBy: String(row?.created_by_name || row?.created_by || "").trim(),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

function buildAssignedVipClientExistsSql({
  organizationRef,
  clientRef,
  userParamRef
}) {
  return `EXISTS (
           SELECT 1
             FROM vip_client_tutor_assignments vta_scope
             JOIN vip_class_teacher_assignments vcta_scope
               ON vcta_scope.organization_id = vta_scope.organization_id
              AND vcta_scope.id = vta_scope.class_assignment_id
            WHERE vta_scope.organization_id = ${organizationRef}
              AND vta_scope.client_id = ${clientRef}
              AND (
                vcta_scope.teacher_user_id = ${userParamRef}
                OR vta_scope.tutor_user_id = ${userParamRef}
              )
         )`;
}

function buildVipDailyRoutineSpecialistMatchSql({
  specialistParamRef,
  routineAlias = "vdr"
}) {
  const routineSpecialistRef = `${routineAlias}.specialist_user_id`;
  return `${routineSpecialistRef} = ${specialistParamRef}`;
}

function formatAppointmentDayLabel(dayOfWeek) {
  const dayKey = toAppointmentDayKey(dayOfWeek);
  if (!dayKey) {
    return "Selected day";
  }
  return dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
}

function getIsoDayOfWeekFromDateYmd(value) {
  const normalized = normalizeWorkScheduleDate(value);
  if (!normalized) {
    return null;
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const day = parsed.getUTCDay();
  return day === 0 ? 7 : day;
}

function buildWeeklyWorkScheduleMap(rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const map = new Map();
  source.forEach((row) => {
    const dayOfWeek = normalizeWorkScheduleDayOfWeek(row?.day_of_week);
    if (!dayOfWeek) {
      return;
    }
    const startTime = normalizeWorkScheduleTime(row?.start_time) || null;
    const endTime = normalizeWorkScheduleTime(row?.end_time) || null;
    map.set(dayOfWeek, {
      dayOfWeek,
      isActive: row?.is_active === true && Boolean(startTime && endTime && startTime < endTime),
      startTime,
      endTime
    });
  });
  return map;
}

function buildWeeklyWorkScheduleRowsFromMap(workScheduleMap) {
  const rows = [];
  for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
    const item = workScheduleMap?.get(dayOfWeek) || {
      dayOfWeek,
      isActive: false,
      startTime: null,
      endTime: null
    };
    rows.push({
      day_of_week: dayOfWeek,
      is_active: item.isActive === true,
      start_time: item.isActive === true ? item.startTime : null,
      end_time: item.isActive === true ? item.endTime : null
    });
  }
  return rows;
}

function createWorkScheduleParentConflictError({
  dayOfWeek,
  parentStartTime,
  parentEndTime,
  specialistName = "Specialist"
}) {
  const dayLabel = formatAppointmentDayLabel(dayOfWeek);
  const hoursText = parentStartTime && parentEndTime
    ? `${parentStartTime}-${parentEndTime}`
    : "closed";
  const message = `${specialistName} blocked time must stay inside organization default hours for ${dayLabel} (${hoursText}).`;
  const error = new Error(message);
  error.statusCode = 409;
  error.code = WORK_SCHEDULE_PARENT_CONFLICT_CODE;
  error.payload = {
    code: WORK_SCHEDULE_PARENT_CONFLICT_CODE,
    message,
    dayOfWeek: String(dayOfWeek || "").trim(),
    parentStartTime: parentStartTime || "",
    parentEndTime: parentEndTime || ""
  };
  return error;
}

function mapSpecialistBlockedTimes(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const dayOfWeek = normalizeWorkScheduleDayOfWeek(row?.day_of_week);
      const startTime = normalizeWorkScheduleTime(row?.start_time) || null;
      const endTime = normalizeWorkScheduleTime(row?.end_time) || null;
      const isActive = row?.is_active === true && Boolean(dayOfWeek && startTime && endTime && startTime < endTime);
      if (!isActive) {
        return null;
      }
      return {
        dayOfWeek: String(dayOfWeek),
        dayKey: toAppointmentDayKey(dayOfWeek),
        startTime,
        endTime,
        reason: String(row?.reason || "").trim()
      };
    })
    .filter(Boolean);
}

function eachDateYmdInRange(from, to) {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return [];
  }

  const dates = [];
  for (let cursor = fromDate; cursor <= toDate; cursor = new Date(cursor.getTime() + 86400000)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function getDurationFromTimes(startTime, endTime) {
  const start = toTimeMinutes(startTime, { allowSeconds: true });
  const end = toTimeMinutes(endTime, { allowSeconds: true });
  return start === null || end === null || end <= start ? 0 : end - start;
}

function createEmptyWorkloadTotals() {
  return {
    workingMinutes: 0,
    breakMinutes: 0,
    blockedMinutes: 0,
    availableMinutes: 0,
    bookedMinutes: 0,
    emptyMinutes: 0,
    utilizationPercent: 0
  };
}

function finalizeWorkloadTotals(value) {
  const workingMinutes = Math.max(0, Number.parseInt(String(value?.workingMinutes || "0"), 10) || 0);
  const breakMinutes = Math.max(0, Number.parseInt(String(value?.breakMinutes || "0"), 10) || 0);
  const blockedMinutes = Math.max(0, Number.parseInt(String(value?.blockedMinutes || "0"), 10) || 0);
  const availableMinutes = Math.max(0, workingMinutes - breakMinutes - blockedMinutes);
  const bookedMinutes = Math.max(0, Number.parseInt(String(value?.bookedMinutes || "0"), 10) || 0);
  const emptyMinutes = Math.max(0, availableMinutes - bookedMinutes);
  return {
    ...value,
    workingMinutes,
    breakMinutes,
    blockedMinutes,
    availableMinutes,
    bookedMinutes,
    emptyMinutes,
    utilizationPercent: availableMinutes > 0 ? Math.round((Math.min(bookedMinutes, availableMinutes) / availableMinutes) * 100) : 0
  };
}

function mergeMinuteRanges(ranges = []) {
  const sorted = (Array.isArray(ranges) ? ranges : [])
    .map((range) => ({
      start: Number.parseInt(String(range?.start ?? ""), 10),
      end: Number.parseInt(String(range?.end ?? ""), 10)
    }))
    .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  return sorted.reduce((items, range) => {
    const previous = items[items.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      return items;
    }
    items.push({ ...range });
    return items;
  }, []);
}

function sumMinuteRanges(ranges = []) {
  return mergeMinuteRanges(ranges).reduce((total, range) => total + Math.max(0, range.end - range.start), 0);
}

async function buildAppointmentPlannerWorkload({
  organizationId,
  from,
  to,
  specialistRows = [],
  specialistId = null,
  details = []
}) {
  const dates = eachDateYmdInRange(from, to);
  if (dates.length === 0) {
    return {
      totals: createEmptyWorkloadTotals(),
      specialists: [],
      daily: []
    };
  }

  const detailSpecialistIds = Array.from(
    new Set(
      (Array.isArray(details) ? details : [])
        .map((row) => Number.parseInt(String(row?.specialistId || "").trim(), 10))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
  const explicitSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const specialistIds = explicitSpecialistId
    ? [explicitSpecialistId]
    : detailSpecialistIds;
  if (specialistIds.length === 0) {
    return {
      totals: createEmptyWorkloadTotals(),
      specialists: [],
      daily: dates.map((date) => ({ date, ...createEmptyWorkloadTotals() }))
    };
  }

  const specialistNameById = new Map(
    (Array.isArray(specialistRows) ? specialistRows : []).map((item) => [
      Number.parseInt(String(item?.id || "").trim(), 10) || 0,
      String(item?.name || "").trim()
    ])
  );

  const [defaultWorkingHoursResult, breaksResult, blockedResult] = await Promise.all([
    pool.query(
      `SELECT day_of_week, is_active, start_time, end_time
         FROM appointment_working_hours
        WHERE organization_id = $1
          AND user_id IS NULL
          AND rule_scope = 'weekly'
        ORDER BY day_of_week ASC`,
      [organizationId]
    ),
    pool.query(
      `SELECT specialist_id, day_of_week, start_time, end_time
         FROM appointment_breaks
        WHERE organization_id = $1
          AND specialist_id = ANY($2::int[])
          AND is_active = TRUE
        ORDER BY specialist_id ASC, day_of_week ASC, start_time ASC`,
      [organizationId, specialistIds]
    ),
    pool.query(
      `SELECT user_id AS specialist_id, rule_scope, day_of_week, work_date, is_active, start_time, end_time
         FROM appointment_working_hours
        WHERE organization_id = $1
          AND user_id = ANY($2::int[])
          AND is_active = TRUE
          AND start_time IS NOT NULL
          AND end_time IS NOT NULL
          AND start_time < end_time
          AND (
            rule_scope = 'weekly'
            OR (rule_scope = 'exception' AND work_date BETWEEN $3::date AND $4::date)
          )
        ORDER BY user_id ASC, rule_scope ASC, day_of_week ASC, work_date ASC, start_time ASC`,
      [organizationId, specialistIds, from, to]
    )
  ]);

  const defaultWorkingRows = defaultWorkingHoursResult.rows || [];
  const defaultWorkingByDay = new Map();
  if (defaultWorkingRows.length > 0) {
    defaultWorkingRows.forEach((row) => {
      const dayOfWeek = normalizeWorkScheduleDayOfWeek(row?.day_of_week);
      const start = toTimeMinutes(row?.start_time, { allowSeconds: true });
      const end = toTimeMinutes(row?.end_time, { allowSeconds: true });
      if (dayOfWeek && row?.is_active === true && start !== null && end !== null && end > start) {
        defaultWorkingByDay.set(dayOfWeek, { start, end });
      }
    });
  } else {
    const defaults = createDefaultSettings().workingHours || {};
    Object.entries(defaults).forEach(([dayKey, hours]) => {
      const dayOfWeek = toAppointmentDayNum(dayKey);
      const start = toTimeMinutes(hours?.start);
      const end = toTimeMinutes(hours?.end);
      if (dayOfWeek && start !== null && end !== null && end > start) {
        defaultWorkingByDay.set(dayOfWeek, { start, end });
      }
    });
  }

  const breaksBySpecialistDay = new Map();
  (breaksResult.rows || []).forEach((row) => {
    const currentSpecialistId = Number.parseInt(String(row?.specialist_id || "").trim(), 10) || 0;
    const dayOfWeek = normalizeWorkScheduleDayOfWeek(row?.day_of_week);
    const start = toTimeMinutes(row?.start_time, { allowSeconds: true });
    const end = toTimeMinutes(row?.end_time, { allowSeconds: true });
    if (!currentSpecialistId || !dayOfWeek || start === null || end === null || end <= start) {
      return;
    }
    const key = `${currentSpecialistId}:${dayOfWeek}`;
    const items = breaksBySpecialistDay.get(key) || [];
    items.push({ start, end });
    breaksBySpecialistDay.set(key, items);
  });

  const weeklyBlocksBySpecialistDay = new Map();
  const exceptionBlocksBySpecialistDate = new Map();
  (blockedResult.rows || []).forEach((row) => {
    const currentSpecialistId = Number.parseInt(String(row?.specialist_id || "").trim(), 10) || 0;
    const start = toTimeMinutes(row?.start_time, { allowSeconds: true });
    const end = toTimeMinutes(row?.end_time, { allowSeconds: true });
    if (!currentSpecialistId || start === null || end === null || end <= start) {
      return;
    }
    const scope = String(row?.rule_scope || "").trim().toLowerCase();
    if (scope === "exception") {
      const date = normalizeDateYmd(row?.work_date);
      if (!date) {
        return;
      }
      const key = `${currentSpecialistId}:${date}`;
      const items = exceptionBlocksBySpecialistDate.get(key) || [];
      items.push({ start, end });
      exceptionBlocksBySpecialistDate.set(key, items);
      return;
    }
    const dayOfWeek = normalizeWorkScheduleDayOfWeek(row?.day_of_week);
    if (!dayOfWeek) {
      return;
    }
    const key = `${currentSpecialistId}:${dayOfWeek}`;
    const items = weeklyBlocksBySpecialistDay.get(key) || [];
    items.push({ start, end });
    weeklyBlocksBySpecialistDay.set(key, items);
  });

  const bookedBySpecialistDate = new Map();
  (Array.isArray(details) ? details : []).forEach((row) => {
    const status = String(row?.status || "").trim().toLowerCase();
    if (status !== "confirmed" && status !== "pending") {
      return;
    }
    const currentSpecialistId = Number.parseInt(String(row?.specialistId || "").trim(), 10) || 0;
    const date = normalizeDateYmd(row?.appointmentDate);
    if (!currentSpecialistId || !date) {
      return;
    }
    const duration = Number.parseInt(String(row?.durationMinutes || "0"), 10) || getDurationFromTimes(row?.startTime, row?.endTime);
    const key = `${currentSpecialistId}:${date}`;
    bookedBySpecialistDate.set(key, (bookedBySpecialistDate.get(key) || 0) + Math.max(0, duration));
  });

  const totals = createEmptyWorkloadTotals();
  const specialistTotals = new Map();
  const dailyTotals = new Map(dates.map((date) => [date, { date, ...createEmptyWorkloadTotals() }]));

  specialistIds.forEach((currentSpecialistId) => {
    const specialistTotal = {
      specialistId: String(currentSpecialistId),
      specialistName: specialistNameById.get(currentSpecialistId) || `Specialist #${currentSpecialistId}`,
      ...createEmptyWorkloadTotals()
    };

    dates.forEach((date) => {
      const dayOfWeek = getIsoDayOfWeekFromDateYmd(date);
      const working = defaultWorkingByDay.get(dayOfWeek);
      const bookedMinutes = bookedBySpecialistDate.get(`${currentSpecialistId}:${date}`) || 0;
      const daily = dailyTotals.get(date);
      specialistTotal.bookedMinutes += bookedMinutes;
      daily.bookedMinutes += bookedMinutes;
      totals.bookedMinutes += bookedMinutes;
      if (!working) {
        return;
      }

      const breakRanges = (breaksBySpecialistDay.get(`${currentSpecialistId}:${dayOfWeek}`) || [])
        .map((range) => ({
          start: Math.max(working.start, range.start),
          end: Math.min(working.end, range.end)
        }));
      const blockRanges = [
        ...(weeklyBlocksBySpecialistDay.get(`${currentSpecialistId}:${dayOfWeek}`) || []),
        ...(exceptionBlocksBySpecialistDate.get(`${currentSpecialistId}:${date}`) || [])
      ].map((range) => ({
        start: Math.max(working.start, range.start),
        end: Math.min(working.end, range.end)
      }));
      const breakMinutes = sumMinuteRanges(breakRanges);
      const blockedMinutes = sumMinuteRanges(blockRanges);
      const workingMinutes = Math.max(0, working.end - working.start);

      specialistTotal.workingMinutes += workingMinutes;
      specialistTotal.breakMinutes += breakMinutes;
      specialistTotal.blockedMinutes += blockedMinutes;
      daily.workingMinutes += workingMinutes;
      daily.breakMinutes += breakMinutes;
      daily.blockedMinutes += blockedMinutes;
      totals.workingMinutes += workingMinutes;
      totals.breakMinutes += breakMinutes;
      totals.blockedMinutes += blockedMinutes;
    });

    specialistTotals.set(currentSpecialistId, finalizeWorkloadTotals(specialistTotal));
  });

  return {
    totals: finalizeWorkloadTotals(totals),
    specialists: [...specialistTotals.values()].sort((left, right) => (
      right.utilizationPercent - left.utilizationPercent
      || right.bookedMinutes - left.bookedMinutes
      || left.specialistName.localeCompare(right.specialistName, undefined, { sensitivity: "base" })
    )),
    daily: [...dailyTotals.values()].map(finalizeWorkloadTotals)
  };
}

async function getOrganizationDefaultWeeklyWorkScheduleRows({
  organizationId,
  db = pool
}) {
  const { rows } = await db.query(
    `SELECT day_of_week, is_active, start_time, end_time
       FROM appointment_working_hours
      WHERE organization_id = $1
        AND user_id IS NULL
        AND rule_scope = 'weekly'
      ORDER BY day_of_week ASC`,
    [organizationId]
  );
  return rows || [];
}

async function assertSpecialistWorkScheduleWithinOrganizationWeeklyHours({
  organizationId,
  userId,
  ruleScope,
  dayOfWeek = null,
  workDate = null,
  isActive = false,
  startTime = null,
  endTime = null,
  db = pool
}) {
  const normalizedUserId = Number.parseInt(String(userId || "").trim(), 10) || null;
  if (!normalizedUserId || isActive !== true) {
    return;
  }

  const normalizedScope = normalizeWorkScheduleScope(ruleScope);
  const targetDayOfWeek = normalizedScope === "weekly"
    ? (normalizeWorkScheduleDayOfWeek(dayOfWeek) || null)
    : getIsoDayOfWeekFromDateYmd(workDate);
  const normalizedStartTime = normalizeWorkScheduleTime(startTime) || null;
  const normalizedEndTime = normalizeWorkScheduleTime(endTime) || null;
  if (!targetDayOfWeek || !normalizedStartTime || !normalizedEndTime || normalizedStartTime >= normalizedEndTime) {
    return;
  }

  const orgRows = await getOrganizationDefaultWeeklyWorkScheduleRows({
    organizationId,
    db
  });
  const orgMap = buildWeeklyWorkScheduleMap(orgRows);
  const parent = orgMap.get(targetDayOfWeek) || {
    isActive: false,
    startTime: null,
    endTime: null
  };

  if (
    parent.isActive !== true
    || !parent.startTime
    || !parent.endTime
    || normalizedStartTime < parent.startTime
    || normalizedEndTime > parent.endTime
  ) {
    throw createWorkScheduleParentConflictError({
      dayOfWeek: targetDayOfWeek,
      parentStartTime: parent.startTime,
      parentEndTime: parent.endTime
    });
  }
}

async function assertDefaultWeeklyWorkScheduleSupportsOrganizationChildren({
  organizationId,
  items = [],
  db = pool
}) {
  const weeklyTemplateMap = new Map();
  for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
    weeklyTemplateMap.set(dayOfWeek, {
      dayOfWeek,
      isActive: false,
      startTime: null,
      endTime: null
    });
  }
  (Array.isArray(items) ? items : []).forEach((item) => {
    const dayOfWeek = normalizeWorkScheduleDayOfWeek(item?.dayOfWeek ?? item?.day_of_week);
    if (!dayOfWeek) {
      return;
    }
    weeklyTemplateMap.set(dayOfWeek, {
      dayOfWeek,
      isActive: item?.isActive === true,
      startTime: normalizeWorkScheduleTime(item?.startTime ?? item?.start_time) || null,
      endTime: normalizeWorkScheduleTime(item?.endTime ?? item?.end_time) || null
    });
  });

  const { rows: specialistRows } = await db.query(
    `SELECT
       awh.user_id,
       awh.day_of_week,
       awh.is_active,
       awh.start_time,
       awh.end_time,
       COALESCE(
         NULLIF(TRIM(u.full_name), ''),
         NULLIF(TRIM(u.username), ''),
         CONCAT('Specialist #', awh.user_id::text)
       ) AS specialist_name
      FROM appointment_working_hours awh
      LEFT JOIN users u
        ON u.id = awh.user_id
       AND u.organization_id = awh.organization_id
     WHERE awh.organization_id = $1
       AND awh.user_id IS NOT NULL
       AND awh.rule_scope = 'weekly'
     ORDER BY awh.user_id ASC, awh.day_of_week ASC`,
    [organizationId]
  );

  const specialistConflict = (specialistRows || []).find((row) => {
    const dayOfWeek = normalizeWorkScheduleDayOfWeek(row?.day_of_week) || 0;
    const parent = weeklyTemplateMap.get(dayOfWeek) || {
      isActive: false,
      startTime: null,
      endTime: null
    };
    const startTime = normalizeWorkScheduleTime(row?.start_time) || null;
    const endTime = normalizeWorkScheduleTime(row?.end_time) || null;
    const isActive = row?.is_active === true && Boolean(startTime && endTime && startTime < endTime);
    if (!isActive) {
      return false;
    }
    return (
      parent.isActive !== true
      || !parent.startTime
      || !parent.endTime
      || startTime < parent.startTime
      || endTime > parent.endTime
    );
  });

  if (specialistConflict) {
    throw createWorkScheduleParentConflictError({
      dayOfWeek: specialistConflict.day_of_week,
      parentStartTime: weeklyTemplateMap.get(
        normalizeWorkScheduleDayOfWeek(specialistConflict.day_of_week) || 0
      )?.startTime || null,
      parentEndTime: weeklyTemplateMap.get(
        normalizeWorkScheduleDayOfWeek(specialistConflict.day_of_week) || 0
      )?.endTime || null,
      specialistName: String(specialistConflict?.specialist_name || "Specialist").trim() || "Specialist"
    });
  }

  const weeklyTemplateRows = buildWeeklyWorkScheduleRowsFromMap(weeklyTemplateMap);
  const { rows: appointmentConflictRows } = await db.query(
    `WITH incoming AS (
       SELECT
         (item->>'dayOfWeek')::smallint AS day_of_week,
         COALESCE((item->>'isActive')::boolean, FALSE) AS is_active,
         NULLIF(TRIM(item->>'startTime'), '')::time AS start_time,
         NULLIF(TRIM(item->>'endTime'), '')::time AS end_time
       FROM jsonb_array_elements($2::jsonb) AS item
     )
     SELECT
       s.id AS appointment_id,
       s.specialist_id,
       s.appointment_date,
       TO_CHAR(s.start_time, 'HH24:MI') AS appointment_start_time,
       TO_CHAR(s.end_time, 'HH24:MI') AS appointment_end_time,
       COALESCE(
         NULLIF(TRIM(u.full_name), ''),
         NULLIF(TRIM(u.username), ''),
         CONCAT('Specialist #', s.specialist_id::text)
       ) AS specialist_name
      FROM incoming i
      JOIN appointment_schedules s
        ON s.organization_id = $1
        AND s.status IN ('pending', 'confirmed')
       AND (
         s.appointment_date > TIMEZONE('Asia/Tashkent', NOW())::date
         OR (
           s.appointment_date = TIMEZONE('Asia/Tashkent', NOW())::date
           AND s.end_time > TIMEZONE('Asia/Tashkent', NOW())::time
         )
       )
       AND EXTRACT(ISODOW FROM s.appointment_date)::smallint = i.day_of_week
      LEFT JOIN users u
        ON u.id = s.specialist_id
       AND u.organization_id = s.organization_id
     WHERE
       i.day_of_week BETWEEN 1 AND 7
       AND (
         i.is_active = FALSE
         OR i.start_time IS NULL
         OR i.end_time IS NULL
         OR s.start_time < i.start_time
         OR s.end_time > i.end_time
       )
     ORDER BY s.appointment_date ASC, s.start_time ASC, s.id ASC
     LIMIT 1`,
    [
      organizationId,
      JSON.stringify(weeklyTemplateRows.map((row) => ({
        dayOfWeek: row.day_of_week,
        isActive: row.is_active === true,
        startTime: normalizeWorkScheduleTime(row.start_time) || "",
        endTime: normalizeWorkScheduleTime(row.end_time) || ""
      })))
    ]
  );

  const appointmentConflict = appointmentConflictRows?.[0] || null;
  if (appointmentConflict) {
    throw createWorkScheduleConflictError(appointmentConflict);
  }
}

function normalizeWorkScheduleConflictState(value = {}) {
  const normalizedScope = normalizeWorkScheduleScope(value?.ruleScope ?? value?.rule_scope) || "";
  const parsedUserId = Number.parseInt(
    String(value?.userId ?? value?.user_id ?? "").trim(),
    10
  );
  return {
    userId: Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null,
    ruleScope: normalizedScope,
    dayOfWeek: normalizedScope === "weekly"
      ? (normalizeWorkScheduleDayOfWeek(value?.dayOfWeek ?? value?.day_of_week) || null)
      : null,
    workDate: normalizedScope === "exception"
      ? (normalizeWorkScheduleDate(value?.workDate ?? value?.work_date) || null)
      : null,
    isActive: value?.isActive === true || value?.is_active === true,
    startTime: normalizeWorkScheduleTime(value?.startTime ?? value?.start_time) || null,
    endTime: normalizeWorkScheduleTime(value?.endTime ?? value?.end_time) || null
  };
}

function hasWorkScheduleAvailabilityChange(previousState, nextState) {
  const previous = normalizeWorkScheduleConflictState(previousState);
  const next = normalizeWorkScheduleConflictState(nextState);
  return (
    previous.userId !== next.userId
    || previous.ruleScope !== next.ruleScope
    || previous.dayOfWeek !== next.dayOfWeek
    || previous.workDate !== next.workDate
    || previous.isActive !== next.isActive
    || previous.startTime !== next.startTime
    || previous.endTime !== next.endTime
  );
}

function toWorkScheduleConflictTarget(value = {}) {
  const state = normalizeWorkScheduleConflictState(value);
  if (!state.userId || !state.ruleScope) {
    return null;
  }
  if (state.ruleScope === "weekly" && state.dayOfWeek) {
    return {
      specialistId: state.userId,
      ruleScope: state.ruleScope,
      dayOfWeek: state.dayOfWeek,
      workDate: null,
      isActive: state.isActive === true,
      startTime: state.isActive === true ? state.startTime : null,
      endTime: state.isActive === true ? state.endTime : null
    };
  }
  if (state.ruleScope === "exception" && state.workDate) {
    return {
      specialistId: state.userId,
      ruleScope: state.ruleScope,
      dayOfWeek: null,
      workDate: state.workDate,
      isActive: state.isActive === true,
      startTime: state.isActive === true ? state.startTime : null,
      endTime: state.isActive === true ? state.endTime : null
    };
  }
  return null;
}

async function getAppointmentWorkScheduleEntryById({
  id,
  organizationId,
  db = pool
}) {
  const { rows } = await db.query(
    `SELECT
       awh.id,
       awh.organization_id,
       awh.user_id,
       awh.rule_scope,
       awh.day_of_week,
       awh.work_date,
       awh.is_active,
       awh.start_time,
       awh.end_time,
       awh.reason
      FROM appointment_working_hours awh
     WHERE awh.id = $1
       AND awh.organization_id = $2
     LIMIT 1`,
    [id, organizationId]
  );

  return rows?.[0] || null;
}

async function findFutureWorkScheduleConflict({
  organizationId,
  targets = [],
  db = pool
}) {
  const normalizedTargets = Array.from(
    new Map(
      (Array.isArray(targets) ? targets : [])
        .map((item) => toWorkScheduleConflictTarget(item))
        .filter(Boolean)
        .map((item) => {
          const key = [
            item.specialistId,
            item.ruleScope,
            item.dayOfWeek || "",
            item.workDate || "",
            item.isActive === true ? "1" : "0",
            item.startTime || "",
            item.endTime || ""
          ].join("|");
          return [key, item];
        })
    ).values()
  );

  if (normalizedTargets.length === 0) {
    return null;
  }

  const { rows } = await db.query(
    `WITH incoming AS (
       SELECT
         (item->>'specialistId')::integer AS specialist_id,
         NULLIF(TRIM(item->>'ruleScope'), '')::text AS rule_scope,
         NULLIF(TRIM(item->>'dayOfWeek'), '')::smallint AS day_of_week,
         NULLIF(TRIM(item->>'workDate'), '')::date AS work_date,
         COALESCE((item->>'isActive')::boolean, FALSE) AS is_active,
         NULLIF(TRIM(item->>'startTime'), '')::time AS start_time,
         NULLIF(TRIM(item->>'endTime'), '')::time AS end_time
       FROM jsonb_array_elements($2::jsonb) AS item
     ),
     normalized AS (
       SELECT DISTINCT
         i.specialist_id,
         i.rule_scope,
         i.day_of_week,
         i.work_date,
         i.is_active,
         i.start_time,
         i.end_time
       FROM incoming i
       WHERE i.specialist_id IS NOT NULL
         AND (
           (i.rule_scope = 'weekly' AND i.day_of_week BETWEEN 1 AND 7)
           OR
           (i.rule_scope = 'exception' AND i.work_date IS NOT NULL)
         )
     )
     SELECT
       s.id AS appointment_id,
       s.specialist_id,
       s.appointment_date,
       TO_CHAR(s.start_time, 'HH24:MI') AS appointment_start_time,
       TO_CHAR(s.end_time, 'HH24:MI') AS appointment_end_time,
       COALESCE(
         NULLIF(TRIM(u.full_name), ''),
         NULLIF(TRIM(u.username), ''),
         CONCAT('Specialist #', s.specialist_id::text)
       ) AS specialist_name
      FROM normalized n
      JOIN appointment_schedules s
        ON s.organization_id = $1
       AND s.specialist_id = n.specialist_id
       AND s.status IN ('pending', 'confirmed')
       AND (
         s.appointment_date > TIMEZONE('Asia/Tashkent', NOW())::date
         OR (
           s.appointment_date = TIMEZONE('Asia/Tashkent', NOW())::date
           AND s.end_time > TIMEZONE('Asia/Tashkent', NOW())::time
         )
       )
       AND (
         (n.rule_scope = 'weekly' AND EXTRACT(ISODOW FROM s.appointment_date)::smallint = n.day_of_week)
         OR
         (n.rule_scope = 'exception' AND s.appointment_date = n.work_date)
       )
      LEFT JOIN users u
        ON u.id = s.specialist_id
       AND u.organization_id = s.organization_id
     WHERE (
       n.is_active = FALSE
       OR n.start_time IS NULL
       OR n.end_time IS NULL
       OR (s.start_time < n.end_time AND n.start_time < s.end_time)
     )
     ORDER BY s.appointment_date ASC, s.start_time ASC, s.id ASC
     LIMIT 1`,
    [organizationId, JSON.stringify(normalizedTargets)]
  );

  return rows?.[0] || null;
}

function createWorkScheduleConflictError(conflict) {
  const specialistName = String(conflict?.specialist_name || "This specialist").trim() || "This specialist";
  const appointmentDate = normalizeDateYmd(conflict?.appointment_date);
  const appointmentStartTime = normalizeWorkScheduleTime(conflict?.appointment_start_time);
  const appointmentEndTime = normalizeWorkScheduleTime(conflict?.appointment_end_time);
  const appointmentTimeText = appointmentStartTime && appointmentEndTime
    ? ` ${appointmentStartTime}-${appointmentEndTime}`
    : "";
  const message = `Work schedule cannot be changed. ${specialistName} still has future lessons on ${appointmentDate}${appointmentTimeText}. Move those lessons first.`;
  const error = new Error(message);
  error.statusCode = 409;
  error.code = WORK_SCHEDULE_CONFLICT_CODE;
  error.payload = {
    code: WORK_SCHEDULE_CONFLICT_CODE,
    message,
    specialistId: String(conflict?.specialist_id || "").trim(),
    appointmentId: String(conflict?.appointment_id || "").trim(),
    appointmentDate,
    startTime: appointmentStartTime,
    endTime: appointmentEndTime
  };
  return error;
}

function createWorkScheduleBreakConflictError(conflict) {
  const breakStartTime = normalizeWorkScheduleTime(conflict?.break_start_time);
  const breakEndTime = normalizeWorkScheduleTime(conflict?.break_end_time);
  const breakTimeText = breakStartTime && breakEndTime
    ? ` ${breakStartTime}-${breakEndTime}`
    : "";
  const message = `Work schedule cannot be changed. Selected time conflicts with an existing break${breakTimeText}. Move or delete that break first.`;
  const error = new Error(message);
  error.statusCode = 409;
  error.code = WORK_SCHEDULE_BREAK_CONFLICT_CODE;
  error.payload = {
    code: WORK_SCHEDULE_BREAK_CONFLICT_CODE,
    message,
    specialistId: String(conflict?.specialist_id || "").trim(),
    dayOfWeek: Number.parseInt(String(conflict?.day_of_week ?? "").trim(), 10) || null,
    startTime: breakStartTime,
    endTime: breakEndTime
  };
  return error;
}

async function assertWorkScheduleTargetsHaveNoFutureAppointments({
  organizationId,
  targets = [],
  db = pool
}) {
  const conflict = await findFutureWorkScheduleConflict({
    organizationId,
    targets,
    db
  });
  if (conflict) {
    throw createWorkScheduleConflictError(conflict);
  }
}

async function assertWorkScheduleTargetsHaveNoBreaks({
  organizationId,
  targets = [],
  db = pool
}) {
  const normalizedTargets = Array.from(
    new Map(
      (Array.isArray(targets) ? targets : [])
        .map((item) => toWorkScheduleConflictTarget(item))
        .filter((item) => item?.isActive === true && item.startTime && item.endTime)
        .map((item) => {
          const key = [
            item.specialistId,
            item.ruleScope,
            item.dayOfWeek || "",
            item.workDate || "",
            item.startTime,
            item.endTime
          ].join("|");
          return [key, item];
        })
    ).values()
  );

  if (normalizedTargets.length === 0) {
    return;
  }

  const { rows } = await db.query(
    `WITH incoming AS (
       SELECT
         (item->>'specialistId')::integer AS specialist_id,
         NULLIF(TRIM(item->>'ruleScope'), '')::text AS rule_scope,
         NULLIF(TRIM(item->>'dayOfWeek'), '')::smallint AS day_of_week,
         NULLIF(TRIM(item->>'workDate'), '')::date AS work_date,
         NULLIF(TRIM(item->>'startTime'), '')::time AS start_time,
         NULLIF(TRIM(item->>'endTime'), '')::time AS end_time
       FROM jsonb_array_elements($2::jsonb) AS item
     ),
     normalized AS (
       SELECT DISTINCT
         i.specialist_id,
         i.rule_scope,
         i.day_of_week,
         i.work_date,
         i.start_time,
         i.end_time,
         CASE
           WHEN i.rule_scope = 'weekly' THEN i.day_of_week
           WHEN i.rule_scope = 'exception' THEN EXTRACT(ISODOW FROM i.work_date)::smallint
           ELSE NULL
         END AS effective_day_of_week
       FROM incoming i
       WHERE i.specialist_id IS NOT NULL
         AND i.start_time IS NOT NULL
         AND i.end_time IS NOT NULL
         AND i.start_time < i.end_time
         AND (
           (i.rule_scope = 'weekly' AND i.day_of_week BETWEEN 1 AND 7)
           OR
           (i.rule_scope = 'exception' AND i.work_date IS NOT NULL)
         )
     )
     SELECT
       ab.specialist_id,
       ab.day_of_week,
       TO_CHAR(ab.start_time, 'HH24:MI') AS break_start_time,
       TO_CHAR(ab.end_time, 'HH24:MI') AS break_end_time
      FROM normalized n
      JOIN appointment_breaks ab
        ON ab.organization_id = $1
       AND ab.specialist_id = n.specialist_id
       AND ab.is_active = TRUE
       AND ab.day_of_week = n.effective_day_of_week
       AND n.start_time < ab.end_time
       AND ab.start_time < n.end_time
      ORDER BY ab.day_of_week ASC, ab.start_time ASC, ab.id ASC
      LIMIT 1`,
    [organizationId, JSON.stringify(normalizedTargets)]
  );

  if (rows?.[0]) {
    throw createWorkScheduleBreakConflictError(rows[0]);
  }
}

async function assertWorkScheduleTargetsHaveNoVipRoutines({
  organizationId,
  userId,
  ruleScope,
  dayOfWeek,
  workDate,
  isActive
}) {
  if (isActive !== false || !userId) {
    return;
  }

  let effectiveDayOfWeek = null;
  if (ruleScope === "weekly" && dayOfWeek) {
    effectiveDayOfWeek = dayOfWeek;
  } else if (ruleScope === "exception" && workDate) {
    const { rows: dowRows } = await pool.query(
      `SELECT EXTRACT(ISODOW FROM $1::date)::smallint AS dow`,
      [workDate]
    );
    effectiveDayOfWeek = dowRows[0]?.dow || null;
  }

  if (!effectiveDayOfWeek) {
    return;
  }

  if (!(await hasVipClassDailyRoutineSchema())) {
    return;
  }

  const { rows } = await pool.query(
    `SELECT vdr.day_of_week,
       TO_CHAR(vdr.start_time, 'HH24:MI') AS routine_start_time,
       TO_CHAR(vdr.end_time, 'HH24:MI') AS routine_end_time
       FROM vip_class_daily_routines vdr
      WHERE vdr.organization_id = $1
        AND vdr.day_of_week = $2
        AND ${buildVipDailyRoutineSpecialistMatchSql({
          specialistParamRef: "$3"
        })}
      LIMIT 1`,
    [organizationId, effectiveDayOfWeek, userId]
  );

  if (rows[0]) {
    const routine = rows[0];
    const dayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const dayName = dayNames[effectiveDayOfWeek] || `day ${effectiveDayOfWeek}`;
    const timeText = routine.routine_start_time && routine.routine_end_time
      ? ` (${routine.routine_start_time}–${routine.routine_end_time})`
      : "";
    const error = new Error(
      `Work schedule cannot be changed. Specialist has a VIP Daily Routine on ${dayName}${timeText}. Update VIP routines first.`
    );
    error.statusCode = 409;
    error.code = WORK_SCHEDULE_CONFLICT_CODE;
    throw error;
  }
}

async function getAppointmentSettingsColumnFlags(tableName = APPOINTMENT_SETTINGS_TABLE) {
  const loadFlags = async () => {
    const columns = await getTableColumnNames({ tableName });
    return {
      hasAppointmentDuration: columns.has("appointment_duration_minutes"),
      hasAppointmentDurationOptions: columns.has("appointment_duration_options_minutes"),
      hasReminderChannels: columns.has("reminder_channels"),
      hasSlotSubDivisions: columns.has("slot_sub_divisions"),
      hasHistoryLockDays: columns.has("history_lock_days"),
      hasSlotCellHeightPx: columns.has("slot_cell_height_px")
    };
  };

  if (tableName !== APPOINTMENT_SETTINGS_TABLE) {
    return loadFlags();
  }

  if (!appointmentSettingsColumnFlagsPromise) {
    appointmentSettingsColumnFlagsPromise = loadFlags().catch((error) => {
      appointmentSettingsColumnFlagsPromise = null;
      throw error;
    });
  }

  return appointmentSettingsColumnFlagsPromise;
}

function toScheduleItem(row) {
  const itemType = String(row?.item_type || "").trim().toLowerCase();
  if (itemType === "daily-routine") {
    const durationFromRow = Number.parseInt(String(row?.duration_minutes ?? "").trim(), 10);
    const durationMinutes = Number.isInteger(durationFromRow) && durationFromRow > 0
      ? durationFromRow
      : getDurationMinutesFromAppointmentTimes(row?.start_time, row?.end_time, { allowSeconds: true });
    return {
      id: `routine-${String(row?.id || "").trim()}`,
      itemType: "daily-routine",
      organizationId: String(row?.organization_id || "").trim(),
      specialistId: String(row?.specialist_id || "").trim(),
      specialistName: String(row?.specialist_name || "").trim(),
      specialistPosition: String(row?.specialist_position || "").trim(),
      clientId: "",
      appointmentDate: normalizeDateYmd(row?.appointment_date),
      startTime: normalizeTimeHm(row?.start_time),
      endTime: normalizeTimeHm(row?.end_time),
      durationMinutes: String(durationMinutes || ""),
      serviceName: String(row?.service_name || "").trim(),
      status: "routine",
      note: String(row?.note || "").trim(),
      mandatoryExercises: String(row?.mandatory_exercises || "").trim(),
      activityType: String(row?.activity_type || "").trim().toLowerCase(),
      classId: String(row?.class_assignment_id || "").trim(),
      className: String(row?.class_name || "").trim(),
      repeatType: "weekly",
      repeatGroupKey: "",
      repeatUntilDate: "",
      repeatDays: [],
      repeatAnchorDate: "",
      isRepeatRoot: false,
      isAutoRollingRepeat: false,
      isRecurring: true,
      parentResponseStatus: "",
      clientFirstName: "",
      clientLastName: "",
      clientMiddleName: "",
      isVip: true,
      createdAt: row?.created_at || null,
      updatedAt: row?.updated_at || null
    };
  }
  const status = String(row?.status || "").trim().toLowerCase();
  const repeatType = normalizeRepeatType(row?.repeat_type);
  const repeatGroupKey = normalizeUuidString(row?.repeat_group_key);
  const durationFromRow = Number.parseInt(String(row?.duration_minutes ?? "").trim(), 10);
  const durationMinutes = Number.isInteger(durationFromRow) && durationFromRow > 0
    ? durationFromRow
    : getDurationMinutesFromAppointmentTimes(row?.start_time, row?.end_time, { allowSeconds: true });
  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    specialistId: String(row?.specialist_id || "").trim(),
    specialistName: String(row?.specialist_name || "").trim(),
    specialistPosition: String(row?.specialist_position || "").trim(),
    clientId: String(row?.client_id || "").trim(),
    appointmentDate: normalizeDateYmd(row?.appointment_date),
    startTime: normalizeTimeHm(row?.start_time),
    endTime: normalizeTimeHm(row?.end_time),
    durationMinutes: String(durationMinutes || ""),
    serviceId: String(row?.service_id || "").trim(),
    serviceName: String(row?.service_name || "").trim(),
    servicePriceUzs: Number.parseInt(String(row?.service_price_uzs ?? 0), 10) || 0,
    status,
    note: String(row?.note || "").trim(),
    repeatType,
    repeatGroupKey,
    repeatUntilDate: normalizeDateYmd(row?.repeat_until_date),
    repeatDays: mapRepeatDayNumsToKeys(row?.repeat_days),
    repeatAnchorDate: normalizeDateYmd(row?.repeat_anchor_date),
    isRepeatRoot: Boolean(row?.is_repeat_root),
    isAutoRollingRepeat: Boolean(row?.is_auto_rolling_repeat),
    isRecurring: repeatType === "weekly" && Boolean(repeatGroupKey),
    parentResponseStatus: String(row?.parent_response_status || "").trim().toLowerCase(),
    clientFirstName: String(row?.first_name || "").trim(),
    clientLastName: String(row?.last_name || "").trim(),
    clientMiddleName: String(row?.middle_name || "").trim(),
    isVip: Boolean(row?.is_vip),
    financeTicketId: String(row?.finance_ticket_id || "").trim(),
    financeTicketStatus: String(row?.finance_ticket_status || "").trim().toLowerCase(),
    financeTicketTotalUzs: Number.parseInt(String(row?.finance_ticket_total_uzs ?? 0), 10) || 0,
    financeTicketPaidAmountUzs: Number.parseInt(String(row?.finance_ticket_paid_amount_uzs ?? 0), 10) || 0,
    financeTicketRemainingAmountUzs: Number.parseInt(String(row?.finance_ticket_remaining_amount_uzs ?? 0), 10) || 0,
    financeTicketPaymentState: String(row?.finance_ticket_payment_state || "").trim().toLowerCase(),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

async function listVipDailyRoutineScheduleItems({
  organizationId,
  specialistId,
  clientId = null,
  dateFrom,
  dateTo,
  db = pool
}) {
  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const normalizedClientId = Number.parseInt(String(clientId || "").trim(), 10) || 0;
  if (!normalizedSpecialistId && !normalizedClientId) {
    return [];
  }

  if (!(await hasVipClassDailyRoutineSchema())) {
    return [];
  }

  const params = [organizationId, dateFrom, dateTo];
  const whereParts = ["vdr.organization_id = $1"];

  if (normalizedSpecialistId > 0) {
    params.push(normalizedSpecialistId);
    whereParts.push(`vdr.specialist_user_id = $${params.length}`);
  }

  if (normalizedClientId > 0) {
    params.push(normalizedClientId);
    whereParts.push(
      `EXISTS (
         SELECT 1
           FROM vip_client_tutor_assignments vta
          WHERE vta.organization_id = vdr.organization_id
            AND vta.class_assignment_id = vdr.class_assignment_id
            AND vta.client_id = $${params.length}
       )`
    );
  }

  const runRoutineQuery = async ({ includeClassMetadata = true } = {}) => {
    const classNameSelect = includeClassMetadata
      ? "COALESCE(NULLIF(TRIM(vcta.class_name), ''), CONCAT('Class #', vdr.class_assignment_id::text)) AS class_name,"
      : "CONCAT('Class #', vdr.class_assignment_id::text) AS class_name,";
    const classJoinSql = includeClassMetadata
      ? `LEFT JOIN vip_class_teacher_assignments vcta
        ON vcta.organization_id = vdr.organization_id
       AND vcta.id = vdr.class_assignment_id`
      : "";

    const { rows } = await (db || pool).query(
      `WITH day_series AS (
         SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS routine_date
       )
       SELECT
         vdr.id,
         vdr.organization_id,
         vdr.specialist_user_id AS specialist_id,
         ds.routine_date AS appointment_date,
         TO_CHAR(vdr.start_time, 'HH24:MI') AS start_time,
         TO_CHAR(vdr.end_time, 'HH24:MI') AS end_time,
         GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (vdr.end_time - vdr.start_time)) / 60))::int AS duration_minutes,
         CASE vdr.activity_type
           WHEN 'lesson' THEN 'Group lesson'
           WHEN 'breakfast' THEN 'Breakfast'
           WHEN 'lunch' THEN 'Lunch'
           WHEN 'afternoon-snack' THEN 'Afternoon snack'
           WHEN 'sleep' THEN 'Sleep time'
           ELSE 'Other'
         END AS service_name,
         'routine'::text AS status,
         vdr.note,
         vdr.mandatory_exercises,
         vdr.activity_type,
         'daily-routine'::text AS item_type,
         vdr.class_assignment_id::text AS class_assignment_id,
         ${classNameSelect}
         COALESCE(
           NULLIF(TRIM(specialist_u.full_name), ''),
           NULLIF(TRIM(specialist_u.username), ''),
           CONCAT('User #', vdr.specialist_user_id::text)
         ) AS specialist_name,
         COALESCE(NULLIF(TRIM(specialist_p.label), ''), NULLIF(TRIM(specialist_r.label), ''), 'Specialist') AS specialist_position,
         TRUE AS is_vip,
         vdr.created_at,
         vdr.updated_at
        FROM vip_class_daily_routines vdr
        ${classJoinSql}
        JOIN day_series ds
          ON EXTRACT(ISODOW FROM ds.routine_date)::smallint = vdr.day_of_week
        LEFT JOIN users specialist_u
          ON specialist_u.id = vdr.specialist_user_id
         AND specialist_u.organization_id = vdr.organization_id
        LEFT JOIN role_options specialist_r
          ON specialist_r.id = specialist_u.role_id
        LEFT JOIN position_options specialist_p
          ON specialist_p.id = specialist_u.position_id
       WHERE ${whereParts.join("\n       AND ")}
       ORDER BY
         ds.routine_date ASC,
         vdr.start_time ASC,
         vdr.id ASC`,
      params
    );

    return rows || [];
  };

  try {
    return await runRoutineQuery({ includeClassMetadata: true });
  } catch (error) {
    const errorMessage = String(error?.message || "").trim().toLowerCase();
    const missingClientScopeTable = (
      error?.code === "42P01"
      && errorMessage.includes("vip_client_tutor_assignments")
    );
    if (missingClientScopeTable) {
      return [];
    }

    const missingClassMetadata = (
      (error?.code === "42P01" && errorMessage.includes("vip_class_teacher_assignments"))
      || (error?.code === "42703" && errorMessage.includes("class_name"))
    );
    if (missingClassMetadata) {
      return runRoutineQuery({ includeClassMetadata: false });
    }
    throw error;
  }
}

function isMissingVipAssignmentScopeSchemaError(error) {
  const errorCode = String(error?.code || "").trim();
  const errorMessage = String(error?.message || "").trim().toLowerCase();

  if (errorCode === "42P01") {
    return (
      errorMessage.includes("vip_client_tutor_assignments")
      || errorMessage.includes("vip_class_teacher_assignments")
    );
  }

  if (errorCode === "42703") {
    return (
      errorMessage.includes("class_assignment_id")
      || errorMessage.includes("teacher_user_id")
      || errorMessage.includes("tutor_user_id")
    );
  }

  return false;
}

export async function withAppointmentTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getActiveServiceSnapshotById({ organizationId, serviceId, db = pool }) {
  const normalizedOrganizationId = Number.parseInt(String(organizationId || ""), 10);
  const normalizedServiceId = Number.parseInt(String(serviceId || ""), 10);
  if (
    !Number.isInteger(normalizedOrganizationId)
    || normalizedOrganizationId <= 0
    || !Number.isInteger(normalizedServiceId)
    || normalizedServiceId <= 0
  ) {
    return null;
  }

  const { rows } = await db.query(
    `SELECT id,
            name,
            price_uzs
       FROM service_catalog
      WHERE organization_id = $1
        AND id = $2
        AND is_active = TRUE
      LIMIT 1`,
    [normalizedOrganizationId, normalizedServiceId]
  );
  const row = rows[0] || null;
  if (!row) {
    return null;
  }

  return {
    serviceId: Number.parseInt(String(row.id || ""), 10),
    serviceName: String(row.name || "").trim(),
    servicePriceUzs: Number.parseInt(String(row.price_uzs ?? 0), 10) || 0
  };
}

export async function getAppointmentSpecialistsByOrganization(organizationId) {
  const cacheKey = `specialists|org:${organizationId}`;
  const cached = appointmentReferenceCache.get(cacheKey);
  if (cached) {
    return cloneAppointmentSpecialistItems(cached);
  }

  const { rows } = await pool.query(
    `SELECT
       u.id::text AS id,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS name,
       COALESCE(NULLIF(TRIM(p.label), ''), NULLIF(TRIM(r.label), ''), 'Specialist') AS role
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     JOIN role_options r ON r.id = u.role_id
     LEFT JOIN position_options p ON p.id = u.position_id
     WHERE u.organization_id = $1
       AND o.is_active = TRUE
       AND r.is_active = TRUE
       AND (
         LOWER(TRIM(r.label)) LIKE '%specialist%'
         OR LOWER(TRIM(r.label)) LIKE '%spetsialist%'
         OR LOWER(TRIM(r.label)) LIKE '%mutaxassis%'
         OR LOWER(TRIM(r.label)) LIKE '%специалист%'
         OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%specialist%'
         OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%spetsialist%'
         OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%mutaxassis%'
         OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%специалист%'
       )
     ORDER BY
      COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), u.id::text) ASC`,
    [organizationId]
  );

  const items = rows || [];
  appointmentReferenceCache.set(cacheKey, cloneAppointmentSpecialistItems(items));
  return items;
}

export async function listAppointmentWorkScheduleStaffByOrganization(organizationId) {
  const cacheKey = `work-schedule-staff|org:${organizationId}`;
  const cached = appointmentReferenceCache.get(cacheKey);
  if (cached) {
    return cloneAppointmentStaffItems(cached);
  }

  const { rows } = await pool.query(
    `SELECT
       u.id::text AS id,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS name,
       COALESCE(NULLIF(TRIM(u.username), ''), CONCAT('user_', u.id::text)) AS username
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
     WHERE u.organization_id = $1
       AND o.is_active = TRUE
     ORDER BY
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), u.id::text) ASC,
       u.id ASC`,
    [organizationId]
  );

  const items = (rows || []).map((row) => ({
    id: String(row?.id || "").trim(),
    name: String(row?.name || "").trim() || `User #${String(row?.id || "").trim()}`,
    username: String(row?.username || "").trim()
  }));
  appointmentReferenceCache.set(cacheKey, cloneAppointmentStaffItems(items));
  return items;
}

export async function listAppointmentWorkSchedule({
  organizationId,
  userId = null,
  ruleScope = null
}) {
  const normalizedUserId = Number.parseInt(String(userId || "").trim(), 10) || null;
  const normalizedScope = normalizeWorkScheduleScope(ruleScope) || null;

  const { rows } = await pool.query(
    `SELECT
       awh.id,
       awh.organization_id,
       awh.user_id,
       awh.rule_scope,
       awh.day_of_week,
       awh.work_date,
       awh.is_active,
       awh.start_time,
       awh.end_time,
       awh.reason,
       awh.created_by,
       awh.updated_by,
       awh.created_at,
       awh.updated_at,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), '') AS user_name,
       COALESCE(NULLIF(TRIM(u.username), ''), '') AS user_username
      FROM appointment_working_hours awh
      LEFT JOIN users u
        ON u.id = awh.user_id
       AND u.organization_id = awh.organization_id
     WHERE awh.organization_id = $1
       AND ($2::integer IS NULL OR awh.user_id = $2::integer)
       AND ($3::text IS NULL OR awh.rule_scope = $3::text)
     ORDER BY
       CASE awh.rule_scope WHEN 'weekly' THEN 0 ELSE 1 END ASC,
       LOWER(TRIM(COALESCE(NULLIF(u.username, ''), NULLIF(u.full_name, ''), COALESCE(awh.user_id::text, '')))) ASC,
       awh.day_of_week ASC NULLS LAST,
       awh.work_date ASC NULLS LAST,
       awh.id ASC`,
    [organizationId, normalizedUserId, normalizedScope]
  );

  return (rows || []).map(mapWorkScheduleItem);
}

export async function replaceAppointmentDefaultWeeklyWorkSchedule({
  organizationId,
  actorUserId = null,
  items = []
}) {
  const byDay = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const dayOfWeek = normalizeWorkScheduleDayOfWeek(item?.dayOfWeek ?? item?.day_of_week);
    if (!dayOfWeek) {
      return;
    }

    const normalizedIsActive = item?.isActive === true;
    const startTime = normalizeWorkScheduleTime(item?.startTime ?? item?.start_time);
    const endTime = normalizeWorkScheduleTime(item?.endTime ?? item?.end_time);
    const hasValidTimeRange = Boolean(startTime && endTime && startTime < endTime);
    byDay.set(dayOfWeek, {
      isActive: normalizedIsActive && hasValidTimeRange,
      startTime: normalizedIsActive && hasValidTimeRange ? startTime : null,
      endTime: normalizedIsActive && hasValidTimeRange ? endTime : null,
      reason: normalizeWorkScheduleReason(item?.reason)
    });
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await assertDefaultWeeklyWorkScheduleSupportsOrganizationChildren({
      organizationId,
      items: Array.from(byDay.entries()).map(([dayOfWeek, payload]) => ({
        dayOfWeek,
        isActive: payload.isActive,
        startTime: payload.startTime,
        endTime: payload.endTime
      })),
      db: client
    });

    for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
      const payload = byDay.get(dayOfWeek) || {
        isActive: false,
        startTime: null,
        endTime: null,
        reason: ""
      };

      await client.query(
        `INSERT INTO appointment_working_hours (
           organization_id,
           user_id,
           rule_scope,
           day_of_week,
           work_date,
           is_active,
           start_time,
           end_time,
           reason,
           created_by,
           updated_by
         )
         VALUES (
           $1,
           NULL,
           'weekly',
           $2,
           NULL,
           $3,
           $4::time,
           $5::time,
           NULLIF($6::text, ''),
           $7::integer,
           $7::integer
         )
         ON CONFLICT (organization_id, day_of_week)
           WHERE user_id IS NULL AND rule_scope = 'weekly'
         DO UPDATE SET
           is_active = EXCLUDED.is_active,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           reason = EXCLUDED.reason,
           updated_by = EXCLUDED.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
        [
          organizationId,
          dayOfWeek,
          payload.isActive,
          payload.startTime,
          payload.endTime,
          payload.reason,
          actorUserId || null
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const { rows } = await pool.query(
    `SELECT
       awh.id,
       awh.organization_id,
       awh.user_id,
       awh.rule_scope,
       awh.day_of_week,
       awh.work_date,
       awh.is_active,
       awh.start_time,
       awh.end_time,
       awh.reason,
       awh.created_by,
       awh.updated_by,
       awh.created_at,
       awh.updated_at,
       ''::text AS user_name,
       ''::text AS user_username
      FROM appointment_working_hours awh
     WHERE awh.organization_id = $1
       AND awh.rule_scope = 'weekly'
       AND awh.user_id IS NULL
     ORDER BY awh.day_of_week ASC, awh.id ASC`,
    [organizationId]
  );

  return (rows || []).map(mapWorkScheduleItem);
}

export async function createAppointmentWorkScheduleEntry({
  organizationId,
  actorUserId = null,
  userId = null,
  ruleScope,
  dayOfWeek = null,
  workDate = null,
  isActive = false,
  startTime = null,
  endTime = null,
  reason = ""
}) {
  const normalizedScope = normalizeWorkScheduleScope(ruleScope);
  const normalizedUserId = Number.parseInt(String(userId || "").trim(), 10) || null;
  const normalizedDayOfWeek = normalizeWorkScheduleDayOfWeek(dayOfWeek);
  const normalizedWorkDate = normalizeWorkScheduleDate(workDate);
  const normalizedIsActive = isActive === true;
  const normalizedStartTime = normalizeWorkScheduleTime(startTime);
  const normalizedEndTime = normalizeWorkScheduleTime(endTime);
  const hasValidTimeRange = Boolean(normalizedStartTime && normalizedEndTime && normalizedStartTime < normalizedEndTime);

  const finalStartTime = normalizedIsActive && hasValidTimeRange ? normalizedStartTime : null;
  const finalEndTime = normalizedIsActive && hasValidTimeRange ? normalizedEndTime : null;
  const finalReason = normalizeWorkScheduleReason(reason);

  const finalDayOfWeek = normalizedScope === "weekly" ? (normalizedDayOfWeek || null) : null;
  const finalWorkDate = normalizedScope === "exception" ? (normalizedWorkDate || null) : null;

  await assertSpecialistWorkScheduleWithinOrganizationWeeklyHours({
    organizationId,
    userId: normalizedUserId,
    ruleScope: normalizedScope,
    dayOfWeek: finalDayOfWeek,
    workDate: finalWorkDate,
    isActive: normalizedIsActive,
    startTime: finalStartTime,
    endTime: finalEndTime
  });

  await assertWorkScheduleTargetsHaveNoFutureAppointments({
    organizationId,
    targets: [{
      userId: normalizedUserId,
      ruleScope: normalizedScope,
      dayOfWeek: finalDayOfWeek,
      workDate: finalWorkDate,
      isActive: normalizedIsActive,
      startTime: finalStartTime,
      endTime: finalEndTime
    }]
  });

  await assertWorkScheduleTargetsHaveNoBreaks({
    organizationId,
    targets: [{
      userId: normalizedUserId,
      ruleScope: normalizedScope,
      dayOfWeek: finalDayOfWeek,
      workDate: finalWorkDate,
      isActive: normalizedIsActive,
      startTime: finalStartTime,
      endTime: finalEndTime
    }]
  });

  await assertWorkScheduleTargetsHaveNoVipRoutines({
    organizationId,
    userId: normalizedUserId,
    ruleScope: normalizedScope,
    dayOfWeek: finalDayOfWeek,
    workDate: finalWorkDate,
    isActive: normalizedIsActive
  });

  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO appointment_working_hours (
         organization_id,
         user_id,
         rule_scope,
         day_of_week,
         work_date,
         is_active,
         start_time,
         end_time,
         reason,
         created_by,
         updated_by
       )
       VALUES (
         $1,
         $2::integer,
         $3::text,
         $4::smallint,
         $5::date,
         $6::boolean,
         $7::time,
         $8::time,
         NULLIF($9::text, ''),
         $10::integer,
         $10::integer
       )
       RETURNING *
     )
     SELECT
       i.*,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), '') AS user_name,
       COALESCE(NULLIF(TRIM(u.username), ''), '') AS user_username
      FROM inserted i
      LEFT JOIN users u
        ON u.id = i.user_id
       AND u.organization_id = i.organization_id`,
    [
      organizationId,
      normalizedUserId,
      normalizedScope,
      finalDayOfWeek,
      finalWorkDate,
      normalizedIsActive,
      finalStartTime,
      finalEndTime,
      finalReason,
      actorUserId || null
    ]
  );

  return rows[0] ? mapWorkScheduleItem(rows[0]) : null;
}

export async function updateAppointmentWorkScheduleEntryById({
  id,
  organizationId,
  actorUserId = null,
  userId = null,
  ruleScope,
  dayOfWeek = null,
  workDate = null,
  isActive = false,
  startTime = null,
  endTime = null,
  reason = ""
}) {
  const normalizedScope = normalizeWorkScheduleScope(ruleScope);
  const normalizedUserId = Number.parseInt(String(userId || "").trim(), 10) || null;
  const normalizedDayOfWeek = normalizeWorkScheduleDayOfWeek(dayOfWeek);
  const normalizedWorkDate = normalizeWorkScheduleDate(workDate);
  const normalizedIsActive = isActive === true;
  const normalizedStartTime = normalizeWorkScheduleTime(startTime);
  const normalizedEndTime = normalizeWorkScheduleTime(endTime);
  const hasValidTimeRange = Boolean(normalizedStartTime && normalizedEndTime && normalizedStartTime < normalizedEndTime);

  const finalStartTime = normalizedIsActive && hasValidTimeRange ? normalizedStartTime : null;
  const finalEndTime = normalizedIsActive && hasValidTimeRange ? normalizedEndTime : null;
  const finalReason = normalizeWorkScheduleReason(reason);

  const finalDayOfWeek = normalizedScope === "weekly" ? (normalizedDayOfWeek || null) : null;
  const finalWorkDate = normalizedScope === "exception" ? (normalizedWorkDate || null) : null;

  const existingEntry = await getAppointmentWorkScheduleEntryById({
    id,
    organizationId
  });
  if (!existingEntry) {
    return null;
  }

  if (hasWorkScheduleAvailabilityChange(existingEntry, {
    userId: normalizedUserId,
    ruleScope: normalizedScope,
    dayOfWeek: finalDayOfWeek,
    workDate: finalWorkDate,
    isActive: normalizedIsActive,
    startTime: finalStartTime,
    endTime: finalEndTime
  })) {
    await assertSpecialistWorkScheduleWithinOrganizationWeeklyHours({
      organizationId,
      userId: normalizedUserId,
      ruleScope: normalizedScope,
      dayOfWeek: finalDayOfWeek,
      workDate: finalWorkDate,
      isActive: normalizedIsActive,
      startTime: finalStartTime,
      endTime: finalEndTime
    });
    await assertWorkScheduleTargetsHaveNoFutureAppointments({
      organizationId,
      targets: [{
        userId: normalizedUserId,
        ruleScope: normalizedScope,
        dayOfWeek: finalDayOfWeek,
        workDate: finalWorkDate,
        isActive: normalizedIsActive,
        startTime: finalStartTime,
        endTime: finalEndTime
      }]
    });

    await assertWorkScheduleTargetsHaveNoBreaks({
      organizationId,
      targets: [{
        userId: normalizedUserId,
        ruleScope: normalizedScope,
        dayOfWeek: finalDayOfWeek,
        workDate: finalWorkDate,
        isActive: normalizedIsActive,
        startTime: finalStartTime,
        endTime: finalEndTime
      }]
    });

    await assertWorkScheduleTargetsHaveNoVipRoutines({
      organizationId,
      userId: normalizedUserId,
      ruleScope: normalizedScope,
      dayOfWeek: finalDayOfWeek,
      workDate: finalWorkDate,
      isActive: normalizedIsActive
    });
  }

  const { rows } = await pool.query(
    `WITH updated AS (
       UPDATE appointment_working_hours awh
          SET user_id = $1::integer,
              rule_scope = $2::text,
              day_of_week = $3::smallint,
              work_date = $4::date,
              is_active = $5::boolean,
              start_time = $6::time,
              end_time = $7::time,
              reason = NULLIF($8::text, ''),
              updated_by = $9::integer,
              updated_at = CURRENT_TIMESTAMP
        WHERE awh.id = $10
          AND awh.organization_id = $11
       RETURNING awh.*
     )
     SELECT
       u.*,
       COALESCE(NULLIF(TRIM(user_ref.full_name), ''), NULLIF(TRIM(user_ref.username), ''), '') AS user_name,
       COALESCE(NULLIF(TRIM(user_ref.username), ''), '') AS user_username
      FROM updated u
      LEFT JOIN users user_ref
        ON user_ref.id = u.user_id
       AND user_ref.organization_id = u.organization_id`,
    [
      normalizedUserId,
      normalizedScope,
      finalDayOfWeek,
      finalWorkDate,
      normalizedIsActive,
      finalStartTime,
      finalEndTime,
      finalReason,
      actorUserId || null,
      id,
      organizationId
    ]
  );

  return rows[0] ? mapWorkScheduleItem(rows[0]) : null;
}

export async function deleteAppointmentWorkScheduleEntryById({
  id,
  organizationId
}) {
  const existingEntry = await getAppointmentWorkScheduleEntryById({
    id,
    organizationId
  });
  if (!existingEntry) {
    return { rowCount: 0 };
  }

  return pool.query(
    `DELETE FROM appointment_working_hours
      WHERE id = $1
        AND organization_id = $2`,
    [id, organizationId]
  );
}

function toAbsenceTimeMinutes(value) {
  const normalized = normalizeTimeHm(value);
  if (!normalized || !/^\d{2}:\d{2}$/.test(normalized)) {
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

function buildAppointmentSpecialistAbsenceRangesByDate(items) {
  const rangesByDate = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const absenceDate = normalizeWorkScheduleDate(item?.absenceDate || item?.work_date || item?.workDate);
    if (!absenceDate) {
      return;
    }
    const startTime = normalizeTimeHm(item?.startTime || item?.start_time);
    const endTime = normalizeTimeHm(item?.endTime || item?.end_time);
    const startMinutes = toAbsenceTimeMinutes(startTime);
    const endMinutes = toAbsenceTimeMinutes(endTime);
    const list = rangesByDate.get(absenceDate) || [];
    list.push({
      startTime: startMinutes !== null && endMinutes !== null && startMinutes < endMinutes ? startTime : "",
      endTime: startMinutes !== null && endMinutes !== null && startMinutes < endMinutes ? endTime : "",
      startMinutes,
      endMinutes,
      reason: String(item?.reason || "").trim()
    });
    rangesByDate.set(absenceDate, list);
  });
  return rangesByDate;
}

function hasAppointmentSpecialistAbsenceRangeConflict({
  absenceRangesByDate,
  appointmentDate,
  startTime,
  endTime
}) {
  const normalizedAppointmentDate = normalizeWorkScheduleDate(appointmentDate);
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
  const conflict = ranges.find((range) => {
    if (range.startMinutes === null || range.endMinutes === null || range.startMinutes >= range.endMinutes) {
      return true;
    }
    return appointmentStartMinutes < range.endMinutes && range.startMinutes < appointmentEndMinutes;
  });
  return conflict || null;
}

export async function listAppointmentSpecialistAbsences({
  organizationId,
  specialistId = null,
  dateFrom = null,
  dateTo = null,
  db = pool
}) {
  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const normalizedDateFrom = normalizeWorkScheduleDate(dateFrom) || null;
  const normalizedDateTo = normalizeWorkScheduleDate(dateTo) || null;

  const { rows } = await db.query(
    `SELECT
       awh.id,
       awh.organization_id,
       awh.user_id,
       awh.work_date,
       awh.start_time,
       awh.end_time,
       awh.reason,
       awh.created_at,
       awh.updated_at,
       COALESCE(
         NULLIF(TRIM(u.full_name), ''),
         NULLIF(TRIM(u.username), ''),
         CONCAT('Specialist #', awh.user_id::text)
       ) AS specialist_name,
       COALESCE(NULLIF(TRIM(u.username), ''), '') AS specialist_username
      FROM appointment_working_hours awh
      LEFT JOIN users u
        ON u.id = awh.user_id
       AND u.organization_id = awh.organization_id
     WHERE awh.organization_id = $1
       AND ($2::integer IS NULL OR awh.user_id = $2::integer)
       AND awh.rule_scope = 'exception'
       AND awh.is_active = FALSE
       AND ($3::date IS NULL OR awh.work_date >= $3::date)
       AND ($4::date IS NULL OR awh.work_date <= $4::date)
     ORDER BY awh.work_date ASC, awh.id ASC`,
    [organizationId, normalizedSpecialistId || null, normalizedDateFrom, normalizedDateTo]
  );

  return (rows || []).map(mapAppointmentSpecialistAbsenceItem);
}

export async function hasAppointmentSpecialistAbsenceConflict({
  organizationId,
  specialistId,
  appointmentDate,
  startTime = null,
  endTime = null,
  db = pool
}) {
  const normalizedAppointmentDate = normalizeWorkScheduleDate(appointmentDate);
  if (!normalizedAppointmentDate) {
    return false;
  }

  const absenceItems = await listAppointmentSpecialistAbsences({
    organizationId,
    specialistId,
    dateFrom: normalizedAppointmentDate,
    dateTo: normalizedAppointmentDate,
    db
  });
  const conflict = hasAppointmentSpecialistAbsenceRangeConflict({
    absenceRangesByDate: buildAppointmentSpecialistAbsenceRangesByDate(absenceItems),
    appointmentDate: normalizedAppointmentDate,
    startTime,
    endTime
  });
  return Boolean(conflict);
}

async function cancelAppointmentSchedulesForSpecialistAbsence({
  organizationId,
  actorUserId = null,
  specialistId,
  absenceDate,
  startTime = null,
  endTime = null,
  db = pool
}) {
  await ensureAppointmentStatusHistorySchema();

  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const normalizedAbsenceDate = normalizeWorkScheduleDate(absenceDate);
  const normalizedStartTime = normalizeWorkScheduleTime(startTime) || null;
  const normalizedEndTime = normalizeWorkScheduleTime(endTime) || null;
  if (!normalizedSpecialistId || !normalizedAbsenceDate) {
    return [];
  }

  const changedFieldsSql = buildScheduleChangedFieldsSql("u");
  const previousSnapshotSql = buildScheduleSnapshotSql("u", "prev_");
  const nextSnapshotSql = buildScheduleSnapshotSql("u");

  const { rows } = await db.query(
    `WITH target AS (
       SELECT
         s.id,
         s.organization_id,
         s.specialist_id,
         s.client_id,
         s.appointment_date,
         s.start_time,
         s.end_time,
         s.duration_minutes,
         s.service_id,
         s.service_name,
         s.service_price_uzs,
         s.status,
         s.note,
         s.repeat_group_key,
         s.repeat_type,
         s.repeat_until_date,
         s.repeat_days,
         s.repeat_anchor_date,
         s.is_repeat_root,
         s.is_auto_rolling_repeat
       FROM appointment_schedules s
       WHERE s.organization_id = $1
         AND s.specialist_id = $2
         AND s.appointment_date = $3::date
         AND (
           $4::time IS NULL
           OR $5::time IS NULL
           OR (s.start_time < $5::time AND $4::time < s.end_time)
          )
           AND s.status = 'pending'
          AND NOT EXISTS (
            SELECT 1
              FROM finance_tickets ft
             WHERE ft.organization_id = s.organization_id
               AND ft.appointment_schedule_id = s.id
               AND ft.status <> 'voided'
          )
          AND (
            s.appointment_date > TIMEZONE('Asia/Tashkent', NOW())::date
            OR (
             s.appointment_date = TIMEZONE('Asia/Tashkent', NOW())::date
             AND s.end_time > TIMEZONE('Asia/Tashkent', NOW())::time
           )
         )
     ),
     updated AS (
       UPDATE appointment_schedules s
          SET status = 'cancelled',
              updated_by = $6::integer,
              updated_at = CURRENT_TIMESTAMP
         FROM target t
        WHERE s.organization_id = t.organization_id
          AND s.id = t.id
       RETURNING
         s.*,
         t.specialist_id AS prev_specialist_id,
         t.client_id AS prev_client_id,
         t.appointment_date AS prev_appointment_date,
         t.start_time AS prev_start_time,
         t.end_time AS prev_end_time,
         t.duration_minutes AS prev_duration_minutes,
         t.service_id AS prev_service_id,
         t.service_name AS prev_service_name,
         t.service_price_uzs AS prev_service_price_uzs,
         t.status AS prev_status,
         t.note AS prev_note,
         t.repeat_group_key AS prev_repeat_group_key,
         t.repeat_type AS prev_repeat_type,
         t.repeat_until_date AS prev_repeat_until_date,
         t.repeat_days AS prev_repeat_days,
         t.repeat_anchor_date AS prev_repeat_anchor_date,
         t.is_repeat_root AS prev_is_repeat_root
     ),
     history_rows AS (
       SELECT
         u.organization_id,
         u.id AS appointment_schedule_id,
         'status-changed' AS event_type,
         u.prev_status AS previous_status,
         u.status AS next_status,
         ${changedFieldsSql} AS changed_fields,
         jsonb_build_object(
           'before', ${previousSnapshotSql},
           'after', ${nextSnapshotSql},
           'reason', 'specialist_absence'
         ) AS details,
         $6::integer AS changed_by
       FROM updated u
     ),
     history_inserted AS (
       INSERT INTO ${APPOINTMENT_STATUS_HISTORY_TABLE} (
         organization_id,
         appointment_schedule_id,
         event_type,
         previous_status,
         next_status,
         changed_fields,
         details,
         changed_by
       )
       SELECT
         h.organization_id,
         h.appointment_schedule_id,
         h.event_type,
         h.previous_status,
         h.next_status,
         h.changed_fields,
         h.details,
         h.changed_by
       FROM history_rows h
       WHERE CARDINALITY(h.changed_fields) > 0
     )
     SELECT
       u.id,
       u.organization_id,
       u.specialist_id,
       u.client_id,
       u.appointment_date,
       u.start_time,
       u.end_time,
       u.duration_minutes,
       u.service_id,
       u.service_name,
       u.service_price_uzs,
       u.status,
       u.note,
       u.repeat_group_key,
       u.repeat_type,
       u.repeat_until_date,
       u.repeat_days,
       u.repeat_anchor_date,
       u.is_repeat_root,
       u.is_auto_rolling_repeat,
       u.created_at,
       u.updated_at,
       c.first_name,
       c.last_name,
       c.middle_name
      FROM updated u
      JOIN clients c
        ON c.id = u.client_id
       AND c.organization_id = u.organization_id
      ORDER BY u.appointment_date ASC, u.start_time ASC, u.id ASC`,
    [
      organizationId,
      normalizedSpecialistId,
      normalizedAbsenceDate,
      normalizedStartTime,
      normalizedEndTime,
      actorUserId || null
    ]
  );

  clearAppointmentPlannerReportFilterCaches();
  return (rows || []).map(toScheduleItem);
}

export async function cancelAppointmentSchedulesForSpecialistRange({
  organizationId,
  actorUserId = null,
  specialistId,
  dateFrom,
  dateTo,
  startTime = null,
  endTime = null,
  note = "",
  db = pool
}) {
  await ensureAppointmentStatusHistorySchema();

  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const normalizedDateFrom = normalizeWorkScheduleDate(dateFrom);
  const normalizedDateTo = normalizeWorkScheduleDate(dateTo);
  const normalizedStartTime = normalizeWorkScheduleTime(startTime) || null;
  const normalizedEndTime = normalizeWorkScheduleTime(endTime) || null;
  const normalizedNote = String(note || "").trim().slice(0, 255);
  if (!normalizedSpecialistId || !normalizedDateFrom || !normalizedDateTo || normalizedDateFrom > normalizedDateTo) {
    return [];
  }

  const changedFieldsSql = buildScheduleChangedFieldsSql("u");
  const previousSnapshotSql = buildScheduleSnapshotSql("u", "prev_");
  const nextSnapshotSql = buildScheduleSnapshotSql("u");

  const { rows } = await db.query(
    `WITH target AS (
       SELECT
         s.id,
         s.organization_id,
         s.specialist_id,
         s.client_id,
         s.appointment_date,
         s.start_time,
         s.end_time,
         s.duration_minutes,
         s.service_id,
         s.service_name,
         s.service_price_uzs,
         s.status,
         s.note,
         s.repeat_group_key,
         s.repeat_type,
         s.repeat_until_date,
         s.repeat_days,
         s.repeat_anchor_date,
         s.is_repeat_root,
         s.is_auto_rolling_repeat
       FROM appointment_schedules s
       WHERE s.organization_id = $1
         AND s.specialist_id = $2
         AND s.appointment_date BETWEEN $3::date AND $4::date
         AND (
           $5::time IS NULL
           OR $6::time IS NULL
           OR (s.start_time < $6::time AND $5::time < s.end_time)
          )
           AND s.status = 'pending'
          AND NOT EXISTS (
            SELECT 1
              FROM finance_tickets ft
             WHERE ft.organization_id = s.organization_id
               AND ft.appointment_schedule_id = s.id
               AND ft.status <> 'voided'
          )
          AND (
            s.appointment_date > TIMEZONE('Asia/Tashkent', NOW())::date
            OR (
             s.appointment_date = TIMEZONE('Asia/Tashkent', NOW())::date
             AND s.end_time > TIMEZONE('Asia/Tashkent', NOW())::time
           )
         )
     ),
     updated AS (
       UPDATE appointment_schedules s
          SET status = 'cancelled',
              note = COALESCE(NULLIF($7::text, ''), s.note),
              updated_by = $8::integer,
              updated_at = CURRENT_TIMESTAMP
         FROM target t
        WHERE s.organization_id = t.organization_id
          AND s.id = t.id
       RETURNING
         s.*,
         t.specialist_id AS prev_specialist_id,
         t.client_id AS prev_client_id,
         t.appointment_date AS prev_appointment_date,
         t.start_time AS prev_start_time,
         t.end_time AS prev_end_time,
         t.duration_minutes AS prev_duration_minutes,
         t.service_id AS prev_service_id,
         t.service_name AS prev_service_name,
         t.service_price_uzs AS prev_service_price_uzs,
         t.status AS prev_status,
         t.note AS prev_note,
         t.repeat_group_key AS prev_repeat_group_key,
         t.repeat_type AS prev_repeat_type,
         t.repeat_until_date AS prev_repeat_until_date,
         t.repeat_days AS prev_repeat_days,
         t.repeat_anchor_date AS prev_repeat_anchor_date,
         t.is_repeat_root AS prev_is_repeat_root,
         t.is_auto_rolling_repeat AS prev_is_auto_rolling_repeat
     ),
     history_rows AS (
       SELECT
         u.organization_id,
         u.id AS appointment_schedule_id,
         'status-changed' AS event_type,
         u.prev_status AS previous_status,
         u.status AS next_status,
         ${changedFieldsSql} AS changed_fields,
         jsonb_build_object(
           'before', ${previousSnapshotSql},
           'after', ${nextSnapshotSql},
           'reason', 'planner_bulk_cancel'
         ) AS details,
         $8::integer AS changed_by
       FROM updated u
     ),
     history_inserted AS (
       INSERT INTO ${APPOINTMENT_STATUS_HISTORY_TABLE} (
         organization_id,
         appointment_schedule_id,
         event_type,
         previous_status,
         next_status,
         changed_fields,
         details,
         changed_by
       )
       SELECT
         h.organization_id,
         h.appointment_schedule_id,
         h.event_type,
         h.previous_status,
         h.next_status,
         h.changed_fields,
         h.details,
         h.changed_by
       FROM history_rows h
       WHERE CARDINALITY(h.changed_fields) > 0
     )
     SELECT
       u.id,
       u.organization_id,
       u.specialist_id,
       u.client_id,
       u.appointment_date,
       u.start_time,
       u.end_time,
       u.duration_minutes,
       u.service_id,
       u.service_name,
       u.service_price_uzs,
       u.status,
       u.note,
       u.repeat_group_key,
       u.repeat_type,
       u.repeat_until_date,
       u.repeat_days,
       u.repeat_anchor_date,
       u.is_repeat_root,
       u.is_auto_rolling_repeat,
       u.created_at,
       u.updated_at,
       COALESCE(NULLIF(TRIM(specialist_u.full_name), ''), NULLIF(TRIM(specialist_u.username), ''), CONCAT('Specialist #', u.specialist_id::text)) AS specialist_name,
       c.first_name,
       c.last_name,
       c.middle_name,
       c.is_vip
      FROM updated u
      LEFT JOIN users specialist_u
        ON specialist_u.id = u.specialist_id
       AND specialist_u.organization_id = u.organization_id
      JOIN clients c
        ON c.id = u.client_id
       AND c.organization_id = u.organization_id
      ORDER BY u.appointment_date ASC, u.start_time ASC, u.id ASC`,
    [
      organizationId,
      normalizedSpecialistId,
      normalizedDateFrom,
      normalizedDateTo,
      normalizedStartTime,
      normalizedEndTime,
      normalizedNote,
      actorUserId || null
    ]
  );

  clearAppointmentPlannerReportFilterCaches();
  return (rows || []).map(toScheduleItem);
}

export async function createAppointmentSpecialistAbsence({
  organizationId,
  actorUserId = null,
  specialistId,
  absenceDate,
  startTime = null,
  endTime = null,
  reason = "",
  db = pool
}) {
  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const normalizedAbsenceDate = normalizeWorkScheduleDate(absenceDate);
  const normalizedStartTime = normalizeWorkScheduleTime(startTime) || null;
  const normalizedEndTime = normalizeWorkScheduleTime(endTime) || null;
  const normalizedReason = normalizeWorkScheduleReason(reason);
  if (!normalizedSpecialistId || !normalizedAbsenceDate) {
    return {
      item: null,
      cancelledItems: []
    };
  }

  const managesOwnTransaction = db === pool;
  const client = managesOwnTransaction
    ? await pool.connect()
    : db;

  try {
    if (managesOwnTransaction) {
      await client.query("BEGIN");
    }

    const { rows } = await client.query(
      `WITH upserted AS (
         INSERT INTO appointment_working_hours (
           organization_id,
           user_id,
           rule_scope,
           day_of_week,
           work_date,
           is_active,
           start_time,
           end_time,
           reason,
           created_by,
           updated_by
         )
         VALUES (
           $1,
           $2,
           'exception',
           NULL,
           $3::date,
           FALSE,
           $4::time,
           $5::time,
           NULLIF($6::text, ''),
           $7::integer,
           $7::integer
         )
         ON CONFLICT (organization_id, user_id, work_date)
           WHERE rule_scope = 'exception' AND user_id IS NOT NULL
         DO UPDATE SET
           is_active = FALSE,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           reason = EXCLUDED.reason,
           updated_by = EXCLUDED.updated_by,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *
       )
       SELECT
       u.id,
       u.organization_id,
       u.user_id,
       u.work_date,
       u.start_time,
       u.end_time,
       u.reason,
       u.created_at,
       u.updated_at,
         COALESCE(
           NULLIF(TRIM(user_ref.full_name), ''),
           NULLIF(TRIM(user_ref.username), ''),
           CONCAT('Specialist #', u.user_id::text)
         ) AS specialist_name,
         COALESCE(NULLIF(TRIM(user_ref.username), ''), '') AS specialist_username
        FROM upserted u
        LEFT JOIN users user_ref
          ON user_ref.id = u.user_id
         AND user_ref.organization_id = u.organization_id`,
      [
        organizationId,
        normalizedSpecialistId,
        normalizedAbsenceDate,
        normalizedStartTime,
        normalizedEndTime,
        normalizedReason,
        actorUserId || null
      ]
    );

    const cancelledItems = await cancelAppointmentSchedulesForSpecialistAbsence({
      organizationId,
      actorUserId,
      specialistId: normalizedSpecialistId,
      absenceDate: normalizedAbsenceDate,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      db: client
    });

    if (managesOwnTransaction) {
      await client.query("COMMIT");
    }

    return {
      item: rows[0] ? mapAppointmentSpecialistAbsenceItem(rows[0]) : null,
      cancelledItems
    };
  } catch (error) {
    if (managesOwnTransaction) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw error;
  } finally {
    if (managesOwnTransaction) {
      client.release();
    }
  }
}

export async function deleteAppointmentSpecialistAbsenceById({
  id,
  organizationId,
  specialistId = null,
  db = pool
}) {
  const normalizedId = Number.parseInt(String(id || "").trim(), 10) || 0;
  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  if (!normalizedId) {
    return {
      rowCount: 0,
      item: null
    };
  }

  const params = [normalizedId, organizationId];
  const specialistFilterSql = normalizedSpecialistId
    ? `AND awh.user_id = $${params.push(normalizedSpecialistId)}`
    : "";

  const { rows } = await db.query(
    `DELETE FROM appointment_working_hours awh
      WHERE awh.id = $1
        AND awh.organization_id = $2
        AND awh.rule_scope = 'exception'
        AND awh.is_active = FALSE
        ${specialistFilterSql}
      RETURNING
        awh.id,
        awh.organization_id,
        awh.user_id,
        awh.work_date,
        awh.start_time,
        awh.end_time,
        awh.reason,
        awh.created_at,
        awh.updated_at`,
    params
  );

  return {
    rowCount: Array.isArray(rows) ? rows.length : 0,
    item: rows[0] ? mapAppointmentSpecialistAbsenceItem(rows[0]) : null
  };
}

export async function isVipClassAssignedToUser({
  organizationId,
  classId,
  userId
}) {
  const normalizedClassId = Number.parseInt(String(classId || "").trim(), 10);
  const normalizedUserId = Number.parseInt(String(userId || "").trim(), 10);
  if (!Number.isInteger(normalizedClassId) || normalizedClassId <= 0) {
    return false;
  }
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    return false;
  }

  const { rows } = await pool.query(
    `SELECT 1
       FROM vip_class_teacher_assignments vcta
      WHERE vcta.organization_id = $1
        AND vcta.id = $2
        AND (
          vcta.teacher_user_id = $3
          OR EXISTS (
            SELECT 1
              FROM vip_client_tutor_assignments vta
             WHERE vta.organization_id = vcta.organization_id
               AND vta.class_assignment_id = vcta.id
               AND vta.tutor_user_id = $3
          )
        )
      LIMIT 1`,
    [organizationId, normalizedClassId, normalizedUserId]
  );

  return rows.length > 0;
}

export async function getAppointmentSchedulesByRange({
  organizationId,
  specialistId,
  clientId,
  classId,
  assignedUserId = null,
  dateFrom,
  dateTo,
  lightMode = false,
  vipOnly = false,
  recurringOnly = false,
  scheduleScope = "default"
}) {
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const normalizedClientId = Number.parseInt(String(clientId || "").trim(), 10) || 0;
  const normalizedClassId = Number.parseInt(String(classId || "").trim(), 10) || 0;
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || 0;
  const params = [organizationId, dateFrom, dateTo];
  const whereParts = [
    "s.organization_id = $1",
    "s.appointment_date BETWEEN $2::date AND $3::date"
  ];
  if (normalizedSpecialistId > 0) {
    params.push(normalizedSpecialistId);
    whereParts.push(`s.specialist_id = $${params.length}`);
  }
  if (normalizedClientId > 0) {
    params.push(normalizedClientId);
    whereParts.push(`s.client_id = $${params.length}`);
  }
  if (normalizedClassId > 0) {
    params.push(normalizedClassId);
    whereParts.push(
      `EXISTS (
         SELECT 1
           FROM vip_client_tutor_assignments vta
          WHERE vta.organization_id = s.organization_id
            AND vta.client_id = s.client_id
            AND vta.class_assignment_id = $${params.length}
       )`
    );
  }

  if (vipOnly) {
    whereParts.push("c.is_vip = TRUE");
    if (normalizedAssignedUserId > 0) {
      params.push(normalizedAssignedUserId);
      whereParts.push(
        `EXISTS (
           SELECT 1
             FROM vip_client_tutor_assignments vta_scope
             JOIN vip_class_teacher_assignments vcta_scope
               ON vcta_scope.organization_id = vta_scope.organization_id
              AND vcta_scope.id = vta_scope.class_assignment_id
            WHERE vta_scope.organization_id = s.organization_id
              AND vta_scope.client_id = s.client_id
              AND (
                vcta_scope.teacher_user_id = $${params.length}
                OR vta_scope.tutor_user_id = $${params.length}
              )
         )`
      );
    }
  }
  if (recurringOnly) {
    whereParts.push("s.repeat_type = 'weekly'");
    whereParts.push("s.repeat_group_key IS NOT NULL");
  }

  const specialistPositionSelect = "COALESCE(NULLIF(TRIM(p.label), ''), NULLIF(TRIM(r.label), ''), '') AS specialist_position,";
  const specialistPositionJoin = `LEFT JOIN role_options r
        ON r.id = u.role_id
      LEFT JOIN position_options p
        ON p.id = u.position_id`;
  const fetchAppointmentRows = async ({ includeParentResponses = true } = {}) => {
    const parentResponseSelect = includeParentResponses
      ? "COALESCE(parent_response.parent_response_status, '') AS parent_response_status,"
      : "'' AS parent_response_status,";
    const parentResponseJoin = includeParentResponses
      ? `LEFT JOIN LATERAL (
          SELECT
            CASE
              WHEN BOOL_OR(apr.response_status = 'coming') THEN 'coming'
              WHEN BOOL_OR(apr.response_status = 'not_coming') THEN 'not_coming'
              ELSE ''
            END AS parent_response_status
            FROM appointment_parent_responses apr
           WHERE apr.organization_id = s.organization_id
             AND apr.appointment_schedule_id = s.id
        ) parent_response ON TRUE`
      : "";

    try {
      return await pool.query(
        `SELECT
           s.id,
           s.organization_id,
           s.specialist_id,
           s.client_id,
           s.appointment_date,
           s.start_time,
           s.end_time,
           s.duration_minutes,
           s.service_id,
           s.service_name,
           ${buildEffectiveAppointmentServicePriceSql("s", "sc")} AS service_price_uzs,
           s.status,
           s.note,
           s.repeat_group_key,
           s.repeat_type,
          s.repeat_until_date,
          s.repeat_days,
          s.repeat_anchor_date,
          s.is_repeat_root,
          s.is_auto_rolling_repeat,
          s.created_at,
          s.updated_at,
          ${parentResponseSelect}
          COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('Specialist #', s.specialist_id::text)) AS specialist_name,
          ${specialistPositionSelect}
          c.first_name,
          c.last_name,
          c.middle_name,
          c.is_vip,
          ft.id AS finance_ticket_id,
          COALESCE(ft.status, '') AS finance_ticket_status,
          COALESCE(ft.total_uzs, ft.amount_uzs, 0) AS finance_ticket_total_uzs,
          COALESCE(fpaid.paid_amount_uzs, 0) AS finance_ticket_paid_amount_uzs,
          GREATEST(COALESCE(ft.total_uzs, ft.amount_uzs, 0) - COALESCE(fpaid.paid_amount_uzs, 0), 0) AS finance_ticket_remaining_amount_uzs,
          CASE
            WHEN ft.id IS NULL THEN ''
            WHEN COALESCE(ft.total_uzs, ft.amount_uzs, 0) <= 0 THEN 'paid'
            WHEN COALESCE(fpaid.paid_amount_uzs, 0) >= COALESCE(ft.total_uzs, ft.amount_uzs, 0) THEN 'paid'
            WHEN COALESCE(fpaid.paid_amount_uzs, 0) > 0 THEN 'partial'
            ELSE 'unpaid'
          END AS finance_ticket_payment_state
          FROM ${tableName} s
          LEFT JOIN users u
            ON u.id = s.specialist_id
           AND u.organization_id = s.organization_id
          ${specialistPositionJoin}
          JOIN clients c
            ON c.id = s.client_id
           AND c.organization_id = s.organization_id
          LEFT JOIN service_catalog sc
            ON sc.organization_id = s.organization_id
           AND sc.id = s.service_id
           AND sc.is_active = TRUE
          ${parentResponseJoin}
          LEFT JOIN LATERAL (
            SELECT
              ft_inner.id,
              ft_inner.organization_id,
              ft_inner.status,
              ft_inner.amount_uzs,
              ft_inner.total_uzs
              FROM finance_tickets ft_inner
             WHERE ft_inner.organization_id = s.organization_id
               AND ft_inner.appointment_schedule_id = s.id
               AND ft_inner.status <> 'voided'
             ORDER BY ft_inner.created_at DESC, ft_inner.id DESC
             LIMIT 1
          ) ft ON TRUE
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(CASE
              WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
              WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
              ELSE 0
            END), 0) AS paid_amount_uzs
              FROM finance_transactions t
             WHERE t.organization_id = ft.organization_id
               AND t.ticket_id = ft.id
               AND t.status = 'posted'
               AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
          ) fpaid ON TRUE
          WHERE ${whereParts.join("\n        AND ")}
          ORDER BY
            s.appointment_date ASC,
            s.start_time ASC,
            CASE WHEN s.status IN ('pending', 'confirmed') THEN 0 ELSE 1 END ASC,
            s.updated_at DESC,
            s.id DESC`,
        params
      );
    } catch (error) {
      if (includeParentResponses && isAppointmentParentResponsesSchemaMissing(error)) {
        return fetchAppointmentRows({ includeParentResponses: false });
      }
      if (isAppointmentAutoRollingRepeatSchemaMissing(error)) {
        throw createAppointmentAutoRollingRepeatMigrationError();
      }
      throw error;
    }
  };

  const appointmentResult = await fetchAppointmentRows();

  const items = (appointmentResult?.rows || []).map(toScheduleItem);

  items.sort((left, right) => (
    String(left?.appointmentDate || "").localeCompare(String(right?.appointmentDate || ""))
    || String(left?.startTime || "").localeCompare(String(right?.startTime || ""))
    || String(left?.id || "").localeCompare(String(right?.id || ""))
  ));

  return items;
}

async function listAutoRollingRepeatRoots({
  organizationId,
  specialistId,
  clientId,
  classId,
  assignedUserId = null,
  vipOnly = false,
  targetDate,
  scheduleScope = "default",
  db = pool
}) {
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const normalizedClientId = Number.parseInt(String(clientId || "").trim(), 10) || 0;
  const normalizedClassId = Number.parseInt(String(classId || "").trim(), 10) || 0;
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || 0;
  const params = [organizationId, targetDate];
  const whereParts = [
    "s.organization_id = $1",
    "s.repeat_type = 'weekly'",
    "s.repeat_group_key IS NOT NULL",
    "s.is_repeat_root = TRUE",
    "s.is_auto_rolling_repeat = TRUE",
    "s.repeat_until_date < $2::date"
  ];

  if (normalizedSpecialistId > 0) {
    params.push(normalizedSpecialistId);
    whereParts.push(`s.specialist_id = $${params.length}`);
  }
  if (normalizedClientId > 0) {
    params.push(normalizedClientId);
    whereParts.push(`s.client_id = $${params.length}`);
  }
  if (normalizedClassId > 0) {
    params.push(normalizedClassId);
    whereParts.push(
      `EXISTS (
         SELECT 1
           FROM vip_client_tutor_assignments vta
          WHERE vta.organization_id = s.organization_id
            AND vta.client_id = s.client_id
            AND vta.class_assignment_id = $${params.length}
       )`
    );
  }
  if (vipOnly) {
    whereParts.push("c.is_vip = TRUE");
    if (normalizedAssignedUserId > 0) {
      params.push(normalizedAssignedUserId);
      whereParts.push(
        `EXISTS (
           SELECT 1
             FROM vip_client_tutor_assignments vta_scope
             JOIN vip_class_teacher_assignments vcta_scope
               ON vcta_scope.organization_id = vta_scope.organization_id
              AND vcta_scope.id = vta_scope.class_assignment_id
            WHERE vta_scope.organization_id = s.organization_id
              AND vta_scope.client_id = s.client_id
              AND (
                vcta_scope.teacher_user_id = $${params.length}
                OR vta_scope.tutor_user_id = $${params.length}
              )
         )`
      );
    }
  }

  try {
    const { rows } = await db.query(
      `SELECT
         s.id,
         s.organization_id,
         s.specialist_id,
         s.client_id,
         s.start_time,
         s.end_time,
         s.duration_minutes,
         s.service_id,
         s.service_name,
         s.service_price_uzs,
         s.status,
         s.note,
         s.repeat_group_key,
         s.repeat_until_date,
         s.repeat_days,
         s.repeat_anchor_date,
         s.created_by,
         s.updated_by
        FROM ${tableName} s
        JOIN clients c
          ON c.id = s.client_id
         AND c.organization_id = s.organization_id
        WHERE ${whereParts.join("\n        AND ")}
        ORDER BY s.repeat_until_date ASC, s.id ASC`,
      params
    );

    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isAppointmentAutoRollingRepeatSchemaMissing(error)) {
      throw createAppointmentAutoRollingRepeatMigrationError();
    }
    // Older VIP schemas can miss assignment tables/columns used only for auto-rolling scope checks.
    // In that case we skip auto-extension instead of failing the whole planner read.
    if (isMissingVipAssignmentScopeSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

async function updateAppointmentRepeatUntilDateByGroupKey({
  organizationId,
  repeatGroupKey,
  repeatUntilDate,
  scheduleScope = "default",
  db = pool
}) {
  const normalizedRepeatGroupKey = String(repeatGroupKey || "").trim();
  const normalizedRepeatUntilDate = normalizeDateYmd(repeatUntilDate);
  if (!normalizedRepeatGroupKey || !normalizedRepeatUntilDate) {
    return 0;
  }

  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const { rows } = await db.query(
    `UPDATE ${tableName}
        SET repeat_until_date = $1::date,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $2
        AND repeat_group_key = $3::uuid
        AND repeat_type = 'weekly'
      RETURNING 1`,
    [normalizedRepeatUntilDate, organizationId, normalizedRepeatGroupKey]
  );

  return Array.isArray(rows) ? rows.length : 0;
}

export async function ensureAutoRollingRecurringSchedulesCoverRange({
  organizationId,
  specialistId,
  clientId,
  classId,
  assignedUserId = null,
  dateTo,
  vipOnly = false,
  scheduleScope = "default"
}) {
  const targetDate = getVipAutoRollingRepeatHorizonDate(dateTo);
  if (!targetDate) {
    return { changed: false, extendedGroupCount: 0, createdCount: 0 };
  }

  const roots = await listAutoRollingRepeatRoots({
    organizationId,
    specialistId,
    clientId,
    classId,
    assignedUserId,
    vipOnly,
    targetDate,
    scheduleScope
  });
  if (roots.length === 0) {
    return { changed: false, extendedGroupCount: 0, createdCount: 0 };
  }

  let extendedGroupCount = 0;
  let createdCount = 0;
  for (const root of roots) {
    const repeatGroupKey = String(root?.repeat_group_key || "").trim();
    const currentRepeatUntilDate = normalizeDateYmd(root?.repeat_until_date);
    const repeatAnchorDate = normalizeDateYmd(root?.repeat_anchor_date);
    const repeatDays = Array.isArray(root?.repeat_days) ? root.repeat_days : [];
    const repeatDayKeys = mapRepeatDayNumsToKeys(repeatDays);
    const nextRangeStartDate = addDaysToDateYmd(currentRepeatUntilDate, 1);
    if (!repeatGroupKey || !currentRepeatUntilDate || !repeatAnchorDate || !nextRangeStartDate || repeatDayKeys.length === 0) {
      continue;
    }
    if (currentRepeatUntilDate >= targetDate) {
      continue;
    }

    const recurringDates = buildWeeklyRecurringDates({
      startDate: nextRangeStartDate,
      untilDate: targetDate,
      dayKeys: repeatDayKeys
    });
    const normalizedStatus = String(root?.status || "pending").trim().toLowerCase();
    const createdStatus = normalizedStatus === "confirmed" ? "pending" : normalizedStatus;
    const shouldEnforceAvailability = createdStatus === "pending" || createdStatus === "confirmed";

    await withAppointmentTransaction(async (db) => {
      let blockedRangesByDay = new Map();
      let breakRangesByDay = new Map();
      let absenceRangesByDate = new Map();
      const rootServiceId = Number.parseInt(String(root?.service_id || ""), 10) || null;
      const activeServiceSnapshot = rootServiceId
        ? await getActiveServiceSnapshotById({
            organizationId,
            serviceId: rootServiceId,
            db
          })
        : null;
      const recurringServiceName = String(activeServiceSnapshot?.serviceName || root?.service_name || "").trim();
      const recurringServicePriceUzs = Number.parseInt(
        String(activeServiceSnapshot?.servicePriceUzs ?? root?.service_price_uzs ?? 0),
        10
      ) || 0;

      if (shouldEnforceAvailability && recurringDates.length > 0) {
        const settingsForRepeat = await getAppointmentSettingsByOrganization(
          organizationId,
          { specialistId: root.specialist_id, db }
        );
        blockedRangesByDay = buildWorkScheduleBlockRangesByDay(settingsForRepeat?.blockedTimes);
        breakRangesByDay = buildBreakRangesByDay(
          await getAppointmentBreaksBySpecialistAndDays({
            organizationId,
            specialistId: root.specialist_id,
            dayNums: collectDayNumsFromDates(recurringDates),
            db
          })
        );
        absenceRangesByDate = buildAppointmentSpecialistAbsenceRangesByDate(
          await listAppointmentSpecialistAbsences({
            organizationId,
            specialistId: root.specialist_id,
            dateFrom: recurringDates[0],
            dateTo: recurringDates[recurringDates.length - 1],
            db
          })
        );

        for (const recurringDate of recurringDates) {
          const absenceConflict = hasAppointmentSpecialistAbsenceRangeConflict({
            absenceRangesByDate,
            appointmentDate: recurringDate,
            startTime: normalizeTimeHm(root?.start_time),
            endTime: normalizeTimeHm(root?.end_time)
          });
          if (absenceConflict) {
            continue;
          }

          const workingHoursError = validateSlotAgainstWorkingHours({
            settings: settingsForRepeat,
            appointmentDate: recurringDate,
            startTime: normalizeTimeHm(root?.start_time),
            endTime: normalizeTimeHm(root?.end_time)
          });
          if (workingHoursError) {
            continue;
          }

          const recurringBlockedConflict = hasSpecialistWorkScheduleConflict({
            blockedRangesByDay,
            appointmentDate: recurringDate,
            startTime: normalizeTimeHm(root?.start_time),
            endTime: normalizeTimeHm(root?.end_time)
          });
          if (recurringBlockedConflict) {
            continue;
          }

          const recurringBreakConflict = hasSpecialistBreakConflict({
            breakRangesByDay,
            appointmentDate: recurringDate,
            startTime: normalizeTimeHm(root?.start_time),
            endTime: normalizeTimeHm(root?.end_time)
          });
          if (recurringBreakConflict) {
            continue;
          }

          const hasConflict = await hasAppointmentScheduleConflict({
            organizationId,
            specialistId: root.specialist_id,
            appointmentDate: recurringDate,
            startTime: normalizeTimeHm(root?.start_time),
            endTime: normalizeTimeHm(root?.end_time),
            db,
            scheduleScope
          });
          if (hasConflict) {
            continue;
          }

          const hasClientConflict = await hasAppointmentClientConflict({
            organizationId,
            clientId: root.client_id,
            appointmentDate: recurringDate,
            startTime: normalizeTimeHm(root?.start_time),
            endTime: normalizeTimeHm(root?.end_time),
            db,
            scheduleScope
          });
          if (hasClientConflict) {
            continue;
          }

          try {
            const createdItem = await createAppointmentSchedule({
              organizationId,
              actorUserId: root?.updated_by || root?.created_by || null,
              specialistId: root.specialist_id,
              clientId: root.client_id,
              appointmentDate: recurringDate,
              startTime: normalizeTimeHm(root?.start_time),
              endTime: normalizeTimeHm(root?.end_time),
              durationMinutes: Number.parseInt(String(root?.duration_minutes || "").trim(), 10),
              serviceId: rootServiceId,
              serviceName: recurringServiceName,
              servicePriceUzs: recurringServicePriceUzs,
              status: createdStatus,
              note: String(root?.note || "").trim(),
              repeatGroupKey,
              repeatType: "weekly",
              repeatUntilDate: targetDate,
              repeatDays,
              repeatAnchorDate,
              isRepeatRoot: false,
              isAutoRollingRepeat: true,
              scheduleScope,
              db
            });
            if (createdItem) {
              createdCount += 1;
            }
          } catch (error) {
            if (!isUniqueOrExclusionConflict(error)) {
              throw error;
            }
          }
        }
      }

      await updateAppointmentRepeatUntilDateByGroupKey({
        organizationId,
        repeatGroupKey,
        repeatUntilDate: targetDate,
        scheduleScope,
        db
      });
    });

    extendedGroupCount += 1;
  }

  if (extendedGroupCount > 0) {
    clearAppointmentPlannerReportFilterCaches();
  }

  return {
    changed: extendedGroupCount > 0,
    extendedGroupCount,
    createdCount
  };
}

export async function getAppointmentClientScopeInfo({
  organizationId,
  clientId
}) {
  const normalizedClientId = Number.parseInt(String(clientId || "").trim(), 10) || 0;
  if (!normalizedClientId) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT
       c.id::text AS id,
       c.is_vip
      FROM clients c
      JOIN organizations o
        ON o.id = c.organization_id
     WHERE c.organization_id = $1
       AND c.id = $2
       AND o.is_active = TRUE
     LIMIT 1`,
    [organizationId, normalizedClientId]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    id: String(rows[0].id || "").trim(),
    isVip: Boolean(rows[0].is_vip)
  };
}

export async function getAppointmentClientNoShowSummary({
  organizationId,
  clientId
}) {
  const settingsTableName = APPOINTMENT_SETTINGS_TABLE;
  const schedulesTableName = APPOINTMENT_SCHEDULES_TABLE;
  const [settingsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT COALESCE(no_show_threshold, 1) AS no_show_threshold
       FROM ${settingsTableName}
       WHERE organization_id = $1
       LIMIT 1`,
      [organizationId]
    ),
    pool.query(
      `SELECT COUNT(*)::integer AS no_show_count
       FROM ${schedulesTableName}
       WHERE organization_id = $1
         AND client_id = $2
         AND status = 'no-show'`,
      [organizationId, clientId]
    )
  ]);

  const thresholdRaw = settingsResult.rows[0]?.no_show_threshold;
  const countRaw = countResult.rows[0]?.no_show_count;
  const noShowThreshold = Number.isInteger(thresholdRaw) && thresholdRaw > 0 ? thresholdRaw : 1;
  const noShowCount = Number.isInteger(countRaw) && countRaw >= 0 ? countRaw : 0;

  return {
    clientId: String(clientId),
    noShowCount,
    noShowThreshold,
    isAtRisk: noShowCount >= noShowThreshold
  };
}

export async function getAppointmentBreaksBySpecialistAndDays({
  organizationId,
  specialistId,
  dayNums,
  db = pool
}) {
  const normalizedDayNums = Array.from(
    new Set(
      (Array.isArray(dayNums) ? dayNums : [])
        .map((dayNum) => Number.parseInt(String(dayNum ?? "").trim(), 10))
        .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7)
    )
  );
  if (normalizedDayNums.length === 0) {
    return [];
  }

  const { rows } = await db.query(
    `SELECT day_of_week, start_time, end_time, break_type, title
       FROM appointment_breaks
      WHERE organization_id = $1
        AND specialist_id = $2
        AND is_active = TRUE
        AND day_of_week = ANY($3::smallint[])
      ORDER BY day_of_week ASC, start_time ASC`,
    [organizationId, specialistId, normalizedDayNums]
  );

  return (rows || []).map((row) => ({
    dayOfWeek: Number.parseInt(String(row?.day_of_week ?? ""), 10) || 0,
    startTime: row?.start_time ? String(row.start_time).slice(0, 5) : "",
    endTime: row?.end_time ? String(row.end_time).slice(0, 5) : "",
    breakType: String(row?.break_type || "break").trim().toLowerCase(),
    title: String(row?.title || "").trim()
  }));
}

export async function getAppointmentBreaksBySpecialist({
  organizationId,
  specialistId,
  db = pool
}) {
  const { rows } = await db.query(
    `SELECT
       ab.id,
       ab.organization_id,
       ab.specialist_id,
       COALESCE(NULLIF(TRIM(s.full_name), ''), NULLIF(TRIM(s.username), ''), CONCAT('Specialist #', ab.specialist_id::text)) AS specialist_name,
       ab.day_of_week,
       ab.break_type,
       ab.title,
       ab.note,
       ab.start_time,
       ab.end_time,
       ab.is_active,
       ab.created_by,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', ab.created_by::text)) AS created_by_name,
       ab.created_at,
       ab.updated_at
      FROM appointment_breaks ab
      LEFT JOIN users u
        ON u.id = ab.created_by
       AND u.organization_id = ab.organization_id
      LEFT JOIN users s
        ON s.id = ab.specialist_id
       AND s.organization_id = ab.organization_id
      WHERE ab.organization_id = $1
        AND ab.specialist_id = $2
      ORDER BY ab.day_of_week ASC, ab.start_time ASC, ab.id ASC`,
    [organizationId, specialistId]
  );

  return (rows || []).map(toBreakItem);
}

export async function replaceAppointmentBreaksBySpecialist({
  organizationId,
  actorUserId,
  specialistId,
  items,
  db = pool
}) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const executor = db === pool ? withAppointmentTransaction : async (callback) => callback(db);

  return executor(async (trx) => {
    const breaksPayloadJson = JSON.stringify(normalizedItems);
    const { rows: conflictRows } = await trx.query(
      `WITH incoming AS (
         SELECT
           (item->>'dayOfWeek')::smallint AS day_of_week,
           NULLIF(TRIM(item->>'startTime'), '')::time AS start_time,
           NULLIF(TRIM(item->>'endTime'), '')::time AS end_time,
           COALESCE((item->>'isActive')::boolean, TRUE) AS is_active
         FROM jsonb_array_elements($3::jsonb) AS item
       ),
       active_incoming AS (
         SELECT
           i.day_of_week,
           i.start_time,
           i.end_time
         FROM incoming i
         WHERE i.is_active = TRUE
           AND i.day_of_week BETWEEN 1 AND 7
           AND i.start_time IS NOT NULL
           AND i.end_time IS NOT NULL
           AND i.start_time < i.end_time
       )
       SELECT
         s.id AS appointment_id,
         s.appointment_date,
         TO_CHAR(s.start_time, 'HH24:MI') AS appointment_start_time,
         TO_CHAR(s.end_time, 'HH24:MI') AS appointment_end_time,
         ai.day_of_week,
         TO_CHAR(ai.start_time, 'HH24:MI') AS break_start_time,
         TO_CHAR(ai.end_time, 'HH24:MI') AS break_end_time
       FROM active_incoming ai
       JOIN appointment_schedules s
         ON s.organization_id = $1
        AND s.specialist_id = $2
        AND s.status IN ('pending', 'confirmed')
        AND s.appointment_date >= TIMEZONE('Asia/Tashkent', NOW())::date
        AND EXTRACT(ISODOW FROM s.appointment_date)::smallint = ai.day_of_week
        AND (($4::date + ai.start_time) < ($4::date + s.end_time))
        AND (($4::date + s.start_time) < ($4::date + ai.end_time))
       ORDER BY s.appointment_date ASC, s.start_time ASC, s.id ASC
       LIMIT 1`,
      [
        organizationId,
        specialistId,
        breaksPayloadJson,
        "2000-01-01"
      ]
    );

    const conflict = conflictRows?.[0] || null;
    if (conflict) {
      const breakStart = String(conflict.break_start_time || "").trim();
      const breakEnd = String(conflict.break_end_time || "").trim();
      const error = new Error(`This time slot already has an appointment (${breakStart}-${breakEnd}).`);
      error.statusCode = 409;
      error.code = "APPOINTMENT_BREAK_CONFLICT";
      throw error;
    }

    const { rows: workScheduleConflictRows } = await trx.query(
      `WITH incoming AS (
         SELECT
           (item->>'dayOfWeek')::smallint AS day_of_week,
           NULLIF(TRIM(item->>'startTime'), '')::time AS start_time,
           NULLIF(TRIM(item->>'endTime'), '')::time AS end_time,
           COALESCE((item->>'isActive')::boolean, TRUE) AS is_active
         FROM jsonb_array_elements($3::jsonb) AS item
       ),
       active_incoming AS (
         SELECT i.day_of_week, i.start_time, i.end_time
         FROM incoming i
         WHERE i.is_active = TRUE
           AND i.day_of_week BETWEEN 1 AND 7
           AND i.start_time IS NOT NULL
           AND i.end_time IS NOT NULL
           AND i.start_time < i.end_time
       )
       SELECT
         ai.day_of_week,
         TO_CHAR(ai.start_time, 'HH24:MI') AS break_start_time,
         TO_CHAR(ai.end_time, 'HH24:MI') AS break_end_time,
         TO_CHAR(awh.start_time, 'HH24:MI') AS block_start_time,
         TO_CHAR(awh.end_time, 'HH24:MI') AS block_end_time,
         COALESCE(NULLIF(TRIM(awh.reason), ''), 'Blocked slot') AS block_reason
        FROM active_incoming ai
        JOIN appointment_working_hours awh
          ON awh.organization_id = $1
         AND awh.user_id = $2
         AND awh.is_active = TRUE
         AND (
           (awh.rule_scope = 'weekly' AND awh.day_of_week = ai.day_of_week)
           OR
           (
             awh.rule_scope = 'exception'
             AND awh.work_date >= TIMEZONE('Asia/Tashkent', NOW())::date
             AND EXTRACT(ISODOW FROM awh.work_date)::smallint = ai.day_of_week
           )
         )
         AND (
           awh.start_time IS NULL
           OR awh.end_time IS NULL
           OR (ai.start_time < awh.end_time AND awh.start_time < ai.end_time)
         )
       ORDER BY ai.day_of_week ASC, ai.start_time ASC, awh.id ASC
       LIMIT 1`,
      [
        organizationId,
        specialistId,
        breaksPayloadJson
      ]
    );

    const workScheduleConflict = workScheduleConflictRows?.[0] || null;
    if (workScheduleConflict) {
      const breakStart = String(workScheduleConflict.break_start_time || "").trim();
      const breakEnd = String(workScheduleConflict.break_end_time || "").trim();
      const blockReason = String(workScheduleConflict.block_reason || "Blocked slot").trim();
      const error = new Error(`This break time (${breakStart}-${breakEnd}) conflicts with work schedule block: ${blockReason}.`);
      error.statusCode = 409;
      error.code = "APPOINTMENT_BREAK_WORK_SCHEDULE_CONFLICT";
      throw error;
    }

    if (await hasVipClassDailyRoutineSchema()) {
      const { rows: vipConflictRows } = await trx.query(
        `WITH incoming AS (
           SELECT
             (item->>'dayOfWeek')::smallint AS day_of_week,
             NULLIF(TRIM(item->>'startTime'), '')::time AS start_time,
             NULLIF(TRIM(item->>'endTime'), '')::time AS end_time,
             COALESCE((item->>'isActive')::boolean, TRUE) AS is_active
           FROM jsonb_array_elements($3::jsonb) AS item
         ),
         active_incoming AS (
           SELECT i.day_of_week, i.start_time, i.end_time
           FROM incoming i
           WHERE i.is_active = TRUE
             AND i.day_of_week BETWEEN 1 AND 7
             AND i.start_time IS NOT NULL
             AND i.end_time IS NOT NULL
             AND i.start_time < i.end_time
         )
         SELECT
           ai.day_of_week,
           TO_CHAR(ai.start_time, 'HH24:MI') AS break_start_time,
           TO_CHAR(ai.end_time, 'HH24:MI') AS break_end_time
         FROM active_incoming ai
          WHERE EXISTS (
            SELECT 1
            FROM vip_class_daily_routines vdr
            WHERE vdr.organization_id = $1
              AND vdr.day_of_week = ai.day_of_week
              AND ($4::date + ai.start_time) < ($4::date + vdr.end_time)
              AND ($4::date + vdr.start_time) < ($4::date + ai.end_time)
              AND ${buildVipDailyRoutineSpecialistMatchSql({
                specialistParamRef: "$2"
              })}
          )
          LIMIT 1`,
        [organizationId, specialistId, breaksPayloadJson, "2000-01-01"]
      );

      const vipConflict = vipConflictRows?.[0] || null;
      if (vipConflict) {
        const breakStart = String(vipConflict.break_start_time || "").trim();
        const breakEnd = String(vipConflict.break_end_time || "").trim();
        const error = new Error(`This break time (${breakStart}-${breakEnd}) conflicts with a VIP Daily Routine.`);
        error.statusCode = 409;
        error.code = "VIP_ROUTINE_BREAK_CONFLICT";
        throw error;
      }
    }

    await trx.query(
      `DELETE FROM appointment_breaks
        WHERE organization_id = $1
          AND specialist_id = $2`,
      [organizationId, specialistId]
    );

    for (const item of normalizedItems) {
      const dayOfWeek = Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10);
      const breakType = String(item?.breakType || "lunch").trim().toLowerCase();
      const title = String(item?.title || "").trim();
      const note = String(item?.note || "").trim();
      const startTime = normalizeTimeHm(item?.startTime);
      const endTime = normalizeTimeHm(item?.endTime);
      const isActive = item?.isActive !== false;

      await trx.query(
        `INSERT INTO appointment_breaks (
           organization_id,
           specialist_id,
           day_of_week,
           break_type,
           title,
           note,
           start_time,
           end_time,
           is_active,
           created_by,
           updated_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7::time,$8::time,$9,$10,$10)`,
        [
          organizationId,
          specialistId,
          dayOfWeek,
          breakType,
          title || null,
          note || null,
          startTime,
          endTime,
          isActive,
          actorUserId || null
        ]
      );
    }

    return getAppointmentBreaksBySpecialist({
      organizationId,
      specialistId,
      db: trx
    });
  });
}

export async function hasAppointmentScheduleConflict({
  organizationId,
  specialistId,
  appointmentDate,
  startTime,
  endTime,
  excludeId = null,
  scheduleScope = "default",
  db = pool
}) {
  const parsedExcludeId = Number.parseInt(String(excludeId ?? "").trim(), 10);
  const normalizedExcludeId = Number.isInteger(parsedExcludeId) && parsedExcludeId > 0
    ? parsedExcludeId
    : null;
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const { rows } = await db.query(
    `SELECT 1
       FROM ${tableName} s
      WHERE s.organization_id = $1
        AND s.specialist_id = $2
        AND s.appointment_date = $3::date
        AND s.status IN ('pending', 'confirmed')
        AND ($4::integer IS NULL OR s.id <> $4::integer)
        AND (($3::date + $5::time) < ($3::date + s.end_time))
        AND (($3::date + s.start_time) < ($3::date + $6::time))
      LIMIT 1`,
    [
      organizationId,
      specialistId,
      appointmentDate,
      normalizedExcludeId,
      startTime,
      endTime
    ]
  );
  return Boolean(rows[0]);
}

export async function hasAppointmentClientConflict({
  organizationId,
  clientId,
  appointmentDate,
  startTime,
  endTime,
  excludeId = null,
  scheduleScope = "default",
  db = pool
}) {
  const parsedExcludeId = Number.parseInt(String(excludeId ?? "").trim(), 10);
  const normalizedExcludeId = Number.isInteger(parsedExcludeId) && parsedExcludeId > 0
    ? parsedExcludeId
    : null;
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const { rows } = await db.query(
    `SELECT 1
       FROM ${tableName} s
      WHERE s.organization_id = $1
        AND s.client_id = $2
        AND s.appointment_date = $3::date
        AND s.status IN ('pending', 'confirmed')
        AND ($4::integer IS NULL OR s.id <> $4::integer)
        AND (($3::date + $5::time) < ($3::date + s.end_time))
        AND (($3::date + s.start_time) < ($3::date + $6::time))
      LIMIT 1`,
    [
      organizationId,
      clientId,
      appointmentDate,
      normalizedExcludeId,
      startTime,
      endTime
    ]
  );
  return Boolean(rows[0]);
}

export async function hasVipRoutineConflictForSpecialist({
  organizationId,
  specialistId,
  appointmentDate,
  startTime,
  endTime,
  db = pool
}) {
  if (!(await hasVipClassDailyRoutineSchema())) {
    return false;
  }

  const { rows } = await (db || pool).query(
    `SELECT 1
       FROM vip_class_daily_routines vdr
      WHERE vdr.organization_id = $1
        AND vdr.day_of_week = EXTRACT(ISODOW FROM $3::date)::smallint
        AND ($4::time < vdr.end_time)
        AND (vdr.start_time < $5::time)
        AND ${buildVipDailyRoutineSpecialistMatchSql({
          specialistParamRef: "$2"
        })}
      LIMIT 1`,
    [organizationId, specialistId, appointmentDate, startTime, endTime]
  );
  return Boolean(rows[0]);
}

export async function hasVipRoutineConflictForClient({
  organizationId,
  clientId,
  appointmentDate,
  startTime,
  endTime,
  db = pool
}) {
  if (!(await hasVipClassDailyRoutineSchema())) {
    return false;
  }

  const { rows } = await (db || pool).query(
    `SELECT 1
       FROM vip_class_daily_routines vdr
       JOIN vip_client_tutor_assignments vta
         ON vta.class_assignment_id = vdr.class_assignment_id
        AND vta.organization_id = vdr.organization_id
      WHERE vdr.organization_id = $1
        AND vta.client_id = $2
        AND vdr.day_of_week = EXTRACT(ISODOW FROM $3::date)::smallint
        AND ($4::time < vdr.end_time)
        AND (vdr.start_time < $5::time)
      LIMIT 1`,
    [organizationId, clientId, appointmentDate, startTime, endTime]
  );
  return Boolean(rows[0]);
}

export async function createAppointmentSchedule({
  organizationId,
  actorUserId,
  specialistId,
  clientId,
  appointmentDate,
  startTime,
  endTime,
  durationMinutes,
  serviceName,
  serviceId = null,
  servicePriceUzs = 0,
  status,
  note,
  repeatGroupKey = null,
  repeatType = "none",
  repeatUntilDate = null,
  repeatDays = null,
  repeatAnchorDate = null,
  isRepeatRoot = false,
  isAutoRollingRepeat = false,
  scheduleScope = "default",
  db = pool
}) {
  await ensureAppointmentStatusHistorySchema();

  const normalizedRepeatType = normalizeRepeatType(repeatType);
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const { rows } = await db.query(
    `WITH activated_client AS (
       UPDATE clients c
          SET is_vip = TRUE
        WHERE c.organization_id = $1
          AND c.id = $3
          AND c.is_vip IS DISTINCT FROM TRUE
       RETURNING c.id
     ),
     inserted AS (
       INSERT INTO ${tableName} (
         organization_id,
         specialist_id,
         client_id,
         appointment_date,
         start_time,
         end_time,
         duration_minutes,
         service_id,
         service_name,
         service_price_uzs,
         status,
         note,
         repeat_group_key,
         repeat_type,
         repeat_until_date,
         repeat_days,
         repeat_anchor_date,
         is_repeat_root,
         is_auto_rolling_repeat,
         created_by,
         updated_by
       )
       VALUES ($1,$2,$3,$4::date,$5::time,$6::time,$7,$8,$9,$10,$11,$12,$13::uuid,$14,$15::date,$16::smallint[],$17::date,$18,$19,$20,$20)
       RETURNING *
     ),
     history_inserted AS (
       INSERT INTO ${APPOINTMENT_STATUS_HISTORY_TABLE} (
         organization_id,
         appointment_schedule_id,
         event_type,
         previous_status,
         next_status,
         changed_fields,
         details,
         changed_by
       )
       SELECT
         i.organization_id,
         i.id,
         'created',
         NULL,
         i.status,
         ARRAY[
           'specialist_id',
           'client_id',
           'appointment_date',
           'start_time',
           'end_time',
           'status'
         ]::text[],
         jsonb_build_object(
           'before', NULL,
           'after', ${buildScheduleSnapshotSql("i")}
         ),
         $20::integer
       FROM inserted i
     )
     SELECT
       i.id,
       i.organization_id,
       i.specialist_id,
       i.client_id,
       i.appointment_date,
       i.start_time,
       i.end_time,
       i.duration_minutes,
       i.service_id,
       i.service_name,
       i.service_price_uzs,
       i.status,
       i.note,
       i.repeat_group_key,
       i.repeat_type,
       i.repeat_until_date,
       i.repeat_days,
       i.repeat_anchor_date,
       i.is_repeat_root,
       i.is_auto_rolling_repeat,
       i.created_at,
       i.updated_at,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('Specialist #', i.specialist_id::text)) AS specialist_name,
       c.first_name,
       c.last_name,
       c.middle_name,
       c.is_vip
      FROM inserted i
      JOIN clients c
        ON c.id = i.client_id
       AND c.organization_id = i.organization_id
      LEFT JOIN users u
        ON u.id = i.specialist_id
       AND u.organization_id = i.organization_id
      LIMIT 1`,
    [
      organizationId,
      specialistId,
      clientId,
      appointmentDate,
      startTime,
      endTime,
      durationMinutes,
      serviceId || null,
      serviceName,
      servicePriceUzs || 0,
      status,
      note || null,
      normalizedRepeatType === "weekly" ? (repeatGroupKey || null) : null,
      normalizedRepeatType,
      normalizedRepeatType === "weekly" ? repeatUntilDate : null,
      normalizedRepeatType === "weekly" ? (Array.isArray(repeatDays) ? repeatDays : null) : null,
      normalizedRepeatType === "weekly" ? repeatAnchorDate : null,
      normalizedRepeatType === "weekly" ? Boolean(isRepeatRoot) : false,
      normalizedRepeatType === "weekly" ? Boolean(isAutoRollingRepeat) : false,
      actorUserId || null
    ]
  );

  clearAppointmentPlannerReportFilterCaches();
  return rows[0] ? toScheduleItem(rows[0]) : null;
}

export async function getAppointmentScheduleTargetsByScope({
  organizationId,
  id,
  scope = "single",
  scheduleScope = "default"
}) {
  const normalizedScope = normalizeScheduleScope(scope);
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const mapRowToTargetItem = (row) => ({
    id: Number.parseInt(String(row?.id || ""), 10),
    specialistId: Number.parseInt(String(row?.specialist_id || ""), 10),
    clientId: Number.parseInt(String(row?.client_id || ""), 10),
    appointmentDate: normalizeDateYmd(row?.appointment_date),
    startTime: normalizeTimeHm(row?.start_time),
    endTime: normalizeTimeHm(row?.end_time),
    durationMinutes: Number.parseInt(String(row?.duration_minutes || ""), 10)
      || getDurationMinutesFromAppointmentTimes(row?.start_time, row?.end_time, { allowSeconds: true }),
    serviceId: Number.parseInt(String(row?.service_id || ""), 10) || null,
    serviceName: String(row?.service_name || "").trim(),
    servicePriceUzs: Number.parseInt(String(row?.service_price_uzs ?? 0), 10) || 0,
    specialistName: String(row?.specialist_name || "").trim(),
    status: String(row?.status || "").trim().toLowerCase(),
    note: String(row?.note || "").trim(),
    repeatType: normalizeRepeatType(row?.repeat_type),
    repeatGroupKey: normalizeUuidString(row?.repeat_group_key),
    repeatUntilDate: normalizeDateYmd(row?.repeat_until_date),
    repeatDays: mapRepeatDayNumsToKeys(row?.repeat_days),
    repeatAnchorDate: normalizeDateYmd(row?.repeat_anchor_date),
    isRepeatRoot: Boolean(row?.is_repeat_root),
    isAutoRollingRepeat: Boolean(row?.is_auto_rolling_repeat),
    isVip: Boolean(row?.is_vip),
    clientFirstName: String(row?.first_name || "").trim(),
    clientLastName: String(row?.last_name || "").trim(),
    clientMiddleName: String(row?.middle_name || "").trim()
  });
  const targetItemFilter = (row) => (
    Number.isInteger(row.id)
    && row.id > 0
    && Number.isInteger(row.specialistId)
    && row.specialistId > 0
    && Number.isInteger(row.clientId)
    && row.clientId > 0
    && row.appointmentDate
  );
  const anchorResult = await pool.query(
    `SELECT
       s.id,
       s.specialist_id,
       s.client_id,
       s.appointment_date,
       s.start_time,
       s.end_time,
       s.duration_minutes,
       s.service_id,
       s.service_name,
       ${buildEffectiveAppointmentServicePriceSql("s", "sc")} AS service_price_uzs,
       s.status,
       s.note,
       s.repeat_group_key,
       s.repeat_type,
       s.repeat_until_date,
       s.repeat_days,
       s.repeat_anchor_date,
       s.is_repeat_root,
       s.is_auto_rolling_repeat,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('Specialist #', s.specialist_id::text)) AS specialist_name,
       c.is_vip,
       c.first_name,
       c.last_name,
       c.middle_name
      FROM ${tableName} s
      LEFT JOIN users u
        ON u.id = s.specialist_id
       AND u.organization_id = s.organization_id
      JOIN clients c
        ON c.id = s.client_id
       AND c.organization_id = s.organization_id
      LEFT JOIN service_catalog sc
        ON sc.organization_id = s.organization_id
       AND sc.id = s.service_id
       AND sc.is_active = TRUE
      WHERE s.organization_id = $1
        AND s.id = $2
      LIMIT 1`,
    [organizationId, id]
  );

  const anchor = anchorResult.rows[0] || null;
  if (!anchor) {
    return {
      anchorId: 0,
      anchorAppointmentDate: "",
      repeatGroupKey: "",
      isRecurring: false,
      scope: "single",
      items: []
    };
  }

  const repeatGroupKey = normalizeUuidString(anchor.repeat_group_key);
  const isRecurring = normalizeRepeatType(anchor.repeat_type) === "weekly" && Boolean(repeatGroupKey);
  const effectiveScope = isRecurring ? normalizedScope : "single";

  let seriesRows = [];
  if (isRecurring) {
    const result = await pool.query(
      `SELECT
         s.id,
         s.specialist_id,
         s.client_id,
         s.appointment_date,
         s.start_time,
         s.end_time,
         s.duration_minutes,
         s.service_id,
         s.service_name,
         ${buildEffectiveAppointmentServicePriceSql("s", "sc")} AS service_price_uzs,
         s.status,
         s.note,
         s.repeat_group_key,
         s.repeat_type,
         s.repeat_until_date,
         s.repeat_days,
         s.repeat_anchor_date,
         s.is_repeat_root,
         s.is_auto_rolling_repeat,
         COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('Specialist #', s.specialist_id::text)) AS specialist_name,
         c.is_vip,
         c.first_name,
         c.last_name,
         c.middle_name
       FROM ${tableName} s
       LEFT JOIN users u
         ON u.id = s.specialist_id
        AND u.organization_id = s.organization_id
       JOIN clients c
         ON c.id = s.client_id
         AND c.organization_id = s.organization_id
       LEFT JOIN service_catalog sc
         ON sc.organization_id = s.organization_id
        AND sc.id = s.service_id
        AND sc.is_active = TRUE
       WHERE s.organization_id = $1
         AND s.repeat_group_key = $2::uuid
       ORDER BY s.appointment_date ASC, s.start_time ASC, s.id ASC`,
      [organizationId, repeatGroupKey]
    );
    seriesRows = result.rows || [];
  }

  let rows = [];
  if (effectiveScope === "all") {
    rows = seriesRows;
  } else if (effectiveScope === "future") {
    const anchorAppointmentDate = normalizeDateYmd(anchor.appointment_date);
    rows = seriesRows.filter((row) => normalizeDateYmd(row?.appointment_date) >= anchorAppointmentDate);
  } else {
    rows = [anchor];
  }

  return {
    anchorId: Number.parseInt(String(anchor.id), 10) || 0,
    anchorAppointmentDate: normalizeDateYmd(anchor.appointment_date),
    repeatGroupKey: isRecurring ? repeatGroupKey : "",
    repeatUntilDate: isRecurring ? normalizeDateYmd(anchor.repeat_until_date) : "",
    repeatDays: isRecurring ? mapRepeatDayNumsToKeys(anchor.repeat_days) : [],
    repeatAnchorDate: isRecurring ? normalizeDateYmd(anchor.repeat_anchor_date) : "",
    isAutoRollingRepeat: isRecurring ? Boolean(anchor.is_auto_rolling_repeat) : false,
    isRecurring,
    scope: effectiveScope,
    items: rows.map(mapRowToTargetItem).filter(targetItemFilter),
    seriesItems: seriesRows.map(mapRowToTargetItem).filter(targetItemFilter)
  };
}

export async function getFinanceTicketLockedAppointmentIds({ organizationId, appointmentScheduleIds }) {
  const ids = Array.from(new Set(
    (Array.isArray(appointmentScheduleIds) ? appointmentScheduleIds : [])
      .map((item) => Number.parseInt(String(item || ""), 10))
      .filter((item) => Number.isInteger(item) && item > 0)
  ));
  if (ids.length === 0) {
    return [];
  }
  const result = await pool.query(
    `SELECT DISTINCT appointment_schedule_id
       FROM finance_tickets
      WHERE organization_id = $1
        AND appointment_schedule_id = ANY($2::bigint[])
        AND status <> 'voided'`,
    [organizationId, ids]
  );
  return result.rows
    .map((row) => Number.parseInt(String(row.appointment_schedule_id || ""), 10))
    .filter((item) => Number.isInteger(item) && item > 0);
}

export async function updateAppointmentSchedulesByIds({
  organizationId,
  actorUserId,
  ids,
  specialistId,
  clientId,
  appointmentDate,
  startTime,
  endTime,
  durationMinutes,
  serviceName,
  serviceId = null,
  servicePriceUzs = 0,
  status,
  note,
  applyAppointmentDate = true,
  clearRepeatMeta = false,
  scheduleScope = "default",
  activateClient = true,
  db = pool
}) {
  await ensureAppointmentStatusHistorySchema();

  const normalizedIds = normalizeScheduleIds(ids);
  if (normalizedIds.length === 0) {
    return [];
  }
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const changedFieldsSql = buildScheduleChangedFieldsSql("u");
  const previousSnapshotSql = buildScheduleSnapshotSql("u", "prev_");
  const nextSnapshotSql = buildScheduleSnapshotSql("u");

  const { rows } = await db.query(
    `WITH target AS (
       SELECT
         s.id,
         s.organization_id,
         s.specialist_id,
         s.client_id,
         s.appointment_date,
         s.start_time,
         s.end_time,
         s.duration_minutes,
         s.service_id,
         s.service_name,
         s.service_price_uzs,
         s.status,
         s.note,
         s.repeat_group_key,
         s.repeat_type,
         s.repeat_until_date,
         s.repeat_days,
         s.repeat_anchor_date,
         s.is_repeat_root,
         s.is_auto_rolling_repeat
       FROM ${tableName} s
       WHERE s.organization_id = $13
         AND s.id = ANY($14::integer[])
     ),
     activated_client AS (
       UPDATE clients c
          SET is_vip = TRUE
        WHERE c.organization_id = $13
          AND c.id = $2
          AND $17::boolean
          AND c.is_vip IS DISTINCT FROM TRUE
          AND EXISTS (SELECT 1 FROM target)
       RETURNING c.id
     ),
     updated AS (
       UPDATE ${tableName} s
          SET specialist_id = $1,
              client_id = $2,
              appointment_date = CASE WHEN $11::boolean THEN $3::date ELSE s.appointment_date END,
              start_time = $4::time,
              end_time = $5::time,
              duration_minutes = $6,
              service_id = $15,
              service_name = $7,
              service_price_uzs = $16,
              status = $8,
              note = $9,
              repeat_group_key = CASE WHEN $12::boolean THEN NULL ELSE s.repeat_group_key END,
              repeat_type = CASE WHEN $12::boolean THEN 'none' ELSE s.repeat_type END,
              repeat_until_date = CASE WHEN $12::boolean THEN NULL ELSE s.repeat_until_date END,
              repeat_days = CASE WHEN $12::boolean THEN NULL ELSE s.repeat_days END,
              repeat_anchor_date = CASE WHEN $12::boolean THEN NULL ELSE s.repeat_anchor_date END,
              is_repeat_root = CASE WHEN $12::boolean THEN FALSE ELSE s.is_repeat_root END,
              is_auto_rolling_repeat = CASE WHEN $12::boolean THEN FALSE ELSE s.is_auto_rolling_repeat END,
              updated_by = $10,
              updated_at = CURRENT_TIMESTAMP
         FROM target t
        WHERE s.organization_id = t.organization_id
          AND s.id = t.id
       RETURNING
         s.*,
         t.specialist_id AS prev_specialist_id,
         t.client_id AS prev_client_id,
         t.appointment_date AS prev_appointment_date,
         t.start_time AS prev_start_time,
         t.end_time AS prev_end_time,
         t.duration_minutes AS prev_duration_minutes,
         t.service_id AS prev_service_id,
         t.service_name AS prev_service_name,
         t.service_price_uzs AS prev_service_price_uzs,
         t.status AS prev_status,
         t.note AS prev_note,
         t.repeat_group_key AS prev_repeat_group_key,
         t.repeat_type AS prev_repeat_type,
         t.repeat_until_date AS prev_repeat_until_date,
         t.repeat_days AS prev_repeat_days,
         t.repeat_anchor_date AS prev_repeat_anchor_date,
         t.is_repeat_root AS prev_is_repeat_root,
         t.is_auto_rolling_repeat AS prev_is_auto_rolling_repeat
     ),
     history_rows AS (
       SELECT
         u.organization_id,
         u.id AS appointment_schedule_id,
         CASE
           WHEN u.prev_status IS DISTINCT FROM u.status THEN 'status-changed'
           ELSE 'updated'
         END AS event_type,
         u.prev_status AS previous_status,
         u.status AS next_status,
         ${changedFieldsSql} AS changed_fields,
         jsonb_build_object(
           'before', ${previousSnapshotSql},
           'after', ${nextSnapshotSql}
         ) AS details,
         $10::integer AS changed_by
       FROM updated u
     ),
     history_inserted AS (
       INSERT INTO ${APPOINTMENT_STATUS_HISTORY_TABLE} (
         organization_id,
         appointment_schedule_id,
         event_type,
         previous_status,
         next_status,
         changed_fields,
         details,
         changed_by
       )
       SELECT
         h.organization_id,
         h.appointment_schedule_id,
         h.event_type,
         h.previous_status,
         h.next_status,
         h.changed_fields,
         h.details,
         h.changed_by
       FROM history_rows h
       WHERE CARDINALITY(h.changed_fields) > 0
     )
     SELECT
       u.id,
       u.organization_id,
       u.specialist_id,
       u.client_id,
       u.appointment_date,
       u.start_time,
       u.end_time,
       u.duration_minutes,
       u.service_id,
       u.service_name,
       u.service_price_uzs,
       u.status,
       u.note,
       u.repeat_group_key,
       u.repeat_type,
       u.repeat_until_date,
       u.repeat_days,
       u.repeat_anchor_date,
       u.is_repeat_root,
       u.is_auto_rolling_repeat,
       u.created_at,
       u.updated_at,
       COALESCE(NULLIF(TRIM(specialist_u.full_name), ''), NULLIF(TRIM(specialist_u.username), ''), CONCAT('Specialist #', u.specialist_id::text)) AS specialist_name,
       c.first_name,
       c.last_name,
       c.middle_name,
       c.is_vip
      FROM updated u
      LEFT JOIN users specialist_u
        ON specialist_u.id = u.specialist_id
       AND specialist_u.organization_id = u.organization_id
      JOIN clients c
        ON c.id = u.client_id
       AND c.organization_id = u.organization_id
      ORDER BY u.appointment_date ASC, u.start_time ASC, u.id ASC`,
    [
      specialistId,
      clientId,
      appointmentDate,
      startTime,
      endTime,
      durationMinutes,
      serviceName,
      status,
      note || null,
      actorUserId || null,
      Boolean(applyAppointmentDate),
      Boolean(clearRepeatMeta),
      organizationId,
      normalizedIds,
      serviceId || null,
      servicePriceUzs || 0,
      Boolean(activateClient)
    ]
  );

  clearAppointmentPlannerReportFilterCaches();
  return (rows || []).map(toScheduleItem);
}

export async function updateAppointmentScheduleByIdWithRepeatMeta({
  organizationId,
  actorUserId,
  id,
  specialistId,
  clientId,
  appointmentDate,
  startTime,
  endTime,
  durationMinutes,
  serviceName,
  serviceId = null,
  servicePriceUzs = 0,
  status,
  note,
  repeatGroupKey,
  repeatUntilDate,
  repeatDays,
  repeatAnchorDate,
  isRepeatRoot = true,
  isAutoRollingRepeat = false,
  scheduleScope = "default",
  db = pool
}) {
  await ensureAppointmentStatusHistorySchema();

  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const changedFieldsSql = buildScheduleChangedFieldsSql("u");
  const previousSnapshotSql = buildScheduleSnapshotSql("u", "prev_");
  const nextSnapshotSql = buildScheduleSnapshotSql("u");

  const { rows } = await db.query(
    `WITH target AS (
       SELECT
         s.id,
         s.organization_id,
         s.specialist_id,
         s.client_id,
         s.appointment_date,
         s.start_time,
         s.end_time,
         s.duration_minutes,
         s.service_id,
         s.service_name,
         s.service_price_uzs,
         s.status,
         s.note,
         s.repeat_group_key,
         s.repeat_type,
         s.repeat_until_date,
         s.repeat_days,
         s.repeat_anchor_date,
         s.is_repeat_root,
         s.is_auto_rolling_repeat
       FROM ${tableName} s
       WHERE s.id = $17
         AND s.organization_id = $18
       LIMIT 1
     ),
     activated_client AS (
       UPDATE clients c
          SET is_vip = TRUE
        WHERE c.organization_id = $18
          AND c.id = $2
          AND c.is_vip IS DISTINCT FROM TRUE
          AND EXISTS (SELECT 1 FROM target)
       RETURNING c.id
     ),
     updated AS (
       UPDATE ${tableName} s
          SET specialist_id = $1,
              client_id = $2,
              appointment_date = $3::date,
              start_time = $4::time,
              end_time = $5::time,
              duration_minutes = $6,
              service_id = $19,
              service_name = $7,
              service_price_uzs = $20,
              status = $8,
              note = $9,
              repeat_group_key = $10::uuid,
              repeat_type = 'weekly',
              repeat_until_date = $11::date,
              repeat_days = $12::smallint[],
              repeat_anchor_date = $13::date,
              is_repeat_root = $14,
              is_auto_rolling_repeat = $15,
              updated_by = $16,
              updated_at = CURRENT_TIMESTAMP
         FROM target t
        WHERE s.id = t.id
          AND s.organization_id = t.organization_id
       RETURNING
         s.*,
         t.specialist_id AS prev_specialist_id,
         t.client_id AS prev_client_id,
         t.appointment_date AS prev_appointment_date,
         t.start_time AS prev_start_time,
         t.end_time AS prev_end_time,
         t.duration_minutes AS prev_duration_minutes,
         t.service_id AS prev_service_id,
         t.service_name AS prev_service_name,
         t.service_price_uzs AS prev_service_price_uzs,
         t.status AS prev_status,
         t.note AS prev_note,
         t.repeat_group_key AS prev_repeat_group_key,
         t.repeat_type AS prev_repeat_type,
         t.repeat_until_date AS prev_repeat_until_date,
         t.repeat_days AS prev_repeat_days,
         t.repeat_anchor_date AS prev_repeat_anchor_date,
         t.is_repeat_root AS prev_is_repeat_root,
         t.is_auto_rolling_repeat AS prev_is_auto_rolling_repeat
     ),
     history_rows AS (
       SELECT
         u.organization_id,
         u.id AS appointment_schedule_id,
         CASE
           WHEN u.prev_status IS DISTINCT FROM u.status THEN 'status-changed'
           ELSE 'updated'
         END AS event_type,
         u.prev_status AS previous_status,
         u.status AS next_status,
         ${changedFieldsSql} AS changed_fields,
         jsonb_build_object(
           'before', ${previousSnapshotSql},
           'after', ${nextSnapshotSql}
         ) AS details,
         $16::integer AS changed_by
       FROM updated u
     ),
     history_inserted AS (
       INSERT INTO ${APPOINTMENT_STATUS_HISTORY_TABLE} (
         organization_id,
         appointment_schedule_id,
         event_type,
         previous_status,
         next_status,
         changed_fields,
         details,
         changed_by
       )
       SELECT
         h.organization_id,
         h.appointment_schedule_id,
         h.event_type,
         h.previous_status,
         h.next_status,
         h.changed_fields,
         h.details,
         h.changed_by
       FROM history_rows h
       WHERE CARDINALITY(h.changed_fields) > 0
     )
     SELECT
       u.id,
       u.organization_id,
       u.specialist_id,
       u.client_id,
       u.appointment_date,
       u.start_time,
       u.end_time,
       u.duration_minutes,
       u.service_id,
       u.service_name,
       u.service_price_uzs,
       u.status,
       u.note,
       u.repeat_group_key,
       u.repeat_type,
       u.repeat_until_date,
       u.repeat_days,
       u.repeat_anchor_date,
       u.is_repeat_root,
       u.is_auto_rolling_repeat,
       u.created_at,
       u.updated_at,
       COALESCE(NULLIF(TRIM(specialist_u.full_name), ''), NULLIF(TRIM(specialist_u.username), ''), CONCAT('Specialist #', u.specialist_id::text)) AS specialist_name,
       c.first_name,
       c.last_name,
       c.middle_name,
       c.is_vip
      FROM updated u
      LEFT JOIN users specialist_u
        ON specialist_u.id = u.specialist_id
       AND specialist_u.organization_id = u.organization_id
      JOIN clients c
        ON c.id = u.client_id
       AND c.organization_id = u.organization_id
      LIMIT 1`,
    [
      specialistId,
      clientId,
      appointmentDate,
      startTime,
      endTime,
      durationMinutes,
      serviceName,
      status,
      note || null,
      repeatGroupKey,
      repeatUntilDate,
      Array.isArray(repeatDays) ? repeatDays : [],
      repeatAnchorDate,
      Boolean(isRepeatRoot),
      Boolean(isAutoRollingRepeat),
      actorUserId || null,
      id,
      organizationId,
      serviceId || null,
      servicePriceUzs || 0
    ]
  );

  clearAppointmentPlannerReportFilterCaches();
  return rows[0] ? toScheduleItem(rows[0]) : null;
}

export async function deleteAppointmentSchedulesByIds({
  organizationId,
  ids,
  actorUserId = null,
  scheduleScope = "default",
  db = pool
}) {
  await ensureAppointmentStatusHistorySchema();

  const normalizedIds = normalizeScheduleIds(ids);
  if (normalizedIds.length === 0) {
    return 0;
  }
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const previousSnapshotSql = buildScheduleSnapshotSql("d");

  await db.query(
    `UPDATE finance_tickets
        SET source = 'manual',
            appointment_schedule_id = NULL,
            updated_by = $3,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $1
        AND appointment_schedule_id = ANY($2::integer[])
        AND status = 'voided'`,
    [organizationId, normalizedIds, actorUserId || null]
  );

  const { rows } = await db.query(
    `WITH deleted AS (
       DELETE FROM ${tableName}
        WHERE organization_id = $1
          AND id = ANY($2::integer[])
       RETURNING *
     ),
     history_inserted AS (
       INSERT INTO ${APPOINTMENT_STATUS_HISTORY_TABLE} (
         organization_id,
         appointment_schedule_id,
         event_type,
         previous_status,
         next_status,
         changed_fields,
         details,
         changed_by
       )
       SELECT
         d.organization_id,
         d.id,
         'deleted',
         d.status,
         NULL,
         ARRAY['deleted']::text[],
         jsonb_build_object(
           'before', ${previousSnapshotSql},
           'after', NULL
         ),
         $3::integer
       FROM deleted d
     )
     SELECT COUNT(*)::integer AS deleted_count
       FROM deleted`,
    [organizationId, normalizedIds, actorUserId || null]
  );

  clearAppointmentPlannerReportFilterCaches();
  return Number.parseInt(String(rows?.[0]?.deleted_count ?? "0"), 10) || 0;
}

export async function getAppointmentSettingsByOrganization(organizationId, options = {}) {
  const db = options?.db && typeof options.db?.query === "function"
    ? options.db
    : pool;
  const tableName = APPOINTMENT_SETTINGS_TABLE;
  const parsedSpecialistId = Number.parseInt(
    String(options?.specialistId ?? options?.userId ?? "").trim(),
    10
  );
  const specialistId = Number.isInteger(parsedSpecialistId) && parsedSpecialistId > 0
    ? parsedSpecialistId
    : null;
  const flags = await getAppointmentSettingsColumnFlags(tableName);
  const appointmentDurationSelect = flags.hasAppointmentDuration
    ? "appointment_duration_minutes,"
    : "30::integer AS appointment_duration_minutes,";
  const appointmentDurationOptionsSelect = flags.hasAppointmentDurationOptions
    ? "appointment_duration_options_minutes,"
    : "ARRAY[30]::smallint[] AS appointment_duration_options_minutes,";
  const reminderChannelsSelect = flags.hasReminderChannels
    ? "reminder_channels,"
    : "ARRAY['sms','email','telegram']::text[] AS reminder_channels,";
  const slotSubDivisionsSelect = flags.hasSlotSubDivisions
    ? "slot_sub_divisions,"
    : "1::smallint AS slot_sub_divisions,";
  const historyLockDaysSelect = flags.hasHistoryLockDays
    ? "history_lock_days,"
    : `${DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS}::integer AS history_lock_days,`;
  const slotCellHeightSelect = flags.hasSlotCellHeightPx
    ? "slot_cell_height_px,"
    : `${DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX}::integer AS slot_cell_height_px,`;

  const [settingsResult, workingHoursResult, specialistWorkingHoursResult] = await Promise.all([
    db.query(
      `SELECT
         id,
         organization_id,
         slot_interval_minutes,
         ${slotSubDivisionsSelect}
         ${appointmentDurationSelect}
       ${appointmentDurationOptionsSelect}
         no_show_threshold,
         reminder_hours,
         ${reminderChannelsSelect}
         ${historyLockDaysSelect}
         ${slotCellHeightSelect}
         visible_week_days
       FROM ${tableName}
       WHERE organization_id = $1
       LIMIT 1`,
      [organizationId]
    ),
    db.query(
      `SELECT day_of_week, is_active, start_time, end_time
       FROM appointment_working_hours
       WHERE organization_id = $1
         AND user_id IS NULL
         AND rule_scope = 'weekly'
       ORDER BY day_of_week ASC`,
      [organizationId]
    ),
    specialistId
      ? db.query(
          `SELECT day_of_week, is_active, start_time, end_time, reason
             FROM appointment_working_hours
            WHERE organization_id = $1
              AND user_id = $2
              AND rule_scope = 'weekly'
            ORDER BY day_of_week ASC`,
          [organizationId, specialistId]
        )
      : Promise.resolve({ rows: [] })
  ]);

  const row = settingsResult.rows[0] || null;
  const workingHoursRows = workingHoursResult.rows || [];
  const blockedTimes = specialistId
    ? mapSpecialistBlockedTimes(specialistWorkingHoursResult.rows || [])
    : [];
  if (!row) {
    const empty = createEmptySettings();
    if (workingHoursRows.length > 0) {
      empty.workingHours = mapWorkingHours(workingHoursRows);
    }
    if (blockedTimes.length > 0) {
      empty.blockedTimes = blockedTimes;
    }
    return empty;
  }

  const mapped = mapSettingsRow(row, workingHoursRows);
  return blockedTimes.length > 0
    ? {
        ...mapped,
        blockedTimes
      }
    : mapped;
}

export async function saveAppointmentSettings({
  organizationId,
  actorUserId,
  slotIntervalMinutes,
  slotSubDivisions = 1,
  slotCellHeightPx = DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  historyLockDays = DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS,
  appointmentDurationMinutes,
  appointmentDurationOptionsMinutes,
  noShowThreshold,
  reminderHours,
  reminderChannels,
  visibleWeekDays,
  db = pool
}) {
  const tableName = APPOINTMENT_SETTINGS_TABLE;
  const flags = await getAppointmentSettingsColumnFlags(tableName);
  if (!flags.hasAppointmentDuration || !flags.hasAppointmentDurationOptions || !flags.hasReminderChannels || !flags.hasHistoryLockDays) {
    const error = new Error("Appointment settings migration is required.");
    error.code = "MIGRATION_REQUIRED";
    throw error;
  }
  const normalizedSlotSubDivisions = Number.isInteger(slotSubDivisions) && slotSubDivisions >= 1 && slotSubDivisions <= 60
    ? slotSubDivisions
    : 1;
  const normalizedSlotCellHeightPx = normalizeSlotCellHeightPx(slotCellHeightPx);
  const normalizedHistoryLockDays = normalizeHistoryLockDays(historyLockDays);

  const managesOwnTransaction = db === pool;
  const client = managesOwnTransaction
    ? await pool.connect()
    : db;

  try {
    if (managesOwnTransaction) {
      await client.query("BEGIN");
    }

    const visibleWeekDayNums = visibleWeekDays
      .map((dayKey) => toAppointmentDayNum(dayKey))
      .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
    const normalizedDurationOptions = normalizeDurationOptions(appointmentDurationOptionsMinutes);
    const effectiveDurationOptions = normalizedDurationOptions.length > 0
      ? normalizedDurationOptions
      : [appointmentDurationMinutes];
    const effectiveAppointmentDuration = effectiveDurationOptions[0];
    const normalizedReminderChannels = normalizeReminderChannels(reminderChannels);

    const subDivisionsCol = flags.hasSlotSubDivisions ? ", slot_sub_divisions" : "";
    const subDivisionsVal = flags.hasSlotSubDivisions ? ", $10" : "";
    const subDivisionsUpdate = flags.hasSlotSubDivisions
      ? "slot_sub_divisions = EXCLUDED.slot_sub_divisions,"
      : "";
    const slotCellHeightCol = flags.hasSlotCellHeightPx ? ", slot_cell_height_px" : "";
    const slotCellHeightVal = flags.hasSlotCellHeightPx
      ? `, $${flags.hasSlotSubDivisions ? 11 : 10}`
      : "";
    const slotCellHeightUpdate = flags.hasSlotCellHeightPx
      ? "slot_cell_height_px = EXCLUDED.slot_cell_height_px,"
      : "";
    const historyLockDaysVal = `, $${9 + (flags.hasSlotSubDivisions ? 1 : 0) + (flags.hasSlotCellHeightPx ? 1 : 0) + 1}`;
    await client.query(
      `INSERT INTO ${tableName} (
         organization_id,
         slot_interval_minutes
         ${subDivisionsCol}
         ${slotCellHeightCol},
         history_lock_days,
         appointment_duration_minutes,
         appointment_duration_options_minutes,
         no_show_threshold,
         reminder_hours,
         reminder_channels,
         visible_week_days,
         created_by,
         updated_by
       ) VALUES ($1,$2${subDivisionsVal}${slotCellHeightVal}${historyLockDaysVal},$3,$4::smallint[],$5,$6,$7::text[],$8::smallint[],$9,$9)
       ON CONFLICT (organization_id) DO UPDATE SET
          slot_interval_minutes = EXCLUDED.slot_interval_minutes,
          ${subDivisionsUpdate}
          ${slotCellHeightUpdate}
          history_lock_days = EXCLUDED.history_lock_days,
          appointment_duration_minutes = EXCLUDED.appointment_duration_minutes,
          appointment_duration_options_minutes = EXCLUDED.appointment_duration_options_minutes,
          no_show_threshold = EXCLUDED.no_show_threshold,
         reminder_hours = EXCLUDED.reminder_hours,
         reminder_channels = EXCLUDED.reminder_channels,
         visible_week_days = EXCLUDED.visible_week_days,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP`,
      [
        organizationId,
        slotIntervalMinutes,
        effectiveAppointmentDuration,
        effectiveDurationOptions,
        noShowThreshold,
        reminderHours,
        normalizedReminderChannels,
        visibleWeekDayNums,
        actorUserId,
        ...(flags.hasSlotSubDivisions ? [normalizedSlotSubDivisions] : []),
        ...(flags.hasSlotCellHeightPx ? [normalizedSlotCellHeightPx] : []),
        normalizedHistoryLockDays
      ]
    );

    if (managesOwnTransaction) {
      await client.query("COMMIT");
    }
  } catch (error) {
    if (managesOwnTransaction) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw error;
  } finally {
    if (managesOwnTransaction) {
      client.release();
    }
  }

  return getAppointmentSettingsByOrganization(
    organizationId,
    managesOwnTransaction ? {} : { db: client }
  );
}

export async function getAppointmentHistoryLockDaysByOrganization(organizationId) {
  const tableName = APPOINTMENT_SETTINGS_TABLE;
  const flags = await getAppointmentSettingsColumnFlags(tableName);
  if (!flags.hasHistoryLockDays) {
    return DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS;
  }

  const { rows } = await pool.query(
    `SELECT history_lock_days
       FROM ${tableName}
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );

  const row = rows[0] || null;
  if (!row) {
    return DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS;
  }

  return normalizeHistoryLockDays(row.history_lock_days);
}

export async function getAppointmentSlotCellHeightPxByOrganization(organizationId) {
  const tableName = APPOINTMENT_SETTINGS_TABLE;
  const flags = await getAppointmentSettingsColumnFlags(tableName);
  if (!flags.hasSlotCellHeightPx) {
    return DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX;
  }

  const { rows } = await pool.query(
    `SELECT slot_cell_height_px
       FROM ${tableName}
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );

  const row = rows[0] || null;
  if (!row) {
    return DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX;
  }

  return normalizeSlotCellHeightPx(row.slot_cell_height_px);
}

export async function saveAppointmentHistoryLockDaysByOrganization({
  organizationId,
  actorUserId,
  historyLockDays
}) {
  const normalizedHistoryLockDays = normalizeHistoryLockDays(historyLockDays, Number.NaN);
  if (
    !Number.isInteger(normalizedHistoryLockDays)
    || normalizedHistoryLockDays < MIN_APPOINTMENT_HISTORY_LOCK_DAYS
    || normalizedHistoryLockDays > MAX_APPOINTMENT_HISTORY_LOCK_DAYS
  ) {
    const error = new Error("Invalid history lock days.");
    error.code = "INVALID_HISTORY_LOCK_DAYS";
    throw error;
  }

  const tableName = APPOINTMENT_SETTINGS_TABLE;
  const flags = await getAppointmentSettingsColumnFlags(tableName);
  if (!flags.hasHistoryLockDays) {
    const error = new Error("Appointment settings migration is required.");
    error.code = "MIGRATION_REQUIRED";
    throw error;
  }

  const existingResult = await pool.query(
    `SELECT organization_id
       FROM ${tableName}
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );

  if ((existingResult.rowCount || 0) === 0) {
    const defaults = createDefaultSettings();
    const defaultDurationOptions = normalizeDurationOptions(
      defaults.appointmentDurationOptions.map((value) => Number.parseInt(String(value), 10))
    );

    await saveAppointmentSettings({
      organizationId,
      actorUserId,
      slotIntervalMinutes: Number.parseInt(String(defaults.slotInterval || "30"), 10) || 30,
      slotSubDivisions: Number.parseInt(String(defaults.slotSubDivisions || "1"), 10) || 1,
      slotCellHeightPx: Number.parseInt(String(defaults.slotCellHeightPx || DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX), 10)
        || DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
      appointmentDurationMinutes: defaultDurationOptions[0] || 30,
      appointmentDurationOptionsMinutes: defaultDurationOptions,
      noShowThreshold: Number.parseInt(String(defaults.noShowThreshold || "1"), 10) || 1,
      reminderHours: Number.parseInt(String(defaults.reminderHours || "24"), 10) || 24,
      reminderChannels: Array.isArray(defaults.reminderChannels) && defaults.reminderChannels.length > 0
        ? defaults.reminderChannels
        : ["sms", "email", "telegram"],
      visibleWeekDays: Array.isArray(defaults.visibleWeekDays) && defaults.visibleWeekDays.length > 0
        ? defaults.visibleWeekDays
        : ["mon", "tue", "wed", "thu", "fri", "sat"]
    });
  }

  await pool.query(
    `UPDATE ${tableName}
        SET history_lock_days = $1,
            updated_by = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $3`,
    [normalizedHistoryLockDays, actorUserId || null, organizationId]
  );

  return getAppointmentHistoryLockDaysByOrganization(organizationId);
}

export async function saveAppointmentSlotCellHeightPxByOrganization({
  organizationId,
  actorUserId,
  slotCellHeightPx
}) {
  const normalizedSlotCellHeightPx = normalizeSlotCellHeightPx(slotCellHeightPx, Number.NaN);
  if (
    !Number.isInteger(normalizedSlotCellHeightPx)
    || normalizedSlotCellHeightPx < MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX
    || normalizedSlotCellHeightPx > MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX
  ) {
    const error = new Error("Invalid slot cell height.");
    error.code = "INVALID_SLOT_CELL_HEIGHT_PX";
    throw error;
  }

  const tableName = APPOINTMENT_SETTINGS_TABLE;
  const flags = await getAppointmentSettingsColumnFlags(tableName);
  if (!flags.hasSlotCellHeightPx) {
    const error = new Error("Appointment settings migration is required.");
    error.code = "MIGRATION_REQUIRED";
    throw error;
  }

  const existingResult = await pool.query(
    `SELECT organization_id
       FROM ${tableName}
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );

  if ((existingResult.rowCount || 0) === 0) {
    const defaults = createDefaultSettings();
    const defaultDurationOptions = normalizeDurationOptions(
      defaults.appointmentDurationOptions.map((value) => Number.parseInt(String(value), 10))
    );

    await saveAppointmentSettings({
      organizationId,
      actorUserId,
      slotIntervalMinutes: Number.parseInt(String(defaults.slotInterval || "30"), 10) || 30,
      slotSubDivisions: Number.parseInt(String(defaults.slotSubDivisions || "1"), 10) || 1,
      slotCellHeightPx: normalizedSlotCellHeightPx,
      appointmentDurationMinutes: defaultDurationOptions[0] || 30,
      appointmentDurationOptionsMinutes: defaultDurationOptions,
      noShowThreshold: Number.parseInt(String(defaults.noShowThreshold || "1"), 10) || 1,
      reminderHours: Number.parseInt(String(defaults.reminderHours || "24"), 10) || 24,
      reminderChannels: Array.isArray(defaults.reminderChannels) && defaults.reminderChannels.length > 0
        ? defaults.reminderChannels
        : ["sms", "email", "telegram"],
      visibleWeekDays: Array.isArray(defaults.visibleWeekDays) && defaults.visibleWeekDays.length > 0
        ? defaults.visibleWeekDays
        : ["mon", "tue", "wed", "thu", "fri", "sat"]
    });
  }

  await pool.query(
    `UPDATE ${tableName}
        SET slot_cell_height_px = $1,
            updated_by = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $3`,
    [normalizedSlotCellHeightPx, actorUserId || null, organizationId]
  );

  return getAppointmentSlotCellHeightPxByOrganization(organizationId);
}

export async function getAppointmentPlannerReport({
  organizationId,
  from,
  to,
  specialistId = null,
  clientId = null,
  isVip = null,
  assignedUserId = null
}) {
  await ensureAppointmentPlannerReportIndexes();

  const params = [organizationId, from, to];
  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  let specialistFilterSql = "";
  let clientFilterSql = "";
  let vipFilterSql = "";
  let vipScopeSql = "";
  if (normalizedSpecialistId > 0) {
    params.push(normalizedSpecialistId);
    specialistFilterSql = `AND s.specialist_id = $${params.length}`;
  }
  if (clientId) {
    params.push(clientId);
    clientFilterSql = `AND s.client_id = $${params.length}`;
  }
  if (isVip === true) {
    params.push(true);
    vipFilterSql = `AND c.is_vip = $${params.length}`;
  } else if (isVip === false) {
    params.push(false);
    vipFilterSql = `AND c.is_vip = $${params.length}`;
  }
  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || 0;
  if (normalizedAssignedUserId > 0 && normalizedSpecialistId <= 0) {
    params.push(normalizedAssignedUserId);
    const assignedVipExistsSql = buildAssignedVipClientExistsSql({
      organizationRef: "s.organization_id",
      clientRef: "s.client_id",
      userParamRef: `$${params.length}`
    });
    vipScopeSql = isVip === true
      ? `AND ${assignedVipExistsSql}`
      : `AND (
          c.is_vip = FALSE
          OR ${assignedVipExistsSql}
        )`;
  }

  const [specialistRows, detailRowsResult] = await Promise.all([
    getAppointmentSpecialistsByOrganization(organizationId),
    pool.query(
      `SELECT
         s.id::text AS appointment_id,
         s.appointment_date::text AS appointment_date,
         COALESCE(TO_CHAR(s.start_time, 'HH24:MI'), '') AS start_time,
         COALESCE(TO_CHAR(s.end_time, 'HH24:MI'), '') AS end_time,
         s.duration_minutes::int AS duration_minutes,
         LOWER(TRIM(s.status)) AS status,
         s.specialist_id::text AS specialist_id,
         COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), 'Specialist #' || u.id::text) AS specialist_name,
         s.client_id::text AS client_id,
         c.first_name,
         c.last_name,
         c.middle_name,
         COALESCE(NULLIF(TRIM(s.service_name), ''), 'Service') AS service_name,
         COALESCE(NULLIF(TRIM(s.note), ''), NULLIF(TRIM(parent_cancel.reason), ''), '') AS note
       FROM appointment_schedules s
       JOIN clients c
         ON c.id = s.client_id
        AND c.organization_id = s.organization_id
       JOIN users u
         ON u.id = s.specialist_id
        AND u.organization_id = s.organization_id
       LEFT JOIN LATERAL (
         SELECT apr.reason
           FROM appointment_parent_responses apr
          WHERE apr.organization_id = s.organization_id
            AND apr.appointment_schedule_id = s.id
            AND apr.response_status = 'not_coming'
          ORDER BY apr.responded_at DESC, apr.id DESC
          LIMIT 1
       ) parent_cancel ON TRUE
        WHERE s.organization_id = $1
          AND s.appointment_date BETWEEN $2::date AND $3::date
          ${specialistFilterSql}
          ${clientFilterSql}
          ${vipFilterSql}
          ${vipScopeSql}
        ORDER BY
         s.appointment_date ASC,
         s.start_time ASC,
         s.end_time ASC,
         specialist_name ASC,
         LOWER(TRIM(c.last_name)) ASC,
         LOWER(TRIM(c.first_name)) ASC,
         LOWER(TRIM(COALESCE(c.middle_name, ''))) ASC,
         COALESCE(NULLIF(TRIM(s.service_name), ''), 'Service') ASC,
         LOWER(TRIM(s.status)) ASC,
         s.id ASC`,
      params
    )
  ]);

  const summary = {
    total: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    noShow: 0
  };
  const details = (Array.isArray(detailRowsResult?.rows) ? detailRowsResult.rows : [])
    .map((row) => {
      const appointmentId = String(row?.appointment_id || "").trim();
      const appointmentDate = String(row?.appointment_date || "").trim();
      const startTime = String(row?.start_time || "").trim();
      const endTime = String(row?.end_time || "").trim();
      const durationMinutes = Number.parseInt(String(row?.duration_minutes || "0"), 10) || 0;
      const currentSpecialistId = String(row?.specialist_id || "").trim();
      const currentClientId = String(row?.client_id || "").trim();
      const status = String(row?.status || "").trim().toLowerCase();

      summary.total += 1;
      if (status === "confirmed") {
        summary.confirmed += 1;
      } else if (status === "pending") {
        summary.pending += 1;
      } else if (status === "cancelled") {
        summary.cancelled += 1;
      } else if (status === "no-show") {
        summary.noShow += 1;
      }

      return {
        appointmentId,
        appointmentDate,
        startTime,
        endTime,
        durationMinutes,
        specialistId: currentSpecialistId,
        specialistName: String(row?.specialist_name || "").trim() || `Specialist #${currentSpecialistId}`,
        clientId: currentClientId,
        clientName: [
          String(row?.last_name || "").trim(),
          String(row?.first_name || "").trim(),
          String(row?.middle_name || "").trim()
        ].filter(Boolean).join(" ").trim() || `Client #${currentClientId}`,
        serviceName: String(row?.service_name || "").trim() || "Service",
        status,
        note: String(row?.note || "").trim()
      };
    });
  const specialists = (Array.isArray(specialistRows) ? specialistRows : [])
    .map((item) => ({
      id: String(item?.id || "").trim(),
      name: String(item?.name || "").trim()
    }))
    .filter((item) => Boolean(item.id) && Boolean(item.name))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  const workload = await buildAppointmentPlannerWorkload({
    organizationId,
    from,
    to,
    specialistRows,
    specialistId,
    details
  });

  return {
    summary,
    details,
    specialists,
    workload,
    period: { from, to }
  };
}

export async function getAppointmentPlannerReportFilters({
  organizationId,
  assignedUserId = null,
  specialistId = null,
  includeAllClients = false
}) {
  await ensureAppointmentPlannerReportIndexes();

  const normalizedAssignedUserId = Number.parseInt(String(assignedUserId || "").trim(), 10) || 0;
  const normalizedSpecialistId = Number.parseInt(String(specialistId || "").trim(), 10) || 0;
  const normalizedIncludeAllClients = includeAllClients === true;
  const cacheKey = [
    `org:${organizationId}`,
    `assigned:${normalizedAssignedUserId || 0}`,
    `specialist:${normalizedSpecialistId || 0}`,
    `allClients:${normalizedIncludeAllClients ? 1 : 0}`
  ].join("|");
  const cached = appointmentPlannerFilterCache.get(cacheKey);
  if (cached) {
    return cloneAppointmentPlannerFilterResult(cached);
  }
  const clientQueryParams = [organizationId];
  let specialistFilterSql = "";
  if (normalizedSpecialistId > 0) {
    clientQueryParams.push(normalizedSpecialistId);
    specialistFilterSql = `AND s.specialist_id = $${clientQueryParams.length}`;
  }
  let vipScopeSql = "";
  if (normalizedAssignedUserId > 0 && normalizedSpecialistId <= 0) {
    clientQueryParams.push(normalizedAssignedUserId);
    vipScopeSql = `AND (
          c.is_vip = FALSE
          OR ${buildAssignedVipClientExistsSql({
            organizationRef: "s.organization_id",
            clientRef: "s.client_id",
            userParamRef: `$${clientQueryParams.length}`
          })}
        )`;
  }
  const clientRowsPromise = normalizedIncludeAllClients
    ? (() => {
        const clientScopeParams = [organizationId];
        let vipScopeSql = "";
        if (normalizedAssignedUserId > 0) {
          clientScopeParams.push(normalizedAssignedUserId);
          vipScopeSql = `AND (
                c.is_vip = FALSE
                OR ${buildAssignedVipClientExistsSql({
                  organizationRef: "c.organization_id",
                  clientRef: "c.id",
                  userParamRef: `$${clientScopeParams.length}`
                })}
              )`;
        }

        return pool.query(
          `SELECT
             c.id::text AS id,
             c.first_name,
             c.last_name,
             c.middle_name,
             c.is_vip
            FROM clients c
            JOIN organizations o
              ON o.id = c.organization_id
           WHERE c.organization_id = $1
             AND o.is_active = TRUE
             ${vipScopeSql}
           ORDER BY
             LOWER(TRIM(c.last_name)) ASC,
             LOWER(TRIM(c.first_name)) ASC,
             LOWER(TRIM(COALESCE(c.middle_name, ''))) ASC,
             c.id ASC`,
          clientScopeParams
        );
      })()
    : pool.query(
        `SELECT
           c.id::text AS id,
           c.first_name,
           c.last_name,
           c.middle_name,
           c.is_vip
          FROM appointment_schedules s
          JOIN clients c
            ON c.id = s.client_id
           AND c.organization_id = s.organization_id
         WHERE s.organization_id = $1
           ${specialistFilterSql}
           ${vipScopeSql}
         GROUP BY c.id, c.first_name, c.last_name, c.middle_name, c.is_vip
         ORDER BY
           LOWER(TRIM(c.last_name)) ASC,
           LOWER(TRIM(c.first_name)) ASC,
           LOWER(TRIM(COALESCE(c.middle_name, ''))) ASC,
           c.id ASC`,
        clientQueryParams
      );

  const [specialistRows, clientRowsResult] = await Promise.all([
    getAppointmentSpecialistsByOrganization(organizationId),
    clientRowsPromise
  ]);

  const result = {
    specialists: (Array.isArray(specialistRows) ? specialistRows : [])
      .map((item) => ({
        id: String(item?.id || "").trim(),
        name: String(item?.name || "").trim()
      }))
      .filter((item) => Boolean(item.id) && Boolean(item.name)),
    clients: (Array.isArray(clientRowsResult?.rows) ? clientRowsResult.rows : [])
      .map((row) => ({
        id: String(row?.id || "").trim(),
        firstName: String(row?.first_name || "").trim(),
        lastName: String(row?.last_name || "").trim(),
        middleName: String(row?.middle_name || "").trim(),
        isVip: Boolean(row?.is_vip)
      }))
      .filter((item) => Boolean(item.id)),
  };
  appointmentPlannerFilterCache.set(cacheKey, cloneAppointmentPlannerFilterResult(result));
  return result;
}
