import { useEffect, useState } from "react";

const STATISTICS_HISTORY_FILTERS_STORAGE_PREFIX = "crm.statistics.class.filters.v1";

function normalizeDateYmdValue(value, fallback) {
  const normalized = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  return String(fallback || "").trim();
}

function normalizeStatisticsFilterValue(value) {
  const normalized = String(value || "").trim();
  return normalized || "all";
}

function loadPersistedStatisticsFilters(storageKey, todayYmd) {
  let nextPeriodFrom = todayYmd;
  let nextPeriodTo = todayYmd;
  let nextClassId = "all";
  let nextTeacherId = "all";
  let nextTutorId = "all";
  let nextClientId = "all";

  if (typeof window === "undefined") {
    return {
      period: { from: nextPeriodFrom, to: nextPeriodTo },
      classId: nextClassId,
      teacherId: nextTeacherId,
      tutorId: nextTutorId,
      clientId: nextClientId
    };
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (rawValue) {
      const parsed = JSON.parse(rawValue);
      nextPeriodFrom = normalizeDateYmdValue(parsed?.from, todayYmd);
      nextPeriodTo = normalizeDateYmdValue(parsed?.to, nextPeriodFrom || todayYmd);
      if (nextPeriodFrom && nextPeriodTo && nextPeriodFrom > nextPeriodTo) {
        nextPeriodTo = nextPeriodFrom;
      }
      nextClassId = normalizeStatisticsFilterValue(parsed?.classId);
      nextTeacherId = normalizeStatisticsFilterValue(parsed?.teacherId);
      nextTutorId = normalizeStatisticsFilterValue(parsed?.tutorId);
      nextClientId = normalizeStatisticsFilterValue(parsed?.clientId);
    }
  } catch {}

  return {
    period: { from: nextPeriodFrom, to: nextPeriodTo },
    classId: nextClassId,
    teacherId: nextTeacherId,
    tutorId: nextTutorId,
    clientId: nextClientId
  };
}

function persistStatisticsFilters({
  storageKey,
  todayYmd,
  period,
  classId,
  teacherId,
  tutorId,
  clientId
}) {
  if (typeof window === "undefined") {
    return;
  }

  const nextFrom = normalizeDateYmdValue(period.from, todayYmd);
  let nextTo = normalizeDateYmdValue(period.to, nextFrom || todayYmd);
  if (nextFrom && nextTo && nextFrom > nextTo) {
    nextTo = nextFrom;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      from: nextFrom,
      to: nextTo,
      classId: normalizeStatisticsFilterValue(classId),
      teacherId: normalizeStatisticsFilterValue(teacherId),
      tutorId: normalizeStatisticsFilterValue(tutorId),
      clientId: normalizeStatisticsFilterValue(clientId)
    }));
  } catch {}
}

