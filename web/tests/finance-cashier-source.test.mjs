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

test("appointment ticket modal derives price from the selected service before save", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    cashierPanelSource,
    /function createAppointmentTicketForm[\s\S]*serviceId: String\(item\?\.serviceId \|\| ""\)[\s\S]*priceUzs: String\(normalizeMoneyInput\(item\?\.servicePriceUzs\)\)/s,
    "Appointment ticket modal should initialize service and derived price state from the planner card."
  );

  assert.match(
    cashierPanelSource,
    /value=\{appointmentTicketForm\.serviceId\}[\s\S]*options=\{manualServiceOptions\}[\s\S]*Select service type[\s\S]*priceUzs: String\(normalizeMoneyInput\(service\.priceUzs \?\? current\.priceUzs\)\)/s,
    "The service field in Create Ticket should be a selectable service dropdown that refreshes the price."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /id="financeAppointmentTicketModal"[\s\S]*menuWidthScale=\{1\.2\}/s,
    "Create Ticket service dropdown should not render wider than its trigger."
  );
  assert.match(
    styles,
    /#financeAppointmentTicketModal \.finance-manual-item-grid > \.field,[\s\S]*#financeAppointmentTicketModal \.finance-manual-item-grid \.custom-select-trigger \{[\s\S]*max-width: 100%;[\s\S]*min-width: 0;[\s\S]*#financeAppointmentTicketModal \.finance-manual-item-grid \.custom-select-trigger > span \{[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/s,
    "Create Ticket service select should stay inside its parent and truncate long labels."
  );

  assert.doesNotMatch(
    cashierPanelSource,
    /<span>\{translate\("Price"\)\}<\/span>[\s\S]*value=\{appointmentTicketForm\.priceUzs\}[\s\S]*setAppointmentTicketForm\(\(current\) => \(\{ \.\.\.current, priceUzs: value \}\)\)/s,
    "Create Ticket should not expose an editable price input."
  );

  assert.match(
    cashierPanelSource,
    /payload\.items = \[\{[\s\S]*serviceId,[\s\S]*priceUzs,[\s\S]*discountType: appointmentTicketForm\.discountType/s,
    "Create Ticket should submit the selected service and derived price as a ticket line item."
  );
});

test("manual ticket modal blocks future ticket dates", async () => {
  const translations = await readFile(
    new URL("../src/i18n/translations.js", import.meta.url),
    "utf8"
  );

  assert.match(
    cashierPanelSource,
    /function isFutureDateValue\(value\) \{[\s\S]*normalized > todayDateValue\(\);[\s\S]*const maxManualTicketDate = todayDateValue\(\);/s,
    "Manual ticket modal should derive today's date and detect future ticket dates."
  );
  assert.match(
    cashierPanelSource,
    /if \(isFutureDateValue\(ticketDate\)\) \{[\s\S]*translate\("Future ticket dates are not allowed\."\)[\s\S]*return;[\s\S]*<input[\s\S]*type="date"[\s\S]*max=\{maxManualTicketDate\}[\s\S]*value=\{manualForm\.ticketDate\}/s,
    "Manual ticket submit and date input should both prevent future ticket dates."
  );
  assert.match(
    translations,
    /Future ticket dates are not allowed\.", uz: "Kelajak sanasiga talon yaratib bo'lmaydi\.", ru: "Нельзя создавать талоны на будущую дату\."/,
    "Future ticket date validation should have Uzbek and Russian text."
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
