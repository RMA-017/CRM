import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("ticket edit modal keeps only change reason and preserves existing note", async () => {
  const [source, customSelectSource] = await Promise.all([
    readFile(
      new URL("../src/pages/profile/panels/FinanceTicketsPanel.jsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../src/components/CustomSelect.jsx", import.meta.url), "utf8")
  ]);

  assert.doesNotMatch(
    source,
    /value=\{editForm\.note\}/,
    "Edit ticket modal should not render a second note textarea."
  );
  assert.doesNotMatch(
    source,
    /note: editForm\.note/,
    "Ticket updates should omit note so the existing ticket note is preserved."
  );
  assert.match(
    source,
    /className="field finance-ticket-edit-reason-field"[\s\S]*<span>\{translate\("Change reason"\)\}<\/span>[\s\S]*required[\s\S]*value=\{editForm\.reason\}/s,
    "Edit ticket modal should keep the required change reason textarea."
  );
  assert.match(
    source,
    /function buildTicketHistoryDetails\(translate, item\)[\s\S]*details\.note \|\| details\.ticketNote[\s\S]*`\$\{translate\("Note"\)\}: \$\{note\}`[\s\S]*buildTicketHistoryDetails\(translate, item\)/s,
    "Ticket history details should show the creation note in the Details column."
  );
  assert.match(
    customSelectSource,
    /map\.set\(String\(option\.value\), option\.selectedLabel \|\| option\.label\);[\s\S]*optionLabelByValue\.get\(String\(value\)\)[\s\S]*aria-selected=\{String\(option\.value\) === String\(value\) \? "true" : "false"\}/s,
    "Disabled client selects should still show labels when API ids arrive as numbers but form ids are strings."
  );
});

test("ticket edit change reason field uses full width and compact height", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    styles,
    /#financeTicketEditModal \.finance-ticket-edit-reason-field \{[\s\S]*width: 100%;[\s\S]*#financeTicketEditModal \.finance-ticket-edit-reason-field textarea \{[\s\S]*min-height: 44px;[\s\S]*height: 44px;[\s\S]*resize: vertical;/s,
    "Change reason should fill the x axis and use the compact textarea height."
  );
});

test("ticket history modal uses a shorter vertical size", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    styles,
    /#financeTicketHistoryModal\.logout-confirm-modal\.all-users-edit-modal \{[\s\S]*height: 50dvh;[\s\S]*max-height: min\(532px, calc\(70dvh - 17px\)\);/s,
    "Ticket history modal should open about 30% shorter on the y axis."
  );
});

test("ticket history table sizes columns by content without spilling into neighboring cells", async () => {
  const [source, styles] = await Promise.all([
    readFile(
      new URL("../src/pages/profile/panels/FinanceTicketsPanel.jsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../src/css/components/components.css", import.meta.url), "utf8")
  ]);

  assert.match(
    source,
    /<table className="all-users-table finance-ticket-history-table"[\s\S]*<colgroup>[\s\S]*finance-ticket-history-date-col[\s\S]*finance-ticket-history-details-col[\s\S]*<thead>/s,
    "Ticket history table should expose explicit column hooks for responsive sizing."
  );
  assert.match(
    styles,
    /#financeTicketHistoryModal \.finance-ticket-history-table \{[\s\S]*width: max-content;[\s\S]*min-width: 100%;[\s\S]*table-layout: auto;/s,
    "Ticket history table should size columns by content instead of fixed layout."
  );
  assert.match(
    styles,
    /#financeTicketHistoryModal \.all-users-table :is\(th, td\) \{[\s\S]*max-width: none;[\s\S]*overflow: hidden;[\s\S]*overflow-wrap: anywhere;/s,
    "Ticket history cells should prevent long values from spilling into neighboring columns."
  );
  assert.match(
    styles,
    /#financeTicketHistoryModal \.all-users-table :is\(th:nth-child\(5\), td:nth-child\(5\)\) \{[\s\S]*min-width: 360px;[\s\S]*white-space: normal;[\s\S]*overflow: hidden;/s,
    "Ticket history details should keep a wider wrapped column without visible overflow."
  );
});

