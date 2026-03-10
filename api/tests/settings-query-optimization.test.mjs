import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import { checkAppointmentNormViolations } from "../src/modules/settings/settings.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("checkAppointmentNormViolations uses one aggregate query and returns violation payload", async () => {
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const queryText = String(sql || "");

    assert.match(queryText, /JOIN appointment_norms an/);
    assert.match(queryText, /COUNT\(s\.id\)::int AS current_count/);
    assert.match(queryText, /LEFT JOIN users pu/);
    assert.deepEqual(params, [3, 44, 7, "2026-03-10"]);
    return {
      rows: [{
        position_id: 5,
        max_per_week: 2,
        position_label: "Teacher",
        current_count: 2
      }]
    };
  });

  try {
    const result = await checkAppointmentNormViolations({
      organizationId: 3,
      specialistId: 7,
      clientId: 44,
      appointmentDate: "2026-03-10"
    });

    assert.equal(callCount, 1);
    assert.deepEqual(result, [{
      positionId: "5",
      positionLabel: "Teacher",
      maxPerWeek: 2,
      currentCount: 2
    }]);
  } finally {
    restoreQuery();
  }
});

test("checkAppointmentNormViolations returns empty when no active norm matches", async () => {
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async () => {
    callCount += 1;
    return { rows: [] };
  });

  try {
    const result = await checkAppointmentNormViolations({
      organizationId: 3,
      specialistId: 7,
      clientId: 44,
      appointmentDate: "2026-03-10"
    });

    assert.equal(callCount, 1);
    assert.deepEqual(result, []);
  } finally {
    restoreQuery();
  }
});
