import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment planner read-only mode gates extra filters and breaks requests by their own permissions", async () => {
  const [schedulerSource, panelSource, mainContentSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/AppointmentPlannerPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8")
  ]);

  assert.match(
    schedulerSource,
    /function AppointmentScheduler\(\{\s*canReadAppointments = true,\s*canReadAppointmentBreaks = true,\s*canReadStatisticsPlannerReport = true,/s,
    "Appointment scheduler should accept dedicated read flags for breaks and planner report."
  );

  assert.match(
    schedulerSource,
    /!vipOnly && canReadStatisticsPlannerReport\s*\?\s*apiFetch\("\/api\/appointments\/report\/filters"/s,
    "Planner report filters should only load when the dedicated statistics permission is present."
  );

  assert.match(
    schedulerSource,
    /if \(vipOnly \|\| !selectedSpecialistId \|\| !canReadAppointmentBreaks\)/,
    "Appointment breaks should only load when the dedicated breaks read permission is present."
  );

  assert.match(
    panelSource,
    /canReadAppointmentBreaks={canReadAppointmentBreaks}/,
    "Appointment planner panel should forward breaks read access to the scheduler."
  );

  assert.match(
    panelSource,
    /canReadStatisticsPlannerReport={canReadStatisticsPlannerReport}/,
    "Appointment planner panel should forward planner report read access to the scheduler."
  );

  assert.match(
    mainContentSource,
    /canReadStatisticsPlannerReport={canReadStatisticsPlannerReportPermission}/,
    "Profile main content should connect planner report read permission into the planner panel."
  );
});
