import { useCallback, useEffect, useState } from "react";
import { apiFetch, readApiResponseData } from "../../lib/api.js";
import { handleProtectedStatus } from "./profile.helpers.js";
import {
  formatMyChildrenOptionLabel,
  getMyChildrenWeekStartYmd,
  mapMyChildrenScheduleItem,
  MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS,
  normalizeMyChildrenVisibleWeekDays,
  shiftDateYmd
} from "./profile.vip-utils.js";

function getInitialMyChildrenIsCompact() {
  return false;
}

export function useProfileMyChildren({
  canOpenMyChildren,
  navigate,
  todayYmd,
  mainView,
  profileUsername
}) {
  const [myChildrenIsCompact, setMyChildrenIsCompact] = useState(getInitialMyChildrenIsCompact);
  const [myChildrenDateYmd, setMyChildrenDateYmd] = useState(() => (
    getInitialMyChildrenIsCompact()
      ? todayYmd
      : getMyChildrenWeekStartYmd(todayYmd, todayYmd)
  ));
  const [myChildrenVisibleWeekDays, setMyChildrenVisibleWeekDays] = useState(
    () => [...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]
  );
  const [myChildrenOptions, setMyChildrenOptions] = useState([]);
  const [myChildrenOptionsLoading, setMyChildrenOptionsLoading] = useState(false);
  const [myChildrenOptionsReady, setMyChildrenOptionsReady] = useState(false);
  const [myChildrenSelectedClientId, setMyChildrenSelectedClientId] = useState("");
  const [myChildrenScheduleItems, setMyChildrenScheduleItems] = useState([]);
  const [myChildrenScheduleLoading, setMyChildrenScheduleLoading] = useState(false);
  const [myChildrenScheduleMessage, setMyChildrenScheduleMessage] = useState("");
  const [myChildrenConfirmingByAppointmentId, setMyChildrenConfirmingByAppointmentId] = useState({});

  const loadMyChildrenOptions = useCallback(async () => {
    if (!canOpenMyChildren) {
      setMyChildrenOptionsLoading(false);
      setMyChildrenOptionsReady(true);
      setMyChildrenOptions([]);
      setMyChildrenSelectedClientId("");
      setMyChildrenScheduleItems([]);
      setMyChildrenScheduleMessage("You do not have permission to view assigned children.");
      return;
    }

    setMyChildrenOptionsLoading(true);
    setMyChildrenOptionsReady(false);
    setMyChildrenScheduleMessage("");
    try {
      const query = new URLSearchParams({
        isVip: "true",
        assignmentScope: "mine",
        limit: "500"
      });
      const response = await apiFetch(`/api/clients/search?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setMyChildrenOptions([]);
        setMyChildrenSelectedClientId("");
        setMyChildrenScheduleItems([]);
        setMyChildrenScheduleMessage(data?.message || "Failed to load assigned children.");
        return;
      }

      const nextOptions = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => formatMyChildrenOptionLabel(item))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => (
          String(a.label || "").localeCompare(
            String(b.label || ""),
            undefined,
            { sensitivity: "base" }
          )
        ));

      setMyChildrenOptions(nextOptions);
      setMyChildrenSelectedClientId((prev) => {
        const current = String(prev || "").trim();
        if (current && nextOptions.some((item) => item.id === current)) {
          return current;
        }
        return "";
      });

      if (nextOptions.length === 0) {
        setMyChildrenScheduleItems([]);
        setMyChildrenScheduleMessage("");
      }
    } catch {
      setMyChildrenOptions([]);
      setMyChildrenSelectedClientId("");
      setMyChildrenScheduleItems([]);
      setMyChildrenScheduleMessage("Failed to load assigned children.");
    } finally {
      setMyChildrenOptionsLoading(false);
      setMyChildrenOptionsReady(true);
    }
  }, [canOpenMyChildren, navigate]);

  const loadMyChildrenVisibleWeekDays = useCallback(async () => {
    if (!canOpenMyChildren) {
      setMyChildrenVisibleWeekDays([...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]);
      return;
    }

    try {
      const response = await apiFetch("/api/appointments/settings", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMyChildrenVisibleWeekDays([...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]);
        return;
      }

      setMyChildrenVisibleWeekDays(
        normalizeMyChildrenVisibleWeekDays(data?.item?.visibleWeekDays)
      );
    } catch {
      setMyChildrenVisibleWeekDays([...MY_CHILDREN_DEFAULT_VISIBLE_WEEK_DAYS]);
    }
  }, [canOpenMyChildren]);

  const loadMyChildrenSchedule = useCallback(async ({
    clientId = "",
    dateYmd = ""
  } = {}) => {
    if (!canOpenMyChildren) {
      setMyChildrenScheduleItems([]);
      setMyChildrenScheduleMessage(
        "You do not have permission to view assigned children schedule."
      );
      return;
    }

    const normalizedClientId = String(clientId || "").trim();
    const dateFromYmd = String(dateYmd || "").trim() || todayYmd;
    const dateToYmd = myChildrenIsCompact
      ? dateFromYmd
      : shiftDateYmd(dateFromYmd, 6, todayYmd);
    const hasChildren = Array.isArray(myChildrenOptions) && myChildrenOptions.length > 0;
    if (!normalizedClientId && !hasChildren) {
      setMyChildrenScheduleItems([]);
      setMyChildrenScheduleMessage("");
      return;
    }

    setMyChildrenScheduleLoading(true);
    setMyChildrenScheduleMessage("");
    try {
      const query = new URLSearchParams({
        dateFrom: dateFromYmd,
        dateTo: dateToYmd,
        vipOnly: "true",
        light: "true"
      });
      if (normalizedClientId) {
        query.set("clientId", normalizedClientId);
      }

      const response = await apiFetch(`/api/appointments/schedules?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setMyChildrenScheduleItems([]);
        setMyChildrenScheduleMessage(data?.message || "Failed to load child schedule.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => mapMyChildrenScheduleItem(item))
        .filter((item) => Boolean(item.id))
        .filter((item) => item.status !== "cancelled")
        .sort((a, b) => {
          const dateCompare = String(a.appointmentDate || "").localeCompare(
            String(b.appointmentDate || "")
          );
          if (dateCompare !== 0) {
            return dateCompare;
          }
          const startCompare = String(a.startTime || "").localeCompare(String(b.startTime || ""));
          if (startCompare !== 0) {
            return startCompare;
          }
          return String(a.id || "").localeCompare(String(b.id || ""));
        });

      setMyChildrenScheduleItems(nextItems);
      if (nextItems.length === 0) {
        setMyChildrenScheduleMessage(
          myChildrenIsCompact
            ? "No lessons scheduled for selected day."
            : "No lessons scheduled for selected week."
        );
      }
    } catch {
      setMyChildrenScheduleItems([]);
      setMyChildrenScheduleMessage("Failed to load child schedule.");
    } finally {
      setMyChildrenScheduleLoading(false);
    }
  }, [canOpenMyChildren, myChildrenIsCompact, myChildrenOptions, navigate, todayYmd]);

  const goToPreviousMyChildrenDay = useCallback(() => {
    setMyChildrenDateYmd((prev) => shiftDateYmd(prev, myChildrenIsCompact ? -1 : -7, todayYmd));
  }, [myChildrenIsCompact, todayYmd]);

  const goToNextMyChildrenDay = useCallback(() => {
    setMyChildrenDateYmd((prev) => shiftDateYmd(prev, myChildrenIsCompact ? 1 : 7, todayYmd));
  }, [myChildrenIsCompact, todayYmd]);

  const confirmMyChildrenPendingAppointment = useCallback(async (item) => {
    const status = String(item?.status || "").trim().toLowerCase();
    if (status !== "pending") {
      return;
    }

    const appointmentId = String(item?.id || item?.appointmentId || "").trim();
    const specialistId = String(item?.specialistId || item?.specialist_id || "").trim();
    const clientId = String(item?.clientId || item?.client_id || "").trim();
    const appointmentDate = String(item?.appointmentDate || item?.appointment_date || "").trim();
    const startTime = String(item?.startTime || item?.start_time || "").trim();
    const endTime = String(item?.endTime || item?.end_time || "").trim();
    const durationMinutes = String(item?.durationMinutes || item?.duration_minutes || "").trim();
    const serviceName = String(item?.serviceName || item?.service_name || "").trim() || "Service";
    const note = String(item?.note || "").trim();

    if (
      !appointmentId
      || !specialistId
      || !clientId
      || !appointmentDate
      || !startTime
      || !endTime
      || !durationMinutes
    ) {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert("Failed to confirm lesson.");
      }
      return;
    }
    if (myChildrenConfirmingByAppointmentId[appointmentId]) {
      return;
    }

    try {
      setMyChildrenConfirmingByAppointmentId((prev) => ({
        ...prev,
        [appointmentId]: true
      }));

      const response = await apiFetch(
        `/api/appointments/schedules/${encodeURIComponent(appointmentId)}?scope=single`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            specialistId,
            clientId,
            appointmentDate,
            startTime,
            endTime,
            durationMinutes,
            service: serviceName,
            status: "confirmed",
            note
          })
        }
      );
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert(String(data?.message || "Failed to confirm lesson.").trim());
        }
        return;
      }

      await loadMyChildrenSchedule({
        clientId: myChildrenSelectedClientId,
        dateYmd: myChildrenDateYmd
      });
    } catch {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert("Failed to confirm lesson.");
      }
    } finally {
      setMyChildrenConfirmingByAppointmentId((prev) => {
        const next = { ...prev };
        delete next[appointmentId];
        return next;
      });
    }
  }, [
    loadMyChildrenSchedule,
    myChildrenConfirmingByAppointmentId,
    myChildrenDateYmd,
    myChildrenSelectedClientId
  ]);

  useEffect(() => {
    if (!profileUsername || mainView !== "appointment-vip-my-children") {
      return;
    }
    if (!myChildrenOptionsReady) {
      return;
    }
    loadMyChildrenSchedule({
      clientId: myChildrenSelectedClientId,
      dateYmd: myChildrenDateYmd
    });
  }, [
    loadMyChildrenSchedule,
    mainView,
    myChildrenDateYmd,
    myChildrenOptionsReady,
    myChildrenSelectedClientId,
    profileUsername
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mq = window.matchMedia("(max-width: 860px)");
    const handleViewportChange = () => {
      setMyChildrenIsCompact(false);
      setMyChildrenDateYmd((prev) => getMyChildrenWeekStartYmd(prev, todayYmd));
    };
    handleViewportChange();
    mq.addEventListener("change", handleViewportChange);
    return () => {
      mq.removeEventListener("change", handleViewportChange);
    };
  }, [todayYmd]);

  useEffect(() => {
    if (!profileUsername || mainView !== "appointment-vip-my-children") {
      return;
    }
    void loadMyChildrenVisibleWeekDays();
  }, [loadMyChildrenVisibleWeekDays, mainView, profileUsername]);

  return {
    myChildrenIsCompact,
    myChildrenDateYmd,
    myChildrenVisibleWeekDays,
    myChildrenOptions,
    myChildrenOptionsLoading,
    myChildrenSelectedClientId,
    setMyChildrenSelectedClientId,
    myChildrenScheduleItems,
    myChildrenScheduleLoading,
    myChildrenScheduleMessage,
    myChildrenConfirmingByAppointmentId,
    loadMyChildrenOptions,
    goToPreviousMyChildrenDay,
    goToNextMyChildrenDay,
    confirmMyChildrenPendingAppointment
  };
}
