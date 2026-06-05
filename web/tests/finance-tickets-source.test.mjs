import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("ticket edit modal keeps only change reason and preserves existing note", async () => {
  const source = await readFile(
    new URL("../src/pages/profile/panels/FinanceTicketsPanel.jsx", import.meta.url),
    "utf8"
  );

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

test("finance delete icons use a closed trash lid", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    styles,
    /#financeTicketsPanel \.finance-ticket-trash-icon \{[\s\S]*box-sizing: border-box;[\s\S]*width: 13px;[\s\S]*#financeTicketsPanel \.finance-ticket-trash-icon::before \{[\s\S]*left: -2px;[\s\S]*top: -2px;[\s\S]*width: calc\(100% \+ 4px\);[\s\S]*#financeTicketsPanel \.finance-ticket-trash-icon::after \{[\s\S]*left: 50%;[\s\S]*transform: translateX\(-50%\);/s,
    "Finance ticket delete icon lid should fully cover the trash body."
  );
  assert.match(
    styles,
    /:is\(#servicesSettingsPanel, #financeSettingsPanel\) \.services-settings-trash-icon \{[\s\S]*box-sizing: border-box;[\s\S]*width: 13px;[\s\S]*:is\(#servicesSettingsPanel, #financeSettingsPanel\) \.services-settings-trash-icon::before \{[\s\S]*left: -2px;[\s\S]*top: -2px;[\s\S]*width: calc\(100% \+ 4px\);[\s\S]*:is\(#servicesSettingsPanel, #financeSettingsPanel\) \.services-settings-trash-icon::after \{[\s\S]*left: 50%;[\s\S]*transform: translateX\(-50%\);/s,
    "Finance settings delete icon lid should fully cover the trash body."
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
    /function hasTicketPaymentActivity\(item\) \{[\s\S]*item\?\.paidAmountUzs[\s\S]*item\?\.paymentActivityCount[\s\S]*return paidAmountUzs > 0 \|\| paymentActivityCount > 0;/s,
    "Ticket rows should detect both partial paid amount and any payment/refund activity for delete protection."
  );
  assert.match(
    source,
    /function hasTicketPostedPaymentActivity\(item\) \{[\s\S]*item\?\.paidAmountUzs[\s\S]*item\?\.postedPaymentActivityCount[\s\S]*return paidAmountUzs > 0 \|\| paymentActivityCount > 0;/s,
    "Ticket rows should detect posted payment/refund activity for edit protection."
  );
  assert.match(
    source,
    /const canEditRow = canUpdateFinanceCashier[\s\S]*item\.status !== "paid"[\s\S]*item\.status !== "voided"[\s\S]*!hasTicketPostedPaymentActivity\(item\);[\s\S]*const canDeleteRow = canEditRow && !hasTicketPaymentActivity\(item\);[\s\S]*\{canEditRow \? \(/s,
    "The edit icon should only render without posted payment activity while delete also requires no payment history."
  );
  assert.match(
    source,
    /const openEditTicket = \(item\) => \{[\s\S]*if \(hasTicketPostedPaymentActivity\(item\)\) \{[\s\S]*Tickets with payments cannot be edited\./s,
    "The edit handler should also block stale clicks on tickets with posted payment activity."
  );
  assert.match(
    source,
    /const deleteTicket = async \(item\) => \{[\s\S]*if \(hasTicketPaymentActivity\(item\)\) \{[\s\S]*Tickets with payments cannot be deleted\./s,
    "The delete handler should also block stale clicks on tickets with payment activity."
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
    /const ALL_FINANCE_TICKET_COLUMN_IDS = Object\.freeze\(\[[\s\S]*"status",[\s\S]*"paid",[\s\S]*"remaining",[\s\S]*"actions"[\s\S]*const DEFAULT_FINANCE_TICKET_COLUMN_IDS = Object\.freeze\(\[[\s\S]*"status",[\s\S]*"toPay",[\s\S]*"paid",[\s\S]*"remaining",[\s\S]*"actions"/s,
    "Ticket columns should make payment progress fields available while keeping the daily status columns visible by default."
  );
  assert.match(
    source,
    /const allowed = new Set\(ALL_FINANCE_TICKET_COLUMN_IDS\);[\s\S]*const normalized = ALL_FINANCE_TICKET_COLUMN_IDS\.filter/s,
    "Stored table column choices should persist optional payment columns through the table columns modal."
  );
  assert.match(
    source,
    /id: "status",[\s\S]*label: "Status",[\s\S]*translateTicketStatus\(translate, item\.status\)[\s\S]*id: "paid",[\s\S]*label: "Paid",[\s\S]*formatMoney\(item\.paidAmountUzs\)[\s\S]*id: "remaining",[\s\S]*label: "Remaining",[\s\S]*getTicketRemainingAmount\(item\)/s,
    "Ticket table should render status, paid and remaining columns."
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
    /const EMPTY_TICKET_LIST_SUMMARY = Object\.freeze\(\{[\s\S]*totalAmountUzs: 0,[\s\S]*paidAmountUzs: 0,[\s\S]*remainingAmountUzs: 0[\s\S]*function normalizeTicketListSummary\(summary\)/s,
    "Ticket list should normalize summary totals returned from the API."
  );
  assert.match(
    source,
    /function getTicketSummaryColumnValue\(columnId, summary\) \{[\s\S]*columnId === "toPay"[\s\S]*summary\?\.totalAmountUzs[\s\S]*columnId === "paid"[\s\S]*summary\?\.paidAmountUzs[\s\S]*columnId === "remaining"[\s\S]*summary\?\.remainingAmountUzs/s,
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
    /<CustomSelect[\s\S]*value=\{item\.specialistId\}[\s\S]*placeholder=\{translate\("Select specialist"\)\}[\s\S]*disabled[\s\S]*onChange=\{\(value\) => updateEditItem\(index, \{ specialistId: value \}\)\}/s,
    "Edit ticket modal should show the specialist select but keep it disabled."
  );
  assert.match(
    source,
    /const editItemDiscounts = distributeDiscountUzs\([\s\S]*editTotals\.discountUzs[\s\S]*items: editForm\.items\.map\(\(item, index\) => \(\{[\s\S]*discountType: "amount",[\s\S]*discountValue: editItemDiscounts\[index\] \|\| 0/s,
    "Edited shared discount should be distributed across ticket items before update."
  );
  assert.match(
    styles,
    /#financeTicketEditModal \.finance-ticket-edit-item-grid \{[\s\S]*grid-template-columns: minmax\(0, 0\.85fr\) minmax\(0, 1\.15fr\);[\s\S]*#financeTicketEditModal \.finance-ticket-edit-total \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/s,
    "Edit ticket item rows should only contain specialist and service selects while the shared total row has four cells."
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
