import assert from "node:assert/strict";
import test from "node:test";
import { formatDateForInput, formatDateTimeTashkent, formatDateYMD, getInitial, normalizeProfile } from "../src/lib/formatters.js";

test("getInitial returns first letter or U", () => {
  assert.equal(getInitial("Ali"), "A");
  assert.equal(getInitial(""), "U");
});

test("formatDateYMD formats YYYY-MM-DD into DD.MM.YYYY", () => {
  assert.equal(formatDateYMD("2026-02-22"), "22.02.2026");
  assert.equal(formatDateYMD("2026-02-22T00:00:00.000Z"), "22.02.2026");
  assert.equal(formatDateYMD("invalid"), "-");
});

test("formatDateTimeTashkent converts UTC timestamps to Tashkent time", () => {
  assert.equal(formatDateTimeTashkent("2026-06-07T15:45:00.000Z"), "07.06.2026 20:45");
  assert.equal(formatDateTimeTashkent("2026-06-07T15:45:00.000"), "07.06.2026 20:45");
  assert.equal(formatDateTimeTashkent("invalid"), "-");
});

test("formatDateForInput keeps valid date and rejects invalid", () => {
  assert.equal(formatDateForInput("2026-02-22"), "2026-02-22");
  assert.equal(formatDateForInput("2026-02-22T00:00:00.000Z"), "2026-02-22");
  assert.equal(formatDateForInput("not-a-date"), "");
});

test("normalizeProfile maps and normalizes known fields", () => {
  const normalized = normalizeProfile({
    username: "admin",
    organization_id: 5,
    organization_code: "org-1",
    role_id: 3,
    full_name: "Ali Aliyev",
    permissions: ["CLIENTS_READ", "appointments_create", "", null]
  });

  assert.equal(normalized.username, "admin");
  assert.equal(normalized.organizationId, 5);
  assert.equal(normalized.organizationCode, "org-1");
  assert.equal(normalized.roleId, "3");
  assert.equal(normalized.fullName, "Ali Aliyev");
  assert.deepEqual(normalized.permissions, ["clients_read", "appointments_create"]);
});
