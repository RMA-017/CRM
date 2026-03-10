import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import {
  clearAppointmentPlannerReportFilterCaches,
  clearAppointmentReferenceCaches,
  createAppointmentSchedule,
  getAppointmentPlannerReportFilters,
  getAppointmentSpecialistsByOrganization,
  listAppointmentWorkScheduleStaffByOrganization
} from "../src/modules/appointments/appointment-settings.service.js";
import {
  clearClientsReferenceCaches,
  getVipAssignmentOptionsByOrganization,
  getVipAttendanceTeachersByOrganization,
  getVipClientOptionsByOrganization
} from "../src/modules/clients/clients.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("appointment reference caches reuse specialist and staff lookups", async () => {
  clearAppointmentReferenceCaches();
  clearAppointmentPlannerReportFilterCaches();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql) => {
    callCount += 1;
    const text = String(sql || "");
    if (text.includes("AS role")) {
      return {
        rows: [{ id: "7", name: "Alice Specialist", role: "Specialist" }]
      };
    }
    if (text.includes("AS username")) {
      return {
        rows: [{ id: "7", name: "Alice Specialist", username: "alice" }]
      };
    }
    throw new Error(`Unexpected SQL: ${text}`);
  });

  try {
    const firstSpecialists = await getAppointmentSpecialistsByOrganization(7);
    const secondSpecialists = await getAppointmentSpecialistsByOrganization(7);
    assert.equal(callCount, 1);
    assert.deepEqual(secondSpecialists, firstSpecialists);

    firstSpecialists[0].name = "Mutated";
    const thirdSpecialists = await getAppointmentSpecialistsByOrganization(7);
    assert.equal(thirdSpecialists[0].name, "Alice Specialist");

    const firstStaff = await listAppointmentWorkScheduleStaffByOrganization(7);
    const secondStaff = await listAppointmentWorkScheduleStaffByOrganization(7);
    assert.equal(callCount, 2);
    assert.deepEqual(secondStaff, firstStaff);

    firstStaff[0].username = "changed";
    const thirdStaff = await listAppointmentWorkScheduleStaffByOrganization(7);
    assert.equal(thirdStaff[0].username, "alice");

    clearAppointmentReferenceCaches();
    await getAppointmentSpecialistsByOrganization(7);
    assert.equal(callCount, 3);
  } finally {
    restoreQuery();
    clearAppointmentReferenceCaches();
    clearAppointmentPlannerReportFilterCaches();
  }
});

