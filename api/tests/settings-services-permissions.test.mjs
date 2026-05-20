import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsRoutesSource = await readFile(
  new URL("../src/modules/settings/settings.routes.js", import.meta.url),
  "utf8"
);

test("services settings read access can load positions for the service form", () => {
  assert.match(
    settingsRoutesSource,
    /const hasExtraPermission = extraAccessRules\.some\(\(rule\) => \([\s\S]*permissionSnapshot\?\.\[rule\?\.resourceKey\]\?\.\[rule\?\.actionKey \|\| "read"\] === true[\s\S]*\)\);/s,
    "Settings route access should support extra read permissions for dependent lookup data."
  );

  assert.match(
    settingsRoutesSource,
    /requireSettingsRouteAccess\(request, reply, "positions", "read", \{[\s\S]*alsoAllow: \[[\s\S]*\{ resourceKey: "services", actionKey: "read" \}[\s\S]*\][\s\S]*\}\)/s,
    "The positions lookup used by Service Settings should be readable with settings.services.read."
  );
});
