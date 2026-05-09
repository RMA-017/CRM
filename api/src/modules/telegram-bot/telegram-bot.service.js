import pool from "../../config/db.js";
import { executeTransaction } from "../../lib/db-utils.js";
import { normalizePermissionCodes } from "../../lib/permission-codes.js";
import { normalizePositiveInteger } from "../../lib/number.js";
import { toBoundedInteger } from "../../lib/bounded-integer.js";
import { updateAppointmentSchedulesByIds } from "../appointments/appointment-settings.service.js";
import { persistNotificationEvent } from "../notifications/notifications.service.js";
import { PERMISSIONS } from "../users/users.constants.js";

const DEFAULT_LANGUAGE = "ru";
const SUPPORTED_LANGUAGES = new Set(["uz", "ru"]);
const DEFAULT_CANCEL_LOCK_MINUTES = 60;
const DEFAULT_REMINDER_24H_HOURS = 24;
const DEFAULT_REMINDER_2H_HOURS = 2;
const MAX_REMINDER_HOURS = 168;
const MAX_REASON_LENGTH = 255;
const PENDING_ACTION_TTL_MINUTES = 30;
const REMINDER_SWEEP_INTERVAL_MS = 60 * 1000;
const DEFAULT_MANAGER_NOTIFICATION_PERMISSION_CODES = Object.freeze([
  PERMISSIONS.APPOINTMENTS_NOTIFICATIONS_RECEIVE || "appointments.notifications.receive"
]);
const ACTIVE_APPOINTMENT_STATUSES = new Set(["pending", "confirmed"]);

const TEXT = Object.freeze({
  uz: Object.freeze({
    shareContact: "Telefon raqamingizni yuboring",
    contactButton: "Kontakt yuborish",
    contactOnly: "Iltimos, kontaktni Telegram tugmasi orqali yuboring.",
    contactMismatch: "Faqat o'zingizning Telegram kontaktingizni yuborishingiz mumkin.",
    linked: "Kontakt saqlandi.",
    noChildren: "Bu telefon raqamga ulangan farzand topilmadi.",
    childrenTitle: "Mening farzandim:",
    noLessons: "Bu davr uchun dars topilmadi.",
    todaySchedule: "Bugungi dars jadvali",
    weekSchedule: "Bir haftalik jadval",
    messagesTitle: "Xabarlar",
    noMessages: "Hozircha xabarlar yo'q.",
    settingsTitle: "Sozlamalar",
    settingsPrompt: "Tilni tanlang yoki kontaktni o'zgartiring.",
    languageSaved: "Til sozlamasi saqlandi.",
    changeContact: "Kontaktni o'zgartirish",
    backToMainMenu: "Ortga",
    mainMenuTitle: "Bosh menyu",
    coming: "Ha, kelamiz",
    notComing: "Yo'q, bormaymiz",
    comingSaved: "Javob saqlandi: kelamiz.",
    reasonPrompt: "Bekor qilish sababini yozing yoki O'tkazib yuborish tugmasini bosing.",
    skipReason: "O'tkazib yuborish",
    cancelSaved: "Dars bekor qilindi.",
    cancelLocked: "Darsni bot orqali bekor qilish vaqti yopilgan. Iltimos, administrator bilan telefon orqali bog'laning.",
    notFound: "Dars topilmadi yoki bu raqamga ruxsat yo'q.",
    menuChildren: "Mening farzandim",
    menuToday: "Bugungi dars jadvali",
    menuWeek: "Bir haftalik jadval",
    menuMessages: "Xabarlar",
    menuSettings: "Sozlamalar",
    fallbackReason: "Ota-ona Telegram bot orqali bekor qildi",
    botDisabled: "Bot hozircha faol emas."
  }),
  ru: Object.freeze({
    shareContact: "Отправьте ваш номер телефона",
    contactButton: "Отправить контакт",
    contactOnly: "Пожалуйста, отправьте контакт через кнопку Telegram.",
    contactMismatch: "Можно отправить только свой Telegram контакт.",
    linked: "Контакт сохранен.",
    noChildren: "К этому номеру не привязан ребенок.",
    childrenTitle: "Мой ребенок:",
    noLessons: "На этот период уроки не найдены.",
    todaySchedule: "Расписание на сегодня",
    weekSchedule: "Расписание на неделю",
    messagesTitle: "Сообщения",
    noMessages: "Сообщений пока нет.",
    settingsTitle: "Настройки",
    settingsPrompt: "Выберите язык или измените контакт.",
    languageSaved: "Язык сохранен.",
    changeContact: "Изменить контакт",
    backToMainMenu: "Назад",
    mainMenuTitle: "Главное меню",
    coming: "Да, придем",
    notComing: "Нет, не придем",
    comingSaved: "Ответ сохранен: придем.",
    reasonPrompt: "Напишите причину отмены или нажмите Пропустить.",
    skipReason: "Пропустить",
    cancelSaved: "Урок отменен.",
    cancelLocked: "Время отмены через бот закрыто. Пожалуйста, свяжитесь с администратором по телефону.",
    notFound: "Урок не найден или нет доступа для этого номера.",
    menuChildren: "Мой ребенок",
    menuToday: "Расписание на сегодня",
    menuWeek: "Расписание на неделю",
    menuMessages: "Сообщения",
    menuSettings: "Настройки",
    fallbackReason: "Родитель отменил через Telegram бот",
    botDisabled: "Бот пока не активен."
  })
});

const DEFAULT_TEMPLATES = Object.freeze({
  uz: Object.freeze({
    lessonCancelled: "Farzandingizni {date} {time} dagi {service} darsi {actor} tomonidan bekor qilindi. Sabab: {reason}. Buning uchun uzr so'raymiz.",
    scheduleChanged: "{child} uchun {date} {time} dagi {service} darsi jadvali o'zgartirildi.",
    scheduleCreated: "{child} uchun {date} {time} dagi {service} darsi rejalashtirildi.",
    scheduleDeleted: "{child} uchun {date} {time} dagi {service} darsi o'chirildi.",
    reminder24h: "{date} {time} da {service} darsi bor. Kelasizmi?",
    reminder2h: "{date} {time} da {service} darsingiz bor.",
    parentCancelNotification: "Ota-ona {child} uchun {date} {time} dagi {service} darsini bekor qildi. Sabab: {reason}."
  }),
  ru: Object.freeze({
    lessonCancelled: "Урок {service} для {child} на {date} {time} отменен специалистом {actor}. Причина: {reason}. Приносим извинения.",
    scheduleChanged: "Расписание урока {service} для {child} на {date} {time} изменено.",
    scheduleCreated: "Урок {service} для {child} запланирован на {date} {time}.",
    scheduleDeleted: "Урок {service} для {child} на {date} {time} удален.",
    reminder24h: "{date} в {time} урок {service}. Вы придете?",
    reminder2h: "{date} в {time} у вас урок {service}.",
    parentCancelNotification: "Родитель отменил урок {service} для {child} на {date} {time}. Причина: {reason}."
  })
});

