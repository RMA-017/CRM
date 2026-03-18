import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment create modal keeps repeat-until visible and restores the previous value when Active turns off", async () => {
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

  assert.match(
    source,
    /const unlockedRepeatUntilRef = useRef\(String\(createForm\.repeatUntil \|\| ""\)\.trim\(\)\);/,
    "Appointment scheduler should keep the last manual Repeat Until value before Active overrides it."
  );

  assert.match(
    source,
    /if \(checked\) \{[\s\S]*unlockedRepeatUntilRef\.current = String\(createForm\.repeatUntil \|\| ""\)\.trim\(\);/s,
    "Turning Active on should snapshot the previous Repeat Until value."
  );

  assert.match(
    source,
    /if \(String\(prev\.repeatUntil \|\| ""\)\.trim\(\) === restoredRepeatUntil\) \{\s*return prev;\s*\}[\s\S]*repeatUntil: restoredRepeatUntil/s,
    "Turning Active off should restore the previous Repeat Until value instead of clearing it."
  );
});
