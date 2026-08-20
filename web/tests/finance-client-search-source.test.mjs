import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("finance client selectors show client IDs in search results", async () => {
  const [
    cashierSource,
    ticketsSource,
    transactionsSource,
    dailyCashSource,
    reportsSource,
    discountsSource
  ] = await Promise.all([
    readFile(new URL("../src/pages/profile/panels/FinanceCashierPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/FinanceTicketsPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/FinanceTransactionsPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/FinanceDailyCashPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/FinanceReportsPanel.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/profile/panels/FinanceClientDiscountsPanel.jsx", import.meta.url), "utf8")
  ]);

  assert.match(
    cashierSource,
    /label: \[`#\$\{item\.id\}`, item\.fullName, item\.phone\]\.filter\(Boolean\)\.join\(" - "\)/,
    "Cashier manual ticket client search results should include the client ID."
  );

  for (const [name, source] of [
    ["tickets", ticketsSource],
    ["transactions", transactionsSource],
    ["daily cash", dailyCashSource],
    ["reports", reportsSource]
  ]) {
    assert.match(
      source,
      /function makeClientOption\(item\)[\s\S]*const label = \[`#\$\{id\}`, fullName, phone\]\.filter\(Boolean\)\.join\(" - "\);/s,
      `Finance ${name} client selector should include the client ID in option labels.`
    );
  }

  assert.match(
    discountsSource,
    /function normalizeClientLabel\(client\)[\s\S]*return \[id \? `#\$\{id\}` : "", name, phone\]\.filter\(Boolean\)\.join/s,
    "Finance client discounts search results should include the client ID."
  );
});