function isTelegramSchemaMissing(error) {
  if (error?.code !== "42P01" && error?.code !== "42703") {
    return false;
  }
  const message = String(error?.message || "").toLowerCase();
  return message.includes("telegram_")
    || message.includes("appointment_parent_responses")
    || message.includes("reminder_24h_hours")
    || message.includes("reminder_2h_hours")
    || message.includes("manager_notification_permission_codes");
}

function normalizeLanguage(value, fallback = DEFAULT_LANGUAGE) {
  const normalized = String(value || "").trim().toLowerCase();
  return SUPPORTED_LANGUAGES.has(normalized) ? normalized : fallback;
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function normalizePhoneNumber(value) {
  const digits = normalizePhoneDigits(value);
  return digits ? `+${digits}` : "";
}

function normalizeMessageText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeTemplateMap(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    uz: {
      ...DEFAULT_TEMPLATES.uz,
      ...(source.uz && typeof source.uz === "object" && !Array.isArray(source.uz) ? source.uz : {})
    },
    ru: {
      ...DEFAULT_TEMPLATES.ru,
      ...(source.ru && typeof source.ru === "object" && !Array.isArray(source.ru) ? source.ru : {})
    }
  };
}

function maskBotToken(value) {
  const token = String(value || "").trim();
  if (!token) {
    return "";
  }
  if (token.length <= 12) {
    return "********";
  }
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function mapSettingsRow(row, { includeToken = false } = {}) {
  const templates = normalizeTemplateMap(row?.templates);
  const token = String(row?.bot_token || "").trim();
  return {
    id: normalizePositiveInteger(row?.id),
    organizationId: normalizePositiveInteger(row?.organization_id),
    botToken: includeToken ? token : "",
    botTokenMasked: maskBotToken(token),
    hasBotToken: Boolean(token),
    isActive: Boolean(row?.is_active),
    webhookSecret: String(row?.webhook_secret || "").trim(),
    webhookUrl: String(row?.webhook_url || "").trim(),
    defaultLanguage: normalizeLanguage(row?.default_language),
    cancelLockMinutes: toBoundedInteger(row?.cancel_lock_minutes, DEFAULT_CANCEL_LOCK_MINUTES, 0, 10080),
    reminder24hHours: toBoundedInteger(row?.reminder_24h_hours, DEFAULT_REMINDER_24H_HOURS, 0, MAX_REMINDER_HOURS),
    reminder2hHours: toBoundedInteger(row?.reminder_2h_hours, DEFAULT_REMINDER_2H_HOURS, 0, MAX_REMINDER_HOURS),
    reminder24hEnabled: Boolean(row?.reminder_24h_enabled),
    reminder2hEnabled: Boolean(row?.reminder_2h_enabled),
    managerNotificationPermissionCodes: normalizePermissionCodes(row?.manager_notification_permission_codes)
      .length > 0
      ? normalizePermissionCodes(row?.manager_notification_permission_codes)
      : [...DEFAULT_MANAGER_NOTIFICATION_PERMISSION_CODES],
    templates,
    lastError: String(row?.last_error || "").trim(),
    updatedAt: row?.updated_at || null
  };
}

function getText(language, key) {
  const lang = normalizeLanguage(language);
  return TEXT[lang]?.[key] || TEXT[DEFAULT_LANGUAGE][key] || key;
}

function toDateYmdInTashkent(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function shiftDateYmd(value, days) {
  const [year, month, day] = String(value || "").split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return "";
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function normalizeTimeHm(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function getClientName(item) {
  return [
    String(item?.last_name ?? item?.clientLastName ?? "").trim(),
    String(item?.first_name ?? item?.clientFirstName ?? "").trim(),
    String(item?.middle_name ?? item?.clientMiddleName ?? "").trim()
  ].filter(Boolean).join(" ").trim() || "Client";
}

function getSpecialistName(item) {
  return String(item?.specialist_name ?? item?.specialistName ?? "").trim()
    || String(item?.actorFullName ?? "").trim()
    || "Specialist";
}

function renderTemplate(template, values) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const value = values?.[key];
    return value == null ? "" : String(value);
  }).replace(/\s+/g, " ").trim();
}

function buildMainMenuReplyMarkup(language) {
  return {
    keyboard: [
      [{ text: getText(language, "menuChildren") }, { text: getText(language, "menuToday") }],
      [{ text: getText(language, "menuWeek") }, { text: getText(language, "menuMessages") }],
      [{ text: getText(language, "menuSettings") }]
    ],
    resize_keyboard: true
  };
}

function buildContactReplyMarkup(language) {
  return {
    keyboard: [
      [{ text: getText(language, "contactButton"), request_contact: true }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function buildAppointmentButtons(language, appointmentId) {
  const id = normalizePositiveInteger(appointmentId);
  if (!id) {
    return undefined;
  }
  return {
    inline_keyboard: [
      [
        { text: getText(language, "coming"), callback_data: `resp:coming:${id}` },
        { text: getText(language, "notComing"), callback_data: `resp:cancel:${id}` }
      ]
    ]
  };
}

function buildCancelReasonButtons(language, appointmentId) {
  return {
    inline_keyboard: [
      [{ text: getText(language, "skipReason"), callback_data: `resp:cancel-skip:${appointmentId}` }]
    ]
  };
}

function buildSettingsMenuReplyMarkup(language) {
  return {
    keyboard: [
      [{ text: "O'zbekcha" }, { text: "Русский" }],
      [{ text: getText(language, "changeContact") }],
      [{ text: getText(language, "backToMainMenu") }]
    ],
    resize_keyboard: true
  };
}

function resolveMenuAction(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("/start")) {
    return "start";
  }
  if (normalized === "o'zbekcha" || normalized === "ozbekcha" || normalized === "uzbekcha") {
    return "language_uz";
  }
  if (normalized === "русский" || normalized === "ru") {
    return "language_ru";
  }
  if (normalized === "ortga" || normalized === "назад") {
    return "main";
  }
  if (normalized.includes("kontakt") || normalized.includes("контакт")) {
    return "change_contact";
  }
  if (normalized.includes("farzand") || normalized.includes("ребен") || normalized.includes("ребён")) {
    return "children";
  }
  if (normalized.includes("bugungi") || normalized.includes("сегодня")) {
    return "today";
  }
  if (normalized.includes("xaft") || normalized.includes("haft") || normalized.includes("недел")) {
    return "week";
  }
  if (normalized.includes("xabar") || normalized.includes("сообщ")) {
    return "messages";
  }
  if (normalized.includes("sozlam") || normalized.includes("настрой")) {
    return "settings";
  }
  return "";
}

function toAppointmentStartDate(appointmentDate, startTime) {
  const date = String(appointmentDate || "").trim();
  const time = normalizeTimeHm(startTime);
  if (!date || !time) {
    return null;
  }
  const parsed = new Date(`${date}T${time}:00+05:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isCancelLocked(appointmentDate, startTime, cancelLockMinutes) {
  const startDate = toAppointmentStartDate(appointmentDate, startTime);
  if (!startDate) {
    return true;
  }
  const minutesUntilStart = Math.floor((startDate.getTime() - Date.now()) / 60000);
  return minutesUntilStart < cancelLockMinutes;
}

function mapAppointmentRow(row) {
  return {
    id: normalizePositiveInteger(row?.id),
    organizationId: normalizePositiveInteger(row?.organization_id),
    specialistId: normalizePositiveInteger(row?.specialist_id),
    specialistName: String(row?.specialist_name || "").trim(),
    clientId: normalizePositiveInteger(row?.client_id),
    appointmentDate: String(row?.appointment_date || "").trim(),
    startTime: normalizeTimeHm(row?.start_time),
    endTime: normalizeTimeHm(row?.end_time),
    durationMinutes: normalizePositiveInteger(row?.duration_minutes),
    serviceName: String(row?.service_name || "").trim() || "Service",
    status: String(row?.status || "").trim().toLowerCase(),
    note: String(row?.note || "").trim(),
    first_name: String(row?.first_name || "").trim(),
    last_name: String(row?.last_name || "").trim(),
    middle_name: String(row?.middle_name || "").trim(),
    parentResponseStatus: String(row?.parent_response_status || "").trim().toLowerCase()
  };
}

async function callTelegramApi(token, method, payload = {}) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw new Error("Telegram bot token is missing.");
  }
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in this Node runtime.");
  }

  const response = await fetch(`https://api.telegram.org/bot${normalizedToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    throw new Error(String(data?.description || `Telegram API ${method} failed.`).slice(0, 500));
  }
  return data.result;
}

async function sendTelegramMessage({ token, chatId, text, replyMarkup }) {
  return callTelegramApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    reply_markup: replyMarkup || undefined
  });
}

async function answerCallbackQuery({ token, callbackQueryId, text = "" }) {
  if (!callbackQueryId) {
    return;
  }
  await callTelegramApi(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text || undefined
  }).catch(() => {});
}

async function logParentMessage({
  organizationId,
  parentAccountId,
  appointmentScheduleId = null,
  eventType,
  message,
  dedupeKey = ""
}) {
  const normalizedDedupeKey = String(dedupeKey || "").trim() || null;
  if (!organizationId || !parentAccountId || !eventType || !message) {
    return { inserted: false };
  }

  const { rows } = await pool.query(
    `INSERT INTO telegram_parent_messages (
       organization_id,
       parent_account_id,
       appointment_schedule_id,
       event_type,
       message,
       dedupe_key
     ) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (organization_id, parent_account_id, dedupe_key) DO NOTHING
     RETURNING id`,
    [
      organizationId,
      parentAccountId,
      appointmentScheduleId || null,
      eventType,
      message,
      normalizedDedupeKey
    ]
  );
  return { inserted: !normalizedDedupeKey || rows.length > 0 };
}

async function sendAndLogParentMessage({
  settings,
  parent,
  appointmentScheduleId = null,
  eventType,
  message,
  replyMarkup,
  dedupeKey = ""
}) {
  const normalizedDedupeKey = String(dedupeKey || "").trim();
  if (normalizedDedupeKey) {
    const logResult = await logParentMessage({
      organizationId: parent.organizationId,
      parentAccountId: parent.id,
      appointmentScheduleId,
      eventType,
      message,
      dedupeKey: normalizedDedupeKey
    });
    if (!logResult.inserted) {
      return { skipped: true };
    }
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: message,
      replyMarkup
    });
    return { skipped: false };
  }

  await sendTelegramMessage({
    token: settings.botToken,
    chatId: parent.chatId,
    text: message,
    replyMarkup
  });
  await logParentMessage({
    organizationId: parent.organizationId,
    parentAccountId: parent.id,
    appointmentScheduleId,
    eventType,
    message
  });
  return { skipped: false };
}

