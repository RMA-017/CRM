import pool from "../../config/db.js";
import { normalizePhoneDigits, normalizePhoneNumber, isValidPhoneInput } from "../../lib/phone-number.js";
import { telegramInteractionContext } from "./telegram-interaction-context.js";
import { setInternalLessonCompletion, undoHistoricalInternalLesson } from "../internal-lessons/internal-lesson-journal.service.js";
import { BOT_UI_TEXT, botButton, botToday, botDayLabel, isBotDate, buildBotCalendar, buildBotDateNavigation, splitBotScreen } from "./telegram-calendar.js";

const ROLES = new Set(["parent", "caregiver", "specialist"]);
const PAGE_SIZE = 8;
const PHONE_SQL = `CASE
  WHEN regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g') LIKE '00%'
    THEN SUBSTRING(regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g') FROM 3)
  WHEN LENGTH(regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g')) = 9
    THEN '998' || regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g')
  WHEN LENGTH(regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g')) = 10
    THEN '7' || regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g')
  WHEN LENGTH(regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g')) = 11
    AND regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g') LIKE '8%'
    THEN '7' || SUBSTRING(regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g') FROM 2)
  ELSE regexp_replace(COALESCE(u.phone_number, ''), '\\D', '', 'g') END`;

function safePage(value) {
  return /^\d{1,6}$/.test(String(value)) ? Number(value) : 0;
}

