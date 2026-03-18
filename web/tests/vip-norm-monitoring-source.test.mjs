import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("VIP norm monitoring is wired into routes, menu, panel filters, and dedicated access gates", async () => {
  const [appSource, menuSource, panelSource, mainContentSource, helperSource, accessSource, hookSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileSideMenu.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/VipNormMonitoringPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/profile.helpers.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/useProfileAccess.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/useVipNormMonitoringSection.js", import.meta.url), "utf8")
  ]);

  assert.match(
    appSource,
    /\/vip-clients\/norm-monitoring/,
    "App routes should expose the VIP norm monitoring page."
  );

  assert.match(
    menuSource,
    /id="openVipNormMonitoringBtn"[\s\S]*Norm Monitoring/s,
    "VIP Clients menu should include a Norm Monitoring entry."
  );

  assert.match(
    menuSource,
    /hidden=\{!canOpenAppointmentVipNormMonitoring\}/,
    "VIP Clients menu should gate Norm Monitoring with its dedicated access flag."
  );

  assert.match(
    mainContentSource,
    /mainView === "appointment-vip-norm-monitoring"/,
    "Profile main content should render the VIP norm monitoring panel for its dedicated view."
  );

  assert.match(
    helperSource,
    /"appointment-vip-norm-monitoring": \["vip_clients\.norm_monitoring"\]/,
    "Forced view mapping should use the dedicated Norm Monitoring org feature."
  );

  assert.match(
    accessSource,
    /const canOpenAppointmentVipNormMonitoring = \(\s*hasOrgFeature\("vip_clients\.norm_monitoring"\)\s*&& canNormMonitoringPermission\s*\)/s,
    "Profile access should compute a dedicated Norm Monitoring access flag."
  );

  assert.match(
    panelSource,
    /vipNormMonitoringClientFilterSelect[\s\S]*vipNormMonitoringClassFilterSelect[\s\S]*vipNormMonitoringPositionFilterSelect[\s\S]*vipNormMonitoringSpecialistFilterSelect/s,
    "VIP norm monitoring panel should expose client, class, position, and specialist filters."
  );

  assert.match(
    panelSource,
    /vipNormMonitoringMessage[\s\S]*id="vipNormMonitoringState"/s,
    "VIP norm monitoring panel should render the monitoring status message."
  );

  assert.match(
    panelSource,
    /<th>Client<\/th>[\s\S]*<th>Position<\/th>[\s\S]*<th>Weekly norm<\/th>[\s\S]*<th>Booked this week<\/th>[\s\S]*<th>Confirmed<\/th>[\s\S]*<th>Cancelled<\/th>/s,
    "VIP norm monitoring table should render the expected numeric monitoring columns."
  );

  assert.doesNotMatch(
    hookSource,
    /\.filter\(\(item\) => Boolean\(item\.clientId\) && Boolean\(item\.positionId\)\)/,
    "VIP norm monitoring should not discard rows just because the backend reports a setup issue instead of a real position id."
  );

  assert.match(
    panelSource,
    /item\.weeklyNorm > 0 \? item\.weeklyNorm : "-"/,
    "VIP norm monitoring should render a placeholder weekly norm when setup is incomplete."
  );

  assert.match(
    hookSource,
    /confirmedCount: Number\.parseInt\(String\(item\?\.confirmedCount \|\| item\?\.confirmed_count \|\| "0"\), 10\) \|\| 0[\s\S]*cancelledCount: Number\.parseInt\(String\(item\?\.cancelledCount \|\| item\?\.cancelled_count \|\| "0"\), 10\) \|\| 0/s,
    "VIP norm monitoring hook should normalize confirmed and cancelled lesson counters."
  );
});
