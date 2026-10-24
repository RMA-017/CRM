import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

process.env.JWT_SECRET ||= "journal-test-secret";
const { default: pool } = await import("../src/config/db.js");
const { setInternalLessonCompletion, undoHistoricalInternalLesson, correctInternalLessonCompletion, editInternalJournalEntry, listInternalLessonJournal } = await import("../src/modules/internal-lessons/internal-lesson-journal.service.js");
const { default: journalRoutes } = await import("../src/modules/internal-lessons/internal-lesson-journal.routes.js");
const { clearRolePermissionsCache } = await import("../src/modules/users/access.service.js");

const baseInput = { organizationId: 7, specialistId: 8, lessonId: 10, expectedClientId: 4, date: "2026-10-23", completed: true, telegramUserId: 101 };
const lesson = { id: 10, client_id: 4, specialist_id: 8, client_name: "Child", specialist_name: "Specialist", position_name: "Logoped" };

test("marking and unmarking create separate events while duplicate callbacks are idempotent", async () => {
  const calls = [];
  const entry = { id: "20", completed: false, version: 0 };
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("FROM internal_lessons")) return { rows: [lesson] };
    if (sql.includes("INSERT INTO internal_lesson_completions")) return { rows: [{ ...entry }] };
    if (sql.includes("UPDATE internal_lesson_completions SET")) { entry.completed = params[2]; entry.version = params[3]; }
    return { rows: [] };
  } };
  assert.equal((await setInternalLessonCompletion({ ...baseInput, db })).changed, true);
  assert.equal((await setInternalLessonCompletion({ ...baseInput, db })).changed, false);
  assert.equal((await setInternalLessonCompletion({ ...baseInput, completed: false, db })).changed, true);
  const events = calls.filter(({ sql }) => sql.includes("INSERT INTO internal_lesson_journal_events"));
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(({ params }) => [params[2], params[3]]), [[true, 1], [false, 2]]);
  assert.equal(events[0].params[5], 101);
  assert.equal(events[0].params[6], "Specialist");
  assert.ok(!events[0].sql.includes("recorded_at"), "The database sets the actual click timestamp; clients cannot supply it.");
  assert.ok(calls.every(({ sql }) => !sql.includes("appointment_schedules")));
});

test("specialist marking validates current ownership and the selected occurrence weekday", async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  await assert.rejects(setInternalLessonCompletion({ ...baseInput, specialistId: 99, db }), /LESSON_NOT_FOUND/);
  const ownershipQuery = calls.find(({ sql }) => sql.includes("FROM internal_lessons"));
  assert.deepEqual(ownershipQuery.params, [7, 10, 99, "2026-10-23"]);
  assert.ok(ownershipQuery.sql.includes("EXTRACT(ISODOW"));
  assert.ok(!calls.some(({ sql }) => sql.includes("INSERT INTO internal_lesson_completions")));
});

test("future occurrences and stale child identities cannot create completion records", async () => {
  const noDb = { query: async () => { throw new Error("No queries expected"); } };
  await assert.rejects(setInternalLessonCompletion({ ...baseInput, date: "2199-01-01", db: noDb }), /FUTURE_LESSON/);
  await assert.rejects(setInternalLessonCompletion({ ...baseInput, expectedClientId: undefined, db: noDb }), /STALE_LESSON/);
  const calls = [];
  const db = { query: async (sql) => { calls.push(sql); return { rows: sql.includes("FROM internal_lessons") ? [{ ...lesson, client_id: 5 }] : [] }; } };
  await assert.rejects(setInternalLessonCompletion({ ...baseInput, db }), /STALE_LESSON/);
  assert.ok(!calls.some((sql) => sql.includes("INSERT INTO")));
});

test("historical undo is scoped to original specialist and date and appends rather than deletes history", async () => {
  const calls = [];
  const entry = { id: "20", completed: true, version: 1, specialist_name: "Original specialist" };
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("SELECT *")) return { rows: [{ ...entry }] };
    if (sql.includes("UPDATE internal_lesson_completions")) { entry.completed = params[2]; entry.version = params[3]; }
    return { rows: [] };
  } };
  const input = { organizationId: 7, specialistId: 8, completionId: "20", date: baseInput.date, telegramUserId: 101, db };
  await undoHistoricalInternalLesson(input);
  assert.deepEqual(calls[0].params, [7, "20", 8, baseInput.date]);
  assert.ok(calls[0].sql.includes("source_specialist_id = $3") && calls[0].sql.includes("FOR UPDATE"));
  assert.equal((await undoHistoricalInternalLesson(input)).changed, false);
  assert.equal(calls.filter(({ sql }) => sql.includes("INSERT INTO internal_lesson_journal_events")).length, 1);
  assert.ok(calls.every(({ sql }) => !sql.includes("DELETE FROM") && !sql.includes("FROM internal_lessons")));
  await assert.rejects(undoHistoricalInternalLesson({ ...input, date: "2199-01-01" }), /FUTURE_LESSON/);
  await assert.rejects(undoHistoricalInternalLesson({ ...input, db: { query: async () => ({ rows: [] }) } }), /LESSON_NOT_FOUND/);
});

