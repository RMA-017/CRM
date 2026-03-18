import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { ALL_USERS_LIMIT } from "../profile.constants.js";

function getCurrentMonthBounds() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${day}`
  };
}

function formatPlannerReportClientLabel(item) {
  const lastName = String(item?.lastName || "").trim();
  const firstName = String(item?.firstName || "").trim();
  const middleName = String(item?.middleName || "").trim();
  return [lastName, firstName, middleName].filter(Boolean).join(" ").trim() || `Client #${String(item?.id || "").trim()}`;
}

function formatPlannerReportDuration(durationMinutesValue, startTimeValue, endTimeValue) {
  const normalizedDurationMinutes = Number.parseInt(String(durationMinutesValue || "0"), 10) || 0;
  if (normalizedDurationMinutes > 0) {
    const hours = Math.floor(normalizedDurationMinutes / 60);
    const minutes = normalizedDurationMinutes % 60;
    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h`;
    }
    return `${minutes}m`;
  }
  const startTime = String(startTimeValue || "").trim();
  const endTime = String(endTimeValue || "").trim();
  if (!startTime || !endTime) {
    return "-";
  }
  const [startHour, startMinute] = startTime.split(":").map((part) => Number.parseInt(part, 10));
  const [endHour, endMinute] = endTime.split(":").map((part) => Number.parseInt(part, 10));
  if (
    Number.isNaN(startHour) ||
    Number.isNaN(startMinute) ||
    Number.isNaN(endHour) ||
    Number.isNaN(endMinute)
  ) {
    return "-";
  }
  const durationMinutes = ((endHour * 60) + endMinute) - ((startHour * 60) + startMinute);
  if (durationMinutes <= 0) {
    return "-";
  }
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function getPlannerReportStatusPresentation(statusValue) {
  const status = String(statusValue || "").trim().toLowerCase();
  if (status === "confirmed") {
    return {
      label: "Confirmed",
      className: "planner-report-cell-confirmed"
    };
  }
  if (status === "pending") {
    return {
      label: "Pending",
      className: "planner-report-cell-pending"
    };
  }
  if (status === "cancelled") {
    return {
      label: "Cancelled",
      className: "planner-report-cell-cancelled"
    };
  }
  if (status === "no-show") {
    return {
      label: "No Show",
      className: "planner-report-cell-no-show"
    };
  }
  return {
    label: status || "-",
    className: ""
  };
}

function StatisticsPlannerReportPanel({
  closeStatisticsPanel,
  showBootstrapSkeleton = false,
  canReadReport = false
}) {
  const initialBounds = getCurrentMonthBounds();
  const [from, setFrom] = useState(initialBounds.from);
  const [to, setTo] = useState(initialBounds.to);
  const [vipOnly, setVipOnly] = useState(false);
  const [specialistId, setSpecialistId] = useState("");
  const [clientId, setClientId] = useState("");
  const [reportData, setReportData] = useState(null);
  const [reportFilterOptions, setReportFilterOptions] = useState({
    specialists: [],
    clients: []
  });
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const [hasLoadedFilterOptions, setHasLoadedFilterOptions] = useState(false);
  const [page, setPage] = useState(1);
  const reportRequestInFlightRef = useRef(false);

  const specialistOptions = useMemo(() => [
    { value: "", label: "All specialists" },
    ...(Array.isArray(reportFilterOptions?.specialists) ? reportFilterOptions.specialists : [])
      .map((item) => ({
        value: String(item?.id || "").trim(),
        label: String(item?.name || "").trim()
      }))
      .filter((item) => Boolean(item.value) && Boolean(item.label))
  ], [reportFilterOptions?.specialists]);

  const clientOptions = useMemo(() => [
    { value: "", label: "All clients" },
    ...(Array.isArray(reportFilterOptions?.clients) ? reportFilterOptions.clients : [])
      .filter((item) => (vipOnly ? Boolean(item?.isVip) : true))
      .map((item) => ({
        value: String(item?.id || "").trim(),
        label: formatPlannerReportClientLabel(item)
      }))
      .filter((item) => Boolean(item.value) && Boolean(item.label))
  ], [reportFilterOptions?.clients, vipOnly]);

  const loadFilterOptions = useCallback(async () => {
    try {
      const response = await apiFetch("/api/appointments/report/filters", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        return;
      }

      setReportFilterOptions({
        specialists: Array.isArray(data?.specialists) ? data.specialists : [],
        clients: Array.isArray(data?.clients) ? data.clients : []
      });
    } catch {
      // Keep the report usable even if filter metadata fails to load.
    }
  }, []);

  const loadReport = useCallback(async ({
    fromDate = "",
    toDate = "",
    nextVipOnly = false,
    nextSpecialistId = "",
    nextClientId = ""
  } = {}) => {
    if (reportRequestInFlightRef.current) {
      return;
    }

    const normalizedFrom = String(fromDate || "").trim() || initialBounds.from;
    const normalizedTo = String(toDate || "").trim() || initialBounds.to;
    const normalizedSpecialistId = String(nextSpecialistId || "").trim();
    const normalizedClientId = String(nextClientId || "").trim();

    reportRequestInFlightRef.current = true;
    setReportLoading(true);
    setReportMessage("");
    try {
      const query = new URLSearchParams({
        from: normalizedFrom,
        to: normalizedTo
      });
      if (nextVipOnly) {
        query.set("isVip", "true");
      }
      if (normalizedSpecialistId) {
        query.set("specialistId", normalizedSpecialistId);
      }
      if (normalizedClientId) {
        query.set("clientId", normalizedClientId);
      }
      const response = await apiFetch(`/api/appointments/report?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setReportData(null);
        setReportMessage(String(data?.message || "Failed to load planner report.").trim());
        return;
      }

      setReportData(data);
    } catch {
      setReportData(null);
      setReportMessage("Unexpected error. Please try again.");
    } finally {
      reportRequestInFlightRef.current = false;
      setReportLoading(false);
    }
  }, [initialBounds.from, initialBounds.to]);

  useEffect(() => {
    if (showBootstrapSkeleton || hasAutoLoaded) {
      return;
    }
    void loadReport({
      fromDate: from,
      toDate: to,
      nextVipOnly: vipOnly,
      nextSpecialistId: specialistId,
      nextClientId: clientId
    });
    setHasAutoLoaded(true);
  }, [clientId, from, hasAutoLoaded, loadReport, showBootstrapSkeleton, specialistId, to, vipOnly]);

  useEffect(() => {
    if (showBootstrapSkeleton || hasLoadedFilterOptions || !canReadReport) {
      return;
    }
    void loadFilterOptions();
    setHasLoadedFilterOptions(true);
  }, [canReadReport, hasLoadedFilterOptions, loadFilterOptions, showBootstrapSkeleton]);

  useEffect(() => {
    if (!clientId) {
      return;
    }
    if (!clientOptions.some((item) => item.value === clientId)) {
      setClientId("");
    }
  }, [clientId, clientOptions]);

  useEffect(() => {
    setPage(1);
  }, [reportData]);

  const isLoading = showBootstrapSkeleton || reportLoading;
  const summary = reportData?.summary || {
    total: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    noShow: 0
  };
  const detailRows = Array.isArray(reportData?.details) ? reportData.details : [];
  const totalPages = Math.max(1, Math.ceil(detailRows.length / ALL_USERS_LIMIT) || 1);
  const safePage = Math.min(page, totalPages);
  const visibleDetailRows = detailRows.slice(
    (safePage - 1) * ALL_USERS_LIMIT,
    safePage * ALL_USERS_LIMIT
  );

  return (
    <section id="statisticsPlannerReportPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>Statistics / Lesson Status Report</h3>
        <button
          id="closeStatisticsPlannerReportBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close planner report panel"
          onClick={closeStatisticsPanel}
        >
          ×
        </button>
      </div>

      <form
        className="planner-report-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void loadReport({
            fromDate: from,
            toDate: to,
            nextVipOnly: vipOnly,
            nextSpecialistId: specialistId,
            nextClientId: clientId
          });
        }}
      >
        <label className="field planner-report-field" htmlFor="plannerReportFromInput">
          <span>From</span>
          <input
            id="plannerReportFromInput"
            type="date"
            value={from}
            disabled={reportLoading}
            onChange={(event) => setFrom(String(event.currentTarget.value || "").trim())}
          />
        </label>
        <label className="field planner-report-field" htmlFor="plannerReportToInput">
          <span>To</span>
          <input
            id="plannerReportToInput"
            type="date"
            value={to}
            disabled={reportLoading}
            onChange={(event) => setTo(String(event.currentTarget.value || "").trim())}
          />
        </label>
        <label className="field planner-report-field planner-report-field-specialist" htmlFor="plannerReportSpecialistSelect">
          <span>Specialist</span>
          <CustomSelect
            id="plannerReportSpecialistSelect"
            value={specialistId}
            options={specialistOptions}
            placeholder="All specialists"
            menuPortal
            searchable
            searchPlaceholder="Search specialist"
            searchThreshold={8}
            onChange={(nextValue) => setSpecialistId(String(nextValue || "").trim())}
          />
        </label>
        <label className="field planner-report-field planner-report-field-client" htmlFor="plannerReportClientSelect">
          <span>Client</span>
          <CustomSelect
            id="plannerReportClientSelect"
            value={clientId}
            options={clientOptions}
            placeholder="All clients"
            menuPortal
            searchable
            searchPlaceholder="Search client"
            searchThreshold={8}
            onChange={(nextValue) => setClientId(String(nextValue || "").trim())}
          />
        </label>
        <label className="field planner-report-field planner-report-field-vip" htmlFor="plannerReportVipOnlyInput">
          <span>VIP</span>
          <span className="planner-report-vip-toggle">
            <input
              id="plannerReportVipOnlyInput"
              type="checkbox"
              checked={vipOnly}
              disabled={reportLoading}
              onChange={(event) => setVipOnly(Boolean(event.currentTarget.checked))}
            />
          </span>
        </label>
        <button
          type="submit"
          className="btn planner-report-load-btn"
          disabled={reportLoading}
        >
          {reportLoading ? "Loading..." : "Reload"}
        </button>
      </form>

      {isLoading ? (
        <div className="planner-report-skeleton" aria-hidden="true">
          <div className="planner-report-summary-grid">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={`plannerReportSummarySkel_${item}`} className="skel planner-report-summary-skeleton" />
            ))}
          </div>
          <div className="planner-report-table-skeleton">
            {[0, 1, 2, 3].map((item) => (
              <div key={`plannerReportTableSkel_${item}`} className="skel planner-report-line-skeleton" />
            ))}
          </div>
        </div>
      ) : null}

      <p className="all-users-state" hidden={isLoading || !reportMessage}>
        {reportMessage}
      </p>

      {!isLoading && reportData ? (
        <>
          <div className="planner-report-summary-grid">
            <article className="planner-report-summary-card is-total">
              <span className="planner-report-summary-label">Total Lessons</span>
              <strong className="planner-report-summary-value">{summary.total}</strong>
            </article>
            <article className="planner-report-summary-card is-confirmed">
              <span className="planner-report-summary-label">Confirmed</span>
              <strong className="planner-report-summary-value">{summary.confirmed}</strong>
            </article>
            <article className="planner-report-summary-card is-pending">
              <span className="planner-report-summary-label">Pending</span>
              <strong className="planner-report-summary-value">{summary.pending}</strong>
            </article>
            <article className="planner-report-summary-card is-cancelled">
              <span className="planner-report-summary-label">Cancelled</span>
              <strong className="planner-report-summary-value">{summary.cancelled}</strong>
            </article>
            <article className="planner-report-summary-card is-no-show">
              <span className="planner-report-summary-label">No Show</span>
              <strong className="planner-report-summary-value">{summary.noShow}</strong>
            </article>
          </div>

          <div className="all-users-table-wrap">
            <table className="all-users-table planner-report-table is-detail-report" aria-label="Lesson status report details">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Start Time</th>
                  <th>Duration</th>
                  <th>Specialist</th>
                  <th>Client</th>
                  <th>Service</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleDetailRows.length > 0 ? visibleDetailRows.map((row) => {
                  const statusPresentation = getPlannerReportStatusPresentation(row.status);
                  return (
                    <tr
                      key={`plannerReportDetail_${row.appointmentId || `${row.appointmentDate}_${row.startTime}_${row.specialistId}_${row.clientId}_${row.serviceName}_${row.status}`}`}
                    >
                      <td>{row.appointmentDate || "-"}</td>
                      <td>{row.startTime || "-"}</td>
                      <td>{formatPlannerReportDuration(row.durationMinutes, row.startTime, row.endTime)}</td>
                      <td>{row.specialistName || "-"}</td>
                      <td>{row.clientName || "-"}</td>
                      <td>{row.serviceName || "-"}</td>
                      <td className={statusPresentation.className}>{statusPresentation.label}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="7" className="all-users-state">No lesson records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="all-users-pagination" hidden={detailRows.length === 0 || totalPages <= 1}>
            <button
              type="button"
              className="header-btn"
              disabled={safePage <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <span className="all-users-page-info">Page {safePage} of {totalPages}</span>
            <button
              type="button"
              className="header-btn"
              disabled={safePage >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default StatisticsPlannerReportPanel;
