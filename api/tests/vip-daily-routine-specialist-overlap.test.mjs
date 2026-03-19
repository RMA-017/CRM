import assert from "node:assert/strict";
import test from "node:test";

import pool from "../src/config/db.js";
import {
  findVipClassDailyRoutineConflictForSpecialist,
  resetClientsServiceSchemaCacheForTests
} from "../src/modules/clients/clients.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("VIP daily routine specialist overlap lookup excludes the current routine on edit", async () => {
  let capturedSql = "";
  let capturedParams = [];

  resetClientsServiceSchemaCacheForTests();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: (Array.isArray(params[1]) ? params[1] : []).map((tableName) => ({ table_name: tableName }))
      };
    }
    if (queryText.includes("FROM vip_class_daily_routines r") && queryText.includes("COALESCE(r.specialist_user_id, vcta.teacher_user_id) = $2")) {
      capturedSql = queryText;
      capturedParams = Array.isArray(params) ? params : [];
      return {
        rows: [{
          id: "81",
          class_assignment_id: "12",
          class_name: "Alpha",
          activity_type: "afternoon-snack",
          start_time: "09:00",
          end_time: "10:00"
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const conflict = await findVipClassDailyRoutineConflictForSpecialist({
      organizationId: 3,
      routineId: 55,
      specialistId: 9,
      dayOfWeek: 1,
      startTime: "09:30",
      endTime: "09:45"
    });

    assert.match(capturedSql, /r\.id <> \$6/);
    assert.deepEqual(capturedParams, [3, 9, 1, "09:30", "09:45", 55]);
    assert.deepEqual(conflict, {
      routineId: "81",
      classId: "12",
      className: "Alpha",
      activityType: "afternoon-snack",
      startTime: "09:00",
      endTime: "10:00"
    });
  } finally {
    resetClientsServiceSchemaCacheForTests();
    restoreQuery();
  }
});
