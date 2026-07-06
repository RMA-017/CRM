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
    /function getTicketLinePaidAmount\(ticket, lineIndex\)[\s\S]*const paidAmount = getTicketPaidAmount\(ticket\);[\s\S]*previousFinalAmount[\s\S]*finance-batch-ticket-lines[\s\S]*finance-batch-ticket-line-cell is-specialist[\s\S]*finance-batch-ticket-line-cell is-service[\s\S]*finance-batch-ticket-line-cell is-money is-price[\s\S]*getTicketLineServicePriceAmount\(lineItem\)[\s\S]*finance-batch-ticket-line-cell is-money is-discount[\s\S]*lineItem\?\.discountUzs[\s\S]*finance-batch-ticket-line-cell is-money is-payable[\s\S]*getTicketLineFinalAmount\(lineItem\)[\s\S]*finance-batch-ticket-line-cell is-money is-paid[\s\S]*getTicketLinePaidAmount\(ticket, lineIndex\)/s,
    "The double-click payment modal should render each ticket line item with service-level price, discount, payable and FIFO paid amount."
  );

  assert.doesNotMatch(
    cashierPanelSource,
    /finance-batch-ticket-line-head/,
    "The double-click payment modal should not repeat a nested header inside multi-service ticket lines."
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
    /value=\{appointmentTicketForm\.serviceId\}[\s\S]*options=\{appointmentServiceOptions\}[\s\S]*Select service type[\s\S]*priceUzs: String\(normalizeMoneyInput\(service\.priceUzs \?\? current\.priceUzs\)\)/s,
    "The service field in Create Ticket should be a selectable service dropdown that refreshes the price."
  );
  assert.match(
    cashierPanelSource,
    /function buildAppointmentServiceOptions\(\{ services, source \}\)[\s\S]*source\?\.serviceId[\s\S]*source\?\.serviceName[\s\S]*source\?\.servicePriceUzs[\s\S]*options\[matchingIndex\] = snapshotOption;[\s\S]*return \[snapshotOption, \.\.\.options\];/s,
    "Create Ticket should show the planner service snapshot even when the catalog entry was renamed or deactivated."
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
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
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
  assert.match(
    cashierPanelSource,
    /function createManualItem\(\) \{[\s\S]*priceUzs: ""[\s\S]*const getManualItemPrice = useCallback\(\(item\) => \{[\s\S]*catalogPriceUzs > 0 \? catalogPriceUzs : normalizeMoneyInput\(item\?\.priceUzs\)/s,
    "Manual ticket lines should fall back to an entered price only when the catalog has no price."
  );
  assert.match(
    cashierPanelSource,
    /const requiresManualPrice = Boolean\(item\.serviceId\)[\s\S]*normalizeMoneyInput\(selectedService\?\.priceUzs\) <= 0;[\s\S]*finance-manual-item-grid\$\{requiresManualPrice \? " has-manual-price" : ""\}[\s\S]*translate\("Price"\)[\s\S]*value=\{item\.priceUzs\}/s,
    "A price input should appear for a selected zero-price service."
  );
  assert.match(
    cashierPanelSource,
    /items: manualForm\.items\.map\(\(item, index\) => \(\{[\s\S]*priceUzs: manualItemsWithServices\[index\]\?\.priceUzs \|\| 0/,
    "The manually entered price should be persisted in the ticket item snapshot."
  );
  assert.match(
    styles,
    /\.ops-panel-shell \.finance-manual-item-grid\.has-manual-price,[\s\S]*#financeManualTicketModal \.finance-manual-item-grid\.has-manual-price \{[\s\S]*grid-template-columns:[\s\S]*minmax\(120px, 0\.52fr\);[\s\S]*@media \(max-width: 640px\)[\s\S]*#financeManualTicketModal \.finance-manual-item-grid\.has-manual-price \{[\s\S]*grid-template-columns: 1fr;/s,
    "The optional price field should fit desktop and mobile manual ticket layouts."
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
    /const batchClientId = Array\.from\(batchClientIds\)\[0\] \|\| "";[\s\S]*const payment = \{[\s\S]*source,[\s\S]*amountUzs: normalizeMoneyInput\(row\.amountUzs\)[\s\S]*if \(source === "deposit"\) \{[\s\S]*payment\.clientId = batchClientId;[\s\S]*\} else \{[\s\S]*payment\.paymentMethodId = String\(row\.paymentMethodId \|\| ""\)\.trim\(\);/s,
    "Batch payments should send the selected single client id for deposit payments and paymentMethodId for external payments."
  );
});

test("batch ticket selection is limited to one client", () => {
  assert.match(
    cashierPanelSource,
    /function getTicketClientId\(ticket\) \{[\s\S]*function getSelectedTicketClientId\(ticketIds, tickets\)/s,
    "Cashier board should derive a stable selected client scope from selected tickets."
  );
  assert.match(
    cashierPanelSource,
    /const selectedTicketClientId = useMemo\([\s\S]*getSelectedTicketClientId\(selectedTicketIds, board\.issuedTickets\)[\s\S]*selectedTicketClientId[\s\S]*getTicketClientId\(item\) !== selectedTicketClientId[\s\S]*selectableDisabled=\{selectionDisabled\}/s,
    "Ticket checkboxes should be disabled for other clients after one client is selected."
  );
  assert.match(
    cashierPanelSource,
    /const scopeClientId = selectedItems\.length > 0[\s\S]*const candidates = selectedItems\.length > 0 \? selectedItems : \(item \? \[item\] : selectedItems\);[\s\S]*const nextTickets = candidates\.filter\(\(ticket\) => getTicketClientId\(ticket\) === scopeClientId\);/s,
    "Opening the payment modal should keep selected tickets within the selected client scope."
  );
  assert.match(
    cashierPanelSource,
    /const batchClientIds = new Set\(batchPaymentTickets\.map\(getTicketClientId\)\.filter\(Boolean\)\);[\s\S]*if \(batchClientIds\.size !== 1\) \{[\s\S]*Select tickets from one client only\./s,
    "Payment submit should reject a stale mixed-client selection before calling the API."
  );
  assert.match(
    cashierPanelSource,
    /row\.source === "deposit" \? \([\s\S]*finance-batch-payment-client-locked[\s\S]*\{batchPaymentClientName\}[\s\S]*\) : \(/s,
    "Deposit payment rows should show the locked single client instead of asking for a client select."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /options=\{batchClientOptions\}|onChange=\{\(value\) => updateBatchPaymentRow\(row\.key, \{ clientId: value \}\)\}/,
    "Deposit payment rows should not render a selectable client dropdown."
  );
});

test("batch ticket payment modal uses remaining totals and caps payment source amounts", () => {
  assert.match(
    cashierPanelSource,
    /function getTicketPayableAmount\(ticket\) \{[\s\S]*remainingAmountUzs[\s\S]*remaining_amount_uzs[\s\S]*totalUzs[\s\S]*amountUzs/s,
    "Payment modal should prefer the remaining amount for partially paid tickets."
  );
  assert.match(
    cashierPanelSource,
    /function getTicketTotalPayableAmount\(ticket\) \{[\s\S]*totalUzs[\s\S]*total_uzs[\s\S]*amountUzs[\s\S]*amount_uzs[\s\S]*getTicketLineFinalAmount/s,
    "Ticket rows in the payment modal should show the original payable total, not the remaining payment amount."
  );
  assert.match(
    cashierPanelSource,
    /const totalUzs = nextTickets\.reduce\(\(sum, ticket\) => sum \+ getTicketPayableAmount\(ticket\), 0\);[\s\S]*setBatchPaymentRows\(\[createBatchPaymentRow\(totalUzs\)\]\);/s,
    "Opening the payment modal should prefill only the remaining payable amount, not the original ticket total."
  );
  assert.match(
    cashierPanelSource,
    /function getBatchPaymentRowAmountLimit\(rows, key, totalUzs\)[\s\S]*otherRowsTotal[\s\S]*return Math\.max\(normalizeMoneyInput\(totalUzs\) - otherRowsTotal, 0\);[\s\S]*function clampBatchPaymentAmountInput\(value, maxAmountUzs\)[\s\S]*return String\(Math\.min\(amount, maxAmount\)\);/s,
    "Payment source input values should be clamped against the selected tickets payable total."
  );
  assert.match(
    cashierPanelSource,
    /nextUpdates\.amountUzs = clampBatchPaymentAmountInput\([\s\S]*getBatchPaymentRowAmountLimit\(current, key, batchPaymentTotalUzs\)[\s\S]*\);/s,
    "Changing a payment source amount should cap that row by the remaining amount after other rows."
  );
  assert.match(
    cashierPanelSource,
    /const rowAmountLimit = getBatchPaymentRowAmountLimit\(batchPaymentRows, row\.key, batchPaymentTotalUzs\);[\s\S]*max=\{rowAmountLimit\}[\s\S]*onChange=\{\(event\) => updateBatchPaymentRow\(row\.key, \{ amountUzs: event\.currentTarget\.value \}\)\}/s,
    "Payment amount inputs should expose the same max limit used by the clamp logic."
  );
  assert.match(
    cashierPanelSource,
    /finance-total-cell-total"><strong>\{translate\("Total To Pay"\)\}<\/strong><span>\{formatMoney\(batchPaymentTotalUzs\)\}<\/span>/,
    "Checkout summary should label the total as Total To Pay instead of the ticket-row To Pay label."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /finance-payment-checkout-summary[\s\S]*translate\("Remaining"\)[\s\S]*finance-payment-tickets-panel/,
    "Checkout summary should not render a separate Remaining indicator."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /translate\(batchOverpaidUzs > 0 \? "Overpaid" : "Remaining"\)/,
    "Checkout summary should never switch the Remaining label to Overpaid."
  );
  assert.match(
    cashierPanelSource,
    /const paymentTotalUzs = payments\.reduce\(\(sum, row\) => sum \+ normalizeMoneyInput\(row\.amountUzs\), 0\);[\s\S]*if \(paymentTotalUzs > batchPaymentTotalUzs\) \{[\s\S]*Payment amount exceeds selected tickets total\./s,
    "Submit should re-check total payments against the payable amount."
  );
  assert.match(
    cashierPanelSource,
    /closeBatchPaymentModal\(true\);[\s\S]*setSelectedTicketIds\(new Set\(\)\);[\s\S]*await Promise\.all\(\[loadBoard\(\), loadCashSession\(\)\]\);/s,
    "Successful batch payments should refresh cashier state with existing loaders after the payment commit."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /refreshCashier/,
    "Successful batch payments should not call a missing refresh helper and show a false payment failure."
  );
});

test("batch payment modal keeps client balance, ticket and payment inputs wrapperless", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(
    cashierPanelSource,
    /finance-batch-client-balance-row|finance-batch-ticket-row|finance-batch-payment-row/,
    "Client balance, ticket and payment row wrappers should not be rendered in the payment modal."
  );
  assert.doesNotMatch(
    styles,
    /\.finance-batch-client-balance-row|\.finance-batch-ticket-row|\.finance-batch-payment-row/,
    "Client balance, ticket and payment row wrapper styles should not remain after flattening the modal."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-client-balances \{[\s\S]*grid-template-columns:[\s\S]*minmax\(132px, 1fr\)[\s\S]*minmax\(78px, 0\.48fr\)[\s\S]*minmax\(78px, 0\.48fr\);/s,
    "Client balance cells should be laid out directly by the balances panel grid."
  );
  assert.match(
    cashierPanelSource,
    /finance-batch-client-balance-head-cell[\s\S]*finance-batch-client-balance-client[\s\S]*finance-batch-client-balance-value/s,
    "Client balance labels and values should render directly without a row wrapper."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /finance-batch-client-balance-value[^`]*finance-balance-positive/,
    "Deposit value in the payment modal should not use the green positive pill background."
  );
  assert.doesNotMatch(
    styles,
    /#financeBatchPaymentModal \.finance-balance-positive/,
    "Payment modal should not keep a scoped positive balance background style."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-ticket-head,[\s\S]*#financeBatchPaymentModal \.finance-batch-ticket-group \{[\s\S]*grid-template-columns: var\([\s\S]*--finance-batch-ticket-columns,/s,
    "Ticket header and value cells should share one grid template for stable vertical alignment."
  );
  assert.match(
    styles,
    /minmax\(0, 1\.08fr\)\s*minmax\(0, 0\.7fr\)\s*minmax\(0, 0\.7fr\)\s*minmax\(0, 0\.7fr\)\s*minmax\(0, 0\.7fr\)/s,
    "Ticket payment money columns should use equal widths for service price, discount, payable and paid amounts."
  );
  assert.match(
    cashierPanelSource,
    /finance-batch-ticket-head[\s\S]*className="finance-batch-ticket-cell is-number"[\s\S]*translate\("Ticket Number"\)[\s\S]*className="finance-batch-ticket-cell is-date"[\s\S]*translate\("Ticket Date"\)[\s\S]*className="finance-batch-ticket-cell is-specialist"[\s\S]*translate\("Specialist"\)[\s\S]*className="finance-batch-ticket-cell is-service"[\s\S]*translate\("Service"\)[\s\S]*className="finance-batch-ticket-cell is-money"[\s\S]*translate\("Service Price"\)[\s\S]*className="finance-batch-ticket-cell is-money"[\s\S]*translate\("Discount"\)[\s\S]*className="finance-batch-ticket-cell is-money is-payable"[\s\S]*translate\("To Pay"\)[\s\S]*className="finance-batch-ticket-cell is-money is-paid"[\s\S]*translate\("Paid"\)[\s\S]*batchPaymentTickets\.map/s,
    "Ticket payment headers should use explicit column classes for stable vertical alignment."
  );
  assert.doesNotMatch(
    cashierPanelSource,
    /finance-batch-ticket-head[\s\S]*translate\("Client"\)[\s\S]*batchPaymentTickets\.map/,
    "Ticket payment rows should not repeat the client name because client balances already show it."
  );
  assert.match(
    cashierPanelSource,
    /className="finance-batch-ticket-cell is-number"[\s\S]*formatTicketNumber\(ticket\.ticketNumber\)[\s\S]*className="finance-batch-ticket-cell is-date"[\s\S]*formatDateYMD\(ticket\.ticketDate \|\| ticket\.appointmentDate\)[\s\S]*className="finance-batch-ticket-cell is-specialist"[\s\S]*getTicketSpecialistSummary\(ticket\)[\s\S]*className="finance-batch-ticket-cell is-service"[\s\S]*getTicketServiceSummary\(ticket\)[\s\S]*className="finance-batch-ticket-cell is-money"[\s\S]*formatMoney\(getTicketServicePriceAmount\(ticket\)\)[\s\S]*className="finance-batch-ticket-cell is-money"[\s\S]*formatMoney\(getTicketDiscountAmount\(ticket\)\)[\s\S]*className="finance-batch-ticket-cell is-money is-payable"[\s\S]*formatMoney\(getTicketTotalPayableAmount\(ticket\)\)[\s\S]*className="finance-batch-ticket-cell is-money is-paid"[\s\S]*formatMoney\(getTicketPaidAmount\(ticket\)\)/,
    "Ticket payment row values should use the same explicit column classes as their headers."
  );
  assert.match(
    cashierPanelSource,
    /function getTicketPaidAmount\(ticket\) \{[\s\S]*paidAmountUzs[\s\S]*paid_amount_uzs/s,
    "Ticket payment rows should show how much has already been paid for each ticket."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-ticket-cell\.is-money \{[\s\S]*text-align: right;[\s\S]*font-variant-numeric: tabular-nums;/s,
    "Ticket amount columns should align consistently under their headers."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-ticket-head \{[\s\S]*padding: 0 5px 2px;/s,
    "Ticket headers should use the same horizontal padding as ticket values."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-payment-list \{[\s\S]*grid-template-columns: minmax\(170px, 0\.72fr\) minmax\(260px, 1fr\) minmax\(130px, 0\.48fr\) auto;/s,
    "Payment source controls should be laid out directly by the payment list grid."
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
  assert.doesNotMatch(
    cashierPanelSource,
    /finance-payment-tickets-panel[\s\S]*finance-payment-panel-head[\s\S]*formatMoney\(batchPaymentTotalUzs\)[\s\S]*finance-batch-ticket-list/,
    "Tickets panel header should not repeat the total because the checkout summary already shows amount to pay."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal h3\.finance-modal-title-with-number \{[\s\S]*justify-content: space-between;[\s\S]*border-bottom: 1px solid rgba\(148, 163, 184, 0\.18\);/s,
    "Payment modal header should separate the title and ticket count cleanly."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-payment-checkout-top \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*align-items: start;/s,
    "Payment modal first block should split client balances and checkout summary evenly without stretching the shorter block."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-ticket-total \{[\s\S]*gap: 5px;[\s\S]*padding: 6px;[\s\S]*border: 1px solid rgba\(34, 197, 94, 0\.20\);[\s\S]*background: linear-gradient\(180deg, rgba\(240, 253, 244, 0\.46\), rgba\(255, 255, 255, 0\.92\)\);/s,
    "Payment modal totals should match the client balances green summary background."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-payment-checkout-summary \{[\s\S]*grid-template-columns: minmax\(0, 1\.12fr\) minmax\(0, 0\.88fr\);[\s\S]*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*align-self: stretch;[\s\S]*align-content: stretch;/s,
    "Checkout summary should let Total To Pay occupy the removed Remaining space."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-payment-checkout-summary \.finance-total-cell-total \{[\s\S]*grid-row: 1 \/ span 2;/s,
    "Total To Pay should span both rows in the checkout summary."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-payment-checkout-summary > \.finance-total-cell \{[\s\S]*height: auto;[\s\S]*min-height: 26px;[\s\S]*grid-template-columns: minmax\(0, 1fr\) max-content;/s,
    "Checkout summary cells should expand inside the stretched summary block without becoming oversized."
  );
  assert.doesNotMatch(
    styles,
    /#financeBatchPaymentModal [^{]*finance-(?:ticket-total|payment-checkout-summary)[^{]*::before/,
    "Checkout summary total cells should not draw horizontal line indicators."
  );
  assert.doesNotMatch(
    styles,
    /#financeBatchPaymentModal [^{]*(?:finance-payment-checkout-panel|finance-batch-client-balances|finance-payment-tickets-panel|finance-batch-payment-methods)[^{]*::before/,
    "Payment checkout panels should not draw top horizontal line indicators."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-payment-checkout-panel \{[\s\S]*padding: 7px;[\s\S]*box-shadow: 0 1px 2px rgba\(15, 23, 42, 0\.04\);/s,
    "Payment modal sections should use lighter panel styling for frequent cashier use."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-payment-list \{[\s\S]*grid-template-columns: minmax\(170px, 0\.72fr\) minmax\(260px, 1fr\) minmax\(130px, 0\.48fr\) auto;/s,
    "Payment controls should use a single full-width checkout input grid without an extra row wrapper."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-ticket-head,[\s\S]*#financeBatchPaymentModal \.finance-batch-ticket-group \{[\s\S]*--finance-batch-ticket-column-gap: 8px;[\s\S]*column-gap: var\(--finance-batch-ticket-column-gap\);[\s\S]*#financeBatchPaymentModal \.finance-batch-ticket-line \{[\s\S]*column-gap: var\(--finance-batch-ticket-column-gap\);/s,
    "Nested ticket service rows should use the same column gap as their parent ticket row."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-ticket-lines \{[\s\S]*padding: 5px 0;[\s\S]*border-left: 0;[\s\S]*box-shadow: inset 2px 0 0 rgba\(37, 99, 235, 0\.18\);/s,
    "Nested ticket service wrapper should not add horizontal padding or layout-affecting borders that misalign child columns."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-ticket-line-cell \{[\s\S]*font-weight: 400;[\s\S]*#financeBatchPaymentModal \.finance-batch-ticket-line-cell\.is-money \{[\s\S]*font-weight: 400;[\s\S]*#financeBatchPaymentModal \.finance-batch-ticket-line strong \{[\s\S]*font-weight: 400;/s,
    "Nested ticket service row text should not render bold."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.edit-actions \{[\s\S]*padding-top: 8px;[\s\S]*border-top: 1px solid rgba\(148, 163, 184, 0\.18\);/s,
    "Payment modal actions should be visually separated from payment details."
  );
});

test("batch payment ticket groups contain every nested line cell", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-ticket-list \{[\s\S]*--finance-batch-ticket-columns:[\s\S]*minmax\(0,[\s\S]*width: 100%;[\s\S]*max-width: 100%;[\s\S]*overflow: hidden;/s,
    "Ticket columns should be allowed to shrink inside their panel."
  );
  assert.match(
    styles,
    /#financeBatchPaymentModal \.finance-batch-ticket-lines \{[\s\S]*max-width: 100%;[\s\S]*min-width: 0;[\s\S]*overflow: hidden;[\s\S]*#financeBatchPaymentModal \.finance-batch-ticket-line \{[\s\S]*max-width: 100%;[\s\S]*overflow: hidden;/s,
    "Nested ticket rows should not exceed the ticket group width."
  );
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*#financeBatchPaymentModal \.finance-batch-ticket-line-cell \{[\s\S]*grid-column: 1 !important;/s,
    "Mobile rows should reset desktop column placements instead of creating implicit overflow columns."
  );
});
