import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPermissionCodesByOrgFeatures,
  hasOrgFeature,
  normalizeAllowedFeatures
} from "../src/lib/org-features.js";

test("normalizeAllowedFeatures preserves explicit empty array", () => {
  assert.equal(normalizeAllowedFeatures(null), null);
  assert.deepEqual(normalizeAllowedFeatures([]), []);
  assert.deepEqual(
    normalizeAllowedFeatures(["appointments.breaks", "APPOINTMENTS.BREAKS", "invalid"]),
    ["appointments.breaks"]
  );
});

test("hasOrgFeature respects empty arrays and parent features", () => {
  assert.equal(hasOrgFeature([], "appointments.breaks"), false);
  assert.equal(hasOrgFeature(["appointments"], "appointments.breaks"), true);
  assert.equal(hasOrgFeature(["vip_clients.my_children"], "vip_clients.my_children"), true);
  assert.equal(hasOrgFeature(["vip_clients.my_children"], "vip_clients.attendance"), false);
});

test("filterPermissionCodesByOrgFeatures filters child permissions precisely", () => {
  const allowedFeatures = [
    "appointments",
    "appointments.breaks",
    "vip_clients",
    "vip_clients.my_children",
    "assignments",
    "assignments.class"
  ];

  assert.deepEqual(
    filterPermissionCodesByOrgFeatures(
      [
        "appointments.read",
        "appointments.breaks",
        "appointments.schedule",
        "appointments.client-search",
        "appointments.vip-clients.read",
        "appointments.vip-clients.my-children",
        "appointments.assignments.read",
        "profile.read"
      ],
      allowedFeatures
    ),
    [
      "appointments.read",
      "appointments.breaks",
      "appointments.vip-clients.my-children",
      "appointments.assignments.read",
      "profile.read"
    ]
  );
});

test("filterPermissionCodesByOrgFeatures keeps separate statistics codes per feature", () => {
  // only planner_report enabled — class-attendance filtered out
  assert.deepEqual(
    filterPermissionCodesByOrgFeatures(
      [
        "appointments.statistics.class-attendance",
        "appointments.statistics.planner-report"
      ],
      ["statistics", "statistics.planner_report"]
    ),
    ["appointments.statistics.planner-report"]
  );

  // both features enabled — both codes pass
  assert.deepEqual(
    filterPermissionCodesByOrgFeatures(
      [
        "appointments.statistics.class-attendance",
        "appointments.statistics.planner-report"
      ],
      ["statistics.class_attendance", "statistics.planner_report"]
    ),
    [
      "appointments.statistics.class-attendance",
      "appointments.statistics.planner-report"
    ]
  );
});

test("filterPermissionCodesByOrgFeatures includes settings permissions only for enabled settings children", () => {
  assert.deepEqual(
    filterPermissionCodesByOrgFeatures(
      [
        "settings.appointments.read",
        "settings.appointments.update",
        "settings.roles.read",
        "settings.positions.read"
      ],
      ["settings.roles"]
    ),
    ["settings.roles.read"]
  );
});
