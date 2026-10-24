import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

process.env.JWT_SECRET ||= "internal-lessons-test-secret";
const { default: pool } = await import("../src/config/db.js");
const { default: routes } = await import("../src/modules/internal-lessons/internal-lessons.routes.js");
const { normalizeInternalLesson, saveInternalLesson, getInternalLessonOptions } = await import("../src/modules/internal-lessons/internal-lessons.service.js");
const { saveCaregiver, normalizeCaregiverInput } = await import("../src/modules/caregivers/caregivers.service.js");
const { clearRolePermissionsCache } = await import("../src/modules/users/access.service.js");

const input = { clientId: 4, specialistId: 8, weekDays: [1, 3] };

function stubTransaction(t, operation) {
  const calls = [];
  const originalConnect = pool.connect;
  pool.connect = async () => ({ query: async (sql, params) => {
    calls.push({ sql, params });
    return operation(sql, params);
  }, release() {} });
  t.after(() => { pool.connect = originalConnect; });
  return calls;
}

test("internal lessons normalize weekly selections without introducing date or time fields", () => {
  assert.deepEqual(normalizeInternalLesson({ ...input, weekDays: [3, 1, 3] }), input);
  for (const changes of [{ clientId: -1 }, { specialistId: "8" }, { weekDays: [0] }, { weekDays: [1.5] }, { weekDays: "mon" }]) {
    assert.throws(() => normalizeInternalLesson({ ...input, ...changes }), { statusCode: 400 });
  }
});

test("the same child and specialist can receive multiple independent lesson cards", async (t) => {
  let nextId = 10;
  const calls = stubTransaction(t, (sql) => {
    if (sql.includes("visible_week_days")) return { rows: [{ visible_week_days: [1, 3, 5] }] };
    if (sql.includes("FROM internal_lesson_clients")) return { rows: [{ client_id: 4 }] };
    if (sql.includes("FROM users")) return { rows: [{ id: 8 }] };
    if (sql.includes("INSERT INTO internal_lessons")) return { rows: [{ id: nextId++ }] };
    return { rows: [] };
  });
  assert.deepEqual(await saveInternalLesson({ organizationId: 7, input }), { id: 10 });
  assert.deepEqual(await saveInternalLesson({ organizationId: 7, input }), { id: 11 });
  assert.equal(calls.filter(({ sql }) => sql === "COMMIT").length, 2);
  for (const { sql } of calls) assert.ok(!/appointment_schedules|vip_class|start_time|end_time|appointment_date/.test(sql));
});

test("a child from another organization cannot receive a lesson", async (t) => {
  const calls = stubTransaction(t, (sql, params) => {
    if (sql.includes("visible_week_days")) return { rows: [{ visible_week_days: [1, 3] }] };
    if (sql.includes("FROM internal_lesson_clients")) assert.deepEqual(params, [7, 4]);
    return { rows: [] };
  });
  await assert.rejects(saveInternalLesson({ organizationId: 7, input }), /INVALID_CLIENT/);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
  assert.ok(!calls.some(({ sql }) => sql.includes("INSERT INTO internal_lessons")));
});

test("new lessons cannot be added on days closed in appointment settings", async (t) => {
  const calls = stubTransaction(t, (sql) => {
    if (sql.includes("visible_week_days")) return { rows: [{ visible_week_days: [1, 2] }] };
    return { rows: [] };
  });
  await assert.rejects(saveInternalLesson({ organizationId: 7, input }), /CLOSED_DAY/);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
});

