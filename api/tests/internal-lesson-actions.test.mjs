import assert from "node:assert/strict";
import test from "node:test";
import { lessonActionPermission, performLessonAction, undoLessonAction } from "../src/modules/internal-lessons/internal-lesson-actions.service.js";

function fixture({ row = { id: 10, organization_id: 7, client_id: 4, specialist_id: 8, week_days: [1, 3], revision: 3 }, undo = null } = {}) {
  const calls = [];
  return { calls, db: { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("SELECT * FROM internal_lesson_actions")) return { rows: undo ? [undo] : [] };
    if (sql.includes("SELECT * FROM internal_lessons")) return { rows: row ? [{ ...row }] : [] };
    if (sql.includes("SELECT visible_week_days")) return { rows: [{ visible_week_days: [1, 2, 3, 4, 5] }] };
    if (sql.includes("FROM internal_lesson_clients")) return { rows: [{ client_id: 4 }] };
    if (sql.includes("FROM users u")) return { rows: [{ id: 8, active: false, role_active: true, specialist: true }] };
    if (sql.startsWith("UPDATE internal_lessons")) return { rows: [{ ...row, client_id: params[2], specialist_id: params[3], week_days: params[4], revision: row.revision + 1 }] };
    if (sql.includes("SELECT id::text FROM internal_lesson_completions")) return { rows: [{ id: "99" }] };
    if (sql.startsWith("INSERT INTO internal_lesson_actions")) return { rows: [{ expires_at: new Date(Date.now() + 45000) }] };
    return { rows: [] };
  } } };
}

test("moving one weekday preserves other days, supports unchanged OFF specialist, and returns an owner-scoped undo", async () => {
  const f = fixture();
  const result = await performLessonAction({ organizationId: 7, userId: 1, db: f.db,
    action: { kind: "move", items: [{ id: 10, revision: 3 }], fromDay: 1, toDay: 5 } });
  assert.equal(result.changed, 1); assert.ok(result.undoToken);
  assert.deepEqual(f.calls.find((c) => c.sql.startsWith("UPDATE internal_lessons")).params, [7, 10, 4, 8, [3, 5]]);
  const stored = f.calls.find((c) => c.sql.startsWith("INSERT INTO internal_lesson_actions"));
  assert.deepEqual(stored.params.slice(1, 4), [7, 1, "appointments.internal-lessons.update"]);
  assert.deepEqual(JSON.parse(stored.params[4])[0].before.week_days, [1, 3]);
  assert.ok(!f.calls.some((c) => c.sql.startsWith("UPDATE internal_lesson_completions")));
});

test("stale versions and closed days reject moves before mutation", async () => {
  for (const change of [{ revision: 2, toDay: 5 }, { revision: 3, toDay: 7 }]) {
    const f = fixture();
    await assert.rejects(performLessonAction({ organizationId: 7, userId: 1, db: f.db,
      action: { kind: "move", items: [{ id: 10, revision: change.revision }], fromDay: 1, toDay: change.toDay } }),
    new RegExp(change.toDay === 7 ? "CLOSED_DAY" : "DATA_CHANGED"));
    assert.ok(!f.calls.some((c) => c.sql.startsWith("UPDATE internal_lessons")));
  }
});

test("moving onto an already assigned weekday cannot silently merge two occurrences", async () => {
  const f = fixture();
  await assert.rejects(performLessonAction({ organizationId: 7, userId: 1, db: f.db,
    action: { kind: "move", items: [{ id: 10, revision: 3 }], fromDay: 1, toDay: 3 } }), /DAY_ALREADY_ASSIGNED/);
  assert.ok(!f.calls.some((c) => c.sql.startsWith("UPDATE internal_lessons")));
});

test("delete records journal links without removing history, and undo requires both delete and create permissions", async () => {
  const f = fixture();
  await performLessonAction({ organizationId: 7, userId: 1, db: f.db, action: { kind: "delete", items: [{ id: 10, revision: 3 }] } });
  const stored = JSON.parse(f.calls.find((c) => c.sql.startsWith("INSERT INTO internal_lesson_actions")).params[4]);
  assert.deepEqual(stored[0].completionIds, ["99"]);
  assert.ok(!f.calls.some((c) => c.sql.startsWith("DELETE FROM internal_lesson_completions")));
  const denied = fixture({ row: null, undo: { permission: "appointments.internal-lessons.delete", changes: stored } });
  await assert.rejects(undoLessonAction({ organizationId: 7, userId: 1, db: denied.db, token: "test",
    can: (permission) => permission.endsWith("delete") }), /Forbidden/);
  assert.ok(!denied.calls.some((c) => c.sql.startsWith("INSERT INTO internal_lessons")));
});

test("undo refuses expired tokens and concurrent edits", async () => {
  const f = fixture();
  await assert.rejects(undoLessonAction({ organizationId: 7, userId: 1, token: "expired", db: f.db, can: () => true }), /UNDO_EXPIRED/);
  const stale = fixture({ undo: { permission: "appointments.internal-lessons.update", changes: [
    { before: { id: 10, revision: 1 }, after: { id: 10, revision: 2 } }
  ] } });
  await assert.rejects(undoLessonAction({ organizationId: 7, userId: 1, token: "test", db: stale.db, can: () => true }), /DATA_CHANGED/);
  assert.equal(lessonActionPermission("bulkDelete"), "appointments.internal-lessons.delete");
  assert.equal(lessonActionPermission("bulkUpdate"), "appointments.internal-lessons.update");
});
