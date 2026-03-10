import assert from "node:assert/strict";
import test from "node:test";
import pool from "../src/config/db.js";
import { clearUserOptionsCache, getUserOptions } from "../src/modules/meta/meta.service.js";

function stubPoolQuery(implementation) {
  const originalQuery = pool.query.bind(pool);
  pool.query = implementation;
  return () => {
    pool.query = originalQuery;
  };
}

test("getUserOptions caches payloads per organization and returns clones", async () => {
  clearUserOptionsCache();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql) => {
    callCount += 1;
    const text = String(sql || "");
    if (text.includes("FROM role_options")) {
      return { rows: [{ value: "1", label: "Admin" }] };
    }
    if (text.includes("FROM position_options")) {
      return { rows: [{ value: "2", label: "Teacher" }] };
    }
    if (text.includes("FROM permissions")) {
      return { rows: [{ value: "profile.read", label: "Profile read" }] };
    }
    if (text.includes("FROM users u")) {
      return { rows: [{ value: "7", label: "Alice Specialist" }] };
    }
    throw new Error(`Unexpected SQL: ${text}`);
  });

  try {
    const first = await getUserOptions({ organizationId: 7 });
    const second = await getUserOptions({ organizationId: 7 });

    assert.equal(callCount, 4);
    assert.deepEqual(second, first);

    first.roles[0].label = "Changed in caller";
    const third = await getUserOptions({ organizationId: 7 });
    assert.equal(third.roles[0].label, "Admin");

    await getUserOptions({ organizationId: 8 });
    assert.equal(callCount, 8);
  } finally {
    restoreQuery();
    clearUserOptionsCache();
  }
});

test("clearUserOptionsCache forces user-options queries to reload", async () => {
  clearUserOptionsCache();
  let callCount = 0;
  const restoreQuery = stubPoolQuery(async (sql) => {
    callCount += 1;
    const text = String(sql || "");
    if (text.includes("FROM role_options")) {
      return { rows: [{ value: "1", label: "Admin" }] };
    }
    if (text.includes("FROM position_options")) {
      return { rows: [{ value: "2", label: "Teacher" }] };
    }
    if (text.includes("FROM permissions")) {
      return { rows: [{ value: "profile.read", label: "Profile read" }] };
    }
    if (text.includes("FROM users u")) {
      return { rows: [{ value: "7", label: "Alice Specialist" }] };
    }
    throw new Error(`Unexpected SQL: ${text}`);
  });

  try {
    await getUserOptions({ organizationId: 9 });
    clearUserOptionsCache();
    await getUserOptions({ organizationId: 9 });
    assert.equal(callCount, 8);
  } finally {
    restoreQuery();
    clearUserOptionsCache();
  }
});
