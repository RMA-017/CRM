import { useCallback, useState } from "react";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../lib/api.js";
import {
  compareTextInsensitive,
  handleProtectedStatus,
  mapVipClassAssignmentOption,
  sortVipClassDailyRoutineRows
} from "./profile.helpers.js";
import {
  mapVipClassDailyRoutineItem,
  normalizeVipDailyRoutineActivityType
} from "./profile.vip-utils.js";

export function useVipDailyRoutinesSection({
  canReadAppointmentVipClients,
  canOpenMyChildren,
  canCreateAppointmentVipClients,
  canUpdateAppointmentVipClients,
  canDeleteAppointmentVipClients,
  navigate
}) {
  const [vipDailyRoutineItems, setVipDailyRoutineItems] = useState([]);
  const [vipDailyRoutineClasses, setVipDailyRoutineClasses] = useState([]);
  const [vipDailyRoutineMessage, setVipDailyRoutineMessage] = useState("");
  const [vipDailyRoutineLoading, setVipDailyRoutineLoading] = useState(false);
  const [vipDailyRoutineSavingById, setVipDailyRoutineSavingById] = useState({});
  const canReadVipDailyRoutines = Boolean(canReadAppointmentVipClients || canOpenMyChildren);

  const loadVipDailyRoutines = useCallback(async ({
    classId = "",
    dayOfWeek = ""
  } = {}) => {
    if (!canReadVipDailyRoutines) {
      setVipDailyRoutineItems([]);
      setVipDailyRoutineClasses([]);
      setVipDailyRoutineMessage("You do not have permission to view VIP daily routines.");
      return;
    }

    const normalizedClassId = String(classId || "").trim();
    const parsedDayOfWeek = Number.parseInt(String(dayOfWeek || "").trim(), 10);
    const normalizedDayOfWeek = Number.isInteger(parsedDayOfWeek) && parsedDayOfWeek >= 1 && parsedDayOfWeek <= 7
      ? String(parsedDayOfWeek)
      : "";

    const query = new URLSearchParams({
      limit: "2000"
    });
    if (normalizedClassId) {
      query.set("classId", normalizedClassId);
    }
    if (normalizedDayOfWeek) {
      query.set("dayOfWeek", normalizedDayOfWeek);
    }

    setVipDailyRoutineLoading(true);
    setVipDailyRoutineMessage("");
    try {
      const response = await apiFetch(`/api/clients/vip-class-daily-routines?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setVipDailyRoutineItems([]);
        setVipDailyRoutineClasses([]);
        setVipDailyRoutineMessage(data?.message || "Failed to load VIP daily routines.");
        return;
      }

      const nextClasses = (Array.isArray(data?.classes) ? data.classes : [])
        .map((item) => mapVipClassAssignmentOption(item))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => compareTextInsensitive(a.className, b.className));

      const nextItems = sortVipClassDailyRoutineRows(
        (Array.isArray(data?.items) ? data.items : [])
          .map((item) => mapVipClassDailyRoutineItem(item))
          .filter((item) => Boolean(item.id) && Boolean(item.classId))
      );

      setVipDailyRoutineClasses(nextClasses);
      setVipDailyRoutineItems(nextItems);
      if (nextItems.length === 0) {
        setVipDailyRoutineMessage("No daily routines found.");
      }
    } catch {
      setVipDailyRoutineItems([]);
      setVipDailyRoutineClasses([]);
      setVipDailyRoutineMessage("Failed to load VIP daily routines.");
    } finally {
      setVipDailyRoutineLoading(false);
    }
  }, [canReadVipDailyRoutines, navigate]);

  const saveVipDailyRoutine = useCallback(async ({
    id = "",
    classId = "",
    dayOfWeek = 0,
    activityType = "",
    startTime = "",
    endTime = "",
    note = ""
  } = {}) => {
    const normalizedId = String(id || "").trim();
    const isEditMode = Boolean(normalizedId);
    if (isEditMode && !canUpdateAppointmentVipClients) {
      const message = "You do not have permission to update VIP daily routines.";
      setVipDailyRoutineMessage(message);
      return { ok: false, message };
    }
    if (!isEditMode && !canCreateAppointmentVipClients) {
      const message = "You do not have permission to create VIP daily routines.";
      setVipDailyRoutineMessage(message);
      return { ok: false, message };
    }

    const normalizedClassId = String(classId || "").trim();
    const parsedDayOfWeek = Number.parseInt(String(dayOfWeek || "").trim(), 10);
    const normalizedActivityType = normalizeVipDailyRoutineActivityType(activityType);
    const normalizedStartTime = String(startTime || "").trim();
    const normalizedEndTime = String(endTime || "").trim();
    const normalizedNote = String(note || "").trim();

    if (!normalizedClassId) {
      return { ok: false, message: "Class is required." };
    }
    if (!Number.isInteger(parsedDayOfWeek) || parsedDayOfWeek < 1 || parsedDayOfWeek > 7) {
      return { ok: false, message: "Day must be between 1 and 7." };
    }
    if (!normalizedActivityType) {
      return { ok: false, message: "Activity must be lesson, breakfast, lunch, afternoon-snack, sleep or other." };
    }
    if (!/^\d{2}:\d{2}$/.test(normalizedStartTime) || !/^\d{2}:\d{2}$/.test(normalizedEndTime)) {
      return { ok: false, message: "Start and end time must be HH:mm." };
    }
    if (normalizedEndTime <= normalizedStartTime) {
      return { ok: false, message: "End time must be later than start time." };
    }

    const savingKey = normalizedId || "__new__";
    setVipDailyRoutineSavingById((prev) => ({ ...prev, [savingKey]: true }));
    setVipDailyRoutineMessage("");

    try {
      const response = await apiFetch("/api/clients/vip-class-daily-routines", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: normalizedId || null,
          classId: normalizedClassId,
          dayOfWeek: parsedDayOfWeek,
          activityType: normalizedActivityType,
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
          note: normalizedNote
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return { ok: false, message: "Unauthorized." };
        }
        const message = getApiErrorMessage(response, data, "Failed to save VIP daily routine.");
        setVipDailyRoutineMessage(message);
        return { ok: false, message };
      }

      const nextItem = mapVipClassDailyRoutineItem(data?.item || {});
      setVipDailyRoutineItems((prev) => {
        const filtered = prev.filter((item) => String(item?.id || "") !== String(nextItem.id || ""));
        filtered.push(nextItem);
        return sortVipClassDailyRoutineRows(filtered);
      });
      setVipDailyRoutineClasses((prev) => {
        const normalized = Array.isArray(prev) ? prev : [];
        const existing = normalized.some((item) => String(item?.id || "").trim() === String(nextItem.classId || "").trim());
        if (existing || !nextItem.classId) {
          return normalized;
        }
        return [
          ...normalized,
          {
            id: nextItem.classId,
            className: nextItem.className,
            teacherId: nextItem.teacherId,
            teacherName: nextItem.teacherName
          }
        ].sort((a, b) => compareTextInsensitive(a.className, b.className));
      });

      return { ok: true, item: nextItem };
    } catch {
      const message = "Failed to save VIP daily routine.";
      setVipDailyRoutineMessage(message);
      return { ok: false, message };
    } finally {
      setVipDailyRoutineSavingById((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, savingKey)) {
          return prev;
        }
        const next = { ...prev };
        delete next[savingKey];
        return next;
      });
    }
  }, [canCreateAppointmentVipClients, canUpdateAppointmentVipClients, navigate]);

  const deleteVipDailyRoutine = useCallback(async (routineId) => {
    const normalizedRoutineId = String(routineId || "").trim();
    if (!normalizedRoutineId) {
      return { ok: false, message: "Routine is required." };
    }
    if (!canDeleteAppointmentVipClients) {
      return { ok: false, message: "You do not have permission to delete VIP daily routines." };
    }

    setVipDailyRoutineSavingById((prev) => ({ ...prev, [normalizedRoutineId]: true }));
    setVipDailyRoutineMessage("");
    try {
      const response = await apiFetch(`/api/clients/vip-class-daily-routines/${encodeURIComponent(normalizedRoutineId)}`, {
        method: "DELETE"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return { ok: false, message: "Unauthorized." };
        }
        const message = getApiErrorMessage(response, data, "Failed to delete VIP daily routine.");
        setVipDailyRoutineMessage(message);
        return { ok: false, message };
      }

      setVipDailyRoutineItems((prev) => prev.filter((item) => String(item?.id || "") !== normalizedRoutineId));
      return { ok: true };
    } catch {
      const message = "Failed to delete VIP daily routine.";
      setVipDailyRoutineMessage(message);
      return { ok: false, message };
    } finally {
      setVipDailyRoutineSavingById((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, normalizedRoutineId)) {
          return prev;
        }
        const next = { ...prev };
        delete next[normalizedRoutineId];
        return next;
      });
    }
  }, [canDeleteAppointmentVipClients, navigate]);

  return {
    vipDailyRoutineItems,
    vipDailyRoutineClasses,
    vipDailyRoutineMessage,
    vipDailyRoutineLoading,
    vipDailyRoutineSavingById,
    loadVipDailyRoutines,
    saveVipDailyRoutine,
    deleteVipDailyRoutine
  };
}
