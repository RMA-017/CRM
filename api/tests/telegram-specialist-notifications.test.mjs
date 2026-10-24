import assert from "node:assert/strict";
import test from "node:test";
import { formatSpecialistNotification, runSpecialistNotificationSweep, sendSpecialistNotification } from "../src/modules/telegram-bot/telegram-specialist-notifications.service.js";

function fixture({ account = true, attempts = 1, fail = null, count = 1 } = {}) {
  const queries = [], sent = [];
  const db = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.startsWith("WITH candidates")) return { rows: Array.from({ length: count }, (_, i) => ({
      id: i + 1, notification_id: 10 + i, organization_id: 7, telegram_user_id: 101 + i, phone: "998901234567", attempts
    })) };
    if (sql.includes("SELECT a.bot_token")) return { rows: account ? [{ bot_token: "test", chat_id: params[2], message: "Own notification" }] : [] };
    return { rows: [] };
  } };
  const send = async (message) => { sent.push(message); if (fail) throw fail; };
  return { db, send, queries, sent };
}

test("specialist notifications deliver separately and acknowledge successful deliveries", async () => {
  const f = fixture({ count: 5 });
  assert.equal(await runSpecialistNotificationSweep(f), 5);
  assert.deepEqual(f.sent.map((s) => s.chat_id).sort(), [101, 102, 103, 104, 105]);
  assert.equal(f.queries.filter((q) => q.sql.includes("status = 'sent'")).length, 5);
  const access = f.queries.find((q) => q.sql.includes("SELECT a.bot_token"));
  assert.deepEqual(access.params, [10, 7, 101, "998901234567"]);
  assert.match(access.sql, /n.user_id = a.user_id/);
  assert.match(f.queries[0].sql, /SKIP LOCKED/);
  assert.match(f.queries[0].sql, /earlier.telegram_user_id = d.telegram_user_id/);
});

test("stopped, unlinked or revoked accounts are skipped without sending", async () => {
  const f = fixture({ account: false });
  await runSpecialistNotificationSweep(f);
  assert.equal(f.sent.length, 0);
  assert.deepEqual(f.queries.at(-1).params, [1, "skipped", 1]);
});

test("transient and rate-limited delivery failures retry, blocked bots and exhausted retries stop", async () => {
  for (const [fail, attempts, expected, delay] of [
    [new Error("network"), 1, "pending", 10],
    [{ telegramCode: 429, retryAfter: 120 }, 2, "pending", 120],
    [{ telegramCode: 403 }, 1, "failed", 10],
    [new Error("network"), 8, "failed", 1280]
  ]) {
    const f = fixture({ fail, attempts });
    await runSpecialistNotificationSweep(f);
    assert.deepEqual(f.queries.at(-1).params, [1, expected, delay, attempts]);
    assert.ok(!f.queries.some((q) => q.sql.includes("status = 'sent'")));
  }
  const exhausted = fixture({ attempts: 9 });
  await runSpecialistNotificationSweep(exhausted);
  assert.equal(exhausted.sent.length, 0);
});

test("Telegram sends plain standalone notification without changing any menu", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    assert.match(url, /\/sendMessage$/);
    assert.deepEqual(JSON.parse(options.body), { chat_id: 101, text: "Own notification", disable_web_page_preview: true });
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  };
  await sendSpecialistNotification({ bot_token: "test", chat_id: 101, message: "Own notification" });
  globalThis.fetch = async () => ({ ok: false, status: 429,
    json: async () => ({ ok: false, error_code: 429, parameters: { retry_after: 30 } }) });
  await assert.rejects(() => sendSpecialistNotification({ bot_token: "secret", chat_id: 101, message: "test" }),
    (error) => error.telegramCode === 429 && error.retryAfter === 30 && !error.message.includes("secret"));
});

test("known notifications use bot language and lesson details; other event types retain their message", () => {
  const account = { event_type: "schedule-created", user_id: 8, message: "Appointment created",
    payload: { data: { items: [{ specialistId: 9, clientName: "Other child" },
      { specialistId: 8, clientName: "Own child", specialistName: "Specialist", appointmentDate: "2026-10-24", startTime: "14:00:00" }] } } };
  assert.equal(formatSpecialistNotification({ ...account, language: "ru" }),
    "Занятие создано\nOwn child\nSpecialist\n24.10.2026 14:00");
  assert.equal(formatSpecialistNotification({ ...account, language: "uz" }),
    "Dars yaratildi\nOwn child\nSpecialist\n24.10.2026 14:00");
  assert.equal(formatSpecialistNotification({ event_type: "another-event", message: "Original notification" }), "Original notification");
});
