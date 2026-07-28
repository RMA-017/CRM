import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dailyCashSource = await readFile(
  new URL("../src/pages/profile/panels/FinanceDailyCashPanel.jsx", import.meta.url),
  "utf8"
);

const styles = await readFile(
  new URL("../src/css/components/components.css", import.meta.url),
  "utf8"
);

test("daily cash shows payment method totals below the header", () => {
  assert.match(
    dailyCashSource,
    /function getPaymentMethodSummaryCards\(paymentMethods, paymentSummary\)[\s\S]*summaryById\.set\(id, item\)[\s\S]*Array\.isArray\(paymentMethods\)[\s\S]*netUzs/s,
    "Daily cash should combine DB payment method names with returned method totals."
  );

  assert.match(
    dailyCashSource,
    /<div className="all-users-head">[\s\S]*<\/div>\s*<div className="finance-daily-cash-method-summary"[\s\S]*paymentMethodSummaryCards\.map[\s\S]*formatMoneyValue\(item\.netUzs\)/s,
    "Payment method total cards should render net method totals directly under the daily cash header."
  );

  assert.doesNotMatch(
    dailyCashSource,
    /<small>\{translate\("Total Out"\)\}/,
    "Daily cash method cards should not show a separate расход line."
  );

  assert.match(
    dailyCashSource,
    /function getDailyCashSignedAmount\(item\)[\s\S]*String\(item\?\.direction \|\| ""\) === "out" \? -Math\.abs\(amount\) : amount[\s\S]*render: \(item\) => formatMoney\(getDailyCashSignedAmount\(item\)\)[\s\S]*exportValue: \(item\) => getDailyCashSignedAmount\(item\)/s,
    "Daily cash table and export should show outgoing rows as negative amounts."
  );
  assert.match(
    dailyCashSource,
    /function getDailyCashSummaryColumnValue\(columnId, summary\) \{[\s\S]*columnId === "amount"[\s\S]*summary\?\.netUzs[\s\S]*return null;/s,
    "Daily cash summary should map the net total to the Amount column."
  );
  assert.match(
    dailyCashSource,
    /<tfoot>[\s\S]*className="finance-ticket-total-row finance-daily-cash-total-row"[\s\S]*getDailyCashSummaryColumnValue\(column\.id, summary\)[\s\S]*className="finance-ticket-total-value finance-daily-cash-cell-amount"[\s\S]*formatMoneyValue\(summaryValue\)/s,
    "Daily cash table should render a compact footer total under the visible Amount column."
  );
  assert.match(
    dailyCashSource,
    /visibleColumns\.map\(\(column, index\) => \{[\s\S]*getDailyCashSummaryColumnValue\(column\.id, result\.summary\)[\s\S]*if \(summaryValue !== null\) return summaryValue;[\s\S]*index === 0 \? translate\("Total"\) : ""/s,
    "Daily cash export should include a final totals row aligned to the same visible columns."
  );

  assert.match(
    dailyCashSource,
    /function getPaymentMethodSummaryCards[\s\S]*paymentMethodId: id[\s\S]*const applyPaymentMethodSummaryFilter = \(paymentMethodId\) =>[\s\S]*paymentMethodId: normalizedPaymentMethodId[\s\S]*loadDailyCash\(1, nextFilters\)/s,
    "Payment method summary cards should apply the daily cash payment method filter."
  );

  assert.match(
    dailyCashSource,
    /paymentMethodSummaryCards\.map\(\(item\) => \{[\s\S]*aria-pressed=\{isActive \? "true" : "false"\}[\s\S]*onClick=\{\(\) => applyPaymentMethodSummaryFilter\(paymentMethodId\)\}/s,
    "Payment method summary cards should be clickable filter controls."
  );

  assert.match(
    dailyCashSource,
    /<span>\{translate\("Payment Method"\)\}<\/span>[\s\S]*<strong>\{formatMoneyValue\(0\)\}<\/strong>/s,
    "Daily cash should keep a stable zero state when no payment methods are available."
  );

  assert.match(
    styles,
    /\.finance-daily-cash-method-summary[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(170px, 1fr\)\);[\s\S]*\.finance-daily-cash-method-card[\s\S]*min-height: 58px;[\s\S]*padding: 7px 10px;[\s\S]*button\.finance-daily-cash-method-card\.is-active[\s\S]*\.finance-daily-cash-method-card span[\s\S]*overflow-wrap: anywhere;[\s\S]*\.finance-daily-cash-method-card strong[\s\S]*overflow-wrap: anywhere;/s,
    "Daily cash payment method cards should use a compact responsive summary block without clipping text."
  );
});

test("daily cash owns cash session open and close controls", async () => {
  const cashierSource = await readFile(
    new URL("../src/pages/profile/panels/FinanceCashierPanel.jsx", import.meta.url),
    "utf8"
  );
  const profileMainSource = await readFile(
    new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    dailyCashSource,
    /function FinanceDailyCashPanel\(\{ onClose, canPayFinanceCashier = false, currentUser = null \}\)[\s\S]*loadCashSession[\s\S]*\/api\/finance\/cashier\/session\/current/s,
    "Daily cash should load the current cashier cash session."
  );
  assert.match(
    dailyCashSource,
    /aria-label=\{translate\("Open Cash"\)\}[\s\S]*finance-head-icon-cash[\s\S]*aria-label=\{translate\("Close Cash"\)\}[\s\S]*finance-head-icon-cash-close/s,
    "Daily cash header should render the open/close cash controls."
  );
  assert.match(
    dailyCashSource,
    /const response = await apiFetch\(`\/api\/finance\/cashier\/session\/\$\{isOpening \? "open" : "close"\}`[\s\S]*closeSessionModal\(true\)[\s\S]*loadDailyCash\(1, appliedFilters\)/s,
    "Daily cash should submit the cash session modal to the cashier session endpoints."
  );
  assert.match(
    dailyCashSource,
    /id="financeCashSessionModal"[\s\S]*onSubmit=\{submitCashSession\}/s,
    "Daily cash should render the cash session modal."
  );
  assert.match(
    dailyCashSource,
    /function normalizeMoneyInput\(value\) \{[\s\S]*return Number\.isFinite\(parsed\) \? parsed : 0;[\s\S]*<span>\{translate\("Submitted Cash"\)\}<\/span>[\s\S]*type="number"[\s\S]*step="1"/s,
    "Closing a cash session should allow negative submitted cash when refunds make the cash balance negative."
  );
  assert.doesNotMatch(
    dailyCashSource,
    /<span>\{translate\("Submitted Cash"\)\}<\/span>[\s\S]*min="0"/s,
    "Submitted cash should not use a browser minimum that blocks negative cash closure."
  );
  assert.match(
    profileMainSource,
    /<FinanceDailyCashPanel[\s\S]*canPayFinanceCashier=\{canPayFinanceCashier\}[\s\S]*currentUser=\{profile\}/s,
    "Daily cash should receive cashier payment permission and current user for the moved session controls."
  );
  assert.doesNotMatch(
    cashierSource,
    /aria-label=\{translate\("Open Cash"\)\}|aria-label=\{translate\("Close Cash"\)\}|id="financeCashSessionModal"/,
    "Cashier board should no longer own cash session controls or the session modal."
  );
});

test("daily cash date filters include closed cash sessions", () => {
  assert.match(
    dailyCashSource,
    /const applyFilters = \(event\) => \{[\s\S]*const nextFilters = \{[\s\S]*\.\.\.filters,[\s\S]*sessionScope: "all"[\s\S]*setAppliedFilters\(nextFilters\)[\s\S]*loadDailyCash\(1, nextFilters\)/s,
    "Applying daily cash filters should query historical sessions instead of requiring a currently open cash session."
  );
});

test("daily cash filter does not show a cashier input", () => {
  assert.doesNotMatch(
    dailyCashSource,
    /value=\{filters\.cashier\}/,
    "The daily cash filter should not expose the removed cashier input."
  );
});
