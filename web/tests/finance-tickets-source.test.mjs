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

test("ticket edit change reason field uses a narrower horizontal size", async () => {
  const styles = await readFile(
    new URL("../src/css/components/components.css", import.meta.url),
    "utf8"
  );

  assert.match(
    styles,
    /#financeTicketEditModal \.finance-ticket-edit-reason-field \{[\s\S]*width: min\(520px, 100%\);[\s\S]*#financeTicketEditModal \.finance-ticket-edit-reason-field textarea \{[\s\S]*resize: vertical;/s,
    "Change reason should be narrower on the x axis and avoid horizontal textarea resizing."
  );
});

test("ticket edit modal allows changing discounts and recalculates totals", async () => {
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
    /const editTotals = useMemo\(\(\) => \{[\s\S]*calculateDiscountUzs\(\{[\s\S]*discountType: item\.discountType,[\s\S]*discountValue: item\.discountValue[\s\S]*totalUzs: totals\.totalUzs \+ Math\.max\(priceUzs - discountUzs, 0\)/s,
    "Edit ticket totals should recalculate subtotal, discount and total from edited line discounts."
  );
  assert.match(
    source,
    /finance-ticket-edit-discount-field[\s\S]*translate\("Discount Type"\)[\s\S]*value=\{item\.discountType \|\| "amount"\}[\s\S]*translate\("Discount"\)[\s\S]*max=\{item\.discountType === "percent" \? "100" : undefined\}[\s\S]*updateEditItem\(index, \{ discountValue: value \}\)/s,
    "Edit ticket modal should expose discount type and discount value controls for each line."
  );
  assert.match(
    source,
    /items: editForm\.items\.map\(\(item\) => \(\{[\s\S]*discountType: item\.discountType \|\| "amount",[\s\S]*discountValue: Number\.parseInt\(String\(item\.discountValue \|\| 0\), 10\) \|\| 0/s,
    "Edited discount values should be sent with ticket update items."
  );
  assert.match(
    styles,
    /#financeTicketEditModal \.finance-ticket-edit-item-grid \{[\s\S]*grid-template-columns: minmax\(0, 0\.85fr\) minmax\(0, 1\.15fr\) minmax\(118px, 0\.55fr\) minmax\(96px, 0\.45fr\);[\s\S]*#financeTicketEditModal \.finance-ticket-edit-item-grid > \* \{[\s\S]*min-width: 0;[\s\S]*#financeTicketEditModal \.finance-ticket-edit-item-grid \.custom-select \{[\s\S]*max-width: 100%;/s,
    "Edit ticket item rows should keep service selects inside the modal while leaving room for discount controls."
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
