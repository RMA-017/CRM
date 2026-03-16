import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("VIP norm monitoring route uses VIP attendance feature access and norm monitoring query", async () => {
  const source = await readFile(new URL("../src/modules/clients/clients.routes.js", import.meta.url), "utf8");

  assert.match(
    source,
    /fastify\.get\(\s*"\/vip-norm-monitoring"/,
    "Clients routes should expose the VIP norm monitoring endpoint."
  );

  assert.match(
    source,
    /requesterHasOrgFeature\(requester, "vip_clients\.attendance"\)/,
    "VIP norm monitoring should stay inside the VIP Clients feature gate."
  );

  assert.match(
    source,
    /vipPermissions\.canReadVipClients/,
    "VIP norm monitoring should require VIP clients read access."
  );

  assert.match(
    source,
    /resolveVipClientReadScope\(vipPermissions, requester\)/,
    "VIP norm monitoring should respect the VIP client read scope."
  );

  assert.match(
    source,
    /getVipNormMonitoringRows\(/,
    "VIP norm monitoring route should use the dedicated monitoring query."
  );
});
