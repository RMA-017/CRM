import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import {
  clearSettingsReadCaches,
  listOrganizations,
  listPermissionOptionsForSettings,
  listPositionOptionsForSettings,
  listRoleOptionsForSettings
} from "../src/modules/settings/settings.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("settings read caches reuse organization results and return clones", async () => {
  clearSettingsReadCaches();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql) => {
    callCount += 1;
    const text = String(sql || "");
    if (text.includes("FROM organizations")) {
      return {
        rows: [{
          id: 7,
          code: "main",
          name: "Main",
          is_active: true,
          allowed_features: ["clients"],
          created_at: "2026-03-10T00:00:00.000Z"
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${text}`);
  });

  try {
    const first = await listOrganizations();
    const second = await listOrganizations();

    assert.equal(callCount, 1);
    assert.deepEqual(second, first);

    first[0].name = "Mutated";
    const third = await listOrganizations();
    assert.equal(third[0].name, "Main");

    clearSettingsReadCaches();
    await listOrganizations();
    assert.equal(callCount, 2);
  } finally {
    restoreQuery();
    clearSettingsReadCaches();
  }
});

test("settings read caches key role, permission and position lists correctly", async () => {
  clearSettingsReadCaches();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    callCount += 1;
    const text = String(sql || "");
    if (text.includes("FROM role_options r")) {
      return {
        rows: [{
          id: 11,
          organization_id: params[0],
          label: "Manager",
          sort_order: 1,
          is_admin: false,
          is_active: true,
          created_at: "2026-03-10T00:00:00.000Z",
          permission_codes: ["profile.read", "clients.read"]
        }]
      };
    }
    if (text.includes("FROM permissions")) {
      return {
        rows: [{
          id: 3,
          code: "profile.read",
          label: "Profile read",
          sort_order: 1,
          is_active: true,
          created_at: "2026-03-10T00:00:00.000Z"
        }]
      };
    }
    if (text.includes("FROM position_options")) {
      return {
        rows: [{
          id: 21,
          organization_id: params[0],
          label: "Teacher",
          sort_order: 1,
          is_active: true,
          created_at: "2026-03-10T00:00:00.000Z"
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${text}`);
  });

  try {
    const firstRoles = await listRoleOptionsForSettings(7, null);
    const secondRoles = await listRoleOptionsForSettings(7, null);
    assert.equal(callCount, 1);
    assert.deepEqual(secondRoles, firstRoles);

    firstRoles[0].permissionCodes.push("mutated.code");
    const thirdRoles = await listRoleOptionsForSettings(7, null);
    assert.deepEqual(thirdRoles[0].permissionCodes, ["profile.read", "clients.read"]);

    await listRoleOptionsForSettings(8, null);
    assert.equal(callCount, 2);

    await listPermissionOptionsForSettings(null);
    await listPermissionOptionsForSettings(null);
    assert.equal(callCount, 3);

    await listPositionOptionsForSettings(7);
    await listPositionOptionsForSettings(7);
    assert.equal(callCount, 4);

    clearSettingsReadCaches();
    await listRoleOptionsForSettings(7, null);
    await listPermissionOptionsForSettings(null);
    await listPositionOptionsForSettings(7);
    assert.equal(callCount, 7);
  } finally {
    restoreQuery();
    clearSettingsReadCaches();
  }
});

test("settings permission payload strips unknown active codes from lists and roles", async () => {
  clearSettingsReadCaches();
  const restoreQuery = stubPoolQuery(async (sql, params = []) => {
    const text = String(sql || "");
    if (text.includes("FROM permissions")) {
      return {
        rows: [
          {
            id: 3,
            code: "profile.read",
            label: "Profile read",
            sort_order: 1,
            is_active: true,
            created_at: "2026-03-10T00:00:00.000Z"
          },
          {
            id: 4,
            code: "settings.organizations.read",
            label: "Read organization settings",
            sort_order: 2,
            is_active: true,
            created_at: "2026-03-10T00:00:00.000Z"
          }
        ]
      };
    }
    if (text.includes("FROM role_options r")) {
      return {
        rows: [{
          id: 11,
          organization_id: params[0],
          label: "Manager",
          sort_order: 1,
          is_admin: false,
          is_active: true,
          created_at: "2026-03-10T00:00:00.000Z",
          permission_codes: ["profile.read", "settings.organizations.read"]
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${text}`);
  });

  try {
    const permissions = await listPermissionOptionsForSettings(null);
    const roles = await listRoleOptionsForSettings(7, null);

    assert.deepEqual(
      permissions.map((item) => item.code),
      ["profile.read"]
    );
    assert.deepEqual(
      roles[0].permissionCodes,
      ["profile.read"]
    );
  } finally {
    restoreQuery();
    clearSettingsReadCaches();
  }
});
