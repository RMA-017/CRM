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
    /if \(\s*!vipOnly\s*&&\s*restrictCreateToOwnSpecialist\s*&&\s*normalizedCurrentUserId[\s\S]*return normalizedCurrentUserId;/,
    "Specialist-scoped planner users should default to their own specialist id when the planner loads."
  );

  assert.match(
    schedulerSource,
    /getSchedulerSelectionStorageKey\(vipOnly,\s*currentUserId\)/,
    "Planner should also persist specialist selection back into the current user's own storage key."
  );
});
