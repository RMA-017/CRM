import assert from "node:assert/strict";
import test from "node:test";

import pool from "../src/config/db.js";
import {
  hasAppointmentConflictForVipRoutine,
  hasVipRoutineConflictForSpecialist,
  resetAppointmentServiceSchemaCacheForTests
} from "../src/modules/appointments/appointment-settings.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("VIP daily routine appointment conflicts consider both specialist and class clients", async () => {
  let capturedSql = "";
  let capturedParams = [];

  const conflict = await hasAppointmentConflictForVipRoutine({
    organizationId: 3,
    classId: 11,
    specialistId: 9,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
    db: {
      query: async (sql, params) => {
        capturedSql = String(sql || "");
        capturedParams = Array.isArray(params) ? params : [];
        return {
          rows: [{
            appointment_id: "91",
            appointment_date: "2026-03-23",
            appointment_start_time: "09:15",
            appointment_end_time: "10:00",
            client_name: "Ali Vali",
            conflict_scope: "specialist"
          }]
        };
      }
    }
  });

  assert.match(capturedSql, /s\.specialist_id = \$5/);
  assert.match(capturedSql, /class_assignment_id = \$6/);
  assert.deepEqual(capturedParams, [3, 1, "09:00", "10:00", 9, 11]);
  assert.deepEqual(conflict, {
    appointmentId: "91",
    appointmentDate: "2026-03-23",
    startTime: "09:15",
    endTime: "10:00",
    clientName: "Ali Vali",
    conflictScope: "specialist"
  });
});

test("VIP daily routine appointment conflicts still block class appointments when no specialist is selected", async () => {
  let capturedSql = "";
  let capturedParams = [];

  const conflict = await hasAppointmentConflictForVipRoutine({
    organizationId: 3,
    classId: 11,
    specialistId: null,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
    db: {
      query: async (sql, params) => {
        capturedSql = String(sql || "");
        capturedParams = Array.isArray(params) ? params : [];
        return {
          rows: [{
            appointment_id: "92",
            appointment_date: "2026-03-23",
            appointment_start_time: "09:30",
            appointment_end_time: "10:00",
            client_name: "Class Child",
            conflict_scope: "client"
          }]
        };
      }
    }
  });

  assert.doesNotMatch(capturedSql, /s\.specialist_id = \$5/);
  assert.match(capturedSql, /class_assignment_id = \$5/);
  assert.deepEqual(capturedParams, [3, 1, "09:00", "10:00", 11]);
  assert.deepEqual(conflict, {
    appointmentId: "92",
    appointmentDate: "2026-03-23",
    startTime: "09:30",
    endTime: "10:00",
    clientName: "Class Child",
    conflictScope: "client"
  });
});

test("Unassigned VIP daily routines do not count as specialist conflicts", async () => {
  let capturedSql = "";
  let capturedParams = [];
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
          { column_name: "specialist_user_id" },
          { column_name: "mandatory_exercises" },
          { column_name: "note" },
          { column_name: "created_at" },
          { column_name: "updated_at" }
        ]
      };
    }
    if (queryText.includes("FROM vip_class_daily_routines vdr")) {
      capturedSql = queryText;
      capturedParams = Array.isArray(params) ? params : [];
      return { rows: [] };
    }
    throw new Error(`Unexpected query in test: ${queryText}`);
  });

  try {
    await hasVipRoutineConflictForSpecialist({
      organizationId: 3,
      specialistId: 9,
      appointmentDate: "2026-03-23",
      startTime: "09:00",
      endTime: "10:00"
    });

    assert.match(capturedSql, /vdr\.specialist_user_id = \$2/);
    assert.doesNotMatch(capturedSql, /teacher_user_id/);
    assert.doesNotMatch(capturedSql, /vip_client_tutor_assignments/);
    assert.deepEqual(capturedParams, [3, 9, "2026-03-23", "09:00", "10:00"]);
  } finally {
    restoreQuery();
    resetAppointmentServiceSchemaCacheForTests();
  }
});
