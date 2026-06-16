import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("profile side menu keeps submenu state batched and is pre-mounted for smoother toggles", async () => {
  const [menuSource, pageSource, layoutSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/ProfileSideMenu.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ProfilePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/css/layout/profile-layout.css", import.meta.url), "utf8")
  ]);

  assert.match(
    menuSource,
    /const \[openSubmenus, setOpenSubmenus\] = useState\(CLOSED_SUBMENUS\);/,
    "Profile side menu should keep submenu open flags in a single state object."
  );

  assert.doesNotMatch(
    menuSource,
    /setClientsMenuOpen|setVipClientsMenuOpen|setAssignmentsMenuOpen|setAppointmentMenuOpen|setUsersMenuOpen|setStatisticsMenuOpen|setSettingsMenuOpen|setAdminSettingsMenuOpen/,
    "Profile side menu should avoid separate submenu state setters."
  );

  assert.match(
    menuSource,
    /statistics: false[\s\S]*canOpenAppointmentStatistics,[\s\S]*canOpenStatisticsPlannerReport,[\s\S]*openStatisticsPlannerReportPanel,[\s\S]*id="statisticsMenuGroup"[\s\S]*hidden=\{!canOpenAppointmentStatistics && !canOpenStatisticsPlannerReport\}[\s\S]*id="openStatisticsPlannerReportBtn"[\s\S]*hidden=\{!canOpenStatisticsPlannerReport\}[\s\S]*onClick=\{openStatisticsPlannerReportPanel\}/s,
    "Profile side menu should expose Statistics > Lesson Status Report when the planner report permission is granted."
  );

  assert.match(
    pageSource,
    /canOpenAppointmentStatistics=\{canOpenAppointmentStatistics\}[\s\S]*canOpenStatisticsPlannerReport=\{canOpenStatisticsPlannerReport\}[\s\S]*openStatisticsPlannerReportPanel=\{openStatisticsPlannerReportPanel\}/s,
    "Profile page should pass planner report access and open handlers into the side menu."
  );

  assert.doesNotMatch(
    pageSource,
    /sideMenuMounted/,
    "Profile page should keep the side menu mounted instead of deferring it behind extra state."
  );

  assert.match(
    pageSource,
    /import ProfileSideMenu from "\.\/profile\/ProfileSideMenu\.jsx";/,
    "Profile page should load the side menu eagerly to avoid first-open lag."
  );

  assert.match(
    menuSource,
    /const menuOpenRef = useRef\(false\);[\s\S]*const closeSideMenu = useCallback\(\(\) => \{[\s\S]*menuOpenRef\.current = false;[\s\S]*setOpenSubmenus\(CLOSED_SUBMENUS\);/s,
    "Profile side menu should close instantly and reset submenu state without timeout-based delay."
  );

  assert.doesNotMatch(
    pageSource,
    /loadProfileSideMenu|pendingSideMenuOpenRef|onMouseEnter=\{preloadSideMenu\}|onFocus=\{preloadSideMenu\}|<Suspense fallback=\{null\}>\s*<ProfileSideMenu/s,
    "Profile page should avoid extra lazy-loading and hover-preload plumbing for the side menu."
  );

  assert.match(
    layoutSource,
    /\.side-menu\s*\{[\s\S]*transition: none;/s,
    "Side menu should avoid transition delay when opening and closing."
  );

  assert.doesNotMatch(
    layoutSource,
    /\.side-menu\.open\s*\{[\s\S]*box-shadow:/s,
    "Side menu open state should avoid toggling a heavier box-shadow during animation."
  );

  assert.doesNotMatch(
    layoutSource,
    /\.menu-overlay\.closing|\.side-menu\.closing/s,
    "Side menu should not keep an extra closing phase that adds lag."
  );
});
