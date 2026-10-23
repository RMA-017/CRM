import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
process.env.JWT_SECRET ||= "caregiver-test-secret";
const { default: pool } = await import("../src/config/db.js");
const { normalizeCaregiverInput, saveCaregiver, deleteCaregiver, findCaregiverByPhone, searchCaregiverClients } = await import("../src/modules/caregivers/caregivers.service.js");
const { default: caregiversRoutes } = await import("../src/modules/caregivers/caregivers.routes.js");
const { clearRolePermissionsCache } = await import("../src/modules/users/access.service.js");
const input = { fullName: "  Test caregiver  ", phone: "90 123 45 67", clientId: 4 };

test("roster input normalizes the contact and validates a single child", () => {
  const normalized = normalizeCaregiverInput(input);
  assert.equal(normalized.phone, "+998901234567");
  assert.equal(normalized.phoneDigits, "998901234567");
  assert.equal(normalized.fullName, "Test caregiver");
  assert.equal(normalized.clientId, 4);
  for (const invalid of [{ phone: "invalid" }, { fullName: " " }, { clientId: "4" }, { clientId: -1 }]) assert.throws(() => normalizeCaregiverInput({ ...input, ...invalid }), { statusCode: 400 });
});

function transaction(t, operation) {
  const original = pool.connect, calls = [];
  pool.connect = async () => ({ query: async (sql, params) => { calls.push({ sql, params }); return operation(sql, params); }, release() {} });
  t.after(() => { pool.connect = original; });
  return calls;
}

test("foreign children abort enrollment before any writes", async (t) => {
  const calls = transaction(t, () => ({ rows: [] }));
  await assert.rejects(saveCaregiver({ organizationId: 7, input: normalizeCaregiverInput(input) }), /INVALID_CLIENTS/);
  assert.ok(calls.some(({ sql }) => sql === "ROLLBACK"));
  assert.ok(calls.every(({ sql }) => !/INSERT|DELETE|UPDATE caregivers/.test(sql)));
});

