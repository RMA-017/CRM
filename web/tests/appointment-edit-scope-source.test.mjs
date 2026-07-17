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
    /const shouldDefaultRecurringEditToSingle = isExistingRecurring;[\s\S]*editScope: isExistingRecurring && !shouldDefaultRecurringEditToSingle \? "future" : "single"/,
    "Recurring edits should default to One so series changes require an explicit user choice."
  );
  assert.match(
    source,
    /const shouldShowRecurringEditNextToggle = showRecurringEditNextToggle && !isSpecialistLimitedEditMode;/,
    "Cancelled recurring appointments should expose the same future-series One toggle as other recurring edits."
  );
  assert.match(
    source,
    /editScope: isSpecialistLimitedEditMode \? "single" : normalizeEditScopeValue\(createForm\.editScope\)[\s\S]*const deleteScope = isSpecialistLimitedEditMode \? "single" : normalizeEditScopeValue\(createForm\.editScope\)/s,
    "Submitting or deleting a cancelled recurring appointment should respect the selected One/future scope."
  );
  assert.match(
    source,
    /function confirmRecurringSeriesScopeAction\(action\)[\s\S]*window\.confirm\(`Это серийное занятие\.[\s\S]*будущие занятия этой серии\. Продолжить\?`\);[\s\S]*isEditRecurring[\s\S]*nextPayload\.editScope !== "single"[\s\S]*!confirmRecurringSeriesScopeAction\("save"\)[\s\S]*isEditRecurring[\s\S]*deleteScope !== "single"[\s\S]*!confirmRecurringSeriesScopeAction\("delete"\)/s,
    "Recurring future-scope saves and deletes should require a browser confirmation."
  );
});
