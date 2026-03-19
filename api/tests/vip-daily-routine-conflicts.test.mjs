import assert from "node:assert/strict";
import test from "node:test";

import { hasAppointmentConflictForVipRoutine } from "../src/modules/appointments/appointment-settings.service.js";

test("VIP daily routine appointment conflicts only consider the selected specialist schedule", async () => {
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
            client_name: "Ali Vali"
          }]
        };
      }
    }
  });

  assert.match(capturedSql, /s\.specialist_id = \$5/);
  assert.doesNotMatch(capturedSql, /s\.client_id IN/);
  assert.deepEqual(capturedParams, [3, 1, "09:00", "10:00", 9]);
  assert.deepEqual(conflict, {
    appointmentId: "91",
    appointmentDate: "2026-03-23",
    startTime: "09:15",
    endTime: "10:00",
    clientName: "Ali Vali"
  });
});
