import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("VIP norm monitoring is wired into routes, menu, and panel filters", async () => {
  const [appSource, menuSource, panelSource, mainContentSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileSideMenu.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/VipNormMonitoringPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8")
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
    mainContentSource,
    /mainView === "appointment-vip-norm-monitoring"/,
    "Profile main content should render the VIP norm monitoring panel for its dedicated view."
  );

  assert.match(
    panelSource,
    /vipNormMonitoringClientFilterSelect[\s\S]*vipNormMonitoringClassFilterSelect[\s\S]*vipNormMonitoringPositionFilterSelect[\s\S]*vipNormMonitoringSpecialistFilterSelect/s,
    "VIP norm monitoring panel should expose client, class, position, and specialist filters."
  );

  assert.match(
    panelSource,
    /<th>Client<\/th>[\s\S]*<th>Position<\/th>[\s\S]*<th>Weekly norm<\/th>[\s\S]*<th>Booked this week<\/th>[\s\S]*<th>Status<\/th>/s,
    "VIP norm monitoring table should render the expected columns."
  );
});
