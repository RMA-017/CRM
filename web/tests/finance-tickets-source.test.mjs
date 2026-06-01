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

test("ticket list opens with today's created tickets while ticket date stays a manual filter", async () => {
  const source = await readFile(
    new URL("../src/pages/profile/panels/FinanceTicketsPanel.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /function createDefaultFilters\(\) \{[\s\S]*\.\.\.EMPTY_FILTERS,[\s\S]*status: DEFAULT_TICKET_STATUS_FILTER[\s\S]*function createInitialAppliedFilters\(\) \{[\s\S]*ticketCreatedFrom: today,[\s\S]*ticketCreatedTo: today/s,
    "Finance tickets should initially request tickets created today without pre-filling the visible ticket-date filters."
  );
  assert.match(
    source,
    /const \[filters, setFilters\] = useState\(\(\) => createDefaultFilters\(\)\);[\s\S]*const \[appliedFilters, setAppliedFilters\] = useState\(\(\) => createInitialAppliedFilters\(\)\)/s,
    "Visible filters should stay independent from the initial created-at filter."
  );
  assert.match(
    source,
    /value=\{filters\.dateFrom\}[\s\S]*setFilters\(\(current\) => \(\{ \.\.\.current, dateFrom: value \}\)\)[\s\S]*value=\{filters\.dateTo\}/s,
    "Ticket date inputs should continue to filter by ticket date when the user searches."
  );
});
