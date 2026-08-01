import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const servicesSource = await readFile(
  new URL("../src/modules/services/services.service.js", import.meta.url),
  "utf8"
);
const settingsSource = await readFile(
  new URL("../src/modules/settings/settings.service.js", import.meta.url),
  "utf8"
);
const appointmentsSource = await readFile(
  new URL("../src/modules/appointments/appointment-settings.service.js", import.meta.url),
  "utf8"
);
const appointmentRoutesSource = await readFile(
  new URL("../src/modules/appointments/routes/schedules.routes.js", import.meta.url),
  "utf8"
);
const financeSource = await readFile(
  new URL("../src/modules/finance/finance.service.js", import.meta.url),
  "utf8"
);

test("service price updates change only the catalog record", () => {
  for (const source of [servicesSource, settingsSource]) {
    assert.match(
      source,
      /UPDATE service_catalog[\s\S]*price_uzs = \$3/,
      "Service edits should update the current catalog price."
    );
    assert.doesNotMatch(
      source,
      /UPDATE (?:appointment_schedules|finance_tickets|finance_ticket_items)[\s\S]*price_uzs/,
      "Catalog edits must not rewrite historical appointment or ticket prices."
    );
  }
});

test("appointments and tickets persist independent service price snapshots", () => {
  assert.match(
    appointmentsSource,
    /INSERT INTO \$\{tableName\} \([\s\S]*service_price_uzs[\s\S]*VALUES \(\$1,\$2,\$3,[\s\S]*\$10/,
    "A planner appointment should store the selected service price."
  );
  assert.match(
    appointmentsSource,
    /export async function getActiveServiceSnapshotById\(\{[\s\S]*FROM service_catalog[\s\S]*AND is_active = TRUE[\s\S]*servicePriceUzs: Number\.parseInt\(String\(row\.price_uzs/s,
    "Planner routes should be able to resolve a fresh active service snapshot from the catalog."
  );
  assert.match(
    appointmentRoutesSource,
    /async function resolveActiveServiceSnapshot\(\{[\s\S]*getActiveServiceSnapshotById\(\{[\s\S]*serviceName = serviceSnapshot\.serviceName;[\s\S]*servicePriceUzs = serviceSnapshot\.servicePriceUzs;[\s\S]*createAppointmentSchedule\(\{[\s\S]*servicePriceUzs/s,
    "Creating a planner appointment should use the current catalog price snapshot, not a stale browser price."
  );
  assert.match(
    appointmentRoutesSource,
    /function shouldPreserveTargetServiceSnapshot\(target,[\s\S]*if \(shouldPreserveTargetServiceSnapshot\(target, \{ serviceId, serviceName \}\)\) \{[\s\S]*servicePriceUzs = targetServiceSnapshot\.servicePriceUzs;[\s\S]*\} else \{[\s\S]*resolveActiveServiceSnapshot/s,
    "Editing an unchanged appointment service should preserve the stored snapshot price."
  );
  assert.ok(
    appointmentsSource.includes("function buildEffectiveAppointmentServicePriceSql(")
      && appointmentsSource.includes("${scheduleAlias}.created_at >= ${serviceAlias}.updated_at")
      && appointmentsSource.includes("THEN ${serviceAlias}.price_uzs")
      && appointmentsSource.includes("export async function getAppointmentSchedulesByRange")
      && appointmentsSource.includes('buildEffectiveAppointmentServicePriceSql("s", "sc")} AS service_price_uzs')
      && appointmentsSource.includes("LEFT JOIN service_catalog sc"),
    "Planner schedule reads should show old snapshots for older slots and the active catalog price for slots created after the latest catalog update."
  );
  assert.ok(
    appointmentsSource.includes("export async function getAppointmentScheduleTargetsByScope")
      && appointmentsSource.includes('buildEffectiveAppointmentServicePriceSql("s", "sc")} AS service_price_uzs')
      && appointmentsSource.includes("seriesRows = result.rows"),
    "Planner edit targets should use the same effective service price as the visible schedule grid."
  );
  assert.match(
    appointmentsSource,
    /export async function ensureAutoRollingRecurringSchedulesCoverRange[\s\S]*const activeServiceSnapshot = rootServiceId[\s\S]*getActiveServiceSnapshotById\(\{[\s\S]*const recurringServicePriceUzs[\s\S]*servicePriceUzs: recurringServicePriceUzs/s,
    "Auto-rolling recurring appointments should snapshot the current catalog service price when new slots are generated."
  );
  assert.match(
    financeSource,
    /INSERT INTO finance_ticket_items \([\s\S]*price_uzs[\s\S]*item\.priceUzs/,
    "Each ticket item should store its own service price."
  );
  assert.match(
    financeSource,
    /const appointmentServiceId = parsePositiveInteger\(appointment\?\.service_id\) \|\| null;[\s\S]*const usesAppointmentSnapshot = Boolean\(appointment\) && appointmentServiceId === serviceId;[\s\S]*getAppointmentTicketPriceUzs\(\{ appointment, service \}\)/s,
    "Creating a ticket for an old appointment should preserve its stored price instead of re-reading the latest catalog price."
  );
  assert.match(
    financeSource,
    /function getAppointmentTicketPriceUzs\(\{ appointment, service \}\) \{[\s\S]*return appointmentPriceUzs;[\s\S]*const snapshotPriceUzs = usesAppointmentSnapshot[\s\S]*getAppointmentTicketPriceUzs\(\{ appointment, service \}\)/s,
    "An appointment ticket should accept its stored service snapshot when that service is no longer active in the catalog."
  );
  assert.match(
    financeSource,
    /const priceUzs = usesAppointmentSnapshot[\s\S]*snapshotPriceUzs > 0[\s\S]*requestedPriceUzs > 0/s,
    "Appointment-backed tickets should not let a stale submitted price override the appointment/catalog snapshot rule."
  );
  assert.match(
    financeSource,
    /amountUzs = requestedAmount > 0 \? requestedAmount : normalizeAmount\(appointment\.service_price_uzs, 0\)/,
    "Appointment ticket totals should start from the appointment price snapshot."
  );
  assert.match(
    appointmentsSource,
    /function buildScheduleSnapshotSql[\s\S]*'serviceId', \$\{col\("service_id"\)\}[\s\S]*'serviceName', \$\{col\("service_name"\)\}[\s\S]*'servicePriceUzs', \$\{col\("service_price_uzs"\)\}/s,
    "Appointment history snapshots should preserve the service before and after each change."
  );
  assert.match(
    appointmentsSource,
    /function buildScheduleChangedFieldsSql[\s\S]*service_id[\s\S]*'service_id'[\s\S]*service_name[\s\S]*'service_name'[\s\S]*service_price_uzs[\s\S]*'service_price_uzs'/s,
    "Changing only the appointment service should still create a history row."
  );
  assert.match(
    financeSource,
    /const shouldSyncService = \([\s\S]*currentServiceId !== nextServiceId[\s\S]*currentServiceName !== nextServiceName[\s\S]*currentServicePriceUzs !== nextServicePriceUzs[\s\S]*updateAppointmentSchedulesByIds\(\{[\s\S]*serviceId: nextServiceId,[\s\S]*serviceName: nextServiceName,[\s\S]*servicePriceUzs: nextServicePriceUzs/s,
    "Saving a changed service in Create Ticket should update the linked planner slot snapshot."
  );
});