async function getRawSettingsRow(organizationId, db = pool) {
  const { rows } = await db.query(
    `SELECT *
       FROM telegram_bot_settings
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );
  return rows[0] || null;
}

async function ensureSettingsRow({ organizationId, actorUserId = null, db = pool }) {
  const { rows } = await db.query(
    `INSERT INTO telegram_bot_settings (organization_id, created_by, updated_by)
     VALUES ($1,$2,$2)
     ON CONFLICT (organization_id) DO UPDATE
       SET updated_at = telegram_bot_settings.updated_at
     RETURNING *`,
    [organizationId, actorUserId || null]
  );
  return rows[0] || null;
}

export async function getTelegramBotSettingsByOrganization(organizationId, options = {}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId) {
    return null;
  }
  try {
    const row = await ensureSettingsRow({
      organizationId: normalizedOrganizationId,
      actorUserId: options.actorUserId || null
    });
    return row ? mapSettingsRow(row, options) : null;
  } catch (error) {
    if (isTelegramSchemaMissing(error)) {
      return null;
    }
    throw error;
  }
}

export async function saveTelegramBotSettings({
  organizationId,
  actorUserId = null,
  botToken,
  clearBotToken = false,
  isActive,
  defaultLanguage,
  cancelLockMinutes,
  reminder24hHours,
  reminder2hHours,
  reminder24hEnabled,
  reminder2hEnabled,
  managerNotificationPermissionCodes,
  templates
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId) {
    return null;
  }

  const existingRow = await ensureSettingsRow({
    organizationId: normalizedOrganizationId,
    actorUserId
  });
  const existing = mapSettingsRow(existingRow, { includeToken: true });
  const nextToken = clearBotToken
    ? ""
    : (
      botToken === undefined
        ? existing.botToken
        : String(botToken || "").trim()
    );
  const nextTemplates = normalizeTemplateMap(templates === undefined ? existing.templates : templates);
  const nextManagerCodes = normalizePermissionCodes(
    managerNotificationPermissionCodes === undefined
      ? existing.managerNotificationPermissionCodes
      : managerNotificationPermissionCodes
  );

  const { rows } = await pool.query(
    `UPDATE telegram_bot_settings
        SET bot_token = NULLIF($2::text, ''),
            is_active = $3,
            default_language = $4,
            cancel_lock_minutes = $5,
            reminder_24h_hours = $6,
            reminder_2h_hours = $7,
            reminder_24h_enabled = $8,
            reminder_2h_enabled = $9,
            manager_notification_permission_codes = $10::text[],
            templates = $11::jsonb,
            updated_by = $12,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $1
      RETURNING *`,
    [
      normalizedOrganizationId,
      nextToken,
      isActive === undefined ? existing.isActive : Boolean(isActive),
      defaultLanguage === undefined ? DEFAULT_LANGUAGE : normalizeLanguage(defaultLanguage, DEFAULT_LANGUAGE),
      toBoundedInteger(cancelLockMinutes, existing.cancelLockMinutes, 0, 10080),
      toBoundedInteger(reminder24hHours, existing.reminder24hHours, 0, MAX_REMINDER_HOURS),
      toBoundedInteger(reminder2hHours, existing.reminder2hHours, 0, MAX_REMINDER_HOURS),
      reminder24hEnabled === undefined ? existing.reminder24hEnabled : Boolean(reminder24hEnabled),
      reminder2hEnabled === undefined ? existing.reminder2hEnabled : Boolean(reminder2hEnabled),
      nextManagerCodes.length > 0 ? nextManagerCodes : [...DEFAULT_MANAGER_NOTIFICATION_PERMISSION_CODES],
      JSON.stringify(nextTemplates),
      actorUserId || null
    ]
  );
  return rows[0] ? mapSettingsRow(rows[0]) : null;
}

export async function setTelegramWebhookForOrganization({
  organizationId,
  baseUrl,
  actorUserId = null
}) {
  const settings = await getTelegramBotSettingsByOrganization(organizationId, { includeToken: true, actorUserId });
  if (!settings?.botToken) {
    const error = new Error("Telegram bot token is required.");
    error.statusCode = 400;
    throw error;
  }
  const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(normalizedBaseUrl)) {
    const error = new Error("Webhook base URL must use HTTPS.");
    error.statusCode = 400;
    throw error;
  }
  const webhookUrl = `${normalizedBaseUrl}/api/telegram/webhook/${settings.organizationId}/${settings.webhookSecret}`;
  await callTelegramApi(settings.botToken, "setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false
  });
  const { rows } = await pool.query(
    `UPDATE telegram_bot_settings
        SET webhook_url = $2,
            last_error = NULL,
            updated_by = $3,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $1
      RETURNING *`,
    [settings.organizationId, webhookUrl, actorUserId || null]
  );
  return rows[0] ? mapSettingsRow(rows[0]) : null;
}

export async function deleteTelegramWebhookForOrganization({ organizationId, actorUserId = null }) {
  const settings = await getTelegramBotSettingsByOrganization(organizationId, { includeToken: true, actorUserId });
  if (!settings?.botToken) {
    const error = new Error("Telegram bot token is required.");
    error.statusCode = 400;
    throw error;
  }
  await callTelegramApi(settings.botToken, "deleteWebhook", { drop_pending_updates: false });
  const { rows } = await pool.query(
    `UPDATE telegram_bot_settings
        SET webhook_url = NULL,
            last_error = NULL,
            updated_by = $2,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $1
      RETURNING *`,
    [settings.organizationId, actorUserId || null]
  );
  return rows[0] ? mapSettingsRow(rows[0]) : null;
}

export async function testTelegramBotToken(organizationId) {
  const settings = await getTelegramBotSettingsByOrganization(organizationId, { includeToken: true });
  if (!settings?.botToken) {
    const error = new Error("Telegram bot token is required.");
    error.statusCode = 400;
    throw error;
  }
  return callTelegramApi(settings.botToken, "getMe", {});
}

async function findParentAccount({ organizationId, telegramUserId, chatId, db = pool }) {
  const { rows } = await db.query(
    `SELECT *
       FROM telegram_parent_accounts
      WHERE organization_id = $1
        AND (
          telegram_user_id = $2::bigint
          OR chat_id = $3::bigint
        )
      ORDER BY is_active DESC, updated_at DESC
      LIMIT 1`,
    [organizationId, telegramUserId || null, chatId || null]
  );
  const row = rows[0] || null;
  return row ? {
    id: normalizePositiveInteger(row.id),
    organizationId: normalizePositiveInteger(row.organization_id),
    telegramUserId: String(row.telegram_user_id || "").trim(),
    chatId: String(row.chat_id || "").trim(),
    phoneNumber: String(row.phone_number || "").trim(),
    phoneDigits: String(row.phone_digits || "").trim(),
    language: normalizeLanguage(row.language),
    isActive: Boolean(row.is_active)
  } : null;
}

async function upsertParentAccount({
  organizationId,
  telegramUserId,
  chatId,
  phoneNumber,
  language
}) {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  const phoneDigits = normalizePhoneDigits(phoneNumber);
  const normalizedLanguage = normalizeLanguage(language);
  const { rows } = await pool.query(
    `INSERT INTO telegram_parent_accounts (
       organization_id,
       telegram_user_id,
       chat_id,
       phone_number,
       phone_digits,
       language,
       is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,TRUE)
     ON CONFLICT (organization_id, telegram_user_id)
     DO UPDATE SET
       chat_id = EXCLUDED.chat_id,
       phone_number = EXCLUDED.phone_number,
       phone_digits = EXCLUDED.phone_digits,
       language = EXCLUDED.language,
       is_active = TRUE,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      organizationId,
      telegramUserId,
      chatId,
      normalizedPhoneNumber,
      phoneDigits,
      normalizedLanguage
    ]
  );
  return findParentAccount({
    organizationId,
    telegramUserId: rows[0]?.telegram_user_id,
    chatId: rows[0]?.chat_id
  });
}

