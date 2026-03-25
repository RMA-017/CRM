import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment create modal keeps repeat-until visible while Active only requires Repeat weekly", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.doesNotMatch(
    source,
    /getVipAutoRollingRepeatUntil|activeRepeatUntilSnapshotRef|unlockedRepeatUntilRef/s,
    "Appointment scheduler should not auto-fill or snapshot Repeat Until when Active is toggled."
  );

  assert.doesNotMatch(
    source,
    /if \(checked\) \{[\s\S]*repeatUntil: nextRepeatUntil|repeatDays: nextRepeatDays/s,
    "Active toggle should not auto-seed Repeat Until or Repeat weekly values."
  );

  assert.match(
    source,
    /const shouldValidateRepeat = !isEditMode \|\| allowRepeatValidationInEdit;[\s\S]*if \(requireRepeat && !wantsRepeat\) \{[\s\S]*errors\.repeatDays = "Select at least one repeat day\.";[\s\S]*const shouldValidateRepeatUntil = !allowAutoRollingRepeatUntilFallback \|\| String\(repeatUntil \|\| ""\)\.trim\(\) !== "";/s,
    "Active mode should make Repeat weekly required without forcing Repeat Until when auto-rolling is enabled."
  );
});
