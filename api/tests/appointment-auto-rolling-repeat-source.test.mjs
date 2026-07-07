import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Appointment auto-rolling repeat wiring is present in schema, service, and routes", async () => {
  const [schemaSource, serviceSource, routesSource, routeSchemaSource] = await Promise.all([
    readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/appointments/routes/appointment.route-schemas.js", import.meta.url), "utf8")
  ]);

  assert.match(
    schemaSource,
    /is_auto_rolling_repeat BOOLEAN NOT NULL DEFAULT FALSE/,
    "Appointment schedules schema should persist the auto-rolling repeat flag."
  );
  assert.match(
    routeSchemaSource,
    /autoRolling: booleanLikeSchema/,
    "Schedule repeat payload schema should accept the autoRolling flag."
  );
  assert.match(
    serviceSource,
    /export async function ensureAutoRollingRecurringSchedulesCoverRange\(/,
    "Appointment service should expose the auto-rolling repeat extender."
  );
  assert.match(
    serviceSource,
    /is_auto_rolling_repeat/,
    "Appointment service should read and write the auto-rolling repeat column."
  );
  assert.match(
    routesSource,
    /ensureVipAutoRollingRepeatUntilDate\(/,
    "Schedule routes should normalize auto-rolling repeat horizons."
  );
  assert.match(
    routesSource,
    /ensureAutoRollingRecurringSchedulesCoverRange\(/,
    "Schedule routes should extend auto-rolling repeat series before reading planner data."
  );
  assert.match(
    serviceSource,
    /isAppointmentAutoRollingRepeatSchemaMissing\(/,
    "Appointment service should recognize a missing auto-rolling repeat column."
  );
  assert.match(
    serviceSource,
    /Appointment auto-rolling repeat migration is required\./,
    "Appointment service should return a clear migration error instead of a generic schedule read failure."
  );
});