function canReplaceMessage(error) {
  return /message (?:to edit not found|can't be edited|can not be edited)|message_id_invalid/i.test(String(error?.message || ""));
}

export function createTelegramNavigator({ settings, session, db, api, legacy, from, chat }) {
  session.contacts ||= {};
  session.view ||= {};
  const ui = () => BOT_UI_TEXT[session.language] || BOT_UI_TEXT.ru;
  const call = (method, payload) => api(settings.botToken, method, payload);
  const mainKeyboard = () => ({ keyboard: [
    [{ text: ui().parent }, { text: ui().caregiver }], [{ text: ui().specialist }, { text: ui().settings }]
  ], resize_keyboard: true, is_persistent: true, one_time_keyboard: false });

  async function clearInline() {
    const ids = new Set([session.ui_message_id, ...Object.values(session.view.parentScreens || {}).map((screen) => screen.messageId)].filter(Boolean));
    for (const id of ids) await call("editMessageReplyMarkup", {
      chat_id: chat.id, message_id: Number(id), reply_markup: { inline_keyboard: [] }
    }).catch(() => {});
    session.view.parentScreens = {};
    session.ui_message_id = null;
  }

  async function ensureMainKeyboard(force = false, text = ui().main) {
    if (!force && !session.contact_prompt_id && session.keyboard_cleared) return;
    const result = await call("sendMessage", { chat_id: chat.id, text, reply_markup: mainKeyboard() });
    session.contact_prompt_id = null;
    session.keyboard_cleared = true;
    return result;
  }

  async function display(text, rows = [[botButton(ui().back, "ui:home")]], textPage = null) {
    await ensureMainKeyboard();
    let pages;
    if (textPage !== null && session.view.textPages) {
      ({ pages, rows } = session.view.textPages);
    } else {
      pages = splitBotScreen(text);
      session.view.textPages = pages.length > 1 ? { pages, rows } : null;
    }
    const index = Math.max(0, Math.min(textPage || 0, pages.length - 1));
    const replyRows = rows.map((row) => row.filter((button) => !["ui:home", "week_back"].includes(button.callback_data))).filter((row) => row.length);
    if (pages.length > 1) {
      const controls = [];
      const textPrefix = session.active_role === "parent" && session.view.parentScreens?.[session.view.clientId] ? `ui:pt:${session.view.clientId}` : "ui:text";
      if (index > 0) controls.push(botButton("◀️", `${textPrefix}:${index - 1}`));
      controls.push(botButton(`${index + 1}/${pages.length}`, "ui:noop"));
      if (index < pages.length - 1) controls.push(botButton("▶️", `${textPrefix}:${index + 1}`));
      replyRows.unshift(controls);
    }
    const payload = { chat_id: chat.id, text: pages[index], reply_markup: { inline_keyboard: replyRows }, disable_web_page_preview: true };
    if (session.ui_message_id) {
      try {
        return await call("editMessageText", { ...payload, message_id: Number(session.ui_message_id) });
      } catch (error) {
        if (/message is not modified/i.test(String(error?.message || ""))) return { message_id: Number(session.ui_message_id) };
        if (!canReplaceMessage(error)) throw error;
      }
    }
    const oldId = session.ui_message_id;
    const result = await call("sendMessage", payload);
    session.ui_message_id = result.message_id;
    if (oldId && String(oldId) !== String(result.message_id)) await call("editMessageReplyMarkup", {
      chat_id: chat.id, message_id: Number(oldId), reply_markup: { inline_keyboard: [] }
    }).catch(() => {});
    return result;
  }

  function parentContext(screen) {
    return { token: settings.botToken, chatId: String(chat.id), screen,
      parentClientId: session.view.parentScreens?.[session.view.clientId] ? Number(session.view.clientId) : null };
  }

  async function clearPending() {
    const parent = await legacy.getParent();
    if (parent) await legacy.clearPending(parent);
  }

  async function resetAccount(stopped) {
    await clearPending();
    await clearInline();
    await db.query("UPDATE telegram_parent_accounts SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $1 AND telegram_user_id = $2", [settings.organizationId, from.id]);
    session.contacts = {};
    session.active_role = null;
    session.awaiting_role = null;
    session.contact_prompt_id = null;
    session.keyboard_cleared = false;
    session.view = stopped ? { stopped: true } : {};
    if (!stopped) return mainMenu();
    return call("sendMessage", { chat_id: chat.id,
      text: session.language === "uz" ? "Bot to‘xtatildi. Qayta boshlash uchun /start bosing." : "Бот остановлен. Для повторного запуска отправьте /start.",
      reply_markup: { remove_keyboard: true } });
  }

  async function mainMenu(prefix = "") {
    await clearInline();
    session.awaiting_role = null;
    session.active_role = null;
    session.view = { kind: "main" };
    await clearPending();
    return ensureMainKeyboard(true, [prefix, ui().main].filter(Boolean).join("\n\n"));
  }

  async function settingsMenu() {
    await clearInline();
    session.awaiting_role = null;
    session.view = { kind: "settings" };
    await clearPending();
    return display(ui().language, [
      [botButton("🇺🇿 O‘zbekcha", "ui:language:uz"), botButton("🇷🇺 Русский", "ui:language:ru")],
      [botButton(ui().back, "ui:home")]
    ]);
  }

  async function askContact(role, prefix = "") {
    if (!ROLES.has(role)) return mainMenu();
    await clearPending();
    await clearInline();
    session.awaiting_role = role;
    session.active_role = role;
    session.view = { kind: "contact" };
    const result = await call("sendMessage", {
      chat_id: chat.id, text: prefix || ui().askContact,
      reply_markup: { keyboard: [[{ text: ui().contact, request_contact: true }], [{ text: ui().back }]],
        resize_keyboard: true, is_persistent: true, one_time_keyboard: false }
    });
    session.ui_message_id = null;
    session.contact_prompt_id = result.message_id;
    session.keyboard_cleared = false;
  }

  async function enterRole(role) {
    if (!ROLES.has(role)) return mainMenu();
    const saved = session.contacts[role];
    if (!saved) return askContact(role);
    if (!(await identity(role))) {
      delete session.contacts[role];
      return askContact(role, ui().noAccess);
    }
    await clearPending();
    await clearInline();
    session.awaiting_role = null;
    session.active_role = role;
    session.view = {};
    if (role === "parent") return parentHome();
    if (role === "caregiver") return caregiverChildren();
    return sectionMenu();
  }

  async function identity(role = session.active_role, phone = session.contacts[role]) {
    if (!phone) return null;
    if (role === "parent") {
      const parent = await legacy.getParent();
      return parent?.isActive && parent.phoneDigits === normalizePhoneDigits(phone) ? parent : null;
    }
    if (role === "caregiver") {
      const { rows } = await db.query(
        "SELECT id, full_name AS name FROM caregivers WHERE organization_id = $1 AND phone_digits = $2 AND is_active = TRUE",
        [settings.organizationId, normalizePhoneDigits(phone)]
      );
      return rows.length === 1 ? rows[0] : null;
    }
    if (role === "specialist") {
      const { rows } = await db.query(
        `SELECT u.id, COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS name
         FROM users u JOIN role_options r ON r.id = u.role_id LEFT JOIN position_options p ON p.id = u.position_id
         WHERE u.organization_id = $1 AND ${PHONE_SQL} = $2 AND COALESCE(u.is_active, TRUE) AND r.is_active
         AND LOWER(CONCAT_WS(' ', r.label, p.label)) LIKE ANY(ARRAY['%specialist%', '%spetsialist%', '%mutaxassis%', '%специалист%']) LIMIT 2`,
        [settings.organizationId, normalizePhoneDigits(phone)]
      );
      return rows.length === 1 ? rows[0] : null;
    }
    return null;
  }

  async function requireIdentity(role = session.active_role) {
    const entity = await identity(role);
    if (!entity) {
      delete session.contacts[role];
      await display(ui().noAccess, [[botButton(ui().contact, `ui:role:${ROLES.has(role) ? role : "parent"}`)], [botButton(ui().back, "ui:home")]]);
    }
    return entity;
  }

  async function parentHome() {
    const parent = await requireIdentity("parent");
    if (!parent) return;
    await clearInline();
    session.active_role = "parent";
    session.view = { kind: "parent", parentScreens: {} };
    const children = await legacy.children(parent);
    await ensureMainKeyboard();
    if (!children.length) return display(ui().noChildren);
    for (const child of children) await parentChildScreen(child.id, botToday());
  }

  async function parentChildScreen(clientId, date, month = null, action = null) {
    if (!isBotDate(date) || !Number.isInteger(clientId) || clientId <= 0) return;
    if (month && !isBotDate(`${month}-01`)) return;
    const parent = await requireIdentity("parent");
    if (!parent) return;
    const child = (await legacy.children(parent)).find((item) => Number(item.id) === clientId);
    if (!child) return;
    session.active_role = "parent";
    session.view.parentScreens ||= {};
    const screen = session.view.parentScreens[clientId] ||= {};
    screen.name = [child.last_name, child.first_name, child.middle_name].filter(Boolean).join(" ");
    screen.date = date;
    session.view.kind = "parent_day";
    session.view.clientId = clientId;
    session.view.date = date;
    const previousId = session.ui_message_id;
    session.ui_message_id = screen.messageId || null;
    session.view.textPages = screen.textPages || null;
    try {
      if (action) await action();
      else if (month) {
        const result = buildBotCalendar(session.language, month, date);
        await renderLegacy(result.text, result.replyMarkup);
      } else await legacyAction(() => legacy.day({ parent, dateYmd: date, clientId }));
      screen.messageId = session.ui_message_id;
      screen.textPages = session.view.textPages;
    } finally { session.ui_message_id = previousId; }
  }

  function pageRows(page, total, prefix = "ui:page") {
    const rows = [];
    if (total > PAGE_SIZE) {
      const buttons = [];
      if (page > 0) buttons.push(botButton("◀️", `${prefix}:${page - 1}`));
      buttons.push(botButton(`${page + 1}/${Math.ceil(total / PAGE_SIZE)}`, "ui:noop"));
      if ((page + 1) * PAGE_SIZE < total) buttons.push(botButton("▶️", `${prefix}:${page + 1}`));
      rows.push(buttons);
    }
    return rows;
  }

  async function caregiverChildren(page = 0) {
    const caregiver = await requireIdentity("caregiver");
    if (!caregiver) return;
    session.active_role = "caregiver";
    session.view = { kind: "children", page };
    const { rows } = await db.query(
      `SELECT c.id, concat_ws(' ', c.last_name, c.first_name, c.middle_name) AS name
       FROM caregiver_clients cc JOIN clients c ON c.organization_id = cc.organization_id AND c.id = cc.client_id
       WHERE cc.organization_id = $1 AND cc.caregiver_id = $2 ORDER BY LOWER(c.last_name), LOWER(c.first_name), c.id`,
      [settings.organizationId, caregiver.id]
    );
    const safe = Math.min(page, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
    session.view.page = safe;
    return display(`${caregiver.name}\n\n${rows.length ? ui().children : ui().noChildren}`, [
      ...rows.slice(safe * PAGE_SIZE, (safe + 1) * PAGE_SIZE).map((child) => [botButton(child.name, `ui:child:${child.id}`)]),
      ...pageRows(safe, rows.length), [botButton(ui().back, "ui:home")]
    ]);
  }

  async function allowedChild(caregiver, clientId) {
    if (!Number.isSafeInteger(clientId) || clientId <= 0 || clientId > 2147483647) return null;
    const { rows } = await db.query(
      `SELECT c.id, concat_ws(' ', c.last_name, c.first_name, c.middle_name) AS name
       FROM caregiver_clients cc JOIN clients c ON c.organization_id = cc.organization_id AND c.id = cc.client_id
       WHERE cc.organization_id = $1 AND cc.caregiver_id = $2 AND c.id = $3`, [settings.organizationId, caregiver.id, clientId]
    );
    if (!rows[0]) await display(ui().noAccess, [[botButton(ui().back, "ui:children")]]);
    return rows[0] || null;
  }

  async function sectionMenu(clientId = null) {
    const entity = await requireIdentity();
    if (!entity) return;
    let name = entity.name;
    if (session.active_role === "caregiver") {
      const child = await allowedChild(entity, clientId);
      if (!child) return;
      session.view = { kind: "school", clientId, date: botToday() };
      return dayView();
    } else if (session.active_role !== "specialist") return mainMenu();
    session.view = { kind: "sections", clientId };
    return display(name, [[botButton(ui().school, "ui:section:school")], [botButton(ui().therapy, "ui:section:therapy")],
      [botButton(ui().back, session.active_role === "caregiver" ? "ui:children" : "ui:home")]]);
  }

  function dayBack() {
    if (session.active_role === "parent") return "ui:parent";
    return session.active_role === "caregiver" ? "ui:children" : "ui:specialist";
  }

  async function renderLegacy(text, replyMarkup) {
    const childId = session.view.parentScreens?.[session.view.clientId] ? session.view.clientId : null;
    if (childId) {
      const screen = session.view.parentScreens[childId];
      const calendarRows = replyMarkup?.inline_keyboard?.some((row) => row.some((b) => b.callback_data?.startsWith("ui:calendar:")));
      let rows = (replyMarkup?.inline_keyboard || []).filter((row) => !row.some((b) => /^(week_menu:|week_nav:|week_day:)/.test(b.callback_data || "")));
      if (!calendarRows) rows = [...rows, ...buildBotDateNavigation(session.language, screen.date, "ui:home")];
      rows = rows.map((row) => row.map((b) => ({ ...b, callback_data: /^(resp:|week_)/.test(b.callback_data || "")
        ? `ui:pa:${childId}:${b.callback_data}`
        : b.callback_data?.replace(/^ui:day:/, `ui:pd:${childId}:`).replace(/^ui:calendar:/, `ui:pc:${childId}:`) })));
      return display(`${screen.name}\n\n${text}`, rows);
    }
    const rows = (replyMarkup?.inline_keyboard || []).filter((row) => !row.some((button) => /^(week_menu:|week_nav:|week_day:)/.test(button.callback_data || "")));
    return display(text, [...rows, ...buildBotDateNavigation(session.language, session.view.date || botToday(), "ui:parent")]);
  }

  async function legacyAction(action, acknowledgedCallbackId = null) {
    return telegramInteractionContext.run({ ...parentContext(renderLegacy), acknowledgedCallbackId }, action);
  }

  async function dayView(date = botToday(), page = 0) {
    if (!isBotDate(date)) return;
    const entity = await requireIdentity();
    if (!entity) return;
    session.view.date = date;
    session.view.page = page;
    if (session.active_role === "parent") {
      if (session.view.clientId) return parentChildScreen(Number(session.view.clientId), date);
      session.view.kind = "parent_day";
      return legacyAction(() => legacy.day({ parent: entity, dateYmd: date }));
    }
    if (session.active_role === "caregiver") session.view.kind = "school";
    if (!["school", "therapy"].includes(session.view.kind)) return sectionMenu(session.view.clientId);
    const childId = session.active_role === "caregiver" ? Number(session.view.clientId) : null;
    if (session.active_role === "caregiver" && !(await allowedChild(entity, childId))) return;
    const organizationId = settings.organizationId;
    let lessons;
    if (session.view.kind === "school") {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
      const { rows } = await db.query(
        `SELECT l.id, l.client_id, COALESCE(journal.completed, FALSE) AS completed, concat_ws(' ', c.last_name, c.first_name, c.middle_name) AS child_name,
           COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS specialist_name, COALESCE(p.label, '') AS position_name
         FROM internal_lessons l JOIN clients c ON c.organization_id = l.organization_id AND c.id = l.client_id
         JOIN users u ON u.organization_id = l.organization_id AND u.id = l.specialist_id
         LEFT JOIN position_options p ON p.id = u.position_id
         LEFT JOIN internal_lesson_completions lc ON lc.organization_id = l.organization_id
           AND lc.source_lesson_id = l.id AND lc.source_client_id = l.client_id
           AND lc.source_specialist_id = l.specialist_id AND lc.schedule_date = $6::date
         LEFT JOIN LATERAL (
           SELECT e.completed FROM internal_lesson_journal_events e
           WHERE e.organization_id = l.organization_id AND e.completion_id = lc.id
           ORDER BY e.version DESC LIMIT 1
         ) journal ON TRUE
         WHERE l.organization_id = $1 AND $2::smallint = ANY(l.week_days)
           AND ($3::integer IS NULL OR l.client_id = $3) AND ($4::integer IS NULL OR l.specialist_id = $4)
           AND ($5::integer IS NULL OR EXISTS (SELECT 1 FROM caregiver_clients cc
             WHERE cc.organization_id = l.organization_id AND cc.client_id = l.client_id AND cc.caregiver_id = $5))
         ORDER BY l.id`, [organizationId, weekday, childId, session.active_role === "specialist" ? entity.id : null, session.active_role === "caregiver" ? entity.id : null, date]
      );
      lessons = date <= botToday() ? rows : rows.map((lesson) => ({ ...lesson, completed: false }));
      if (date <= botToday()) {
        const history = await db.query(`SELECT j.id::text AS completion_id, j.source_lesson_id AS id,
          j.source_client_id AS client_id, j.client_name AS child_name, j.specialist_name, j.position_name, TRUE AS completed
          FROM internal_lesson_completions j
          JOIN LATERAL (SELECT e.completed FROM internal_lesson_journal_events e
            WHERE e.organization_id = j.organization_id AND e.completion_id = j.id ORDER BY e.version DESC LIMIT 1) latest ON latest.completed
          WHERE j.organization_id = $1 AND j.schedule_date = $2::date
            AND ($3::integer IS NULL OR j.source_client_id = $3)
            AND ($4::integer IS NULL OR j.source_specialist_id = $4)
            AND ($5::integer IS NULL OR EXISTS (SELECT 1 FROM caregiver_clients cc
              WHERE cc.organization_id = j.organization_id AND cc.client_id = j.source_client_id AND cc.caregiver_id = $5))
            AND NOT EXISTS (SELECT 1 FROM internal_lessons current
              WHERE current.organization_id = j.organization_id AND current.id = j.source_lesson_id
                AND current.client_id = j.source_client_id AND current.specialist_id = j.source_specialist_id
                AND EXTRACT(ISODOW FROM $2::date)::smallint = ANY(current.week_days))
          ORDER BY j.id`, [organizationId, date, childId, session.active_role === "specialist" ? entity.id : null,
          session.active_role === "caregiver" ? entity.id : null]);
        lessons = [...rows, ...history.rows];
      }
    } else {
      const { rows } = await db.query(
        `SELECT s.id, concat_ws(' ', c.last_name, c.first_name, c.middle_name) AS child_name,
           COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS specialist_name,
           TO_CHAR(s.start_time, 'HH24:MI') AS start_time, TO_CHAR(s.end_time, 'HH24:MI') AS end_time, s.service_name, s.status
         FROM appointment_schedules s JOIN clients c ON c.organization_id = s.organization_id AND c.id = s.client_id
         JOIN users u ON u.organization_id = s.organization_id AND u.id = s.specialist_id
         WHERE s.organization_id = $1 AND s.appointment_date = $2::date
           AND ($3::integer IS NULL OR s.client_id = $3) AND ($4::integer IS NULL OR s.specialist_id = $4)
           AND ($5::integer IS NULL OR EXISTS (SELECT 1 FROM caregiver_clients cc
             WHERE cc.organization_id = s.organization_id AND cc.client_id = s.client_id AND cc.caregiver_id = $5))
         ORDER BY s.start_time, s.id`, [organizationId, date, childId, session.active_role === "specialist" ? entity.id : null, session.active_role === "caregiver" ? entity.id : null]
      );
      lessons = rows;
    }
    const safe = Math.min(page, Math.max(0, Math.ceil(lessons.length / PAGE_SIZE) - 1));
    session.view.page = safe;
    const specialistSchool = session.view.kind === "school" && session.active_role === "specialist";
    const lines = lessons.slice(safe * PAGE_SIZE, (safe + 1) * PAGE_SIZE).map((lesson, index) => specialistSchool ? "" : session.active_role === "caregiver"
      ? `${lesson.completed ? "✅ " : ""}${safe * PAGE_SIZE + index + 1}. ${lesson.specialist_name}${lesson.position_name ? `-${lesson.position_name}` : ""}` : [
      `${lesson.completed ? "✅ " : ""}${safe * PAGE_SIZE + index + 1}. ${lesson.child_name}`,
      `${ui().staff}: ${lesson.specialist_name}`,
      lesson.start_time ? `${lesson.start_time}–${lesson.end_time} · ${lesson.service_name}` : "",
      lesson.status ? (ui().statuses[lesson.status] || lesson.status) : ""
    ].filter(Boolean).join("\n"));
    const completionRows = specialistSchool
      ? lessons.slice(safe * PAGE_SIZE, (safe + 1) * PAGE_SIZE).map((lesson, index) => [botButton(
          `${lesson.completed ? "✅" : "☐"} ${safe * PAGE_SIZE + index + 1}. ${lesson.child_name}`,
          date > botToday() ? "ui:noop" : lesson.completion_id ? `ui:history:${lesson.completion_id}:${date}`
            : `ui:complete:${lesson.id}:${lesson.client_id}:${date}:${lesson.completed ? "0" : "1"}`
        )]) : [];
    return display([ui()[session.view.kind], botDayLabel(date, session.language),
      lessons.length ? lines.filter(Boolean).join("\n\n") : ui().noLessons].filter(Boolean).join("\n\n"),
    [...completionRows, ...pageRows(safe, lessons.length), ...buildBotDateNavigation(session.language, date, dayBack())]);
  }

  async function calendar(month) {
    const entity = await requireIdentity();
    if (!entity || !isBotDate(`${month}-01`)) return;
    if (session.active_role === "caregiver" && !(await allowedChild(entity, Number(session.view.clientId)))) return;
    if (session.active_role === "parent") session.view.kind = "parent_day";
    if (!["parent_day", "school", "therapy"].includes(session.view.kind)) return sectionMenu(session.view.clientId);
    const result = buildBotCalendar(session.language, month, session.view.date || botToday());
    return display(result.text, result.replyMarkup.inline_keyboard);
  }

  async function receiveContact(message) {
    const role = session.awaiting_role;
    if (!ROLES.has(role)) return mainMenu(ui().chooseRole);
    const contact = message.contact;
    if (!contact?.user_id || String(contact.user_id) !== String(from.id) || !isValidPhoneInput(contact.phone_number)) {
      return askContact(role, ui().ownContact);
    }
    const phone = normalizePhoneNumber(contact.phone_number);
    if (role === "parent") {
      // Reuse existing parent linking / lead logic without emitting its old reply-keyboard screens.
      await telegramInteractionContext.run(parentContext(async () => ({ message_id: session.ui_message_id || 0 })), () => legacy.linkParent(message));
      const parent = await legacy.getParent();
      if (parent) await legacy.parentLanguage(parent, session.language);
    } else if (!(await identity(role, phone))) {
      return askContact(role, ui().noAccess);
    }
    session.contacts[role] = phone;
    session.active_role = role;
    session.awaiting_role = null;
    await ensureMainKeyboard(false, ui().contactSaved);
    if (role === "parent") return parentHome();
    if (role === "caregiver") return caregiverChildren();
    return sectionMenu();
  }

  async function process(update) {
    const message = update.message;
    const data = String(update.callback_query?.data || "");
    const text = String(message?.text || "").trim();
    if (/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s|$)/.test(text)) return resetAccount(false);
    if (/^\/stop(?:@[a-zA-Z0-9_]+)?(?:\s|$)/.test(text)) return session.view.stopped ? undefined : resetAccount(true);
    if (session.view.stopped) return;
    if (message?.contact) return receiveContact(message);
    if (text === "/menu" || data === "ui:home" || [BOT_UI_TEXT.uz.back, BOT_UI_TEXT.ru.back, "🔙 Ortga", "🔙 Назад"].includes(text)) {
      return mainMenu();
    }
    if (data === "ui:noop") return;
    for (const role of ROLES) {
      const normalizeLabel = (value) => String(value).replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
      if (text && [BOT_UI_TEXT.uz[role], BOT_UI_TEXT.ru[role]].some((label) => normalizeLabel(label) === normalizeLabel(text))) return enterRole(role);
    }
    if (data.startsWith("ui:role:")) return enterRole(data.slice(8));
    if (data.startsWith("ui:contact:")) return settingsMenu();
    if (data === "ui:settings" || [BOT_UI_TEXT.uz.settings, BOT_UI_TEXT.ru.settings].includes(text)) return settingsMenu();
    if (data.startsWith("ui:language:") || ["O'zbekcha", "O‘zbekcha", "Русский"].includes(text)) {
      const language = data ? data.slice(12) : text === "Русский" ? "ru" : "uz";
      if (!["uz", "ru"].includes(language)) return;
      session.language = language;
      session.keyboard_cleared = false;
      await clearInline();
      await ensureMainKeyboard(true, language === "uz" ? "Til o‘zgartirildi." : "Язык изменён.");
      const parent = await legacy.getParent();
      if (parent) await legacy.parentLanguage(parent, language);
      session.active_role = null;
      session.awaiting_role = null;
      session.view = { kind: "main" };
      return;
    }
    if (data.startsWith("ui:text:")) {
      if (session.active_role === "caregiver" && session.view.kind === "therapy") return dayView(session.view.date || botToday());
      if (session.active_role) {
        const entity = await requireIdentity();
        if (!entity) return;
        if (session.active_role === "caregiver" && session.view.clientId && !(await allowedChild(entity, Number(session.view.clientId)))) return;
      }
      return session.view.textPages ? display("", [], safePage(data.slice(8))) : mainMenu();
    }
    if (data === "ui:parent") return parentHome();
    if (data.startsWith("ui:pt:")) {
      const match = /^ui:pt:([1-9][0-9]{0,9}):(\d{1,6})$/.exec(data);
      const screen = match && session.view.parentScreens?.[match[1]];
      if (!screen?.textPages) return;
      return parentChildScreen(Number(match[1]), screen.date, null, () => display("", [], Number(match[2])));
    }
    if (data.startsWith("ui:pa:")) {
      const match = /^ui:pa:([1-9][0-9]{0,9}):((?:resp:|week_).+)$/.exec(data);
      if (!match) return;
      const id = Number(match[1]);
      const date = session.view.parentScreens?.[id]?.date || botToday();
      return parentChildScreen(id, date, null, () => legacyAction(() => legacy.callback({ ...update.callback_query, data: match[2] }), update.callback_query.id));
    }
    if (data.startsWith("ui:pd:") || data.startsWith("ui:pc:")) {
      const match = /^ui:p([dc]):([1-9][0-9]{0,9}):(\d{4}-\d{2}(?:-\d{2})?)$/.exec(data);
      if (!match) return;
      const id = Number(match[2]);
      const date = session.view.parentScreens?.[id]?.date || botToday();
      return match[1] === "d" ? parentChildScreen(id, match[3]) : parentChildScreen(id, date, match[3]);
    }
    if (data.startsWith("ui:parent:")) {
      return parentHome();
    }
    if (data === "ui:children") {
      if (session.active_role !== "caregiver") return mainMenu();
      return caregiverChildren();
    }
    if (data.startsWith("ui:child:")) {
      if (session.active_role !== "caregiver") return mainMenu();
      return sectionMenu(Number(data.slice(9)));
    }
    if (data === "ui:specialist") {
      if (session.active_role !== "specialist") return mainMenu();
      return sectionMenu();
    }
    if (data.startsWith("ui:section:")) {
      if (!["caregiver", "specialist"].includes(session.active_role)) return mainMenu();
      const kind = data.slice(11);
      if (!["school", "therapy"].includes(kind)) return;
      if (session.active_role === "caregiver") {
        session.view = { kind: "school", clientId: session.view.clientId || null, date: botToday() };
        return dayView();
      }
      session.view = { kind, clientId: session.view.clientId || null, date: botToday() };
      return dayView();
    }
    if (data.startsWith("ui:calendar:")) return calendar(data.slice(12));
    if (data.startsWith("ui:history:")) {
      if (session.active_role !== "specialist" || session.view.kind !== "school") return;
      const match = /^ui:history:([1-9][0-9]{0,18}):(\d{4}-\d{2}-\d{2})$/.exec(data);
      if (!match || !isBotDate(match[2])) return;
      const specialist = await requireIdentity("specialist");
      if (!specialist) return;
      try {
        await undoHistoricalInternalLesson({ organizationId: settings.organizationId, specialistId: specialist.id,
          completionId: match[1], date: match[2], telegramUserId: from.id, db });
      } catch (error) { if (!error.statusCode) throw error; }
      return dayView(match[2], session.view.page || 0);
    }
    if (data.startsWith("ui:complete:")) {
      if (session.active_role !== "specialist" || session.view.kind !== "school") return;
      const match = /^ui:complete:([1-9][0-9]{0,9}):([1-9][0-9]{0,9}):(\d{4}-\d{2}-\d{2}):([01])$/.exec(data);
      if (!match) return dayView(session.view.date || botToday(), session.view.page || 0);
      if (!isBotDate(match[3])) return;
      const specialist = await requireIdentity("specialist");
      if (!specialist) return;
      try {
        await setInternalLessonCompletion({ organizationId: settings.organizationId, specialistId: specialist.id,
          lessonId: Number(match[1]), expectedClientId: Number(match[2]), date: match[3], completed: match[4] === "1", telegramUserId: from.id, db });
      } catch (error) {
        if (error.statusCode === 404) return dayView(match[3], session.view.page || 0);
        if (["STALE_LESSON", "FUTURE_LESSON"].includes(error.message)) return dayView(match[3], session.view.page || 0);
        throw error;
      }
      return dayView(match[3], session.view.page || 0);
    }
    if (data.startsWith("ui:day:")) return dayView(data.slice(7));
    if (data.startsWith("ui:page:")) {
      const page = safePage(data.slice(8));
      return session.view.kind === "children" ? caregiverChildren(page) : dayView(session.view.date, page);
    }
    // Buttons from previously delivered reminders still use the existing parent confirmation/cancellation logic.
    if (/^(resp:|week_)/.test(data)) {
      const parent = await legacy.getParent();
      if (!parent?.isActive) return askContact("parent");
      session.contacts.parent = parent.phoneNumber;
      session.active_role = "parent";
      const selectedChild = Object.entries(session.view.parentScreens || {}).find(([, screen]) => String(screen.messageId) === String(update.callback_query.message?.message_id));
      if (selectedChild) {
        const [id, screen] = selectedChild;
        if (data.startsWith("week_day:")) return parentChildScreen(Number(id), data.slice(9));
        if (/^week_(menu|nav):/.test(data)) return parentChildScreen(Number(id), screen.date, screen.date.slice(0, 7));
        return parentChildScreen(Number(id), screen.date, null, () => legacyAction(() => legacy.callback(update.callback_query), update.callback_query.id));
      }
      if (data.startsWith("week_menu:") || data.startsWith("week_nav:")) {
        session.view = { kind: "parent_day", date: isBotDate(data.split(":")[1]) ? data.split(":")[1] : botToday() };
        return calendar(session.view.date.slice(0, 7));
      }
      if (data.startsWith("week_day:")) { session.view.kind = "parent_day"; return dayView(data.slice(9)); }
      let date = session.view.date || botToday();
      const appointmentId = Number(data.startsWith("resp:") ? data.split(":")[2] : data.startsWith("week_cancel_single") ? data.split(":")[1] : 0);
      if (Number.isSafeInteger(appointmentId) && appointmentId > 0 && appointmentId <= 2147483647) {
        const appointment = await legacy.appointment(parent, appointmentId);
        if (appointment?.appointmentDate) date = appointment.appointmentDate;
      } else {
        const callbackDate = data.split(":")[1];
        if (isBotDate(callbackDate)) date = callbackDate;
      }
      session.view = { kind: "parent_day", date };
      return legacyAction(() => legacy.callback(update.callback_query), update.callback_query.id);
    }
    if (text && session.active_role === "parent" && !session.awaiting_role) {
      const parent = await requireIdentity("parent");
      if (!parent) return;
      if (await legacy.hasPending(parent)) {
        const id = Number(session.view.clientId);
        if (session.view.parentScreens?.[id]) return parentChildScreen(id, session.view.parentScreens[id].date, null, () => legacyAction(() => legacy.text(message)));
        return legacyAction(() => legacy.text(message));
      }
      return parentHome();
    }
    if (session.awaiting_role) return askContact(session.awaiting_role);
    return mainMenu();
  }

  return { process, display, identity, dayView, mainMenu };
}

export async function handleTelegramNavigation({ settings, update, api, legacy, dbPool = pool }) {
  const callback = update.callback_query;
  const message = update.message || callback?.message;
  const from = update.message?.from || callback?.from;
  const chat = message?.chat;
  if (!from?.id || !chat?.id || chat.type !== "private" || String(chat.id) !== String(from.id)) return { ok: true };
  if (callback?.id) await api(settings.botToken, "answerCallbackQuery", { callback_query_id: callback.id }).catch(() => {});
  const db = await dbPool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`telegram-ui:${settings.organizationId}:${from.id}`]);
    const language = String(from.language_code || "").toLowerCase().startsWith("uz") ? "uz" : "ru";
    const { rows } = await db.query(
      `INSERT INTO telegram_bot_sessions (organization_id, telegram_user_id, chat_id, language)
       VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id, telegram_user_id) DO UPDATE SET chat_id = EXCLUDED.chat_id RETURNING *`,
      [settings.organizationId, from.id, chat.id, language]
    );
    const session = rows[0];
    if (update.update_id !== undefined && String(session.last_update_id) === String(update.update_id)) {
      await db.query("COMMIT");
      return { ok: true };
    }
    const navigator = createTelegramNavigator({ settings, session, db, api, legacy, from, chat });
    await navigator.process(update);
    await db.query(
      `UPDATE telegram_bot_sessions SET language = $3, active_role = $4, awaiting_role = $5, contacts = $6::jsonb,
       view = $7::jsonb, ui_message_id = $8, contact_prompt_id = $9, last_update_id = $10, keyboard_cleared = $11, updated_at = CURRENT_TIMESTAMP
       WHERE organization_id = $1 AND telegram_user_id = $2`,
      [settings.organizationId, from.id, session.language, session.active_role || null, session.awaiting_role || null,
        JSON.stringify(session.contacts), JSON.stringify(session.view), session.ui_message_id || null, session.contact_prompt_id || null, update.update_id ?? null, Boolean(session.keyboard_cleared)]
    );
    await db.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { db.release(); }
}
