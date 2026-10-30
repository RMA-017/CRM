import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/modules/telegram-bot/telegram-bot.service.js", import.meta.url), "utf8");
const start = source.indexOf("async function sendAndLogParentMessage(");
const end = source.indexOf("async function getRawSettingsRow(", start);
const buildSender = new Function("pool", "sendTelegramMessage", "logParentMessage",
  `${source.slice(start, end)}; return sendAndLogParentMessage;`);

for (const dedupeKey of ["reminder_24h:12:1", ""]) {
  test(`stale reminder skips sending and logging (${dedupeKey || "without dedupe"})`, async () => {
    const events = [];
    const send = buildSender(
      { query: async () => { events.push("dedupe"); return { rows: [] }; } },
      async () => events.push("send"),
      async () => { events.push("log"); return { inserted: true }; }
    );
    const result = await send({ settings: {}, parent: { id: 1, organizationId: 2 },
      dedupeKey, beforeSend: async () => { events.push("recheck"); return false; } });
    assert.deepEqual(result, { skipped: true });
    assert.deepEqual(events, dedupeKey ? ["dedupe", "recheck"] : ["recheck"]);
  });
}

test("active reminder is rechecked after dedupe and before sending; failed sends remain retryable", async () => {
  const events = [];
  let fail = true;
  const send = buildSender(
    { query: async () => { events.push("dedupe"); return { rows: [] }; } },
    async () => { events.push("send"); if (fail) throw new Error("Network error"); },
    async () => { events.push("log"); return { inserted: true }; }
  );
  const input = { settings: {}, parent: { id: 1, organizationId: 2 }, dedupeKey: "key",
    beforeSend: async () => { events.push("recheck"); return true; } };
  await assert.rejects(send(input), /Network error/);
  assert.deepEqual(events, ["dedupe", "recheck", "send"]);
  events.length = 0;
  fail = false;
  assert.deepEqual(await send(input), { skipped: false });
  assert.deepEqual(events, ["dedupe", "recheck", "send", "log"]);
});

test("reminder recheck excludes cancelled, deleted, rescheduled and unlinked appointments", () => {
  const reminder = source.slice(source.indexOf("async function sendReminderRow("), source.indexOf("async function sendReminderRows("));
  assert.match(reminder, /return sendAndLogParentMessage/);
  assert.match(reminder, /beforeSend: async/);
  assert.match(reminder, /s\.status IN \('pending', 'confirmed'\)/);
  assert.match(reminder, /pa\.is_active = TRUE/);
  assert.match(reminder, /s\.client_id = \$4 AND s\.specialist_id = \$5/);
  assert.match(reminder, /s\.appointment_date = \$6::date AND s\.start_time = \$7::time/);
  assert.match(reminder, /return rows\.length > 0/);
});
