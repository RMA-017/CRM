import assert from "node:assert/strict";
import test from "node:test";

import pool from "../src/config/db.js";
import {
  getVipClassDailyRoutineSpecialists,
  resetClientsServiceSchemaCacheForTests
} from "../src/modules/clients/clients.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("VIP daily routine specialist picker only keeps specialist-role users", async () => {
  resetClientsServiceSchemaCacheForTests();
  let capturedSql = "";

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM information_schema.columns")) {
      return {
        rows: [
          { column_name: "organization_id" },
          { column_name: "class_assignment_id" },
          { column_name: "day_of_week" },
          { column_name: "activity_type" },
          { column_name: "start_time" },
          { column_name: "end_time" },
          { column_name: "specialist_user_id" },
          { column_name: "mandatory_exercises" },
          { column_name: "note" },
          { column_name: "created_by" },
          { column_name: "updated_by" },
          { column_name: "created_at" },
          { column_name: "updated_at" }
        ]
      };
    }
    if (queryText.includes("WITH accessible_classes AS") && queryText.includes("organization_specialists")) {
      capturedSql = queryText;
      return {
        rows: [
          {
            class_assignment_id: "99",
            specialist_user_id: "9",
            specialist_name: "Ali",
            specialist_role: "Speech therapist Specialist"
          }
        ]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const items = await getVipClassDailyRoutineSpecialists({
      organizationId: 3,
      classId: 99,
      limit: 50
    });

    assert.match(capturedSql, /organization_specialists/);
    assert.match(capturedSql, /LOWER\(TRIM\(r\.label\)\) LIKE '%specialist%'/);
    assert.doesNotMatch(capturedSql, /teacher_user_id AS specialist_user_id/);
    assert.doesNotMatch(capturedSql, /tutor_user_id AS specialist_user_id/);
    assert.deepEqual(items, [
      {
        class_assignment_id: "99",
        specialist_user_id: "9",
        specialist_name: "Ali",
        specialist_role: "Speech therapist Specialist"
      }
    ]);
  } finally {
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});