async function listParentClients(parent) {
  if (!parent?.phoneDigits) {
    return [];
  }
  const { rows } = await pool.query(
    `SELECT
       c.id,
       c.first_name,
       c.last_name,
       c.middle_name,
       c.birthday
      FROM clients c
     WHERE c.organization_id = $1
       AND regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g') = $2
     ORDER BY LOWER(TRIM(c.last_name)) ASC, LOWER(TRIM(c.first_name)) ASC, c.id ASC`,
    [parent.organizationId, parent.phoneDigits]
  );
  return rows || [];
}

async function getParentAppointment({ parent, appointmentId }) {
  const normalizedAppointmentId = normalizePositiveInteger(appointmentId);
  if (!parent?.phoneDigits || !normalizedAppointmentId) {
    return null;
  }
  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.organization_id,
       s.specialist_id,
       s.client_id,
       s.appointment_date::text AS appointment_date,
       COALESCE(TO_CHAR(s.start_time, 'HH24:MI'), '') AS start_time,
       COALESCE(TO_CHAR(s.end_time, 'HH24:MI'), '') AS end_time,
       s.duration_minutes,
       s.service_name,
       s.status,
       s.note,
       c.first_name,
       c.last_name,
       c.middle_name,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), 'Specialist #' || s.specialist_id::text) AS specialist_name,
       COALESCE(apr.response_status, '') AS parent_response_status
      FROM appointment_schedules s
      JOIN clients c
        ON c.id = s.client_id
       AND c.organization_id = s.organization_id
      LEFT JOIN users u
        ON u.id = s.specialist_id
       AND u.organization_id = s.organization_id
      LEFT JOIN LATERAL (
        SELECT response_status
          FROM appointment_parent_responses apr
         WHERE apr.organization_id = s.organization_id
           AND apr.appointment_schedule_id = s.id
           AND apr.parent_account_id = $3
         ORDER BY apr.responded_at DESC, apr.id DESC
         LIMIT 1
      ) apr ON TRUE
     WHERE s.organization_id = $1
       AND s.id = $2
       AND regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g') = $4
     LIMIT 1`,
    [parent.organizationId, normalizedAppointmentId, parent.id, parent.phoneDigits]
  );
  return rows[0] ? mapAppointmentRow(rows[0]) : null;
}

async function listParentAppointments({ parent, dateFrom, dateTo }) {
  if (!parent?.phoneDigits || !dateFrom || !dateTo) {
    return [];
  }
  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.organization_id,
       s.specialist_id,
       s.client_id,
       s.appointment_date::text AS appointment_date,
       COALESCE(TO_CHAR(s.start_time, 'HH24:MI'), '') AS start_time,
       COALESCE(TO_CHAR(s.end_time, 'HH24:MI'), '') AS end_time,
       s.duration_minutes,
       s.service_name,
       s.status,
       s.note,
       c.first_name,
       c.last_name,
       c.middle_name,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), 'Specialist #' || s.specialist_id::text) AS specialist_name,
       COALESCE(apr.response_status, '') AS parent_response_status
      FROM appointment_schedules s
      JOIN clients c
        ON c.id = s.client_id
       AND c.organization_id = s.organization_id
      LEFT JOIN users u
        ON u.id = s.specialist_id
       AND u.organization_id = s.organization_id
      LEFT JOIN LATERAL (
        SELECT response_status
          FROM appointment_parent_responses apr
         WHERE apr.organization_id = s.organization_id
           AND apr.appointment_schedule_id = s.id
           AND apr.parent_account_id = $4
         ORDER BY apr.responded_at DESC, apr.id DESC
         LIMIT 1
      ) apr ON TRUE
     WHERE s.organization_id = $1
       AND s.appointment_date BETWEEN $2::date AND $3::date
       AND regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g') = $5
     ORDER BY s.appointment_date ASC, s.start_time ASC, s.id ASC`,
    [parent.organizationId, dateFrom, dateTo, parent.id, parent.phoneDigits]
  );
  return (rows || []).map(mapAppointmentRow);
}

