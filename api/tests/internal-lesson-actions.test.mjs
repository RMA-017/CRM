import assert from "node:assert/strict";
import test from "node:test";
import { lessonActionPermission, performLessonAction } from "../src/modules/internal-lessons/internal-lesson-actions.service.js";

function fixture({ row = { id: 10, organization_id: 7, client_id: 4, specialist_id: 8, week_days: [1, 3], revision: 3 } } = {}) {
  const calls = [];
  return { calls, db: { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("SELECT * FROM internal_lessons")) return { rows: row ? [{ ...row }] : [] };
    if (sql.includes("SELECT visible_week_days")) return { rows: [{ visible_week_days: [1, 2, 3, 4, 5] }] };
    if (sql.includes("FROM internal_lesson_clients")) return { rows: [{ client_id: 4 }] };
    if (sql.includes("FROM users u")) return { rows: [{ id: 8, active: false, role_active: true, specialist: true }] };
    if (sql.startsWith("UPDATE internal_lessons")) return { rows: [{ ...row, client_id: params[2], specialist_id: params[3], week_days: params[4], revision: row.revision + 1 }] };
    return { rows: [] };
  } } };
}

test("moving one weekday preserves other days and supports unchanged OFF specialist", async () => {
  const f = fixture();
  const result = await performLessonAction({ organizationId: 7, db: f.db,
    action: { kind: "move", items: [{ id: 10, revision: 3 }], fromDay: 1, toDay: 5 } });
  assert.deepEqual(result, { changed: 1 });
  assert.deepEqual(f.calls.find((c) => c.sql.startsWith("UPDATE internal_lessons")).params, [7, 10, 4, 8, [3, 5]]);
  assert.ok(!f.calls.some((c) => c.sql.startsWith("UPDATE internal_lesson_completions")));
});

test("stale versions and closed days reject moves before mutation", async () => {
  for (const change of [{ revision: 2, toDay: 5 }, { revision: 3, toDay: 7 }]) {
    const f = fixture();
    await assert.rejects(performLessonAction({ organizationId: 7, db: f.db,
      action: { kind: "move", items: [{ id: 10, revision: change.revision }], fromDay: 1, toDay: change.toDay } }),
    new RegExp(change.toDay === 7 ? "CLOSED_DAY" : "DATA_CHANGED"));
    assert.ok(!f.calls.some((c) => c.sql.startsWith("UPDATE internal_lessons")));
  }
});

test("moving onto an already assigned weekday cannot silently merge two occurrences", async () => {
  const f = fixture();
  await assert.rejects(performLessonAction({ organizationId: 7, db: f.db,
    action: { kind: "move", items: [{ id: 10, revision: 3 }], fromDay: 1, toDay: 3 } }), /DAY_ALREADY_ASSIGNED/);
  assert.ok(!f.calls.some((c) => c.sql.startsWith("UPDATE internal_lessons")));
});

test("bulk day toggles keep each lesson's untouched weekdays and reject clearing the final day", async () => {
  const f = fixture();
  await performLessonAction({ organizationId: 7, db: f.db,
    action: { kind: "bulkUpdate", items: [{ id: 10, revision: 3 }], addDays: [5], removeDays: [1] } });
  assert.deepEqual(f.calls.find((c) => c.sql.startsWith("UPDATE internal_lessons")).params, [7, 10, 4, 8, [3, 5]]);
  const empty = fixture();
  await assert.rejects(performLessonAction({ organizationId: 7, db: empty.db,
    action: { kind: "bulkUpdate", items: [{ id: 10, revision: 3 }], removeDays: [1, 3] } }), /INVALID_DAYS/);
  assert.ok(!empty.calls.some((c) => c.sql.startsWith("UPDATE internal_lessons")));
});

test("deletion removes only the schedule and does not write journal or temporary action records", async () => {
  const f = fixture();
  const result = await performLessonAction({ organizationId: 7, db: f.db, action: { kind: "delete", items: [{ id: 10, revision: 3 }] } });
  assert.deepEqual(result, { changed: 1 });
  assert.ok(f.calls.some((c) => c.sql.startsWith("DELETE FROM internal_lessons")));
  assert.ok(!f.calls.some((c) => /(?:UPDATE|DELETE FROM|INSERT INTO) internal_lesson_(?:completions|journal_events|actions)/.test(c.sql)));
  assert.equal(lessonActionPermission("bulkDelete"), "appointments.internal-lessons.delete");
  assert.equal(lessonActionPermission("bulkUpdate"), "appointments.internal-lessons.update");
});
