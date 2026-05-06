import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPermissionCodesByOrgFeatures,
  hasOrgFeature,
  normalizeAllowedFeatures
} from "../src/lib/org-features.js";
import { __settingsServiceContracts } from "../src/modules/settings/settings.service.js";

test("normalizeAllowedFeatures preserves explicit empty array", () => {
  assert.equal(normalizeAllowedFeatures(null), null);
  assert.deepEqual(normalizeAllowedFeatures([]), []);
  assert.deepEqual(
    normalizeAllowedFeatures(["appointments.planner", "APPOINTMENTS.PLANNER", "invalid"]),
    ["appointments.planner"]
  );
});

test("hasOrgFeature respects empty arrays and parent features", () => {
  assert.equal(hasOrgFeature([], "appointments.planner"), false);
  assert.equal(hasOrgFeature(["appointments"], "appointments.planner"), true);
  assert.equal(hasOrgFeature(["appointments.planner"], "appointments.planner"), true);
  assert.equal(hasOrgFeature(["settings.roles"], "appointments.planner"), false);
});

test("filterPermissionCodesByOrgFeatures filters child permissions precisely", () => {
  const allowedFeatures = [
    "appointments.planner"
  ];

  assert.deepEqual(
    filterPermissionCodesByOrgFeatures(
      [
        "appointments.schedule",
        "appointments.planner.update",
        "appointments.client-search",
        "settings.appointments.read",
        "profile.read"
      ],
      allowedFeatures
    ),
    [
      "appointments.schedule",
      "appointments.planner.update",
      "appointments.client-search",
      "profile.read"
    ]
  );
});

test("filterPermissionCodesByOrgFeatures gates statistics planner report by feature", () => {
  assert.deepEqual(
    filterPermissionCodesByOrgFeatures(
      ["appointments.statistics.planner-report"],
      []
    ),
    []
  );

  assert.deepEqual(
    filterPermissionCodesByOrgFeatures(
      ["appointments.statistics.planner-report"],
      ["statistics"]
    ),
    ["appointments.statistics.planner-report"]
  );

  assert.deepEqual(
    filterPermissionCodesByOrgFeatures(
      ["appointments.statistics.planner-report"],
      ["statistics.planner_report"]
    ),
    ["appointments.statistics.planner-report"]
  );
});

test("filterPermissionCodesByOrgFeatures includes settings permissions only for enabled settings children", () => {
  assert.deepEqual(
    filterPermissionCodesByOrgFeatures(
      [
        "settings.appointments.read",
        "settings.appointments.update",
        "settings.roles.read",
        "settings.roles.create",
        "settings.positions.read",
        "settings.positions.create"
      ],
      ["settings.roles"]
    ),
    [
      "settings.roles.read",
      "settings.roles.create"
    ]
  );
});

test("admin role permission selection always expands to all active codes allowed by org features", () => {
  const selectedCodes = __settingsServiceContracts.selectPermissionCodesForRoleWrite({
    requestedPermissionCodes: ["users.read"],
    activePermissionCodes: [
      "users.read",
      "users.create",
      "clients.read",
      "settings.roles.read",
      "profile.read"
    ],
    allowedFeatures: ["users.all_users", "settings.roles"],
    isAdmin: true
  });

  assert.deepEqual([...selectedCodes].sort((left, right) => left.localeCompare(right)), [
    "profile.read",
    "users.read",
    "users.create",
    "settings.roles.read"
  ].sort((left, right) => left.localeCompare(right)));
});
