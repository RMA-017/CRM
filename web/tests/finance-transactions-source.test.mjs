import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("finance transaction void action is only exposed to cashier payment users", async () => {
  const [transactionsPanelSource, mainContentSource, styles] = await Promise.all([
    readFile(
      new URL("../src/pages/profile/panels/FinanceTransactionsPanel.jsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../src/pages/profile/ProfileMainContent.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/css/components/components.css", import.meta.url), "utf8")
  ]);

  assert.match(
    transactionsPanelSource,
    /function FinanceTransactionsPanel\(\{ onClose, canPayFinanceCashier = false \}\)/,
    "Transactions panel should receive the cashier payment permission explicitly."
  );

  assert.match(
    transactionsPanelSource,
    /item\.status === "voided"[\s\S]*isTransactionReversed\(item\)[\s\S]*finance-transaction-status-reversed[\s\S]*!canPayFinanceCashier \? \([\s\S]*finance-transaction-status-active[\s\S]*finance-transaction-void-btn/s,
    "Rows should render fixed statuses instead of the void button when transactions are cancelled, corrected, or readonly."
  );
  assert.match(
    transactionsPanelSource,
    /className="table-action-btn table-action-btn-danger services-settings-action-btn finance-transaction-void-btn"[\s\S]*services-settings-trash-icon/s,
    "Transaction void action should use the same trash icon style as finance settings."
  );
  assert.doesNotMatch(
    transactionsPanelSource,
    /ⓧ/,
    "Transaction void action should not render the circled x glyph."
  );
  assert.match(
    transactionsPanelSource,
    /type="submit" className="btn" disabled=\{Boolean\(voidingId\)\}>\{voidingId \? "\.\.\." : translate\("Void"\)\}/,
    "Void modal submit button should use the shorter cancellation label."
  );
  assert.doesNotMatch(
    transactionsPanelSource,
    /<h3>\{translate\("Cancel transaction"\)\}<\/h3>[\s\S]*btn btn-secondary[\s\S]*translate\("Cancel"\)/,
    "Void modal should not show a secondary cancel button."
  );

  assert.match(
    transactionsPanelSource,
    /const openVoidTransaction = \(item\) => \{[\s\S]*if \(!canPayFinanceCashier \|\| !item \|\| item\.status === "voided" \|\| isTransactionReversed\(item\) \|\| voidingId\) return;/s,
    "Stale or manual clicks should also be blocked for cancelled or corrected transactions before opening the void modal."
  );

  assert.match(
    transactionsPanelSource,
    /function isTransactionReversed\(item\)[\s\S]*metadata\.reversalTransactionId[\s\S]*metadata\.reversal_transaction_id[\s\S]*metadata\.reversedTransactionId[\s\S]*metadata\.reversed_transaction_id/s,
    "Correction originals and their reversal transactions should both hide the void action."
  );

  assert.match(
    transactionsPanelSource,
    /const submitVoidTransaction = async \(event\) => \{[\s\S]*event\.preventDefault\(\);[\s\S]*if \(!canPayFinanceCashier\) return;/s,
    "Void submission should not call the API without cashier payment permission."
  );

  assert.match(
    mainContentSource,
    /<FinanceTransactionsPanel[\s\S]*onClose=\{closeFinanceTransactionsPanel\}[\s\S]*canPayFinanceCashier=\{canPayFinanceCashier\}/s,
    "Profile shell should pass the cashier payment permission into the transactions panel."
  );

  assert.match(
    styles,
    /\.finance-transaction-status-active \{[\s\S]*font-size: 11px;[\s\S]*font-weight: 700;/s,
    "Readonly transaction status should have a compact table style."
  );
  assert.match(
    styles,
    /\.finance-transaction-status-reversed \{[\s\S]*font-size: 11px;[\s\S]*font-weight: 700;/s,
    "Corrected transaction status should match the compact table style."
  );
  assert.match(
    transactionsPanelSource,
    /<th key=\{column\.id\} className=\{column\.className\}>[\s\S]*className=\{\[[\s\S]*column\.className,[\s\S]*finance-transactions-amount-cell/s,
    "Transaction table should apply column classes to visible headers and cells."
  );
  assert.match(
    transactionsPanelSource,
    /function getTransactionSignedAmount\(item\) \{[\s\S]*String\(item\?\.direction \|\| ""\) === "out" \? -Math\.abs\(amount\) : amount[\s\S]*render: \(item\) => formatMoney\(getTransactionSignedAmount\(item\)\)[\s\S]*exportValue: \(item\) => getTransactionSignedAmount\(item\)/s,
    "Transaction table and export should show cash-out refunds as negative amounts."
  );
  assert.match(
    styles,
    /\.finance-transactions-table :is\(th, td\)\.finance-transactions-col-status \{[\s\S]*text-align: center;/s,
    "Transaction status column should be centered."
  );

  assert.match(
    styles,
    /\.finance-transactions-table \{\s*width: max-content;\s*min-width: 100%;\s*table-layout: auto;\s*\}[\s\S]*\.finance-transactions-col-cashier \{\s*min-width: 160px;\s*\}[\s\S]*\.finance-transactions-table :is\(th, td\) \{[\s\S]*min-width: max-content;[\s\S]*overflow: visible;[\s\S]*text-overflow: clip;/,
    "Transaction table columns should size from visible content instead of clipping cashier names."
  );

  assert.match(
    styles,
    /#financeTransactionsPanel \.finance-transaction-void-btn \.services-settings-trash-icon \{[\s\S]*width: 12px;[\s\S]*max-width: 12px;[\s\S]*height: 12px;[\s\S]*max-height: 12px;[\s\S]*\}[\s\S]*#financeTransactionsPanel \.finance-transaction-void-btn \.services-settings-trash-icon::before \{[\s\S]*left: -1\.4px;[\s\S]*width: calc\(100% \+ 2\.8px\);[\s\S]*max-width: calc\(100% \+ 2\.8px\);/,
    "Transaction status trash icon should keep compact fixed lid and body lines."
  );

  assert.match(
    styles,
    /#financeTransactionsPanel \.finance-transactions-table \.finance-transaction-void-btn \{[\s\S]*width: 30px;[\s\S]*min-width: 30px;[\s\S]*max-width: 30px;[\s\S]*height: 30px;[\s\S]*max-height: 30px;[\s\S]*padding: 0;/,
    "Transaction status void button should override generic table action sizing."
  );
});

test("finance transaction filters capture input values before state updaters", async () => {
  const source = await readFile(
    new URL("../src/pages/profile/panels/FinanceTransactionsPanel.jsx", import.meta.url),
    "utf8"
  );

  for (const field of ["dateFrom", "dateTo", "ticketNumber"]) {
    assert.match(
      source,
      new RegExp(
        `value=\\{filters\\.${field}\\}[\\s\\S]*?onChange=\\{\\(event\\) => \\{[\\s\\S]*?const value = event\\.currentTarget\\.value;[\\s\\S]*?${field}: value`
      ),
      `${field} filter should read the input value before calling setFilters.`
    );
  }

  assert.doesNotMatch(
    source,
    /setFilters\(\(current\) => \(\{ \.\.\.current, (?:dateFrom|dateTo|ticketNumber): event\.currentTarget\.value \}\)\)/,
    "Filter state updaters should not read from React events after the handler returns."
  );
});
