import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../../lib/api.js";

const DEFAULT_TEMPLATES = Object.freeze({
  uz: Object.freeze({
    lessonCancelled: "",
    scheduleChanged: "",
    scheduleSeriesChanged: "",
    scheduleCreated: "",
    scheduleDeleted: "",
    scheduleSeriesDeleted: "",
    specialistLessonsDeleted: "",
    reminder24h: "",
    reminder2h: "",
    parentCancelNotification: ""
  }),
  ru: Object.freeze({
    lessonCancelled: "",
    scheduleChanged: "",
    scheduleSeriesChanged: "",
    scheduleCreated: "",
    scheduleDeleted: "",
    scheduleSeriesDeleted: "",
    specialistLessonsDeleted: "",
    reminder24h: "",
    reminder2h: "",
    parentCancelNotification: ""
  })
});

const TEMPLATE_FIELDS = Object.freeze([
  ["lessonCancelled", "lessonCancelled"],
  ["scheduleChanged", "scheduleChanged"],
  ["scheduleSeriesChanged", "scheduleSeriesChanged"],
  ["scheduleCreated", "scheduleCreated"],
  ["scheduleDeleted", "scheduleDeleted"],
  ["scheduleSeriesDeleted", "scheduleSeriesDeleted"],
  ["specialistLessonsDeleted", "specialistLessonsDeleted"],
  ["reminder24h", "reminder24h"],
  ["reminder2h", "reminder2h"],
  ["parentCancelNotification", "parentCancelNotification"]
]);

const UI_TEXT = Object.freeze({
  uz: Object.freeze({
    title: "Telegram bot",
    close: "Telegram bot sozlamalarini yopish",
    loading: "Yuklanmoqda...",
    saved: "Saqlangan.",
    saving: "Saqlanmoqda...",
    save: "Saqlash",
    loadError: "Telegram bot sozlamalarini yuklab bo'lmadi.",
    saveError: "Telegram bot sozlamalarini saqlab bo'lmadi.",
    unexpectedError: "Kutilmagan xato. Iltimos, qayta urinib ko'ring.",
    savedToken: "Saqlangan",
    yes: "ha",
    notSet: "Kiritilmagan",
    botToken: "Bot tokeni",
    mainSettings: "Asosiy sozlamalar",
    reminders: "Eslatmalar",
    templates: "Xabar shablonlari",
    status: "Status",
    activeStatus: "Faol",
    inactiveStatus: "Faol emas",
    cancelLockMinutes: "Bekor qilishni yopish (daqiqa)",
    firstReminderHours: "Birinchi eslatma (darsdan oldin soat)",
    secondReminderHours: "Ikkinchi eslatma (darsdan oldin soat)",
    active: "Faol",
    clearToken: "Tokenni tozalash",
    languageUz: "O'zbekcha",
    languageRu: "Русский",
    templateLabels: Object.freeze({
      lessonCancelled: "Dars bekor qilindi",
      scheduleChanged: "Jadval o'zgardi",
      scheduleSeriesChanged: "Seriyali darslar o'zgardi",
      scheduleCreated: "Dars yaratildi",
      scheduleDeleted: "Dars o'chirildi",
      scheduleSeriesDeleted: "Seriyali darslar bekor qilindi",
      specialistLessonsDeleted: "Mutaxassis darslari bekor qilindi",
      reminder24h: "Birinchi eslatma",
      reminder2h: "Ikkinchi eslatma",
      parentCancelNotification: "Ota-ona bekor qilishi"
    })
  }),
  ru: Object.freeze({
    title: "Telegram-бот",
    close: "Закрыть настройки Telegram-бота",
    loading: "Загрузка...",
    saved: "Сохранено.",
    saving: "Сохранение...",
    save: "Сохранить",
    loadError: "Не удалось загрузить настройки Telegram-бота.",
    saveError: "Не удалось сохранить настройки Telegram-бота.",
    unexpectedError: "Неожиданная ошибка. Попробуйте еще раз.",
    savedToken: "Сохранен",
    yes: "да",
    notSet: "Не задан",
    botToken: "Токен бота",
    mainSettings: "Основные настройки",
    reminders: "Напоминания",
    templates: "Шаблоны сообщений",
    status: "Статус",
    activeStatus: "Активен",
    inactiveStatus: "Не активен",
    cancelLockMinutes: "Блокировка отмены (минуты)",
    firstReminderHours: "Первое напоминание (часов до занятия)",
    secondReminderHours: "Второе напоминание (часов до занятия)",
    active: "Активен",
    clearToken: "Очистить токен",
    languageUz: "O'zbekcha",
    languageRu: "Русский",
    templateLabels: Object.freeze({
      lessonCancelled: "Занятие отменено",
      scheduleChanged: "Расписание изменено",
      scheduleSeriesChanged: "Серия занятий изменена",
      scheduleCreated: "Занятие создано",
      scheduleDeleted: "Занятие удалено",
      scheduleSeriesDeleted: "Серия занятий отменена",
      specialistLessonsDeleted: "Занятия специалиста отменены",
      reminder24h: "Первое напоминание",
      reminder2h: "Второе напоминание",
      parentCancelNotification: "Отмена родителем"
    })
  })
});

