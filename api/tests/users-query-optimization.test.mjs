import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import { getUsersPage } from "../src/modules/users/users.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("getUsersPage uses one paged query and preserves page clamping", async () => {
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const queryText = String(sql || "");

    assert.match(queryText, /WITH filtered_users AS/i);
    assert.deepEqual(params.slice(-2), [20, 5]);
    return {
      rows: [{
        total: 21,
        total_pages: 2,
        id: "9",
        organization_id: "3",
        organization_code: "main",
        organization_name: "Main",
        username: "alice",
        email: "alice@example.com",
        full_name: "Alice User",
        birthday: "2000-01-01",
        phone_number: "+998900000000",
        position_id: "4",
        role_id: "5",
        position: "Teacher",
        role: "Manager",
        created_at: "2026-03-10T00:00:00.000Z",
        _sort_user_id: 9
      }]
    };
  });

  try {
    const result = await getUsersPage({
      organizationId: 3,
      page: 5,
      limit: 20,
      canReadAllOrganizations: false,
      organizationCode: "",
      search: ""
    });

    assert.equal(callCount, 1);
    assert.equal(result.total, 21);
    assert.equal(result.totalPages, 2);
    assert.equal(result.page, 2);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].id, "9");
    assert.equal(Object.hasOwn(result.rows[0], "_sort_user_id"), false);
  } finally {
    restoreQuery();
  }
});
