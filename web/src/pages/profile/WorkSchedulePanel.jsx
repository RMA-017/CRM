import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../lib/api.js";

const DAYS = [
  { dayOfWeek: "1", dayKey: "mon", label: "Mon" },
  { dayOfWeek: "2", dayKey: "tue", label: "Tue" },
  { dayOfWeek: "3", dayKey: "wed", label: "Wed" },
  { dayOfWeek: "4", dayKey: "thu", label: "Thu" },
  { dayOfWeek: "5", dayKey: "fri", label: "Fri" },
  { dayOfWeek: "6", dayKey: "sat", label: "Sat" },
  { dayOfWeek: "7", dayKey: "sun", label: "Sun" }
];

function createDefaultWeeklyDraft(items = []) {
  const byDay = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (String(item?.ruleScope || "").trim().toLowerCase() !== "weekly") {
      return;
    }
    const userId = String(item?.userId || "").trim();
    if (userId) {
      return;
    }
    const dayOfWeek = String(item?.dayOfWeek || "").trim();
    if (!dayOfWeek) {
      return;
    }
    byDay.set(dayOfWeek, {
      dayOfWeek,
      isActive: item?.isActive === true,
      startTime: String(item?.startTime || "").trim(),
      endTime: String(item?.endTime || "").trim(),
      reason: String(item?.reason || "").trim()
    });
  });

  return DAYS.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    dayKey: day.dayKey,
    label: day.label,
    isActive: byDay.get(day.dayOfWeek)?.isActive === true,
    startTime: String(byDay.get(day.dayOfWeek)?.startTime || "").trim(),
    endTime: String(byDay.get(day.dayOfWeek)?.endTime || "").trim(),
    reason: String(byDay.get(day.dayOfWeek)?.reason || "").trim()
  }));
}

function normalizeDefaultWeeklyRows(rows = []) {
  const byDay = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const dayOfWeek = String(row?.dayOfWeek || "").trim();
    if (!dayOfWeek) {
      return;
    }
    byDay.set(dayOfWeek, {
      dayOfWeek,
      isActive: row?.isActive === true,
      startTime: String(row?.startTime || "").trim(),
      endTime: String(row?.endTime || "").trim(),
      reason: String(row?.reason || "").trim()
    });
  });

  return DAYS.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    dayKey: day.dayKey,
    label: day.label,
    isActive: byDay.get(day.dayOfWeek)?.isActive === true,
    startTime: String(byDay.get(day.dayOfWeek)?.startTime || "").trim(),
    endTime: String(byDay.get(day.dayOfWeek)?.endTime || "").trim(),
    reason: String(byDay.get(day.dayOfWeek)?.reason || "").trim()
  }));
}

function createWeeklyForm() {
  return {
    dayOfWeek: "1",
    startTime: "09:00",
    endTime: "18:00",
    reason: ""
  };
}

function createWeeklyDraftLine() {
  return {
    dayOfWeek: "",
    startTime: "",
    endTime: "",
    reason: ""
  };
}

function createWeeklyDeleteState() {
  return {
    open: false,
    id: "",
    label: "",
    error: "",
    submitting: false
  };
}

function withDefaultWeeklyTimes(row, nextStartTime, nextEndTime) {
  const startTime = String(nextStartTime || "").trim();
  const endTime = String(nextEndTime || "").trim();
  const hasValidTimeRange = Boolean(startTime && endTime && startTime < endTime);
  return {
    ...row,
    startTime,
    endTime,
    isActive: hasValidTimeRange,
    reason: ""
  };
}

