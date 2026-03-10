import { useCallback, useState } from "react";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../lib/api.js";
import { handleProtectedStatus } from "./profile.helpers.js";
import {
  mapVipAttendanceClient,
  normalizeVipAttendanceDateTime,
  normalizeVipAttendanceDraftEntry,
  normalizeVipAttendanceStatus,
  resolveVipAttendanceDate
} from "./profile.vip-utils.js";

export function useProfileVipAttendance({
  canReadAppointmentVipClients,
  canCreateAppointmentVipClients,
  canUpdateAppointmentVipClients,
  canDeleteAppointmentVipClients,
  canOpenAppointmentStatistics,
  navigate,
  profileUsername,
  todayYmd
}) {
  const [vipAttendancePeriod, setVipAttendancePeriod] = useState(() => ({
    from: todayYmd,
    to: todayYmd
  }));
  const [vipAttendanceItems, setVipAttendanceItems] = useState([]);
  const [vipAttendanceTeacherOptions, setVipAttendanceTeacherOptions] = useState([]);
  const [vipAttendanceDraftByClientId, setVipAttendanceDraftByClientId] = useState({});
  const [vipAttendanceMessage, setVipAttendanceMessage] = useState("");
  const [vipAttendanceLoading, setVipAttendanceLoading] = useState(false);
  const [vipAttendanceSavingByClientId, setVipAttendanceSavingByClientId] = useState({});
  const [statisticsVipAttendanceHistoryItems, setStatisticsVipAttendanceHistoryItems] = useState([]);
  const [statisticsVipAttendanceHistoryFilters, setStatisticsVipAttendanceHistoryFilters] = useState({
    classes: [],
    teachers: [],
    tutors: [],
    clients: []
  });
  const [statisticsVipAttendanceHistoryMessage, setStatisticsVipAttendanceHistoryMessage] = useState("");
  const [statisticsVipAttendanceHistoryLoading, setStatisticsVipAttendanceHistoryLoading] = useState(false);

  const setVipAttendancePeriodField = useCallback((field, nextDate) => {
    const normalizedField = String(field || "").trim().toLowerCase();
    if (normalizedField !== "from" && normalizedField !== "to") {
      return;
    }
    const normalizedDate = String(nextDate || "").trim() || todayYmd;
    setVipAttendancePeriod((prev) => {
      const base = prev && typeof prev === "object"
        ? prev
        : { from: todayYmd, to: todayYmd };
      const next = {
        from: String(base.from || "").trim() || todayYmd,
        to: String(base.to || "").trim() || todayYmd
      };
      next[normalizedField] = normalizedDate;
      if (next.from && next.to && next.from > next.to) {
        if (normalizedField === "from") {
          next.to = next.from;
        } else {
          next.from = next.to;
        }
      }
      return next;
    });
    setVipAttendanceDraftByClientId({});
  }, [todayYmd]);

  const loadStatisticsVipAttendanceHistory = useCallback(async ({
    from = "",
    to = "",
    classId = "",
    teacherId = "",
    tutorId = "",
    clientId = ""
  } = {}) => {
    if (!profileUsername) {
      return;
    }
    if (!canOpenAppointmentStatistics) {
      setStatisticsVipAttendanceHistoryItems([]);
      setStatisticsVipAttendanceHistoryFilters({
        classes: [],
        teachers: [],
        tutors: [],
        clients: []
      });
      setStatisticsVipAttendanceHistoryMessage("You do not have permission to view VIP attendance history.");
      return;
    }

    const normalizedFrom = String(from || "").trim() || todayYmd;
    const normalizedTo = String(to || "").trim() || normalizedFrom;
    const normalizedClassId = String(classId || "").trim();
    const normalizedTeacherId = String(teacherId || "").trim();
    const normalizedTutorId = String(tutorId || "").trim();
    const normalizedClientId = String(clientId || "").trim();

    const query = new URLSearchParams({
      from: normalizedFrom,
      to: normalizedTo,
      limit: "1000"
    });
    if (normalizedClassId && normalizedClassId !== "all") {
      query.set("classId", normalizedClassId);
    }
    if (normalizedTeacherId && normalizedTeacherId !== "all") {
      query.set("teacherId", normalizedTeacherId);
    }
    if (normalizedTutorId && normalizedTutorId !== "all") {
      query.set("tutorId", normalizedTutorId);
    }
    if (normalizedClientId && normalizedClientId !== "all") {
      query.set("clientId", normalizedClientId);
    }

    setStatisticsVipAttendanceHistoryLoading(true);
    setStatisticsVipAttendanceHistoryMessage("");
    try {
      const response = await apiFetch(`/api/clients/vip-attendance/history?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setStatisticsVipAttendanceHistoryItems([]);
        setStatisticsVipAttendanceHistoryFilters({
          classes: [],
          teachers: [],
          tutors: [],
          clients: []
        });
        setStatisticsVipAttendanceHistoryMessage(data?.message || "Failed to load attendance history.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : []).map((item) => ({
        id: String(item?.id || "").trim(),
        clientId: String(item?.clientId || item?.client_id || "").trim(),
        firstName: String(item?.firstName || item?.first_name || "").trim(),
        lastName: String(item?.lastName || item?.last_name || "").trim(),
        middleName: String(item?.middleName || item?.middle_name || "").trim(),
        classId: String(item?.classId || item?.class_id || "").trim(),
        className: String(item?.className || item?.class_name || "").trim(),
        teacherId: String(item?.teacherId || item?.teacher_id || "").trim(),
        teacherName: String(item?.teacherName || item?.teacher_name || "").trim(),
        tutorId: String(item?.tutorId || item?.tutor_id || "").trim(),
        tutorName: String(item?.tutorName || item?.tutor_name || "").trim(),
        attendanceDate: String(item?.attendanceDate || item?.attendance_date || "").trim(),
        attendanceStatus: String(item?.attendanceStatus || item?.attendance_status || "").trim().toLowerCase() === "present"
          ? "present"
          : "absent",
        arrivedAt: String(item?.arrivedAt || item?.arrived_at || "").trim(),
        leftAt: String(item?.leftAt || item?.left_at || "").trim(),
        note: String(item?.note || item?.attendanceNote || item?.attendance_note || "").trim()
      }));

      const nextClasses = (Array.isArray(data?.classes) ? data.classes : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          className: String(item?.className || item?.class_name || "").trim(),
          teacherId: String(item?.teacherId || item?.teacher_id || "").trim(),
          teacherName: String(item?.teacherName || item?.teacher_name || "").trim()
        }))
        .filter((item) => Boolean(item.id) && Boolean(item.className));

      const nextTeachers = (Array.isArray(data?.teachers) ? data.teachers : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      const nextTutors = (Array.isArray(data?.tutors) ? data.tutors : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      const nextClients = (Array.isArray(data?.clients) ? data.clients : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          firstName: String(item?.firstName || item?.first_name || "").trim(),
          lastName: String(item?.lastName || item?.last_name || "").trim(),
          middleName: String(item?.middleName || item?.middle_name || "").trim()
        }))
        .filter((item) => Boolean(item.id));

      setStatisticsVipAttendanceHistoryItems(nextItems);
      setStatisticsVipAttendanceHistoryFilters({
        classes: nextClasses,
        teachers: nextTeachers,
        tutors: nextTutors,
        clients: nextClients
      });
      if (nextItems.length === 0) {
        setStatisticsVipAttendanceHistoryMessage("No attendance history found.");
      }
    } catch {
      setStatisticsVipAttendanceHistoryItems([]);
      setStatisticsVipAttendanceHistoryMessage("Failed to load attendance history.");
    } finally {
      setStatisticsVipAttendanceHistoryLoading(false);
    }
  }, [canOpenAppointmentStatistics, navigate, profileUsername, todayYmd]);

  const loadVipAttendanceTeachers = useCallback(async () => {
    if (!canReadAppointmentVipClients) {
      setVipAttendanceTeacherOptions([]);
      return;
    }

    try {
      const response = await apiFetch("/api/clients/vip-attendance/teachers", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setVipAttendanceTeacherOptions([]);
        return;
      }
      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => ({
          id: String(item?.id || "").trim(),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setVipAttendanceTeacherOptions(nextItems);
    } catch {
      setVipAttendanceTeacherOptions([]);
    }
  }, [canReadAppointmentVipClients, navigate]);

  const loadVipAttendance = useCallback(async ({
    mineOnly = false
  } = {}) => {
    if (!canReadAppointmentVipClients) {
      setVipAttendanceItems([]);
      setVipAttendanceTeacherOptions([]);
      setVipAttendanceDraftByClientId({});
      setVipAttendanceMessage("You do not have permission to view VIP attendance.");
      return;
    }

    setVipAttendanceLoading(true);
    setVipAttendanceMessage("");
    try {
      const attendanceDate = resolveVipAttendanceDate(vipAttendancePeriod, todayYmd);
      const query = new URLSearchParams({
        isVip: "true",
        limit: "100",
        attendanceDate
      });
      if (mineOnly) {
        query.set("assignmentScope", "mine");
      }
      const response = await apiFetch(`/api/clients/search?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setVipAttendanceItems([]);
        setVipAttendanceDraftByClientId({});
        setVipAttendanceMessage(data?.message || "Failed to load VIP attendance clients.");
        return;
      }

      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => mapVipAttendanceClient(item))
        .filter((item) => Boolean(item.id))
        .sort((a, b) => {
          const nameA = `${a.firstName} ${a.lastName} ${a.middleName}`.trim();
          const nameB = `${b.firstName} ${b.lastName} ${b.middleName}`.trim();
          return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
        });

      setVipAttendanceItems(nextItems);
      setVipAttendanceDraftByClientId((prev) => {
        const next = {};
        nextItems.forEach((item) => {
          const previous = normalizeVipAttendanceDraftEntry(prev[item.id]);
          const fromServer = normalizeVipAttendanceDraftEntry({
            status: item.attendanceStatus,
            arrivedAt: item.arrivedAt,
            leftAt: item.leftAt,
            note: item.note
          });
          const source = item.hasAttendanceData ? fromServer : previous;
          const nextStatus = normalizeVipAttendanceStatus(source.status, "unmarked");
          const normalizedSourceNote = String(source.note || "").trim();
          const normalizedItemNote = String(item.note || "").trim();
          next[item.id] = {
            status: nextStatus,
            arrivedAt: nextStatus === "present" ? String(source.arrivedAt || "").trim() : "",
            leftAt: nextStatus === "present" ? String(source.leftAt || "").trim() : "",
            note: normalizedSourceNote || normalizedItemNote
          };
        });
        return next;
      });
      if (nextItems.length === 0) {
        setVipAttendanceMessage(mineOnly ? "No assigned children found." : "");
      }
    } catch {
      setVipAttendanceItems([]);
      setVipAttendanceDraftByClientId({});
      setVipAttendanceMessage(
        mineOnly
          ? "Failed to load assigned children."
          : "Failed to load VIP attendance clients."
      );
    } finally {
      setVipAttendanceLoading(false);
    }
  }, [canReadAppointmentVipClients, navigate, vipAttendancePeriod, todayYmd]);

  const saveVipAttendanceRecord = useCallback(async ({
    clientId,
    status,
    note = "",
    markLeft = false,
    arrivedAt = "",
    leftAt = "",
    reset = false
  }) => {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      return { ok: false, message: "Client is required." };
    }

    const shouldReset = reset === true;
    if (shouldReset && !canDeleteAppointmentVipClients) {
      return { ok: false, message: "You do not have permission to delete VIP attendance." };
    }
    if (!shouldReset && !canCreateAppointmentVipClients && !canUpdateAppointmentVipClients) {
      return { ok: false, message: "You do not have permission to save VIP attendance." };
    }
    const normalizedStatus = ["present", "absent"].includes(String(status || "").trim().toLowerCase())
      ? String(status || "").trim().toLowerCase()
      : (shouldReset ? "unmarked" : "");
    if (!shouldReset && !normalizedStatus) {
      return { ok: false, message: "Invalid attendance status." };
    }

    const normalizedNote = String(note || "").trim();
    const normalizedArrivedAt = String(arrivedAt || "").trim();
    const normalizedLeftAt = String(leftAt || "").trim();
    const attendanceDate = resolveVipAttendanceDate(vipAttendancePeriod, todayYmd);
    setVipAttendanceSavingByClientId((prev) => ({ ...prev, [normalizedClientId]: true }));
    setVipAttendanceMessage("");

    try {
      const response = await apiFetch("/api/clients/vip-attendance", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clientId: normalizedClientId,
          attendanceDate,
          status: shouldReset ? null : normalizedStatus,
          note: normalizedNote,
          markLeft: markLeft === true,
          arrivedAt: shouldReset ? null : (normalizedArrivedAt || null),
          leftAt: shouldReset ? null : (normalizedLeftAt || null),
          reset: shouldReset
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return { ok: false, message: "Unauthorized." };
        }
        const message = getApiErrorMessage(response, data, "Failed to save VIP attendance.");
        setVipAttendanceMessage(message);
        return { ok: false, message };
      }

      const item = data?.item && typeof data.item === "object" ? data.item : {};
      const nextStatus = normalizeVipAttendanceStatus(
        item?.attendanceStatus || normalizedStatus,
        shouldReset ? "unmarked" : normalizedStatus
      );
      const nextArrivedAt = normalizeVipAttendanceDateTime(item?.arrivedAt || item?.arrived_at);
      const nextLeftAt = normalizeVipAttendanceDateTime(item?.leftAt || item?.left_at);
      const nextNote = String(
        item?.attendanceNote || item?.attendance_note || item?.note || normalizedNote
      ).trim();

      setVipAttendanceDraftByClientId((prev) => ({
        ...prev,
        [normalizedClientId]: {
          status: nextStatus,
          arrivedAt: nextStatus === "present" ? nextArrivedAt : "",
          leftAt: nextStatus === "present" ? nextLeftAt : "",
          note: nextStatus === "unmarked" ? "" : nextNote
        }
      }));

      return {
        ok: true,
        status: nextStatus,
        arrivedAt: nextArrivedAt,
        leftAt: nextLeftAt,
        note: nextStatus === "unmarked" ? "" : nextNote
      };
    } catch {
      const message = "Failed to save VIP attendance.";
      setVipAttendanceMessage(message);
      return { ok: false, message };
    } finally {
      setVipAttendanceSavingByClientId((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, normalizedClientId)) {
          return prev;
        }
        const next = { ...prev };
        delete next[normalizedClientId];
        return next;
      });
    }
  }, [
    canCreateAppointmentVipClients,
    canUpdateAppointmentVipClients,
    canDeleteAppointmentVipClients,
    navigate,
    todayYmd,
    vipAttendancePeriod
  ]);

  const markVipAttendancePresent = useCallback(async (clientId) => {
    const result = await saveVipAttendanceRecord({
      clientId,
      status: "present"
    });
    return result;
  }, [saveVipAttendanceRecord]);

  const saveVipAttendanceAbsentReason = useCallback(async (clientId, reason) => {
    const result = await saveVipAttendanceRecord({
      clientId,
      status: "absent",
      note: reason
    });
    return result;
  }, [saveVipAttendanceRecord]);

  const markVipAttendanceLeft = useCallback(async (clientId) => {
    const result = await saveVipAttendanceRecord({
      clientId,
      status: "present",
      markLeft: true
    });
    return result;
  }, [saveVipAttendanceRecord]);

  const saveVipAttendanceEdit = useCallback(async (clientId, {
    status = "",
    arrivedAt = "",
    leftAt = "",
    note = "",
    reset = false
  } = {}) => {
    const shouldReset = reset === true;
    if (shouldReset) {
      return saveVipAttendanceRecord({
        clientId,
        reset: true
      });
    }

    const normalizedStatus = ["present", "absent"].includes(String(status || "").trim().toLowerCase())
      ? String(status || "").trim().toLowerCase()
      : "";
    const normalizedArrivedAt = String(arrivedAt || "").trim();
    const normalizedLeftAt = String(leftAt || "").trim();
    const normalizedNote = String(note || "").trim();

    if (normalizedStatus === "present" && normalizedLeftAt && !normalizedArrivedAt) {
      return { ok: false, message: "Arrival time is required when departure time is set." };
    }
    if (normalizedStatus === "present" && normalizedArrivedAt && normalizedLeftAt && normalizedLeftAt < normalizedArrivedAt) {
      return { ok: false, message: "Departure time must be later than arrival time." };
    }
    if (normalizedStatus === "absent" && !normalizedNote) {
      return { ok: false, message: "Reason is required for absent." };
    }

    if (normalizedStatus === "present") {
      return saveVipAttendanceRecord({
        clientId,
        status: "present",
        note: "",
        arrivedAt: normalizedArrivedAt,
        leftAt: normalizedLeftAt
      });
    }

    if (normalizedStatus === "absent") {
      return saveVipAttendanceRecord({
        clientId,
        status: "absent",
        note: normalizedNote,
        arrivedAt: "",
        leftAt: ""
      });
    }

    if (!normalizedArrivedAt && !normalizedNote) {
      return saveVipAttendanceRecord({
        clientId,
        reset: true
      });
    }

    const nextStatus = normalizedArrivedAt ? "present" : "absent";

    return saveVipAttendanceRecord({
      clientId,
      status: nextStatus,
      note: normalizedNote,
      arrivedAt: normalizedArrivedAt,
      leftAt: normalizedLeftAt
    });
  }, [saveVipAttendanceRecord]);

  return {
    vipAttendancePeriod,
    vipAttendanceItems,
    vipAttendanceTeacherOptions,
    vipAttendanceDraftByClientId,
    vipAttendanceMessage,
    vipAttendanceLoading,
    vipAttendanceSavingByClientId,
    statisticsVipAttendanceHistoryItems,
    statisticsVipAttendanceHistoryFilters,
    statisticsVipAttendanceHistoryMessage,
    statisticsVipAttendanceHistoryLoading,
    setVipAttendancePeriodField,
    loadStatisticsVipAttendanceHistory,
    loadVipAttendanceTeachers,
    loadVipAttendance,
    markVipAttendancePresent,
    saveVipAttendanceAbsentReason,
    markVipAttendanceLeft,
    saveVipAttendanceEdit
  };
}
