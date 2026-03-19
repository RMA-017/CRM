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
    if (queryText.includes("FROM specialist_sources ss")) {
      return {
        rows: [
          {
            class_assignment_id: "99",
            specialist_user_id: "9",
            specialist_name: "Ali",
            position_label: "Speech therapist",
            role_label: "Specialist",
            specialist_role: "Speech therapist"
          },
          {
            class_assignment_id: "99",
            specialist_user_id: "10",
            specialist_name: "Teacher",
            position_label: "",
            role_label: "Teacher",
            specialist_role: "Teacher"
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

    assert.deepEqual(items, [
      {
        class_assignment_id: "99",
        specialist_user_id: "9",
        specialist_name: "Ali",
        specialist_role: "Speech therapist"
      }
    ]);
  } finally {
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});
