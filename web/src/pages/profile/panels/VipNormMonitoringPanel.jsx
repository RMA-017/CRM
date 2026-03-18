import { useEffect, useMemo, useState } from "react";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { ALL_USERS_LIMIT } from "../profile.constants.js";

function formatClientLabel(item) {
  const firstName = String(item?.firstName || "").trim();
  const lastName = String(item?.lastName || "").trim();
  const middleName = String(item?.middleName || "").trim();
  return [lastName, firstName, middleName].filter(Boolean).join(" ").trim();
}

function buildClientOptions(items) {
  return [
    { value: "all", label: "All" },
    ...(Array.isArray(items) ? items : [])
      .map((item) => ({
        value: String(item?.id || "").trim(),
        label: formatClientLabel(item) || `Client #${String(item?.id || "").trim()}`
      }))
      .filter((item) => Boolean(item.value))
  ];
}

function buildSimpleOptions(items, labelField) {
  return [
    { value: "all", label: "All" },
    ...(Array.isArray(items) ? items : [])
      .map((item) => ({
        value: String(item?.id || "").trim(),
        label: String(item?.[labelField] || "").trim() || `#${String(item?.id || "").trim()}`
      }))
      .filter((item) => Boolean(item.value))
  ];
}

function VipNormMonitoringPanel({
  vipNormMonitoringItems,
  vipNormMonitoringFilters,
  vipNormMonitoringMessage,
  vipNormMonitoringLoading,
  closeAppointmentVipNormMonitoringPanel
}) {
  const [selectedClientId, setSelectedClientId] = useState("all");
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [selectedPositionId, setSelectedPositionId] = useState("all");
  const [selectedSpecialistId, setSelectedSpecialistId] = useState("all");
  const [page, setPage] = useState(1);

  const clientOptions = useMemo(
    () => buildClientOptions(vipNormMonitoringFilters?.clients),
    [vipNormMonitoringFilters?.clients]
  );
  const classOptions = useMemo(
    () => buildSimpleOptions(vipNormMonitoringFilters?.classes, "className"),
    [vipNormMonitoringFilters?.classes]
  );
  const positionOptions = useMemo(
    () => buildSimpleOptions(vipNormMonitoringFilters?.positions, "label"),
    [vipNormMonitoringFilters?.positions]
  );
  const specialistOptions = useMemo(
    () => buildSimpleOptions(vipNormMonitoringFilters?.specialists, "name"),
    [vipNormMonitoringFilters?.specialists]
  );

  const filteredItems = useMemo(() => (
    (Array.isArray(vipNormMonitoringItems) ? vipNormMonitoringItems : []).filter((item) => {
      if (selectedClientId !== "all" && String(item?.clientId || "").trim() !== selectedClientId) {
        return false;
      }
      if (selectedClassId !== "all" && String(item?.classId || "").trim() !== selectedClassId) {
        return false;
      }
      if (selectedPositionId !== "all" && String(item?.positionId || "").trim() !== selectedPositionId) {
        return false;
      }
      if (selectedSpecialistId !== "all") {
        const specialists = Array.isArray(item?.specialists) ? item.specialists : [];
        return specialists.some((specialist) => String(specialist?.id || "").trim() === selectedSpecialistId);
      }
      return true;
    })
  ), [selectedClassId, selectedClientId, selectedPositionId, selectedSpecialistId, vipNormMonitoringItems]);

  useEffect(() => {
    setPage(1);
  }, [selectedClientId, selectedClassId, selectedPositionId, selectedSpecialistId]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ALL_USERS_LIMIT) || 1);
  const safePage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((safePage - 1) * ALL_USERS_LIMIT, safePage * ALL_USERS_LIMIT);

  return (
    <section id="vipNormMonitoringPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>Norm Monitoring</h3>
        <div className="all-users-head-actions">
          <button
            id="closeVipNormMonitoringBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label="Close VIP norm monitoring panel"
            onClick={closeAppointmentVipNormMonitoringPanel}
          >
            ×
          </button>
        </div>
      </div>

      <div className="vip-attendance-toolbar vip-norm-monitoring-toolbar">
        <label className="field" htmlFor="vipNormMonitoringClientFilterSelect">
          <span>Client</span>
          <CustomSelect
            id="vipNormMonitoringClientFilterSelect"
            value={selectedClientId}
            options={clientOptions}
            searchable
            searchThreshold={0}
            onChange={(nextValue) => setSelectedClientId(String(nextValue || "").trim() || "all")}
          />
        </label>
        <label className="field" htmlFor="vipNormMonitoringClassFilterSelect">
          <span>Class</span>
          <CustomSelect
            id="vipNormMonitoringClassFilterSelect"
            value={selectedClassId}
            options={classOptions}
            searchable
            searchThreshold={0}
            onChange={(nextValue) => setSelectedClassId(String(nextValue || "").trim() || "all")}
          />
        </label>
        <label className="field" htmlFor="vipNormMonitoringPositionFilterSelect">
          <span>Position</span>
          <CustomSelect
            id="vipNormMonitoringPositionFilterSelect"
            value={selectedPositionId}
            options={positionOptions}
            searchable
            searchThreshold={0}
            onChange={(nextValue) => setSelectedPositionId(String(nextValue || "").trim() || "all")}
          />
        </label>
        <label className="field" htmlFor="vipNormMonitoringSpecialistFilterSelect">
          <span>Specialist</span>
          <CustomSelect
            id="vipNormMonitoringSpecialistFilterSelect"
            value={selectedSpecialistId}
            options={specialistOptions}
            searchable
            searchThreshold={0}
            onChange={(nextValue) => setSelectedSpecialistId(String(nextValue || "").trim() || "all")}
          />
        </label>
      </div>

      <p id="vipNormMonitoringState" className="all-users-state" hidden={vipNormMonitoringLoading || !vipNormMonitoringMessage}>
        {vipNormMonitoringMessage}
      </p>

      <div className="all-users-table-wrap">
        <table className="all-users-table vip-norm-monitoring-table" aria-label="VIP norm monitoring table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Position</th>
              <th>Weekly norm</th>
              <th>Booked this week</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {vipNormMonitoringLoading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="5" className="skel" />
                </tr>
              ))
            ) : visibleItems.length > 0 ? visibleItems.map((item) => (
              <tr key={item.id}>
                <td>{formatClientLabel(item) || "-"}</td>
                <td>{item.positionLabel || "-"}</td>
                <td style={{ textAlign: "center" }}>{item.weeklyNorm}</td>
                <td style={{ textAlign: "center" }}>{item.currentBooked}</td>
                <td className="vip-norm-status-cell">
                  <span className={`vip-norm-status-pill vip-norm-status-pill-${item.statusKey || "normal"}`}>
                    {item.status || "Normal"}
                  </span>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="5" className="all-users-state">No norm monitoring records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="all-users-pagination" hidden={vipNormMonitoringLoading || filteredItems.length === 0}>
        <button
          type="button"
          className="header-btn"
          disabled={safePage <= 1}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          Previous
        </button>
        <span className="all-users-page-info">
          Page {safePage} of {totalPages}
        </span>
        <button
          type="button"
          className="header-btn"
          disabled={safePage >= totalPages}
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
        >
          Next
        </button>
      </div>
    </section>
  );
}

export default VipNormMonitoringPanel;