export default function useProfileStatisticsHistory({
  mainView,
  profile,
  statisticsVipAttendanceHistoryFilters,
  loadStatisticsVipAttendanceHistory
}) {
  const isProfileReady = Boolean(profile?.username);
  const todayYmd = new Date().toISOString().slice(0, 10);
  const [statisticsHistoryPeriod, setStatisticsHistoryPeriod] = useState(() => ({
    from: todayYmd,
    to: todayYmd
  }));
  const [statisticsHistoryClassId, setStatisticsHistoryClassId] = useState("all");
  const [statisticsHistoryTeacherId, setStatisticsHistoryTeacherId] = useState("all");
  const [statisticsHistoryTutorId, setStatisticsHistoryTutorId] = useState("all");
  const [statisticsHistoryClientId, setStatisticsHistoryClientId] = useState("all");
  const [statisticsHistoryHydrated, setStatisticsHistoryHydrated] = useState(false);
  const statisticsHistoryStorageKey = [
    STATISTICS_HISTORY_FILTERS_STORAGE_PREFIX,
    String(profile?.organizationCode || "").trim().toLowerCase() || "global",
    String(profile?.username || "").trim().toLowerCase() || "anonymous"
  ].join(":");

  useEffect(() => {
    if (mainView !== "statistics-class") {
      return;
    }
    if (!isProfileReady) {
      setStatisticsHistoryHydrated(false);
      return;
    }
    const persisted = loadPersistedStatisticsFilters(statisticsHistoryStorageKey, todayYmd);
    setStatisticsHistoryPeriod(persisted.period);
    setStatisticsHistoryClassId(persisted.classId);
    setStatisticsHistoryTeacherId(persisted.teacherId);
    setStatisticsHistoryTutorId(persisted.tutorId);
    setStatisticsHistoryClientId(persisted.clientId);
    setStatisticsHistoryHydrated(true);
  }, [isProfileReady, mainView, statisticsHistoryStorageKey, todayYmd]);

  useEffect(() => {
    if (!isProfileReady || !statisticsHistoryHydrated) {
      return;
    }
    persistStatisticsFilters({
      storageKey: statisticsHistoryStorageKey,
      todayYmd,
      period: statisticsHistoryPeriod,
      classId: statisticsHistoryClassId,
      teacherId: statisticsHistoryTeacherId,
      tutorId: statisticsHistoryTutorId,
      clientId: statisticsHistoryClientId
    });
  }, [
    isProfileReady,
    statisticsHistoryHydrated,
    statisticsHistoryStorageKey,
    statisticsHistoryPeriod,
    statisticsHistoryClassId,
    statisticsHistoryTeacherId,
    statisticsHistoryTutorId,
    statisticsHistoryClientId,
    todayYmd
  ]);

  useEffect(() => {
    if (mainView !== "statistics-class" || statisticsHistoryClassId === "all") {
      return;
    }
    const classItems = Array.isArray(statisticsVipAttendanceHistoryFilters?.classes)
      ? statisticsVipAttendanceHistoryFilters.classes
      : [];
    if (classItems.length === 0) {
      return;
    }
    const existsInList = classItems.some((item) => String(item?.id || "").trim() === statisticsHistoryClassId);
    if (!existsInList) {
      setStatisticsHistoryClassId("all");
    }
  }, [mainView, statisticsHistoryClassId, statisticsVipAttendanceHistoryFilters?.classes]);

  useEffect(() => {
    if (mainView !== "statistics-class" || statisticsHistoryTeacherId === "all") {
      return;
    }
    const teacherItems = Array.isArray(statisticsVipAttendanceHistoryFilters?.teachers)
      ? statisticsVipAttendanceHistoryFilters.teachers
      : [];
    if (teacherItems.length === 0) {
      return;
    }
    const existsInList = teacherItems.some((item) => String(item?.id || "").trim() === statisticsHistoryTeacherId);
    if (!existsInList) {
      setStatisticsHistoryTeacherId("all");
    }
  }, [mainView, statisticsHistoryTeacherId, statisticsVipAttendanceHistoryFilters?.teachers]);

  useEffect(() => {
    if (mainView !== "statistics-class" || statisticsHistoryTutorId === "all") {
      return;
    }
    const tutorItems = Array.isArray(statisticsVipAttendanceHistoryFilters?.tutors)
      ? statisticsVipAttendanceHistoryFilters.tutors
      : [];
    if (tutorItems.length === 0) {
      return;
    }
    const existsInList = tutorItems.some((item) => String(item?.id || "").trim() === statisticsHistoryTutorId);
    if (!existsInList) {
      setStatisticsHistoryTutorId("all");
    }
  }, [mainView, statisticsHistoryTutorId, statisticsVipAttendanceHistoryFilters?.tutors]);

  useEffect(() => {
    if (mainView !== "statistics-class" || statisticsHistoryClientId === "all") {
      return;
    }
    const clientItems = Array.isArray(statisticsVipAttendanceHistoryFilters?.clients)
      ? statisticsVipAttendanceHistoryFilters.clients
      : [];
    if (clientItems.length === 0) {
      return;
    }
    const existsInList = clientItems.some((item) => String(item?.id || "").trim() === statisticsHistoryClientId);
    if (!existsInList) {
      setStatisticsHistoryClientId("all");
    }
  }, [mainView, statisticsHistoryClientId, statisticsVipAttendanceHistoryFilters?.clients]);

  useEffect(() => {
    if (mainView !== "statistics-class" || !statisticsHistoryHydrated) {
      return;
    }
    void loadStatisticsVipAttendanceHistory({
      from: statisticsHistoryPeriod.from,
      to: statisticsHistoryPeriod.to,
      classId: statisticsHistoryClassId,
      teacherId: statisticsHistoryTeacherId,
      tutorId: statisticsHistoryTutorId,
      clientId: statisticsHistoryClientId
    });
  }, [loadStatisticsVipAttendanceHistory, mainView, statisticsHistoryHydrated]);

  function setStatisticsHistoryPeriodField(field, nextDate) {
    const normalizedField = String(field || "").trim().toLowerCase();
    if (normalizedField !== "from" && normalizedField !== "to") {
      return;
    }
    const normalizedDate = String(nextDate || "").trim() || todayYmd;
    setStatisticsHistoryPeriod((prev) => {
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
  }

  function reloadStatisticsHistory() {
    if (mainView !== "statistics-class") {
      return;
    }
    void loadStatisticsVipAttendanceHistory({
      from: statisticsHistoryPeriod.from,
      to: statisticsHistoryPeriod.to,
      classId: statisticsHistoryClassId,
      teacherId: statisticsHistoryTeacherId,
      tutorId: statisticsHistoryTutorId,
      clientId: statisticsHistoryClientId
    });
  }

  return {
    statisticsHistoryPeriod,
    statisticsHistoryClassId,
    statisticsHistoryTeacherId,
    statisticsHistoryTutorId,
    statisticsHistoryClientId,
    setStatisticsHistoryClassId,
    setStatisticsHistoryTeacherId,
    setStatisticsHistoryTutorId,
    setStatisticsHistoryClientId,
    setStatisticsHistoryPeriodField,
    reloadStatisticsHistory
  };
}
