import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("VIP daily routines panel uses shared custom selects for filters", async () => {
  const source = await readFile(new URL("../src/pages/profile/panels/VipDailyRoutinesPanel.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /import CustomSelect from "\.\.\/\.\.\/\.\.\/components\/CustomSelect\.jsx";/,
    "VIP daily routines panel should use the shared CustomSelect component."
  );

  assert.match(
    source,
    /id="vipDailyRoutineClassFilterSelect"/,
    "VIP daily routines panel should expose a custom class filter select."
  );

  assert.match(
    source,
    /id="vipDailyRoutineActivityFilterSelect"/,
    "VIP daily routines panel should expose a custom activity filter select."
  );

  assert.match(
    source,
    /placeholder="All classes"[\s\S]*menuPortal/s,
    "Class filter should use the shared dropdown behavior with portal rendering."
  );

  assert.match(
    source,
    /const activityOptions = useMemo\(\(\) => \[\.\.\.VIP_DAILY_ROUTINE_ACTIVITY_OPTIONS\], \[\]\);/,
    "Activity filter should reuse the shared VIP daily routine activity options."
  );

  assert.match(
    source,
    /<th>Specialist<\/th>/,
    "VIP daily routines table should expose the selected specialist column."
  );

  assert.match(
    source,
    /<th>Mandatory exercises<\/th>/,
    "VIP daily routines table should expose the mandatory exercises column."
  );
});