function WorkSchedulePanel({
  canUpdateAppointments = true,
  canCreateWorkSchedule = true,
  canUpdateWorkSchedule = true,
  canDeleteWorkSchedule = true,
  profile = null,
  organizationId = "",
  showDefaultWeekly = true,
  showUserWeeklyOverrides = true,
  defaultWeeklyTitle = "Default Weekly Schedule",
  showUserWeeklyOverridesLauncher = true,
  initialDefaultWeeklyRows = null,
  loadRemoteData = true,
  onDefaultWeeklyRowsChange = null,
  isUserWeeklyOverridesModalOpen,
  onOpenUserWeeklyOverridesModal = null,
  onCloseUserWeeklyOverridesModal = null
}) {
  const currentOrganizationId = String(organizationId || profile?.organizationId || "").trim();
  const [staff, setStaff] = useState([]);
  const [items, setItems] = useState([]);
  const [defaultWeeklyRows, setDefaultWeeklyRows] = useState(() => normalizeDefaultWeeklyRows(initialDefaultWeeklyRows));
  const [weeklyUserId, setWeeklyUserId] = useState("");
  const [weeklyForm, setWeeklyForm] = useState(createWeeklyForm);
  const [weeklyDraftLines, setWeeklyDraftLines] = useState(() => [createWeeklyDraftLine()]);
  const [weeklyEditId, setWeeklyEditId] = useState("");
  const [isWeeklyOverridesModalOpenInternal, setIsWeeklyOverridesModalOpenInternal] = useState(false);
  const [weeklyDelete, setWeeklyDelete] = useState(createWeeklyDeleteState());
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState("");
  const isWeeklyOverridesModalControlled = typeof isUserWeeklyOverridesModalOpen === "boolean";
  const isWeeklyOverridesModalOpen = isWeeklyOverridesModalControlled
    ? isUserWeeklyOverridesModalOpen
    : isWeeklyOverridesModalOpenInternal;
  const dispatchWorkScheduleChange = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(new window.CustomEvent("crm:appointment-change", {
      detail: {
        type: "work-schedule-updated",
        organizationId: currentOrganizationId
      }
    }));
  }, [currentOrganizationId]);

  const weeklyItems = useMemo(() => (
    (Array.isArray(items) ? items : [])
      .filter((item) => (
        String(item?.ruleScope || "").trim().toLowerCase() === "weekly"
        && Boolean(String(item?.userId || "").trim())
      ))
      .sort((left, right) => (
        String(left?.userUsername || left?.userName || "").trim()
          .localeCompare(String(right?.userUsername || right?.userName || "").trim(), undefined, { sensitivity: "base" })
        || (
          Number.parseInt(String(left?.dayOfWeek || "").trim(), 10)
          - Number.parseInt(String(right?.dayOfWeek || "").trim(), 10)
        )
      ))
  ), [items]);
  const weeklyUserOptions = useMemo(() => (
    (Array.isArray(staff) ? staff : [])
      .map((item) => {
        const value = String(item?.id || "").trim();
        const label = String(item?.name || "").trim();
        if (!value || !label) {
          return null;
        }
        return { value, label };
      })
      .filter(Boolean)
  ), [staff]);
  const weeklyUsernameByUserId = useMemo(() => (
    new Map(
      (Array.isArray(staff) ? staff : [])
        .map((item) => [
          String(item?.id || "").trim(),
          String(item?.username || "").trim() || String(item?.name || "").trim()
        ])
        .filter(([id, label]) => Boolean(id) && Boolean(label))
    )
  ), [staff]);
  const weeklyDayOptions = useMemo(() => (
    DAYS.map((day) => ({ value: day.dayOfWeek, label: day.label }))
  ), []);
  const weeklyExistingDayCount = useMemo(() => (
    new Set(
      weeklyItems
        .filter((item) => String(item?.userId || "").trim() === String(weeklyUserId || "").trim())
        .map((item) => String(item?.dayOfWeek || "").trim())
        .filter(Boolean)
    ).size
  ), [weeklyItems, weeklyUserId]);
  const weeklyMaxDraftLines = Math.max(1, DAYS.length - weeklyExistingDayCount);
  const isEditingWeeklyOverride = Boolean(String(weeklyEditId || "").trim());
  const canMutateWeeklyOverride = isEditingWeeklyOverride
    ? canUpdateWorkSchedule
    : canCreateWorkSchedule;

  useEffect(() => {
    if (!Array.isArray(initialDefaultWeeklyRows)) {
      return;
    }
    setDefaultWeeklyRows(normalizeDefaultWeeklyRows(initialDefaultWeeklyRows));
  }, [initialDefaultWeeklyRows]);

  const loadData = useCallback(async () => {
    if (!currentOrganizationId) {
      return;
    }

    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        organizationId: currentOrganizationId,
        ruleScope: "weekly"
      });
      const response = await apiFetch(`/api/appointments/work-schedule?${queryParams.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(String(data?.message || "Failed to load work schedule.").trim());
        setLoading(false);
        return;
      }

      const nextStaff = Array.isArray(data?.staff) ? data.staff : [];
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      const nextDefaultWeeklyRows = createDefaultWeeklyDraft(nextItems);

      setStaff(nextStaff);
      setItems(nextItems);
      setDefaultWeeklyRows(nextDefaultWeeklyRows);

      const firstUserId = String(nextStaff[0]?.id || "").trim();
      setWeeklyUserId((prev) => {
        const current = String(prev || "").trim();
        if (current && nextStaff.some((item) => String(item?.id || "").trim() === current)) {
          return current;
        }
        return firstUserId;
      });
    } catch {
      setMessage("Failed to load work schedule.");
    } finally {
      setLoading(false);
    }
  }, [currentOrganizationId]);

  useEffect(() => {
    if (!currentOrganizationId || !loadRemoteData) {
      return;
    }
    void loadData();
  }, [currentOrganizationId, loadRemoteData, loadData]);

  useEffect(() => {
    if (!showDefaultWeekly || typeof onDefaultWeeklyRowsChange !== "function") {
      return;
    }
    onDefaultWeeklyRowsChange(defaultWeeklyRows);
  }, [defaultWeeklyRows, onDefaultWeeklyRowsChange, showDefaultWeekly]);

  useEffect(() => {
    if (!message) {
      return;
    }
    window.alert(message);
    setMessage("");
  }, [message]);

  useEffect(() => {
    if (!isWeeklyOverridesModalOpen || typeof window === "undefined") {
      return undefined;
    }

    function handleEscClose(event) {
      if (event.key === "Escape" && !mutating) {
        closeWeeklyOverridesModal();
      }
    }

    window.addEventListener("keydown", handleEscClose);
    return () => {
      window.removeEventListener("keydown", handleEscClose);
    };
  }, [closeWeeklyOverridesModal, isWeeklyOverridesModalOpen, mutating]);

  async function saveWeeklyOverride() {
    if (!canMutateWeeklyOverride || !currentOrganizationId || !weeklyUserId) {
      return;
    }

    setMutating(true);
    try {
      if (isEditingWeeklyOverride) {
        const hasValidTimeRange = Boolean(
          String(weeklyForm.startTime || "").trim()
          && String(weeklyForm.endTime || "").trim()
          && String(weeklyForm.startTime || "").trim() < String(weeklyForm.endTime || "").trim()
        );
        const payload = {
          organizationId: currentOrganizationId,
          userId: weeklyUserId,
          ruleScope: "weekly",
          dayOfWeek: weeklyForm.dayOfWeek,
          isActive: hasValidTimeRange,
          reason: weeklyForm.reason
        };
        if (hasValidTimeRange) {
          payload.startTime = weeklyForm.startTime;
          payload.endTime = weeklyForm.endTime;
        }
        const response = await apiFetch(`/api/appointments/work-schedule/${encodeURIComponent(weeklyEditId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        const data = await readApiResponseData(response);
        if (!response.ok) {
          setMessage(String(data?.message || "Failed to save weekly override.").trim());
          return;
        }
      } else {
        const sourceLines = Array.isArray(weeklyDraftLines) && weeklyDraftLines.length > 0
          ? weeklyDraftLines
          : [createWeeklyDraftLine()];
        const preparedLines = [];
        const seenDays = new Set();
        const existingDays = new Set(
          weeklyItems
            .filter((item) => String(item?.userId || "").trim() === String(weeklyUserId || "").trim())
            .map((item) => String(item?.dayOfWeek || "").trim())
            .filter(Boolean)
        );

        for (let index = 0; index < sourceLines.length; index += 1) {
          const line = sourceLines[index] || {};
          const dayOfWeek = String(line.dayOfWeek || "").trim();
          const startTime = String(line.startTime || "").trim();
          const endTime = String(line.endTime || "").trim();
          const reason = String(line.reason || "").trim();
          const hasAnyValue = Boolean(dayOfWeek || startTime || endTime || reason);

          if (!hasAnyValue) {
            continue;
          }
          if (!dayOfWeek) {
            setMessage(`Row ${index + 1}: day is required.`);
            return;
          }
          if (!startTime || !endTime) {
            setMessage(`Row ${index + 1}: start and end time are required.`);
            return;
          }
          if (startTime >= endTime) {
            setMessage(`Row ${index + 1}: end time must be after start time.`);
            return;
          }
          if (seenDays.has(dayOfWeek)) {
            const duplicateDayLabel = DAYS.find((day) => day.dayOfWeek === dayOfWeek)?.label || dayOfWeek;
            setMessage(`Duplicate day in draft: ${duplicateDayLabel}.`);
            return;
          }
          if (existingDays.has(dayOfWeek)) {
            const existingDayLabel = DAYS.find((day) => day.dayOfWeek === dayOfWeek)?.label || dayOfWeek;
            setMessage(`${existingDayLabel} already exists for selected user. Use Edit.`);
            return;
          }

          seenDays.add(dayOfWeek);
          preparedLines.push({
            dayOfWeek,
            startTime,
            endTime,
            reason
          });
        }

        if (preparedLines.length === 0) {
          setMessage("Add at least one weekly override row.");
          return;
        }

        for (let index = 0; index < preparedLines.length; index += 1) {
          const line = preparedLines[index];
          const response = await apiFetch("/api/appointments/work-schedule", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              organizationId: currentOrganizationId,
              userId: weeklyUserId,
              ruleScope: "weekly",
              dayOfWeek: line.dayOfWeek,
              isActive: true,
              startTime: line.startTime,
              endTime: line.endTime,
              reason: line.reason
            })
          });
          const data = await readApiResponseData(response);
          if (!response.ok) {
            setMessage(String(data?.message || `Failed to save weekly override row ${index + 1}.`).trim());
            return;
          }
        }
      }

      await loadData();
      if (typeof onCloseUserWeeklyOverridesModal === "function") {
        onCloseUserWeeklyOverridesModal();
      } else {
        setIsWeeklyOverridesModalOpenInternal(false);
      }
      setWeeklyEditId("");
      setWeeklyForm(createWeeklyForm());
      setWeeklyDraftLines([createWeeklyDraftLine()]);
      dispatchWorkScheduleChange();
    } catch {
      setMessage("Failed to save weekly override.");
    } finally {
      setMutating(false);
    }
  }

  function openWeeklyDeleteModal(item) {
    if (!canDeleteWorkSchedule) {
      return;
    }
    const id = String(item?.id || "").trim();
    if (!id) {
      return;
    }
    const username = String(item?.userUsername || weeklyUsernameByUserId.get(String(item?.userId || "").trim()) || item?.userName || "").trim();
    const dayLabel = DAYS.find((day) => day.dayOfWeek === String(item?.dayOfWeek || "").trim())?.label || "";
    const label = [username, dayLabel].filter(Boolean).join(" - ").trim();
    setWeeklyDelete({
      open: true,
      id,
      label,
      error: "",
      submitting: false
    });
  }

  function closeWeeklyDeleteModal() {
    if (weeklyDelete.submitting) {
      return;
    }
    setWeeklyDelete(createWeeklyDeleteState());
  }

  async function handleWeeklyDeleteConfirm() {
    const id = String(weeklyDelete.id || "").trim();
    if (!canDeleteWorkSchedule || !currentOrganizationId || !id) {
      return;
    }

    setWeeklyDelete((prev) => ({
      ...prev,
      submitting: true,
      error: ""
    }));
    setMutating(true);
    try {
      const queryParams = new URLSearchParams({
        organizationId: currentOrganizationId
      });
      const response = await apiFetch(`/api/appointments/work-schedule/${encodeURIComponent(id)}?${queryParams.toString()}`, {
        method: "DELETE"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setWeeklyDelete((prev) => ({
          ...prev,
          submitting: false,
          error: String(data?.message || "Failed to delete work schedule entry.").trim()
        }));
        return;
      }
      await loadData();
      setWeeklyDelete(createWeeklyDeleteState());
      dispatchWorkScheduleChange();
    } catch {
      setWeeklyDelete((prev) => ({
        ...prev,
        submitting: false,
        error: "Failed to delete work schedule entry."
      }));
    } finally {
      setMutating(false);
    }
  }

  function showWeeklyOverridesModal() {
    if (typeof onOpenUserWeeklyOverridesModal === "function") {
      onOpenUserWeeklyOverridesModal();
      return;
    }
    setIsWeeklyOverridesModalOpenInternal(true);
  }

  function openWeeklyOverridesModal() {
    setWeeklyEditId("");
    setWeeklyForm(createWeeklyForm());
    setWeeklyDraftLines([createWeeklyDraftLine()]);
    showWeeklyOverridesModal();
  }

  function closeWeeklyOverridesModal() {
    if (mutating) {
      return;
    }
    if (typeof onCloseUserWeeklyOverridesModal === "function") {
      onCloseUserWeeklyOverridesModal();
    } else {
      setIsWeeklyOverridesModalOpenInternal(false);
    }
    setWeeklyEditId("");
    setWeeklyForm(createWeeklyForm());
    setWeeklyDraftLines([createWeeklyDraftLine()]);
  }

  function handleWeeklyDraftLineField(lineIndex, field, value) {
    setWeeklyDraftLines((prev) => {
      const source = Array.isArray(prev) && prev.length > 0 ? prev : [createWeeklyDraftLine()];
      return source.map((line, currentLineIndex) => (
        currentLineIndex === lineIndex
          ? { ...line, [field]: value }
          : line
      ));
    });
  }

  function addWeeklyDraftLine(afterLineIndex = -1) {
    setWeeklyDraftLines((prev) => {
      const nextLines = Array.isArray(prev) && prev.length > 0
        ? [...prev]
        : [createWeeklyDraftLine()];
      if (nextLines.length >= weeklyMaxDraftLines) {
        return nextLines;
      }
      const shouldInsertAfterIndex = Number.isInteger(afterLineIndex)
        && afterLineIndex >= 0
        && afterLineIndex < nextLines.length;
      const insertAt = shouldInsertAfterIndex ? (afterLineIndex + 1) : nextLines.length;
      nextLines.splice(insertAt, 0, createWeeklyDraftLine());
      return nextLines;
    });
  }

  function deleteWeeklyDraftLine(lineIndex) {
    setWeeklyDraftLines((prev) => {
      const source = Array.isArray(prev) && prev.length > 0 ? [...prev] : [createWeeklyDraftLine()];
      if (source.length <= 1) {
        return source;
      }
      if (lineIndex < 0 || lineIndex >= source.length) {
        return source;
      }
      source.splice(lineIndex, 1);
      return source.length > 0 ? source : [createWeeklyDraftLine()];
    });
  }

  const weeklyOverridesModalLayer = showUserWeeklyOverrides
    ? (
      <>
        <section
          id="workScheduleUserOverridesModal"
          className="logout-confirm-modal settings-edit-modal appointment-breaks-add-modal ws-user-overrides-modal"
          hidden={!isWeeklyOverridesModalOpen}
          aria-modal="true"
          role="dialog"
          aria-label="Add work days"
        >
          <div className="appointment-breaks-add-modal-head">
            <h3>Add Work Days</h3>
            <button
              id="closeWorkScheduleUserOverridesModalBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close add work days modal"
              onClick={closeWeeklyOverridesModal}
            >
              ×
            </button>
          </div>

          <form
            className="appointment-breaks-add-modal-form ws-user-overrides-modal-body"
            onSubmit={(event) => {
              event.preventDefault();
              void saveWeeklyOverride();
            }}
          >
            <div className="appointment-breaks-add-rows appointment-breaks-add-rows-scroll">
              {isEditingWeeklyOverride ? (
                <>
                  <div className="ws-form-row ws-form-row-full">
                    <label className="field ws-field-user">
                      <span>User</span>
                      <CustomSelect
                        id="workScheduleUserOverridesUserSelect"
                        placeholder={weeklyUserOptions.length > 0 ? "Select user" : "No users"}
                        value={weeklyUserId}
                        options={weeklyUserOptions}
                        disabled={!canUpdateWorkSchedule || weeklyUserOptions.length === 0 || mutating}
                        menuPortal
                        forceOpenDown
                        maxVisibleOptions={6}
                        onChange={(nextValue) => setWeeklyUserId(String(nextValue || "").trim())}
                      />
                    </label>
                  </div>

                  <div className="ws-form-row ws-form-row-wide">
                    <label className="field ws-field-day">
                      <span>Day</span>
                      <CustomSelect
                        id="workScheduleUserOverridesDaySelect"
                        placeholder="Day"
                        value={weeklyForm.dayOfWeek}
                        options={weeklyDayOptions}
                        disabled={!canUpdateWorkSchedule || mutating}
                        menuPortal
                        forceOpenDown
                        maxVisibleOptions={7}
                        onChange={(nextValue) => setWeeklyForm((prev) => ({ ...prev, dayOfWeek: String(nextValue || "1") }))}
                      />
                    </label>
                    <label className="field ws-field-time">
                      <span>Start</span>
                      <input
                        type="time"
                        value={weeklyForm.startTime}
                        disabled={!canUpdateWorkSchedule || mutating}
                        onChange={(event) => setWeeklyForm((prev) => ({ ...prev, startTime: String(event.target.value || "") }))}
                      />
                    </label>
                    <label className="field ws-field-time">
                      <span>End</span>
                      <input
                        type="time"
                        value={weeklyForm.endTime}
                        disabled={!canUpdateWorkSchedule || mutating}
                        onChange={(event) => setWeeklyForm((prev) => ({ ...prev, endTime: String(event.target.value || "") }))}
                      />
                    </label>
                    <label className="field ws-field-reason">
                      <span>Reason</span>
                      <input
                        type="text"
                        maxLength={120}
                        value={weeklyForm.reason}
                        disabled={!canUpdateWorkSchedule || mutating}
                        onChange={(event) => setWeeklyForm((prev) => ({ ...prev, reason: String(event.target.value || "") }))}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <div className="appointment-breaks-add-row">
                  <div className="appointment-breaks-add-row-line appointment-breaks-add-row-line-top">
                    <div className="appointment-breaks-add-field appointment-breaks-add-field-with-action">
                      <span>User</span>
                      <div className="appointment-breaks-add-field-inline">
                        <CustomSelect
                          id="workScheduleUserOverridesUserSelect"
                          placeholder={weeklyUserOptions.length > 0 ? "Select user" : "No users"}
                          value={weeklyUserId}
                          options={weeklyUserOptions}
                          disabled={!canCreateWorkSchedule || weeklyUserOptions.length === 0 || mutating}
                          menuPortal
                          forceOpenDown
                          maxVisibleOptions={6}
                          onChange={(nextValue) => setWeeklyUserId(String(nextValue || "").trim())}
                        />
                        <button
                          id="addWorkScheduleUserOverridesDraftLineBtn"
                          className="header-btn appointment-breaks-inline-add-btn"
                          type="button"
                          disabled={!canCreateWorkSchedule || !weeklyUserId || mutating || weeklyDraftLines.length >= weeklyMaxDraftLines}
                          onClick={() => addWeeklyDraftLine(weeklyDraftLines.length - 1)}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="appointment-breaks-add-row-line appointment-breaks-add-row-line-bottom">
                    {(Array.isArray(weeklyDraftLines) && weeklyDraftLines.length > 0 ? weeklyDraftLines : [createWeeklyDraftLine()]).map((line, lineIndex) => (
                      <div
                        className="appointment-breaks-add-row-line-bottom-item"
                        key={`workScheduleUserOverridesDraftLine_${lineIndex}`}
                      >
                        <div className="appointment-breaks-add-field">
                          {lineIndex === 0 ? <span>Day</span> : null}
                          <CustomSelect
                            id={`workScheduleUserOverridesDaySelect_${lineIndex}`}
                            placeholder="Day"
                            value={String(line.dayOfWeek || "")}
                            options={weeklyDayOptions}
                            disabled={!canCreateWorkSchedule || mutating}
                            menuPortal
                            forceOpenDown
                            maxVisibleOptions={7}
                            onChange={(nextValue) => handleWeeklyDraftLineField(lineIndex, "dayOfWeek", String(nextValue || ""))}
                          />
                        </div>
                        <label className="appointment-breaks-add-field" htmlFor={`workScheduleUserOverridesStart_${lineIndex}`}>
                          {lineIndex === 0 ? <span>Start</span> : null}
                          <input
                            id={`workScheduleUserOverridesStart_${lineIndex}`}
                            type="time"
                            value={String(line.startTime || "")}
                            disabled={!canCreateWorkSchedule || mutating}
                            onChange={(event) => handleWeeklyDraftLineField(lineIndex, "startTime", String(event.target.value || ""))}
                          />
                        </label>
                        <label className="appointment-breaks-add-field" htmlFor={`workScheduleUserOverridesEnd_${lineIndex}`}>
                          {lineIndex === 0 ? <span>End</span> : null}
                          <input
                            id={`workScheduleUserOverridesEnd_${lineIndex}`}
                            type="time"
                            value={String(line.endTime || "")}
                            disabled={!canCreateWorkSchedule || mutating}
                            onChange={(event) => handleWeeklyDraftLineField(lineIndex, "endTime", String(event.target.value || ""))}
                          />
                        </label>
                        <label className="appointment-breaks-add-field" htmlFor={`workScheduleUserOverridesReason_${lineIndex}`}>
                          {lineIndex === 0 ? <span>Reason</span> : null}
                          <input
                            id={`workScheduleUserOverridesReason_${lineIndex}`}
                            type="text"
                            maxLength={120}
                            value={String(line.reason || "")}
                            disabled={!canCreateWorkSchedule || mutating}
                            onChange={(event) => handleWeeklyDraftLineField(lineIndex, "reason", String(event.target.value || ""))}
                          />
                        </label>
                        <div className="appointment-breaks-add-inline-actions">
                          <button
                            id={`deleteWorkScheduleUserOverridesDraftLineBtn_${lineIndex}`}
                            className="table-action-btn table-action-btn-danger"
                            type="button"
                            disabled={!canCreateWorkSchedule || mutating || weeklyDraftLines.length <= 1}
                            onClick={() => deleteWeeklyDraftLine(lineIndex)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="edit-actions appointment-breaks-add-modal-actions">
              <button
                id="saveWorkScheduleUserOverridesModalBtn"
                type="submit"
                className="header-btn"
                disabled={!canMutateWeeklyOverride || !weeklyUserId || mutating}
              >
                {mutating ? "Saving..." : (weeklyEditId ? "Update" : "Save")}
              </button>
            </div>
          </form>
        </section>
        <div
          className="login-overlay"
          hidden={!isWeeklyOverridesModalOpen}
          onClick={closeWeeklyOverridesModal}
        />
      </>
    )
    : null;

  const weeklyDeleteModalLayer = (
    <>
      <section
        id="workScheduleDeleteModal"
        className="logout-confirm-modal"
        hidden={!weeklyDelete.open}
      >
        <h3>Delete this work schedule entry?</h3>
        <p className="all-users-state" hidden={!weeklyDelete.label}>{weeklyDelete.label}</p>
        <p className="field-error">{weeklyDelete.error}</p>
        <div className="logout-confirm-actions">
          <button
            id="workScheduleDeleteYesBtn"
            type="button"
            className="header-btn logout-confirm-yes"
            disabled={weeklyDelete.submitting}
            onClick={() => {
              void handleWeeklyDeleteConfirm();
            }}
          >
            Yes
          </button>
          <button
            id="workScheduleDeleteNoBtn"
            type="button"
            className="header-btn"
            disabled={weeklyDelete.submitting}
            onClick={closeWeeklyDeleteModal}
          >
            No
          </button>
        </div>
      </section>
      <div
        className="login-overlay"
        hidden={!weeklyDelete.open}
        onClick={closeWeeklyDeleteModal}
      />
    </>
  );

  return (
    <>
      {showDefaultWeekly ? (
        <>
          <div className="appointment-settings-form ws-default-form">
            <div className="appointment-setting-row">
              <label>{defaultWeeklyTitle}</label>
              <div className="ws-default-group-body">
                {defaultWeeklyRows.map((row, index) => (
                  <div className="ws-default-day-row" key={`defaultWeeklyRow_${row.dayOfWeek}`}>
                    <span className="ws-default-day-label">{row.label}</span>
                    <label className="ws-default-time-field" htmlFor={`wsDefaultStart_${row.dayOfWeek}`}>
                      <span>Start</span>
                      <input
                        id={`wsDefaultStart_${row.dayOfWeek}`}
                        type="time"
                        value={row.startTime}
                        disabled={!canUpdateAppointments || loading}
                        onChange={(event) => {
                          const value = String(event.target.value || "");
                          setDefaultWeeklyRows((prev) => prev.map((item, itemIndex) => (
                            itemIndex === index
                              ? withDefaultWeeklyTimes(item, value, item.endTime)
                              : item
                          )));
                        }}
                      />
                    </label>
                    <label className="ws-default-time-field" htmlFor={`wsDefaultEnd_${row.dayOfWeek}`}>
                      <span>End</span>
                      <input
                        id={`wsDefaultEnd_${row.dayOfWeek}`}
                        type="time"
                        value={row.endTime}
                        disabled={!canUpdateAppointments || loading}
                        onChange={(event) => {
                          const value = String(event.target.value || "");
                          setDefaultWeeklyRows((prev) => prev.map((item, itemIndex) => (
                            itemIndex === index
                              ? withDefaultWeeklyTimes(item, item.startTime, value)
                              : item
                          )));
                        }}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {showUserWeeklyOverrides ? (
        <>
          {showUserWeeklyOverridesLauncher ? (
            <div className="all-users-head">
              <div className="all-users-head-actions">
              <button
                id="openWorkScheduleUserOverridesModalBtn"
                type="button"
                className="header-btn appointment-breaks-add-icon-btn"
                aria-label="Open add work days modal"
                title="Add Work Days"
                disabled={!canCreateWorkSchedule}
                onClick={openWeeklyOverridesModal}
              >
                +
              </button>
              </div>
            </div>
          ) : null}
          <div className="all-users-table-wrap ws-user-overrides-table-wrap">
            <table className="all-users-table ws-override-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Day</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Reason</th>
                  <th>Edit</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {weeklyItems.map((item) => (
                  <tr key={`weeklyItem_${item.id}`}>
                    <td>{item.userUsername || weeklyUsernameByUserId.get(String(item.userId || "").trim()) || item.userName || "-"}</td>
                    <td>{DAYS.find((day) => day.dayOfWeek === String(item.dayOfWeek || "").trim())?.label || "-"}</td>
                    <td>{item.startTime || "-"}</td>
                    <td>{item.endTime || "-"}</td>
                    <td>{item.reason || "-"}</td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn"
                        disabled={!canUpdateWorkSchedule || mutating}
                        onClick={() => {
                          setWeeklyEditId(String(item.id || "").trim());
                          setWeeklyUserId(String(item.userId || "").trim());
                          setWeeklyForm({
                            dayOfWeek: String(item.dayOfWeek || "1").trim() || "1",
                            startTime: String(item.startTime || "").trim(),
                            endTime: String(item.endTime || "").trim(),
                            reason: String(item.reason || "").trim()
                          });
                          showWeeklyOverridesModal();
                        }}
                      >
                        Edit
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn table-action-btn-danger"
                        disabled={!canDeleteWorkSchedule || mutating}
                        onClick={() => openWeeklyDeleteModal(item)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="all-users-pagination" hidden={!loading}>
        <span className="all-users-page-info">Loading...</span>
      </div>

      {typeof document !== "undefined" ? createPortal(weeklyOverridesModalLayer, document.body) : null}
      {typeof document !== "undefined" ? createPortal(weeklyDeleteModalLayer, document.body) : null}
    </>
  );
}

export default WorkSchedulePanel;
