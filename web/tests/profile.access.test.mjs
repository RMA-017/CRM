import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useProfileAccess } from "../src/pages/profile/useProfileAccess.js";

function readAccessSnapshot(profile, forcedView = "none") {
  let snapshot = null;

  function Probe() {
    snapshot = useProfileAccess(profile, forcedView);
    return React.createElement("div");
  }

  renderToStaticMarkup(React.createElement(Probe));
  return snapshot;
}

test("legacy admin keeps settings submenu access when only one settings resource has explicit permissions", () => {
  const access = readAccessSnapshot({
    isAdmin: true,
    isPlatformAdmin: false,
    permissions: ["settings.positions.read"],
    orgFeatures: ["settings.roles", "settings.positions"]
  });

  assert.equal(access.canOpenSettingsPositions, true);
  assert.equal(access.canOpenSettingsRoles, true);
  assert.equal(access.hasSettingsMenuAccess, true);
});

test("notifications send permission allows notifications view without opening settings menu", () => {
  const access = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: ["notifications.send"],
    orgFeatures: ["notifications"]
  }, "notifications-send");

  assert.equal(access.canSendNotifications, true);
  assert.equal(access.hasSettingsMenuAccess, false);
  assert.equal(access.canAccessForcedView, true);
});

test("appointment settings and appointment norms access are independent", () => {
  const appointmentsOnly = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: ["settings.appointments.read"],
    orgFeatures: ["settings.appointments", "settings.appointment_norms"]
  });
  const normsOnly = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: ["settings.appointment-norms.read"],
    orgFeatures: ["settings.appointments", "settings.appointment_norms"]
  });

  assert.equal(appointmentsOnly.canOpenAppointmentSettings, true);
  assert.equal(appointmentsOnly.canOpenSettingsNorms, false);
  assert.equal(normsOnly.canOpenAppointmentSettings, false);
  assert.equal(normsOnly.canOpenSettingsNorms, true);
});

test("appointment norms create and delete require their own permissions", () => {
  const access = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: [
      "settings.appointment-norms.read",
      "settings.appointment-norms.update"
    ],
    orgFeatures: ["settings.appointment_norms"]
  });

  assert.equal(access.canOpenSettingsNorms, true);
  assert.equal(access.canCreateSettingsAppointmentNorms, false);
  assert.equal(access.canUpdateSettingsAppointmentNorms, true);
  assert.equal(access.canDeleteSettingsAppointmentNorms, false);
});

test("plain clients read does not unlock vip clients menus", () => {
  const access = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: ["clients.read"],
    orgFeatures: [
      "clients.all_clients",
      "vip_clients.attendance",
      "vip_clients.my_class",
      "vip_clients.my_children",
      "vip_clients.daily_routines"
    ]
  });

  assert.equal(access.hasClientsMenuAccess, true);
  assert.equal(access.canReadClients, true);
  assert.equal(access.canOpenAppointmentVipClients, false);
  assert.equal(access.canOpenAppointmentVipMyClass, false);
  assert.equal(access.canOpenMyChildren, false);
  assert.equal(access.canOpenAppointmentVipDailyRoutines, false);
});
