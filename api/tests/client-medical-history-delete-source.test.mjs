import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Client medical history bulk delete route relies on delete permission without extra admin-only gate", async () => {
  const source = await readFile(new URL("../src/modules/clients/clients.routes.js", import.meta.url), "utf8");

  assert.match(
    source,
    /fastify\.delete\(\s*"\/:id\/medical-history"/,
    "Clients routes should expose the bulk medical history delete endpoint."
  );

  assert.match(
    source,
    /hasMedicalHistoryPermission\(requester, PERMISSIONS\.CLIENT_MEDICAL_HISTORY_DELETE\)/,
    "Bulk medical history delete route should require the delete permission."
  );

  assert.doesNotMatch(
    source,
    /Only admins can delete all client medical history\./,
    "Bulk medical history delete route should not add an extra admin-only blocker once delete permission is granted."
  );
});
