import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/modules/finance/finance.service.js", import.meta.url), "utf8");
const start = source.indexOf("async function updateTicketStatus(");
const end = source.indexOf("export async function payFinanceTicket(", start);
const build = new Function("pool", "parsePositiveInteger", "getTicketById", "getTicketPaidAmount",
  "reverseClientDiscountUsagesForTicket", "getTicketHistorySnapshot", "insertHistory",
  `${source.slice(start, end)}; return updateTicketStatus;`);

for (const [label, balance, allowed] of [
  ["no payments", 0, true],
  ["two reversed deposit payments (ticket 12393)", 4500000 - 4500000 + 4500000 - 4500000, true],
  ["partial payment", 100000, false],
  ["full payment", 7500000, false],
  ["unsettled negative balance", -100, false]
]) {
  test(`ticket void: ${label}`, async () => {
    const queries = [];
    let discountsReversed = false;
    let historyWritten = false;
    let released = false;
    const db = {
      async query(sql) { queries.push(sql); return { rows: [{ id: 2426, status: "voided" }] }; },
      release() { released = true; }
    };
    const run = build(
      { connect: async () => db }, Number,
      async (_db, options) => { assert.equal(options.forUpdate, true); return { status: "issued" }; },
      async () => balance,
      async () => { discountsReversed = true; },
      async () => ({}),
      async () => { historyWritten = true; }
    );
    const result = run({ organizationId: 2, id: 2426, status: "voided", action: "voided", reason: "Cancelled", actorUserId: 1 });
    if (allowed) {
      assert.equal((await result).status, "voided");
      assert.equal(queries.at(-1), "COMMIT");
    } else {
      await assert.rejects(result, /Tickets with payments cannot be deleted/);
      assert.equal(queries.at(-1), "ROLLBACK");
    }
    assert.equal(discountsReversed, allowed);
    assert.equal(historyWritten, allowed);
    assert.equal(released, true);
    assert.equal(queries.some(sql => /DELETE|UPDATE finance_transactions/.test(sql)), false);
    assert.equal(queries.some(sql => /UPDATE finance_tickets/.test(sql)), allowed);
  });
}
