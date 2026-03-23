import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment planner client-focused VIP view keeps daily routines visible", async () => {
  const source = await readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /function getClientFocusedPlannerGroupMeta\(item, index = 0\)[\s\S]*className \? `Class routine: \$\{className\}` : "Class routine"/,
    "Client-focused planner should keep a visible fallback group for VIP routines without a specialist."
  );

  assert.match(
    source,
    /function shouldIncludeClientFocusedPlannerItem\(item, selectedClientId = ""\)[\s\S]*itemType === "daily-routine"[\s\S]*return true;/,
    "Client-focused planner should keep daily-routine cards even when they do not carry a clientId."
  );

  assert.match(
    source,
    /scheduleItems\.forEach\(\(item, index\) => \{[\s\S]*getClientFocusedPlannerGroupMeta\(item, index\)/,
    "Client-focused planner should group fetched VIP routine items before rendering."
  );

  assert.match(
    source,
    /rawDayItems\.forEach\(\(item\) => \{[\s\S]*shouldIncludeClientFocusedPlannerItem\(item, normalizedSelectedPlannerClientFilterId\)/,
    "Client-focused planner should no longer filter out VIP routine cards by empty clientId."
  );
});
