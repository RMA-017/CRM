import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment create modal keeps repeat-until visible and auto-fills it from today when Active is enabled", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /function getVipAutoRollingRepeatUntil\(\) \{[\s\S]*const baseDate = new Date\(\);[\s\S]*VIP_AUTO_ROLLING_REPEAT_WINDOW_DAYS - 1/s,
    "Appointment scheduler should calculate Active repeat-until from the current date."
  );

  assert.match(
    source,
    /if \(!createModal\.open \|\| isEditRecurring \|\| !isVipAutoRollingRepeat \|\| String\(createForm\.repeatUntil \|\| ""\)\.trim\(\)\) \{\s*return;\s*\}/s,
    "Active auto-repeat should only auto-fill repeat-until when the field is still empty."
  );

  assert.match(
    source,
    /if \(checked\) \{[\s\S]*const nextRepeatUntil = getVipAutoRollingRepeatUntil\(\);[\s\S]*repeatUntil: nextRepeatUntil/s,
    "Active toggle should immediately fill repeat-until when it is turned on."
  );

  assert.doesNotMatch(
    source,
    /wasVipAutoRollingRepeatRef/,
    "Appointment scheduler should no longer keep the old Active-off repeat-until clearing flow."
  );

  assert.doesNotMatch(
    source,
    /if \(!checked\) \{[\s\S]*repeatUntil:\s*""/s,
    "Appointment scheduler should no longer clear repeat-until just because Active is turned off."
  );
});
