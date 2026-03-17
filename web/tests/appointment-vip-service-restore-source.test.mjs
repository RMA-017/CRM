import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment create modal restores previous service when VIP lock turns off", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /const unlockedServiceNameRef = useRef\(String\(createForm\.service \|\| ""\)\.trim\(\)\);/,
    "Appointment scheduler should keep the last unlocked service name before VIP mode overrides it."
  );

  assert.match(
    source,
    /if \(isVipServiceLocked\) \{\s*if \(!wasVipServiceLocked\) \{\s*unlockedServiceNameRef\.current = String\(createForm\.service \|\| ""\)\.trim\(\);/s,
    "Entering VIP service lock should snapshot the previous manual service name."
  );

  assert.match(
    source,
    /setCreateForm\(\(prev\) => \(\{[\s\S]*service: restoredServiceName[\s\S]*\}\)\);/,
    "Leaving VIP service lock should restore the previous manual service name."
  );
});
