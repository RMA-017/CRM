import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInternalLessonImport, importInternalLessons } from "../src/modules/internal-lessons/internal-lessons-import.service.js";

test("import groups Russian, Uzbek, English and numbered weekdays without losing occurrences", () => {
  const result = normalizeInternalLessonImport([
    { clientId: "1148", specialistId: "11", weekDay: "Понедельник" },
    { clientId: 1148, specialistId: 11, weekDay: "Juma" },
    { clientId: 1148, specialistId: 12, weekDay: "Tuesday" },
    { clientId: 1148, specialistId: 12, weekDay: 3 }
  ]);
  assert.deepEqual(result.groups.map((g) => g.weekDays), [[1, 5], [2, 3]]);
  assert.equal(result.errors.length, 0);
  const bad = normalizeInternalLessonImport([
    { row: 2, clientId: 1, specialistId: 2, weekDay: "Friday" },
    { row: 3, clientId: 1, specialistId: 2, weekDay: 5 },
    { row: 4, clientId: "1x", specialistId: 2, weekDay: 5 },
    { row: 5, clientId: 1, specialistId: 2, weekDay: "wrong" }
  ]);
  assert.deepEqual(bad.errors.map((e) => e.code), ["DUPLICATE_ROW", "INVALID_CLIENT_ID", "INVALID_WEEK_DAY"]);
});

function fixture() {
  const writes = [];
  const db = { query: async (sql, params) => {
    if (sql.includes("INSERT INTO internal_lessons")) { writes.push(params); return { rows: [] }; }
    if (sql.includes('AS "isActive"')) return { rows: [{ id: 11, name: "Specialist", isActive: true }] };
    if (sql.includes('AS "caregiverName"')) return { rows: [{ id: 1148, name: "Child" }] };
    if (sql.includes("SELECT visible_week_days")) return { rows: [{ visible_week_days: [1, 2, 3, 4, 5] }] };
    if (sql.includes("SELECT client_id, specialist_id")) return { rows: [{ client_id: 1148, specialist_id: 11, week_days: [1] }] };
    return { rows: [] };
  } };
  return { db, writes };
}

test("import preview never writes; apply only adds missing days and keeps existing schedules", async () => {
  const f = fixture();
  const args = { organizationId: 7, db: f.db, rows: [1, 5].map((weekDay) => ({ clientId: 1148, specialistId: 11, weekDay })) };
  const preview = await importInternalLessons(args);
  assert.equal(preview.skippedDays, 1); assert.equal(preview.newDays, 1); assert.equal(f.writes.length, 0);
  const applied = await importInternalLessons({ ...args, apply: true });
  assert.equal(applied.applied, true);
  assert.deepEqual(JSON.parse(f.writes[0][1]), [{ client_id: 1148, specialist_id: 11, days: [5] }]);
});

test("any missing child, inactive specialist or closed day blocks all writes", async () => {
  for (const change of [{ clientId: 999 }, { specialistId: 999 }, { weekDay: 7 }]) {
    const f = fixture();
    const result = await importInternalLessons({ organizationId: 7, db: f.db, apply: true, rows: [
      { clientId: 1148, specialistId: 11, weekDay: 5 },
      { clientId: 1148, specialistId: 11, weekDay: 3, ...change }
    ] });
    assert.equal(result.errors.length, 1); assert.equal(result.applied, false); assert.equal(f.writes.length, 0);
  }
});
