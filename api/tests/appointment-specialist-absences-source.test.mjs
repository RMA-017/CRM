import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment specialist absence routes and schedule guards stay registered", async () => {
  const [routesSource, absencesRouteSource, schedulesSource] = await Promise.all([
    readFile(new URL("../src/modules/appointments/appointment-settings.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/routes/absences.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url), "utf8")
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
    /fallbackToOwnUser:\s*canReadSpecialistAbsences[\s\S]*requestedSpecialistId[\s\S]*fallbackOnlyWhenSpecialistIsUnspecified:\s*true[\s\S]*fallbackToOwnUser:\s*true/s,
    "Specialist absences routes should only self-scope read access when no specialist was explicitly requested, while keeping write actions self-scoped."
  );

  assert.match(
    absencesRouteSource,
    /"appointments\.specialist_absences"/,
    "Specialist absences routes should check the dedicated org feature."
  );

  assert.match(
    schedulesSource,
    /buildSpecialistAbsenceConflictMessage/,
    "Schedule routes should keep the specialist absence conflict helper."
  );

  assert.match(
    schedulesSource,
    /listAppointmentSpecialistAbsences/,
    "Schedule routes should guard create\/update flows against specialist absences."
  );
});
