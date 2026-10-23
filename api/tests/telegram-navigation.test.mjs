import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import pool from "../src/config/db.js";
import { telegramWebhookRoutes } from "../src/modules/telegram-bot/telegram-bot.routes.js";
import { BOT_UI_TEXT, botToday, isBotDate, shiftBotDate, buildBotCalendar, buildBotDateNavigation, splitBotScreen } from "../src/modules/telegram-bot/telegram-calendar.js";
import { createTelegramNavigator, handleTelegramNavigation } from "../src/modules/telegram-bot/telegram-navigation.service.js";
import { telegramInteractionContext } from "../src/modules/telegram-bot/telegram-interaction-context.js";

const settings = { organizationId: 7, botToken: "test-token" };
const from = { id: 101, language_code: "uz" };
const chat = { id: 101, type: "private" };
const parent = { id: 10, isActive: true, phoneDigits: "998901234567", phoneNumber: "+998901234567", language: "uz" };

function setup({ state = {}, query = async () => ({ rows: [] }), telegram, adapters = {} } = {}) {
  const calls = [];
  const queries = [];
  let messageId = 40;
  const session = { language: "uz", contacts: {}, view: {}, keyboard_cleared: true, ...state };
  const api = async (token, method, payload) => {
    calls.push({ method, payload });
    if (telegram) return telegram(method, payload);
    return { message_id: method === "editMessageText" ? payload.message_id : ++messageId };
  };
  const db = { query: async (sql, params) => { queries.push({ sql, params }); return query(sql, params); } };
  const legacy = {
    getParent: async () => null, clearPending: async () => {}, children: async () => [], parentLanguage: async () => {},
    linkParent: async () => {}, day: async () => {}, callback: async () => {}, text: async () => {}, hasPending: async () => false,
    appointment: async () => ({ appointmentDate: "2026-10-23" }), ...adapters
  };
  const navigator = createTelegramNavigator({ settings, session, db, api, legacy, from, chat });
  return { navigator, session, calls, queries, db, api, legacy };
}

function callback(data) { return { callback_query: { data, id: "callback", from, message: { chat, message_id: 44 } } }; }
function contact(userId = 101) { return { message: { contact: { user_id: userId, phone_number: "+998901234567" }, from, chat } }; }

test("webhook requests a Telegram retry when processing fails instead of acknowledging lost work", async (t) => {
  const original = pool.query;
  pool.query = async () => { throw new Error("Database unavailable"); };
  const app = Fastify();
  await app.register(telegramWebhookRoutes);
  t.after(async () => { pool.query = original; await app.close(); });
  const failed = await app.inject({ method: "POST", url: "/webhook/7/test-secret", payload: { update_id: 1, message: { from, chat, text: "/start" } } });
  assert.equal(failed.statusCode, 503);
  assert.deepEqual(failed.json(), { ok: false });
  const ignored = await app.inject({ method: "POST", url: "/webhook/invalid/test-secret", payload: {} });
  assert.equal(ignored.statusCode, 200);
});

test("calendar handles leap years, rejects invalid dates, and exposes every day as a callback", () => {
  assert.equal(isBotDate("2028-02-29"), true);
  assert.equal(isBotDate("2026-02-29"), false);
  assert.equal(isBotDate("2026-13-01"), false);
  assert.equal(shiftBotDate("2028-02-28", 1), "2028-02-29");
  assert.equal(botToday(new Date("2026-10-22T20:00:00Z")), "2026-10-23");
  for (const language of ["uz", "ru"]) {
    const result = buildBotCalendar(language, "2028-02", "2028-02-29");
    const buttons = result.replyMarkup.inline_keyboard.flat();
    const days = buttons.filter((button) => button.callback_data.startsWith("ui:day:") && button.text !== BOT_UI_TEXT[language].back);
    assert.equal(days.length, 29);
    assert.ok(days.some((button) => button.callback_data === "ui:day:2028-02-29"));
    assert.ok(buttons.every((button) => Buffer.byteLength(button.callback_data) <= 64));
    assert.ok(result.replyMarkup.inline_keyboard.slice(1, -1).every((row) => row.length === 7));
  }
  assert.deepEqual(buildBotDateNavigation("ru", "2026-10-23")[0].map((button) => button.text), ["◀️", "📅", "▶️"]);
});