test("editing a card replaces its weekday selection and preserves existing hidden days", async (t) => {
  const calls = stubTransaction(t, (sql) => {
    if (sql.includes("FROM internal_lessons")) return { rows: [{ client_id: 4, specialist_id: 8, week_days: [1, 3] }] };
    if (sql.includes("visible_week_days")) return { rows: [{ visible_week_days: [1, 2] }] };
    if (sql.includes("FROM internal_lesson_clients")) return { rows: [{ client_id: 4 }] };
    if (sql.includes("UPDATE internal_lessons")) return { rows: [{ id: 10 }] };
    return { rows: [] };
  });
  await saveInternalLesson({ organizationId: 7, id: 10, input: { ...input, weekDays: [2, 3] } });
  const update = calls.find(({ sql }) => sql.includes("UPDATE internal_lessons"));
  assert.deepEqual(update.params, [7, 4, 8, [2, 3], 10]);
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("caregiver contact edits preserve the enrolled child's existing lessons", async (t) => {
  const calls = stubTransaction(t, (sql) => {
    if (sql.includes("FROM clients")) return { rows: [{ id: 4 }] };
    if (sql.includes("INSERT INTO caregivers")) return { rows: [{ id: 9 }] };
    if (sql.includes("FROM caregivers")) return { rows: [{ id: 9 }] };
    if (sql.includes("SELECT client_id FROM internal_lesson_clients")) return { rows: [{ client_id: 4 }] };
    if (sql.includes("FROM caregiver_clients")) return { rows: [{ caregiver_id: 9 }] };
    if (sql.includes("UPDATE caregivers")) return { rows: [{ id: 9 }] };
    return { rows: [] };
  });
  const caregiver = { fullName: "Caregiver", phone: "+998901234567" };
  await saveCaregiver({ organizationId: 7, id: 4, input: normalizeCaregiverInput(caregiver) });
  assert.ok(calls.some(({ sql }) => sql.includes("DELETE FROM caregiver_clients")));
  assert.ok(!calls.some(({ sql }) => /DELETE FROM internal_/.test(sql)));
});

test("options retain children with no caregiver and read working days from settings", async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("FROM internal_lesson_clients")) return { rows: [{ id: 4, name: "Child", caregiverName: "" }] };
    if (sql.includes("FROM users")) return { rows: [{ id: 8, name: "Specialist", isActive: true }] };
    return { rows: [{ visible_week_days: [2, 4, 6] }] };
  } };
  const result = await getInternalLessonOptions({ organizationId: 7, db });
  assert.equal(result.clients[0].caregiverName, "");
  assert.deepEqual(result.weekDays, [2, 4, 6]);
  assert.ok(!calls[0].sql.includes("JOIN caregiver_clients"));
  assert.ok(calls.every(({ params }) => params[0] === 7));
});

async function createApp(t, permissions, operation) {
  const originalQuery = pool.query;
  clearRolePermissionsCache();
  pool.query = async (sql, params) => {
    if (sql.includes("JOIN role_permissions")) return { rows: permissions.map((code) => ({ code })) };
    return operation(sql, params);
  };
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.authContext = { userId: 1, organizationId: 7, requester: { id: 1, role_id: 2, organization_id: 7 } };
  });
  await app.register(routes, { prefix: "/api/internal-lessons" });
  t.after(async () => { await app.close(); pool.query = originalQuery; clearRolePermissionsCache(); });
  return app;
}

test("planner permissions alone do not authorize access to internal lessons", async (t) => {
  const app = await createApp(t, ["appointments.planner.read"], () => { throw new Error("No data access expected"); });
  const response = await app.inject({ method: "GET", url: "/api/internal-lessons/options" });
  assert.equal(response.statusCode, 403);
});

