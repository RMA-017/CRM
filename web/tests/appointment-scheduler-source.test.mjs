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
});
