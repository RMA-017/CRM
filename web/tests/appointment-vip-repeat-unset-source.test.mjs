import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment create modal clears auto repeat-until when VIP mode turns off", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /const wasVipAutoRollingRepeatRef = useRef\(isVipAutoRollingRepeat\);/,
    "Appointment scheduler should track VIP auto-repeat transitions."
  );

  assert.match(
    source,
    /if \(!wasVipAutoRollingRepeat \|\| isVipAutoRollingRepeat \|\| !String\(createForm\.repeatUntil \|\| ""\)\.trim\(\)\) \{\s*return;\s*\}/s,
    "Turning VIP mode off should only clear repeat-until after an auto-repeat session was active."
  );

  assert.match(
    source,
    /setCreateForm\(\(prev\) => \(\{[\s\S]*repeatUntil: ""[\s\S]*\}\)\);/,
    "Appointment scheduler should clear repeat-until when leaving VIP auto-repeat mode."
  );
});