test("invalid dates, lesson identifiers and completion states are rejected", async () => {
  const db = { query: async () => { throw new Error("No queries expected"); } };
  for (const changes of [{ date: "2026-02-30" }, { lessonId: -1 }, { completed: "true" }]) {
    await assert.rejects(setInternalLessonCompletion({ ...baseInput, ...changes, db }), /INVALID_COMPLETION/);
  }
});

function stubTransaction(t, operation) {
  const calls = [];
  const original = pool.connect;
  pool.connect = async () => ({ query: async (sql, params) => { calls.push({ sql, params }); return operation(sql, params); }, release() {} });
  t.after(() => { pool.connect = original; });
  return calls;
}

test("CRM corrections preserve the previous event and append an actor-attributed correction", async (t) => {
  const calls = stubTransaction(t, (sql, params) => {
    if (sql.includes("SELECT * FROM internal_lesson_completions")) { assert.deepEqual(params, [7, "20"]); return { rows: [{ id: "20", completed: true, version: 1 }] }; }
    if (sql.includes("FROM users")) return { rows: [{ name: "Administrator" }] };
    return { rows: [] };
  });
  await correctInternalLessonCompletion({ organizationId: 7, id: "20", completed: false, expectedVersion: 1, actorUserId: 2 });
  const event = calls.find(({ sql }) => sql.includes("INSERT INTO internal_lesson_journal_events"));
  assert.deepEqual(event.params, [7, "20", false, 2, 2, null, "Administrator"]);
  assert.ok(calls.every(({ sql }) => !sql.includes("DELETE FROM")));
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("a stale CRM correction cannot overwrite a later Telegram change", async (t) => {
  const calls = stubTransaction(t, (sql) => ({ rows: sql.includes("SELECT *") ? [{ id: "20", completed: false, version: 2 }] : [] }));
  await assert.rejects(correctInternalLessonCompletion({ organizationId: 7, id: "20", completed: false, expectedVersion: 1, actorUserId: 2 }), /JOURNAL_CHANGED/);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
  assert.ok(calls.every(({ sql }) => !sql.includes("UPDATE internal_lesson_completions")));
});

test("failure to save the journal rolls back the completion update", async (t) => {
  const calls = stubTransaction(t, (sql) => {
    if (sql.includes("SELECT *")) return { rows: [{ id: "20", completed: true, version: 1 }] };
    if (sql.includes("INSERT INTO internal_lesson_journal_events")) throw new Error("Storage unavailable");
    return { rows: [] };
  });
  await assert.rejects(correctInternalLessonCompletion({ organizationId: 7, id: "20", completed: false, expectedVersion: 1, actorUserId: 2 }), /Storage unavailable/);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
});

test("journal display, period filters and sorting use the lesson date with any admin correction", async (t) => {
  const original = pool.query;
  const calls = [];
  pool.query = async (sql, params) => { calls.push({ sql, params }); return { rows: sql.includes("COUNT(*)") ? [{ total: 0 }] : [] }; };
  t.after(() => { pool.query = original; });
  const result = await listInternalLessonJournal({ organizationId: 7, search: "Child", dateFrom: "2026-10-01", dateTo: "2026-10-23" });
  assert.equal(result.pagination.total, 0);
  assert.ok(calls.every(({ sql }) => sql.includes("COALESCE(j.journal_date, j.schedule_date)")));
  assert.ok(calls.every(({ sql }) => !sql.includes("e.recorded_at AT TIME ZONE")));
  assert.ok(calls[1].sql.includes('COALESCE(j.journal_date, j.schedule_date)::text AS "journalDate"'));
  assert.ok(calls[1].sql.includes("ORDER BY COALESCE(j.journal_date, j.schedule_date) DESC"));
  assert.deepEqual(calls[0].params, [7, "%Child%", "2026-10-01", "2026-10-23", null, "%%", "%%", "%%"]);
});

test("journal export includes all active records beyond the first page and remains organization scoped", async (t) => {
  const original = pool.query;
  const calls = [];
  const items = Array.from({ length: 45 }, (_, id) => ({ id: String(id + 1), completed: id % 2 === 0 }));
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: sql.includes("COUNT(*)") ? [{ total: 45 }] : items };
  };
  t.after(() => { pool.query = original; });
  const result = await listInternalLessonJournal({ organizationId: 7, exportAll: true });
  assert.equal(result.items.length, 45);
  assert.ok(!calls[1].sql.includes("LIMIT 20"));
  assert.ok(calls[1].sql.includes("j.organization_id = $1"));
  assert.ok(calls[1].sql.includes("j.completed AND e.completed") && calls[1].sql.includes("ORDER BY history.version DESC LIMIT 1"));
  assert.deepEqual(calls[1].params, [7, "%%", null, null, null, "%%", "%%", "%%"]);
});