const API_MESSAGE_TRANSLATIONS = Object.freeze({
  uz: Object.freeze({
    "Cancel lock minutes must be between 0 and 10080.": "Bekor qilishni yopish vaqti 0 dan 10080 daqiqagacha bo'lishi kerak.",
    "First reminder hours must be between 0 and 168.": "Birinchi eslatma 0 dan 168 soatgacha bo'lishi kerak.",
    "Second reminder hours must be between 0 and 168.": "Ikkinchi eslatma 0 dan 168 soatgacha bo'lishi kerak.",
    "Bot token is too short.": "Bot tokeni juda qisqa.",
    "Telegram bot token is required.": "Telegram bot tokeni majburiy.",
    "Webhook base URL must use HTTPS.": "Webhook manzili HTTPS bo'lishi kerak.",
    "Forbidden.": "Ruxsat yo'q.",
    "Unauthorized.": "Avtorizatsiyadan o'tilmagan.",
    "Internal server error.": "Serverda ichki xato yuz berdi."
  }),
  ru: Object.freeze({
    "Cancel lock minutes must be between 0 and 10080.": "Блокировка отмены должна быть от 0 до 10080 минут.",
    "First reminder hours must be between 0 and 168.": "Первое напоминание должно быть от 0 до 168 часов.",
    "Second reminder hours must be between 0 and 168.": "Второе напоминание должно быть от 0 до 168 часов.",
    "Bot token is too short.": "Токен бота слишком короткий.",
    "Telegram bot token is required.": "Токен Telegram-бота обязателен.",
    "Webhook base URL must use HTTPS.": "Адрес webhook должен использовать HTTPS.",
    "Forbidden.": "Нет доступа.",
    "Unauthorized.": "Не выполнена авторизация.",
    "Internal server error.": "Внутренняя ошибка сервера."
  })
});

function localizeApiMessage(message, language) {
  const text = String(message || "").trim();
  if (!text) {
    return "";
  }
  return API_MESSAGE_TRANSLATIONS[language]?.[text] || text;
}

