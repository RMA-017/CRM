import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment specialist absence routes and schedule guards stay registered", async () => {
  const [routesSource, absencesRouteSource, schedulesSource, schemasSource, referenceRouteSource, serviceSource] = await Promise.all([
    readFile(new URL("../src/modules/appointments/appointment-settings.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/routes/absences.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/routes/appointment.route-schemas.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/routes/reference.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url), "utf8")
  ]);

  assert.match(
    routesSource,
    /registerAppointmentAbsenceRoutes\(fastify, routeContext\);/,
    "Appointments route registration should include specialist absences routes."
  );

  assert.match(
    absencesRouteSource,
    /fastify\.get\(\s*"\/absences"/,
    "Specialist absences route file should expose the list endpoint."
  );

  assert.match(
    absencesRouteSource,
    /fastify\.post\(\s*"\/absences"/,
    "Specialist absences route file should expose the save endpoint."
  );

  assert.match(
    absencesRouteSource,
    /fastify\.delete\(\s*"\/absences\/:id"/,
    "Specialist absences route file should expose the delete endpoint."
  );

  assert.match(
    absencesRouteSource,
    /PERMISSIONS\.APPOINTMENTS_SPECIALIST_ABSENCES_READ[\s\S]*PERMISSIONS\.APPOINTMENTS_SPECIALIST_ABSENCES_CREATE[\s\S]*PERMISSIONS\.APPOINTMENTS_SPECIALIST_ABSENCES_DELETE/s,
    "Specialist absences routes should use dedicated specialist absence permissions."
  );

  assert.match(
    absencesRouteSource,
    /const ownSpecialistUserId = canReadPlannerAbsences\s*\?\s*0\s*:\s*resolveSelfScopedSpecialistUserId\([\s\S]*fallbackToOwnUser:\s*canReadSpecialistAbsences[\s\S]*fallbackOnlyWhenSpecialistIsUnspecified:\s*true[\s\S]*const ownSpecialistUserId = resolveSelfScopedSpecialistUserId\(\{\s*authContext,\s*requester\s*\}\);[\s\S]*const ownSpecialistUserId = resolveSelfScopedSpecialistUserId\(\{\s*authContext,\s*requester\s*\}\);/s,
    "Specialist absences routes should keep planner reads flexible while self-scoping only true specialist users for create and delete."
  );

  assert.match(
    schemasSource,
    /absenceCreateBody[\s\S]*anyOf:[\s\S]*absenceDate[\s\S]*dateFrom[\s\S]*properties:[\s\S]*dateFrom:[\s\S]*dateTo:[\s\S]*startTime:[\s\S]*endTime:/s,
    "Specialist absences create schema should accept date ranges plus optional time from\/to values."
  );

  assert.match(
    absencesRouteSource,
    /buildDateRange[\s\S]*const startTime = String\(request\.body\?\.startTime \|\| ""\)\.trim\(\);[\s\S]*Both start and end time are required\.[\s\S]*withAppointmentTransaction[\s\S]*startTime,[\s\S]*endTime,[\s\S]*Specialist absence saved for \$\{savedCount\} days\./s,
    "Specialist absences create route should validate and persist optional time ranges inside one transaction."
  );

  assert.match(
    absencesRouteSource,
    /if \(!specialistId && !canReadSpecialistAbsences\)/,
    "Specialist absences list route should allow org-wide reads for the dedicated menu while still requiring a specialist for planner-only reads."
  );

  assert.match(
    absencesRouteSource,
    /"appointments\.specialist_absences"/,
    "Specialist absences routes should check the dedicated org feature."
  );

  assert.match(
    referenceRouteSource,
    /\/specialists[\s\S]*APPOINTMENTS_SPECIALIST_ABSENCES_READ[\s\S]*APPOINTMENTS_SPECIALIST_ABSENCES_CREATE/s,
    "Appointment specialists reference route should also be available for specialist absence workflows."
  );

  assert.match(
    serviceSource,
    /LIKE '%specialist%'[\s\S]*LIKE '%spetsialist%'[\s\S]*LIKE '%mutaxassis%'[\s\S]*LIKE '%специалист%'/s,
    "Appointment specialist lookup should include localized specialist role labels."
  );

  assert.doesNotMatch(
    serviceSource,
    /LIKE '%educator%'|LIKE '%teacher%'|LIKE '%tutor%'|LIKE '%coach%'/,
    "Appointment specialist lookup should stay limited to specialist role labels for planner workflows."
  );

  assert.match(
    schedulesSource,
    /buildSpecialistAbsenceConflictMessage/,
    "Schedule routes should keep the specialist absence conflict helper."
  );

  assert.match(
    schedulesSource,
    /buildSpecialistAbsenceRangesByDate[\s\S]*hasSpecialistAbsenceConflict[\s\S]*listAppointmentSpecialistAbsences/s,
    "Schedule routes should guard create\/update flows against specialist absences using date and time overlap checks."
  );

  assert.match(
    serviceSource,
    /mapAppointmentSpecialistAbsenceItem[\s\S]*startTime: normalizeTimeHm\(row\?\.start_time\),[\s\S]*endTime: normalizeTimeHm\(row\?\.end_time\)/s,
    "Specialist absence items should expose start and end time values."
  );

  assert.match(
    serviceSource,
    /INSERT INTO appointment_working_hours[\s\S]*start_time,[\s\S]*end_time[\s\S]*EXCLUDED\.start_time[\s\S]*EXCLUDED\.end_time/s,
    "Specialist absence saves should persist time ranges on the exception row."
  );
});
