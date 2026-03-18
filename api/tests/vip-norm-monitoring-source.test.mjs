import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("VIP norm monitoring route uses dedicated feature and permission access", async () => {
  const [routeSource, registrySource, serviceSource] = await Promise.all([
    readFile(new URL("../src/modules/clients/clients.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../../shared/access-registry.js", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/clients/clients.service.js", import.meta.url), "utf8")
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
    /fastify\.get\(\s*"\/vip-norm-monitoring"[\s\S]*getVipNormMonitoringRows\(\{[\s\S]*assignedUserId:\s*null/s,
    "VIP norm monitoring should load organization-wide data for any role that has the dedicated permission."
  );

  assert.match(
    serviceSource,
    /WITH vip_clients AS[\s\S]*LEFT JOIN vip_client_tutor_assignments[\s\S]*LEFT JOIN vip_class_teacher_assignments/s,
    "VIP norm monitoring should start from all VIP clients and preserve rows even when assignments are missing."
  );

  assert.match(
    serviceSource,
    /'no-assignment'::text[\s\S]*'no-position'[\s\S]*'no-norm'/s,
    "VIP norm monitoring should emit explicit setup statuses for missing assignment, position, and norm cases."
  );

  assert.match(
    serviceSource,
    /scheduled_sources AS[\s\S]*JOIN appointment_schedules s[\s\S]*LEFT JOIN users scheduled_specialist[\s\S]*po_scheduled/s,
    "VIP norm monitoring should derive visible positions from the actual scheduled specialist records for the current week."
  );

  assert.match(
    serviceSource,
    /clients_with_scheduled_positions[\s\S]*WHERE csp\.client_id IS NULL/s,
    "VIP norm monitoring should only fall back to assignment positions when no scheduled specialist positions exist."
  );

  assert.match(
    routeSource,
    /const rawStatusKey = String\(row\?\.status_key[\s\S]*No norm configured/s,
    "VIP norm monitoring mapping should preserve backend status keys instead of collapsing everything to booked-vs-norm only."
  );
});
