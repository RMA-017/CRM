import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hookSource = await readFile(
  new URL("../src/lib/use-escape-key.js", import.meta.url),
  "utf8"
);

const financePanelSources = await Promise.all([
  "FinanceCashierPanel.jsx",
  "FinanceTicketsPanel.jsx",
  "FinanceTransactionsPanel.jsx",
  "FinanceReportsPanel.jsx",
  "FinanceDailyCashPanel.jsx",
  "FinanceBalancesPanel.jsx",
  "FinanceSettingsPanel.jsx"
].map(async (fileName) => [
  fileName,
  await readFile(new URL(`../src/pages/profile/panels/${fileName}`, import.meta.url), "utf8")
]));

test("finance modals close from the Escape key", () => {
  assert.match(
    hookSource,
    /function handleKeyDown\(event\) \{[\s\S]*event\.key !== "Escape"[\s\S]*onEscapeRef\.current\?\.\(event\)[\s\S]*window\.addEventListener\("keydown", handleKeyDown\)/s,
    "The shared Escape hook should close active UI only when Escape is pressed."
  );

  for (const [fileName, source] of financePanelSources) {
    assert.match(
      source,
      /import \{ useEscapeKey \} from "\.\.\/\.\.\/\.\.\/lib\/use-escape-key\.js";[\s\S]*useEscapeKey\(/s,
      `${fileName} should wire its finance modals to the shared Escape hook.`
    );
  }
});

test("finance modal Escape handlers use the same close paths as cancel controls", () => {
  const byFile = Object.fromEntries(financePanelSources);

  assert.match(
    byFile["FinanceCashierPanel.jsx"],
    /useEscapeKey\(Boolean\(batchPaymentTickets\.length > 0 \|\| appointmentTicketSource \|\| manualModalOpen\)[\s\S]*closeBatchPaymentModal\(\)[\s\S]*closeAppointmentTicketModal\(\)[\s\S]*closeManualModal\(\)/s,
    "Cashier ticket, payment, and manual ticket modals should close on Escape."
  );
  assert.match(
    byFile["FinanceTicketsPanel.jsx"],
    /useEscapeKey\(Boolean\(editTicket \|\| historyTicket \|\| filtersOpen \|\| columnsOpen\)[\s\S]*closeEditTicket\(\)[\s\S]*closeHistory\(\)[\s\S]*closeFilters\(\)[\s\S]*closeColumns\(\)/s,
    "Ticket edit, history, filter, and columns modals should close on Escape."
  );
  assert.match(
    byFile["FinanceBalancesPanel.jsx"],
    /useEscapeKey\(Boolean\(depositModal \|\| ledgerColumnsOpen \|\| ledgerClient\)[\s\S]*closeDepositModal\(\)[\s\S]*closeLedgerColumns\(\)[\s\S]*closeClientLedger\(\)/s,
    "Balance deposit, ledger columns, and ledger modals should close on Escape."
  );
});
