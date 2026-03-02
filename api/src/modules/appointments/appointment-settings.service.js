import pool from "../../config/db.js";
import { isUniqueOrExclusionConflict } from "../../lib/db-utils.js";

const DAY_KEY_TO_NUM = Object.freeze({
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7
});

const DAY_NUM_TO_KEY = Object.freeze({
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
  7: "sun"
});

const DAY_KEYS = Object.freeze(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const SCHEDULE_SCOPE_SET = new Set(["single", "future", "all"]);
const REMINDER_CHANNEL_SET = new Set(["sms", "email", "telegram"]);
const APPOINTMENT_SCHEDULES_TABLE = "appointment_schedules";
const APPOINTMENT_STATUS_HISTORY_TABLE = "appointment_status_history";
const APPOINTMENT_SETTINGS_TABLE = "appointment_settings";
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS = 10;
export const MIN_APPOINTMENT_HISTORY_LOCK_DAYS = 0;
export const MAX_APPOINTMENT_HISTORY_LOCK_DAYS = 3650;
export const DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 18;
export const MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 12;
export const MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX = 72;
let appointmentStatusHistorySchemaInitPromise = null;

function buildScheduleSnapshotSql(alias, previousPrefix = "") {
  const col = (name) => `${alias}.${previousPrefix}${name}`;
  return `jsonb_build_object(
    'specialistId', ${col("specialist_id")},
    'clientId', ${col("client_id")},
    'appointmentDate', ${col("appointment_date")},
    'startTime', ${col("start_time")},
    'endTime', ${col("end_time")},
    'status', ${col("status")}
  )`;
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
    CASE WHEN ${prev("status")} IS DISTINCT FROM ${next("status")} THEN 'status' END
  ]::text[], NULL)`;
}

async function ensureAppointmentStatusHistorySchema() {
  if (!appointmentStatusHistorySchemaInitPromise) {
    appointmentStatusHistorySchemaInitPromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${APPOINTMENT_STATUS_HISTORY_TABLE} (
           id BIGSERIAL PRIMARY KEY,
           organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
           appointment_schedule_id INTEGER NOT NULL,
           event_type VARCHAR(24) NOT NULL DEFAULT 'updated',
           previous_status VARCHAR(24),
           next_status VARCHAR(24),
           changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
           details JSONB NOT NULL DEFAULT '{}'::jsonb,
           changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`
      );
      await pool.query(
        `ALTER TABLE ${APPOINTMENT_STATUS_HISTORY_TABLE}
           ADD COLUMN IF NOT EXISTS event_type VARCHAR(24),
           ADD COLUMN IF NOT EXISTS previous_status VARCHAR(24),
           ADD COLUMN IF NOT EXISTS next_status VARCHAR(24),
           ADD COLUMN IF NOT EXISTS changed_fields TEXT[] DEFAULT ARRAY[]::TEXT[],
           ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb,
           ADD COLUMN IF NOT EXISTS changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
           ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
      );
      await pool.query(
        `DO $$
         BEGIN
           IF EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND table_name = '${APPOINTMENT_STATUS_HISTORY_TABLE}'
               AND column_name = 'created_at'
           ) THEN
             EXECUTE 'UPDATE ${APPOINTMENT_STATUS_HISTORY_TABLE}
                         SET changed_at = COALESCE(changed_at, created_at, CURRENT_TIMESTAMP)
                       WHERE changed_at IS NULL';
           ELSE
             EXECUTE 'UPDATE ${APPOINTMENT_STATUS_HISTORY_TABLE}
                         SET changed_at = COALESCE(changed_at, CURRENT_TIMESTAMP)
                       WHERE changed_at IS NULL';
           END IF;
         END $$`
      );
      await pool.query(
        `UPDATE ${APPOINTMENT_STATUS_HISTORY_TABLE}
            SET event_type = CASE
              WHEN previous_status IS NULL AND next_status IS NOT NULL THEN 'created'
              WHEN previous_status IS NOT NULL AND next_status IS NULL THEN 'deleted'
              WHEN previous_status IS DISTINCT FROM next_status THEN 'status-changed'
              ELSE 'updated'
            END
          WHERE event_type IS NULL
             OR LENGTH(TRIM(event_type)) = 0`
      );
      await pool.query(
        `UPDATE ${APPOINTMENT_STATUS_HISTORY_TABLE}
            SET changed_fields = ARRAY[]::TEXT[]
          WHERE changed_fields IS NULL`
      );
      await pool.query(
        `UPDATE ${APPOINTMENT_STATUS_HISTORY_TABLE}
            SET details = '{}'::jsonb
          WHERE details IS NULL`
      );
      await pool.query(
        `ALTER TABLE ${APPOINTMENT_STATUS_HISTORY_TABLE}
           ALTER COLUMN event_type SET NOT NULL,
           ALTER COLUMN event_type SET DEFAULT 'updated',
           ALTER COLUMN changed_fields SET NOT NULL,
           ALTER COLUMN changed_fields SET DEFAULT ARRAY[]::TEXT[],
           ALTER COLUMN details SET NOT NULL,
           ALTER COLUMN details SET DEFAULT '{}'::jsonb,
           ALTER COLUMN changed_at SET NOT NULL,
           ALTER COLUMN changed_at SET DEFAULT CURRENT_TIMESTAMP`
      );
      await pool.query(
        `DO $$
         DECLARE constraint_rec RECORD;
         BEGIN
           FOR constraint_rec IN
             SELECT c.conname
             FROM pg_constraint c
             JOIN pg_class table_ref ON table_ref.oid = c.conrelid
             JOIN pg_namespace table_ns ON table_ns.oid = table_ref.relnamespace
             JOIN pg_class target_ref ON target_ref.oid = c.confrelid
             WHERE table_ns.nspname = current_schema()
               AND table_ref.relname = '${APPOINTMENT_STATUS_HISTORY_TABLE}'
               AND c.contype = 'f'
               AND target_ref.relname = '${APPOINTMENT_SCHEDULES_TABLE}'
           LOOP
             EXECUTE format(
               'ALTER TABLE ${APPOINTMENT_STATUS_HISTORY_TABLE} DROP CONSTRAINT %I',
               constraint_rec.conname
             );
           END LOOP;
         END $$`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_appointment_status_history_org_schedule_changed
           ON ${APPOINTMENT_STATUS_HISTORY_TABLE} (
             organization_id,
             appointment_schedule_id,
             changed_at DESC,
             id DESC
           )`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_appointment_status_history_org_changed
           ON ${APPOINTMENT_STATUS_HISTORY_TABLE} (
             organization_id,
             changed_at DESC,
             id DESC
           )`
      );
    })().catch((error) => {
      appointmentStatusHistorySchemaInitPromise = null;
      throw error;
    });
  }

  return appointmentStatusHistorySchemaInitPromise;
}

function getAppointmentSchedulesTableName() {
  return APPOINTMENT_SCHEDULES_TABLE;
}

function toDayKey(dayNum) {
  return DAY_NUM_TO_KEY[Number(dayNum)] || "";
}

function toDayNum(dayKey) {
  return DAY_KEY_TO_NUM[String(dayKey || "").trim().toLowerCase()] || 0;
}

function mapVisibleWeekDays(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((dayNum) => toDayKey(dayNum))
    .filter(Boolean);
}

function mapDurationOptions(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map((item) => Number.parseInt(String(item ?? "").trim(), 10))
    .filter((item) => Number.isInteger(item) && item > 0 && item <= 1440);
  return Array.from(new Set(normalized));
}

function mapReminderChannels(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim().toLowerCase())
        .filter((item) => REMINDER_CHANNEL_SET.has(item))
    )
  );
}

function normalizeHistoryLockDays(value, fallback = DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (
    Number.isInteger(parsed)
    && parsed >= MIN_APPOINTMENT_HISTORY_LOCK_DAYS
    && parsed <= MAX_APPOINTMENT_HISTORY_LOCK_DAYS
  ) {
    return parsed;
  }
  return fallback;
}

function normalizeSlotCellHeightPx(value, fallback = DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (
    Number.isInteger(parsed)
    && parsed >= MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX
    && parsed <= MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX
  ) {
    return parsed;
  }
  return fallback;
}

function toBreakItem(row) {
  const dayOfWeek = Number.parseInt(String(row?.day_of_week ?? "").trim(), 10) || 0;
  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    specialistId: String(row?.specialist_id || "").trim(),
    specialistName: String(row?.specialist_name || "").trim(),
    dayOfWeek,
    dayKey: toDayKey(dayOfWeek),
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

function createEmptyWorkingHours() {
  return DAY_KEYS.reduce((acc, dayKey) => {
    acc[dayKey] = { start: "", end: "" };
    return acc;
  }, {});
}

function createDefaultSettings() {
  const workingHours = createEmptyWorkingHours();
  workingHours.mon = { start: "09:00", end: "18:00" };
  workingHours.tue = { start: "09:00", end: "18:00" };
  workingHours.wed = { start: "09:00", end: "18:00" };
  workingHours.thu = { start: "09:00", end: "18:00" };
  workingHours.fri = { start: "09:00", end: "18:00" };
  workingHours.sat = { start: "10:00", end: "16:00" };

  return {
    slotInterval: "30",
    slotSubDivisions: "1",
    appointmentDuration: "30",
    appointmentDurationOptions: ["30"],
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    workingHours,
    noShowThreshold: "3",
    reminderHours: "24",
    reminderChannels: ["sms", "email", "telegram"],
    historyLockDays: String(DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS),
    slotCellHeightPx: String(DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX)
  };
}

function createEmptySettings() {
  return {
    slotInterval: "",
    slotSubDivisions: "1",
    appointmentDuration: "",
    appointmentDurationOptions: [],
    visibleWeekDays: [],
    workingHours: createEmptyWorkingHours(),
    noShowThreshold: "",
    reminderHours: "",
    reminderChannels: [],
    historyLockDays: String(DEFAULT_APPOINTMENT_HISTORY_LOCK_DAYS),
    slotCellHeightPx: String(DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX)
  };
}

function mapWorkingHours(rows) {
  const workingHours = createEmptyWorkingHours();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const dayKey = toDayKey(row.day_of_week);
    if (!dayKey) {
      return;
    }
    workingHours[dayKey] = {
      start: row.start_time ? String(row.start_time).slice(0, 5) : "",
      end: row.end_time ? String(row.end_time).slice(0, 5) : ""
    };
  });
  return workingHours;
}

function mapSettingsRow(row, workingHourRows) {
  if (!row) {
    return null;
  }

  const mappedOptions = mapDurationOptions(row.appointment_duration_options_minutes);
  const fallbackDuration = Number.parseInt(String(row.appointment_duration_minutes || "30"), 10);
  const fallbackOptions = Number.isInteger(fallbackDuration) && fallbackDuration > 0
    ? [fallbackDuration]
    : [30];
  const appointmentDurationOptions = (mappedOptions.length > 0 ? mappedOptions : fallbackOptions)
    .map((value) => String(value));

  return {
    slotInterval: String(row.slot_interval_minutes ?? ""),
    slotSubDivisions: String(row.slot_sub_divisions || 1),
    appointmentDuration: appointmentDurationOptions[0] || "",
    appointmentDurationOptions,
    visibleWeekDays: mapVisibleWeekDays(row.visible_week_days),
    workingHours: mapWorkingHours(workingHourRows),
    noShowThreshold: String(row.no_show_threshold ?? ""),
    reminderHours: String(row.reminder_hours ?? ""),
    reminderChannels: mapReminderChannels(row.reminder_channels),
    historyLockDays: String(normalizeHistoryLockDays(row.history_lock_days)),
    slotCellHeightPx: String(normalizeSlotCellHeightPx(row.slot_cell_height_px))
  };
}

function normalizeDateYmd(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = String(value.getFullYear());
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function normalizeTimeHm(value) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 5) : "";
}

function toTimeMinutes(value) {
  const raw = String(value || "").trim().slice(0, 5);
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }
  return (Number(match[1]) * 60) + Number(match[2]);
}

function getDurationMinutesFromTimes(startTime, endTime) {
  const start = toTimeMinutes(startTime);
  const end = toTimeMinutes(endTime);
  if (start === null || end === null || end <= start) {
    return 0;
  }
  return end - start;
}

function normalizeScheduleScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SCHEDULE_SCOPE_SET.has(normalized) ? normalized : "single";
}

function mapRepeatDayNumsToKeys(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const mapped = value
    .map((dayNum) => toDayKey(dayNum))
    .filter(Boolean);
  return Array.from(new Set(mapped)).sort((left, right) => toDayNum(left) - toDayNum(right));
}

function normalizeRepeatType(value) {
  const normalized = String(value || "none").trim().toLowerCase();
  return normalized === "weekly" ? "weekly" : "none";
}

function normalizeScheduleIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((id) => Number.parseInt(String(id ?? "").trim(), 10))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );
}

async function getAppointmentSettingsColumnFlags(tableName = APPOINTMENT_SETTINGS_TABLE) {
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1`,
    [tableName]
  );

  const set = new Set((rows || []).map((row) => String(row?.column_name || "").trim()));
  const flags = {
    hasAppointmentDuration: set.has("appointment_duration_minutes"),
    hasAppointmentDurationOptions: set.has("appointment_duration_options_minutes"),
    hasReminderChannels: set.has("reminder_channels"),
    hasSlotSubDivisions: set.has("slot_sub_divisions"),
    hasHistoryLockDays: set.has("history_lock_days"),
    hasSlotCellHeightPx: set.has("slot_cell_height_px")
  };
  return flags;
}