test("both filters read the same internal lesson records within the organization", async (t) => {
  const app = await createApp(t, ["appointments.internal-lessons.read"], (sql, params) => {
    assert.ok(sql.includes("l.organization_id = $1"));
    assert.ok(sql.includes("entry.source_client_id = l.client_id") && sql.includes("entry.source_specialist_id = l.specialist_id"));
    assert.ok(sql.includes("CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent'") && sql.includes("ORDER BY e.version DESC LIMIT 1"));
    assert.deepEqual(params, [7, 4, 8]);
    return { rows: [{ id: 10, ...input, positionName: "Logoped", completionByDay: { 1: false, 5: true } }] };
  });
  const response = await app.inject({ method: "GET", url: "/api/internal-lessons/?clientId=4&specialistId=8" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items[0].id, 10);
  assert.equal(response.json().items[0].positionName, "Logoped");
  assert.deepEqual(response.json().items[0].completionByDay, { 1: false, 5: true });
});

test("unchecking all days requires delete permission and deletes only the selected card", async (t) => {
  const app = await createApp(t, ["appointments.internal-lessons.delete"], (sql, params) => {
    assert.ok(sql.startsWith("DELETE FROM internal_lessons"));
    assert.deepEqual(params, [7, 10]);
    return { rows: [{ id: 10 }] };
  });
  const response = await app.inject({ method: "PUT", url: "/api/internal-lessons/10", payload: { ...input, weekDays: [] } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
});

test("update permission cannot bypass delete permission by sending empty days", async (t) => {
  const app = await createApp(t, ["appointments.internal-lessons.update"], () => { throw new Error("No data writes expected"); });
  const response = await app.inject({ method: "PUT", url: "/api/internal-lessons/10", payload: { ...input, weekDays: [] } });
  assert.equal(response.statusCode, 403);
});

test("a nonexistent or foreign card cannot be deleted", async (t) => {
  const app = await createApp(t, ["appointments.internal-lessons.delete"], (sql, params) => {
    assert.deepEqual(params, [7, 999]);
    return { rows: [] };
  });
  const response = await app.inject({ method: "DELETE", url: "/api/internal-lessons/999" });
  assert.equal(response.statusCode, 404);
});

test("bulk delete requires delete permission and action payloads require revision checks", async (t) => {
  const app = await createApp(t, ["appointments.internal-lessons.update"], () => { throw new Error("No data writes expected"); });
  const forbidden = await app.inject({ method: "POST", url: "/api/internal-lessons/actions",
    payload: { kind: "bulkDelete", items: [{ id: 10, revision: 1 }] } });
  assert.equal(forbidden.statusCode, 403);
  for (const payload of [
    { kind: "move", items: [{ id: 10 }], fromDay: 1, toDay: 3 },
    { kind: "move", items: [{ id: 10, revision: 1 }], toDay: 3 },
    { kind: "update", items: [{ id: 10, revision: 1 }] },
    { kind: "delete", items: [{ id: 10, revision: 1 }, { id: 11, revision: 1 }] }
  ]) assert.equal((await app.inject({ method: "POST", url: "/api/internal-lessons/actions", payload })).statusCode, 400);
});

test("create action validates payload and writes only a new schedule in the authenticated organization", async (t) => {
  const app = await createApp(t, ["appointments.internal-lessons.create"], () => { throw new Error("Unexpected non-transaction query"); });
  const calls = stubTransaction(t, (sql, params) => {
    if (sql.includes("SELECT visible_week_days")) return { rows: [{ visible_week_days: [1, 3, 5] }] };
    if (sql.includes("FROM internal_lesson_clients")) return { rows: [{ client_id: 4 }] };
    if (sql.includes("FROM users u")) return { rows: [{ id: 8, active: true, role_active: true, specialist: true }] };
    if (sql.startsWith("INSERT INTO internal_lessons")) return { rows: [{ id: 10, organization_id: 7, client_id: 4, specialist_id: 8, week_days: [1, 3], revision: 1 }] };
    return { rows: [] };
  });
  const response = await app.inject({ method: "POST", url: "/api/internal-lessons/actions", payload: { kind: "create", input } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().changed, 1);
  assert.deepEqual(response.json(), { changed: 1 });
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("removed schedule undo endpoint is unavailable", async (t) => {
  const app = await createApp(t, ["appointments.internal-lessons.read"], () => { throw new Error("No database access expected"); });
  const response = await app.inject({ method: "POST", url: "/api/internal-lessons/undo", payload: { token: "00000000-0000-4000-8000-000000000001" } });
  assert.equal(response.statusCode, 404);
});