test("finance delete icons use a closed trash lid", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    styles,
    /#financeTicketsPanel \.finance-ticket-trash-icon \{[\s\S]*box-sizing: border-box;[\s\S]*width: 12px;[\s\S]*#financeTicketsPanel \.finance-ticket-trash-icon::before \{[\s\S]*left: -1\.4px;[\s\S]*top: -2\.2px;[\s\S]*width: calc\(100% \+ 2\.8px\);[\s\S]*#financeTicketsPanel \.finance-ticket-trash-icon::after \{[\s\S]*left: 50%;[\s\S]*transform: translateX\(-50%\);/s,
    "Finance ticket delete icon lid should fully cover the trash body."
  );
  assert.match(
    styles,
    /:is\(#servicesSettingsPanel, #financeSettingsPanel, #financeTransactionsPanel\) \.services-settings-trash-icon \{[\s\S]*box-sizing: border-box;[\s\S]*width: 12px;[\s\S]*:is\(#servicesSettingsPanel, #financeSettingsPanel, #financeTransactionsPanel\) \.services-settings-trash-icon::before \{[\s\S]*left: -1\.4px;[\s\S]*top: -2\.2px;[\s\S]*width: calc\(100% \+ 2\.8px\);[\s\S]*:is\(#servicesSettingsPanel, #financeSettingsPanel, #financeTransactionsPanel\) \.services-settings-trash-icon::after \{[\s\S]*left: 50%;[\s\S]*transform: translateX\(-50%\);/s,
    "Finance settings and transaction delete icons should fully cover the trash body."
  );
});

