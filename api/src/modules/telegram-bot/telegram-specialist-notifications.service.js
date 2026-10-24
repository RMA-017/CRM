import pool from "../../config/db.js";
import { telegramChildName } from "./telegram-child-name.js";

const MAX_ATTEMPTS = 8;

export function formatSpecialistNotification(account) {
  const ru = account.language !== "uz";
  const titles = {
    "schedule-created": ru ? "Занятие создано" : "Dars yaratildi",
    "schedule-updated": ru ? "Занятие изменено" : "Dars o‘zgartirildi",
    "schedule-deleted": ru ? "Занятие удалено" : "Dars o‘chirildi",
    "appointment-parent-cancelled": ru ? "Родитель отменил занятие" : "Ota-ona darsni bekor qildi",
    "specialist-absence-updated": ru ? "Отсутствие специалиста изменено" : "Mutaxassis yo‘qligi o‘zgartirildi"
  };
  const title = titles[account.event_type];
  if (!title) return account.message;
  const payload = account.payload || {};
  const data = payload.data || payload;
  const items = Array.isArray(data.items) ? data.items : [];
  const ownItems = items.filter((item) => Number(item.specialistId || item.specialist_id) === Number(account.user_id));
  const first = (ownItems.length ? ownItems : items)[0] || {};
  const child = telegramChildName(first) || telegramChildName(data)
    || data.clientName || data.client_name || data.childName || first.clientName || first.client_name;
  const specialist = data.specialistName || data.specialist_name || first.specialistName || first.specialist_name;
  const date = first.appointmentDate || first.appointment_date || data.appointmentDate || data.absenceDate || data.dateFrom || data.date;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ""));
  const dateText = dateMatch ? `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}` : "";
  const time = String(first.startTime || first.start_time || data.startTime || "").slice(0, 5);
  const reason = data.reason || data.cancelReason || data.cancel_reason;
  const count = Number(data.deletedCount || data.cancelledCount || data.changedCount || data.createdCount || 0);
  const lines = [title, child, specialist, [dateText, time].filter(Boolean).join(" "),
    count > 1 ? `${ru ? "Занятий" : "Darslar"}: ${count}` : "", reason ? `${ru ? "Причина" : "Sabab"}: ${reason}` : ""];
  if (!child && !specialist && !dateText && !reason && !count) lines.push(account.message);
  return lines.filter(Boolean).join("\n").slice(0, 4000);
}

export async function sendSpecialistNotification({ bot_token: token, chat_id: chatId, message }) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    // Do not retain Telegram URLs/errors: they can contain bot credentials.
    const error = new Error("Telegram specialist notification failed");
    error.telegramCode = result.error_code || response.status;
    error.retryAfter = Number(result.parameters?.retry_after) || 0;
    throw error;
  }
}

export async function runSpecialistNotificationSweep({ db = pool, send = sendSpecialistNotification } = {}) {
  const { rows } = await db.query(`WITH candidates AS (
    SELECT d.id FROM telegram_specialist_notification_deliveries d
    WHERE (d.status = 'pending' AND d.available_at <= CURRENT_TIMESTAMP
      OR d.status = 'sending' AND d.lease_until < CURRENT_TIMESTAMP)
      AND NOT EXISTS (SELECT 1 FROM telegram_specialist_notification_deliveries earlier
        WHERE earlier.organization_id = d.organization_id AND earlier.telegram_user_id = d.telegram_user_id
          AND earlier.id < d.id AND earlier.status IN ('pending', 'sending'))
    ORDER BY d.id LIMIT 20 FOR UPDATE OF d SKIP LOCKED
  ) UPDATE telegram_specialist_notification_deliveries d
    SET status = 'sending', attempts = attempts + 1, lease_until = CURRENT_TIMESTAMP + INTERVAL '3 minutes'
    FROM candidates c WHERE d.id = c.id RETURNING d.*`);
  let cursor = 0;
  async function deliver() {
    while (cursor < rows.length) {
      const item = rows[cursor++];
      // Recheck current access immediately before sending, including /stop and phone changes.
      const { rows: [account] } = await db.query(`SELECT a.bot_token, a.chat_id, a.language, a.user_id, n.message, n.event_type, n.payload
        FROM telegram_specialist_notification_accounts a
        JOIN user_notifications n ON n.organization_id = a.organization_id AND n.user_id = a.user_id
        WHERE n.id = $1 AND a.organization_id = $2 AND a.telegram_user_id = $3 AND a.phone = $4`,
      [item.notification_id, item.organization_id, item.telegram_user_id, item.phone]);
      if (!account || item.attempts > MAX_ATTEMPTS) {
        await db.query(`UPDATE telegram_specialist_notification_deliveries
          SET status = $2, lease_until = NULL WHERE id = $1 AND attempts = $3`,
        [item.id, account ? "failed" : "skipped", item.attempts]);
        continue;
      }
      try {
        await send({ ...account, message: formatSpecialistNotification(account) });
      } catch (error) {
        const permanent = [400, 401, 403].includes(Number(error.telegramCode));
        const delay = Math.max(Math.min(3600, 5 * 2 ** item.attempts), Math.min(86400, error.retryAfter || 0));
        await db.query(`UPDATE telegram_specialist_notification_deliveries
          SET status = $2, lease_until = NULL, available_at = CURRENT_TIMESTAMP + $3 * INTERVAL '1 second'
          WHERE id = $1 AND attempts = $4`,
        [item.id, permanent || item.attempts >= MAX_ATTEMPTS ? "failed" : "pending", delay, item.attempts]);
        continue;
      }
      await db.query(`UPDATE telegram_specialist_notification_deliveries
        SET status = 'sent', sent_at = CURRENT_TIMESTAMP, lease_until = NULL
        WHERE id = $1 AND attempts = $2`, [item.id, item.attempts]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, () => deliver()));
  return rows.length;
}

export function startSpecialistNotificationWorker({ logger = null } = {}) {
  let running = null;
  let stopped = false;
  function tick() {
    if (running || stopped) return;
    running = runSpecialistNotificationSweep().catch((error) => {
      // Older installations can start before this optional migration is applied.
      if (error.code !== "42P01") logger?.error?.({ code: error.code || "delivery_error" }, "Specialist Telegram notification sweep failed");
    }).finally(() => { running = null; });
  }
  const timer = setInterval(tick, 3000);
  timer.unref?.();
  tick();
  return async () => { stopped = true; clearInterval(timer); await running; };
}
