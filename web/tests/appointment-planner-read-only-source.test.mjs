import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("appointment planner read-only mode keeps report filters gated while planner readers can still see breaks in the grid", async () => {
  const [schedulerSource, panelSource, mainContentSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/AppointmentScheduler.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/AppointmentPlannerPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8")
  ]);

  assert.match(
    schedulerSource,
    /function AppointmentScheduler\(\{\s*canReadAppointments = true,\s*canReadAppointmentBreaks = true,[\s\S]*canReadStatisticsPlannerReport = false,/s,
    "Appointment scheduler should accept dedicated read flags for breaks and planner report."
  );

  assert.match(
    schedulerSource,
    /const canReadPlannerBreaks = canReadAppointments \|\| canReadAppointmentBreaks;/,
    "Appointment scheduler should let planner readers load breaks for the grid even without the standalone breaks permission."
  );

  assert.match(
    schedulerSource,
    /!vipOnly && canReadStatisticsPlannerReport\s*\?\s*apiFetch\("\/api\/appointments\/report\/filters(?:\?includeAllClients=true)?"/s,
    "Planner report filters should only load when the dedicated statistics permission is present."
  );

  assert.match(
    schedulerSource,
    /if \(vipOnly \|\| !selectedSpecialistId \|\| !canReadPlannerBreaks\)/,
    "Appointment breaks should load in the planner when either planner read or breaks read access is present."
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
