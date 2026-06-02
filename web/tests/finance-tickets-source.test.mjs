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
