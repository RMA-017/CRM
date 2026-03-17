import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("recurring appointment edit scope select renders through the modal portal", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /<CustomSelect[\s\S]*id="appointmentEditScope"[\s\S]*menuPortal[\s\S]*forceOpenDown=\{!compactWeekRange\}[\s\S]*forceOpenUp=\{compactWeekRange\}/,
    "Recurring appointment edit scope select should open through the modal portal with the same direction rules as other appointment modal selects."
  );
});