test("journal list and Excel export apply identical period, person and status filters", async (t) => {
  const original = pool.query;
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: sql.includes("COUNT(*)") ? [{ total: 45 }] : [] };
  };
  t.after(() => { pool.query = original; });
  const filters = { organizationId: 7, child: "Ali", specialist: "Aziza", position: "Logoped", completed: false, dateFrom: "2026-10-01", dateTo: "2026-10-23" };
  await listInternalLessonJournal(filters);
  await listInternalLessonJournal({ ...filters, exportAll: true });
  assert.deepEqual(calls[1].params.slice(0, 8), calls[3].params);
  assert.deepEqual(calls[3].params, [7, "%%", "2026-10-01", "2026-10-23", false, "%Ali%", "%Aziza%", "%Logoped%"]);
  assert.ok(calls[1].sql.includes("LIMIT 20 OFFSET $9"));
  assert.ok(!calls[3].sql.includes("LIMIT 20"));
  await assert.rejects(listInternalLessonJournal({ ...filters, dateFrom: "2026-11-01" }), /INVALID_DATE_RANGE/);
});

test("journal edits validate scoped entities and keep the bot's original lesson identity", async (t) => {
  const calls = stubTransaction(t, (sql) => {
    if (sql.includes("SELECT *")) return { rows: [{ id: "20", completed: true, version: 3 }] };
    if (sql.includes("FROM clients")) return { rows: [{ name: "Changed child" }] };
    if (sql.includes("FROM users u")) return { rows: [{ name: "Changed specialist", position: "Logoped" }] };
    if (sql.includes("FROM users WHERE")) return { rows: [{ name: "Admin" }] };
    return { rows: [] };
  });
  await editInternalJournalEntry({ organizationId: 7, id: "20", date: "2026-10-20", clientId: 4, specialistId: 8, expectedVersion: 3, actorUserId: 2 });
  const update = calls.find(({ sql }) => sql.includes("SET journal_date"));
  assert.deepEqual(update.params, [7, "20", "2026-10-20", 4, 8, "Changed child", "Changed specialist", "Logoped", 4]);
  assert.ok(!update.sql.includes("source_client_id =") && !update.sql.includes("schedule_date ="));
  assert.ok(calls.some(({ sql }) => sql.includes("INSERT INTO internal_lesson_journal_events")));
});

test("journal edits reject foreign children and stale or removed records", async (t) => {
  let entry = { completed: true, version: 3 };
  stubTransaction(t, (sql) => ({ rows: sql.includes("SELECT *") ? [entry] : [] }));
  const input = { organizationId: 7, id: "20", date: "2026-10-20", clientId: 99, specialistId: 8, expectedVersion: 3, actorUserId: 2 };
  await assert.rejects(editInternalJournalEntry(input), /INVALID_CLIENT/);
  await assert.rejects(editInternalJournalEntry({ ...input, expectedVersion: 2 }), /JOURNAL_CHANGED/);
  entry = { completed: false, version: 3 };
  await assert.rejects(editInternalJournalEntry(input), /LESSON_NOT_FOUND/);
});

test("journal access does not follow planner permissions", async (t) => {
  const original = pool.query;
  clearRolePermissionsCache();
  pool.query = async (sql) => {
    if (sql.includes("JOIN role_permissions")) return { rows: [{ code: "appointments.planner.read" }] };
    throw new Error("Journal data must not be read");
  };
  const app = Fastify();
  app.addHook("preHandler", async (request) => { request.authContext = { organizationId: 7, userId: 2, requester: { id: 2, role_id: 3 } }; });
  await app.register(journalRoutes, { prefix: "/api/internal-lesson-journal" });
  t.after(async () => { await app.close(); pool.query = original; clearRolePermissionsCache(); });
  const response = await app.inject({ method: "GET", url: "/api/internal-lesson-journal/" });
  assert.equal(response.statusCode, 403);
  const exported = await app.inject({ method: "GET", url: "/api/internal-lesson-journal/export" });
  assert.equal(exported.statusCode, 403);
});
