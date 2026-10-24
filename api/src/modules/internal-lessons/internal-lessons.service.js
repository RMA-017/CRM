import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";

const DEFAULT_WEEK_DAYS = [1, 2, 3, 4, 5, 6];
const SPECIALIST_FILTER = `(
  LOWER(CONCAT_WS(' ', r.label, p.label)) LIKE ANY(ARRAY['%specialist%', '%spetsialist%', '%mutaxassis%', '%специалист%'])
)`;

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

export function normalizeInternalLesson(body) {
  if (!Number.isInteger(body?.clientId) || body.clientId <= 0 || body.clientId > 2147483647) fail("INVALID_CLIENT");
  if (!Number.isInteger(body?.specialistId) || body.specialistId <= 0 || body.specialistId > 2147483647) fail("INVALID_SPECIALIST");
  if (!Array.isArray(body?.weekDays) || body.weekDays.length > 7
    || body.weekDays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) fail("INVALID_DAYS");
  return { clientId: body.clientId, specialistId: body.specialistId, weekDays: [...new Set(body.weekDays)].sort((a, b) => a - b) };
}

export async function getInternalLessonWeekDays(organizationId, db = pool) {
  const { rows } = await db.query("SELECT visible_week_days FROM appointment_settings WHERE organization_id = $1", [organizationId]);
  return rows[0]?.visible_week_days || [...DEFAULT_WEEK_DAYS];
}

export async function getInternalLessonOptions({ organizationId, db = pool }) {
  const clients = await db.query(
    `SELECT c.id, concat_ws(' ', c.first_name, c.last_name, c.middle_name) AS name,
       COALESCE((SELECT string_agg(cg.full_name, ', ' ORDER BY cg.full_name)
         FROM caregiver_clients cc JOIN caregivers cg ON cg.organization_id = cc.organization_id AND cg.id = cc.caregiver_id
         WHERE cc.organization_id = c.organization_id AND cc.client_id = c.id), '') AS "caregiverName"
       FROM internal_lesson_clients e JOIN clients c ON c.organization_id = e.organization_id AND c.id = e.client_id
       WHERE e.organization_id = $1 ORDER BY LOWER(c.last_name), LOWER(c.first_name), c.id`, [organizationId]
  );
  // Keep inactive specialists with existing lessons visible; new assignments require active specialists.
  const specialists = await db.query(
    `SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS name,
       (COALESCE(u.is_active, TRUE) AND r.is_active AND ${SPECIALIST_FILTER}) AS "isActive"
       FROM users u JOIN role_options r ON r.id = u.role_id LEFT JOIN position_options p ON p.id = u.position_id
       WHERE u.organization_id = $1 AND (
         (COALESCE(u.is_active, TRUE) AND r.is_active AND ${SPECIALIST_FILTER})
         OR EXISTS (SELECT 1 FROM internal_lessons l WHERE l.organization_id = u.organization_id AND l.specialist_id = u.id)
       ) ORDER BY LOWER(COALESCE(NULLIF(TRIM(u.full_name), ''), u.username)), u.id`, [organizationId]
  );
  return { clients: clients.rows, specialists: specialists.rows, weekDays: await getInternalLessonWeekDays(organizationId, db) };
}

export async function listInternalLessons({ organizationId, clientId = null, specialistId = null, exportAll = false }) {
  if (!clientId && !specialistId && !exportAll) fail("SELECT_FILTER");
  const { rows } = await pool.query(
    `SELECT l.id, l.client_id AS "clientId", l.specialist_id AS "specialistId", l.week_days AS "weekDays",
       concat_ws(' ', c.first_name, c.last_name, c.middle_name) AS "clientName",
       COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS "specialistName", COALESCE(p.label, '') AS "positionName",
       COALESCE(completions.days, '{}'::jsonb) AS "completionByDay"
       FROM internal_lessons l JOIN clients c ON c.organization_id = l.organization_id AND c.id = l.client_id
       JOIN users u ON u.organization_id = l.organization_id AND u.id = l.specialist_id
       LEFT JOIN position_options p ON p.id = u.position_id
       LEFT JOIN LATERAL (
         SELECT jsonb_object_agg(EXTRACT(ISODOW FROM entry.schedule_date)::integer::text, event.completed) AS days
         FROM internal_lesson_completions entry
         JOIN LATERAL (SELECT e.completed FROM internal_lesson_journal_events e
           WHERE e.organization_id = entry.organization_id AND e.completion_id = entry.id ORDER BY e.version DESC LIMIT 1) event ON TRUE
         WHERE entry.organization_id = l.organization_id AND entry.source_lesson_id = l.id
           AND entry.source_client_id = l.client_id AND entry.source_specialist_id = l.specialist_id
           AND entry.schedule_date >= date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
           AND entry.schedule_date < date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date + 7
       ) completions ON TRUE
       WHERE l.organization_id = $1 AND ($2::integer IS NULL OR l.client_id = $2)
         AND ($3::integer IS NULL OR l.specialist_id = $3) ORDER BY l.id`, [organizationId, clientId, specialistId]
  );
  return { items: rows };
}

export async function saveInternalLesson({ organizationId, id = null, input }) {
  return executeTransaction(async (db) => {
    let previous = null;
    if (id) {
      const existing = await db.query(
        "SELECT client_id, specialist_id, week_days FROM internal_lessons WHERE organization_id = $1 AND id = $2 FOR UPDATE",
        [organizationId, id]
      );
      previous = existing.rows[0];
      if (!previous) fail("LESSON_NOT_FOUND", 404);
    }
    if (!input.weekDays.length) fail("INVALID_DAYS");
    const visibleDays = await getInternalLessonWeekDays(organizationId, db);
    // Preserve existing days hidden by a later settings change, but do not add new lessons on closed days.
    if (input.weekDays.some((day) => !visibleDays.includes(day) && !previous?.week_days.includes(day))) fail("CLOSED_DAY");
    const child = await db.query(
      "SELECT client_id FROM internal_lesson_clients WHERE organization_id = $1 AND client_id = $2 FOR KEY SHARE",
      [organizationId, input.clientId]
    );
    if (!child.rows.length) fail("INVALID_CLIENT");
    if (!previous || previous.specialist_id !== input.specialistId) {
      const specialist = await db.query(
        `SELECT u.id FROM users u JOIN role_options r ON r.id = u.role_id LEFT JOIN position_options p ON p.id = u.position_id
         WHERE u.organization_id = $1 AND u.id = $2 AND COALESCE(u.is_active, TRUE) AND r.is_active AND ${SPECIALIST_FILTER}`,
        [organizationId, input.specialistId]
      );
      if (!specialist.rows.length) fail("INVALID_SPECIALIST");
    }
    const params = [organizationId, input.clientId, input.specialistId, input.weekDays];
    const result = id
      ? await db.query(`UPDATE internal_lessons SET client_id = $2, specialist_id = $3, week_days = $4::smallint[]
          WHERE organization_id = $1 AND id = $5 RETURNING id`, [...params, id])
      : await db.query(`INSERT INTO internal_lessons (organization_id, client_id, specialist_id, week_days)
          VALUES ($1,$2,$3,$4::smallint[]) RETURNING id`, params);
    return { id: result.rows[0].id };
  });
}

export async function deleteInternalLesson({ organizationId, id }) {
  const { rows } = await pool.query("DELETE FROM internal_lessons WHERE organization_id = $1 AND id = $2 RETURNING id", [organizationId, id]);
  if (!rows.length) fail("LESSON_NOT_FOUND", 404);
  return { ok: true };
}
