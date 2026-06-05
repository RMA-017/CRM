import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const balancesPanelSource = await readFile(
  new URL("../src/pages/profile/panels/FinanceBalancesPanel.jsx", import.meta.url),
  "utf8"
);

const styles = await readFile(
  new URL("../src/css/components/components.css", import.meta.url),
  "utf8"
);

test("client balance rows open a read-only client transaction ledger", () => {
  assert.match(
    balancesPanelSource,
    /\/api\/finance\/client-balances\/\$\{clientId\}\/transactions/s,
    "Balances should fetch all client transactions from the client ledger endpoint."
  );

  assert.match(
    balancesPanelSource,
    /onDoubleClick=\{\(\) => openClientLedger\(item\)\}/s,
    "Balances rows should open the client ledger with a double-click."
  );

  assert.doesNotMatch(
    balancesPanelSource,
    /finance-client-ledger-summary|ledgerSummary|Ticket Paid|Deposit Used/,
    "Client ledger modal should stay focused on transaction rows without a duplicate summary strip."
  );

  assert.match(
    balancesPanelSource,
    /finance-client-ledger-table[\s\S]*Created At[\s\S]*Action[\s\S]*Ticket Number[\s\S]*Service Name[\s\S]*Payment Method[\s\S]*Deposit \+\/-[\s\S]*Deposit Balance[\s\S]*Cashier[\s\S]*Note/s,
    "Client ledger modal should show detailed transaction rows."
  );

  assert.match(
    balancesPanelSource,
    /onChange=\{\(event\) => \{[\s\S]*const value = event\.currentTarget\.value;[\s\S]*setFilters\(\(current\) => \(\{ \.\.\.current, client: value \}\)\);[\s\S]*\}\}/s,
    "Balances search should read the input value before the state updater runs."
  );

  assert.doesNotMatch(
    balancesPanelSource,
    /client-balances\/deposit|pay-from-deposit|openOperation|submitOperation|openTicketPayment|submitTicketPayment/,
    "Balances page should not expose direct balance mutation actions."
  );

  assert.match(
    balancesPanelSource,
    /function formatMoney\(value\) \{[\s\S]*return amount !== 0 \? `\$\{amount\.toLocaleString\("ru-RU"\)\} UZS` : "-";/s,
    "Balances should not hide a negative deposit if historical data is already inconsistent."
  );

  assert.match(
    styles,
    /#financeClientLedgerModal\.finance-client-ledger-modal[\s\S]*width: min\(1180px,[\s\S]*\.finance-client-ledger-table[\s\S]*min-width: 1320px/s,
    "Client ledger modal should have a wide, scannable layout."
  );

  assert.match(
    styles,
    /\.finance-panel-shell \.finance-balances-table :is\(th:nth-child\(5\), td:nth-child\(5\)\) \{\s*padding-right: 44px;\s*\}/,
    "Balances deposit header and values should keep right-side spacing inside finance panels."
  );
});
