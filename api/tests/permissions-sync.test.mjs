import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import { ensureSystemPermissions } from "../src/modules/users/permissions.service.js";

function stubPoolConnect(queryImplementation) {
  const originalConnect = pool.connect.bind(pool);
  pool.connect = async () => ({
    query: queryImplementation,
    release() {}
  });
  return () => {
    pool.connect = originalConnect;
  };
}

test("ensureSystemPermissions deactivates and unassigns unknown permission codes", async () => {
  const executedQueries = [];
  const restoreConnect = stubPoolConnect(async (sql, params = []) => {
    const text = String(sql || "");
    executedQueries.push({ text, params });

    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return { rows: [] };
    }
    if (text.includes("INSERT INTO permissions")) {
      return { rows: [] };
    }
    if (text.includes("UPDATE permissions") && text.includes("LOWER(code) = ANY($1::text[])")) {
      return { rows: [] };
    }
    if (text.includes("INSERT INTO role_permissions")) {
      return { rows: [] };
    }
    if (text.includes("UPDATE permissions") && text.includes("LOWER(code) <> ALL($1::text[])")) {
      return { rows: [] };
    }
    if (text.includes("DELETE FROM role_permissions rp") && text.includes("LOWER(p.code) <> ALL($1::text[])")) {
      return { rows: [] };
    }
    if (text.includes("FROM role_options r") && text.includes("JOIN organizations o")) {
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL: ${text}`);
  });

  try {
    await ensureSystemPermissions({
      useAdvisoryLock: false
    });

    const deactivateUnknownQuery = executedQueries.find(
      ({ text }) => text.includes("UPDATE permissions") && text.includes("LOWER(code) <> ALL($1::text[])")
    );
    const deleteUnknownAssignmentsQuery = executedQueries.find(
      ({ text }) => text.includes("DELETE FROM role_permissions rp") && text.includes("LOWER(p.code) <> ALL($1::text[])")
    );
    const baseProfileReadGrantQuery = executedQueries.find(
      ({ text, params }) => text.includes("INSERT INTO role_permissions")
        && text.includes("JOIN permissions p ON LOWER(p.code) = LOWER($1)")
        && params[0] === "profile.read"
    );

    assert.ok(deactivateUnknownQuery, "expected unknown permission cleanup query");
    assert.ok(deleteUnknownAssignmentsQuery, "expected unknown role-permission cleanup query");
    assert.ok(baseProfileReadGrantQuery, "expected base profile.read grant query for active roles");
    assert.ok(Array.isArray(deactivateUnknownQuery.params[0]));
    assert.ok(deactivateUnknownQuery.params[0].includes("profile.read"));
    assert.equal(
      deactivateUnknownQuery.params[0].includes("settings.organizations.read"),
      false
    );
  } finally {
    restoreConnect();
  }
});

test("ensureSystemPermissions keeps planner read submenu sync", async () => {
  const executedQueries = [];
  const restoreConnect = stubPoolConnect(async (sql, params = []) => {
    const text = String(sql || "");
    executedQueries.push({ text, params });

    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return { rows: [] };
    }
    if (text.includes("INSERT INTO permissions")) {
      return { rows: [] };
    }
    if (text.includes("UPDATE permissions")) {
      return { rows: [] };
    }
    if (text.includes("INSERT INTO role_permissions")) {
      return { rows: [] };
    }
    if (text.includes("DELETE FROM role_permissions rp")) {
      return { rows: [] };
    }
    if (text.includes("FROM role_options r") && text.includes("JOIN organizations o")) {
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL: ${text}`);
  });

  try {
    await ensureSystemPermissions({
      useAdvisoryLock: false
    });

    const plannerReadCopyQuery = executedQueries.find(
      ({ text, params }) => text.includes("INSERT INTO role_permissions")
        && params[0] === "appointments.schedule"
        && params[1] === "appointments.planner.read"
    );
    assert.ok(plannerReadCopyQuery, "expected planner submenu to keep syncing planner read");
  } finally {
    restoreConnect();
  }
});
