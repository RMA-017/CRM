import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../../lib/api.js";

const DEFAULT_TEMPLATES = Object.freeze({
  uz: Object.freeze({
    lessonCancelled: "",
    scheduleChanged: "",
    scheduleCreated: "",
    scheduleDeleted: "",
    reminder24h: "",
    reminder2h: "",
    parentCancelNotification: ""
  }),
  ru: Object.freeze({
    lessonCancelled: "",
    scheduleChanged: "",
    scheduleCreated: "",
    scheduleDeleted: "",
    reminder24h: "",
    reminder2h: "",
    parentCancelNotification: ""
  })
});

const TEMPLATE_FIELDS = Object.freeze([
  ["lessonCancelled", "Cancel"],
  ["scheduleChanged", "Changed"],
  ["scheduleCreated", "Created"],
  ["scheduleDeleted", "Deleted"],
  ["reminder24h", "First reminder"],
  ["reminder2h", "Second reminder"],
  ["parentCancelNotification", "Parent cancel"]
]);

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
  return {
    botToken: "",
    clearBotToken: false,
    isActive: Boolean(item?.isActive),
    cancelLockMinutes: String(item?.cancelLockMinutes ?? 60),
    reminder24hHours: String(item?.reminder24hHours ?? 24),
    reminder2hHours: String(item?.reminder2hHours ?? 2),
    templates: normalizeTemplates(item?.templates)
  };
}

function TelegramBotSettingsPanel({
  canUpdateSettingsTelegramBot,
  onClose
}) {
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(() => mapItemToForm(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const hasTokenLabel = useMemo(() => (
    item?.hasBotToken ? `Saved: ${item.botTokenMasked || "yes"}` : "Not set"
  ), [item?.botTokenMasked, item?.hasBotToken]);

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
        setError(getApiErrorMessage(response, data, "Failed to load Telegram bot settings."));
        return;
      }
      setItem(data?.item || null);
      setForm(mapItemToForm(data?.item || null));
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateTemplate = useCallback((language, key, value) => {
    setForm((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [language]: {
          ...prev.templates[language],
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
        cancelLockMinutes: Number.parseInt(String(form.cancelLockMinutes || "60"), 10),
        reminder24hHours: Number.parseInt(String(form.reminder24hHours || "24"), 10),
        reminder2hHours: Number.parseInt(String(form.reminder2hHours || "2"), 10),
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
        setError(getApiErrorMessage(response, data, "Failed to save Telegram bot settings."));
        return;
      }
      setItem(data?.item || null);
      setForm(mapItemToForm(data?.item || null));
      setMessage(data?.message || "Saved.");
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [canUpdateSettingsTelegramBot, form, saving]);

  return (
    <section id="telegramBotSettingsPanel" className="all-users-panel settings-panel telegram-bot-settings-panel">
      <div className="all-users-head">
        <h3>Telegram Bot</h3>
        <button type="button" className="header-btn panel-close-btn" onClick={onClose} aria-label="Close Telegram bot settings">
          ×
        </button>
      </div>

      <p className="all-users-state" hidden={!loading}>Loading...</p>
      <p className="all-users-state" hidden={!message}>{message}</p>
      <p className="all-users-state error" hidden={!error}>{error}</p>

      <form className="auth-form settings-edit-form telegram-bot-settings-form" onSubmit={handleSave} hidden={loading}>
        <div className="settings-grid">
          <label className="field">
            <span>Bot token</span>
            <input
              type="password"
              value={form.botToken}
              disabled={!canUpdateSettingsTelegramBot || saving}
              placeholder={hasTokenLabel}
              onChange={(event) => setForm((prev) => ({ ...prev, botToken: event.target.value, clearBotToken: false }))}
            />
          </label>

          <label className="field">
            <span>Cancel lock minutes</span>
            <input
              type="number"
              min="0"
              max="10080"
              value={form.cancelLockMinutes}
              disabled={!canUpdateSettingsTelegramBot || saving}
              onChange={(event) => setForm((prev) => ({ ...prev, cancelLockMinutes: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>First reminder hours</span>
            <input
              type="number"
              min="0"
              max="168"
              value={form.reminder24hHours}
              disabled={!canUpdateSettingsTelegramBot || saving}
              onChange={(event) => setForm((prev) => ({ ...prev, reminder24hHours: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>Second reminder hours</span>
            <input
              type="number"
              min="0"
              max="168"
              value={form.reminder2hHours}
              disabled={!canUpdateSettingsTelegramBot || saving}
              onChange={(event) => setForm((prev) => ({ ...prev, reminder2hHours: event.target.value }))}
            />
          </label>
        </div>

        <div className="settings-toggle-row">
          <label className="settings-checkbox settings-checkbox-inline">
            <input
              type="checkbox"
              checked={form.isActive}
              disabled={!canUpdateSettingsTelegramBot || saving}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            <span>Active</span>
          </label>
          <label className="settings-checkbox settings-checkbox-inline">
            <input
              type="checkbox"
              checked={form.clearBotToken}
              disabled={!canUpdateSettingsTelegramBot || saving || !item?.hasBotToken}
              onChange={(event) => setForm((prev) => ({ ...prev, clearBotToken: event.target.checked, botToken: "" }))}
            />
            <span>Clear token</span>
          </label>
        </div>

        <div className="telegram-template-grid">
          {["uz", "ru"].map((language) => (
            <div className="telegram-template-column" key={language}>
              <h4>{language.toUpperCase()}</h4>
              {TEMPLATE_FIELDS.map(([key, label]) => (
                <label className="field" key={`${language}-${key}`}>
                  <span>{label}</span>
                  <textarea
                    rows="2"
                    maxLength="500"
                    value={form.templates[language]?.[key] || ""}
                    disabled={!canUpdateSettingsTelegramBot || saving}
                    onChange={(event) => updateTemplate(language, key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="settings-actions-row">
          <button type="submit" className="btn" disabled={!canUpdateSettingsTelegramBot || saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default TelegramBotSettingsPanel;
