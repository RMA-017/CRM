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

test("my class permission unlocks my class without general appointments read", () => {
  const access = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: ["appointments.vip-clients.my-class"],
    orgFeatures: ["vip_clients.my_class"]
  });

  assert.equal(access.canReadAppointments, false);
  assert.equal(access.canOpenAppointmentVipMyClass, true);
});

test("class and tutor assignment permissions stay independent", () => {
  const classAccess = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: ["appointments.assignments.class.read"],
    orgFeatures: ["assignments.class", "assignments.tutor"]
  }, "appointment-vip-assignments");
  const tutorAccess = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: ["appointments.assignments.tutor.read"],
    orgFeatures: ["assignments.class", "assignments.tutor"]
  }, "appointment-vip-tutor-assignments");

  assert.equal(classAccess.canOpenAppointmentVipClassAssignments, true);
  assert.equal(classAccess.canOpenAppointmentVipTutorAssignments, false);
  assert.equal(classAccess.canAccessForcedView, true);

  assert.equal(tutorAccess.canOpenAppointmentVipClassAssignments, false);
  assert.equal(tutorAccess.canOpenAppointmentVipTutorAssignments, true);
  assert.equal(tutorAccess.canAccessForcedView, true);
});

test("work schedule permissions are independent from appointment settings permissions", () => {
  const access = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: [
      "appointments.work-schedule",
      "appointments.work-schedule.read",
      "appointments.work-schedule.update"
    ],
    orgFeatures: ["appointments.work_schedule"]
  });

  assert.equal(access.canOpenAppointmentWorkSchedule, true);
  assert.equal(access.canCreateAppointmentWorkSchedule, false);
  assert.equal(access.canUpdateAppointmentWorkSchedule, true);
  assert.equal(access.canDeleteAppointmentWorkSchedule, false);
  assert.equal(access.canOpenAppointmentSettings, false);
});

test("appointment settings permissions do not unlock work schedule for non-admin users", () => {
  const access = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: ["settings.appointments.read", "settings.appointments.update"],
    orgFeatures: ["settings.appointments", "appointments.work_schedule"]
  });

  assert.equal(access.canOpenAppointmentWorkSchedule, false);
  assert.equal(access.canReadAppointmentWorkSchedule, false);
  assert.equal(access.canCreateAppointmentWorkSchedule, false);
  assert.equal(access.canUpdateAppointmentWorkSchedule, false);
  assert.equal(access.canDeleteAppointmentWorkSchedule, false);
});

test("legacy admins keep work schedule access without explicit work schedule permissions", () => {
  const access = readAccessSnapshot({
    isAdmin: true,
    isPlatformAdmin: false,
    permissions: ["settings.appointments.read", "settings.appointments.update"],
    orgFeatures: ["settings.appointments", "appointments.work_schedule"]
  });

  assert.equal(access.canOpenAppointmentWorkSchedule, true);
  assert.equal(access.canReadAppointmentWorkSchedule, true);
  assert.equal(access.canCreateAppointmentWorkSchedule, true);
  assert.equal(access.canUpdateAppointmentWorkSchedule, true);
  assert.equal(access.canDeleteAppointmentWorkSchedule, true);
});

test("platform admins cannot force-open work schedule when explicit permissions remove read access", () => {
  const access = readAccessSnapshot({
    isAdmin: true,
    isPlatformAdmin: true,
    permissions: ["appointments.work-schedule.create"],
    orgFeatures: ["appointments.work_schedule"]
  }, "appointment-work-schedule");

  assert.equal(access.canOpenAppointmentWorkSchedule, false);
  assert.equal(access.canAccessForcedView, false);
});

test("breaks permissions are independent from planner permissions", () => {
  const access = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: [
      "appointments.breaks",
      "appointments.breaks.read",
      "appointments.breaks.create",
      "appointments.breaks.delete"
    ],
    orgFeatures: ["appointments.breaks"]
  });

  assert.equal(access.canOpenAppointmentBreaks, true);
  assert.equal(access.canReadAppointmentBreaks, true);
  assert.equal(access.canCreateAppointmentBreaks, true);
  assert.equal(access.canUpdateAppointmentBreaks, false);
  assert.equal(access.canDeleteAppointmentBreaks, true);
  assert.equal(access.canOpenAppointmentSchedule, false);
});

test("statistics permissions unlock statistics menu without clients read", () => {
  const classAttendanceAccess = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: ["appointments.statistics.class-attendance"],
    orgFeatures: ["statistics.class_attendance"]
  }, "statistics-class");
  const plannerReportAccess = readAccessSnapshot({
    isAdmin: false,
    isPlatformAdmin: false,
    permissions: ["appointments.statistics.planner-report"],
    orgFeatures: ["statistics.planner_report"]
  }, "statistics-planner-report");

  assert.equal(classAttendanceAccess.canOpenAppointmentStatistics, true);
  assert.equal(classAttendanceAccess.canOpenStatisticsClassAttendance, true);
  assert.equal(classAttendanceAccess.canAccessForcedView, true);

  assert.equal(plannerReportAccess.canOpenAppointmentStatistics, true);
  assert.equal(plannerReportAccess.canOpenStatisticsPlannerReport, true);
  assert.equal(plannerReportAccess.canAccessForcedView, true);
});
