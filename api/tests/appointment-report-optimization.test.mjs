import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import {
  clearAppointmentReferenceCaches,
  getAppointmentPlannerReport
} from "../src/modules/appointments/appointment-settings.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("getAppointmentPlannerReport derives summary from detail rows without extra summary query", async () => {
  clearAppointmentReferenceCaches();
  let callCount = 0;
  const queries = [];
  const restoreQuery = stubPoolQuery(async (sql) => {
    callCount += 1;
    const text = String(sql || "");
    queries.push(text);

    if (text.includes("AS role")) {
      return {
        rows: [{ id: "7", name: "Alice Specialist", role: "Specialist" }]
      };
    }

    if (text.includes("FROM appointment_working_hours") && text.includes("user_id IS NULL")) {
      return {
        rows: [
          { day_of_week: 1, is_active: true, start_time: "09:00", end_time: "18:00" },
          { day_of_week: 2, is_active: true, start_time: "09:00", end_time: "18:00" }
        ]
      };
    }

    if (text.includes("FROM appointment_breaks")) {
      return {
        rows: [
          { specialist_id: 7, day_of_week: 1, start_time: "12:00", end_time: "13:00" }
        ]
      };
    }

    if (text.includes("FROM appointment_working_hours") && text.includes("user_id = ANY")) {
      return {
        rows: [
          { specialist_id: 7, rule_scope: "weekly", day_of_week: 2, work_date: null, is_active: true, start_time: "15:00", end_time: "16:00" }
        ]
      };
    }

    assert.match(text, /FROM appointment_schedules s/i);
    assert.doesNotMatch(text, /GROUP BY LOWER\(TRIM\(s\.status\)\)/i);
    return {
      rows: [
        {
          appointment_id: "11",
          appointment_date: "2026-03-01",
          start_time: "09:00",
          end_time: "09:30",
          duration_minutes: 30,
          status: "confirmed",
          specialist_id: "7",
          specialist_name: "Alice Specialist",
          client_id: "101",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: "",
          service_name: "Speech"
        },
        {
          appointment_id: "12",
          appointment_date: "2026-03-01",
          start_time: "10:00",
          end_time: "10:30",
          duration_minutes: 30,
          status: "pending",
          specialist_id: "7",
          specialist_name: "Alice Specialist",
          client_id: "102",
          first_name: "Vali",
          last_name: "Karimov",
          middle_name: "",
          service_name: "Speech"
        },
        {
          appointment_id: "13",
          appointment_date: "2026-03-02",
          start_time: "11:00",
          end_time: "11:30",
          duration_minutes: 30,
          status: "no-show",
          specialist_id: "7",
          specialist_name: "Alice Specialist",
          client_id: "103",
          first_name: "Laylo",
          last_name: "Rasulova",
          middle_name: "",
          service_name: "Consult"
        }
      ]
    };
  });

  try {
    const result = await getAppointmentPlannerReport({
      organizationId: 3,
      from: "2026-03-01",
      to: "2026-03-09"
    });

    assert.equal(callCount, 5);
    assert.equal(result.summary.total, 3);
    assert.equal(result.summary.confirmed, 1);
    assert.equal(result.summary.pending, 1);
    assert.equal(result.summary.cancelled, 0);
    assert.equal(result.summary.noShow, 1);
    assert.equal(result.details.length, 3);
    assert.equal(result.details[0].appointmentId, "11");
    assert.equal(result.specialists.length, 1);
    assert.equal(result.specialists[0].name, "Alice Specialist");
    assert.equal(result.workload.totals.workingMinutes, 1620);
    assert.equal(result.workload.totals.breakMinutes, 120);
    assert.equal(result.workload.totals.blockedMinutes, 60);
    assert.equal(result.workload.totals.bookedMinutes, 60);
    assert.equal(result.workload.totals.availableMinutes, 1440);
    assert.equal(queries.some((text) => text.includes("GROUP BY LOWER(TRIM(s.status))")), false);
  } finally {
    restoreQuery();
    clearAppointmentReferenceCaches();
  }
});

test("getAppointmentPlannerReport does not apply assigned VIP scope when specialist is locked", async () => {
  clearAppointmentReferenceCaches();
  let detailQuery = "";
  const restoreQuery = stubPoolQuery(async (sql) => {
    const text = String(sql || "");

    if (text.includes("AS role")) {
      return {
        rows: [{ id: "7", name: "Alice Specialist", role: "Specialist" }]
      };
    }

    if (text.includes("FROM appointment_working_hours")) {
      return { rows: [] };
    }

    if (text.includes("FROM appointment_breaks")) {
      return { rows: [] };
    }

    if (text.includes("s.id::text AS appointment_id")) {
      detailQuery = text;
      return { rows: [] };
    }

    return { rows: [] };
  });

  try {
    await getAppointmentPlannerReport({
      organizationId: 3,
      from: "2026-07-02",
      to: "2026-07-02",
      specialistId: 7,
      assignedUserId: 7
    });

    assert.match(detailQuery, /s\.specialist_id = \$4/);
    assert.doesNotMatch(detailQuery, /vta_scope/);
    assert.doesNotMatch(detailQuery, /c\.is_vip = FALSE/);
  } finally {
    restoreQuery();
    clearAppointmentReferenceCaches();
  }
});
