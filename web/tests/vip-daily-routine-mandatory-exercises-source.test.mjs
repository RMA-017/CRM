import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("VIP daily routines keep specialist selection optional while planner cards show class and activity", async () => {
  const [modalsSource, sectionSource, managementSource, schedulerSource, myChildrenSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/panels/VipAssignmentModals.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/useVipDailyRoutinesSection.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/useProfileVipManagement.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/VipMyChildrenPanel.jsx", import.meta.url), "utf8")
  ]);

  assert.doesNotMatch(
    modalsSource,
    /id="vipDailyRoutineMandatoryExercisesInput"/,
    "VIP daily routine modal should no longer expose the removed mandatory exercises field."
  );

  assert.match(
    modalsSource,
    /id="vipDailyRoutineSpecialistSelect"[\s\S]*placeholder=\{String\(vipDailyRoutineEditModal\.classId \|\| ""\)\.trim\(\) \? "Optional specialist" : "Select class first"\}/,
    "VIP daily routine modal should keep the specialist picker optional."
  );

  assert.match(
    sectionSource,
    /specialistId:\s*normalizedSpecialistId \|\| null/,
    "VIP daily routine save requests should send the selected specialist when provided and allow null otherwise."
  );

  assert.doesNotMatch(
    managementSource,
    /Specialist is required\./,
    "VIP daily routine save flow should no longer require a specialist selection."
  );

  assert.match(
    managementSource,
    /saveVipDailyRoutine\(\{\s*[\s\S]*specialistId:\s*specialistId \|\| null,/,
    "VIP daily routine save requests should send the selected specialist to the API."
  );

  assert.match(
    schedulerSource,
    /client:\s*isRoutineItem[\s\S]*String\(item\?\.className \|\| ""\)\.trim\(\)[\s\S]*service:\s*isRoutineItem[\s\S]*String\(item\?\.serviceName \|\| ""\)\.trim\(\)/s,
    "VIP scheduler routine cards should show class on the primary line and activity on the secondary line."
  );

  assert.match(
    schedulerSource,
    /const isRoutineCard = String\(item\?\.itemType \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "daily-routine";[\s\S]*!isRoutineCard && canMutateAppointmentSpecialist/s,
    "Specialist planner should render shared daily routines as non-editable routine cards."
  );

  assert.doesNotMatch(
    myChildrenSource,
    /mandatoryExercises/,
    "My Children routine items should no longer depend on the removed mandatory exercises field."
  );

  assert.doesNotMatch(
    myChildrenSource,
    /mandatoryExercises \|\| note/,
    "My Children routine cards should not try to render mandatory exercises anymore."
  );
});
