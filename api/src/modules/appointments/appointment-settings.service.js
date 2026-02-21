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
    breakDurationMinutes: "60",
    visibleWeekDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    workingHours,
    bufferAfter: "10",
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
    breakDurationMinutes: String(row.break_time_minutes || 0),
    visibleWeekDays: mapVisibleWeekDays(row.visible_week_days),
    workingHours: mapWorkingHours(workingHourRows),
    bufferAfter: String(row.buffer_time_minutes || 0),
    noShowThreshold: String(row.no_show_threshold || 1),
    reminderHours: String(row.reminder_hours || 24)
  };
}

export function getAppointmentDayKeys() {
  return DAY_KEYS;
}

export function toAppointmentDayNum(dayKey) {
  return toDayNum(dayKey);
}

export async function getAppointmentSettingsByOrganization(organizationId) {
  const [settingsResult, workingHoursResult] = await Promise.all([
    pool.query(
      `SELECT
         id,
         organization_id,
         slot_interval_minutes,
         break_time_minutes,
         buffer_time_minutes,
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
  breakTimeMinutes,
  bufferTimeMinutes,
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
         break_time_minutes,
         buffer_time_minutes,
         no_show_threshold,
         reminder_hours,
         visible_week_days,
         created_by,
         updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::smallint[],$8,$8)
       ON CONFLICT (organization_id) DO UPDATE SET
         slot_interval_minutes = EXCLUDED.slot_interval_minutes,
         break_time_minutes = EXCLUDED.break_time_minutes,
         buffer_time_minutes = EXCLUDED.buffer_time_minutes,
         no_show_threshold = EXCLUDED.no_show_threshold,
         reminder_hours = EXCLUDED.reminder_hours,
         visible_week_days = EXCLUDED.visible_week_days,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP`,
      [
        organizationId,
        slotIntervalMinutes,
        breakTimeMinutes,
        bufferTimeMinutes,
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
           end_time
         ) VALUES ($1,$2,$3,$4::time,$5::time)
         ON CONFLICT (organization_id, day_of_week) DO UPDATE SET
           is_active = EXCLUDED.is_active,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           updated_at = CURRENT_TIMESTAMP`,
        [
          organizationId,
          dayNum,
          isActive,
          isActive ? startTime : null,
          isActive ? endTime : null
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
