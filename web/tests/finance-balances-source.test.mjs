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
    /DEFAULT_FINANCE_CLIENT_LEDGER_COLUMN_IDS[\s\S]*operationDate[\s\S]*operationNumber[\s\S]*action[\s\S]*ticketNumber[\s\S]*serviceName[\s\S]*paymentMethod[\s\S]*cashIn[\s\S]*cashOut[\s\S]*depositChange[\s\S]*depositBalance[\s\S]*cashier[\s\S]*status[\s\S]*note/s,
    "Client ledger modal should show detailed cash-flow columns."
  );

  assert.match(
    balancesPanelSource,
    /label: "Operation Number"[\s\S]*render: \(item\) => item\.id \? `#\$\{item\.id\}` : "-"[\s\S]*label: "Note"[\s\S]*getClientLedgerNote\(translate, item\)/s,
    "Client ledger modal should include operation numbers and cancellation-aware notes."
  );

  assert.match(
    balancesPanelSource,
    /financeClientLedgerColumnsModal[\s\S]*Table columns[\s\S]*toggleLedgerColumnVisibility/s,
    "Client ledger modal should expose a columns modal."
  );

  assert.match(
    balancesPanelSource,
    /exportClientLedger[\s\S]*buildExportFilename\(`finance-client-\$\{clientId \|\| "ledger"\}-transactions`\)[\s\S]*visibleLedgerColumns\.map\(\(column\) => translate\(column\.label\)\)[\s\S]*visibleLedgerColumns\.map\(\(column\) => column\.exportValue\(item\)\)/s,
    "Client ledger export should follow the visible columns."
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
    /#financeClientLedgerModal\.finance-client-ledger-modal[\s\S]*width: min\(1380px,[\s\S]*\.finance-client-ledger-table[\s\S]*min-width: 1680px/s,
    "Client ledger modal should have a wide, scannable layout."
  );

  assert.match(
    styles,
    /#financeClientLedgerColumnsModal\.finance-client-ledger-columns-modal[\s\S]*width: min\(420px,[\s\S]*#financeClientLedgerColumnsModal \.finance-ticket-column-option[\s\S]*min-height: 26px/s,
    "Client ledger columns modal should reuse the standard finance columns styling."
  );

  assert.match(
    styles,
    /\.finance-panel-shell \.finance-balances-table :is\(th:nth-child\(5\), td:nth-child\(5\)\) \{\s*padding-right: 44px;\s*\}/,
    "Balances deposit header and values should keep right-side spacing inside finance panels."
  );
});
