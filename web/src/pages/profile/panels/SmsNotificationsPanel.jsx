import { useCallback, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../../lib/api.js";

const UI_TEXT = Object.freeze({
  uz: Object.freeze({
    title: "SMS xabarnoma",
    close: "SMS xabarnoma panelini yopish",
    message: "Xabar matni",
    placeholder: "Masalan: Hurmatli ota-onalar, bayram munosabati bilan darslar bo'lmaydi.",
    send: "Yuborish",
    sending: "Yuborilmoqda...",
    sent: "Xabar yuborildi.",
    required: "Xabar matnini kiriting.",
    tooLong: "Xabar juda uzun.",
    loadError: "Xabarni yuborib bo'lmadi.",
    noAccess: "Ruxsat yo'q.",
    summary: "Yuborildi: {sent}. Xatolik: {failed}. Jami: {total}."
  }),
  ru: Object.freeze({
    title: "SMS уведомление",
    close: "Закрыть панель SMS уведомлений",
    message: "Текст сообщения",
    placeholder: "Например: Уважаемые родители, в праздничные дни занятий не будет.",
    send: "Отправить",
    sending: "Отправка...",
    sent: "Сообщение отправлено.",
    required: "Введите текст сообщения.",
    tooLong: "Сообщение слишком длинное.",
    loadError: "Не удалось отправить сообщение.",
    noAccess: "Нет доступа.",
    summary: "Отправлено: {sent}. Ошибок: {failed}. Всего: {total}."
  })
});

function renderText(template, values) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => (
    values?.[key] == null ? "" : String(values[key])
  ));
}

function localizeApiMessage(message, ui) {
  const text = String(message || "").trim();
  if (text === "Forbidden.") {
    return ui.noAccess;
  }
  if (text === "Message is required.") {
    return ui.required;
  }
  if (text === "Message is too long.") {
    return ui.tooLong;
  }
  return text || ui.loadError;
}

function SmsNotificationsPanel({ canSendSmsNotifications, onClose }) {
  const { language } = useI18n();
  const ui = UI_TEXT[language] || UI_TEXT.uz;
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (!canSendSmsNotifications || submitting) {
      return;
    }
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) {
      setError(ui.required);
      setNotice("");
      return;
    }
    if (normalizedMessage.length > 4000) {
      setError(ui.tooLong);
      setNotice("");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/settings/sms-notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: normalizedMessage })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setError(localizeApiMessage(getApiErrorMessage(response, data, ui.loadError), ui));
        return;
      }
      const item = data?.item || {};
      setMessage("");
      setNotice([
        ui.sent,
        renderText(ui.summary, {
          sent: item.sentCount ?? 0,
          failed: item.failedCount ?? 0,
          total: item.recipientCount ?? 0
        })
      ].join(" "));
    } catch {
      setError(ui.loadError);
    } finally {
      setSubmitting(false);
    }
  }, [canSendSmsNotifications, message, submitting, ui]);

  return (
    <section id="smsNotificationsPanel" className="all-users-panel settings-panel sms-notifications-panel">
      <div className="all-users-head">
        <h3>{ui.title}</h3>
        <button type="button" className="header-btn panel-close-btn" onClick={onClose} aria-label={ui.close}>
          ×
        </button>
      </div>

      <p className="all-users-state" hidden={!notice}>{notice}</p>
      <p className="all-users-state error" hidden={!error}>{error}</p>

      <form className="auth-form settings-edit-form sms-notifications-form" onSubmit={handleSubmit}>
        <label className="field sms-notifications-field">
          <span>{ui.message}</span>
          <textarea
            rows="9"
            maxLength="4000"
            value={message}
            disabled={!canSendSmsNotifications || submitting}
            placeholder={ui.placeholder}
            onChange={(event) => {
              setMessage(event.target.value);
              if (error) {
                setError("");
              }
            }}
          />
        </label>

        <div className="settings-actions-row">
          <button type="submit" className="btn" disabled={!canSendSmsNotifications || submitting}>
            {submitting ? ui.sending : ui.send}
          </button>
        </div>
      </form>
    </section>
  );
}

export default SmsNotificationsPanel;
