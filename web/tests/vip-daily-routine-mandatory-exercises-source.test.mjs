import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("VIP daily routines wire mandatory exercises and specialist selection through modal, save, and shared views", async () => {
  const [modalsSource, sectionSource, managementSource, schedulerSource, myChildrenSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/panels/VipAssignmentModals.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/useVipDailyRoutinesSection.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/useProfileVipManagement.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/VipMyChildrenPanel.jsx", import.meta.url), "utf8")
  ]);

  assert.match(
    modalsSource,
    /id="vipDailyRoutineMandatoryExercisesInput"[\s\S]*placeholder="Visible to everyone"/,
    "VIP daily routine modal should expose a mandatory exercises textarea that is marked as visible to everyone."
  );

  assert.match(
    modalsSource,
    /id="vipDailyRoutineSpecialistSelect"[\s\S]*options={vipDailyRoutineSpecialistOptions}/,
    "VIP daily routine modal should let users choose which specialist the shared routine belongs to."
  );

  assert.match(
    sectionSource,
    /mandatoryExercises:\s*normalizedMandatoryExercises/,
    "VIP daily routine save requests should send mandatory exercises to the API."
  );

  assert.match(
    managementSource,
    /if \(!specialistId\) \{\s*setVipDailyRoutineModalError\("Specialist is required\."\);/s,
    "VIP daily routine save flow should require a specialist selection."
  );

  assert.match(
    managementSource,
    /saveVipDailyRoutine\(\{\s*[\s\S]*specialistId,/,
    "VIP daily routine save requests should send the selected specialist to the API."
  );

  assert.match(
    schedulerSource,
    /secondaryText:\s*mandatoryExercises \|\| note \|\| "Daily routine"/,
    "VIP scheduler routine cards should prefer mandatory exercises in the shared routine text."
  );

  assert.match(
    schedulerSource,
    /const isRoutineCard = String\(item\?\.itemType \|\| ""\)\.trim\(\)\.toLowerCase\(\) === "daily-routine";[\s\S]*!isRoutineCard && canMutateAppointmentSpecialist/s,
    "Specialist planner should render shared daily routines as non-editable routine cards."
  );

  assert.match(
    myChildrenSource,
    /mandatoryExercises:\s*String\(routine\?\.mandatoryExercises \|\| routine\?\.mandatory_exercises \|\| ""\)\.trim\(\)/,
    "My Children routine items should receive mandatory exercises from shared routine data."
  );

  assert.match(
    myChildrenSource,
    /\?\s*\(mandatoryExercises \|\| note \|\| "Daily routine"\)/,
    "My Children routine cards should show mandatory exercises to parents when available."
  );
});
