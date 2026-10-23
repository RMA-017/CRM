import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

process.env.JWT_SECRET ||= "caregiver-test-secret";
const { default: pool } = await import("../src/config/db.js");
const { normalizeCaregiverInput, saveCaregiver, findCaregiverByPhone } = await import("../src/modules/caregivers/caregivers.service.js");
const { default: caregiversRoutes } = await import("../src/modules/caregivers/caregivers.routes.js");
const { clearRolePermissionsCache } = await import("../src/modules/users/access.service.js");
const input = { fullName: "  Test caregiver  ", phone: "90 123 45 67", isActive: true, clientIds: [4, 5] };

test("caregiver input canonicalizes phone numbers and rejects malformed assignments", () => {
  const normalized = normalizeCaregiverInput({ ...input, clientIds: [4, 4, 5] });
  assert.equal(normalized.phone, "+998901234567");
  assert.equal(normalized.phoneDigits, "998901234567");
  assert.equal(normalized.fullName, "Test caregiver");
  assert.deepEqual(normalized.clientIds, [4, 5]);
  for (const invalid of [{ phone: "invalid" }, { fullName: " " }, { clientIds: ["4"] }, { clientIds: [-1] }, { isActive: "false" }]) {
    assert.throws(() => normalizeCaregiverInput({ ...input, ...invalid }), { statusCode: 400 });
  }
});

test("foreign organization children abort the transaction before any assignment is replaced", async (t) => {
  const statements = [];
  let released = false;
  const originalConnect = pool.connect;
  pool.connect = async () => ({
    query: async (sql, params) => {
      statements.push(sql);
      if (sql.includes("FROM caregivers")) { assert.deepEqual(params, [7, 2]); return { rows: [{ id: 2 }] }; }
      if (sql.includes("FROM clients")) { assert.deepEqual(params, [7, [4, 5]]); return { rows: [{ id: 4 }] }; }
      return { rows: [] };
    }, release: () => { released = true; }
  });
  t.after(() => { pool.connect = originalConnect; });
  await assert.rejects(saveCaregiver({ organizationId: 7, id: 2, input: normalizeCaregiverInput(input) }), /INVALID_CLIENTS/);
  assert.ok(statements.includes("ROLLBACK"));
  assert.ok(!statements.some((sql) => sql.includes("DELETE FROM caregiver_clients")));
  assert.equal(released, true);
});

test("caregiver and selected clients are saved atomically within the current organization", async (t) => {
  const statements = [];
  const originalConnect = pool.connect;
  pool.connect = async () => ({
    query: async (sql, params) => {
      statements.push({ sql, params });
      if (sql.includes("FROM clients")) return { rows: [{ id: 4 }, { id: 5 }] };
      if (sql.includes("INSERT INTO caregivers")) return { rows: [{ id: 9 }] };
      return { rows: [] };
    }, release() {}
  });
  t.after(() => { pool.connect = originalConnect; });
  assert.deepEqual(await saveCaregiver({ organizationId: 7, input: normalizeCaregiverInput(input) }), { id: 9 });
  assert.deepEqual(statements.find(({ sql }) => sql.includes("INSERT INTO caregiver_clients")).params, [7, 9, [4, 5]]);
  assert.equal(statements.at(-1).sql, "COMMIT");
});

test("future bot lookup normalizes phones and excludes inactive caregivers", async (t) => {
  const originalQuery = pool.query;
  let calls = 0;
  pool.query = async (sql, params) => {
    calls++;
    assert.ok(sql.includes("is_active = TRUE"));
    assert.deepEqual(params, [7, "998901234567"]);
    return { rows: [] };
  };
  t.after(() => { pool.query = originalQuery; });
  assert.equal(await findCaregiverByPhone({ organizationId: 7, phone: "90 123 45 67" }), null);
  assert.equal(calls, 1);
});

async function createApp(t, permissionCodes, operation) {
  const originalQuery = pool.query;
  clearRolePermissionsCache();
  pool.query = async (sql, params) => {
    if (sql.includes("JOIN role_permissions")) return { rows: permissionCodes.map((code) => ({ code })) };
    return operation(sql, params);
  };
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.authContext = { organizationId: 7, requester: { id: 1, role_id: 2, organization_id: 7 } };
  });
  await app.register(caregiversRoutes, { prefix: "/api/users/caregivers" });
  t.after(async () => { await app.close(); pool.query = originalQuery; clearRolePermissionsCache(); });
  return app;
}

test("client selection endpoint refuses users without users.read permission", async (t) => {
  const app = await createApp(t, [], () => { throw new Error("Client query must not run"); });
  const response = await app.inject({ method: "GET", url: "/api/users/caregivers/clients" });
  assert.equal(response.statusCode, 403);
});

test("client selector searches all clients but stays inside the current organization", async (t) => {
  const app = await createApp(t, ["users.read"], (sql, params) => {
    assert.ok(sql.includes("organization_id = $1"));
    assert.ok(!sql.includes("is_vip"));
    assert.deepEqual(params, [7, "%child%", "child", 50]);
    return { rows: [{ id: 4, name: "Child" }] };
  });
  const response = await app.inject({ method: "GET", url: "/api/users/caregivers/clients?q=child&page=2" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { items: [{ id: 4, name: "Child" }], hasNext: false });
});

test("deletion cannot remove a caregiver from another organization", async (t) => {
  const app = await createApp(t, ["users.delete"], (sql, params) => {
    assert.ok(sql.includes("WHERE organization_id = $1 AND id = $2"));
    assert.deepEqual(params, [7, 99]);
    return { rows: [] };
  });
  const response = await app.inject({ method: "DELETE", url: "/api/users/caregivers/99" });
  assert.equal(response.statusCode, 404);
});

test("invalid client IDs are rejected before writing to the database", async (t) => {
  const app = await createApp(t, ["users.create"], () => { throw new Error("No data writes expected"); });
  const response = await app.inject({ method: "POST", url: "/api/users/caregivers/", payload: { ...input, clientIds: [-1] } });
  assert.equal(response.statusCode, 400);
});