test("long screens paginate without breaking emoji or exceeding Telegram text limits", () => {
  const text = "👩‍🏫 Test\n".repeat(1200);
  const pages = splitBotScreen(text);
  assert.ok(pages.length > 1);
  assert.equal(pages.join(""), text);
  assert.ok(pages.every((page) => page.length <= 3800 && !/[\uD800-\uDBFF]$/.test(page)));
});

test("four role/menu buttons share one edited message across navigation", async () => {
  const { navigator, calls, session } = setup();
  await navigator.mainMenu();
  const firstId = session.ui_message_id;
  assert.deepEqual(calls[0].payload.reply_markup.inline_keyboard.map((row) => row[0].callback_data), ["ui:role:parent", "ui:role:caregiver", "ui:role:specialist", "ui:settings"]);
  await navigator.process(callback("ui:settings"));
  await navigator.process(callback("ui:home"));
  assert.equal(calls.filter((call) => call.method === "sendMessage").length, 1);
  assert.equal(calls.filter((call) => call.method === "editMessageText").length, 2);
  assert.equal(session.ui_message_id, firstId);
});

test("missing editable messages are replaced and the stale menu is cleaned up", async () => {
  const { navigator, calls, session } = setup({ state: { ui_message_id: 20 }, telegram: async (method) => {
    if (method === "editMessageText") throw new Error("Bad Request: message to edit not found");
    return { message_id: 30 };
  } });
  await navigator.mainMenu();
  assert.equal(session.ui_message_id, 30);
  assert.deepEqual(calls.map((call) => call.method), ["editMessageText", "sendMessage", "deleteMessage"]);
  assert.equal(calls[2].payload.message_id, 20);
});

test("unchanged messages do not create duplicates and transient API errors do not trigger a send", async () => {
  for (const [message, reject] of [["Bad Request: message is not modified", false], ["Too Many Requests: retry after 5", true]]) {
    const { navigator, calls } = setup({ state: { ui_message_id: 20 }, telegram: async () => { throw new Error(message); } });
    if (reject) await assert.rejects(navigator.mainMenu(), /Too Many/);
    else await navigator.mainMenu();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "editMessageText");
  }
});

test("caregiver contact verification rejects another person's contact and then links the real one", async () => {
  const { navigator, session, queries, calls } = setup({ query: async (sql) => {
    if (sql.includes("FROM caregivers")) return { rows: [{ id: 9, name: "Caregiver" }] };
    return { rows: [{ id: 4, name: "Child" }] };
  } });
  await navigator.process(callback("ui:role:caregiver"));
  assert.equal(session.awaiting_role, "caregiver");
  await navigator.process(contact(999));
  assert.equal(session.contacts.caregiver, undefined);
  assert.equal(queries.length, 0);
  await navigator.process(contact());
  assert.equal(session.contacts.caregiver, "+998901234567");
  assert.equal(session.active_role, "caregiver");
  assert.equal(session.awaiting_role, null);
  assert.equal(session.contact_prompt_id, null);
  assert.equal(session.view.kind, "children");
  assert.ok(calls.some((call) => call.payload.reply_markup?.remove_keyboard));
});

test("changing one role's contact leaves other roles untouched and revokes parent notifications", async () => {
  const { navigator, session, queries } = setup({ state: { contacts: { parent: "one", caregiver: "two", specialist: "three" } } });
  await navigator.process(callback("ui:contact:parent"));
  assert.deepEqual(session.contacts, { caregiver: "two", specialist: "three" });
  assert.equal(session.awaiting_role, "parent");
  assert.ok(queries.some(({ sql, params }) => sql.includes("is_active = FALSE") && params[0] === 7 && params[1] === 101));
});

test("unassigned caregiver children are denied on every day and cached text navigation", async () => {
  const { navigator, session, calls, queries } = setup({
    state: { active_role: "caregiver", contacts: { caregiver: "+998901234567" }, view: { kind: "school", clientId: 4, date: "2026-10-23", textPages: { pages: ["PRIVATE CHILD DATA"], rows: [] } } },
    query: async (sql) => sql.includes("FROM caregivers") ? { rows: [{ id: 9, name: "Caregiver" }] } : { rows: [] }
  });
  await navigator.process(callback("ui:text:0"));
  assert.ok(!calls.some((call) => call.payload.text?.includes("PRIVATE CHILD DATA")));
  await navigator.dayView("2026-10-23");
  assert.ok(!queries.some(({ sql }) => sql.includes("FROM internal_lessons")));
  assert.equal(session.active_role, "caregiver");
});

