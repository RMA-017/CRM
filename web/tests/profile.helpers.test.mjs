import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRolePermissionTree,
  filterPermissionsByOrgFeatures,
  togglePermissionCodes
} from "../src/pages/profile/profile.helpers.js";

test("filterPermissionsByOrgFeatures respects child feature mapping", () => {
  const permissions = [
    { value: "appointments.breaks.read", label: "Read Appointment Breaks" },
    { value: "appointments.breaks", label: "Appointments Breaks Submenu" },
    { value: "appointments.schedule", label: "Appointments Planner Submenu" },
    { value: "appointments.vip-clients.read", label: "VIP Clients Read" },
    { value: "appointments.vip-clients.my-children", label: "My VIP Children Access" },
    { value: "profile.read", label: "Read Profile" }
  ];

  assert.deepEqual(
    filterPermissionsByOrgFeatures(permissions, [
      "appointments",
      "appointments.breaks",
      "vip_clients",
      "vip_clients.my_children"
    ]).map((item) => item.value),
    [
      "appointments.breaks.read",
      "appointments.breaks",
      "appointments.vip-clients.my-children",
      "profile.read"
    ]
  );
});

test("filterPermissionsByOrgFeatures keeps separate statistics codes per feature", () => {
  const permissions = [
    { value: "appointments.statistics.class-attendance", label: "Statistics Class Attendance Read" },
    { value: "appointments.statistics.planner-report", label: "Statistics Planner Report Read" }
  ];

  // only planner_report enabled — class-attendance filtered out
  assert.deepEqual(
    filterPermissionsByOrgFeatures(permissions, [
      "statistics",
      "statistics.planner_report"
    ]).map((item) => item.value),
    ["appointments.statistics.planner-report"]
  );

  // both features enabled — both codes pass
  assert.deepEqual(
    filterPermissionsByOrgFeatures(permissions, [
      "statistics.class_attendance",
      "statistics.planner_report"
    ]).map((item) => item.value),
    [
      "appointments.statistics.class-attendance",
      "appointments.statistics.planner-report"
    ]
  );
});

test("buildRolePermissionTree groups permissions into accordion tree and marks shared leaves", () => {
  const permissions = [
    { value: "appointments.vip-clients.read", label: "VIP Clients Read" },
    { value: "appointments.vip-clients.create", label: "VIP Clients Create" },
    { value: "appointments.vip-clients.update", label: "VIP Clients Update" },
    { value: "appointments.vip-clients.delete", label: "VIP Clients Delete" },
    { value: "appointments.vip-clients.my-class", label: "VIP Clients My Class" },
    { value: "appointments.vip-clients.daily-routines", label: "VIP Clients Daily Routines" },
    { value: "appointments.assignments.read", label: "Assignments Read" },
    { value: "appointments.assignments.create", label: "Assignments Create" }
  ];

  const tree = buildRolePermissionTree(permissions);
  const vipClientsGroup = tree.find((group) => group.key === "vip_clients");
  const assignmentsGroup = tree.find((group) => group.key === "assignments");

  assert.ok(vipClientsGroup);
  assert.ok(assignmentsGroup);
  assert.deepEqual(
    vipClientsGroup.children.map((child) => child.label),
    ["My Class", "Attendance", "Daily Routines"]
  );
  assert.equal(
    vipClientsGroup.children
      .find((child) => child.label === "Attendance")
      .children.find((leaf) => leaf.code === "appointments.vip-clients.create")
      .isShared,
    true
  );
  assert.equal(
    vipClientsGroup.children
      .find((child) => child.label === "Daily Routines")
      .children.find((leaf) => leaf.code === "appointments.vip-clients.create")
      .isShared,
    true
  );
  assert.deepEqual(
    assignmentsGroup.children.map((child) => child.label),
    ["Class", "Tutor"]
  );
});

test("buildRolePermissionTree groups planner permissions without a generic appointments child", () => {
  const permissions = [
    { value: "profile.read", label: "Read Profile" },
    { value: "profile.update", label: "Update Profile" },
    { value: "appointments.planner.read", label: "Read Appointment Planner" },
    { value: "appointments.planner.create", label: "Create Appointment Planner" },
    { value: "appointments.schedule", label: "Appointments Planner Submenu" }
  ];

  const tree = buildRolePermissionTree(permissions, ["appointments.planner"]);

  // profile permissions must always appear (not an org feature, featureKey = null)
  const profileGroup = tree.find((group) => group.key === "profile");
  assert.ok(profileGroup, "profile group should appear");

  const appointmentsGroup = tree.find((group) => group.key === "appointments");
  assert.ok(appointmentsGroup, "appointments group should appear");
  assert.equal(
    appointmentsGroup.children.some((child) => child.key === "appointments.general"),
    false
  );
  assert.ok(
    appointmentsGroup.children.some((child) => child.key === "appointments.planner"),
    "appointments.planner child should appear"
  );
});

test("buildRolePermissionTree includes settings children when org features allow them", () => {
  const permissions = [
    { value: "settings.appointments.read", label: "Read Appointment Settings" },
    { value: "settings.appointments.update", label: "Update Appointment Settings" },
    { value: "settings.appointment-norms.read", label: "Read Appointment Norm Settings" },
    { value: "settings.appointment-norms.create", label: "Create Appointment Norm Settings" },
    { value: "settings.appointment-norms.update", label: "Update Appointment Norm Settings" },
    { value: "settings.appointment-norms.delete", label: "Delete Appointment Norm Settings" },
    { value: "settings.roles.read", label: "Read Role Settings" },
    { value: "settings.roles.create", label: "Create Role Settings" },
    { value: "settings.positions.read", label: "Read Position Settings" }
  ];

  const tree = buildRolePermissionTree(permissions, [
    "settings",
    "settings.appointments",
    "settings.appointment_norms",
    "settings.roles",
    "settings.positions"
  ]);
  const settingsGroup = tree.find((group) => group.key === "settings");
  assert.ok(settingsGroup, "settings group should appear");
  assert.deepEqual(
    settingsGroup.children.map((child) => child.label),
    ["Appointments", "Appointment Norms", "Roles", "Positions"]
  );
});

test("togglePermissionCodes toggles multiple permission codes at once", () => {
  assert.deepEqual(
    togglePermissionCodes(
      ["users.read"],
      ["users.create", "users.update"],
      true
    ),
    ["users.read", "users.create", "users.update"]
  );

  assert.deepEqual(
    togglePermissionCodes(
      ["users.read", "users.create", "users.update"],
      ["users.read", "users.update"],
      false
    ),
    ["users.create"]
  );
});
