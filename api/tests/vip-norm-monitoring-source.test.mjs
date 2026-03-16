import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("VIP norm monitoring route uses dedicated feature and permission access", async () => {
  const [routeSource, registrySource] = await Promise.all([
    readFile(new URL("../src/modules/clients/clients.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../../shared/access-registry.js", import.meta.url), "utf8")
  ]);

  assert.match(
    registrySource,
    /key: "vip_clients\.norm_monitoring"[\s\S]*constantKey: "APPOINTMENTS_VIP_CLIENTS_NORM_MONITORING"/s,
    "Access registry should expose Norm Monitoring as a dedicated VIP Clients feature and permission."
  );

  assert.match(
    routeSource,
    /fastify\.get\(\s*"\/vip-norm-monitoring"/,
    "Clients routes should expose the VIP norm monitoring endpoint."
  );

  assert.match(
    routeSource,
    /requesterHasOrgFeature\(requester, "vip_clients\.norm_monitoring"\)/,
    "VIP norm monitoring should use its dedicated VIP Clients feature gate."
  );

  assert.match(
    routeSource,
    /vipPermissions\.canAccessNormMonitoring/,
    "VIP norm monitoring should require its dedicated permission."
  );

  assert.match(
    routeSource,
    /resolveVipClientReadScope\(vipPermissions, requester\)/,
    "VIP norm monitoring should respect the VIP client read scope."
  );

  assert.match(
    routeSource,
    /getVipNormMonitoringRows\(/,
    "VIP norm monitoring route should use the dedicated monitoring query."
  );
});
