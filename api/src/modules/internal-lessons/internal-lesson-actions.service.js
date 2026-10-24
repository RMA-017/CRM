import { executeTransaction } from "../../lib/db-utils.js";
import { getInternalLessonWeekDays, normalizeInternalLesson } from "./internal-lessons.service.js";

const permissions = { create: "create", update: "update", delete: "delete", move: "update", bulkUpdate: "update", bulkDelete: "delete" };
export const lessonActionPermission = (kind) => permissions[kind] ? `appointments.internal-lessons.${permissions[kind]}` : null;
function fail(code, statusCode = 409) { throw Object.assign(new Error(code), { statusCode }); }

async function lockOrganization(db, organizationId) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`caregiver-roster:${organizationId}`]);
}

async function validateLesson(db, organizationId, item, previous = null) {
  const input = normalizeInternalLesson({ clientId: item.client_id, specialistId: item.specialist_id, weekDays: item.week_days });
  if (!input.weekDays.length) fail("INVALID_DAYS", 400);
  const days = await getInternalLessonWeekDays(organizationId, db);
  if (input.weekDays.some((day) => !days.includes(day) && !previous?.week_days.includes(day))) fail("CLOSED_DAY", 400);
  const child = await db.query("SELECT client_id FROM internal_lesson_clients WHERE organization_id = $1 AND client_id = $2 FOR KEY SHARE", [organizationId, input.clientId]);
  if (!child.rows.length) fail("INVALID_CLIENT", 400);
  const specialist = await db.query(`SELECT u.id, COALESCE(u.is_active, TRUE) AS active, r.is_active AS role_active,
    LOWER(CONCAT_WS(' ', r.label, p.label)) LIKE ANY(ARRAY['%specialist%', '%spetsialist%', '%mutaxassis%', '%специалист%']) AS specialist
    FROM users u JOIN role_options r ON r.id = u.role_id LEFT JOIN position_options p ON p.id = u.position_id
    WHERE u.organization_id = $1 AND u.id = $2 FOR SHARE OF u`, [organizationId, input.specialistId]);
  const staff = specialist.rows[0];
  if (!staff || ((!previous || previous.specialist_id !== input.specialistId)
    && (!staff.active || !staff.role_active || !staff.specialist))) fail("INVALID_SPECIALIST", 400);
}

export async function performLessonAction({ organizationId, action, db = null }) {
  if (!db) return executeTransaction((connection) => performLessonAction({ organizationId, action, db: connection }));
  if (!lessonActionPermission(action.kind)) fail("INVALID_ACTION", 400);
  await lockOrganization(db, organizationId);
  let changed = 0;
  if (action.kind === "create") {
    const input = normalizeInternalLesson(action.input);
    const item = { client_id: input.clientId, specialist_id: input.specialistId, week_days: input.weekDays };
    await validateLesson(db, organizationId, item);
    await db.query(`INSERT INTO internal_lessons (organization_id, client_id, specialist_id, week_days)
      VALUES ($1,$2,$3,$4::smallint[])`, [organizationId, item.client_id, item.specialist_id, item.week_days]);
    changed++;
  } else {
    const selected = [...action.items].sort((a, b) => a.id - b.id);
    if (new Set(selected.map((item) => item.id)).size !== selected.length) fail("INVALID_ACTION", 400);
    for (const selection of selected) {
      const { rows: [previous] } = await db.query("SELECT * FROM internal_lessons WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, selection.id]);
      if (!previous || previous.revision !== selection.revision) fail("DATA_CHANGED");
      if (["delete", "bulkDelete"].includes(action.kind)) {
        await db.query("DELETE FROM internal_lessons WHERE organization_id = $1 AND id = $2", [organizationId, previous.id]);
        changed++;
        continue;
      }
      let next;
      if (action.kind === "move") {
        if (!previous.week_days.includes(action.fromDay)) fail("DATA_CHANGED");
        if (action.fromDay !== action.toDay && previous.week_days.includes(action.toDay)) fail("DAY_ALREADY_ASSIGNED", 400);
        next = { ...previous, week_days: [...new Set([...previous.week_days.filter((day) => day !== action.fromDay), action.toDay])].sort((a, b) => a - b) };
      } else if (action.kind === "update") {
        const input = normalizeInternalLesson(action.input);
        next = { ...previous, client_id: input.clientId, specialist_id: input.specialistId, week_days: input.weekDays };
      } else {
        if (!action.specialistId && !action.weekDays && !action.addDays?.length && !action.removeDays?.length) fail("INVALID_ACTION", 400);
        if (action.addDays?.some((day) => action.removeDays?.includes(day))) fail("INVALID_ACTION", 400);
        next = { ...previous, specialist_id: action.specialistId || previous.specialist_id,
          week_days: [...new Set([...(action.weekDays || previous.week_days), ...(action.addDays || [])])]
            .filter((day) => !action.removeDays?.includes(day)).sort((a, b) => a - b) };
      }
      if (next.client_id === previous.client_id && next.specialist_id === previous.specialist_id
        && JSON.stringify(next.week_days) === JSON.stringify(previous.week_days)) continue;
      await validateLesson(db, organizationId, next, previous);
      await db.query(`UPDATE internal_lessons SET client_id = $3, specialist_id = $4, week_days = $5::smallint[]
        WHERE organization_id = $1 AND id = $2`, [organizationId, previous.id, next.client_id, next.specialist_id, next.week_days]);
      changed++;
    }
  }
  return { changed };
}
