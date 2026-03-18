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
    /const confirmedCount = Number\.parseInt\(String\(row\?\.confirmed_count[\s\S]*const cancelledCount = Number\.parseInt\(String\(row\?\.cancelled_count/s,
    "VIP norm monitoring mapping should expose confirmed and cancelled lesson counters from the backend response."
  );

  assert.match(
    serviceSource,
    /COUNT\(DISTINCT ss\.schedule_id\)::int AS current_booked[\s\S]*COUNT\(DISTINCT ss\.schedule_id\) FILTER \([\s\S]*'confirmed'[\s\S]*AS confirmed_count[\s\S]*COUNT\(DISTINCT ss\.schedule_id\) FILTER \([\s\S]*'cancelled', 'no-show'[\s\S]*AS cancelled_count/s,
    "VIP norm monitoring SQL should compute total weekly bookings plus dedicated confirmed and cancelled\/no-show counters."
  );

  assert.match(
    serviceSource,
    /AND s\.status IN \('pending', 'confirmed', 'cancelled', 'no-show'\)/,
    "VIP norm monitoring should treat all recorded weekly lesson statuses as booked lessons for the monitoring table."
  );

  assert.match(
    routeSource,
    /function normalizeVipNormMonitoringSpecialists\(\.\.\.groups\) \{[\s\S]*groups\.forEach\(\(group\) => \{[\s\S]*Array\.isArray\(group\) \? group : \[\]/s,
    "VIP norm monitoring specialist normalization should iterate each specialist array directly so filter options and row matching stay populated."
  );
});