test("specialist school and therapy views use separate data sources and the same calendar", async () => {
  const { navigator, session, calls, queries } = setup({
    state: { active_role: "specialist", contacts: { specialist: "+998901234567" }, view: { kind: "sections" } },
    query: async (sql) => {
      if (sql.includes("FROM users")) return { rows: [{ id: 8, name: "Specialist" }] };
      if (sql.includes("FROM internal_lessons")) return { rows: [{ id: 1, child_name: "Child", specialist_name: "Specialist" }] };
      return { rows: [{ id: 2, child_name: "Child", specialist_name: "Specialist", start_time: "10:00", end_time: "10:30", service_name: "Therapy", status: "pending" }] };
    }
  });
  await navigator.process(callback("ui:section:school"));
  await navigator.process(callback("ui:day:2026-10-23"));
  const school = queries.find(({ sql }) => sql.includes("FROM internal_lessons"));
  assert.equal(school.params[3], 8);
  assert.ok(!school.sql.includes("appointment_schedules"));
  assert.ok(!calls.at(-1).payload.text.includes("10:00"));
  await navigator.process(callback("ui:calendar:2026-10"));
  assert.ok(calls.at(-1).payload.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "ui:day:2026-10-17"));
  await navigator.process(callback("ui:section:therapy"));
  assert.equal(session.view.kind, "therapy");
  assert.ok(queries.some(({ sql, params }) => sql.includes("FROM appointment_schedules") && params[3] === 8));
  assert.ok(calls.at(-1).payload.text.includes("10:00"));
});

test("caregiver reads assigned child's current schedule and latest journal mark without editing it", async () => {
  let completed = true;
  const { navigator, calls, queries } = setup({
    state: { active_role: "caregiver", contacts: { caregiver: "+998901234567" }, view: { kind: "school", clientId: 4 } },
    query: async (sql) => {
      if (sql.includes("FROM caregivers")) return { rows: [{ id: 9, name: "Caregiver" }] };
      if (sql.includes("FROM internal_lessons")) return { rows: [{ id: 1, child_name: "Child", specialist_name: "Updated specialist", completed }] };
      if (sql.includes("caregiver_clients")) return { rows: [{ id: 4 }] };
      return { rows: [] };
    }
  });
  await navigator.dayView("2026-10-23");
  assert.ok(calls.at(-1).payload.text.includes("\u2705 1. Child"));
  assert.ok(calls.at(-1).payload.text.includes("Updated specialist"));
  assert.ok(!calls.at(-1).payload.reply_markup.inline_keyboard.flat().some((b) => b.callback_data.startsWith("ui:complete:")));
  const school = queries.find(({ sql }) => sql.includes("FROM internal_lessons"));
  assert.deepEqual(school.params, [7, 5, 4, null, 9, "2026-10-23"]);
  assert.ok(school.sql.includes("FROM internal_lesson_journal_events"));
  assert.ok(school.sql.includes("ORDER BY e.version DESC LIMIT 1"));
  completed = false;
  await navigator.dayView("2026-10-23");
  assert.ok(!calls.at(-1).payload.text.includes("\u2705"));
  const before = queries.length;
  await navigator.process(callback("ui:complete:1:2026-10-23:1"));
  assert.equal(queries.length, before);
});

