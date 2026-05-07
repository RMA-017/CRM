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

test("planner permissions drive break and blocked-time tools inside the planner", () => {
  const access = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: [
      "appointments.schedule",
      "appointments.planner.read",
      "appointments.planner.create",
      "appointments.planner.update",
      "appointments.planner.delete"
    ],
    orgFeatures: ["appointments.planner"]
  });

  assert.equal(access.canOpenAppointmentSchedule, true);
  assert.equal(access.hasAppointmentsMenuAccess, true);
  assert.equal(access.canReadAppointmentBreaks, true);
  assert.equal(access.canUpdateAppointmentBreaks, true);
  assert.equal(access.canCreateAppointmentWorkSchedule, true);
  assert.equal(access.canUpdateAppointmentWorkSchedule, true);
  assert.equal(access.canDeleteAppointmentWorkSchedule, true);
  assert.equal(access.canViewAppointmentSpecialistAbsenceBlocks, true);
  assert.equal(access.canOpenAppointmentBreaks, false);
  assert.equal(access.canOpenAppointmentSpecialistAbsences, false);
  assert.equal(access.canOpenAppointmentWorkSchedule, false);
});

test("old appointment subviews are no longer force-openable", () => {
  const profile = {
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: [
      "appointments.schedule",
      "appointments.planner.read",
      "appointments.planner.update"
    ],
    orgFeatures: ["appointments.planner"]
  };

  assert.equal(readAccessSnapshot(profile, "appointment-breaks").canAccessForcedView, false);
  assert.equal(readAccessSnapshot(profile, "appointment-specialist-absences").canAccessForcedView, false);
  assert.equal(readAccessSnapshot(profile, "appointment-work-schedule").canAccessForcedView, false);
});

test("planner statistics permission unlocks statistics menu without clients read", () => {
  const permissionCodes = [
    "appointments.statistics.planner-report",
    "appointments.statistics.planner-report.only",
    "appointments.statistics.planner-report.all"
  ];

  for (const permissionCode of permissionCodes) {
    const plannerReportAccess = readAccessSnapshot({
      isAdmin: false,
      isPlatformAdmin: false,
      permissions: [permissionCode],
      orgFeatures: ["statistics.planner_report"]
    }, "statistics-planner-report");

    assert.equal(plannerReportAccess.canOpenAppointmentStatistics, true);
    assert.equal(plannerReportAccess.canOpenStatisticsPlannerReport, true);
    assert.equal(plannerReportAccess.canAccessForcedView, true);
  }
});

test("website management permissions unlock site content without admin role", () => {
  const access = readAccessSnapshot({
    username: "editor",
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: [
      "website.management.read",
      "website.management.create",
      "website.management.update"
    ],
    orgFeatures: ["website.management"]
  }, "site-content");

  assert.equal(access.canOpenSiteContent, true);
  assert.equal(access.canCreateSiteContent, true);
  assert.equal(access.canUpdateSiteContent, true);
  assert.equal(access.canDeleteSiteContent, false);
  assert.equal(access.canAccessForcedView, true);
});
