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
    /function isTransactionReversed\(item\)[\s\S]*metadata\.reversalTransactionId[\s\S]*getTransactionStatusLabel\(translate, item\)[\s\S]*translate\("Corrected"\)[\s\S]*const reversalReason = String\(metadata\.reversalReason/s,
    "Client ledger should show corrected closed-session transactions with their reversal reason."
  );

  assert.match(
    balancesPanelSource,
    /finance-client-ledger-title">\{translate\("Client Transactions"\)\}[\s\S]*finance-client-ledger-client-name[\s\S]*ledgerData\?\.client\?\.clientName \|\| ledgerClient\.clientName/s,
    "Client ledger modal should keep the title left and the client name separate."
  );

  assert.match(
    balancesPanelSource,
    /finance-client-ledger-head-actions[\s\S]*aria-label=\{translate\("Export Excel"\)\}[\s\S]*finance-client-ledger-close-btn[\s\S]*aria-label=\{translate\("Close client transactions modal"\)\}[\s\S]*×/s,
    "Client ledger modal should keep the close button in the top-right actions."
  );

  assert.doesNotMatch(
    balancesPanelSource,
    /<button type="button" className="btn btn-secondary" onClick=\{closeClientLedger\}>\{translate\("Close"\)\}<\/button>/,
    "Client ledger modal should not keep a duplicate bottom close button."
  );

  assert.match(
    balancesPanelSource,
    /financeClientLedgerColumnsModal[\s\S]*Table columns[\s\S]*toggleLedgerColumnVisibility/s,
    "Client ledger modal should expose a columns modal."
  );

  assert.match(
    balancesPanelSource,
    /visibleLedgerTableMinWidth = Math\.max\([\s\S]*visibleLedgerColumns\.reduce\(\(sum, column\) => sum \+[\s\S]*column\.widthPx[\s\S]*style=\{\{ minWidth: `\$\{visibleLedgerTableMinWidth\}px` \}\}/s,
    "Client ledger table spacing should follow the currently visible columns."
  );

  assert.match(
    balancesPanelSource,
    /const headClassName = \[[\s\S]*column\.className[\s\S]*className=\{headClassName \|\| undefined\}[\s\S]*const mergedCellClassName = \[column\.className, cellClassName\][\s\S]*className=\{mergedCellClassName \|\| undefined\}/s,
    "Client ledger table should apply column sizing classes directly to visible header and body cells."
  );

  assert.match(
    balancesPanelSource,
    /id: "ticketNumber"[\s\S]*className: "finance-client-ledger-col-ticket"[\s\S]*widthPx: 124/s,
    "Client ledger ticket number column should fit the translated header."
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

  assert.match(
    balancesPanelSource,
    /finance-balances-col-actions[\s\S]*translate\("Action"\)[\s\S]*openDepositModal\("topup", item\)[\s\S]*openDepositModal\("refund", item\)/s,
    "Balances table should expose a compact action column for deposit top-up and money refund."
  );

  assert.match(
    balancesPanelSource,
    /\/api\/finance\/client-balances\/\$\{isRefund \? "refund" : "deposit"\}[\s\S]*paymentMethodId[\s\S]*amountUzs[\s\S]*reason: isRefund \? reason : undefined/s,
    "Balances deposit actions should call explicit top-up/refund endpoints with payment method, amount and refund reason."
  );

  assert.match(
    balancesPanelSource,
    /function getDepositSourceRows\(items\)[\s\S]*depositChangeUzs[\s\S]*Deposit income history[\s\S]*depositSourceRows\.length > 0/s,
    "Refund modal should show how the client's deposit was funded before cashier chooses the refund method."
  );

  assert.match(
    balancesPanelSource,
    /function formatMoney\(value\) \{[\s\S]*return amount !== 0 \? `\$\{amount\.toLocaleString\("ru-RU"\)\} UZS` : "-";/s,
    "Balances should not hide a negative deposit if historical data is already inconsistent."
  );

  assert.match(
    styles,
    /#financeClientLedgerModal\.finance-client-ledger-modal[\s\S]*width: min\(1380px,[\s\S]*height: min\(780px, calc\(100dvh - 24px\)\);[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);/s,
    "Client ledger modal should have a wide, scannable layout."
  );

  assert.doesNotMatch(
    styles,
    /\.finance-client-ledger-table \{[\s\S]*min-width: 1680px/s,
    "Client ledger table should not keep a static width after columns are hidden."
  );

  assert.match(
    styles,
    /\.finance-client-ledger-table \{\s*width: max-content;\s*min-width: 100%;\s*table-layout: auto;\s*\}[\s\S]*#financeClientLedgerModal \.finance-client-ledger-table :is\(th, td\) \{[\s\S]*min-width: max-content;[\s\S]*overflow: visible;[\s\S]*text-overflow: clip;/,
    "Client ledger columns should size automatically from their visible content instead of clipping cashier names."
  );

  assert.match(
    styles,
    /\.finance-client-ledger-table-scroll \{\s*height: 100%;\s*min-height: 0;\s*max-height: none;\s*overflow-x: auto;\s*overflow-y: auto;\s*\}/,
    "Client ledger table should keep a stable modal height and scroll inside the table area."
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