async function upsertParentResponse({ parent, appointment, responseStatus, reason = "", db = pool }) {
  await db.query(
    `INSERT INTO appointment_parent_responses (
       organization_id,
       appointment_schedule_id,
       parent_account_id,
       client_id,
       response_status,
       reason,
       responded_at
     ) VALUES ($1,$2,$3,$4,$5,NULLIF($6::text, ''),CURRENT_TIMESTAMP)
     ON CONFLICT (organization_id, appointment_schedule_id, parent_account_id)
     DO UPDATE SET
       response_status = EXCLUDED.response_status,
       reason = EXCLUDED.reason,
       responded_at = CURRENT_TIMESTAMP`,
    [
      parent.organizationId,
      appointment.id,
      parent.id,
      appointment.clientId,
      responseStatus,
      String(reason || "").trim().slice(0, MAX_REASON_LENGTH)
    ]
  );
}

async function setPendingCancelReason({ parent, appointmentId }) {
  const expiresAt = new Date(Date.now() + PENDING_ACTION_TTL_MINUTES * 60000);
  await pool.query(
    `INSERT INTO telegram_parent_pending_actions (
       organization_id,
       parent_account_id,
       action_type,
       appointment_schedule_id,
       expires_at
     ) VALUES ($1,$2,'cancel_reason',$3,$4)
     ON CONFLICT (organization_id, parent_account_id, action_type)
     DO UPDATE SET
       appointment_schedule_id = EXCLUDED.appointment_schedule_id,
       expires_at = EXCLUDED.expires_at,
       created_at = CURRENT_TIMESTAMP`,
    [parent.organizationId, parent.id, appointmentId, expiresAt]
  );
}

async function popPendingAction(parent) {
  const { rows } = await pool.query(
    `DELETE FROM telegram_parent_pending_actions
      WHERE organization_id = $1
        AND parent_account_id = $2
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING *`,
    [parent.organizationId, parent.id]
  );
  return rows[0] || null;
}

async function deletePendingCancelAction({ parent, appointmentId = null }) {
  const params = [parent.organizationId, parent.id];
  let appointmentSql = "";
  if (appointmentId) {
    params.push(appointmentId);
    appointmentSql = `AND appointment_schedule_id = $${params.length}`;
  }
  await pool.query(
    `DELETE FROM telegram_parent_pending_actions
      WHERE organization_id = $1
        AND parent_account_id = $2
        AND action_type = 'cancel_reason'
        ${appointmentSql}`,
    params
  );
}

function formatAppointmentMessage(language, appointment) {
  const statusText = appointment.parentResponseStatus === "coming"
    ? " ✅"
    : (appointment.status === "cancelled" ? " ❌" : "");
  return [
    `${appointment.appointmentDate} ${appointment.startTime}${statusText}`,
    `${getClientName(appointment)} - ${appointment.serviceName}`,
    getSpecialistName(appointment)
  ].filter(Boolean).join("\n");
}

async function sendChildrenList({ settings, parent }) {
  const clients = await listParentClients(parent);
  if (clients.length === 0) {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "noChildren"),
      replyMarkup: buildMainMenuReplyMarkup(parent.language)
    });
    return;
  }
  const lines = [
    getText(parent.language, "childrenTitle"),
    ...clients.map((client, index) => `${index + 1}. ${getClientName(client)}`)
  ];
  await sendTelegramMessage({
    token: settings.botToken,
    chatId: parent.chatId,
    text: lines.join("\n"),
    replyMarkup: buildMainMenuReplyMarkup(parent.language)
  });
}

async function sendScheduleList({ settings, parent, dateFrom, dateTo, title }) {
  const items = await listParentAppointments({ parent, dateFrom, dateTo });
  if (items.length === 0) {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: `${title}\n${getText(parent.language, "noLessons")}`,
      replyMarkup: buildMainMenuReplyMarkup(parent.language)
    });
    return;
  }

  await sendTelegramMessage({
    token: settings.botToken,
    chatId: parent.chatId,
    text: title,
    replyMarkup: buildMainMenuReplyMarkup(parent.language)
  });

  for (const item of items) {
    const replyMarkup = ACTIVE_APPOINTMENT_STATUSES.has(item.status)
      ? buildAppointmentButtons(parent.language, item.id)
      : undefined;
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: formatAppointmentMessage(parent.language, item),
      replyMarkup
    });
  }
}

async function sendMessagesList({ settings, parent }) {
  const { rows } = await pool.query(
    `SELECT message, sent_at
       FROM telegram_parent_messages
      WHERE organization_id = $1
        AND parent_account_id = $2
      ORDER BY sent_at DESC, id DESC
      LIMIT 10`,
    [parent.organizationId, parent.id]
  );
  if (rows.length === 0) {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "noMessages"),
      replyMarkup: buildMainMenuReplyMarkup(parent.language)
    });
    return;
  }
  const lines = [
    getText(parent.language, "messagesTitle"),
    ...rows.map((row, index) => `${index + 1}. ${String(row?.message || "").trim()}`)
  ];
  await sendTelegramMessage({
    token: settings.botToken,
    chatId: parent.chatId,
    text: lines.join("\n\n"),
    replyMarkup: buildMainMenuReplyMarkup(parent.language)
  });
}

async function sendSettingsMenu({ settings, parent, messagePrefix = "" }) {
  const lines = [
    String(messagePrefix || "").trim(),
    getText(parent.language, "settingsTitle"),
    getText(parent.language, "settingsPrompt")
  ].filter(Boolean);
  await sendTelegramMessage({
    token: settings.botToken,
    chatId: parent.chatId,
    text: lines.join("\n"),
    replyMarkup: buildSettingsMenuReplyMarkup(parent.language)
  });
}

