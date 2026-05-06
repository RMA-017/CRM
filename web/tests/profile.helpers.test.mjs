import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRolePermissionTree,
  filterPermissionsByOrgFeatures,
  togglePermissionCodes
} from "../src/pages/profile/profile.helpers.js";

test("filterPermissionsByOrgFeatures respects child feature mapping", () => {
  const permissions = [
    { value: "appointments.schedule", label: "Appointments Planner Submenu" },
    { value: "appointments.planner.update", label: "Update Appointment Planner" },
    { value: "settings.roles.read", label: "Read Role Settings" },
    { value: "profile.read", label: "Read Profile" }
  ];

  assert.deepEqual(
    filterPermissionsByOrgFeatures(permissions, [
      "appointments.planner"
    ]).map((item) => item.value),
    [
      "appointments.schedule",
      "appointments.planner.update",
      "profile.read"
    ]
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
    { value: "settings.roles.read", label: "Read Role Settings" },
    { value: "settings.roles.create", label: "Create Role Settings" },
    { value: "settings.positions.read", label: "Read Position Settings" }
  ];

  const tree = buildRolePermissionTree(permissions, [
    "settings",
    "settings.appointments",
    "settings.roles",
    "settings.positions"
  ]);
  const settingsGroup = tree.find((group) => group.key === "settings");
  assert.ok(settingsGroup, "settings group should appear");
  assert.deepEqual(
    settingsGroup.children.map((child) => child.label),
    ["Appointments", "Roles", "Positions"]
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
