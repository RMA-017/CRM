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
    /item\.status === "voided"[\s\S]*!canPayFinanceCashier \? \([\s\S]*finance-transaction-status-active[\s\S]*finance-transaction-void-btn/s,
    "Rows should render an active status instead of the void button when the user cannot pay cashier transactions."
  );

  assert.match(
    transactionsPanelSource,
    /const openVoidTransaction = \(item\) => \{[\s\S]*if \(!canPayFinanceCashier \|\| !item \|\| item\.status === "voided" \|\| voidingId\) return;/s,
    "Stale or manual clicks should also be blocked before opening the void modal."
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
});
