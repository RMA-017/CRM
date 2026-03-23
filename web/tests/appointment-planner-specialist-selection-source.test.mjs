import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment planner keeps toolbar selection user-scoped and restores the last active planner filter", async () => {
  const schedulerSource = await readFile(
    new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    schedulerSource,
    /function getUserScopedSchedulerStorageKey\(baseKey,\s*currentUserId = ""\)[\s\S]*normalizedCurrentUserId \? `\$\{baseKey\}:\$\{normalizedCurrentUserId\}` : baseKey;/,
    "Planner storage keys should be scoped per current user so one user's filters do not leak into another session."
  );

  assert.match(
    schedulerSource,
    /readStoredSchedulerSelectionId\(vipOnly,\s*currentUserId\)/,
    "Planner should read the persisted specialist selection from the current user's own storage key."
  );

  assert.match(
    schedulerSource,
    /const nextSelectedSpecialistId = \(\(\) => \{[\s\S]*if \(preferredSpecialistId && nextSpecialists\.some\(\(itemValue\) => itemValue\.id === preferredSpecialistId\)\) \{\s*return preferredSpecialistId;\s*\}[\s\S]*if \(\s*!vipOnly\s*&&\s*restrictCreateToOwnSpecialist\s*&&\s*normalizedCurrentUserId[\s\S]*return normalizedCurrentUserId;/s,
    "Specialist-scoped planner users should default to their own planner only when they do not already have a valid selected specialist."
  );

  assert.match(
    schedulerSource,
    /readStoredPlannerFilterMode\(currentUserId\) === "client"\s*\?\s*readStoredPlannerClientSelectionId\(currentUserId\)\s*:\s*""/,
    "Planner should restore the saved client filter when client mode was the last active toolbar mode."
  );

  assert.match(
    schedulerSource,
    /const shouldRestoreClientFocus = \([\s\S]*persistedPlannerFilterMode === "client"[\s\S]*\);[\s\S]*if \(shouldRestoreClientFocus\) \{[\s\S]*setSelectedPlannerClientFilterId\(preferredClientId\);[\s\S]*setSelectedSpecialistId\(""\);/s,
    "Planner bootstrap should reopen in client mode when the last saved toolbar state was a client selection."
  );

  assert.match(
    schedulerSource,
    /if \(!isSchedulerInitialized\) \{\s*return;\s*\}[\s\S]*const normalizedClientId = String\(selectedPlannerClientFilterId \|\| ""\)\.trim\(\);/s,
    "Planner should not clear the restored client selection before the initial toolbar data finishes loading."
  );

  assert.match(
    schedulerSource,
    /window\.localStorage\.setItem\(clientStorageKey,\s*clientId\);[\s\S]*window\.localStorage\.setItem\(modeStorageKey,\s*"client"\);[\s\S]*window\.localStorage\.setItem\(modeStorageKey,\s*"specialist"\);/s,
    "Planner should persist both the selected ids and which toolbar mode was last active."
  );
});