test("appointment planner report filters cache results and clear on schedule writes", async () => {
  clearAppointmentReferenceCaches();
  clearAppointmentPlannerReportFilterCaches();
  let filterQueryCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const text = String(sql || "");

    if (text.includes("AS role")) {
      return {
        rows: [{ id: "7", name: "Alice Specialist", role: "Specialist" }]
      };
    }
    if (text.includes("FROM appointment_schedules s") && text.includes("GROUP BY c.id")) {
      filterQueryCount += 1;
      return {
        rows: [{
          id: "21",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: "Bek",
          is_vip: true
        }]
      };
    }
    if (text.includes("FROM information_schema.tables")) {
      return {
        rows: [{ table_name: "appointment_status_history" }]
      };
    }
    if (text.includes("FROM information_schema.columns")) {
      return {
        rows: [
          { column_name: "organization_id" },
          { column_name: "appointment_schedule_id" },
          { column_name: "event_type" },
          { column_name: "previous_status" },
          { column_name: "next_status" },
          { column_name: "changed_fields" },
          { column_name: "details" },
          { column_name: "changed_by" },
          { column_name: "changed_at" }
        ]
      };
    }
    if (text.includes("WITH inserted AS") && text.includes("INSERT INTO appointment_schedules")) {
      return {
        rows: [{
          id: 99,
          organization_id: 7,
          specialist_id: 7,
          client_id: 21,
          appointment_date: "2026-03-10",
          start_time: "09:00",
          end_time: "09:30",
          duration_minutes: 30,
          service_name: "Consult",
          status: "pending",
          note: "",
          repeat_group_key: null,
          repeat_type: "none",
          repeat_until_date: null,
          repeat_days: null,
          repeat_anchor_date: null,
          is_repeat_root: false,
          created_at: "2026-03-10T00:00:00.000Z",
          updated_at: "2026-03-10T00:00:00.000Z",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: "Bek"
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${text} params=${JSON.stringify(params)}`);
  });

  try {
    const first = await getAppointmentPlannerReportFilters({ organizationId: 7 });
    const second = await getAppointmentPlannerReportFilters({ organizationId: 7 });

    assert.equal(filterQueryCount, 1);
    assert.deepEqual(second, first);

    first.clients[0].firstName = "Changed";
    const third = await getAppointmentPlannerReportFilters({ organizationId: 7 });
    assert.equal(third.clients[0].firstName, "Ali");

    await createAppointmentSchedule({
      organizationId: 7,
      actorUserId: 5,
      specialistId: 7,
      clientId: 21,
      appointmentDate: "2026-03-10",
      startTime: "09:00",
      endTime: "09:30",
      durationMinutes: 30,
      serviceName: "Consult",
      status: "pending",
      note: ""
    });

    await getAppointmentPlannerReportFilters({ organizationId: 7 });
    assert.equal(filterQueryCount, 2);
  } finally {
    restoreQuery();
    clearAppointmentReferenceCaches();
    clearAppointmentPlannerReportFilterCaches();
  }
});

test("client reference caches reuse VIP teacher, tutor and client option lookups", async () => {
  clearClientsReferenceCaches();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const text = String(sql || "");
    if (text.includes("FROM users u")) {
      const joinedParams = params.slice(1).join("|");
      if (joinedParams.includes("assistant") || joinedParams.includes("murabbiy")) {
        return {
          rows: [{ id: "11", name: "Tutor User" }]
        };
      }
      return {
        rows: [{ id: "9", name: "Teacher User" }]
      };
    }
    if (text.includes("FROM clients c")) {
      return {
        rows: [{
          id: "21",
          first_name: "Ali",
          last_name: "Valiyev",
          middle_name: "Bek"
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${text}`);
  });

  try {
    const firstTeachers = await getVipAttendanceTeachersByOrganization(7);
    const secondTeachers = await getVipAttendanceTeachersByOrganization(7);
    assert.equal(callCount, 1);
    assert.deepEqual(secondTeachers, firstTeachers);

    firstTeachers[0].name = "Mutated";
    const thirdTeachers = await getVipAttendanceTeachersByOrganization(7);
    assert.equal(thirdTeachers[0].name, "Teacher User");

    const firstAssignments = await getVipAssignmentOptionsByOrganization(7);
    const secondAssignments = await getVipAssignmentOptionsByOrganization(7);
    assert.equal(callCount, 3);
    assert.deepEqual(secondAssignments, firstAssignments);

    firstAssignments.teachers[0].name = "Changed";
    const thirdAssignments = await getVipAssignmentOptionsByOrganization(7);
    assert.equal(thirdAssignments.teachers[0].name, "Teacher User");
    assert.equal(thirdAssignments.tutors[0].name, "Tutor User");

    const firstClients = await getVipClientOptionsByOrganization({ organizationId: 7, limit: 1000 });
    const secondClients = await getVipClientOptionsByOrganization({ organizationId: 7, limit: 1000 });
    assert.equal(callCount, 4);
    assert.deepEqual(secondClients, firstClients);

    firstClients[0].first_name = "Changed";
    const thirdClients = await getVipClientOptionsByOrganization({ organizationId: 7, limit: 1000 });
    assert.equal(thirdClients[0].first_name, "Ali");

    clearClientsReferenceCaches();
    await getVipAttendanceTeachersByOrganization(7);
    assert.equal(callCount, 5);
  } finally {
    restoreQuery();
    clearClientsReferenceCaches();
  }
});
