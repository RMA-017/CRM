import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("planner schedule create and update reactivate the selected client", async () => {
  const source = await readFile(
    new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /export async function createAppointmentSchedule[\s\S]*WITH activated_client AS \([\s\S]*UPDATE clients c[\s\S]*SET is_vip = TRUE[\s\S]*c\.id = \$3[\s\S]*INSERT INTO \$\{tableName\}/,
    "Creating a planner lesson should set the selected client active before inserting the lesson."
  );
  assert.match(
    source,
    /export async function updateAppointmentSchedulesByIds[\s\S]*WITH target AS \([\s\S]*activated_client AS \([\s\S]*UPDATE clients c[\s\S]*SET is_vip = TRUE[\s\S]*c\.id = \$2[\s\S]*EXISTS \(SELECT 1 FROM target\)[\s\S]*UPDATE \$\{tableName\} s/,
    "Bulk schedule updates should reactivate the selected client when an update target exists."
  );
  assert.match(
    source,
    /export async function updateAppointmentScheduleByIdWithRepeatMeta[\s\S]*WITH target AS \([\s\S]*activated_client AS \([\s\S]*UPDATE clients c[\s\S]*SET is_vip = TRUE[\s\S]*c\.id = \$2[\s\S]*EXISTS \(SELECT 1 FROM target\)[\s\S]*UPDATE \$\{tableName\} s/,
    "Recurring schedule updates should reactivate the selected client when an update target exists."
  );
});
