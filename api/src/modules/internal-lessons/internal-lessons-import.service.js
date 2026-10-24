import { getInternalLessonOptions } from "./internal-lessons.service.js";

const DAY_NAMES = [
  ["monday", "понедельник", "dushanba"], ["tuesday", "вторник", "seshanba"],
  ["wednesday", "среда", "chorshanba"], ["thursday", "четверг", "payshanba"],
  ["friday", "пятница", "juma"], ["saturday", "суббота", "shanba"], ["sunday", "воскресенье", "yakshanba"]
];

export function normalizeInternalLessonImport(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 50_000) throw new Error("INVALID_IMPORT_ROWS");
  const errors = [], groups = new Map(), seen = new Set();
  for (const [index, row] of rows.entries()) {
    const number = row.row || index + 2;
    const id = (value) => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647 ? Number(value) : null;
    const clientId = id(row.clientId), specialistId = id(row.specialistId);
    const value = String(row.weekDay || "").trim().toLowerCase();
    const weekDay = /^[1-7]$/.test(value) ? Number(value) : DAY_NAMES.findIndex((names) => names.includes(value)) + 1;
    if (!clientId || !specialistId || !weekDay) {
      errors.push({ row: number, code: !clientId ? "INVALID_CLIENT_ID" : !specialistId ? "INVALID_SPECIALIST_ID" : "INVALID_WEEK_DAY" });
      continue;
    }
    const occurrence = `${clientId}:${specialistId}:${weekDay}`;
    if (seen.has(occurrence)) { errors.push({ row: number, code: "DUPLICATE_ROW" }); continue; }
    seen.add(occurrence);
    const key = `${clientId}:${specialistId}`;
    if (!groups.has(key)) groups.set(key, { clientId, specialistId, weekDays: [], sourceRows: [] });
    const item = groups.get(key);
    item.weekDays.push(weekDay); item.sourceRows.push(number);
  }
  return { rowCount: rows.length, groups: [...groups.values()].map((item) => ({ ...item, weekDays: item.weekDays.sort((a, b) => a - b) })), errors };
}

// Called within one transaction. Any invalid row prevents the entire write.
export async function importInternalLessons({ organizationId, rows, apply = false, db }) {
  const parsed = normalizeInternalLessonImport(rows);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`caregiver-roster:${organizationId}`]);
  // Share-lock referenced rows while validating; normal enrollment deletion waits for this import.
  await db.query("SELECT client_id FROM internal_lesson_clients WHERE organization_id = $1 FOR KEY SHARE", [organizationId]);
  await db.query("SELECT id FROM users WHERE organization_id = $1 FOR SHARE", [organizationId]);
  await db.query("SELECT organization_id FROM appointment_settings WHERE organization_id = $1 FOR SHARE", [organizationId]);
  const options = await getInternalLessonOptions({ organizationId, db });
  const children = new Map(options.clients.map((c) => [Number(c.id), c]));
  const specialists = new Map(options.specialists.filter((s) => s.isActive).map((s) => [Number(s.id), s]));
  const existing = await db.query("SELECT client_id, specialist_id, week_days FROM internal_lessons WHERE organization_id = $1 FOR UPDATE", [organizationId]);
  const covered = new Set(existing.rows.flatMap((l) => l.week_days.map((day) => `${l.client_id}:${l.specialist_id}:${day}`)));
  const errors = [...parsed.errors], additions = [];
  let skippedDays = 0;
  for (const item of parsed.groups) {
    const code = !children.has(item.clientId) ? "CHILD_NOT_ENROLLED" : !specialists.has(item.specialistId) ? "SPECIALIST_NOT_ACTIVE" : null;
    if (code) { errors.push({ rows: item.sourceRows, clientId: item.clientId, specialistId: item.specialistId, code }); continue; }
    const missing = item.weekDays.filter((day) => !covered.has(`${item.clientId}:${item.specialistId}:${day}`));
    if (missing.some((day) => !options.weekDays.includes(day))) {
      errors.push({ rows: item.sourceRows, clientId: item.clientId, code: "CLOSED_DAY" }); continue;
    }
    skippedDays += item.weekDays.length - missing.length;
    if (missing.length) additions.push({ ...item, weekDays: missing, clientName: children.get(item.clientId).name, specialistName: specialists.get(item.specialistId).name });
  }
  const report = { rowCount: parsed.rowCount, groups: parsed.groups.length, errors, skippedDays,
    newLessons: additions.length, newDays: additions.reduce((sum, item) => sum + item.weekDays.length, 0), applied: false };
  if (errors.length || !apply) return report;
  if (additions.length) await db.query(`INSERT INTO internal_lessons (organization_id, client_id, specialist_id, week_days)
    SELECT $1, item.client_id, item.specialist_id, ARRAY(SELECT jsonb_array_elements_text(item.days)::smallint)
    FROM jsonb_to_recordset($2::jsonb) AS item(client_id integer, specialist_id integer, days jsonb)`,
  [organizationId, JSON.stringify(additions.map((item) => ({ client_id: item.clientId, specialist_id: item.specialistId, days: item.weekDays })))]);
  return { ...report, applied: true };
}
