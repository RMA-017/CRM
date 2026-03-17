import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("profile side menu keeps submenu state batched and is pre-mounted for smoother toggles", async () => {
  const [menuSource, pageSource] = await Promise.all([
    readFile(new URL("../src/pages/profile/ProfileSideMenu.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/ProfilePage.jsx", import.meta.url), "utf8")
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
    /<Suspense fallback=\{null\}>\s*<ProfileSideMenu/s,
    "Profile page should render the side menu inside Suspense without an extra mounted guard."
  );
});
