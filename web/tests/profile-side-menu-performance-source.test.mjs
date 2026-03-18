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
    /const CLOSE_ANIMATION_MS = 90;/,
    "Profile side menu should keep close timing very short to reduce perceived lag."
  );

  assert.doesNotMatch(
    pageSource,
    /loadProfileSideMenu|pendingSideMenuOpenRef|onMouseEnter=\{preloadSideMenu\}|onFocus=\{preloadSideMenu\}|<Suspense fallback=\{null\}>\s*<ProfileSideMenu/s,
    "Profile page should avoid extra lazy-loading and hover-preload plumbing for the side menu."
  );

  assert.match(
    pageSource,
    /setTimeout\(warmProfileUi, 120\)/,
    "Profile page should fall back to an early preload even without requestIdleCallback."
  );

  assert.match(
    layoutSource,
    /\.side-menu\s*\{[\s\S]*will-change: transform;[\s\S]*transition: transform 90ms var\(--ease\);/s,
    "Side menu should animate mainly via transform to keep the motion lightweight."
  );

  assert.doesNotMatch(
    layoutSource,
    /\.side-menu\.open\s*\{[\s\S]*box-shadow:/s,
    "Side menu open state should avoid toggling a heavier box-shadow during animation."
  );

  assert.match(
    layoutSource,
    /\.menu-overlay\.closing\s*\{[\s\S]*pointer-events: none;/s,
    "Closing overlay should stop blocking interaction while it fades out."
  );
});
