import assert from "node:assert/strict";
import test from "node:test";

import pool from "../src/config/db.js";
import {
  ensureAutoRollingRecurringSchedulesCoverRange,
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

test("appointment schedules range includes VIP routine items for client-focused VIP planner queries", async () => {
  resetAppointmentServiceSchemaCacheForTests();

  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
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
          { column_name: "specialist_user_id" },
          { column_name: "mandatory_exercises" },
          { column_name: "created_at" },
          { column_name: "updated_at" }
        ]
      };
    }
    if (queryText.includes("FROM appointment_schedules s")) {
      return { rows: [] };
    }
    if (queryText.includes("FROM vip_class_daily_routines vdr")) {
      assert.equal(params[0], 3);
      assert.equal(params[1], "2026-03-16");
      assert.equal(params[2], "2026-03-21");
      assert.equal(params[3], 44);
      return {
        rows: [{
          id: 77,
          organization_id: 3,
          specialist_id: 91,
          appointment_date: "2026-03-17",
          start_time: "09:00",
          end_time: "10:00",
          duration_minutes: 60,
          service_name: "Breakfast",
          status: "routine",
          note: "Fruit break",
          mandatory_exercises: "",
          activity_type: "breakfast",
          item_type: "daily-routine",
          class_assignment_id: "12",
          class_name: "Alpha",
          specialist_name: "Jane Doe",
          specialist_position: "Educator",
          is_vip: true,
          created_at: null,
          updated_at: null
        }]
      };
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const items = await getAppointmentSchedulesByRange({
      organizationId: 3,
      specialistId: null,
      clientId: 44,
      classId: null,
      dateFrom: "2026-03-16",
      dateTo: "2026-03-21",
      vipOnly: true
    });

    assert.equal(items.length, 1);
    assert.equal(items[0]?.itemType, "daily-routine");
    assert.equal(items[0]?.className, "Alpha");
    assert.equal(items[0]?.specialistId, "91");
    assert.equal(items[0]?.appointmentDate, "2026-03-17");
  } finally {
    resetAppointmentServiceSchemaCacheForTests();
    restoreQuery();
  }
});

test("auto-rolling VIP planner read skips assignment-schema-dependent root lookup when legacy VIP tables are missing", async () => {
  resetAppointmentServiceSchemaCacheForTests();

  const restoreQuery = stubPoolQuery(async (sql) => {
    const queryText = String(sql || "");

    if (queryText.includes("FROM appointment_schedules s")) {
      const error = new Error('relation "vip_class_teacher_assignments" does not exist');
      error.code = "42P01";
      throw error;
    }

    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    const result = await ensureAutoRollingRecurringSchedulesCoverRange({
      organizationId: 3,
      specialistId: null,
      clientId: 44,
      classId: null,
      assignedUserId: 91,
      dateTo: "2026-03-21",
      vipOnly: true
    });

    assert.deepEqual(result, {
      changed: false,
      extendedGroupCount: 0,
      createdCount: 0
    });
  } finally {
    resetAppointmentServiceSchemaCacheForTests();
    restoreQuery();
  }
});
