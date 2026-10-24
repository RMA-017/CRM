import assert from "node:assert/strict";
import test from "node:test";
import { setTelegramTherapyStatus } from "../src/modules/telegram-bot/telegram-therapy.service.js";
import { botToday, shiftBotDate } from "../src/modules/telegram-bot/telegram-calendar.js";

function fixture(status = "pending", { missing = false, locked = false } = {}) {
  const queries = [], updates = [];
  const item = { status, start_time: "14:00:00", end_time: "14:30:00", duration_minutes: 30,
    service_id: 42, service_name: "Therapy", service_price_uzs: "150000", note: "Keep note" };
  const db = { query: async (sql, params) => {
    queries.push({ sql, params });
    return { rows: sql.includes("finance_tickets") ? (locked ? [{ id: 1 }] : []) : missing ? [] : [item] };
  } };
  const args = { organizationId: 7, specialistId: 8, appointmentId: 20, clientId: 4,
    date: botToday(), confirmed: true, db };
  return { args, queries, updates, update: async (value) => { updates.push(value); return [{ id: 20 }]; } };
}

test("therapy confirmation and undo preserve appointment billing, notes and recurrence defaults", async () => {
  for (const confirmed of [true, false]) {
    const f = fixture(confirmed ? "pending" : "confirmed");
    assert.equal(await setTelegramTherapyStatus({ ...f.args, confirmed }, f.update), true);
    assert.deepEqual(f.queries[0].params, [7, 20, 8, 4, botToday()]);
    assert.match(f.queries[0].sql, /FOR UPDATE/);
    const update = f.updates[0];
    assert.equal(update.status, confirmed ? "confirmed" : "pending");
    assert.equal(update.actorUserId, 8);
    assert.equal(update.serviceId, 42);
    assert.equal(update.servicePriceUzs, "150000");
    assert.equal(update.note, "Keep note");
    assert.equal(update.activateClient, false);
    assert.equal(update.clearRepeatMeta, undefined);
    assert.equal(update.db, f.args.db);
  }
});

test("stale, cancelled, no-show, already confirmed and finance-locked therapy buttons cannot update appointments", async () => {
  for (const [status, options] of [["cancelled", {}], ["no-show", {}], ["confirmed", {}],
    ["pending", { missing: true }], ["pending", { locked: true }]]) {
    const f = fixture(status, options);
    assert.equal(await setTelegramTherapyStatus(f.args, f.update), false);
    assert.equal(f.updates.length, 0);
  }
});

test("future and invalid therapy dates never write", async () => {
  for (const date of [shiftBotDate(botToday(), 1), "2026-02-30"]) {
    const f = fixture();
    assert.equal(await setTelegramTherapyStatus({ ...f.args, date }, f.update), false);
    assert.equal(f.queries.length, 0);
  }
});
