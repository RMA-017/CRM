import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { translateLiteral, useI18n } from "../../i18n/I18nProvider.jsx";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../lib/api.js";
import { handleProtectedStatus } from "./profile.helpers.js";

const NOTIFICATION_REFRESH_MS = 30_000;
const NOTIFICATION_LIMIT = 10;

function formatNotificationTime(value, language) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "uz-UZ", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatEventType(value, language) {
  const normalized = String(value || "").trim().replace(/[._-]+/g, " ");
  return translateLiteral(normalized || "notification", language);
}

function formatNotificationDateTime(dateValue, timeValue) {
  const rawDate = String(dateValue || "").trim();
  const rawTime = String(timeValue || "").trim();
  const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dateText = dateMatch ? `${dateMatch[3]}.${dateMatch[2]}` : rawDate;
  const timeMatch = rawTime.match(/^(\d{2}):(\d{2})/);
  const timeText = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : rawTime;
  return [dateText, timeText].filter(Boolean).join(" ");
}

function getNotificationPayload(item) {
  const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
  return payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data
    : payload;
}

function getPayloadItems(item) {
  const items = getNotificationPayload(item)?.items;
  return Array.isArray(items) ? items : [];
}

function getNotificationClientName(item) {
  const payload = getNotificationPayload(item);
  const payloadName = String(payload.clientName || "").trim();
  if (payloadName && payloadName !== "Client") {
    return payloadName;
  }
  const firstItem = getPayloadItems(item)[0] || {};
  return [
    firstItem.lastName,
    firstItem.firstName,
    firstItem.middleName
  ].map((part) => String(part || "").trim()).filter(Boolean).join(" ") || "Client";
}

function getNotificationSpecialistName(item) {
  const payload = getNotificationPayload(item);
  const payloadName = String(payload.specialistName || "").trim();
  if (payloadName) {
    return payloadName;
  }
  const firstItem = getPayloadItems(item)[0] || {};
  return String(firstItem.specialistName || firstItem.specialist_name || "").trim();
}

function getNotificationServiceName(item) {
  const payload = getNotificationPayload(item);
  const payloadService = String(payload.serviceName || "").trim();
  if (payloadService) {
    return payloadService;
  }
  const firstItem = getPayloadItems(item)[0] || {};
  return String(firstItem.serviceName || firstItem.service_name || "").trim();
}

function getFirstScheduleItem(item) {
  return getPayloadItems(item)[0] || {};
}

function compactParts(parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" - ");
}

