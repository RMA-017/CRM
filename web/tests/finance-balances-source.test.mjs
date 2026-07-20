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
    /const ledgerColumns = \[[\s\S]*id: "operationDate"[\s\S]*id: "operationNumber"[\s\S]*id: "action"[\s\S]*id: "ticketNumber"[\s\S]*id: "specialistName"[\s\S]*id: "serviceName"[\s\S]*id: "paymentMethod"[\s\S]*id: "cashIn"[\s\S]*id: "cashOut"[\s\S]*id: "depositChange"[\s\S]*id: "depositBalance"[\s\S]*id: "cashier"[\s\S]*id: "status"[\s\S]*id: "note"/s,
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

  assert.doesNotMatch(
    balancesPanelSource,
    /financeClientLedgerColumnsModal|toggleLedgerColumnVisibility|setLedgerColumnsOpen|aria-label=\{translate\("Table columns"\)\}/,
    "Client ledger modal should not expose a table columns selector."
  );

  assert.match(
    balancesPanelSource,
    /clientLedgerTableMinWidth = Math\.max\([\s\S]*ledgerColumns\.reduce\(\(sum, column\) => sum \+[\s\S]*column\.widthPx[\s\S]*style=\{\{ minWidth: `\$\{clientLedgerTableMinWidth\}px` \}\}/s,
    "Client ledger table spacing should follow the fixed ledger columns."
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
    /id: "specialistName"[\s\S]*label: "Specialist"[\s\S]*className: "finance-client-ledger-col-specialist"[\s\S]*render: \(item\) => item\.specialistName \|\| "-"/s,
    "Client ledger specialist column should render after the ticket number."
  );

  assert.match(
    balancesPanelSource,
    /exportClientLedger[\s\S]*buildExportFilename\(`finance-client-\$\{clientId \|\| "ledger"\}-transactions`\)[\s\S]*ledgerColumns\.map\(\(column\) => translate\(column\.label\)\)[\s\S]*ledgerColumns\.map\(\(column\) => column\.exportValue\(item\)\)/s,
    "Client ledger export should follow the fixed ledger columns."
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
    /if \(isRefund && amountUzs > toIntegerAmount\(depositModal\.item\.depositUzs\)\) \{[\s\S]*window\.alert\?\.\(translate\("Refund amount exceeds client deposit\."\)\);[\s\S]*return;[\s\S]*\}/s,
    "Refund submit should alert and stop when the amount exceeds the client's deposit."
  );

  assert.doesNotMatch(
    balancesPanelSource,
    /const nextValue = rawValue && isDepositRefund && amount > maxAmount|max=\{isDepositRefund \? toIntegerAmount\(depositModalClient\?\.depositUzs\) : undefined\}/,
    "Refund amount input should not silently clamp over-limit values before the alert can run."
  );

  assert.match(
    balancesPanelSource,
    /onChange=\{\(event\) => \{\s*const value = event\.currentTarget\.value;\s*setDepositForm\(\(current\) => \(\{ \.\.\.current, amountUzs: value \}\)\);/s,
    "Deposit amount input should read the value before the state updater runs."
  );

  assert.doesNotMatch(
    balancesPanelSource,
    /depositModalClientIdLabel|finance-modal-ticket-number">\{depositModalClientIdLabel\}/,
    "Deposit operation modal should not show a ticket number/client ID badge in the header."
  );

  assert.match(
    balancesPanelSource,
    /translate\(isDepositRefund \? "Refund" : "Top up"\)/,
    "Deposit operation submit buttons should use short labels."
  );

  assert.match(
    balancesPanelSource,
    /function getDepositSourceRows\(items, currentDepositUzs\) \{[\s\S]*remainingDepositUzs = Math\.max\(0, toIntegerAmount\(currentDepositUzs\)\)[\s\S]*Math\.min\(toIntegerAmount\(item\.depositChangeUzs\), remainingDepositUzs\)[\s\S]*filter\(\(item\) => item\.amountUzs > 0\)/s,
    "Refund modal should cap deposit source rows to the client's current actual deposit."
  );

  assert.match(
    balancesPanelSource,
    /getDepositSourceRows\(data\?\.items, data\?\.summary\?\.depositUzs \?\? currentDepositUzs\)[\s\S]*const loaded = await loadDepositSources\(item\?\.clientId, item\?\.depositUzs\);[\s\S]*if \(!loaded\) return;[\s\S]*setDepositModal\(\{ type, item \}\);/s,
    "Refund modal should load current deposit source rows before opening."
  );

  assert.match(
    balancesPanelSource,
    /function formatMoney\(value\) \{[\s\S]*return amount !== 0 \? amount\.toLocaleString\("ru-RU"\) : "-";/s,
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

  assert.doesNotMatch(
    styles,
    /financeClientLedgerColumnsModal/,
    "Client ledger columns modal styles should be removed with the selector."
  );

  assert.match(
    styles,
    /\.finance-balances-col-debt \{\s*width: 220px;\s*\}[\s\S]*\.finance-balances-col-deposit \{\s*width: 220px;\s*\}[\s\S]*\.finance-balances-col-actions \{\s*width: 154px;\s*\}[\s\S]*\.finance-balances-row-actions \{[\s\S]*gap: 6px;[\s\S]*width: 100%;[\s\S]*\.finance-balances-panel \.finance-balance-action-btn \{[\s\S]*flex-grow: 0;[\s\S]*flex-shrink: 0;[\s\S]*width: 30px;[\s\S]*max-width: 30px;[\s\S]*height: 30px;[\s\S]*max-height: 30px;[\s\S]*#financeBalancesPanel\.finance-panel-shell\.finance-balances-panel \.all-users-table \.finance-balance-action-btn \{[\s\S]*flex: 0 0 30px;[\s\S]*inline-size: 30px;[\s\S]*block-size: 30px;[\s\S]*aspect-ratio: 1 \/ 1;/,
    "Balances debt and deposit columns should stay 220px while action column is compact and action buttons stay locked to 30px."
  );

  assert.match(
    styles,
    /\.finance-balance-action-icon \{[\s\S]*display: grid;[\s\S]*place-items: center;[\s\S]*\.finance-balance-action-icon-topup::before \{[\s\S]*top: 50%;[\s\S]*left: 50%;[\s\S]*transform: translate\(-50%, -50%\);[\s\S]*\.finance-balance-action-icon-refund::before \{[\s\S]*content: "↩";[\s\S]*top: 50%;[\s\S]*left: 50%;[\s\S]*transform: translate\(-50%, -50%\);[\s\S]*\.finance-balance-action-icon-refund::after \{[\s\S]*display: none;/,
    "Balance refund action should use a compact return arrow icon."
  );

  assert.match(
    styles,
    /#financeDepositOperationModal \.finance-deposit-operation-fields \{[\s\S]*padding: 0;[\s\S]*#financeDepositOperationModal \.all-users-edit-fields\.finance-deposit-operation-fields \{[\s\S]*padding: 0 !important;[\s\S]*padding-inline: 0 !important;[\s\S]*scrollbar-gutter: auto;/,
    "Deposit operation fields should not add inner padding."
  );

  assert.match(
    styles,
    /#financeDepositOperationModal\.finance-deposit-operation-modal\.is-topup \{\s*width: min\(874px,[\s\S]*#financeDepositOperationModal\.finance-deposit-operation-modal\.is-refund \{\s*width: min\(874px,[\s\S]*height: auto;[\s\S]*max-height: min\(520px,/,
    "Deposit operation modals should share the same width while refund stays compact vertically."
  );

  assert.match(
    styles,
    /#financeDepositOperationModal \.finance-deposit-source-list \{[\s\S]*height: auto;[\s\S]*max-height: 96px;/,
    "Refund deposit history list should not keep a fixed empty height after rows load."
  );

  assert.doesNotMatch(
    styles,
    /#financeDepositOperationModal\.is-refund \.auth-form \{\s*height: 100%;\s*\}/,
    "Refund modal form should not stretch to a fixed tall height."
  );

  assert.match(
    styles,
    /#financeDepositOperationModal:is\(\.is-topup, \.is-refund\) \.edit-actions \.btn \{\s*width: 72px;\s*min-width: 72px;\s*max-width: 72px;/,
    "Deposit top-up and refund modal buttons should stay compact at 72px."
  );
});
