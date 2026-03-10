import CustomSelect from "../../../components/CustomSelect.jsx";
import {
  MY_CHILDREN_DAY_ITEMS,
  MY_CHILDREN_DAY_NUM_TO_KEY,
  normalizeMyChildrenVisibleWeekDays
} from "../profile.vip-utils.js";

function formatMyChildrenHeaderDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMyChildrenWeekRange(days, { compact = false } = {}) {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!(first instanceof Date) || Number.isNaN(first.getTime()) || !(last instanceof Date) || Number.isNaN(last.getTime())) {
    return "";
  }
  if (compact) {
    const day = String(first.getDate()).padStart(2, "0");
    const month = String(first.getMonth() + 1).padStart(2, "0");
    return `${day}.${month}`;
  }
  return `${first.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} - ${last.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
}

function normalizeMyChildrenTimeToMinutes(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }
  return (Number(match[1]) * 60) + Number(match[2]);
}

function compareMyChildrenItems(left, right) {
  const leftStartMinutes = Number.isFinite(left?.startMinutes)
    ? left.startMinutes
    : normalizeMyChildrenTimeToMinutes(left?.startTime);
  const rightStartMinutes = Number.isFinite(right?.startMinutes)
    ? right.startMinutes
    : normalizeMyChildrenTimeToMinutes(right?.startTime);
  if (leftStartMinutes !== rightStartMinutes) {
    return leftStartMinutes - rightStartMinutes;
  }

  const leftTypeRank = String(left?.itemType || "").trim().toLowerCase() === "daily-routine" ? 0 : 1;
  const rightTypeRank = String(right?.itemType || "").trim().toLowerCase() === "daily-routine" ? 0 : 1;
  if (leftTypeRank !== rightTypeRank) {
    return leftTypeRank - rightTypeRank;
  }

  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function formatAppointmentStatusLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending") {
    return "Pending";
  }
  if (normalized === "confirmed") {
    return "Confirmed";
  }
  if (normalized === "no-show") {
    return "No show";
  }
  if (normalized === "cancelled") {
    return "Cancelled";
  }
  return normalized ? `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}` : "-";
}

function VipMyChildrenPanel({
  isCompact,
  dateYmd,
  visibleWeekDays,
  options,
  optionsLoading,
  selectedClientId,
  onSelectedClientIdChange,
  scheduleItems,
  scheduleLoading,
  scheduleMessage,
  confirmingByAppointmentId,
  onConfirmPendingAppointment,
  onPreviousDay,
  onNextDay,
  vipDailyRoutineItems,
  formatVipDailyRoutineActivityLabel,
  onClose
}) {
  const normalizedSelectedClientId = String(selectedClientId || "").trim();
  const rawChildOptions = Array.isArray(options) ? options : [];
  const childOptions = [
    { value: "", label: "All" },
    ...rawChildOptions
      .map((item) => ({
        value: String(item?.id || "").trim(),
        label: String(item?.label || "").trim()
      }))
      .filter((item) => Boolean(item.value))
  ];
  const hasAssignedChildren = childOptions.length > 1;
  const showAllChildren = !normalizedSelectedClientId;
  const selectedChild = rawChildOptions.find((item) => String(item?.id || "").trim() === normalizedSelectedClientId) || null;
  const selectedChildOption = childOptions.find((item) => item.value === normalizedSelectedClientId) || null;
  const currentDate = /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)
    ? new Date(`${dateYmd}T00:00:00`)
    : null;
  const today = new Date();
  const formatDateYmd = (date) => `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const visibleMyChildrenDayKeys = normalizeMyChildrenVisibleWeekDays(visibleWeekDays);
  const myChildrenWeekDays = !isCompact && currentDate
    ? MY_CHILDREN_DAY_ITEMS
      .filter((day) => visibleMyChildrenDayKeys.includes(day.key))
      .map((day) => {
        const date = new Date(currentDate);
        date.setDate(currentDate.getDate() + day.offset);
        const isToday = (
          date.getFullYear() === today.getFullYear()
          && date.getMonth() === today.getMonth()
          && date.getDate() === today.getDate()
        );
        return {
          key: day.key,
          label: day.label,
          offset: day.offset,
          date,
          dateYmd: formatDateYmd(date),
          isToday
        };
      })
    : [];
  const selectedDayLabel = currentDate
    ? currentDate.toLocaleDateString("en-US", { weekday: "short" })
    : "Day";
  const selectedDateLabel = (() => {
    if (!currentDate) {
      return dateYmd || "-";
    }
    if (isCompact) {
      return currentDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    }
    return formatMyChildrenWeekRange(myChildrenWeekDays);
  })();
  const isSelectedDayToday = Boolean(
    currentDate
    && currentDate.getFullYear() === today.getFullYear()
    && currentDate.getMonth() === today.getMonth()
    && currentDate.getDate() === today.getDate()
  );
  const selectedChildLabel = String(selectedChild?.label || selectedChildOption?.label || "").trim() || "Selected child";
  const selectedChildMeta = [
    String(selectedChild?.className || "").trim() ? `Class: ${String(selectedChild?.className || "").trim()}` : "",
    String(selectedChild?.tutorName || "").trim() ? `Tutor: ${String(selectedChild?.tutorName || "").trim()}` : ""
  ].filter(Boolean).join(" / ");
  const showMyChildrenSkeleton = Boolean(optionsLoading || scheduleLoading);
  const myChildrenRows = Array.isArray(scheduleItems) ? scheduleItems : [];
  const childMetaById = rawChildOptions.reduce((acc, item) => {
    const id = String(item?.id || "").trim();
    if (!id) {
      return acc;
    }
    acc[id] = {
      label: String(item?.label || "").trim() || `Child #${id}`,
      classId: String(item?.classId || "").trim(),
      className: String(item?.className || "").trim(),
      tutorName: String(item?.tutorName || "").trim()
    };
    return acc;
  }, {});
  const rowClientIds = Array.from(
    new Set(
      myChildrenRows
        .map((item) => String(item?.clientId || "").trim())
        .filter(Boolean)
    )
  );
  const myChildrenClientIdsToRender = showAllChildren
    ? Array.from(
      new Set([
        ...rawChildOptions.map((item) => String(item?.id || "").trim()).filter(Boolean),
        ...rowClientIds
      ])
    )
    : [normalizedSelectedClientId].filter(Boolean);
  const myChildrenClientIdsForDesktop = myChildrenClientIdsToRender.length > 0
    ? myChildrenClientIdsToRender
    : (showMyChildrenSkeleton ? ["__loading__"] : []);
  const showMyChildrenBoard = showMyChildrenSkeleton || hasAssignedChildren;
  const emptyMyChildrenMessage = !showMyChildrenSkeleton && !hasAssignedChildren
    ? ""
    : (scheduleMessage || (isCompact ? "No lessons scheduled for selected day." : "No lessons scheduled for selected week."));
  const currentDayKey = currentDate
    ? (["sun", "mon", "tue", "wed", "thu", "fri", "sat"][currentDate.getDay()] || "")
    : "";
  const visibleMyChildrenWeekDays = myChildrenWeekDays.length > 0
    ? myChildrenWeekDays
    : [{
      key: currentDayKey || "day",
      label: "Day",
      dateYmd: dateYmd || "day",
      shortDate: "-",
      isToday: false
    }];
  const myChildrenItemsByClientIdAndDate = myChildrenRows.reduce((acc, item) => {
    const clientKey = String(item?.clientId || "").trim() || "unknown";
    const key = String(item?.appointmentDate || "").trim();
    if (!key) {
      return acc;
    }
    if (!acc[clientKey] || typeof acc[clientKey] !== "object") {
      acc[clientKey] = {};
    }
    if (!Array.isArray(acc[clientKey][key])) {
      acc[clientKey][key] = [];
    }
    acc[clientKey][key].push({
      ...item,
      itemType: "appointment",
      startMinutes: normalizeMyChildrenTimeToMinutes(item?.startTime)
    });
    return acc;
  }, {});
  const myChildrenRoutineItemsByClassIdAndDayKey = (Array.isArray(vipDailyRoutineItems) ? vipDailyRoutineItems : []).reduce((acc, routine, index) => {
    const classId = String(routine?.classId || routine?.class_assignment_id || "").trim();
    if (!classId) {
      return acc;
    }
    const dayOfWeek = Number.parseInt(String(routine?.dayOfWeek ?? routine?.day_of_week ?? "").trim(), 10);
    const dayKey = MY_CHILDREN_DAY_NUM_TO_KEY[dayOfWeek] || "";
    if (!dayKey) {
      return acc;
    }
    const startTime = String(routine?.startTime || routine?.start_time || "").trim();
    const endTime = String(routine?.endTime || routine?.end_time || "").trim();
    if (!startTime) {
      return acc;
    }
    if (!acc[classId] || typeof acc[classId] !== "object") {
      acc[classId] = {};
    }
    if (!Array.isArray(acc[classId][dayKey])) {
      acc[classId][dayKey] = [];
    }
    const routineId = String(routine?.id || "").trim() || `${classId}_${dayKey}_${startTime}_${index}`;
    acc[classId][dayKey].push({
      id: `routine-${routineId}`,
      itemType: "daily-routine",
      status: "routine",
      routineLabel: formatVipDailyRoutineActivityLabel(routine?.activityType || routine?.activity_type),
      note: String(routine?.note || "").trim(),
      startTime,
      endTime,
      startMinutes: normalizeMyChildrenTimeToMinutes(startTime)
    });
    return acc;
  }, {});
  Object.values(myChildrenRoutineItemsByClassIdAndDayKey).forEach((dayItemsByKey) => {
    if (!dayItemsByKey || typeof dayItemsByKey !== "object") {
      return;
    }
    Object.keys(dayItemsByKey).forEach((dayKey) => {
      if (Array.isArray(dayItemsByKey[dayKey])) {
        dayItemsByKey[dayKey].sort(compareMyChildrenItems);
      }
    });
  });
  const myChildrenMergedItemsByClientIdAndDate = myChildrenClientIdsToRender.reduce((acc, clientId) => {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      return acc;
    }
    const classId = String(childMetaById?.[normalizedClientId]?.classId || "").trim();
    visibleMyChildrenWeekDays.forEach((day) => {
      const dateKey = String(day?.dateYmd || "").trim();
      if (!dateKey) {
        return;
      }
      const scheduleDayItems = Array.isArray(myChildrenItemsByClientIdAndDate?.[normalizedClientId]?.[dateKey])
        ? myChildrenItemsByClientIdAndDate[normalizedClientId][dateKey]
        : [];
      const routineDayItems = classId && Array.isArray(myChildrenRoutineItemsByClassIdAndDayKey?.[classId]?.[day.key])
        ? myChildrenRoutineItemsByClassIdAndDayKey[classId][day.key]
        : [];
      const mergedItems = [...scheduleDayItems, ...routineDayItems].sort(compareMyChildrenItems);
      if (mergedItems.length === 0) {
        return;
      }
      if (!acc[normalizedClientId] || typeof acc[normalizedClientId] !== "object") {
        acc[normalizedClientId] = {};
      }
      acc[normalizedClientId][dateKey] = mergedItems;
    });
    return acc;
  }, {});
  const renderMyChildrenCard = (item) => {
    const rowId = String(item?.id || "").trim();
    const isRoutineItem = String(item?.itemType || "").trim().toLowerCase() === "daily-routine";
    const startTime = String(item?.startTime || "").trim();
    const endTime = String(item?.endTime || "").trim();
    const timeRange = startTime && endTime
      ? `${startTime} - ${endTime}`
      : (startTime || endTime || "-");
    const teacherName = isRoutineItem
      ? (String(item?.routineLabel || "").trim() || "Daily routine")
      : (String(item?.specialistName || "").trim() || "-");
    const specialistPosition = String(item?.specialistPosition || "").trim();
    const serviceName = String(item?.serviceName || "").trim();
    const note = String(item?.note || "").trim();
    const secondaryLabel = isRoutineItem
      ? (note || "Daily routine")
      : (specialistPosition || serviceName || "-");
    const status = isRoutineItem
      ? "routine"
      : String(item?.status || "").trim().toLowerCase();
    const statusLabel = isRoutineItem ? "Routine" : formatAppointmentStatusLabel(status);
    const extraNote = isRoutineItem ? "" : note;
    const isPending = !isRoutineItem && status === "pending";
    const itemIdKey = String(item?.id || item?.appointmentId || "").trim();
    const isConfirming = Boolean(itemIdKey && confirmingByAppointmentId?.[itemIdKey]);
    const canConfirmPending = isPending && typeof onConfirmPendingAppointment === "function";
    const cardStatusClassName = (
      status === "confirmed"
      || status === "pending"
      || status === "cancelled"
      || status === "no-show"
    )
      ? `appointment-status-${status}`
      : "";
    const statusClassName = [
      "appointment-vip-my-children-status",
      cardStatusClassName ? `appointment-vip-weekly-status-${status}` : ""
    ].filter(Boolean).join(" ");

    return (
      <article
        key={`myChildrenScheduleRow_${rowId}`}
        className={[
          "appointment-vip-weekly-card",
          "appointment-vip-my-children-card",
          cardStatusClassName,
          canConfirmPending ? "appointment-vip-pending-confirmable" : "",
          isConfirming ? "is-loading" : ""
        ].filter(Boolean).join(" ")}
        onDoubleClick={canConfirmPending && !isConfirming ? () => onConfirmPendingAppointment(item) : undefined}
        title={canConfirmPending ? "Double-click to confirm attendance" : undefined}
      >
        <div className="appointment-vip-my-children-row appointment-vip-my-children-row-top">
          <p className="appointment-vip-my-children-teacher">{teacherName}</p>
          <p className={statusClassName}>{isConfirming ? "Saving..." : statusLabel}</p>
        </div>
        <div className="appointment-vip-my-children-row appointment-vip-my-children-row-bottom">
          <p className="appointment-vip-my-children-time">{timeRange}</p>
          <p className="appointment-vip-my-children-service">{secondaryLabel}</p>
        </div>
        {extraNote ? <p className="appointment-vip-my-children-note">{extraNote}</p> : null}
      </article>
    );
  };
  const selectedDateKey = String(visibleMyChildrenWeekDays[0]?.dateYmd || dateYmd || "").trim();
  const myChildrenCardItems = Array.isArray(myChildrenMergedItemsByClientIdAndDate?.[normalizedSelectedClientId]?.[selectedDateKey])
    ? myChildrenMergedItemsByClientIdAndDate[normalizedSelectedClientId][selectedDateKey].map((item) => renderMyChildrenCard(item))
    : [];

  return (
    <section id="appointmentVipMyChildrenPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>My Children</h3>
        <button
          id="closeAppointmentVipMyChildrenBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close My Children panel"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="appointment-toolbar">
        <div className="appointment-toolbar-block">
          <div className="appointment-specialist-control">
            <span className="appointment-toolbar-label">Child</span>
            <div className="appointment-specialist-select-wrap">
              <CustomSelect
                id="myChildrenClientSelect"
                placeholder="All"
                value={normalizedSelectedClientId}
                options={childOptions}
                searchable
                searchThreshold={8}
                onChange={(nextValue) => {
                  onSelectedClientIdChange(String(nextValue || "").trim());
                }}
              />
            </div>
          </div>
        </div>
        <div className="appointment-toolbar-block appointment-week-switcher">
          <button
            id="myChildrenPrevDayBtn"
            type="button"
            className="header-btn"
            onClick={onPreviousDay}
          >
            Prev
          </button>
          <p className="appointment-week-range">{selectedDateLabel}</p>
          <button
            id="myChildrenNextDayBtn"
            type="button"
            className="header-btn"
            onClick={onNextDay}
          >
            Next
          </button>
        </div>
      </div>

      <p className="all-users-state" hidden={showMyChildrenBoard || !emptyMyChildrenMessage}>
        {emptyMyChildrenMessage}
      </p>
      {!isCompact ? (
        <div
          className="appointment-vip-weekly-grid-wrap appointment-vip-my-children-grid-wrap"
          hidden={!showMyChildrenBoard}
        >
          <table className="appointment-vip-weekly-grid appointment-vip-my-children-grid" aria-label="My children weekly schedule table">
            <thead>
              <tr>
                {visibleMyChildrenWeekDays.map((day) => (
                  <th key={day.key} className={day.isToday ? "appointment-day-is-today" : undefined}>
                    <div className="appointment-day-head">
                      <span>{day.label}</span>
                      <small>{formatMyChildrenHeaderDate(day.date)}</small>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {myChildrenClientIdsForDesktop.map((clientId) => {
                const isSkeletonClientRow = clientId === "__loading__";
                const clientLabel = isSkeletonClientRow
                  ? "Loading..."
                  : (String(childMetaById?.[clientId]?.label || "").trim() || selectedChildLabel || `Child #${clientId}`);
                return (
                  <tr key={`myChildrenRow_${clientId || "all"}`}>
                    <td className="appointment-vip-client-wrap-cell" colSpan={Math.max(1, visibleMyChildrenWeekDays.length)}>
                      <div className="appointment-vip-client-wrap">
                        <p className="appointment-vip-client-name">{clientLabel}</p>
                        <div
                          className="appointment-vip-client-days-grid"
                          style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleMyChildrenWeekDays.length)}, minmax(0, 1fr))` }}
                        >
                          {visibleMyChildrenWeekDays.map((day) => {
                            const dayItems = Array.isArray(myChildrenMergedItemsByClientIdAndDate?.[clientId]?.[day.dateYmd])
                              ? myChildrenMergedItemsByClientIdAndDate[clientId][day.dateYmd]
                              : [];
                            const dayCellClassName = [
                              "appointment-vip-client-day",
                              day.isToday ? "appointment-day-is-today" : ""
                            ].filter(Boolean).join(" ") || undefined;
                            return (
                              <div key={`${clientId}_${day.key}`} className={dayCellClassName}>
                                {showMyChildrenSkeleton ? (
                                  <div className="appointment-vip-weekly-list">
                                    {[0, 1].map((i) => (
                                      <div key={`${clientId}_${day.key}_myChildrenScheduleSkeleton_${i}`} className="appointment-vip-my-children-loading-card skel" aria-hidden="true" />
                                    ))}
                                  </div>
                                ) : dayItems.length > 0 ? (
                                  <div className="appointment-vip-weekly-list">
                                    {dayItems.map((item) => renderMyChildrenCard(item))}
                                  </div>
                                ) : (
                                  <p className="appointment-vip-weekly-empty">-</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="appointment-vip-my-children-board is-compact"
          hidden={!showMyChildrenBoard}
        >
          <div className="appointment-vip-my-children-board-head">
            <div className="appointment-vip-my-children-summary">
              <p className="appointment-vip-client-name appointment-vip-my-children-name">{selectedChildLabel}</p>
              {selectedChildMeta ? (
                <p className="appointment-vip-my-children-meta">{selectedChildMeta}</p>
              ) : null}
            </div>
            <div className={`appointment-vip-my-children-date${isSelectedDayToday ? " appointment-day-is-today" : ""}`}>
              <div className="appointment-day-head">
                <span>{selectedDayLabel}</span>
                <small>{selectedDateLabel}</small>
              </div>
            </div>
          </div>
          <div className="appointment-vip-my-children-list" aria-label="My children daily schedule">
            {showMyChildrenSkeleton ? (
              [0, 1, 2].map((i) => (
                <div key={`myChildrenScheduleSkeleton_${i}`} className="appointment-vip-my-children-loading-card skel" aria-hidden="true" />
              ))
            ) : showAllChildren ? (
              myChildrenClientIdsToRender.map((clientId) => {
                const clientLabel = String(childMetaById?.[clientId]?.label || "").trim() || `Child #${clientId}`;
                const clientItems = Array.isArray(myChildrenMergedItemsByClientIdAndDate?.[clientId]?.[selectedDateKey])
                  ? myChildrenMergedItemsByClientIdAndDate[clientId][selectedDateKey]
                  : [];
                return (
                  <div key={`myChildrenMobileGroup_${clientId}`} className="appointment-vip-my-children-mobile-group">
                    <p className="appointment-vip-client-name appointment-vip-my-children-mobile-title">{clientLabel}</p>
                    {clientItems.length > 0 ? (
                      <div className="appointment-vip-my-children-mobile-list">
                        {clientItems.map((item) => renderMyChildrenCard(item))}
                      </div>
                    ) : (
                      <p className="appointment-vip-weekly-empty appointment-vip-my-children-empty">-</p>
                    )}
                  </div>
                );
              })
            ) : myChildrenCardItems.length > 0 ? (
              myChildrenCardItems
            ) : (
              <p className="appointment-vip-weekly-empty appointment-vip-my-children-empty">{emptyMyChildrenMessage}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default VipMyChildrenPanel;