function formatHeaderNotificationMessage(item, language, fallback) {
  const eventType = String(item?.eventType || "").trim();
  const payload = getNotificationPayload(item);
  const firstItem = getFirstScheduleItem(item);
  const clientName = getNotificationClientName(item);
  const specialistName = getNotificationSpecialistName(item);
  const serviceName = getNotificationServiceName(item);
  const dateTime = formatNotificationDateTime(
    firstItem.appointmentDate || payload.appointmentDate,
    firstItem.startTime || payload.startTime
  );
  const suffix = compactParts([clientName, serviceName, specialistName, dateTime]);
  const isRu = language === "ru";

  if (eventType === "schedule-created") {
    return `${isRu ? "Создано" : "Dars yaratildi"}: ${suffix}`.trim();
  }
  if (eventType === "schedule-updated") {
    return `${isRu ? "Занятие изменено" : "Dars o'zgardi"}: ${suffix}`.trim();
  }
  if (eventType === "schedule-deleted") {
    return `${isRu ? "Удалено" : "Dars o'chirildi"}: ${suffix}`.trim();
  }
  if (eventType === "appointment-parent-cancelled") {
    const reason = String(payload.reason || "").trim();
    const reasonText = reason ? ` (${reason})` : "";
    return `${isRu ? "Родитель отменил" : "Ota-ona bekor qildi"}: ${suffix}${reasonText}`.trim();
  }
  if (eventType === "specialist-absence-updated") {
    const dateText = formatNotificationDateTime(payload.absenceDate || payload.dateFrom, "");
    const cancelledCount = Number(payload.cancelledCount || 0);
    const countText = cancelledCount > 0
      ? (isRu ? `, отменено: ${cancelledCount}` : `, bekor qilindi: ${cancelledCount}`)
      : "";
    return `${isRu ? "Отсутствие специалиста" : "Mutaxassis yo'qligi"}${dateText ? `: ${dateText}` : ""}${countText}`;
  }
  return translateLiteral(fallback || item?.message || "Notification", language);
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function HeaderNotifications({ enabled = false, navigate }) {
  const { language, t } = useI18n();
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const badgeText = useMemo(() => {
    if (unreadCount <= 0) {
      return "";
    }
    return unreadCount > 99 ? "99+" : String(unreadCount);
  }, [unreadCount]);

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) {
      setItems([]);
      setUnreadCount(0);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
      }
      const response = await apiFetch(`/api/notifications?limit=${NOTIFICATION_LIMIT}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setMessage(getApiErrorMessage(response, data, t("notifications.loadError")));
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
      setUnreadCount(Number.isInteger(data?.unreadCount) ? data.unreadCount : 0);
      setMessage("");
    } catch {
      if (!silent) {
        setMessage(t("notifications.loadError"));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [enabled, navigate, t]);

  const markNotificationRead = useCallback(async (notificationId) => {
    const id = Number.parseInt(String(notificationId || ""), 10);
    if (!id) {
      return;
    }
    const targetItem = items.find((item) => Number(item?.id || 0) === id);
    if (!targetItem) {
      return;
    }
    if (targetItem?.isRead) {
      return;
    }

    setItems((prev) => prev.map((item) => (
      Number(item?.id || 0) === id
        ? { ...item, isRead: true, readAt: item?.readAt || new Date().toISOString() }
        : item
    )));
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const response = await apiFetch(`/api/notifications/${id}/read`, {
        method: "PATCH"
      });
      if (!response.ok) {
        await loadNotifications({ silent: true });
      }
    } catch {
      await loadNotifications({ silent: true });
    }
  }, [items, loadNotifications]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true, readAt: item?.readAt || new Date().toISOString() })));
    setUnreadCount(0);

    try {
      const response = await apiFetch("/api/notifications/read-all", {
        method: "PATCH"
      });
      if (!response.ok) {
        await loadNotifications({ silent: true });
      }
    } catch {
      await loadNotifications({ silent: true });
    }
  }, [loadNotifications]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    void loadNotifications({ silent: true });
    const timerId = window.setInterval(() => {
      void loadNotifications({ silent: true });
    }, NOTIFICATION_REFRESH_MS);
    return () => {
      window.clearInterval(timerId);
    };
  }, [enabled, loadNotifications]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleMouseDown = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="notification-menu-wrap" ref={panelRef}>
      <button
        type="button"
        className={`header-btn header-notification-btn${unreadCount > 0 ? " has-unread" : ""}`}
        aria-label={unreadCount > 0 ? t("notifications.ariaUnread", { count: unreadCount }) : t("notifications.ariaEmpty")}
        aria-expanded={open}
        title={t("notifications.title")}
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) {
            void loadNotifications();
          }
        }}
      >
        <span className="header-notification-icon">
          <BellIcon />
        </span>
        {badgeText ? <span className="header-notification-badge">{badgeText}</span> : null}
      </button>

      {open ? (
        <div className="header-notification-panel" role="dialog" aria-label={t("notifications.title")}>
          <div className="header-notification-panel-head">
            <strong>{t("notifications.title")}</strong>
            {unreadCount > 0 ? (
              <button type="button" className="header-notification-read-all" onClick={markAllRead}>
                {t("notifications.markRead")}
              </button>
            ) : null}
          </div>

          {message ? <div className="header-notification-empty">{message}</div> : null}
          {!message && loading && items.length === 0 ? (
            <div className="header-notification-empty">{t("notifications.loading")}</div>
          ) : null}
          {!message && !loading && items.length === 0 ? (
            <div className="header-notification-empty">{t("notifications.none")}</div>
          ) : null}
          {!message && items.length > 0 ? (
            <div className="header-notification-list">
              {items.map((item) => {
                const itemId = Number(item?.id || 0);
                const isRead = Boolean(item?.isRead);
                return (
                  <button
                    key={itemId || `${item?.eventType || "notification"}-${item?.createdAt || ""}`}
                    type="button"
                    className={`header-notification-item${isRead ? "" : " unread"}`}
                    onClick={() => markNotificationRead(itemId)}
                  >
                    <span className="header-notification-item-top">
                      <span>{formatEventType(item?.eventType, language)}</span>
                      <time>{formatNotificationTime(item?.createdAt, language)}</time>
                    </span>
                    <span className="header-notification-item-message">
                      {formatHeaderNotificationMessage(item, language, t("notifications.fallback"))}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default HeaderNotifications;
