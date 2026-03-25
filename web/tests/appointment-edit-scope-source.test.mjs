import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("recurring appointment edit scope uses an inline Next checkbox instead of a select", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /id="appointmentEditScopeFuture"[\s\S]*type="checkbox"[\s\S]*checked=\{isFutureRecurringEditScope\}[\s\S]*const checked = event\.currentTarget\.checked;[\s\S]*editScope: checked \? "future" : "single"/s,
    "Recurring appointment edits should use the inline Next checkbox to switch between single and future scopes."
  );
});
