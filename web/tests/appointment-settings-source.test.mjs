import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Appointment settings form preserves working hours for default weekly schedule", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentSettingsPanel.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /workingHours:\s*normalizedSource\.workingHours/,
    "Appointment settings form should keep backend working hours in form state."
  );
  assert.match(
    source,
    /mapWorkingHoursToDefaultWeeklyRows\(form\?\.workingHours\)/,
    "Default weekly schedule should derive rows from form working hours."
  );
});