async function markParentComing({ settings, parent, appointmentId }) {
  const appointment = await getParentAppointment({ parent, appointmentId });
  if (!appointment || !ACTIVE_APPOINTMENT_STATUSES.has(appointment.status)) {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "notFound")
    });
    return;
  }
  await upsertParentResponse({
    parent,
    appointment,
    responseStatus: "coming"
  });
  await deletePendingCancelAction({ parent, appointmentId: appointment.id });
  await sendTelegramMessage({
    token: settings.botToken,
    chatId: parent.chatId,
    text: getText(parent.language, "comingSaved")
  });
}

async function notifyStaffAboutParentCancel({ settings, appointment, reason }) {
  const messageTemplate = settings.templates?.uz?.parentCancelNotification
    || DEFAULT_TEMPLATES.uz.parentCancelNotification;
  const message = renderTemplate(messageTemplate, {
    child: getClientName(appointment),
    date: appointment.appointmentDate,
    time: appointment.startTime,
    service: appointment.serviceName,
    reason
  });
  await persistNotificationEvent({
    organizationId: appointment.organizationId,
    sourceUserId: 0,
    eventType: "appointment-parent-cancelled",
    message,
    targetUserIds: [appointment.specialistId].filter(Boolean),
    targetPermissionCodes: settings.managerNotificationPermissionCodes,
    payload: {
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      specialistId: appointment.specialistId,
      appointmentDate: appointment.appointmentDate,
      startTime: appointment.startTime,
      serviceName: appointment.serviceName,
      reason
    },
    aggregateType: "appointment",
    aggregateId: String(appointment.id)
  }).catch(() => {});
}

async function cancelParentAppointment({ settings, parent, appointmentId, reason = "" }) {
  const appointment = await getParentAppointment({ parent, appointmentId });
  if (!appointment || !ACTIVE_APPOINTMENT_STATUSES.has(appointment.status)) {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "notFound")
    });
    return;
  }

  if (isCancelLocked(appointment.appointmentDate, appointment.startTime, settings.cancelLockMinutes)) {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "cancelLocked")
    });
    return;
  }

  const normalizedReason = String(reason || "").trim().slice(0, MAX_REASON_LENGTH)
    || getText(parent.language, "fallbackReason");

  await executeTransaction(async (db) => {
    await updateAppointmentSchedulesByIds({
      organizationId: appointment.organizationId,
      actorUserId: null,
      ids: [appointment.id],
      specialistId: appointment.specialistId,
      clientId: appointment.clientId,
      appointmentDate: appointment.appointmentDate,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      durationMinutes: appointment.durationMinutes,
      serviceName: appointment.serviceName,
      status: "cancelled",
      note: normalizedReason,
      db
    });
    await upsertParentResponse({
      parent,
      appointment,
      responseStatus: "not_coming",
      reason: normalizedReason,
      db
    });
    await db.query(
      `DELETE FROM telegram_parent_pending_actions
        WHERE organization_id = $1
          AND parent_account_id = $2
          AND action_type = 'cancel_reason'`,
      [parent.organizationId, parent.id]
    );
  });

  await notifyStaffAboutParentCancel({ settings, appointment, reason: normalizedReason });
  await sendTelegramMessage({
    token: settings.botToken,
    chatId: parent.chatId,
    text: getText(parent.language, "cancelSaved")
  });
}

async function handleContactMessage({ settings, message }) {
  const contact = message?.contact;
  const from = message?.from || {};
  const chat = message?.chat || {};
  const language = normalizeLanguage(settings.defaultLanguage);
  if (!contact?.phone_number) {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: chat.id,
      text: getText(language, "contactOnly"),
      replyMarkup: buildContactReplyMarkup(language)
    });
    return;
  }
  if (contact.user_id && String(contact.user_id) !== String(from.id)) {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: chat.id,
      text: getText(language, "contactMismatch"),
      replyMarkup: buildContactReplyMarkup(language)
    });
    return;
  }

  const parent = await upsertParentAccount({
    organizationId: settings.organizationId,
    telegramUserId: from.id,
    chatId: chat.id,
    phoneNumber: contact.phone_number,
    language
  });
  await sendTelegramMessage({
    token: settings.botToken,
    chatId: parent.chatId,
    text: getText(parent.language, "linked"),
    replyMarkup: buildMainMenuReplyMarkup(parent.language)
  });
  await sendChildrenList({ settings, parent });
}

async function requireParentOrAskContact({ settings, from, chat }) {
  const language = normalizeLanguage(settings.defaultLanguage);
  const parent = await findParentAccount({
    organizationId: settings.organizationId,
    telegramUserId: from?.id,
    chatId: chat?.id
  });
  if (parent?.isActive && parent.phoneDigits) {
    return parent;
  }
  await sendTelegramMessage({
    token: settings.botToken,
    chatId: chat.id,
    text: getText(language, "shareContact"),
    replyMarkup: buildContactReplyMarkup(language)
  });
  return null;
}

async function handleTextMessage({ settings, message }) {
  const from = message?.from || {};
  const chat = message?.chat || {};
  const text = String(message?.text || "").trim();
  const parent = await requireParentOrAskContact({ settings, from, chat });
  if (!parent) {
    return;
  }

  const action = resolveMenuAction(text);
  if (!action) {
    const pending = await popPendingAction(parent);
    if (pending?.action_type === "cancel_reason") {
      await cancelParentAppointment({
        settings,
        parent,
        appointmentId: pending.appointment_schedule_id,
        reason: text
      });
      return;
    }
  }

  if (action === "start") {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "linked"),
      replyMarkup: buildMainMenuReplyMarkup(parent.language)
    });
    return;
  }
  if (action === "language_uz" || action === "language_ru") {
    const nextParent = await updateParentLanguage({
      parent,
      language: action === "language_ru" ? "ru" : "uz"
    });
    await sendSettingsMenu({
      settings,
      parent: nextParent,
      messagePrefix: getText(nextParent.language, "languageSaved")
    });
    return;
  }
  if (action === "main") {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "mainMenuTitle"),
      replyMarkup: buildMainMenuReplyMarkup(parent.language)
    });
    return;
  }
  if (action === "change_contact") {
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "shareContact"),
      replyMarkup: buildContactReplyMarkup(parent.language)
    });
    return;
  }
  if (action === "children") {
    await sendChildrenList({ settings, parent });
    return;
  }
  if (action === "today") {
    const today = toDateYmdInTashkent();
    await sendScheduleList({
      settings,
      parent,
      dateFrom: today,
      dateTo: today,
      title: getText(parent.language, "todaySchedule")
    });
    return;
  }
  if (action === "week") {
    const today = toDateYmdInTashkent();
    await sendScheduleList({
      settings,
      parent,
      dateFrom: today,
      dateTo: shiftDateYmd(today, 6),
      title: getText(parent.language, "weekSchedule")
    });
    return;
  }
  if (action === "messages") {
    await sendMessagesList({ settings, parent });
    return;
  }
  if (action === "settings") {
    await sendSettingsMenu({ settings, parent });
    return;
  }

  await sendTelegramMessage({
    token: settings.botToken,
    chatId: parent.chatId,
    text: getText(parent.language, "shareContact"),
    replyMarkup: buildMainMenuReplyMarkup(parent.language)
  });
}

