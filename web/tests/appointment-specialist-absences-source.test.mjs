import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("specialist absences menu and planner source wiring stay in place", async () => {
  const [sideMenuSource, appSource, schedulerSource, helpersSource, accessSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/ProfileSideMenu.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/profile.helpers.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/useProfileAccess.js", import.meta.url), "utf8")
  ]);

  assert.match(
    sideMenuSource,
    /id="openAppointmentSpecialistAbsencesBtn"[\s\S]*Specialist Absences/,
    "Profile side menu should expose the Specialist Absences submenu entry."
  );

  assert.match(
    appSource,
    /path="\/appointments\/specialist-absences"[\s\S]*forcedView="appointment-specialist-absences"/,
    "App routes should wire the specialist absences panel URL."
  );

  assert.match(
    schedulerSource,
    /apiFetch\(`\/api\/appointments\/absences\?\$\{new URLSearchParams\(/,
    "Appointment scheduler should fetch specialist absences for the visible week."
  );

  assert.match(
    schedulerSource,
    /absencesForSpecialist=\{absencesForSpecialist\}/,
    "Appointment planner grid should receive absence items for rendering."
  );

  assert.match(
    helpersSource,
    /"appointment-specialist-absences": \["appointments\.specialist_absences"\]/,
    "Forced specialist absences view should be gated by the dedicated org feature."
  );

  assert.match(
    accessSource,
    /PERMISSIONS\.APPOINTMENTS_SPECIALIST_ABSENCES_READ[\s\S]*canOpenAppointmentSpecialistAbsences/,
    "Profile access hook should use dedicated specialist absence permissions."
  );
});
