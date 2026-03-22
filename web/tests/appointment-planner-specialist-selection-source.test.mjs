import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment planner keeps specialist selection user-scoped and defaults specialist users to their own planner", async () => {
  const schedulerSource = await readFile(
    new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    schedulerSource,
    /function getSchedulerSelectionStorageKey\(vipOnly = false,\s*currentUserId = ""\)[\s\S]*normalizedCurrentUserId \? `\$\{baseKey\}:\$\{normalizedCurrentUserId\}` : baseKey;/,
    "Planner storage key should be scoped per current user so one user's selected specialist does not leak into another session."
  );

  assert.match(
    schedulerSource,
    /readStoredSchedulerSelectionId\(vipOnly,\s*currentUserId\)/,
    "Planner should read the persisted specialist selection from the current user's own storage key."
  );

  assert.match(
    schedulerSource,
    /const preferredId = String\(prev \|\| persisted \|\| ""\)\.trim\(\);[\s\S]*if \(preferredId && nextSpecialists\.some\(\(itemValue\) => itemValue\.id === preferredId\)\) \{\s*return preferredId;\s*\}[\s\S]*if \(\s*!vipOnly\s*&&\s*restrictCreateToOwnSpecialist\s*&&\s*normalizedCurrentUserId[\s\S]*return normalizedCurrentUserId;/s,
    "Specialist-scoped planner users should default to their own planner only when they do not already have a valid selected specialist."
  );

  assert.match(
    schedulerSource,
    /getSchedulerSelectionStorageKey\(vipOnly,\s*currentUserId\)/,
    "Planner should also persist specialist selection back into the current user's own storage key."
  );
});
