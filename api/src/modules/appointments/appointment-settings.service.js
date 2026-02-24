import pool from "../../config/db.js";

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
const APPOINTMENT_SETTINGS_TABLE = "appointment_settings";
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

function toBreakItem(row) {
  const dayOfWeek = Number.parseInt(String(row?.day_of_week ?? "").trim(), 10) || 0;
  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    specialistId: String(row?.specialist_id || "").trim(),
    dayOfWeek,
    dayKey: toDayKey(dayOfWeek),
    breakType: String(row?.break_type || "lunch").trim().toLowerCase(),
    title: String(row?.title || "").trim(),
    note: String(row?.note || "").trim(),
    startTime: normalizeTimeHm(row?.start_time),
    endTime: normalizeTimeHm(row?.end_time),
    isActive: Boolean(row?.is_active),
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
    reminderChannels: ["sms", "email", "telegram"]
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
    reminderChannels: []
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
    slotInterval: String(row.slot_interval_minutes || 30),
    slotSubDivisions: String(row.slot_sub_divisions || 1),
    appointmentDuration: appointmentDurationOptions[0] || "30",
    appointmentDurationOptions,
    visibleWeekDays: mapVisibleWeekDays(row.visible_week_days),
    workingHours: mapWorkingHours(workingHourRows),
    noShowThreshold: String(row.no_show_threshold || 1),
    reminderHours: String(row.reminder_hours || 24),
    reminderChannels: mapReminderChannels(row.reminder_channels)
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

function isUniqueOrExclusionConflict(error) {
  return error?.code === "23505" || error?.code === "23P01";
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
    hasSlotSubDivisions: set.has("slot_sub_divisions")
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

  if (Array.isArray(rows) && rows.length > 0) {
    return rows;
  }

  // Fallback: if explicit specialist labels are not configured, return active non-admin users.
  const fallbackResult = await pool.query(
    `SELECT
       u.id::text AS id,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS name,
       COALESCE(NULLIF(TRIM(p.label), ''), NULLIF(TRIM(r.label), ''), 'User') AS role
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      JOIN role_options r ON r.id = u.role_id
      LEFT JOIN position_options p ON p.id = u.position_id
      WHERE u.organization_id = $1
        AND o.is_active = TRUE
        AND r.is_active = TRUE
        AND r.is_admin = FALSE
      ORDER BY
        COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), u.id::text) ASC`,
    [organizationId]
  );

  return fallbackResult.rows || [];
}

export async function getAppointmentSchedulesByRange({
  organizationId,
  specialistId,
  dateFrom,
  dateTo,
  vipOnly = false,
  recurringOnly = false,
  scheduleScope = "default"
}) {
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const whereParts = [
    "s.organization_id = $1",
    "s.specialist_id = $2",
    "s.appointment_date BETWEEN $3::date AND $4::date"
  ];

  if (vipOnly) {
    whereParts.push("c.is_vip = TRUE");
  }
  if (recurringOnly) {
    whereParts.push("s.repeat_type = 'weekly'");
    whereParts.push("s.repeat_group_key IS NOT NULL");
  }

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
       c.first_name,
       c.last_name,
       c.middle_name
      FROM ${tableName} s
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
    [organizationId, specialistId, dateFrom, dateTo]
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
       id,
       organization_id,
       specialist_id,
       day_of_week,
       break_type,
       title,
       note,
       start_time,
       end_time,
       is_active,
       created_at,
       updated_at
      FROM appointment_breaks
      WHERE organization_id = $1
        AND specialist_id = $2
      ORDER BY day_of_week ASC, start_time ASC, id ASC`,
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
    await trx.query(
      `DELETE FROM appointment_breaks
        WHERE organization_id = $1
          AND specialist_id = $2`,
      [organizationId, specialistId]
    );

    const inserted = [];
    for (const item of normalizedItems) {
      const dayOfWeek = Number.parseInt(String(item?.dayOfWeek ?? "").trim(), 10);
      const breakType = String(item?.breakType || "lunch").trim().toLowerCase();
      const title = String(item?.title || "").trim();
      const note = String(item?.note || "").trim();
      const startTime = normalizeTimeHm(item?.startTime);
      const endTime = normalizeTimeHm(item?.endTime);
      const isActive = item?.isActive !== false;

      const { rows } = await trx.query(
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
         VALUES ($1,$2,$3,$4,$5,$6,$7::time,$8::time,$9,$10,$10)
         RETURNING
           id,
           organization_id,
           specialist_id,
           day_of_week,
           break_type,
           title,
           note,
           start_time,
           end_time,
           is_active,
           created_at,
           updated_at`,
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

      if (rows[0]) {
        inserted.push(toBreakItem(rows[0]));
      }
    }

    return inserted;
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
  const normalizedIds = normalizeScheduleIds(ids);
  if (normalizedIds.length === 0) {
    return [];
  }
  const tableName = getAppointmentSchedulesTableName(scheduleScope);

  const { rows } = await pool.query(
    `WITH updated AS (
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
        WHERE s.organization_id = $12
          AND s.id = ANY($13::integer[])
       RETURNING *
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
  const tableName = getAppointmentSchedulesTableName(scheduleScope);
  const { rows } = await db.query(
    `WITH updated AS (
       UPDATE ${tableName}
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
        WHERE id = $16
          AND organization_id = $17
       RETURNING *
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
  scheduleScope = "default"
}) {
  const normalizedIds = normalizeScheduleIds(ids);
  if (normalizedIds.length === 0) {
    return 0;
  }
  const tableName = getAppointmentSchedulesTableName(scheduleScope);

  const { rowCount } = await pool.query(
    `DELETE FROM ${tableName}
      WHERE organization_id = $1
        AND id = ANY($2::integer[])`,
    [organizationId, normalizedIds]
  );

  return rowCount || 0;
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
    const defaults = createDefaultSettings();
    if (workingHoursRows.length > 0) {
      defaults.workingHours = mapWorkingHours(workingHoursRows);
    }
    return defaults;
  }

  return mapSettingsRow(row, workingHoursResult.rows || []);
}

export async function saveAppointmentSettings({
  organizationId,
  actorUserId,
  slotIntervalMinutes,
  slotSubDivisions = 1,
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
    await client.query(
      `INSERT INTO ${tableName} (
         organization_id,
         slot_interval_minutes
         ${subDivisionsCol},
         appointment_duration_minutes,
         appointment_duration_options_minutes,
         no_show_threshold,
         reminder_hours,
         reminder_channels,
         visible_week_days,
         created_by,
         updated_by
       ) VALUES ($1,$2${subDivisionsVal},$3,$4::smallint[],$5,$6,$7::text[],$8::smallint[],$9,$9)
       ON CONFLICT (organization_id) DO UPDATE SET
         slot_interval_minutes = EXCLUDED.slot_interval_minutes,
         ${subDivisionsUpdate}
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
        ...(flags.hasSlotSubDivisions ? [normalizedSlotSubDivisions] : [])
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
