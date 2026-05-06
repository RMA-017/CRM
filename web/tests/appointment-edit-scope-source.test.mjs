import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("recurring appointment edit scope uses the shared series one checkbox", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /id="appointmentEditScopeOne"[\s\S]*type="checkbox"[\s\S]*checked=\{isSeriesOneMode\}[\s\S]*const oneChecked = event\.currentTarget\.checked;[\s\S]*editScope: oneChecked \? "single" : "future"[\s\S]*repeatDays:/s,
    "Recurring appointment edits should use the shared Series One checkbox to switch between single and future scopes."
  );
  assert.match(
    source,
    /shouldShowRecurringEditNextToggle \? \([\s\S]*<label htmlFor="appointmentEditScopeOne">Series<\/label>[\s\S]*<span>One<\/span>[\s\S]*\) : \([\s\S]*<label htmlFor="appointmentCreateSeriesOneMode">Series<\/label>[\s\S]*<span>One<\/span>/s,
    "Create and recurring edit modes should share the Series label and One checkbox wording."
  );
  assert.match(
    source,
    /editScope: isExistingRecurring \? "future" : "single"/,
    "Recurring edits should default to the full series scope until One is checked."
  );
});