test("school view merges journal-only lessons and makes future dates read-only", async () => {
  const { navigator, calls, queries } = setup({
    state: { active_role: "specialist", contacts: { specialist: "+998901234567" }, view: { kind: "school" } },
    query: async (sql) => {
      if (sql.includes("FROM users")) return { rows: [{ id: 8, name: "Specialist" }] };
      if (sql.includes("FROM internal_lesson_completions j")) return { rows: [{ id: 5, completion_id: "20", client_id: 4, child_name: "Historical child", specialist_name: "Specialist", completed: true }] };
      if (sql.includes("FROM internal_lessons")) return { rows: [{ id: 1, client_id: 4, child_name: "Current child", specialist_name: "Specialist", completed: true }] };
      return { rows: [] };
    }
  });
  await navigator.dayView("2026-10-23");
  assert.ok(calls.at(-1).payload.text.includes("Historical child"));
  const buttons = calls.at(-1).payload.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === "ui:history:20:2026-10-23"));
  assert.ok(buttons.some((b) => b.callback_data === "ui:complete:1:4:2026-10-23:0"));
  assert.ok(buttons.every((b) => Buffer.byteLength(b.callback_data) <= 64));
  const historicalQuery = queries.find(({ sql }) => sql.includes("FROM internal_lesson_completions j"));
  assert.deepEqual(historicalQuery.params, [7, "2026-10-23", null, 8, null]);
  assert.ok(historicalQuery.sql.includes("NOT EXISTS") && historicalQuery.sql.includes("latest.completed"));
  const before = queries.length;
  await navigator.dayView("2199-01-01");
  assert.ok(!calls.at(-1).payload.text.includes("Historical child"));
  assert.ok(!calls.at(-1).payload.text.includes("\u2705"));
  assert.ok(!calls.at(-1).payload.reply_markup.inline_keyboard.flat().some((b) => /^ui:(history|complete):/.test(b.callback_data)));
  assert.ok(!queries.slice(before).some(({ sql }) => sql.includes("FROM internal_lesson_completions j")));
});

test("parent linking keeps existing parent logic but suppresses its old extra menu messages", async () => {
  let linked = false;
  const { navigator, session, calls } = setup({
    state: { awaiting_role: "parent", contact_prompt_id: 22, keyboard_cleared: false },
    adapters: {
      getParent: async () => linked ? parent : null,
      linkParent: async () => {
        linked = true;
        const context = telegramInteractionContext.getStore();
        assert.equal(context.chatId, "101");
        await context.screen("Old menu");
      },
      children: async () => [{ id: 4, first_name: "Child", last_name: "One" }]
    }
  });
  await navigator.process(contact());
  assert.equal(session.contacts.parent, parent.phoneNumber);
  assert.equal(session.view.kind, "parent");
  assert.ok(!calls.some((call) => call.payload.text === "Old menu"));
  assert.ok(calls.at(-1).payload.reply_markup.inline_keyboard.some((row) => row[0].callback_data === "ui:parent:today"));
});

test("reminder callbacks and cancellation reasons reuse the current menu while keeping parental authorization", async () => {
  const { navigator, calls, session } = setup({
    state: { ui_message_id: 20 }, adapters: {
      getParent: async () => parent,
      callback: async () => telegramInteractionContext.getStore().screen("Confirmed"),
      hasPending: async () => true,
      text: async () => telegramInteractionContext.getStore().screen("Cancelled")
    }
  });
  await navigator.process(callback("resp:coming:50"));
  assert.equal(session.active_role, "parent");
  assert.equal(calls.at(-1).method, "editMessageText");
  assert.equal(calls.at(-1).payload.message_id, 20);
  await navigator.process({ message: { text: "Reason", from, chat } });
  assert.equal(calls.at(-1).payload.text, "Cancelled");
  assert.ok(calls.every((call) => call.method !== "sendMessage"));
});

test("navigation is private, serialized per account, deduplicated, and stored persistently", async () => {
  const queryCalls = [];
  let released = false;
  const session = { language: "uz", contacts: {}, view: {}, keyboard_cleared: true, last_update_id: 5 };
  const dbPool = { connect: async () => ({ query: async (sql, params) => {
    queryCalls.push({ sql, params });
    return { rows: sql.includes("INSERT INTO telegram_bot_sessions") ? [session] : [] };
  }, release: () => { released = true; } }) };
  const { api, legacy, calls } = setup();
  await handleTelegramNavigation({ settings, update: { update_id: 5, ...callback("ui:home") }, api, legacy, dbPool });
  assert.ok(queryCalls.some(({ sql }) => sql.includes("pg_advisory_xact_lock")));
  assert.ok(!queryCalls.some(({ sql }) => sql.includes("UPDATE telegram_bot_sessions")));
  assert.equal(calls.filter((call) => call.method === "sendMessage").length, 0);
  assert.equal(released, true);
  queryCalls.length = 0;
  await handleTelegramNavigation({ settings, update: { message: { from, chat: { id: -12, type: "group" }, text: "/start" } }, api, legacy, dbPool });
  assert.equal(queryCalls.length, 0);
});
