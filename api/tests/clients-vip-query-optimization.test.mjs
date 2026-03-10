import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import {
  getVipClassAssignmentOptions,
  getVipClassAssignments,
  resetClientsServiceSchemaCacheForTests
} from "../src/modules/clients/clients.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("getVipClassAssignments uses aggregated tutor stats instead of per-row subqueries", async () => {
  resetClientsServiceSchemaCacheForTests();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }

    assert.match(queryText, /BOOL_OR\(vta\.tutor_user_id = \$3::integer\)/);
    assert.match(queryText, /GROUP BY vta\.class_assignment_id/);
    assert.doesNotMatch(queryText, /\(\s*SELECT COUNT\(\*\)::int\s+FROM vip_client_tutor_assignments/s);
    return {
      rows: [{
        id: "10",
        class_name: "Group A",
        teacher_user_id: "7",
        teacher_name: "Teacher User",
        children_count: 2,
        created_by: "5",
        created_by_name: "Manager User",
        created_at: "2026-03-10T00:00:00.000Z"
      }]
    };
  });

  try {
    const result = await getVipClassAssignments({
      organizationId: 3,
      assignedUserId: 7,
      limit: 20
    });

    assert.equal(callCount, 2);
    assert.equal(result.length, 1);
    assert.equal(result[0].children_count, 2);
  } finally {
    restoreQuery();
    resetClientsServiceSchemaCacheForTests();
  }
});

test("getVipClassAssignmentOptions uses aggregated assigned-scope lookup", async () => {
  resetClientsServiceSchemaCacheForTests();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }

    assert.match(queryText, /BOOL_OR\(vta\.tutor_user_id = \$3::integer\)/);
    assert.match(queryText, /GROUP BY vta\.class_assignment_id/);
    assert.doesNotMatch(queryText, /EXISTS\s*\(\s*SELECT 1\s+FROM vip_client_tutor_assignments/s);
    return {
      rows: [{
        id: "10",
        class_name: "Group A",
        teacher_user_id: "7",
        teacher_name: "Teacher User"
      }]
    };
  });

  try {
    const result = await getVipClassAssignmentOptions({
      organizationId: 3,
      assignedUserId: 7,
      limit: 50
    });

    assert.equal(callCount, 2);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "10");
  } finally {
    restoreQuery();
    resetClientsServiceSchemaCacheForTests();
  }
});
