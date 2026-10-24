import { isBotDate, botToday } from "../telegram-bot/telegram-calendar.js";

export function normalizeJournalImport(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 50_000) throw new Error("INVALID_IMPORT_ROWS");
  const errors = [], entries = [];
  const id = (value) => /^[1-9]\d{0,9}$/.test(String(value)) && Number(value) <= 2147483647 ? Number(value) : null;
  for (const [index, row] of rows.entries()) {
    const clientId = id(row.clientId), specialistId = id(row.specialistId), date = String(row.date || "");
    const code = !clientId ? "INVALID_CLIENT_ID" : !specialistId ? "INVALID_SPECIALIST_ID"
      : !isBotDate(date) ? "INVALID_DATE" : date > botToday() ? "FUTURE_DATE" : null;
    if (code) errors.push({ row: row.row || index + 1, code });
    else entries.push({ row: row.row || index + 1, clientId, specialistId, date });
  }
  return { entries, errors };
}

// The caller owns the transaction. Existing marks/corrections are never overwritten.
export async function importInternalJournal({ organizationId, rows, source = "Excel", apply = false, db }) {
  const parsed = normalizeJournalImport(rows);
  const errors = [...parsed.errors];
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`caregiver-roster:${organizationId}`]);
  const children = await db.query(`SELECT id, concat_ws(' ', first_name, last_name, middle_name) AS name
    FROM clients WHERE organization_id = $1 FOR SHARE`, [organizationId]);
  const staff = await db.query(`SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS name,
    COALESCE(p.label, '') AS position FROM users u
    JOIN role_options r ON r.id = u.role_id AND r.organization_id = u.organization_id
    LEFT JOIN position_options p ON p.id = u.position_id
    WHERE u.organization_id = $1 AND LOWER(CONCAT_WS(' ', r.label, p.label)) LIKE ANY
      (ARRAY['%specialist%', '%spetsialist%', '%mutaxassis%', '%специалист%']) FOR SHARE OF u`, [organizationId]);
  const lessons = await db.query("SELECT id, client_id, specialist_id, week_days FROM internal_lessons WHERE organization_id = $1 ORDER BY id FOR SHARE", [organizationId]);
  const dates = parsed.entries.map((e) => e.date).sort();
  const existing = await db.query(`SELECT id, source_lesson_id, source_client_id, source_specialist_id, schedule_date::text AS date
    FROM internal_lesson_completions WHERE organization_id = $1 AND schedule_date BETWEEN $2::date AND $3::date
    ORDER BY id FOR UPDATE`, [organizationId, dates[0] || null, dates.at(-1) || null]);
  const clients = new Map(children.rows.map((c) => [Number(c.id), c]));
  const specialists = new Map(staff.rows.map((s) => [Number(s.id), s]));
  const key = (c, s, date) => `${c}:${s}:${date}`;
  const marks = new Map();
  for (const entry of existing.rows) {
    const k = key(entry.source_client_id, entry.source_specialist_id, entry.date);
    if (!marks.has(k)) marks.set(k, []);
    marks.get(k).push(entry);
  }
  const counts = new Map(), additions = [];
  let skipped = 0;
  for (const entry of parsed.entries) {
    const child = clients.get(entry.clientId), specialist = specialists.get(entry.specialistId);
    if (!child || !specialist) {
      errors.push({ row: entry.row, clientId: entry.clientId, specialistId: entry.specialistId,
        code: !child ? "CLIENT_NOT_FOUND" : "SPECIALIST_NOT_FOUND" }); continue;
    }
    const k = key(entry.clientId, entry.specialistId, entry.date);
    const index = counts.get(k) || 0; counts.set(k, index + 1);
    const previous = marks.get(k) || [];
    if (index < previous.length) { skipped++; continue; }
    const weekday = new Date(`${entry.date}T12:00:00Z`).getUTCDay() || 7;
    const used = new Set([...previous.map((p) => Number(p.source_lesson_id)),
      ...additions.filter((a) => key(a.client_id, a.specialist_id, a.date) === k).map((a) => a.source_lesson_id)]);
    const lesson = lessons.rows.find((l) => Number(l.client_id) === entry.clientId && Number(l.specialist_id) === entry.specialistId
      && l.week_days.includes(weekday) && !used.has(Number(l.id)));
    // Historical sessions need not match today's recurring schedule. Negative
    // source IDs identify standalone occurrences; no artificial lessons are created.
    let sourceId = lesson ? Number(lesson.id) : -1;
    while (used.has(sourceId)) sourceId--;
    additions.push({ client_id: entry.clientId, specialist_id: entry.specialistId, date: entry.date,
      lesson_id: lesson ? Number(lesson.id) : null, source_lesson_id: sourceId,
      client_name: child.name, specialist_name: specialist.name, position_name: specialist.position });
  }
  const report = { rowCount: rows.length, errors, skipped, newEntries: additions.length,
    standaloneEntries: additions.filter((a) => !a.lesson_id).length, applied: false };
  if (!apply || errors.length) return report;
  if (additions.length) await db.query(`WITH inserted AS (
    INSERT INTO internal_lesson_completions (organization_id, lesson_id, client_id, specialist_id,
      source_lesson_id, source_client_id, source_specialist_id, schedule_date,
      client_name, specialist_name, position_name, completed, version)
    SELECT $1, a.lesson_id, a.client_id, a.specialist_id, a.source_lesson_id, a.client_id, a.specialist_id,
      a.date::date, a.client_name, a.specialist_name, a.position_name, TRUE, 1
    FROM jsonb_to_recordset($2::jsonb) AS a(lesson_id integer, client_id integer, specialist_id integer,
      source_lesson_id integer, date text, client_name text, specialist_name text, position_name text)
    RETURNING id
  ) INSERT INTO internal_lesson_journal_events (organization_id, completion_id, completed, version, actor_name)
    SELECT $1, id, TRUE, 1, $3 FROM inserted`,
  [organizationId, JSON.stringify(additions), `Excel import: ${source}`.slice(0, 255)]);
  return { ...report, applied: true };
}
