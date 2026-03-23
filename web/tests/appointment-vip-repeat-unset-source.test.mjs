import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment create modal keeps repeat-until visible and restores the previous value when Active turns off", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /function getVipAutoRollingRepeatUntil\(appointmentDate = ""\) \{[\s\S]*const normalizedAppointmentDate = String\(appointmentDate \|\| ""\)\.trim\(\);[\s\S]*const baseDate = \([\s\S]*appointmentBaseDate > today[\s\S]*VIP_AUTO_ROLLING_REPEAT_WINDOW_DAYS - 1/s,
    "Appointment scheduler should calculate Active repeat-until from the later of today and the selected appointment date."
  );

  assert.match(
    source,
    /if \(!createModal\.open \|\| isEditRecurring \|\| !isVipAutoRollingRepeat \|\| String\(createForm\.repeatUntil \|\| ""\)\.trim\(\)\) \{\s*return;\s*\}/s,
    "Active auto-repeat should only auto-fill repeat-until when the field is still empty."
  );

  assert.match(
    source,
    /if \(checked\) \{[\s\S]*const nextRepeatUntil = getVipAutoRollingRepeatUntil\(prev\.appointmentDate\);[\s\S]*repeatUntil: nextRepeatUntil/s,
    "Active toggle should immediately fill repeat-until when it is turned on using the selected appointment date."
  );

  assert.match(
    source,
    /const nextMinimumRepeatUntil = isVipAutoRollingRepeat\s*\?\s*getVipAutoRollingRepeatUntil\(nextValue\)\s*:\s*nextValue;/s,
    "Changing the appointment date while Active is enabled should keep Repeat Until aligned with the new date."
  );

  assert.match(
    source,
    /const unlockedRepeatUntilRef = useRef\(String\(createForm\.repeatUntil \|\| ""\)\.trim\(\)\);[\s\S]*const activeRepeatUntilSnapshotRef = useRef\(""\);/s,
    "Appointment scheduler should keep the last manual Repeat Until value and a dedicated snapshot before Active overrides it."
  );

  assert.match(
    source,
    /if \(checked\) \{[\s\S]*const previousRepeatUntil = String\(createForm\.repeatUntil \|\| ""\)\.trim\(\);[\s\S]*unlockedRepeatUntilRef\.current = previousRepeatUntil;[\s\S]*activeRepeatUntilSnapshotRef\.current = previousRepeatUntil;/s,
    "Turning Active on should snapshot the previous Repeat Until value."
  );

  assert.match(
    source,
    /const restoredRepeatUntil = String\([\s\S]*activeRepeatUntilSnapshotRef\.current \|\| unlockedRepeatUntilRef\.current \|\| ""[\s\S]*\)\.trim\(\);[\s\S]*activeRepeatUntilSnapshotRef\.current = ""[\s\S]*repeatUntil: restoredRepeatUntil/s,
    "Turning Active off should restore the previous Repeat Until value instead of clearing it."
  );
});
