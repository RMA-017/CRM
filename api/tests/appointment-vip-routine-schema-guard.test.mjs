import assert from "node:assert/strict";
import test from "node:test";

import pool from "../src/config/db.js";
import {
  getAppointmentSchedulesByRange,
  resetAppointmentServiceSchemaCacheForTests
} from "../src/modules/appointments/appointment-settings.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("appointment schedules range throws migration-required when VIP routine specialist columns are missing", async () => {
  resetAppointmentServiceSchemaCacheForTests();

  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM information_schema.tables")) {
      return {
        rows: [{ table_name: "vip_class_daily_routines" }]
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
          { column_name: "note" },
          { column_name: "created_at" },
          { column_name: "updated_at" }
        ]
      };
    }
    if (queryText.includes("FROM appointment_schedules s")) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    await assert.rejects(
      () => getAppointmentSchedulesByRange({
        organizationId: 3,
        specialistId: 74,
        clientId: null,
        classId: null,
        dateFrom: "2026-03-16",
        dateTo: "2026-03-21"
      }),
      (error) => {
        assert.equal(error?.code, "MIGRATION_REQUIRED");
        assert.deepEqual(error?.details?.missingColumns?.vip_class_daily_routines, [
          "specialist_user_id",
          "mandatory_exercises"
        ]);
        return true;
      }
    );
  } finally {
    resetAppointmentServiceSchemaCacheForTests();
    restoreQuery();
  }
});
