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

  assert.match(
    cashierPanelSource,
    /function formatTicketCountLabel\(translate, tickets\) \{[\s\S]*const count = Array\.isArray\(tickets\) \? tickets\.length : 0;[\s\S]*translate\("Ticket count"\)\.replace\("\{count\}", String\(count\)\)[\s\S]*finance-modal-ticket-number">\{formatTicketCountLabel\(translate, batchPaymentTickets\)\}/s,
    "The payment modal header should show the selected ticket count while ticket numbers remain in the table."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /finance-modal-ticket-number">\{batchPaymentTickets\.length\}/,
    "The payment modal ticket badge should not show 1 for every single-ticket payment."
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
    /function getAppointmentTicketServiceName\(\{ source, services, serviceId \}\)[\s\S]*sourceServiceName[\s\S]*String\(serviceId \|\| ""\) === String\(source\?\.serviceId \|\| ""\)[\s\S]*payload\.items = \[\{[\s\S]*serviceId,[\s\S]*serviceName: getAppointmentTicketServiceName\(\{[\s\S]*source: item,[\s\S]*services: board\.services,[\s\S]*serviceId[\s\S]*priceUzs,[\s\S]*discountType: appointmentTicketForm\.discountType,[\s\S]*discountValue: appointmentTicketForm\.discountValue,[\s\S]*discountUzs: appointmentDiscountUzs/s,
    "Create Ticket should submit the selected service, real appointment service name and exact discount as a ticket line item."
  );

  assert.match(
    cashierPanelSource,
    /const openAppointmentTicketFromCard = async \(item\) => \{[\s\S]*if \(!item \|\| busyId \|\| !canCreateFinanceCashier\) return;[\s\S]*openAppointmentTicketModal\(item\);[\s\S]*\};/s,
    "Double-clicking a pending appointment card should only open the ticket modal; status confirmation happens on save."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /openAppointmentTicketFromCard[\s\S]*updateAppointmentStatus\(item, "confirmed"/s,
    "Opening the ticket modal should not move pending appointments into the confirmed column before save."
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
    cashierPanelSource,
    /items: manualForm\.items\.map\(\(item, index\) => \(\{[\s\S]*discountType: manualForm\.discountType === "percent" \? "percent" : "amount",[\s\S]*discountValue: manualForm\.discountType === "percent"[\s\S]*manualForm\.discountValue[\s\S]*manualItemDiscounts\[index\] \|\| 0,[\s\S]*discountUzs: manualItemDiscounts\[index\] \|\| 0/s,
    "Manual ticket creation should preserve shared percent metadata while sending exact distributed UZS discounts."
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

test("batch ticket payments omit empty unrelated source fields", () => {
  assert.match(
    cashierPanelSource,
    /const payment = \{[\s\S]*source,[\s\S]*amountUzs: normalizeMoneyInput\(row\.amountUzs\)[\s\S]*if \(source === "deposit"\) \{[\s\S]*payment\.clientId = String\(row\.clientId \|\| ""\)\.trim\(\);[\s\S]*\} else \{[\s\S]*payment\.paymentMethodId = String\(row\.paymentMethodId \|\| ""\)\.trim\(\);/s,
    "Batch payments should only send clientId for deposit payments and paymentMethodId for external payments."
  );
});

test("batch payment modal uses compact row padding", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-client-balance-row:not\(\.finance-batch-client-balance-head\) \{[\s\S]*padding: 3px 5px;/s,
    "Client balance rows in the payment modal should use compact padding."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-ticket-row \{[\s\S]*padding: 3px 5px;/s,
    "Ticket rows in the payment modal should use compact padding."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-payment-row \{[\s\S]*padding: 3px 5px 3px 10px;/s,
    "Payment source rows in the payment modal should keep a little extra left padding for the marker."
  );
});

test("batch payment modal keeps a polished dense payment layout", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    cashierPanelSource,
    /className="all-users-edit-fields finance-payment-checkout"[\s\S]*finance-payment-checkout-top[\s\S]*finance-batch-client-balances[\s\S]*finance-payment-checkout-summary finance-ticket-summary finance-ticket-total[\s\S]*finance-payment-tickets-panel[\s\S]*finance-batch-payment-methods[\s\S]*finance-payment-note-field/s,
    "Payment modal should render client balances plus checkout summary first, then tickets, payment sources and note."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /finance-payment-checkout-summary[\s\S]*translate\("Entered"\)/,
    "Checkout summary should not include the Entered total inside the first block."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /finance-batch-client-balances[\s\S]*translate\("Selected Total"\)/,
    "Client balances should not repeat the selected total because the checkout summary already shows the amount to pay."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /finance-batch-section-title[\s\S]*formatMoney\(batchPaidTotalUzs\)/,
    "Payment source title should not repeat the entered total because the checkout summary owns totals."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal h3\.finance-modal-title-with-number \{[\s\S]*justify-content: space-between;[\s\S]*border-bottom: 1px solid rgba\(148, 163, 184, 0\.18\);/s,
    "Payment modal header should separate the title and ticket count cleanly."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-payment-checkout-top \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(270px, 0\.36fr\);/s,
    "Payment modal first block should place client balances on the left and a compact summary on the right."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-ticket-total \{[\s\S]*gap: 6px;[\s\S]*padding: 7px;[\s\S]*background: linear-gradient\(180deg, rgba\(255, 255, 255, 0\.96\), rgba\(248, 250, 252, 0\.92\)\);/s,
    "Payment modal totals should be grouped in a compact summary band."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-payment-checkout-summary \{[\s\S]*grid-template-columns: 1fr;[\s\S]*align-content: stretch;/s,
    "Checkout summary should stack its totals vertically in the first block."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-payment-checkout-panel \{[\s\S]*padding: 8px;[\s\S]*box-shadow: 0 1px 2px rgba\(15, 23, 42, 0\.04\);/s,
    "Payment modal sections should use lighter panel styling for frequent cashier use."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-payment-row \{[\s\S]*grid-template-areas:[\s\S]*"source target amount actions";/s,
    "Payment rows should use a single full-width checkout input row."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.edit-actions \{[\s\S]*padding-top: 8px;[\s\S]*border-top: 1px solid rgba\(148, 163, 184, 0\.18\);/s,
    "Payment modal actions should be visually separated from payment details."
  );
});
