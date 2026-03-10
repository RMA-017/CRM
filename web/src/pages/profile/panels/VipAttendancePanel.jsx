import CustomSelect from "../../../components/CustomSelect.jsx";

function formatAttendanceDateTime(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "-";
  }
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  if (!hasExplicitTimezone) {
    const directMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (directMatch) {
      const [, year, month, day, hours, minutes] = directMatch;
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    }
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear()).padStart(4, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function VipAttendancePanel({
  vipAttendanceFilter,
  setVipAttendanceFilter,
  vipAttendanceClassFilter,
  setVipAttendanceClassFilter,
  vipAttendanceItems,
  vipAttendanceDraftByClientId,
  vipAttendanceMessage,
  vipAttendanceLoading,
  vipAttendanceSavingByClientId,
  canCreateAppointmentVipClients,
  canUpdateAppointmentVipClients,
  canDeleteAppointmentVipClients,
  normalizeVipAttendanceStatus,
  markVipAttendancePresent,
  markVipAttendanceLeft,
  openVipAttendanceAbsentModal,
  openVipAttendanceEditModal,
  closeAppointmentVipAttendancePanel
}) {
  const normalizedFilter = ["all", "present", "absent"].includes(String(vipAttendanceFilter || "").trim().toLowerCase())
    ? String(vipAttendanceFilter || "").trim().toLowerCase()
    : "all";
  const normalizedClassFilter = String(vipAttendanceClassFilter || "").trim() || "all";
  const vipAttendanceClassFilterOptions = [
    { value: "all", label: "All" },
    ...Array.from(
      new Set(
        vipAttendanceItems
          .map((item) => String(item?.className || item?.class_name || "").trim())
          .filter(Boolean)
      )
    )
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
      .map((className) => ({ value: className, label: className }))
  ];
  const classFilteredItems = vipAttendanceItems.filter((item) => {
    if (normalizedClassFilter === "all") {
      return true;
    }
    return String(item.className || item.class_name || "").trim() === normalizedClassFilter;
  });
  const presentCount = classFilteredItems.reduce((sum, item) => {
    const rowId = String(item.id || "").trim();
    const status = normalizeVipAttendanceStatus(vipAttendanceDraftByClientId?.[rowId]?.status);
    return status === "present" ? sum + 1 : sum;
  }, 0);
  const absentCount = classFilteredItems.reduce((sum, item) => {
    const rowId = String(item.id || "").trim();
    const status = normalizeVipAttendanceStatus(vipAttendanceDraftByClientId?.[rowId]?.status);
    return status === "absent" ? sum + 1 : sum;
  }, 0);
  const filteredAttendanceItems = classFilteredItems.filter((item) => {
    const status = normalizeVipAttendanceStatus(vipAttendanceDraftByClientId?.[String(item.id || "")]?.status);
    if (normalizedFilter === "present") {
      return status === "present";
    }
    if (normalizedFilter === "absent") {
      return status === "absent";
    }
    return true;
  });
  const showVipAttendanceSkeleton = Boolean(vipAttendanceLoading);
  const canSaveVipAttendance = canCreateAppointmentVipClients || canUpdateAppointmentVipClients;
  const canManageVipAttendance = canSaveVipAttendance || canDeleteAppointmentVipClients;

  return (
    <section id="appointmentVipAttendancePanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>VIP Attendance</h3>
        <button
          id="closeAppointmentVipAttendanceBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close VIP attendance panel"
          onClick={closeAppointmentVipAttendancePanel}
        >
          ×
        </button>
      </div>

      <div className="vip-attendance-toolbar">
        <label className="field vip-attendance-class-field" htmlFor="vipAttendanceClassFilterSelect">
          <span>Class</span>
          <CustomSelect
            id="vipAttendanceClassFilterSelect"
            value={normalizedClassFilter}
            options={vipAttendanceClassFilterOptions}
            placeholder="All"
            searchable
            searchThreshold={8}
            onChange={(nextValue) => {
              const normalizedValue = String(nextValue || "").trim() || "all";
              setVipAttendanceClassFilter(normalizedValue);
            }}
          />
        </label>
        <div className="vip-attendance-summary">
          <button
            id="vipAttendanceFilterAllBtn"
            type="button"
            className={`vip-attendance-filter-btn${normalizedFilter === "all" ? " is-active" : ""}`}
            onClick={() => setVipAttendanceFilter("all")}
          >
            Total: {classFilteredItems.length}
          </button>
          <button
            id="vipAttendanceFilterPresentBtn"
            type="button"
            className={`vip-attendance-filter-btn${normalizedFilter === "present" ? " is-active" : ""}`}
            onClick={() => setVipAttendanceFilter("present")}
          >
            Present: {presentCount}
          </button>
          <button
            id="vipAttendanceFilterAbsentBtn"
            type="button"
            className={`vip-attendance-filter-btn${normalizedFilter === "absent" ? " is-active" : ""}`}
            onClick={() => setVipAttendanceFilter("absent")}
          >
            Absent: {absentCount}
          </button>
        </div>
      </div>

      <p className="all-users-state" hidden={showVipAttendanceSkeleton || !vipAttendanceMessage}>
        {vipAttendanceMessage}
      </p>
      <p className="all-users-state" hidden={showVipAttendanceSkeleton || vipAttendanceItems.length === 0 || filteredAttendanceItems.length > 0}>
        No children in selected filter.
      </p>

      <div className="all-users-table-wrap" hidden={!showVipAttendanceSkeleton && filteredAttendanceItems.length === 0}>
        <table className="all-users-table" aria-label="VIP attendance table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Child name</th>
              <th>Tutor name</th>
              <th>Arrival time</th>
              <th>Departure time</th>
              <th>Absent</th>
              <th>Edit</th>
            </tr>
          </thead>
          <tbody>
            {showVipAttendanceSkeleton ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="7" className="skel" />
                </tr>
              ))
            ) : filteredAttendanceItems.map((item) => {
              const rowId = String(item.id || "").trim();
              const fullName = `${String(item.firstName || "").trim()} ${String(item.lastName || "").trim()} ${String(item.middleName || "").trim()}`
                .replace(/\s+/g, " ")
                .trim();
              const attendanceEntry = vipAttendanceDraftByClientId?.[rowId] || {};
              const status = normalizeVipAttendanceStatus(attendanceEntry?.status);
              const arrivedAt = String(attendanceEntry?.arrivedAt || "").trim();
              const leftAt = String(attendanceEntry?.leftAt || "").trim();
              const note = String(attendanceEntry?.note || item.note || "").trim();
              const isSaving = Boolean(vipAttendanceSavingByClientId?.[rowId]);
              const isPresent = status === "present";
              const isUnmarked = status === "unmarked";
              return (
                <tr key={`vipAttendanceRow_${rowId}`}>
                  <td>{rowId || "-"}</td>
                  <td>{fullName || "-"}</td>
                  <td>{String(item.tutorName || "").trim() || "-"}</td>
                  <td>
                    {arrivedAt ? (
                      formatAttendanceDateTime(arrivedAt)
                    ) : isUnmarked ? (
                      <button
                        id={`vipAttendancePresentBtn_${rowId}`}
                        type="button"
                        className="table-action-btn"
                        disabled={isSaving || !canSaveVipAttendance}
                        onClick={() => {
                          void markVipAttendancePresent(rowId);
                        }}
                      >
                        {isSaving ? "Saving..." : "Present"}
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    {leftAt ? (
                      formatAttendanceDateTime(leftAt)
                    ) : (isPresent && Boolean(arrivedAt) ? (
                      <button
                        id={`vipAttendanceLeftBtn_${rowId}`}
                        type="button"
                        className="table-action-btn"
                        disabled={isSaving || !canSaveVipAttendance}
                        onClick={() => {
                          void markVipAttendanceLeft(rowId);
                        }}
                      >
                        {isSaving ? "Saving..." : "Left"}
                      </button>
                    ) : "-")}
                  </td>
                  <td className="vip-attendance-note-cell">
                    {status === "absent" ? (
                      <div className="vip-attendance-note-inline">
                        <span className="vip-attendance-note-text">{note || "Absent"}</span>
                      </div>
                    ) : isUnmarked ? (
                      <button
                        id={`vipAttendanceAbsentBtn_${rowId}`}
                        type="button"
                        className="table-action-btn table-action-btn-danger"
                        disabled={isSaving || !canSaveVipAttendance}
                        onClick={() => openVipAttendanceAbsentModal(rowId, note)}
                      >
                        {isSaving ? "Saving..." : "Absent"}
                      </button>
                    ) : "-"}
                  </td>
                  <td>
                    <button
                      id={`vipAttendanceEditBtn_${rowId}`}
                      type="button"
                      className="table-action-btn"
                      disabled={isSaving || !canManageVipAttendance}
                      onClick={() => openVipAttendanceEditModal(rowId, {
                        status,
                        arrivedAt,
                        leftAt,
                        note
                      })}
                    >
                      {isSaving ? "Saving..." : "Edit"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default VipAttendancePanel;
