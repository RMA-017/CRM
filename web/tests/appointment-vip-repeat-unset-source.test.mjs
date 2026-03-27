import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment create modal seeds Active repeat-until and weekly day while keeping repeat-until required", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /function resolveAutoRollingRepeatUntilForSubmit\(appointmentDate = ""\) \{[\s\S]*return formatDateYmd\(addDays\(baseDate, 29\)\);/s,
    "Appointment scheduler should keep the +30 day helper for Active auto-repeat."
  );

  assert.match(
    source,
    /function resolveAutoRollingRepeatDayKeys\(appointmentDate = "", repeatDays = \[\], visibleDayKeys = \[\]\) \{[\s\S]*return \[appointmentDayKey\];/s,
    "Appointment scheduler should derive the Active repeat weekday from the chosen appointment date."
  );

  assert.match(
    source,
    /if \(checked\) \{[\s\S]*repeatUntil: resolveAutoRollingRepeatUntilForSubmit\(prev\.appointmentDate\),[\s\S]*repeatDays: resolveAutoRollingRepeatDayKeys\([\s\S]*prev\.appointmentDate,[\s\S]*prev\.repeatDays,[\s\S]*visibleRepeatDayKeys/s,
    "Active toggle should auto-fill Repeat Until and seed Repeat weekly from the selected slot."
  );

  assert.match(
    source,
    /if \(wantsRepeat\) \{[\s\S]*if \(!isValidDateYmd\(repeatUntil\)\) \{[\s\S]*errors\.repeatUntil = "Invalid repeat end date\.";/s,
    "Saving any repeated planner series should require a valid Repeat Until value."
  );
});