function normalizeTemplates(value) {
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

function mapItemToForm(item) {
  const cancelLockMinutes = Number.parseInt(String(item?.cancelLockMinutes ?? 60), 10);
  const hasCancelLockMinutes = Number.isInteger(cancelLockMinutes) && cancelLockMinutes > 0;
  return {
    botToken: "",
    clearBotToken: false,
    isActive: Boolean(item?.isActive),
    cancelLockMinutes: String(hasCancelLockMinutes ? cancelLockMinutes : 60),
    cancelLockEnabled: item?.cancelLockMinutes === undefined ? true : hasCancelLockMinutes,
    reminder24hHours: String(item?.reminder24hHours ?? 24),
    reminder2hHours: String(item?.reminder2hHours ?? 2),
    reminder24hEnabled: item?.reminder24hEnabled !== false,
    reminder2hEnabled: item?.reminder2hEnabled !== false,
    templates: normalizeTemplates(item?.templates)
  };
}

function TelegramBotSettingsPanel({
  canUpdateSettingsTelegramBot,
  onClose
}) {
  const { language } = useI18n();
  const ui = UI_TEXT[language] || UI_TEXT.uz;
  const initialTemplateLanguage = language === "ru" ? "ru" : "uz";
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(() => mapItemToForm(null));
  const [templateLanguage, setTemplateLanguage] = useState(initialTemplateLanguage);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const hasTokenLabel = useMemo(() => (
    item?.hasBotToken ? `${ui.savedToken}: ${item.botTokenMasked || ui.yes}` : ui.notSet
  ), [item?.botTokenMasked, item?.hasBotToken, ui]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await apiFetch("/api/settings/telegram-bot", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setError(localizeApiMessage(getApiErrorMessage(response, data, ui.loadError), language));
        return;
      }
      setItem(data?.item || null);
      setForm(mapItemToForm(data?.item || null));
    } catch {
      setError(ui.unexpectedError);
    } finally {
      setLoading(false);
    }
  }, [language, ui.loadError, ui.unexpectedError]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setTemplateLanguage(language === "ru" ? "ru" : "uz");
  }, [language]);

  const updateTemplate = useCallback((templateLanguageKey, key, value) => {
    setForm((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [templateLanguageKey]: {
          ...prev.templates[templateLanguageKey],
          [key]: value
        }
      }
    }));
  }, []);

  const handleSave = useCallback(async (event) => {
    event.preventDefault();
    if (!canUpdateSettingsTelegramBot || saving) {
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const payload = {
        isActive: form.isActive,
        cancelLockMinutes: form.cancelLockEnabled
          ? Number.parseInt(String(form.cancelLockMinutes || "60"), 10)
          : 0,
        reminder24hHours: Number.parseInt(String(form.reminder24hHours || "24"), 10),
        reminder2hHours: Number.parseInt(String(form.reminder2hHours || "2"), 10),
        reminder24hEnabled: Boolean(form.reminder24hEnabled),
        reminder2hEnabled: Boolean(form.reminder2hEnabled),
        templates: form.templates,
        clearBotToken: form.clearBotToken
      };
      const nextToken = String(form.botToken || "").trim();
      if (nextToken) {
        payload.botToken = nextToken;
      }

      const response = await apiFetch("/api/settings/telegram-bot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setError(localizeApiMessage(getApiErrorMessage(response, data, ui.saveError), language));
        return;
      }
      setItem(data?.item || null);
      setForm(mapItemToForm(data?.item || null));
      setMessage(ui.saved);
    } catch {
      setError(ui.unexpectedError);
    } finally {
      setSaving(false);
    }
  }, [canUpdateSettingsTelegramBot, form, language, saving, ui.saveError, ui.saved, ui.unexpectedError]);

  return (
    <section id="telegramBotSettingsPanel" className="all-users-panel settings-panel telegram-bot-settings-panel">
      <div className="all-users-head">
        <h3>{ui.title}</h3>
        <button type="button" className="header-btn panel-close-btn" onClick={onClose} aria-label={ui.close}>
          ×
        </button>
      </div>

      <p className="all-users-state" hidden={!loading}>{ui.loading}</p>
      <p className="all-users-state" hidden={!message}>{message}</p>
      <p className="all-users-state error" hidden={!error}>{error}</p>

      <form className="auth-form settings-edit-form telegram-bot-settings-form" onSubmit={handleSave} hidden={loading}>
        <div className="telegram-settings-section telegram-settings-primary">
          <div className="telegram-settings-section-head">
            <h4>{ui.mainSettings}</h4>
            <span className={`telegram-settings-status-pill ${form.isActive ? "is-active" : "is-inactive"}`}>
              {form.isActive ? ui.activeStatus : ui.inactiveStatus}
            </span>
          </div>

          <div className="telegram-token-layout">
            <label className="field telegram-token-field">
              <span>{ui.botToken}</span>
              <input
                type="password"
                value={form.botToken}
                disabled={!canUpdateSettingsTelegramBot || saving}
                placeholder={hasTokenLabel}
                onChange={(event) => setForm((prev) => ({ ...prev, botToken: event.target.value, clearBotToken: false }))}
              />
            </label>

            <div className="telegram-settings-switches">
              <label className="settings-checkbox settings-checkbox-inline">
                <span>{ui.active}</span>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  disabled={!canUpdateSettingsTelegramBot || saving}
                  onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
              </label>
              <label className="settings-checkbox settings-checkbox-inline">
                <span>{ui.clearToken}</span>
                <input
                  type="checkbox"
                  checked={form.clearBotToken}
                  disabled={!canUpdateSettingsTelegramBot || saving || !item?.hasBotToken}
                  onChange={(event) => setForm((prev) => ({ ...prev, clearBotToken: event.target.checked, botToken: "" }))}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="telegram-settings-section">
          <div className="telegram-settings-section-head">
            <h4>{ui.reminders}</h4>
          </div>
          <div className="telegram-settings-number-grid">
            <div className="telegram-number-card">
              <label htmlFor="telegramCancelLockMinutes">{ui.cancelLockMinutes}</label>
              <input
                id="telegramCancelLockMinutes"
                type="number"
                min="0"
                max="10080"
                value={form.cancelLockMinutes}
                disabled={!canUpdateSettingsTelegramBot || saving || !form.cancelLockEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, cancelLockMinutes: event.target.value }))}
              />
              <label className="settings-checkbox settings-checkbox-inline telegram-card-toggle" htmlFor="telegramCancelLockEnabled">
                <span>{ui.active}</span>
                <input
                  id="telegramCancelLockEnabled"
                  type="checkbox"
                  checked={form.cancelLockEnabled}
                  disabled={!canUpdateSettingsTelegramBot || saving}
                  onChange={(event) => setForm((prev) => ({
                    ...prev,
                    cancelLockEnabled: event.target.checked,
                    cancelLockMinutes: event.target.checked && Number.parseInt(String(prev.cancelLockMinutes || "0"), 10) <= 0
                      ? "60"
                      : prev.cancelLockMinutes
                  }))}
                />
              </label>
            </div>

            <div className="telegram-number-card">
              <label htmlFor="telegramReminder24hHours">{ui.firstReminderHours}</label>
              <input
                id="telegramReminder24hHours"
                type="number"
                min="0"
                max="168"
                value={form.reminder24hHours}
                disabled={!canUpdateSettingsTelegramBot || saving}
                onChange={(event) => setForm((prev) => ({ ...prev, reminder24hHours: event.target.value }))}
              />
              <label className="settings-checkbox settings-checkbox-inline telegram-card-toggle" htmlFor="telegramReminder24hEnabled">
                <span>{ui.active}</span>
                <input
                  id="telegramReminder24hEnabled"
                  type="checkbox"
                  checked={form.reminder24hEnabled}
                  disabled={!canUpdateSettingsTelegramBot || saving}
                  onChange={(event) => setForm((prev) => ({ ...prev, reminder24hEnabled: event.target.checked }))}
                />
              </label>
            </div>

            <div className="telegram-number-card">
              <label htmlFor="telegramReminder2hHours">{ui.secondReminderHours}</label>
              <input
                id="telegramReminder2hHours"
                type="number"
                min="0"
                max="168"
                value={form.reminder2hHours}
                disabled={!canUpdateSettingsTelegramBot || saving}
                onChange={(event) => setForm((prev) => ({ ...prev, reminder2hHours: event.target.value }))}
              />
              <label className="settings-checkbox settings-checkbox-inline telegram-card-toggle" htmlFor="telegramReminder2hEnabled">
                <span>{ui.active}</span>
                <input
                  id="telegramReminder2hEnabled"
                  type="checkbox"
                  checked={form.reminder2hEnabled}
                  disabled={!canUpdateSettingsTelegramBot || saving}
                  onChange={(event) => setForm((prev) => ({ ...prev, reminder2hEnabled: event.target.checked }))}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="telegram-settings-section telegram-template-section">
          <div className="telegram-settings-section-head telegram-template-head">
            <h4>{ui.templates}</h4>
            <div className="telegram-language-tabs" role="tablist" aria-label={ui.templates}>
              {["uz", "ru"].map((templateLanguageKey) => (
                <button
                  key={templateLanguageKey}
                  type="button"
                  className={`telegram-language-tab ${templateLanguage === templateLanguageKey ? "is-active" : ""}`}
                  role="tab"
                  aria-selected={templateLanguage === templateLanguageKey ? "true" : "false"}
                  disabled={saving}
                  onClick={() => setTemplateLanguage(templateLanguageKey)}
                >
                  {templateLanguageKey === "uz" ? ui.languageUz : ui.languageRu}
                </button>
              ))}
            </div>
          </div>

          <div className="telegram-template-fields">
            {TEMPLATE_FIELDS.map(([key, labelKey]) => (
              <label className="field telegram-template-field" key={`${templateLanguage}-${key}`}>
                <span>{ui.templateLabels[labelKey] || labelKey}</span>
                <textarea
                  rows="3"
                  maxLength="500"
                  value={form.templates[templateLanguage]?.[key] || ""}
                  disabled={!canUpdateSettingsTelegramBot || saving}
                  onChange={(event) => updateTemplate(templateLanguage, key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="settings-actions-row">
          <button type="submit" className="btn" disabled={!canUpdateSettingsTelegramBot || saving}>
            {saving ? ui.saving : ui.save}
          </button>
        </div>
      </form>
    </section>
  );
}

export default TelegramBotSettingsPanel;
