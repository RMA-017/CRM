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
    /function getPaymentMethodSummaryCards\(paymentMethods, paymentSummary\)[\s\S]*summaryById\.set\(id, item\)[\s\S]*Array\.isArray\(paymentMethods\)[\s\S]*totalInUzs/s,
    "Daily cash should combine DB payment method names with returned method totals."
  );

  assert.match(
    dailyCashSource,
    /<div className="all-users-head">[\s\S]*<\/div>\s*<div className="finance-daily-cash-method-summary"[\s\S]*paymentMethodSummaryCards\.map[\s\S]*formatMoneyValue\(item\.totalInUzs\)/s,
    "Payment method total cards should render directly under the daily cash header."
  );

  assert.match(
    dailyCashSource,
    /<span>\{translate\("Payment Method"\)\}<\/span>[\s\S]*<strong>\{formatMoneyValue\(0\)\}<\/strong>/s,
    "Daily cash should keep a stable zero state when no payment methods are available."
  );

  assert.match(
    styles,
    /\.finance-daily-cash-method-summary[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(150px, 1fr\)\);[\s\S]*\.finance-daily-cash-method-card strong/s,
    "Daily cash payment method cards should use a responsive summary block."
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
