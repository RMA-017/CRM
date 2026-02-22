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
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    workingHours,
    noShowThreshold: "3",
    reminderHours: "24"
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

  return {
    slotInterval: String(row.slot_interval_minutes || 30),
    visibleWeekDays: mapVisibleWeekDays(row.visible_week_days),
    workingHours: mapWorkingHours(workingHourRows),
    noShowThreshold: String(row.no_show_threshold || 1),
    reminderHours: String(row.reminder_hours || 24)
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

function toScheduleItem(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id || "").trim(),
    specialistId: String(row?.specialist_id || "").trim(),
    clientId: String(row?.client_id || "").trim(),
    appointmentDate: normalizeDateYmd(row?.appointment_date),
    startTime: normalizeTimeHm(row?.start_time),
    endTime: normalizeTimeHm(row?.end_time),
    serviceName: String(row?.service_name || "").trim(),
    status,
    note: String(row?.note || "").trim(),
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
  dateTo
}) {
  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.organization_id,
       s.specialist_id,
       s.client_id,
       s.appointment_date,
       s.start_time,
       s.end_time,
       s.service_name,
       s.status,
       s.note,
       s.created_at,
       s.updated_at,
       c.first_name,
       c.last_name,
       c.middle_name
      FROM appointment_schedules s
      JOIN clients c
        ON c.id = s.client_id
       AND c.organization_id = s.organization_id
      WHERE s.organization_id = $1
        AND s.specialist_id = $2
        AND s.appointment_date BETWEEN $3::date AND $4::date
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
  const [settingsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT COALESCE(no_show_threshold, 1) AS no_show_threshold
       FROM appointment_settings
       WHERE organization_id = $1
       LIMIT 1`,
      [organizationId]
    ),
    pool.query(
      `SELECT COUNT(*)::integer AS no_show_count
       FROM appointment_schedules
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

export async function hasAppointmentScheduleConflict({
  organizationId,
  specialistId,
  appointmentDate,
  startTime,
  endTime,
  excludeId = null
}) {
  const parsedExcludeId = Number.parseInt(String(excludeId ?? "").trim(), 10);
  const normalizedExcludeId = Number.isInteger(parsedExcludeId) && parsedExcludeId > 0
    ? parsedExcludeId
    : null;

  const { rows } = await pool.query(
    `SELECT 1
       FROM appointment_schedules s
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
  serviceName,
  status,
  note
}) {
  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO appointment_schedules (
         organization_id,
         specialist_id,
         client_id,
         appointment_date,
         start_time,
         end_time,
         service_name,
         status,
         note,
         created_by,
         updated_by
       )
       VALUES ($1,$2,$3,$4::date,$5::time,$6::time,$7,$8,$9,$10,$10)
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
       i.service_name,
       i.status,
       i.note,
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
      serviceName,
      status,
      note || null,
      actorUserId || null
    ]
  );

  return rows[0] ? toScheduleItem(rows[0]) : null;
}

export async function updateAppointmentScheduleById({
  organizationId,
  actorUserId,
  id,
  specialistId,
  clientId,
  appointmentDate,
  startTime,
  endTime,
  serviceName,
  status,
  note
}) {
  const { rows } = await pool.query(
    `WITH updated AS (
       UPDATE appointment_schedules
          SET specialist_id = $1,
              client_id = $2,
              appointment_date = $3::date,
              start_time = $4::time,
              end_time = $5::time,
              service_name = $6,
              status = $7,
              note = $8,
              updated_by = $9,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
          AND organization_id = $11
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
       u.service_name,
       u.status,
       u.note,
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
      serviceName,
      status,
      note || null,
      actorUserId || null,
      id,
      organizationId
    ]
  );

  return rows[0] ? toScheduleItem(rows[0]) : null;
}

export async function deleteAppointmentScheduleById({
  organizationId,
  id
}) {
  const { rowCount } = await pool.query(
    `DELETE FROM appointment_schedules
      WHERE id = $1
        AND organization_id = $2`,
    [id, organizationId]
  );

  return rowCount > 0;
}

export async function getAppointmentSettingsByOrganization(organizationId) {
  const [settingsResult, workingHoursResult] = await Promise.all([
    pool.query(
      `SELECT
         id,
         organization_id,
         slot_interval_minutes,
         no_show_threshold,
         reminder_hours,
         visible_week_days
       FROM appointment_settings
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
    return createDefaultSettings();
  }

  return mapSettingsRow(row, workingHoursResult.rows || []);
}

export async function saveAppointmentSettings({
  organizationId,
  actorUserId,
  slotIntervalMinutes,
  noShowThreshold,
  reminderHours,
  visibleWeekDays,
  workingHours
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const visibleWeekDayNums = visibleWeekDays
      .map((dayKey) => toDayNum(dayKey))
      .filter((dayNum) => Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 7);

    await client.query(
      `INSERT INTO appointment_settings (
         organization_id,
         slot_interval_minutes,
         no_show_threshold,
         reminder_hours,
         visible_week_days,
         created_by,
         updated_by
       ) VALUES ($1,$2,$3,$4,$5::smallint[],$6,$6)
       ON CONFLICT (organization_id) DO UPDATE SET
         slot_interval_minutes = EXCLUDED.slot_interval_minutes,
         no_show_threshold = EXCLUDED.no_show_threshold,
         reminder_hours = EXCLUDED.reminder_hours,
         visible_week_days = EXCLUDED.visible_week_days,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP`,
      [
        organizationId,
        slotIntervalMinutes,
        noShowThreshold,
        reminderHours,
        visibleWeekDayNums,
        actorUserId
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