test("new roster rows reuse caregivers by phone and enroll exactly one child", async (t) => {
  const calls = transaction(t, (sql) => ({ rows: sql.includes("FROM clients") ? [{ id: 4 }] : sql.includes("INSERT INTO caregivers") ? [{ id: 9 }] : [] }));
  assert.deepEqual(await saveCaregiver({ organizationId: 7, input: normalizeCaregiverInput(input) }), { id: 4, caregiverId: 9 });
  assert.deepEqual(calls.find(({ sql }) => sql.includes("INSERT INTO caregiver_clients")).params, [7, 9, 4]);
  assert.deepEqual(calls.find(({ sql }) => sql.includes("INSERT INTO internal_lesson_clients")).params, [7, 4]);
  assert.ok(calls.find(({ sql }) => sql.includes("INSERT INTO caregivers")).sql.includes("ON CONFLICT (organization_id, phone_digits)"));
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("a child can be enrolled without a phone or caregiver and linked later without deleting lessons", async (t) => {
  let existing = false;
  const calls = transaction(t, (sql) => ({ rows: sql.includes("FROM clients") ? [{ id: 4 }] : sql.includes("SELECT client_id") && existing ? [{ client_id: 4 }] : sql.includes("INSERT INTO caregivers") ? [{ id: 9 }] : [] }));
  const added = await saveCaregiver({ organizationId: 7, input: normalizeCaregiverInput({ clientId: 4 }) });
  assert.deepEqual(added, { id: 4, caregiverId: null });
  assert.ok(!calls.some(({ sql }) => sql.includes("INSERT INTO caregivers") || sql.includes("INSERT INTO caregiver_clients")));
  existing = true;
  await saveCaregiver({ organizationId: 7, id: 4, input: normalizeCaregiverInput({ fullName: "Caregiver", phone: "901234567" }) });
  assert.ok(calls.some(({ sql }) => sql.includes("INSERT INTO caregiver_clients")));
  assert.ok(!calls.some(({ sql }) => sql.includes("DELETE FROM internal_lesson_clients")));
  assert.equal(normalizeCaregiverInput({ fullName: "Name only" }).phone, "");
});

test("duplicate child enrollment is rejected without creating another caregiver", async (t) => {
  const calls = transaction(t, (sql) => ({ rows: sql.includes("FROM clients") ? [{ id: 4 }] : sql.includes("SELECT client_id") ? [{ client_id: 4 }] : [] }));
  await assert.rejects(saveCaregiver({ organizationId: 7, input: normalizeCaregiverInput(input) }), /ALREADY_ENROLLED/);
  assert.ok(!calls.some(({ sql }) => sql.includes("INSERT INTO caregivers")));
});

test("editing keeps the child and lessons, and orphan cleanup protects caregivers shared with other children", async (t) => {
  const calls = transaction(t, (sql) => ({ rows: sql.includes("FROM clients") ? [{ id: 4 }] : sql.includes("SELECT client_id") ? [{ client_id: 4 }] : sql.includes("SELECT caregiver_id") ? [{ caregiver_id: 8 }] : sql.includes("INSERT INTO caregivers") ? [{ id: 9 }] : [] }));
  await saveCaregiver({ organizationId: 7, id: 4, input: normalizeCaregiverInput({ fullName: "Changed", phone: "901234568" }) });
  assert.deepEqual(calls.find(({ sql }) => sql.includes("INSERT INTO caregiver_clients")).params, [7, 9, 4]);
  assert.ok(calls.every(({ sql }) => !/DELETE FROM internal_|UPDATE clients/.test(sql)));
  const cleanup = calls.find(({ sql }) => sql.includes("DELETE FROM caregivers cg"));
  assert.ok(cleanup.sql.includes("NOT EXISTS"));
  assert.deepEqual(cleanup.params, [7, [8]]);
});

test("row deletion removes enrollment and links but never clients, therapy or journal events", async (t) => {
  const calls = transaction(t, (sql) => ({ rows: sql.includes("FROM clients") ? [{ id: 4 }] : sql.includes("SELECT client_id") ? [{ client_id: 4 }] : sql.includes("SELECT caregiver_id") ? [{ caregiver_id: 9 }] : [] }));
  await deleteCaregiver({ organizationId: 7, id: 4 });
  assert.deepEqual(calls.find(({ sql }) => sql.includes("DELETE FROM internal_lesson_clients")).params, [7, 4]);
  assert.ok(calls.every(({ sql }) => !/DELETE FROM clients|appointment_schedules|journal_events/.test(sql)));
  assert.ok(calls.find(({ sql }) => sql.includes("DELETE FROM caregivers cg")).sql.includes("NOT EXISTS"));
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("bot lookup normalizes phones and excludes inactive caregivers", async (t) => {
  const original = pool.query;
  pool.query = async (sql, params) => { assert.ok(sql.includes("is_active = TRUE")); assert.deepEqual(params, [7, "998901234567"]); return { rows: [] }; };
  t.after(() => { pool.query = original; });
  assert.equal(await findCaregiverByPhone({ organizationId: 7, phone: "90 123 45 67" }), null);
});

async function appFor(t, codes, operation = () => { throw new Error("Unexpected data access"); }) {
  const original = pool.query; clearRolePermissionsCache();
  pool.query = async (sql, params) => sql.includes("JOIN role_permissions") ? { rows: codes.map((code) => ({ code })) } : operation(sql, params);
  const app = Fastify();
  app.addHook("preHandler", async (request) => { request.authContext = { organizationId: 7, requester: { id: 1, role_id: 2, organization_id: 7 } }; });
  await app.register(caregiversRoutes, { prefix: "/api/users/caregivers" });
  t.after(async () => { await app.close(); pool.query = original; clearRolePermissionsCache(); });
  return app;
}

test("client and contact lookup require read permission", async (t) => {
  const app = await appFor(t, []);
  for (const url of ["/clients", "/by-phone?phone=901234567"]) assert.equal((await app.inject({ method: "GET", url: "/api/users/caregivers" + url })).statusCode, 403);
});

test("child searches shorter than three characters do not query the database", async (t) => {
  const original = pool.query;
  pool.query = async () => { throw new Error("No query expected"); };
  t.after(() => { pool.query = original; });
  for (const search of ["", "A", "Al", "  Al  "]) assert.deepEqual(await searchCaregiverClients({ organizationId: 7, search }), { items: [], hasNext: false });
});

test("client search excludes enrolled children and other organizations", async (t) => {
  const app = await appFor(t, ["users.read"], (sql, params) => {
    assert.ok(sql.includes("c.organization_id = $1") && sql.includes("NOT EXISTS"));
    assert.deepEqual(params, [7, "%child%", "child", 50]); return { rows: [{ id: 4, name: "Child" }] };
  });
  assert.equal((await app.inject({ method: "GET", url: "/api/users/caregivers/clients?q=child&page=2" })).statusCode, 200);
});

test("API prevents changing a row's child and rejects legacy multi-child payloads", async (t) => {
  const app = await appFor(t, ["users.update", "users.create"]);
  const edit = await app.inject({ method: "PUT", url: "/api/users/caregivers/4", payload: input });
  assert.equal(edit.statusCode, 400);
  const add = await app.inject({ method: "POST", url: "/api/users/caregivers/", payload: { fullName: "Name", phone: input.phone, clientIds: [4, 5] } });
  assert.equal(add.statusCode, 400);
});
