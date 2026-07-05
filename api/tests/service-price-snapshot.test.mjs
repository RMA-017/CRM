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
    financeSource,
    /INSERT INTO finance_ticket_items \([\s\S]*price_uzs[\s\S]*item\.priceUzs/,
    "Each ticket item should store its own service price."
  );
  assert.match(
    financeSource,
    /const appointmentServiceId = parsePositiveInteger\(appointment\?\.service_id\) \|\| null;[\s\S]*const usesAppointmentSnapshot = Boolean\(appointment\) && appointmentServiceId === serviceId;[\s\S]*if \(service && !usesAppointmentSnapshot\)/s,
    "Creating a ticket for an old appointment should preserve its stored price instead of re-reading the latest catalog price."
  );
  assert.match(
    financeSource,
    /amountUzs = requestedAmount > 0 \? requestedAmount : normalizeAmount\(appointment\.service_price_uzs, 0\)/,
    "Appointment ticket totals should start from the appointment price snapshot."
  );
});
