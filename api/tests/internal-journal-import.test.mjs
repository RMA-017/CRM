import assert from "node:assert/strict";
import test from "node:test";
import { normalizeJournalImport, importInternalJournal } from "../src/modules/internal-lessons/internal-journal-import.service.js";
import { botToday, shiftBotDate } from "../src/modules/telegram-bot/telegram-calendar.js";

test("journal validates dates and IDs but retains repeated same-day sessions", () => {
  const row = { date: "2020-10-23", clientId: "4", specialistId: "8" };
  assert.equal(normalizeJournalImport([row, row]).entries.length, 2);
  const result = normalizeJournalImport([{ ...row, date: "2020-02-30" }, { ...row, clientId: "4x" },
    { ...row, specialistId: 0 }, { ...row, date: shiftBotDate(botToday(), 1) }]);
  assert.deepEqual(result.errors.map((e) => e.code), ["INVALID_DATE", "INVALID_CLIENT_ID", "INVALID_SPECIALIST_ID", "FUTURE_DATE"]);
});

function fixture({ existing = [], lessons = [{ id: 10, client_id: 4, specialist_id: 8, week_days: [5] }] } = {}) {
  const writes = [];
  const db = { query: async (sql, params) => {
    if (sql.includes("WITH inserted")) { writes.push(params); return { rows: [] }; }
    if (sql.includes("FROM clients")) return { rows: [{ id: 4, name: "Child Surname" }] };
    if (sql.includes("FROM users u")) return { rows: [{ id: 8, name: "OFF Specialist", position: "Logoped" }] };
    if (sql.includes("FROM internal_lessons")) return { rows: lessons };
    if (sql.includes("FROM internal_lesson_completions")) return { rows: existing };
    return { rows: [] };
  } };
  return { db, writes };
}

test("journal preview never writes; import marks matching lesson and stores extra session as standalone history", async () => {
  const f = fixture();
  const rows = [1, 2].map(() => ({ date: "2020-10-23", clientId: 4, specialistId: 8 }));
  assert.equal((await importInternalJournal({ organizationId: 7, rows, db: f.db })).newEntries, 2);
  assert.equal(f.writes.length, 0);
  const result = await importInternalJournal({ organizationId: 7, rows, db: f.db, apply: true, source: "234.xlsx" });
  assert.equal(result.applied, true); assert.equal(result.standaloneEntries, 1);
  const inserted = JSON.parse(f.writes[0][1]);
  assert.deepEqual(inserted.map((i) => [i.lesson_id, i.source_lesson_id]), [[10, 10], [null, -1]]);
  assert.equal(inserted[0].date, "2020-10-23");
  assert.equal(f.writes[0][2], "Excel import: 234.xlsx");
});

test("existing completed or removed marks are preserved on reimport; missing IDs block all writes", async () => {
  const row = { date: "2020-10-23", clientId: 4, specialistId: 8 };
  const f = fixture({ existing: [{ source_lesson_id: 10, source_client_id: 4, source_specialist_id: 8, date: row.date }] });
  const result = await importInternalJournal({ organizationId: 7, rows: [row], db: f.db, apply: true });
  assert.equal(result.skipped, 1); assert.equal(f.writes.length, 0);
  const invalid = await importInternalJournal({ organizationId: 7, rows: [row, { ...row, clientId: 999 }], db: f.db, apply: true });
  assert.equal(invalid.applied, false); assert.equal(invalid.errors[0].code, "CLIENT_NOT_FOUND");
  assert.equal(f.writes.length, 0);
});
