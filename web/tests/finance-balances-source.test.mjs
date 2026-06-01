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

  assert.match(
    balancesPanelSource,
    /id="financeClientLedgerModal"[\s\S]*Client Transactions[\s\S]*Debt[\s\S]*Deposit[\s\S]*Cash In[\s\S]*Cash Out[\s\S]*Ticket Paid[\s\S]*Deposit Used/s,
    "Client ledger modal should show quick summary fields for answering balance questions."
  );

  assert.match(
    balancesPanelSource,
    /finance-client-ledger-table[\s\S]*Created At[\s\S]*Action[\s\S]*Ticket Number[\s\S]*Payment Method[\s\S]*Deposit \+\/-[\s\S]*Deposit Balance[\s\S]*Cashier[\s\S]*Note/s,
    "Client ledger modal should show detailed transaction rows."
  );

  assert.doesNotMatch(
    balancesPanelSource,
    /client-balances\/deposit|pay-from-deposit|openOperation|submitOperation|openTicketPayment|submitTicketPayment/,
    "Balances page should not expose direct balance mutation actions."
  );

  assert.match(
    styles,
    /#financeClientLedgerModal\.finance-client-ledger-modal[\s\S]*width: min\(1180px,[\s\S]*\.finance-client-ledger-summary[\s\S]*grid-template-columns: repeat\(6,[\s\S]*\.finance-client-ledger-table[\s\S]*min-width: 1160px/s,
    "Client ledger modal should have a wide, scannable layout."
  );
});