test("ticket edit and delete actions are hidden for tickets with payment activity", async () => {
  const [source, translations] = await Promise.all([
    readFile(
      new URL("../src/pages/profile/panels/FinanceTicketsPanel.jsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../src/i18n/translations.js", import.meta.url), "utf8")
  ]);

  assert.match(
    source,
    /function hasTicketPostedPaymentActivity\(item\) \{[\s\S]*item\?\.paidAmountUzs[\s\S]*item\?\.postedPaymentActivityCount[\s\S]*return paidAmountUzs > 0 \|\| paymentActivityCount > 0;/s,
    "Ticket rows should detect posted payment/refund activity for edit and delete protection."
  );
  assert.match(
    source,
    /const canEditRow = canUpdateFinanceCashier[\s\S]*item\.status !== "paid"[\s\S]*item\.status !== "voided"[\s\S]*!hasTicketPostedPaymentActivity\(item\);[\s\S]*const canDeleteRow = canEditRow && !hasTicketPostedPaymentActivity\(item\);[\s\S]*return canEditRow \? \(/s,
    "Edit and delete icons should render when a ticket has no active posted payment activity."
  );
  assert.doesNotMatch(
    source,
    /refundTicket|refundingId|\/api\/finance\/cashier\/tickets\/\$\{id\}\/refund|translate\("Refund"\)/,
    "Ticket rows should not expose a separate refund action; payment returns are handled from transactions."
  );
  assert.match(
    source,
    /const openEditTicket = \(item\) => \{[\s\S]*if \(hasTicketPostedPaymentActivity\(item\)\) \{[\s\S]*Tickets with payments cannot be edited\./s,
    "The edit handler should also block stale clicks on tickets with posted payment activity."
  );
  assert.match(
    source,
    /const deleteTicket = async \(item\) => \{[\s\S]*if \(hasTicketPostedPaymentActivity\(item\)\) \{[\s\S]*Tickets with payments cannot be deleted\./s,
    "The delete handler should block stale clicks only when posted payment activity still exists."
  );
  assert.match(
    translations,
    /Tickets with payments cannot be deleted\.", uz: "To'lovi bor talonlarni o'chirib bo'lmaydi\.", ru: "Талоны с оплатами нельзя удалить\."/s,
    "The payment-protected delete message should be translated."
  );
  assert.match(
    translations,
    /Tickets with payments cannot be edited\.", uz: "To'lovi bor talonlarni tahrirlab bo'lmaydi\.", ru: "Талоны с оплатами нельзя редактировать\."/s,
    "The payment-protected edit message should be translated."
  );
});

test("ticket table exposes payment progress columns through the columns modal", async () => {
  const source = await readFile(
    new URL("../src/pages/profile/panels/FinanceTicketsPanel.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /const ALL_FINANCE_TICKET_COLUMN_IDS = Object\.freeze\(\[[\s\S]*"status",[\s\S]*"servicePrice",[\s\S]*"discount",[\s\S]*"paid",[\s\S]*"remaining",[\s\S]*"actions"[\s\S]*const DEFAULT_FINANCE_TICKET_COLUMN_IDS = Object\.freeze\(\[[\s\S]*"status",[\s\S]*"servicePrice",[\s\S]*"discount",[\s\S]*"toPay",[\s\S]*"paid",[\s\S]*"remaining",[\s\S]*"actions"/s,
    "Ticket columns should make service price, discount and payment progress fields available while keeping the daily status columns visible by default."
  );
  assert.match(
    source,
    /const allowed = new Set\(ALL_FINANCE_TICKET_COLUMN_IDS\);[\s\S]*const normalized = ALL_FINANCE_TICKET_COLUMN_IDS\.filter[\s\S]*FINANCE_TICKET_COLUMNS_STORAGE_VERSION[\s\S]*new Set\(\[...normalized, "servicePrice", "discount"\]\)/s,
    "Stored table column choices should persist optional columns and add newly introduced defaults once."
  );
  assert.match(
    source,
    /id: "status",[\s\S]*label: "Status",[\s\S]*id: "servicePrice",[\s\S]*label: "Service Price",[\s\S]*getTicketServicePriceAmount\(item\)[\s\S]*id: "discount",[\s\S]*label: "Discount",[\s\S]*getTicketDiscountAmount\(item\)[\s\S]*id: "paid",[\s\S]*label: "Paid",[\s\S]*formatMoney\(item\.paidAmountUzs\)[\s\S]*id: "remaining",[\s\S]*label: "Remaining",[\s\S]*getTicketRemainingAmount\(item\)/s,
    "Ticket table should render status, service price, discount, paid and remaining columns."
  );
  assert.doesNotMatch(
    source,
    /id: "paidAt"|label: "Paid At"|formatDateTime\(item\.paidAt\)|id: "paymentMethod"|label: "Payment Method"|item\.paymentMethodName/,
    "Ticket table should not expose paid-at or payment-method columns because split payments make them ambiguous."
  );
});

test("ticket table does not translate removed paid-at column", async () => {
  const translations = await readFile(
    new URL("../src/i18n/translations.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(
    translations,
    /Paid At", uz: "To'langan vaqt", ru: "Время оплаты"/s,
    "The removed paid-at ticket column should not stay in translations."
  );
});

test("ticket table shows current query totals under matching columns", async () => {
  const [source, styles] = await Promise.all([
    readFile(
      new URL("../src/pages/profile/panels/FinanceTicketsPanel.jsx", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../src/css/components/components.css", import.meta.url),
      "utf8"
    )
  ]);

  assert.match(
    source,
    /const EMPTY_TICKET_LIST_SUMMARY = Object\.freeze\(\{[\s\S]*subtotalAmountUzs: 0,[\s\S]*discountAmountUzs: 0,[\s\S]*totalAmountUzs: 0,[\s\S]*paidAmountUzs: 0,[\s\S]*remainingAmountUzs: 0[\s\S]*function normalizeTicketListSummary\(summary\)/s,
    "Ticket list should normalize summary totals returned from the API."
  );
  assert.match(
    source,
    /function getTicketSummaryColumnValue\(columnId, summary\) \{[\s\S]*columnId === "servicePrice"[\s\S]*summary\?\.subtotalAmountUzs[\s\S]*columnId === "discount"[\s\S]*summary\?\.discountAmountUzs[\s\S]*columnId === "toPay"[\s\S]*summary\?\.totalAmountUzs[\s\S]*columnId === "paid"[\s\S]*summary\?\.paidAmountUzs[\s\S]*columnId === "remaining"[\s\S]*summary\?\.remainingAmountUzs/s,
    "Ticket list should map query summary totals to their matching table columns."
  );
  assert.match(
    source,
    /setTicketSummary\(normalizeTicketListSummary\(data\?\.summary\)\)/,
    "Ticket list should keep backend summary totals instead of summing only the current page."
  );
  assert.match(
    source,
    /<tfoot>[\s\S]*className="finance-ticket-total-row"[\s\S]*getTicketSummaryColumnValue\(column\.id, ticketSummary\)[\s\S]*className="finance-ticket-total-value"[\s\S]*formatSummaryMoney\(summaryValue\)/s,
    "Ticket summary should render as a table footer under the matching visible columns."
  );
  assert.match(
    source,
    /visibleColumns\.map\(\(column, index\) => \{[\s\S]*getTicketSummaryColumnValue\(column\.id, exportData\.summary\)[\s\S]*if \(summaryValue !== null\) return summaryValue;[\s\S]*index === 0 \? translate\("Total"\) : ""/s,
    "Ticket export should include a final totals row aligned to the same columns."
  );
  assert.match(
    styles,
    /\.finance-ticket-total-row td \{[\s\S]*border-top: 1px solid var\(--line\);[\s\S]*font-weight: 800;[\s\S]*\.finance-ticket-total-value \{[\s\S]*text-align: right;/s,
    "Ticket summary footer should look like a compact total row."
  );
  assert.doesNotMatch(
    source,
    /finance-ticket-list-summary/,
    "Ticket summary should not render as a separate block above the table."
  );
});

test("ticket edit modal uses one shared discount and distributes it to line items", async () => {
  const source = await readFile(
    new URL("../src/pages/profile/panels/FinanceTicketsPanel.jsx", import.meta.url),
    "utf8"
  );
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /const EMPTY_TICKET_EDIT_FORM = Object\.freeze\(\{[\s\S]*discountType: "amount",[\s\S]*discountValue: "0"/s,
    "Edit ticket form should keep shared discount state."
  );
  assert.match(
    source,
    /const editTotals = useMemo\(\(\) => \{[\s\S]*const subtotalUzs = editForm\.items\.reduce[\s\S]*calculateDiscountUzs\(\{[\s\S]*priceUzs: subtotalUzs,[\s\S]*discountType: editForm\.discountType,[\s\S]*discountValue: editForm\.discountValue[\s\S]*totalUzs: Math\.max\(subtotalUzs - discountUzs, 0\)/s,
    "Edit ticket totals should recalculate subtotal, shared discount and total from the shared discount controls."
  );
  assert.match(
    source,
    /if \(editTotals\.subtotalUzs <= 0\) \{[\s\S]*Ticket amount is required\.[\s\S]*const editItemDiscounts = distributeDiscountUzs/s,
    "Edit ticket should allow a zero total from a 100% discount while still requiring a positive subtotal."
  );
  assert.doesNotMatch(
    source,
    /finance-ticket-edit-discount-field/,
    "Edit ticket item rows should not render per-line discount controls."
  );
  assert.match(
    source,
    /className="finance-ticket-summary finance-ticket-total finance-ticket-edit-total"[\s\S]*translate\("Discount Type"\)[\s\S]*value=\{editForm\.discountType\}[\s\S]*translate\("Discount"\)[\s\S]*max=\{editForm\.discountType === "percent" \? "100" : undefined\}[\s\S]*value=\{editForm\.discountValue\}/s,
    "Edit ticket modal should expose one shared discount block like manual ticket creation."
  );
  assert.match(
    source,
    /isAppointmentSourceTicket\(editTicket\) \? \([\s\S]*className="finance-ticket-edit-readonly-input"[\s\S]*getSelectedOptionLabel\(editSpecialistOptions, item\.specialistId, item\.specialistName \|\| translate\("Select specialist"\)\)[\s\S]*readOnly[\s\S]*<CustomSelect[\s\S]*value=\{item\.specialistId\}[\s\S]*placeholder=\{translate\("Select specialist"\)\}[\s\S]*disabled=\{editReferencesLoading && editSpecialistOptions\.length === 0\}[\s\S]*const specialist = editSpecialists\.find[\s\S]*specialistId: value,[\s\S]*specialistName: specialist\?\.fullName \|\| item\.specialistName/s,
    "Edit ticket modal should render appointment specialists as readable locked inputs while manual specialists stay selectable."
  );
  assert.match(
    source,
    /function mergeOptions\(baseOptions, nextOptions\) \{[\s\S]*const key = String\(option\.value\);[\s\S]*if \(!map\.has\(key\)\) \{[\s\S]*map\.set\(key, option\);/s,
    "Edit ticket option fallbacks should only fill missing values so stale row labels cannot override fresh specialist options."
  );
  assert.match(
    source,
    /const editServiceOptions = useMemo\(\(\) => \{[\s\S]*const selectedLabelById = new Map[\s\S]*selectedLabel: selectedLabelById\.get\(String\(item\.id\)\)[\s\S]*const editSpecialistOptions = useMemo\(\(\) => \{[\s\S]*selectedLabel: selectedLabelById\.get\(String\(item\.id\)\)[\s\S]*disabled=\{editReferencesLoading && editServiceOptions\.length === 0\}/s,
    "Edit ticket modal should keep selected service and specialist labels stable while references load."
  );
  assert.match(
    source,
    /<input[\s\S]*className="finance-ticket-edit-readonly-input"[\s\S]*value=\{editClientDisplayName \|\| translate\("Select client"\)\}[\s\S]*readOnly[\s\S]*title=\{translate\("Ticket client cannot be changed\."\)\}/s,
    "Edit ticket modal should show the client as a readable locked input instead of a dimmed disabled select."
  );
  assert.match(
    source,
    /function isAppointmentSourceTicket\(item\) \{[\s\S]*source[\s\S]*"appointment"[\s\S]*appointmentScheduleId[\s\S]*const isAppointmentTicket = isAppointmentSourceTicket\(editTicket\);[\s\S]*if \(!isAppointmentTicket && ![\s\S]*editForm\.ticketDate[\s\S]*if \(!isAppointmentTicket\) \{[\s\S]*payload\.ticketDate = editForm\.ticketDate;[\s\S]*\}/s,
    "Edit ticket submit should use ticket source so appointment tickets keep their original date while manual tickets can edit it."
  );
  assert.match(
    source,
    /className="finance-ticket-edit-title-meta"[\s\S]*className=\{`finance-ticket-source-badge \$\{isAppointmentSourceTicket\(editTicket\) \? "is-appointment" : "is-manual"\}`\}[\s\S]*translate\(isAppointmentSourceTicket\(editTicket\) \? "Appointment Ticket" : "Manual Ticket"\)[\s\S]*finance-modal-ticket-number/s,
    "Edit ticket modal should show whether the ticket was created manually or from an appointment."
  );
  assert.match(
    styles,
    /#financeTicketEditModal \.finance-modal-title-with-number \{[\s\S]*justify-content: space-between;[\s\S]*#financeTicketEditModal \.finance-ticket-edit-title-meta \{[\s\S]*justify-content: flex-end;/s,
    "Edit ticket modal title should keep the title on the left and source/number meta on the right."
  );
  assert.match(
    source,
    /value=\{editForm\.ticketDate\}[\s\S]*disabled=\{isAppointmentSourceTicket\(editTicket\)\}[\s\S]*Field is locked because ticket was created from appointment\.[\s\S]*isAppointmentSourceTicket\(editTicket\) \? \([\s\S]*finance-ticket-edit-readonly-input[\s\S]*value=\{getSelectedOptionLabel\(editSpecialistOptions, item\.specialistId, item\.specialistName \|\| translate\("Select specialist"\)\)\}/s,
    "Appointment tickets should lock ticket date and specialist while keeping locked specialist text readable."
  );
  assert.match(
    source,
    /const percentValue = String\(rows\[0\]\?\.discountValue \?\? 0\);[\s\S]*const usesSharedPercent = rows\.length > 0 && rows\.every[\s\S]*discountType[\s\S]*"percent"[\s\S]*discountValue[\s\S]*percentValue[\s\S]*discountType: "percent",[\s\S]*discountValue: percentValue/s,
    "Edit ticket modal should restore a shared percent discount when all ticket lines store the same percent."
  );
  assert.match(
    source,
    /const editItemDiscounts = distributeDiscountUzs\([\s\S]*editTotals\.discountUzs[\s\S]*items: editForm\.items\.map\(\(item, index\) => \(\{[\s\S]*discountType: editForm\.discountType === "percent" \? "percent" : "amount",[\s\S]*discountValue: editForm\.discountType === "percent"[\s\S]*editForm\.discountValue[\s\S]*editItemDiscounts\[index\] \|\| 0,[\s\S]*discountUzs: editItemDiscounts\[index\] \|\| 0/s,
    "Edited shared percent discounts should keep percent metadata while sending exact distributed UZS discounts."
  );
  assert.match(
    source,
    /const getEditItemPrice = useCallback\(\(item\) => \{[\s\S]*catalogPriceUzs > 0 \? catalogPriceUzs : normalizeMoneyInput\(item\?\.priceUzs\)/s,
    "Edit ticket rows should fall back to an entered price when the selected service has no catalog price."
  );
  assert.match(
    source,
    /const requiresManualPrice = Boolean\(item\.serviceId\)[\s\S]*normalizeMoneyInput\(selectedService\?\.priceUzs\) <= 0;[\s\S]*finance-ticket-edit-item-grid\$\{requiresManualPrice \? " has-manual-price" : ""\}[\s\S]*aria-label=\{translate\("Price"\)\}[\s\S]*placeholder=\{translate\("Price"\)\}[\s\S]*value=\{item\.priceUzs\}/s,
    "Edit ticket modal should show an inline price input for selected zero-price services."
  );
  assert.match(
    source,
    /if \(getEditItemPrice\(item\) <= 0\) \{[\s\S]*translate\("Service price is required\."\)[\s\S]*priceUzs: getEditItemPrice\(item\)/s,
    "Edited ticket payloads should require and submit the manual price snapshot."
  );
  assert.match(
    styles,
    /#financeTicketEditModal \.finance-ticket-edit-item-grid\.has-manual-price \{[\s\S]*grid-template-columns:[\s\S]*minmax\(120px, 0\.55fr\);[\s\S]*#financeTicketEditModal \.finance-ticket-edit-price-field \{[\s\S]*min-width: 0;/s,
    "The edit ticket manual price field should fit inside the row grid."
  );
  assert.match(
    styles,
    /#financeTicketEditModal \.finance-ticket-edit-item-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*#financeTicketEditModal \.finance-ticket-edit-readonly-input \{[\s\S]*color: var\(--text-main\);[\s\S]*#financeTicketEditModal \.finance-ticket-edit-total \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/s,
    "Edit ticket item rows should show equal controls and readable locked inputs while the shared total row has four cells."
  );
  assert.doesNotMatch(
    source,
    /aria-label=\{translate\("Add Service"\)\}|onClick=\{addEditItem\}|const addEditItem =/,
    "Edit ticket modal should not allow adding new services."
  );
});

test("ticket list and filter modal use ticket creation dates", async () => {
  const [source, translations] = await Promise.all([
    readFile(
      new URL("../src/pages/profile/panels/FinanceTicketsPanel.jsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../src/i18n/translations.js", import.meta.url), "utf8")
  ]);

  assert.match(
    source,
    /function createDefaultFilters\(\) \{[\s\S]*\.\.\.EMPTY_FILTERS,[\s\S]*status: DEFAULT_TICKET_STATUS_FILTER[\s\S]*function createInitialAppliedFilters\(\) \{[\s\S]*ticketCreatedFrom: today,[\s\S]*ticketCreatedTo: today/s,
    "Finance tickets should initially request tickets created today."
  );
  assert.match(
    source,
    /const \[filters, setFilters\] = useState\(\(\) => createInitialAppliedFilters\(\)\);[\s\S]*const \[appliedFilters, setAppliedFilters\] = useState\(\(\) => createInitialAppliedFilters\(\)\)/s,
    "The visible filter modal dates should mirror the active created-at filter."
  );
  assert.match(
    source,
    /function getTicketNumberDigits\(value\) \{[\s\S]*replace\(\/\\D\/g, ""\)\.slice\(0, 5\);[\s\S]*function normalizeTicketFiltersForQuery\(source\) \{[\s\S]*const ticketNumber = getTicketNumberDigits\(next\.ticketNumber\);[\s\S]*next\.ticketCreatedFrom = "";[\s\S]*next\.ticketCreatedTo = "";/s,
    "Ticket number search should strip display characters and clear default created-at dates so old tickets can be found."
  );
  assert.match(
    source,
    /const applyFilters = \(event\) => \{[\s\S]*const nextFilters = normalizeTicketFiltersForQuery\(filters\);[\s\S]*setFilters\(nextFilters\);[\s\S]*setAppliedFilters\(nextFilters\);[\s\S]*loadTickets\(1, nextFilters\);/s,
    "Applying ticket filters should persist the normalized ticket-number query."
  );
  assert.match(
    source,
    /Object\.entries\(normalizeTicketFiltersForQuery\(appliedFilters\)\)\.forEach/s,
    "Ticket exports should use the same normalized ticket-number filters as the visible list."
  );
  assert.match(
    source,
    /translate\("Ticket Created From"\)[\s\S]*value=\{filters\.ticketCreatedFrom\}[\s\S]*ticketCreatedFrom: value[\s\S]*translate\("Ticket Created To"\)[\s\S]*value=\{filters\.ticketCreatedTo\}[\s\S]*ticketCreatedTo: value/s,
    "Finance ticket filter modal date inputs should filter by the real ticket creation date."
  );
  assert.doesNotMatch(
    source,
    /translate\("Ticket Date From"\)[\s\S]*value=\{filters\.dateFrom\}[\s\S]*translate\("Ticket Date To"\)[\s\S]*value=\{filters\.dateTo\}/s,
    "Finance ticket filter modal should not expose ticket-date date range inputs."
  );
  assert.match(
    translations,
    /Ticket Created From", uz: "Talon yaratilgan sana dan", ru: "Дата создания с"[\s\S]*Ticket Created To", uz: "Talon yaratilgan sana gacha", ru: "Дата создания до"/s,
    "Created-at date filter labels should be translated without saying ticket date."
  );
});
