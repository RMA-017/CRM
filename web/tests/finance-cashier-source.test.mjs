import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cashierPanelSource = await readFile(
  new URL("../src/pages/profile/panels/FinanceCashierPanel.jsx", import.meta.url),
  "utf8"
);

test("cashier ticket cards stay compact while payment modal shows multi-service details", () => {
  assert.match(
    cashierPanelSource,
    /function getBoardCardDate\(item\) \{[\s\S]*if \(item\?\.ticketNumber \|\| item\?\.ticket_number\) \{[\s\S]*return item\?\.createdAt \|\| item\?\.created_at \|\| item\?\.ticketDate/s,
    "Cashier Tickets/Talon column cards should display ticket creation date before falling back to ticket date."
  );

  assert.match(
    cashierPanelSource,
    /function getTicketLineItems[\s\S]*Array\.isArray\(item\?\.items\)[\s\S]*finalAmountUzs: item\?\.totalUzs/s,
    "Cashier cards should normalize ticket items and keep a fallback for older single-service tickets."
  );

  assert.match(
    cashierPanelSource,
    /function getTicketServiceSummary[\s\S]*return `\$\{rows\.length\} services`/s,
    "Multi-service ticket cards should show a compact service count instead of growing the card."
  );

  assert.match(
    cashierPanelSource,
    /function getTicketSpecialistSummary[\s\S]*return `\$\{count\} \$\{count === 1 \? "specialist" : "specialists"\}`/s,
    "Multi-specialist ticket cards should show a compact unique specialist count."
  );

  assert.match(
    cashierPanelSource,
    /finance-batch-ticket-lines[\s\S]*getTicketLineItems\(ticket\)\.map[\s\S]*lineItem\?\.serviceName[\s\S]*lineItem\?\.specialistName[\s\S]*lineItem\?\.finalAmountUzs/s,
    "The double-click payment modal should render each ticket line item with service, specialist and final amount."
  );
});

test("appointment ticket modal allows changing service and price before save", () => {
  assert.match(
    cashierPanelSource,
    /function createAppointmentTicketForm[\s\S]*serviceId: String\(item\?\.serviceId \|\| ""\)[\s\S]*priceUzs: String\(normalizeMoneyInput\(item\?\.servicePriceUzs\)\)/s,
    "Appointment ticket modal should initialize editable service and price fields from the planner card."
  );

  assert.match(
    cashierPanelSource,
    /value=\{appointmentTicketForm\.serviceId\}[\s\S]*options=\{manualServiceOptions\}[\s\S]*Select service type[\s\S]*priceUzs: String\(normalizeMoneyInput\(service\.priceUzs \?\? current\.priceUzs\)\)/s,
    "The service field in Create Ticket should be a selectable service dropdown that refreshes the price."
  );

  assert.match(
    cashierPanelSource,
    /value=\{appointmentTicketForm\.priceUzs\}[\s\S]*setAppointmentTicketForm\(\(current\) => \(\{ \.\.\.current, priceUzs: value \}\)\)/s,
    "Create Ticket should expose an editable price input."
  );

  assert.match(
    cashierPanelSource,
    /payload\.items = \[\{[\s\S]*serviceId,[\s\S]*priceUzs,[\s\S]*discountType: appointmentTicketForm\.discountType/s,
    "Create Ticket should submit the selected service and edited price as a ticket line item."
  );
});

test("cashier board filters live in header actions without visible labels", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    cashierPanelSource,
    /<div className="all-users-head-actions">[\s\S]*finance-board-head-client-filter[\s\S]*placeholder=\{translate\("Client"\)\}[\s\S]*selectedLabel: translate\("Service Name"\)[\s\S]*selectedLabel: translate\("Specialist"\)[\s\S]*aria-label=\{translate\("Close cashier panel"\)\}/s,
    "Cashier board filters should render inside the header actions before the close button with placeholder text."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /<div className="finance-board-search">/,
    "Cashier board filters should no longer take a separate search row."
  );
  assert.match(
    styles,
    /\.finance-cashier-panel \.all-users-head-actions \{[\s\S]*justify-content: flex-end;[\s\S]*\.finance-cashier-panel \.all-users-head-actions \.finance-board-head-client-filter[\s\S]*max-width: 288px;[\s\S]*\.finance-cashier-panel \.all-users-head-actions \.finance-board-head-select-filter[\s\S]*max-width: 288px;/s,
    "Cashier header filters should be right-aligned and wider in the header."
  );
});
