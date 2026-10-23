import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { isBotDate, botToday } from "../telegram-bot/telegram-calendar.js";

function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }

async function recordChange(db, { organizationId, entry, completed, actorUserId = null, actorTelegramId = null, actorName = "" }) {
  if (entry.completed === completed) return { id: String(entry.id), completed, version: entry.version, changed: false };
  const version = entry.version + 1;
  await db.query("UPDATE internal_lesson_completions SET completed = $3, version = $4 WHERE organization_id = $1 AND id = $2",
    [organizationId, entry.id, completed, version]);
  await db.query(`INSERT INTO internal_lesson_journal_events
    (organization_id, completion_id, completed, version, actor_user_id, actor_telegram_id, actor_name)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [organizationId, entry.id, completed, version, actorUserId, actorTelegramId, actorName]);
  return { id: String(entry.id), completed, version, changed: true };
}

export async function setInternalLessonCompletion({ organizationId, specialistId, lessonId, expectedClientId, date, completed, telegramUserId, db = null }) {
  if (!db) return executeTransaction((connection) => setInternalLessonCompletion({ organizationId, specialistId, lessonId, expectedClientId, date, completed, telegramUserId, db: connection }));
  if (!isBotDate(date) || !Number.isInteger(lessonId) || lessonId <= 0 || lessonId > 2147483647 || typeof completed !== "boolean") fail("INVALID_COMPLETION");
  if (date > botToday()) fail("FUTURE_LESSON");
  if (!Number.isInteger(expectedClientId) || expectedClientId <= 0 || expectedClientId > 2147483647) fail("STALE_LESSON", 409);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`internal-completion:${organizationId}:${lessonId}:${date}`]);
  const { rows: lessons } = await db.query(
    `SELECT l.id, l.client_id, l.specialist_id, concat_ws(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
      COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS specialist_name, COALESCE(p.label, '') AS position_name
     FROM internal_lessons l JOIN clients c ON c.organization_id = l.organization_id AND c.id = l.client_id
     JOIN users u ON u.organization_id = l.organization_id AND u.id = l.specialist_id
     LEFT JOIN position_options p ON p.id = u.position_id
     WHERE l.organization_id = $1 AND l.id = $2 AND l.specialist_id = $3
       AND EXTRACT(ISODOW FROM $4::date)::smallint = ANY(l.week_days) AND COALESCE(u.is_active, TRUE)
     FOR SHARE OF l, c, u`, [organizationId, lessonId, specialistId, date]
  );
  const lesson = lessons[0];
  if (!lesson) fail("LESSON_NOT_FOUND", 404);
  if (lesson.client_id !== expectedClientId) fail("STALE_LESSON", 409);
  const { rows } = await db.query(`INSERT INTO internal_lesson_completions
    (organization_id, lesson_id, client_id, specialist_id, source_lesson_id, source_client_id, source_specialist_id,
     schedule_date, client_name, specialist_name, position_name)
    VALUES ($1,$2,$3,$4,$2,$3,$4,$5::date,$6,$7,$8)
    ON CONFLICT (organization_id, source_lesson_id, source_client_id, source_specialist_id, schedule_date)
    DO UPDATE SET source_lesson_id = EXCLUDED.source_lesson_id RETURNING *`,
    [organizationId, lessonId, lesson.client_id, specialistId, date, lesson.client_name, lesson.specialist_name, lesson.position_name]);
  return recordChange(db, { organizationId, entry: rows[0], completed, actorTelegramId: telegramUserId, actorName: lesson.specialist_name });
}

export async function undoHistoricalInternalLesson({ organizationId, specialistId, completionId, date, telegramUserId, db = null }) {
  if (!db) return executeTransaction((connection) => undoHistoricalInternalLesson({ organizationId, specialistId, completionId, date, telegramUserId, db: connection }));
  if (!isBotDate(date) || !/^[1-9][0-9]{0,18}$/.test(String(completionId))) fail("INVALID_COMPLETION");
  if (date > botToday()) fail("FUTURE_LESSON");
  const { rows } = await db.query(`SELECT * FROM internal_lesson_completions
    WHERE organization_id = $1 AND id = $2 AND source_specialist_id = $3 AND schedule_date = $4::date FOR UPDATE`,
    [organizationId, completionId, specialistId, date]);
  if (!rows[0]) fail("LESSON_NOT_FOUND", 404);
  return recordChange(db, { organizationId, entry: rows[0], completed: false, actorTelegramId: telegramUserId, actorName: rows[0].specialist_name });
}

export async function correctInternalLessonCompletion({ organizationId, id, completed, expectedVersion, actorUserId }) {
  if (typeof completed !== "boolean" || !Number.isInteger(expectedVersion) || expectedVersion < 1) fail("INVALID_COMPLETION");
  return executeTransaction(async (db) => {
    const { rows } = await db.query("SELECT * FROM internal_lesson_completions WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, id]);
    if (!rows[0]) fail("LESSON_NOT_FOUND", 404);
    if (rows[0].version !== expectedVersion) fail("JOURNAL_CHANGED", 409);
    const actor = await db.query("SELECT COALESCE(NULLIF(TRIM(full_name), ''), username) AS name FROM users WHERE id = $1", [actorUserId]);
    return recordChange(db, { organizationId, entry: rows[0], completed, actorUserId, actorName: actor.rows[0]?.name || "" });
  });
}

export async function listInternalLessonJournal({ organizationId, search = "", dateFrom = "", dateTo = "", completed = null, page = 1, exportAll = false, child = "", specialist = "", position = "" }) {
  if ((dateFrom && !isBotDate(dateFrom)) || (dateTo && !isBotDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) fail("INVALID_DATE_RANGE");
  const params = [organizationId, `%${search}%`, dateFrom || null, dateTo || null, completed, `%${child}%`, `%${specialist}%`, `%${position}%`];
  const where = `e.organization_id = $1
    AND (j.client_name ILIKE $2 OR j.specialist_name ILIKE $2 OR j.position_name ILIKE $2)
    AND ($3::date IS NULL OR e.recorded_at >= ($3::date::timestamp AT TIME ZONE 'Asia/Tashkent'))
    AND ($4::date IS NULL OR e.recorded_at < (($4::date + 1)::timestamp AT TIME ZONE 'Asia/Tashkent'))
    AND ($5::boolean IS NULL OR e.completed = $5)
    AND j.client_name ILIKE $6 AND j.specialist_name ILIKE $7 AND j.position_name ILIKE $8`;
  const join = "FROM internal_lesson_journal_events e JOIN internal_lesson_completions j ON j.organization_id = e.organization_id AND j.id = e.completion_id";
  const count = await pool.query(`SELECT COUNT(*)::integer AS total ${join} WHERE ${where}`, params);
  const totalPages = Math.max(1, Math.ceil(count.rows[0].total / 20));
  const safePage = Math.min(page, totalPages);
  const { rows } = await pool.query(`SELECT e.id::text, e.completion_id::text AS "completionId", e.completed, e.version,
    e.recorded_at AS "recordedAt", e.actor_name AS "actorName", j.client_name AS "clientName",
    j.specialist_name AS "specialistName", j.position_name AS "positionName", j.version AS "currentVersion",
    j.completed AS "currentCompleted" ${join} WHERE ${where} ORDER BY e.recorded_at DESC, e.id DESC${exportAll ? "" : " LIMIT 20 OFFSET $9"}`,
    exportAll ? params : [...params, (safePage - 1) * 20]);
  return { items: rows, pagination: { page: safePage, totalPages, total: count.rows[0].total } };
}