async function updateParentLanguage({ parent, language }) {
  const normalizedLanguage = normalizeLanguage(language, parent.language);
  await pool.query(
    `UPDATE telegram_parent_accounts
        SET language = $3,
            updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $1
        AND id = $2`,
    [parent.organizationId, parent.id, normalizedLanguage]
  );
  return { ...parent, language: normalizedLanguage };
}

async function handleCallbackQuery({ settings, callbackQuery }) {
  const from = callbackQuery?.from || {};
  const message = callbackQuery?.message || {};
  const chat = message?.chat || {};
  const data = String(callbackQuery?.data || "").trim();
  const parent = await requireParentOrAskContact({ settings, from, chat });
  if (!parent) {
    return;
  }

  if (data.startsWith("lang:")) {
    const nextParent = await updateParentLanguage({ parent, language: data.slice(5) });
    await answerCallbackQuery({
      token: settings.botToken,
      callbackQueryId: callbackQuery.id,
      text: getText(nextParent.language, "languageSaved")
    });
    await sendSettingsMenu({
      settings,
      parent: nextParent,
      messagePrefix: getText(nextParent.language, "languageSaved")
    });
    return;
  }

  if (data === "settings:contact") {
    await answerCallbackQuery({ token: settings.botToken, callbackQueryId: callbackQuery.id });
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "shareContact"),
      replyMarkup: buildContactReplyMarkup(parent.language)
    });
    return;
  }

  if (data === "settings:back") {
    await answerCallbackQuery({ token: settings.botToken, callbackQueryId: callbackQuery.id });
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "mainMenuTitle"),
      replyMarkup: buildMainMenuReplyMarkup(parent.language)
    });
    return;
  }

  const [, action, rawId] = data.split(":");
  const appointmentId = normalizePositiveInteger(rawId);
  if (!appointmentId) {
    await answerCallbackQuery({ token: settings.botToken, callbackQueryId: callbackQuery.id });
    return;
  }

  if (action === "coming") {
    await answerCallbackQuery({ token: settings.botToken, callbackQueryId: callbackQuery.id });
    await markParentComing({ settings, parent, appointmentId });
    return;
  }

  if (action === "cancel") {
    const appointment = await getParentAppointment({ parent, appointmentId });
    if (!appointment || !ACTIVE_APPOINTMENT_STATUSES.has(appointment.status)) {
      await answerCallbackQuery({
        token: settings.botToken,
        callbackQueryId: callbackQuery.id,
        text: getText(parent.language, "notFound")
      });
      return;
    }
    if (isCancelLocked(appointment.appointmentDate, appointment.startTime, settings.cancelLockMinutes)) {
      await answerCallbackQuery({
        token: settings.botToken,
        callbackQueryId: callbackQuery.id,
        text: getText(parent.language, "cancelLocked")
      });
      await sendTelegramMessage({
        token: settings.botToken,
        chatId: parent.chatId,
        text: getText(parent.language, "cancelLocked")
      });
      return;
    }
    await setPendingCancelReason({ parent, appointmentId });
    await answerCallbackQuery({ token: settings.botToken, callbackQueryId: callbackQuery.id });
    await sendTelegramMessage({
      token: settings.botToken,
      chatId: parent.chatId,
      text: getText(parent.language, "reasonPrompt"),
      replyMarkup: buildCancelReasonButtons(parent.language, appointmentId)
    });
    return;
  }

  if (action === "cancel-skip") {
    await answerCallbackQuery({ token: settings.botToken, callbackQueryId: callbackQuery.id });
    await cancelParentAppointment({ settings, parent, appointmentId, reason: "" });
  }
}

export async function handleTelegramUpdate({ organizationId, webhookSecret, update }) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId || !update || typeof update !== "object") {
    return { ok: true };
  }
  const settings = await getTelegramBotSettingsByOrganization(normalizedOrganizationId, { includeToken: true });
  if (
    !settings?.isActive
    || !settings.botToken
    || String(settings.webhookSecret || "") !== String(webhookSecret || "")
  ) {
    return { ok: true };
  }

  const message = update.message;
  const callbackQuery = update.callback_query;
  if (message?.contact) {
    await handleContactMessage({ settings, message });
  } else if (message?.text) {
    await handleTextMessage({ settings, message });
  } else if (callbackQuery) {
    await handleCallbackQuery({ settings, callbackQuery });
  }
  return { ok: true };
}

async function listParentsForClient({ organizationId, clientId }) {
  const { rows } = await pool.query(
    `SELECT
       pa.id,
       pa.organization_id,
       pa.telegram_user_id,
       pa.chat_id,
       pa.phone_number,
       pa.phone_digits,
       pa.language,
       c.first_name,
       c.last_name,
       c.middle_name
      FROM clients c
      JOIN telegram_parent_accounts pa
        ON pa.organization_id = c.organization_id
       AND pa.is_active = TRUE
       AND pa.phone_digits = regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g')
     WHERE c.organization_id = $1
       AND c.id = $2`,
    [organizationId, clientId]
  );
  return (rows || []).map((row) => ({
    id: normalizePositiveInteger(row.id),
    organizationId: normalizePositiveInteger(row.organization_id),
    chatId: String(row.chat_id || "").trim(),
    language: normalizeLanguage(row.language),
    first_name: row.first_name,
    last_name: row.last_name,
    middle_name: row.middle_name
  })).filter((item) => item.id && item.chatId);
}

function normalizeNotificationItem(item) {
  return {
    id: normalizePositiveInteger(item?.id || item?.appointmentId),
    organizationId: normalizePositiveInteger(item?.organizationId || item?.organization_id),
    specialistId: normalizePositiveInteger(item?.specialistId || item?.specialist_id),
    specialistName: String(item?.specialistName || item?.specialist_name || "").trim(),
    clientId: normalizePositiveInteger(item?.clientId || item?.client_id),
    appointmentDate: String(item?.appointmentDate || item?.appointment_date || "").trim(),
    startTime: normalizeTimeHm(item?.startTime || item?.start_time),
    endTime: normalizeTimeHm(item?.endTime || item?.end_time),
    serviceName: String(item?.serviceName || item?.service_name || "Service").trim(),
    status: String(item?.status || "").trim().toLowerCase(),
    note: String(item?.note || "").trim(),
    first_name: String(item?.firstName || item?.first_name || "").trim(),
    last_name: String(item?.lastName || item?.last_name || "").trim(),
    middle_name: String(item?.middleName || item?.middle_name || "").trim()
  };
}

function getTemplateKeyForEvent(eventType, item) {
  const type = String(eventType || "").trim().toLowerCase();
  if (type.includes("deleted")) {
    return "scheduleDeleted";
  }
  if (String(item?.status || "").trim().toLowerCase() === "cancelled") {
    return "lessonCancelled";
  }
  if (type.includes("created")) {
    return "scheduleCreated";
  }
  return "scheduleChanged";
}

