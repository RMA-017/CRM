import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function createWeeklyForm() {
  return {
    dayOfWeek: "1",
    isActive: true,
    startTime: "09:00",
    endTime: "18:00",
    reason: ""
  };
}

function serializeDefaultWeeklyRows(rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  return JSON.stringify(source.map((row) => ({
    dayOfWeek: String(row?.dayOfWeek || "").trim(),
    isActive: row?.isActive === true,
    startTime: String(row?.startTime || "").trim(),
    endTime: String(row?.endTime || "").trim()
  })));
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
  profile = null,
  organizationId = "",
  showDefaultWeekly = true,
  showUserWeeklyOverrides = true,
  defaultWeeklyTitle = "Default Weekly Schedule",
  showUserWeeklyOverridesLauncher = true,
  isUserWeeklyOverridesModalOpen,
  onOpenUserWeeklyOverridesModal = null,
  onCloseUserWeeklyOverridesModal = null
}) {
  const currentOrganizationId = String(organizationId || profile?.organizationId || "").trim();
  const [staff, setStaff] = useState([]);
  const [items, setItems] = useState([]);
  const [defaultWeeklyRows, setDefaultWeeklyRows] = useState(() => createDefaultWeeklyDraft([]));
  const [weeklyUserId, setWeeklyUserId] = useState("");
  const [weeklyForm, setWeeklyForm] = useState(createWeeklyForm);
  const [weeklyEditId, setWeeklyEditId] = useState("");
  const [isWeeklyOverridesModalOpenInternal, setIsWeeklyOverridesModalOpenInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState("");
  const lastSavedDefaultWeeklySnapshotRef = useRef("");
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
  const defaultWeeklySnapshot = useMemo(() => (
    serializeDefaultWeeklyRows(defaultWeeklyRows)
  ), [defaultWeeklyRows]);

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
      lastSavedDefaultWeeklySnapshotRef.current = serializeDefaultWeeklyRows(nextDefaultWeeklyRows);

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
    if (!currentOrganizationId) {
      return;
    }
    void loadData();
  }, [currentOrganizationId, loadData]);

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

  const saveDefaultWeekly = useCallback(async () => {
    if (!canUpdateAppointments || !currentOrganizationId) {
      return;
    }
    setSavingDefault(true);
    try {
      const response = await apiFetch("/api/appointments/work-schedule/default-weekly", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          organizationId: currentOrganizationId,
          items: defaultWeeklyRows.map((row) => ({
            dayOfWeek: row.dayOfWeek,
            isActive: Boolean(row.startTime && row.endTime && row.startTime < row.endTime),
            startTime: Boolean(row.startTime && row.endTime && row.startTime < row.endTime) ? row.startTime : "",
            endTime: Boolean(row.startTime && row.endTime && row.startTime < row.endTime) ? row.endTime : "",
            reason: ""
          }))
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(String(data?.message || "Failed to update default weekly schedule.").trim());
        return;
      }

      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setItems((prev) => {
        const withoutDefaultWeekly = (Array.isArray(prev) ? prev : []).filter((item) => !(
          String(item?.ruleScope || "").trim().toLowerCase() === "weekly"
          && !String(item?.userId || "").trim()
        ));
        return [...withoutDefaultWeekly, ...nextItems];
      });
      const nextDefaultWeeklyRows = createDefaultWeeklyDraft(nextItems);
      setDefaultWeeklyRows(nextDefaultWeeklyRows);
      lastSavedDefaultWeeklySnapshotRef.current = serializeDefaultWeeklyRows(nextDefaultWeeklyRows);
      dispatchWorkScheduleChange();
    } catch {
      setMessage("Failed to update default weekly schedule.");
    } finally {
      setSavingDefault(false);
    }
  }, [canUpdateAppointments, currentOrganizationId, defaultWeeklyRows, dispatchWorkScheduleChange]);

  useEffect(() => {
    if (!showDefaultWeekly || !canUpdateAppointments || !currentOrganizationId || loading || savingDefault) {
      return;
    }
    if (defaultWeeklySnapshot === lastSavedDefaultWeeklySnapshotRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveDefaultWeekly();
    }, 380);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    canUpdateAppointments,
    currentOrganizationId,
    defaultWeeklySnapshot,
    loading,
    saveDefaultWeekly,
    savingDefault,
    showDefaultWeekly
  ]);

  async function saveWeeklyOverride() {
    if (!canUpdateAppointments || !currentOrganizationId || !weeklyUserId) {
      return;
    }

    setMutating(true);
    try {
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
        startTime: weeklyForm.startTime,
        endTime: weeklyForm.endTime,
        reason: weeklyForm.reason
      };
      const requestPath = weeklyEditId
        ? `/api/appointments/work-schedule/${encodeURIComponent(weeklyEditId)}`
        : "/api/appointments/work-schedule";
      const response = await apiFetch(requestPath, {
        method: weeklyEditId ? "PATCH" : "POST",
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
      await loadData();
      setWeeklyEditId("");
      setWeeklyForm(createWeeklyForm());
      dispatchWorkScheduleChange();
    } catch {
      setMessage("Failed to save weekly override.");
    } finally {
      setMutating(false);
    }
  }

  async function removeItem(id) {
    if (!canUpdateAppointments || !currentOrganizationId || !id) {
      return;
    }
    if (!window.confirm("Delete this work schedule entry?")) {
      return;
    }
    setMutating(true);
    try {
      const queryParams = new URLSearchParams({
        organizationId: currentOrganizationId
      });
      const response = await apiFetch(`/api/appointments/work-schedule/${encodeURIComponent(String(id))}?${queryParams.toString()}`, {
        method: "DELETE"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(String(data?.message || "Failed to delete work schedule entry.").trim());
        return;
      }
      await loadData();
      dispatchWorkScheduleChange();
    } catch {
      setMessage("Failed to delete work schedule entry.");
    } finally {
      setMutating(false);
    }
  }

  function openWeeklyOverridesModal() {
    if (typeof onOpenUserWeeklyOverridesModal === "function") {
      onOpenUserWeeklyOverridesModal();
      return;
    }
    setIsWeeklyOverridesModalOpenInternal(true);
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
          aria-label="User weekly overrides"
        >
          <div className="appointment-breaks-add-modal-head">
            <h3>User Weekly Overrides</h3>
            <button
              id="closeWorkScheduleUserOverridesModalBtn"
              type="button"
              className="header-btn panel-close-btn"
              aria-label="Close user weekly overrides modal"
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
            <div className="ws-form-row ws-form-row-full">
              <label className="field ws-field-user">
                <span>User</span>
                <CustomSelect
                  id="workScheduleUserOverridesUserSelect"
                  placeholder={weeklyUserOptions.length > 0 ? "Select user" : "No users"}
                  value={weeklyUserId}
                  options={weeklyUserOptions}
                  disabled={!canUpdateAppointments || weeklyUserOptions.length === 0 || mutating}
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
                  disabled={!canUpdateAppointments || mutating}
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
                  disabled={!canUpdateAppointments || mutating}
                  onChange={(event) => setWeeklyForm((prev) => ({ ...prev, startTime: String(event.target.value || "") }))}
                />
              </label>
              <label className="field ws-field-time">
                <span>End</span>
                <input
                  type="time"
                  value={weeklyForm.endTime}
                  disabled={!canUpdateAppointments || mutating}
                  onChange={(event) => setWeeklyForm((prev) => ({ ...prev, endTime: String(event.target.value || "") }))}
                />
              </label>
              <label className="field ws-field-reason">
                <span>Reason</span>
                <input
                  type="text"
                  maxLength={120}
                  value={weeklyForm.reason}
                  disabled={!canUpdateAppointments || mutating}
                  onChange={(event) => setWeeklyForm((prev) => ({ ...prev, reason: String(event.target.value || "") }))}
                />
              </label>
            </div>

            <div className="edit-actions appointment-breaks-add-modal-actions">
              <button
                id="saveWorkScheduleUserOverridesModalBtn"
                type="submit"
                className="header-btn"
                disabled={!canUpdateAppointments || !weeklyUserId || mutating}
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
                        disabled={!canUpdateAppointments || savingDefault || loading}
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
                        disabled={!canUpdateAppointments || savingDefault || loading}
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
          <p className="ws-default-saving" hidden={!savingDefault}>Saving...</p>
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
                aria-label="Open user weekly overrides modal"
                title="User weekly overrides"
                disabled={!canUpdateAppointments}
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
                        disabled={!canUpdateAppointments || mutating}
                        onClick={() => {
                          setWeeklyEditId(String(item.id || "").trim());
                          setWeeklyUserId(String(item.userId || "").trim());
                          setWeeklyForm({
                            dayOfWeek: String(item.dayOfWeek || "1").trim() || "1",
                            isActive: item.isActive === true,
                            startTime: String(item.startTime || "").trim(),
                            endTime: String(item.endTime || "").trim(),
                            reason: String(item.reason || "").trim()
                          });
                          openWeeklyOverridesModal();
                        }}
                      >
                        Edit
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="table-action-btn table-action-btn-danger"
                        disabled={!canUpdateAppointments || mutating}
                        onClick={() => void removeItem(item.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {weeklyItems.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No user weekly overrides.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="all-users-pagination" hidden={!loading}>
        <span className="all-users-page-info">Loading...</span>
      </div>

      {typeof document !== "undefined" ? createPortal(weeklyOverridesModalLayer, document.body) : null}
    </>
  );
}

export default WorkSchedulePanel;
