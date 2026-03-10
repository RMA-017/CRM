import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, apiFetch, getApiErrorMessage, readApiResponseData } from "../../lib/api.js";
import { handleProtectedStatus } from "./profile.helpers.js";

const NOTIFICATIONS_LIMIT = 100;
const LIVE_NOTIFICATIONS_LIMIT = 50;
const NOTIFICATION_RELOAD_DEBOUNCE_MS = 500;
const NOTIFICATION_CACHE_TTL_MS = 15_000;
const NOTIFICATION_BADGE_IDLE_DELAY_MS = 250;

function normalizeNotificationItem(item) {
  return {
    id: String(item?.id || "").trim(),
    eventType: String(item?.eventType || item?.event_type || "").trim().toLowerCase(),
    message: String(item?.message || "").trim(),
    payload: item?.payload && typeof item.payload === "object" ? item.payload : {},
    isRead: Boolean(item?.isRead ?? item?.is_read),
    readAt: item?.readAt || item?.read_at || null,
    createdAt: item?.createdAt || item?.created_at || null
  };
}

export function useProfileNotifications({
  canReadAppointments,
  canSendNotifications,
  profileUsername,
  navigate,
  closeMenu,
  closeUserDropdown
}) {
  const notificationReloadTimerRef = useRef(null);
  const pendingNotificationFallbackRef = useRef([]);
  const notificationsLoadedAtRef = useRef(0);
  const notificationsLoadedLimitRef = useRef(0);

  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationSendForm, setNotificationSendForm] = useState({
    message: "",
    targetRole: "all"
  });
  const [notificationSendSubmitting, setNotificationSendSubmitting] = useState(false);
  const [notificationSendError, setNotificationSendError] = useState("");
  const [notificationSendSuccess, setNotificationSendSuccess] = useState("");

  const openNotificationsPanel = useCallback(() => {
    closeMenu();
    closeUserDropdown();
    setNotificationsModalOpen(true);
  }, [closeMenu, closeUserDropdown]);

  const closeNotificationsPanel = useCallback(() => {
    setNotificationsModalOpen(false);
  }, []);

  const loadNotifications = useCallback(async ({
    silent = false,
    force = false,
    limit = NOTIFICATIONS_LIMIT
  } = {}) => {
    if (!profileUsername) {
      return false;
    }

    const resolvedLimit = Number.isInteger(limit) && limit > 0
      ? Math.min(limit, NOTIFICATIONS_LIMIT)
      : NOTIFICATIONS_LIMIT;
    const now = Date.now();
    const hasPendingFallbacks = pendingNotificationFallbackRef.current.length > 0;
    const isCachedFresh = (
      !force
      && notificationsLoadedAtRef.current > 0
      && (now - notificationsLoadedAtRef.current) < NOTIFICATION_CACHE_TTL_MS
      && notificationsLoadedLimitRef.current >= resolvedLimit
      && !hasPendingFallbacks
    );

    if (isCachedFresh) {
      return true;
    }

    try {
      const response = await apiFetch(`/api/notifications?limit=${resolvedLimit}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        handleProtectedStatus(response, navigate);
        return false;
      }

      const items = Array.isArray(data?.items)
        ? data.items.map(normalizeNotificationItem)
        : [];
      setNotifications(items);
      notificationsLoadedAtRef.current = now;
      notificationsLoadedLimitRef.current = resolvedLimit;
      return true;
    } catch {
      if (!silent) {
        setNotifications([]);
      }
      return false;
    }
  }, [navigate, profileUsername]);

  const markNotificationsRead = useCallback(async () => {
    if (!profileUsername) {
      return;
    }
    try {
      const response = await apiFetch("/api/notifications/read-all", {
        method: "PATCH"
      });
      if (!response.ok) {
        handleProtectedStatus(response, navigate);
        return;
      }
      const readAtValue = new Date().toISOString();
      setNotifications((prev) => (
        Array.isArray(prev)
          ? prev.map((item) => (
              item?.isRead
                ? item
                : { ...item, isRead: true, readAt: item?.readAt || readAtValue }
            ))
          : []
      ));
    } catch {
      // Ignore notification read errors in UI.
    }
  }, [navigate, profileUsername]);

  const clearNotifications = useCallback(async () => {
    if (!profileUsername) {
      setNotifications([]);
      return;
    }

    try {
      const response = await apiFetch("/api/notifications", {
        method: "DELETE"
      });
      if (!response.ok) {
        handleProtectedStatus(response, navigate);
      }
    } catch {
      // Ignore clear errors and still clear local list.
    } finally {
      setNotifications([]);
      notificationsLoadedAtRef.current = Date.now();
      notificationsLoadedLimitRef.current = 0;
    }
  }, [navigate, profileUsername]);

  const sendManualNotification = useCallback(async () => {
    if (!canSendNotifications) {
      window.alert("You do not have permission to send notifications.");
      return;
    }

    const message = String(notificationSendForm.message || "").trim();
    const targetRole = String(notificationSendForm.targetRole || "").trim().toLowerCase();
    if (!message) {
      window.alert("Message is required.");
      return;
    }
    if (!targetRole) {
      window.alert("Select recipient group.");
      return;
    }

    try {
      setNotificationSendSubmitting(true);
      setNotificationSendError("");
      setNotificationSendSuccess("");

      const response = await apiFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          targetRoles: [targetRole]
        })
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        const errorMessage = getApiErrorMessage(response, data, "Failed to send notification.");
        setNotificationSendError(errorMessage);
        window.alert(errorMessage);
        return;
      }

      const successMessage = String(data?.message || "Notification sent.");
      setNotificationSendForm((prev) => ({ ...prev, message: "" }));
      setNotificationSendSuccess(successMessage);
      window.alert(successMessage);
    } catch {
      setNotificationSendError("Unexpected error. Please try again.");
      window.alert("Unexpected error. Please try again.");
    } finally {
      setNotificationSendSubmitting(false);
    }
  }, [canSendNotifications, navigate, notificationSendForm.message, notificationSendForm.targetRole]);

  const handleAppointmentNotification = useCallback((notification) => {
    const normalizedMessage = String(notification?.message || "").trim();
    if (!normalizedMessage) {
      return;
    }

    const eventType = String(notification?.eventType || notification?.type || "").trim().toLowerCase();
    const payload = notification?.payload && typeof notification.payload === "object"
      ? notification.payload
      : {};
    const createdAt = notification?.createdAt || notification?.timestamp || new Date().toISOString();

    setNotifications((prev) => (
      [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          eventType,
          message: normalizedMessage,
          payload,
          isRead: false,
          readAt: null,
          createdAt
        },
        ...prev
      ].slice(0, LIVE_NOTIFICATIONS_LIMIT)
    ));
  }, []);

  const unreadNotificationsCount = useMemo(() => {
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return 0;
    }
    return notifications.reduce((count, item) => (
      item?.isRead ? count : count + 1
    ), 0);
  }, [notifications]);

  const scheduleNotificationsReload = useCallback((fallbackNotification) => {
    if (fallbackNotification && typeof fallbackNotification === "object") {
      pendingNotificationFallbackRef.current = [
        ...pendingNotificationFallbackRef.current,
        fallbackNotification
      ].slice(-LIVE_NOTIFICATIONS_LIMIT);
    }

    if (notificationReloadTimerRef.current) {
      clearTimeout(notificationReloadTimerRef.current);
    }

    notificationReloadTimerRef.current = setTimeout(() => {
      notificationReloadTimerRef.current = null;
      const queuedFallbacks = pendingNotificationFallbackRef.current;
      pendingNotificationFallbackRef.current = [];

      void loadNotifications({ silent: true, force: true, limit: NOTIFICATIONS_LIMIT }).then((loaded) => {
        if (loaded) {
          return;
        }
        queuedFallbacks.forEach((notification) => {
          handleAppointmentNotification(notification);
        });
      });
    }, NOTIFICATION_RELOAD_DEBOUNCE_MS);
  }, [handleAppointmentNotification, loadNotifications]);

  useEffect(() => () => {
    if (notificationReloadTimerRef.current) {
      clearTimeout(notificationReloadTimerRef.current);
      notificationReloadTimerRef.current = null;
    }
    pendingNotificationFallbackRef.current = [];
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
      return undefined;
    }
    if (!canReadAppointments || !profileUsername) {
      return undefined;
    }

    const ownUsername = String(profileUsername || "").trim().toLowerCase();
    const eventSource = new window.EventSource(`${API_BASE_URL}/api/appointments/events`, {
      withCredentials: true
    });

    const handleAppointmentChange = (event) => {
      let payload = {};
      try {
        payload = JSON.parse(String(event?.data || "{}"));
      } catch {
        payload = {};
      }

      const sourceUsername = String(payload?.sourceUsername || "").trim().toLowerCase();
      const isOwnChange = Boolean(ownUsername) && sourceUsername === ownUsername;

      window.dispatchEvent(new window.CustomEvent("crm:appointment-change", { detail: payload }));

      if (!isOwnChange) {
        const notificationText = String(payload?.message || "").trim() || "Appointment planner changed.";
        const notificationPayloadData = payload?.data && typeof payload.data === "object" ? payload.data : {};
        scheduleNotificationsReload({
          eventType: payload?.type,
          message: notificationText,
          payload: { data: notificationPayloadData },
          createdAt: payload?.timestamp || new Date().toISOString()
        });
      }
    };

    eventSource.addEventListener("appointment-change", handleAppointmentChange);

    return () => {
      eventSource.removeEventListener("appointment-change", handleAppointmentChange);
      eventSource.close();
    };
  }, [canReadAppointments, profileUsername, scheduleNotificationsReload]);

  useEffect(() => {
    if (!profileUsername) {
      return;
    }
    let timeoutId = null;
    let cancelled = false;

    const run = () => {
      if (cancelled) {
        return;
      }
      void loadNotifications({ silent: true, limit: NOTIFICATIONS_LIMIT });
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(run, { timeout: NOTIFICATION_BADGE_IDLE_DELAY_MS });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    timeoutId = window.setTimeout(run, NOTIFICATION_BADGE_IDLE_DELAY_MS);
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [loadNotifications, profileUsername]);

  useEffect(() => {
    if (!notificationsModalOpen) {
      return;
    }
    void loadNotifications({ silent: true, limit: NOTIFICATIONS_LIMIT });
    void markNotificationsRead();
  }, [loadNotifications, markNotificationsRead, notificationsModalOpen]);

  return {
    notificationsModalOpen,
    notifications,
    notificationSendForm,
    notificationSendSubmitting,
    notificationSendError,
    notificationSendSuccess,
    unreadNotificationsCount,
    setNotificationSendForm,
    setNotificationSendError,
    setNotificationSendSuccess,
    openNotificationsPanel,
    closeNotificationsPanel,
    clearNotifications,
    sendManualNotification,
    handleAppointmentNotification
  };
}
