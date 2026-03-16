import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Appointment scheduler supports client-focused multi-specialist planner view", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /\/api\/appointments\/report\/filters/,
    "Appointment scheduler should load global planner client filters."
  );
  assert.match(
    source,
    /clientFocusedPlannerSections/,
    "Appointment scheduler should build client-focused planner sections."
  );
  assert.match(
    source,
    /clientId:\s*normalizedSelectedPlannerClientFilterId/,
    "Appointment scheduler should request schedules by selected client id."
  );
  assert.match(
    source,
    /if \(selectedPlannerClientFilterId\) \{\s*setSelectedPlannerClientFilterId\(""\);/s,
    "Selecting a specialist should clear the client filter so specialist mode becomes active again."
  );
  assert.match(
    source,
    /id=\"appointmentPlannerClientFilterSelect\"[\s\S]*?searchable[\s\S]*?searchThreshold=\{0\}/,
    "Client filter should expose search input in the planner toolbar."
  );
  assert.match(
    source,
    /className=\"appointment-vip-weekly-grid-wrap appointment-client-weekly-grid-wrap\"/,
    "Client-focused weekly planner should use the no-vertical-scroll wrapper class."
  );
  assert.match(
    source,
    /!vipOnly\s*&&\s*!normalizedSelectedPlannerClientFilterId\s*&&\s*String\(selectedSpecialistId \|\| ""\)\.trim\(\)/s,
    "Client mode should keep appointment settings on the organization default schedule instead of specialist-specific settings."
  );
  assert.match(
    source,
    /if \(!vipOnly && normalizedSelectedPlannerClientFilterId\) \{\s*return "";\s*\}/s,
    "Client mode should not auto-select a specialist again after a client is chosen."
  );
});