function toScheduleItem(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  const repeatType = normalizeRepeatType(row?.repeat_type);
  const repeatGroupKey = String(row?.repeat_group_key || "").trim();
  const durationFromRow = Number.parseInt(String(row?.duration_minutes ?? "").trim(), 10);
  const durationMinutes = Number.isInteger(durationFromRow) && durationFromRow > 0
    ? durationFromRow
    : getDurationMinutesFromTimes(row?.start_time, row?.end_time);
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
    serviceName: String(row?.service_name || "").trim(),
    status,
    note: String(row?.note || "").trim(),
    repeatType,
    repeatGroupKey,
    repeatUntilDate: normalizeDateYmd(row?.repeat_until_date),
    repeatDays: mapRepeatDayNumsToKeys(row?.repeat_days),
    repeatAnchorDate: normalizeDateYmd(row?.repeat_anchor_date),
    isRepeatRoot: Boolean(row?.is_repeat_root),
    isRecurring: repeatType === "weekly" && Boolean(repeatGroupKey),
    clientFirstName: String(row?.first_name || "").trim(),
    clientLastName: String(row?.last_name || "").trim(),
    clientMiddleName: String(row?.middle_name || "").trim(),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

export function getAppointmentDayKeys() {
  return DAY_KEYS;
}

export function toAppointmentDayNum(dayKey) {
  return toDayNum(dayKey);
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

export async function getAppointmentSpecialistsByOrganization(organizationId) {
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
         OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%specialist%'
         OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%spetsialist%'
       )
     ORDER BY
      COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), u.id::text) ASC`,
    [organizationId]
  );

  return rows || [];
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

  const specialistPositionSelect = lightMode
    ? "''::text AS specialist_position,"
    : "COALESCE(NULLIF(TRIM(p.label), ''), NULLIF(TRIM(r.label), ''), '') AS specialist_position,";
  const specialistPositionJoin = lightMode
    ? ""
    : `LEFT JOIN role_options r
        ON r.id = u.role_id
      LEFT JOIN position_options p
        ON p.id = u.position_id`;

  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.organization_id,
       s.specialist_id,
       s.client_id,
       s.appointment_date,
       s.start_time,
       s.end_time,
       s.duration_minutes,
       s.service_name,
       s.status,
       s.note,
       s.repeat_group_key,
       s.repeat_type,
       s.repeat_until_date,
       s.repeat_days,
       s.repeat_anchor_date,
       s.is_repeat_root,
      s.created_at,
      s.updated_at,
      COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('Specialist #', s.specialist_id::text)) AS specialist_name,
      ${specialistPositionSelect}
      c.first_name,
      c.last_name,
      c.middle_name
      FROM ${tableName} s
      LEFT JOIN users u
        ON u.id = s.specialist_id
       AND u.organization_id = s.organization_id
      ${specialistPositionJoin}
      JOIN clients c
        ON c.id = s.client_id
       AND c.organization_id = s.organization_id
      WHERE ${whereParts.join("\n        AND ")}
      ORDER BY
        s.appointment_date ASC,
        s.start_time ASC,
        CASE WHEN s.status IN ('pending', 'confirmed') THEN 0 ELSE 1 END ASC,
        s.updated_at DESC,
        s.id DESC`,
    params
  );

  return (rows || []).map(toScheduleItem);
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
  status,
  note,
  repeatGroupKey = null,
  repeatType = "none",
  repeatUntilDate = null,
  repeatDays = null,
  repeatAnchorDate = null,
  isRepeatRoot = false,
  scheduleScope = "default",
  db = pool
}) {
  await ensureAppointmentStatusHistorySchema();

  const normalizedRepeatType = normalizeRepeatType(repeatType);
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const { rows } = await db.query(
    `WITH inserted AS (
       INSERT INTO ${tableName} (
         organization_id,
         specialist_id,
         client_id,
         appointment_date,
         start_time,
         end_time,
         duration_minutes,
         service_name,
         status,
         note,
         repeat_group_key,
         repeat_type,
         repeat_until_date,
         repeat_days,
         repeat_anchor_date,
         is_repeat_root,
         created_by,
         updated_by
       )
       VALUES ($1,$2,$3,$4::date,$5::time,$6::time,$7,$8,$9,$10,$11::uuid,$12,$13::date,$14::smallint[],$15::date,$16,$17,$17)
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
         $17::integer
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
       i.service_name,
       i.status,
       i.note,
       i.repeat_group_key,
       i.repeat_type,
       i.repeat_until_date,
       i.repeat_days,
       i.repeat_anchor_date,
       i.is_repeat_root,
       i.created_at,
       i.updated_at,
       c.first_name,
       c.last_name,
       c.middle_name
      FROM inserted i
      JOIN clients c
        ON c.id = i.client_id
       AND c.organization_id = i.organization_id
      LIMIT 1`,
    [
      organizationId,
      specialistId,
      clientId,
      appointmentDate,
      startTime,
      endTime,
      durationMinutes,
      serviceName,
      status,
      note || null,
      normalizedRepeatType === "weekly" ? (repeatGroupKey || null) : null,
      normalizedRepeatType,
      normalizedRepeatType === "weekly" ? repeatUntilDate : null,
      normalizedRepeatType === "weekly" ? (Array.isArray(repeatDays) ? repeatDays : null) : null,
      normalizedRepeatType === "weekly" ? repeatAnchorDate : null,
      normalizedRepeatType === "weekly" ? Boolean(isRepeatRoot) : false,
      actorUserId || null
    ]
  );

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
  const anchorResult = await pool.query(
    `SELECT
       s.id,
       s.specialist_id,
       s.client_id,
       s.appointment_date,
       s.repeat_group_key,
       s.repeat_type,
       c.first_name,
       c.last_name,
       c.middle_name
      FROM ${tableName} s
      JOIN clients c
        ON c.id = s.client_id
       AND c.organization_id = s.organization_id
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

  const repeatGroupKey = String(anchor.repeat_group_key || "").trim();
  const isRecurring = normalizeRepeatType(anchor.repeat_type) === "weekly" && Boolean(repeatGroupKey);
  const effectiveScope = isRecurring ? normalizedScope : "single";

  let rows = [];
  if (effectiveScope === "all") {
    const result = await pool.query(
      `SELECT
         s.id,
         s.specialist_id,
         s.client_id,
         s.appointment_date,
         c.first_name,
         c.last_name,
         c.middle_name
       FROM ${tableName} s
       JOIN clients c
         ON c.id = s.client_id
        AND c.organization_id = s.organization_id
       WHERE s.organization_id = $1
         AND s.repeat_group_key = $2::uuid
       ORDER BY s.appointment_date ASC, s.start_time ASC, s.id ASC`,
      [organizationId, repeatGroupKey]
    );
    rows = result.rows || [];
  } else if (effectiveScope === "future") {
    const result = await pool.query(
      `SELECT
         s.id,
         s.specialist_id,
         s.client_id,
         s.appointment_date,
         c.first_name,
         c.last_name,
         c.middle_name
       FROM ${tableName} s
       JOIN clients c
         ON c.id = s.client_id
        AND c.organization_id = s.organization_id
       WHERE s.organization_id = $1
         AND s.repeat_group_key = $2::uuid
         AND s.appointment_date >= $3::date
       ORDER BY s.appointment_date ASC, s.start_time ASC, s.id ASC`,
      [organizationId, repeatGroupKey, anchor.appointment_date]
    );
    rows = result.rows || [];
  } else {
    rows = [anchor];
  }

  return {
    anchorId: Number.parseInt(String(anchor.id), 10) || 0,
    anchorAppointmentDate: normalizeDateYmd(anchor.appointment_date),
    repeatGroupKey: isRecurring ? repeatGroupKey : "",
    isRecurring,
    scope: effectiveScope,
    items: rows
      .map((row) => ({
        id: Number.parseInt(String(row?.id || ""), 10),
        specialistId: Number.parseInt(String(row?.specialist_id || ""), 10),
        clientId: Number.parseInt(String(row?.client_id || ""), 10),
        appointmentDate: normalizeDateYmd(row?.appointment_date),
        clientFirstName: String(row?.first_name || "").trim(),
        clientLastName: String(row?.last_name || "").trim(),
        clientMiddleName: String(row?.middle_name || "").trim()
      }))
      .filter((row) => (
        Number.isInteger(row.id)
        && row.id > 0
        && Number.isInteger(row.specialistId)
        && row.specialistId > 0
        && Number.isInteger(row.clientId)
        && row.clientId > 0
        && row.appointmentDate
      ))
  };
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
  status,
  note,
  applyAppointmentDate = true,
  scheduleScope = "default"
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

  const { rows } = await pool.query(
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
         s.service_name,
         s.status,
         s.note,
         s.repeat_group_key,
         s.repeat_type,
         s.repeat_until_date,
         s.repeat_days,
         s.repeat_anchor_date,
         s.is_repeat_root
       FROM ${tableName} s
       WHERE s.organization_id = $12
         AND s.id = ANY($13::integer[])
     ),
     updated AS (
       UPDATE ${tableName} s
          SET specialist_id = $1,
              client_id = $2,
              appointment_date = CASE WHEN $11::boolean THEN $3::date ELSE s.appointment_date END,
              start_time = $4::time,
              end_time = $5::time,
              duration_minutes = $6,
              service_name = $7,
              status = $8,
              note = $9,
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
         t.service_name AS prev_service_name,
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
       u.service_name,
       u.status,
       u.note,
       u.repeat_group_key,
       u.repeat_type,
       u.repeat_until_date,
       u.repeat_days,
       u.repeat_anchor_date,
       u.is_repeat_root,
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
      organizationId,
      normalizedIds
    ]
  );

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
  status,
  note,
  repeatGroupKey,
  repeatUntilDate,
  repeatDays,
  repeatAnchorDate,
  isRepeatRoot = true,
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
         s.service_name,
         s.status,
         s.note,
         s.repeat_group_key,
         s.repeat_type,
         s.repeat_until_date,
         s.repeat_days,
         s.repeat_anchor_date,
         s.is_repeat_root
       FROM ${tableName} s
       WHERE s.id = $16
         AND s.organization_id = $17
       LIMIT 1
     ),
     updated AS (
       UPDATE ${tableName} s
          SET specialist_id = $1,
              client_id = $2,
              appointment_date = $3::date,
              start_time = $4::time,
              end_time = $5::time,
              duration_minutes = $6,
              service_name = $7,
              status = $8,
              note = $9,
              repeat_group_key = $10::uuid,
              repeat_type = 'weekly',
              repeat_until_date = $11::date,
              repeat_days = $12::smallint[],
              repeat_anchor_date = $13::date,
              is_repeat_root = $14,
              updated_by = $15,
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
         t.service_name AS prev_service_name,
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
         $15::integer AS changed_by
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
       u.service_name,
       u.status,
       u.note,
       u.repeat_group_key,
       u.repeat_type,
       u.repeat_until_date,
       u.repeat_days,
       u.repeat_anchor_date,
       u.is_repeat_root,
       u.created_at,
       u.updated_at,
       c.first_name,
       c.last_name,
       c.middle_name
      FROM updated u
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
      actorUserId || null,
      id,
      organizationId
    ]
  );

  return rows[0] ? toScheduleItem(rows[0]) : null;
}

export async function deleteAppointmentSchedulesByIds({
  organizationId,
  ids,
  actorUserId = null,
  scheduleScope = "default"
}) {
  await ensureAppointmentStatusHistorySchema();

  const normalizedIds = normalizeScheduleIds(ids);
  if (normalizedIds.length === 0) {
    return 0;
  }
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const previousSnapshotSql = buildScheduleSnapshotSql("d");

  const { rows } = await pool.query(
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

  return Number.parseInt(String(rows?.[0]?.deleted_count ?? "0"), 10) || 0;
}

export async function getAppointmentSettingsByOrganization(organizationId) {
  const tableName = APPOINTMENT_SETTINGS_TABLE;
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

  const [settingsResult, workingHoursResult] = await Promise.all([
    pool.query(
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
    pool.query(
      `SELECT day_of_week, is_active, start_time, end_time
       FROM appointment_working_hours
       WHERE organization_id = $1
       ORDER BY day_of_week ASC`,
      [organizationId]
    )
  ]);

  const row = settingsResult.rows[0] || null;
  if (!row) {
    const workingHoursRows = workingHoursResult.rows || [];
    const empty = createEmptySettings();
    if (workingHoursRows.length > 0) {
      empty.workingHours = mapWorkingHours(workingHoursRows);
    }
    return empty;
  }

  return mapSettingsRow(row, workingHoursResult.rows || []);
}

export async function saveAppointmentSettings({
  organizationId,
  actorUserId,
  slotIntervalMinutes,
  slotSubDivisions = 1,
  slotCellHeightPx = DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  appointmentDurationMinutes,
  appointmentDurationOptionsMinutes,
  noShowThreshold,
  reminderHours,
  reminderChannels,
  visibleWeekDays,
  workingHours
}) {
  const tableName = APPOINTMENT_SETTINGS_TABLE;
  const flags = await getAppointmentSettingsColumnFlags(tableName);
  if (!flags.hasAppointmentDuration || !flags.hasAppointmentDurationOptions || !flags.hasReminderChannels) {
    const error = new Error("Appointment settings migration is required.");
    error.code = "MIGRATION_REQUIRED";
    throw error;
  }
  const normalizedSlotSubDivisions = Number.isInteger(slotSubDivisions) && slotSubDivisions >= 1 && slotSubDivisions <= 60
    ? slotSubDivisions
    : 1;
  const normalizedSlotCellHeightPx = normalizeSlotCellHeightPx(slotCellHeightPx);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const visibleWeekDayNums = visibleWeekDays
      .map((dayKey) => toDayNum(dayKey))
      .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);
    const normalizedDurationOptions = mapDurationOptions(appointmentDurationOptionsMinutes);
    const effectiveDurationOptions = normalizedDurationOptions.length > 0
      ? normalizedDurationOptions
      : [appointmentDurationMinutes];
    const effectiveAppointmentDuration = effectiveDurationOptions[0];
    const normalizedReminderChannels = mapReminderChannels(reminderChannels);

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
    await client.query(
      `INSERT INTO ${tableName} (
         organization_id,
         slot_interval_minutes
         ${subDivisionsCol}
         ${slotCellHeightCol},
         appointment_duration_minutes,
         appointment_duration_options_minutes,
         no_show_threshold,
         reminder_hours,
         reminder_channels,
         visible_week_days,
         created_by,
         updated_by
       ) VALUES ($1,$2${subDivisionsVal}${slotCellHeightVal},$3,$4::smallint[],$5,$6,$7::text[],$8::smallint[],$9,$9)
       ON CONFLICT (organization_id) DO UPDATE SET
          slot_interval_minutes = EXCLUDED.slot_interval_minutes,
          ${subDivisionsUpdate}
          ${slotCellHeightUpdate}
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
        ...(flags.hasSlotCellHeightPx ? [normalizedSlotCellHeightPx] : [])
      ]
    );

    for (const dayKey of DAY_KEYS) {
      const dayNum = toDayNum(dayKey);
      const dayValue = workingHours?.[dayKey] || {};
      const startTime = String(dayValue.start || "").trim();
      const endTime = String(dayValue.end || "").trim();
      const isVisible = visibleWeekDays.includes(dayKey);
      const isCompleteTime = Boolean(startTime && endTime);
      const isActive = isVisible && isCompleteTime;

      await client.query(
        `INSERT INTO appointment_working_hours (
           organization_id,
           day_of_week,
           is_active,
           start_time,
           end_time,
           created_by,
           updated_by
         ) VALUES ($1,$2,$3,$4::time,$5::time,$6,$6)
         ON CONFLICT (organization_id, day_of_week) DO UPDATE SET
            is_active = EXCLUDED.is_active,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP`,
        [
          organizationId,
          dayNum,
          isActive,
          isActive ? startTime : null,
          isActive ? endTime : null,
          actorUserId
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

  return getAppointmentSettingsByOrganization(organizationId);
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
    const defaultDurationOptions = mapDurationOptions(
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
        : ["mon", "tue", "wed", "thu", "fri", "sat"],
      workingHours: defaults.workingHours
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
    const defaultDurationOptions = mapDurationOptions(
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
        : ["mon", "tue", "wed", "thu", "fri", "sat"],
      workingHours: defaults.workingHours
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
