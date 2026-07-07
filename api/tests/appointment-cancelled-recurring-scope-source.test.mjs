import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schedulesRoutesSource = await readFile(
  new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url),
  "utf8"
);

test("cancelled recurring appointment updates are forced to single-slot scope", () => {
  assert.match(
    schedulesRoutesSource,
    /function forceCancelledRecurringAnchorToSingleScope\(target, anchorId\) \{[\s\S]*target\?\.isRecurring[\s\S]*target\?\.scope === "single"[\s\S]*anchorItem[\s\S]*status[\s\S]*"cancelled"[\s\S]*scope: "single"[\s\S]*items: \[anchorItem\]/s,
    "Cancelled recurring anchors should be narrowed to the clicked occurrence."
  );

  assert.match(
    schedulesRoutesSource,
    /const target = resolveRecurringSingleScopeTargetByDayKeys\(\s*forceCancelledRecurringAnchorToSingleScope\(rawTarget, id\),\s*requestedScopedDayKeys\s*\);/s,
    "Schedule update should force cancelled recurring anchors to single scope before applying changes."
  );

  assert.match(
    schedulesRoutesSource,
    /const target = resolveRecurringSingleScopeTargetByDayKeys\(\s*forceCancelledRecurringAnchorToSingleScope\(rawTarget, id\),\s*requestedDeleteDayKeys\s*\);/s,
    "Schedule delete should force cancelled recurring anchors to single scope before applying changes."
  );
});
