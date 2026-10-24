import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { isBotDate, botToday } from "../telegram-bot/telegram-calendar.js";

function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }

async function recordChange(db, { organizationId, entry, completed, actorUserId = null, actorTelegramId = null, actorName = "" }) {
  if (entry.completed === completed) return { id: String(entry.id), completed, version: entry.version, changed: false };
  const version = entry.version + 1;
  await db.query(`UPDATE internal_lesson_completions SET completed = $3, version = $4,
    journal_date = CASE WHEN $3 THEN NULL ELSE journal_date END,
    journal_client_id = CASE WHEN $3 THEN NULL ELSE journal_client_id END,
    journal_specialist_id = CASE WHEN $3 THEN NULL ELSE journal_specialist_id END,
    journal_client_name = CASE WHEN $3 THEN NULL ELSE journal_client_name END,
    journal_specialist_name = CASE WHEN $3 THEN NULL ELSE journal_specialist_name END,
    journal_position_name = CASE WHEN $3 THEN NULL ELSE journal_position_name END
    WHERE organization_id = $1 AND id = $2`,
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

export async function getInternalJournalOptions({ organizationId }) {
  const clients = await pool.query(`SELECT id, concat_ws(' ', last_name, first_name, middle_name) AS name
    FROM clients WHERE organization_id = $1 ORDER BY LOWER(last_name), LOWER(first_name), id`, [organizationId]);
  const specialists = await pool.query(`SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS name, COALESCE(p.label, '') AS position
    FROM users u JOIN role_options r ON r.id = u.role_id LEFT JOIN position_options p ON p.id = u.position_id
    WHERE u.organization_id = $1 AND (LOWER(CONCAT_WS(' ', r.label, p.label)) LIKE ANY(ARRAY['%specialist%', '%spetsialist%', '%mutaxassis%', '%специалист%'])
      OR EXISTS (SELECT 1 FROM internal_lesson_completions j WHERE j.organization_id = u.organization_id AND j.source_specialist_id = u.id))
    ORDER BY LOWER(COALESCE(NULLIF(TRIM(u.full_name), ''), u.username)), u.id`, [organizationId]);
  return { clients: clients.rows, specialists: specialists.rows };
}

export async function editInternalJournalEntry({ organizationId, id, date, clientId, specialistId, expectedVersion, actorUserId }) {
  if (!isBotDate(date) || !Number.isInteger(clientId) || clientId < 1 || !Number.isInteger(specialistId) || specialistId < 1
    || !Number.isInteger(expectedVersion) || expectedVersion < 1) fail("INVALID_COMPLETION");
  return executeTransaction(async (db) => {
    const result = await db.query("SELECT * FROM internal_lesson_completions WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, id]);
    const entry = result.rows[0];
    if (!entry || !entry.completed) fail("LESSON_NOT_FOUND", 404);
    if (entry.version !== expectedVersion) fail("JOURNAL_CHANGED", 409);
    const child = await db.query(`SELECT concat_ws(' ', last_name, first_name, middle_name) AS name FROM clients
      WHERE organization_id = $1 AND id = $2 FOR SHARE`, [organizationId, clientId]);
    if (!child.rows[0]) fail("INVALID_CLIENT");
    const specialist = await db.query(`SELECT COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS name, COALESCE(p.label, '') AS position
      FROM users u JOIN role_options r ON r.id = u.role_id LEFT JOIN position_options p ON p.id = u.position_id
      WHERE u.organization_id = $1 AND u.id = $2 AND (LOWER(CONCAT_WS(' ', r.label, p.label)) LIKE ANY(ARRAY['%specialist%', '%spetsialist%', '%mutaxassis%', '%специалист%'])
        OR EXISTS (SELECT 1 FROM internal_lesson_completions j WHERE j.organization_id = u.organization_id AND j.source_specialist_id = u.id)) FOR SHARE OF u`, [organizationId, specialistId]);
    if (!specialist.rows[0]) fail("INVALID_SPECIALIST");
    const actor = await db.query("SELECT COALESCE(NULLIF(TRIM(full_name), ''), username) AS name FROM users WHERE id = $1", [actorUserId]);
    const version = entry.version + 1;
    await db.query(`UPDATE internal_lesson_completions SET journal_date = $3::date, journal_client_id = $4, journal_specialist_id = $5,
      journal_client_name = $6, journal_specialist_name = $7, journal_position_name = $8, version = $9 WHERE organization_id = $1 AND id = $2`,
      [organizationId, id, date, clientId, specialistId, child.rows[0].name, specialist.rows[0].name, specialist.rows[0].position, version]);
    await db.query(`INSERT INTO internal_lesson_journal_events (organization_id, completion_id, completed, version, actor_user_id, actor_name)
      VALUES ($1,$2,TRUE,$3,$4,$5)`, [organizationId, id, version, actorUserId, actor.rows[0]?.name || ""]);
    return { id: String(id), version };
  });
}

export async function listInternalLessonJournal({ organizationId, search = "", dateFrom = "", dateTo = "", completed = null, page = 1, exportAll = false, child = "", specialist = "", position = "" }) {
  if ((dateFrom && !isBotDate(dateFrom)) || (dateTo && !isBotDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) fail("INVALID_DATE_RANGE");
  const params = [organizationId, `%${search}%`, dateFrom || null, dateTo || null, completed, `%${child}%`, `%${specialist}%`, `%${position}%`];
  const journalDate = "COALESCE(j.journal_date, j.schedule_date)";
  const clientName = "COALESCE(j.journal_client_name, j.client_name)", specialistName = "COALESCE(j.journal_specialist_name, j.specialist_name)", positionName = "COALESCE(j.journal_position_name, j.position_name)";
  const where = `j.organization_id = $1 AND j.completed AND e.completed
    AND (${clientName} ILIKE $2 OR ${specialistName} ILIKE $2 OR ${positionName} ILIKE $2)
    AND ($3::date IS NULL OR ${journalDate} >= $3::date)
    AND ($4::date IS NULL OR ${journalDate} <= $4::date)
    AND ($5::boolean IS NULL OR e.completed = $5)
    AND ${clientName} ILIKE $6 AND ${specialistName} ILIKE $7 AND ${positionName} ILIKE $8`;
  const join = `FROM internal_lesson_completions j JOIN LATERAL (SELECT * FROM internal_lesson_journal_events history
    WHERE history.organization_id = j.organization_id AND history.completion_id = j.id ORDER BY history.version DESC LIMIT 1) e ON TRUE`;
  const count = await pool.query(`SELECT COUNT(*)::integer AS total ${join} WHERE ${where}`, params);
  const totalPages = Math.max(1, Math.ceil(count.rows[0].total / 20));
  const safePage = Math.min(page, totalPages);
  const { rows } = await pool.query(`SELECT j.id::text, j.id::text AS "completionId", e.completed, e.version,
    ${journalDate}::text AS "journalDate", e.recorded_at AS "recordedAt",
    COALESCE(j.journal_client_id, j.client_id) AS "clientId", COALESCE(j.journal_specialist_id, j.specialist_id) AS "specialistId",
    ${clientName} AS "clientName", ${specialistName} AS "specialistName", ${positionName} AS "positionName",
    j.version AS "currentVersion", j.completed AS "currentCompleted" ${join} WHERE ${where} ORDER BY ${journalDate} DESC, j.id DESC${exportAll ? "" : " LIMIT 20 OFFSET $9"}`,
    exportAll ? params : [...params, (safePage - 1) * 20]);
  return { items: rows, pagination: { page: safePage, totalPages, total: count.rows[0].total } };
}
