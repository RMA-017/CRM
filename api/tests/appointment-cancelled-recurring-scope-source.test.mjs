import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schedulesRoutesSource = await readFile(
  new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url),
  "utf8"
);

test("cancelled recurring appointment updates can use the requested series scope", () => {
  assert.doesNotMatch(
    schedulesRoutesSource,
    /forceCancelledRecurringAnchorToSingleScope/,
    "Cancelled recurring anchors should not be force-narrowed after the user chooses a scope."
  );

  assert.match(
    schedulesRoutesSource,
    /const target = resolveRecurringSingleScopeTargetByDayKeys\(rawTarget,\s*requestedScopedDayKeys\s*\);/s,
    "Schedule update should preserve the requested recurring scope, including cancelled recurring anchors."
  );

  assert.match(
    schedulesRoutesSource,
    /const target = resolveRecurringSingleScopeTargetByDayKeys\(rawTarget,\s*requestedDeleteDayKeys\s*\);/s,
    "Schedule delete should preserve the requested recurring scope, including cancelled recurring anchors."
  );
});
