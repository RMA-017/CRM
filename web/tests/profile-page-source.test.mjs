import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("ProfilePage forwards work-schedule action permissions to ProfileMainContent", async () => {
  const source = await readFile(new URL("../src/pages/ProfilePage.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /canCreateAppointmentWorkSchedule=\{canCreateAppointmentWorkSchedule\}/,
    "ProfilePage should forward work-schedule create access."
  );
  assert.match(
    source,
    /canUpdateAppointmentWorkSchedule=\{canUpdateAppointmentWorkSchedule\}/,
    "ProfilePage should forward work-schedule update access."
  );
  assert.match(
    source,
    /canDeleteAppointmentWorkSchedule=\{canDeleteAppointmentWorkSchedule\}/,
    "ProfilePage should forward work-schedule delete access."
  );
});