function buildParentNotificationMessage({ settings, parent, item, eventType, actorName }) {
  const language = normalizeLanguage(parent.language, settings.defaultLanguage);
  const templates = settings.templates?.[language] || DEFAULT_TEMPLATES[language];
  const templateKey = getTemplateKeyForEvent(eventType, item);
  const reason = String(item.note || "").trim()
    || (language === "ru" ? "не указано" : "ko'rsatilmagan");
  return renderTemplate(templates[templateKey] || DEFAULT_TEMPLATES[language][templateKey], {
    child: getClientName({ ...item, ...parent }),
    date: item.appointmentDate,
    time: item.startTime,
    service: item.serviceName,
    specialist: item.specialistName,
    actor: String(actorName || item.specialistName || "CRM").trim(),
    reason
  });
}

export async function notifyTelegramParentsForAppointmentChange({
  organizationId,
  eventType,
  items = [],
  actorName = ""
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map(normalizeNotificationItem)
    .filter((item) => item.id && item.clientId);
  if (!normalizedOrganizationId || normalizedItems.length === 0) {
    return { sentCount: 0 };
  }

  try {
    const settings = await getTelegramBotSettingsByOrganization(normalizedOrganizationId, { includeToken: true });
    if (!settings?.isActive || !settings.botToken) {
      return { sentCount: 0 };
    }

    let sentCount = 0;
    for (const item of normalizedItems) {
      const parents = await listParentsForClient({
        organizationId: normalizedOrganizationId,
        clientId: item.clientId
      });
      for (const parent of parents) {
        const message = buildParentNotificationMessage({
          settings,
          parent,
          item,
          eventType,
          actorName
        });
        const replyMarkup = ACTIVE_APPOINTMENT_STATUSES.has(item.status)
          ? buildAppointmentButtons(parent.language, item.id)
          : undefined;
        await sendAndLogParentMessage({
          settings,
          parent,
          appointmentScheduleId: String(eventType || "").includes("deleted") ? null : item.id,
          eventType,
          message,
          replyMarkup
        });
        sentCount += 1;
      }
    }
    return { sentCount };
  } catch (error) {
    if (isTelegramSchemaMissing(error)) {
      return { sentCount: 0 };
    }
    throw error;
  }
}

async function listReminderTargets({ reminderType, limit = 100 }) {
  const enabledColumn = reminderType === "reminder_24h" ? "reminder_24h_enabled" : "reminder_2h_enabled";
  const hoursColumn = reminderType === "reminder_24h" ? "reminder_24h_hours" : "reminder_2h_hours";
  const { rows } = await pool.query(
    `SELECT
       tbs.*,
       pa.id AS parent_account_id,
       pa.chat_id,
       pa.language,
       s.id AS appointment_id,
       s.appointment_date::text AS appointment_date,
       COALESCE(TO_CHAR(s.start_time, 'HH24:MI'), '') AS start_time,
       COALESCE(TO_CHAR(s.end_time, 'HH24:MI'), '') AS end_time,
       s.service_name,
       s.status,
       s.note,
       s.client_id,
       s.specialist_id,
       c.first_name,
       c.last_name,
       c.middle_name,
       COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), 'Specialist #' || s.specialist_id::text) AS specialist_name
      FROM telegram_bot_settings tbs
      JOIN telegram_parent_accounts pa
        ON pa.organization_id = tbs.organization_id
       AND pa.is_active = TRUE
      JOIN clients c
        ON c.organization_id = tbs.organization_id
       AND regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g') = pa.phone_digits
      JOIN appointment_schedules s
        ON s.organization_id = c.organization_id
       AND s.client_id = c.id
      LEFT JOIN users u
        ON u.organization_id = s.organization_id
       AND u.id = s.specialist_id
     WHERE tbs.is_active = TRUE
       AND tbs.bot_token IS NOT NULL
       AND tbs.${enabledColumn} = TRUE
       AND tbs.${hoursColumn} > 0
       AND s.status IN ('pending', 'confirmed')
       AND (s.appointment_date + s.start_time) >= (TIMEZONE('Asia/Tashkent', NOW()) + (tbs.${hoursColumn}::text || ' hours')::interval)
       AND (s.appointment_date + s.start_time) < (TIMEZONE('Asia/Tashkent', NOW()) + ((tbs.${hoursColumn} + 1)::text || ' hours')::interval)
     ORDER BY s.appointment_date ASC, s.start_time ASC, s.id ASC
     LIMIT $1`,
    [limit]
  );
  return rows || [];
}

async function sendReminderRow({ row, reminderType }) {
  const settings = mapSettingsRow(row, { includeToken: true });
  const parent = {
    id: normalizePositiveInteger(row.parent_account_id),
    organizationId: normalizePositiveInteger(row.organization_id),
    chatId: String(row.chat_id || "").trim(),
    language: normalizeLanguage(row.language, settings.defaultLanguage)
  };
  const item = mapAppointmentRow({
    ...row,
    id: row.appointment_id,
    organization_id: row.organization_id,
    specialist_name: row.specialist_name
  });
  const language = parent.language;
  const templateKey = reminderType === "reminder_24h" ? "reminder24h" : "reminder2h";
  const template = settings.templates?.[language]?.[templateKey] || DEFAULT_TEMPLATES[language][templateKey];
  const message = renderTemplate(template, {
    child: getClientName(item),
    date: item.appointmentDate,
    time: item.startTime,
    service: item.serviceName,
    specialist: item.specialistName
  });
  await sendAndLogParentMessage({
    settings,
    parent,
    appointmentScheduleId: item.id,
    eventType: reminderType,
    message,
    replyMarkup: buildAppointmentButtons(language, item.id),
    dedupeKey: `${reminderType}:${item.id}:${parent.id}`
  });
}

export async function runTelegramReminderSweep({ logger = null } = {}) {
  try {
    const reminder24hRows = await listReminderTargets({
      reminderType: "reminder_24h"
    });
    for (const row of reminder24hRows) {
      await sendReminderRow({ row, reminderType: "reminder_24h" });
    }

    const reminder2hRows = await listReminderTargets({
      reminderType: "reminder_2h"
    });
    for (const row of reminder2hRows) {
      await sendReminderRow({ row, reminderType: "reminder_2h" });
    }
  } catch (error) {
    if (!isTelegramSchemaMissing(error)) {
      logger?.error?.({ err: error }, "Telegram reminder sweep failed");
    }
  }
}

export function startTelegramReminderWorker({ logger = null } = {}) {
  if (String(process.env.TELEGRAM_REMINDER_WORKER_ENABLED || "true").trim().toLowerCase() === "false") {
    return () => {};
  }
  const timer = setInterval(() => {
    void runTelegramReminderSweep({ logger });
  }, REMINDER_SWEEP_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

export const __telegramBotServiceContracts = Object.freeze({
  normalizePhoneDigits,
  normalizeTemplateMap,
  renderTemplate,
  isCancelLocked
});
