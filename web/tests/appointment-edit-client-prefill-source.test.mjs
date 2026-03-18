import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment edit modal restores client select label and active auto-repeat state from the existing planner card", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /clientFirstName:\s*String\(item\?\.clientFirstName \|\| ""\)\.trim\(\),[\s\S]*clientLastName:\s*String\(item\?\.clientLastName \|\| ""\)\.trim\(\),[\s\S]*clientMiddleName:\s*String\(item\?\.clientMiddleName \|\| ""\)\.trim\(\),[\s\S]*isVip:\s*Boolean\(item\?\.isVip\)/,
    "Planner cards should keep the existing client identity fields needed to reopen the edit modal."
  );

  assert.match(
    source,
    /const nextCard = mapScheduleItemToPlannerCard\(item\);/,
    "The standard planner schedule loader should reuse the shared planner card mapper so VIP metadata is not dropped."
  );

  assert.match(
    source,
    /const existingAutoRollingRepeat = Boolean\(existingItem\?\.isAutoRollingRepeat\);[\s\S]*setClientVipOnly\(Boolean\(vipOnly \|\| existingAutoRollingRepeat\)\);/s,
    "Editing an existing auto-rolling appointment should reopen the modal with the Active toggle still enabled."
  );

  assert.match(
    source,
    /setClientMap\(\(prev\) => \{[\s\S]*displayName:\s*String\(existingItem\?\.client \|\| previousClient\?\.displayName \|\| ""\)\.trim\(\),[\s\S]*isVip:\s*existingClientIsVip \|\| Boolean\(previousClient\?\.isVip\)/,
    "Editing an existing appointment should seed the selected client back into the modal select options."
  );
});
