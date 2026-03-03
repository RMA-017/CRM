import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";

const VIP_FILTER_OPTIONS = Object.freeze([
  { value: "all", label: "All types" },
  { value: "vip", label: "VIP" },
  { value: "non-vip", label: "Non-VIP" }
]);

function formatDisplayDate(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return normalized || "-";
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}

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

function normalizeVipFilterValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "vip" || normalized === "non-vip") {
    return normalized;
  }
  return "all";
}

function formatPlannerReportClientLabel(item) {
  const lastName = String(item?.lastName || "").trim();
  const firstName = String(item?.firstName || "").trim();
  const middleName = String(item?.middleName || "").trim();
  return [lastName, firstName, middleName].filter(Boolean).join(" ").trim() || `Client #${String(item?.id || "").trim()}`;
}

function StatisticsPlannerReportPanel({
  closeStatisticsPanel,
  showBootstrapSkeleton = false
}) {
  const initialBounds = getCurrentMonthBounds();
  const [from, setFrom] = useState(initialBounds.from);
  const [to, setTo] = useState(initialBounds.to);
  const [vipFilter, setVipFilter] = useState("all");
  const [specialistId, setSpecialistId] = useState("");
  const [clientId, setClientId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [reportData, setReportData] = useState(null);
  const [reportFilterOptions, setReportFilterOptions] = useState({
    specialists: [],
    clients: [],
    serviceNames: []
  });
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const [hasLoadedFilterOptions, setHasLoadedFilterOptions] = useState(false);
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

  const clientOptions = useMemo(() => {
    const normalizedVipFilter = normalizeVipFilterValue(vipFilter);
    return [
      { value: "", label: "All clients" },
      ...(Array.isArray(reportFilterOptions?.clients) ? reportFilterOptions.clients : [])
        .filter((item) => {
          if (normalizedVipFilter === "vip") {
            return Boolean(item?.isVip);
          }
          if (normalizedVipFilter === "non-vip") {
            return !Boolean(item?.isVip);
          }
          return true;
        })
        .map((item) => ({
          value: String(item?.id || "").trim(),
          label: formatPlannerReportClientLabel(item)
        }))
        .filter((item) => Boolean(item.value) && Boolean(item.label))
    ];
  }, [reportFilterOptions?.clients, vipFilter]);

  const serviceOptions = useMemo(() => [
    { value: "", label: "All services" },
    ...(Array.isArray(reportFilterOptions?.serviceNames) ? reportFilterOptions.serviceNames : [])
      .map((item) => ({
        value: String(item || "").trim(),
        label: String(item || "").trim()
      }))
      .filter((item) => Boolean(item.value))
  ], [reportFilterOptions?.serviceNames]);

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
        clients: Array.isArray(data?.clients) ? data.clients : [],
        serviceNames: Array.isArray(data?.serviceNames) ? data.serviceNames : []
      });
    } catch {
      // Keep the report usable even if filter metadata fails to load.
    }
  }, []);

  const loadReport = useCallback(async ({
    fromDate = "",
    toDate = "",
    nextVipFilter = "all",
    nextSpecialistId = "",
    nextClientId = "",
    nextServiceName = ""
  } = {}) => {
    if (reportRequestInFlightRef.current) {
      return;
    }

    const normalizedFrom = String(fromDate || "").trim() || initialBounds.from;
    const normalizedTo = String(toDate || "").trim() || initialBounds.to;
    const normalizedVipFilter = normalizeVipFilterValue(nextVipFilter);
    const normalizedSpecialistId = String(nextSpecialistId || "").trim();
    const normalizedClientId = String(nextClientId || "").trim();
    const normalizedServiceName = String(nextServiceName || "").trim();

    reportRequestInFlightRef.current = true;
    setReportLoading(true);
    setReportMessage("");
    try {
      const query = new URLSearchParams({
        from: normalizedFrom,
        to: normalizedTo
      });
      if (normalizedVipFilter === "vip") {
        query.set("isVip", "true");
      } else if (normalizedVipFilter === "non-vip") {
        query.set("isVip", "false");
      }
      if (normalizedSpecialistId) {
        query.set("specialistId", normalizedSpecialistId);
      }
      if (normalizedClientId) {
        query.set("clientId", normalizedClientId);
      }
      if (normalizedServiceName) {
        query.set("serviceName", normalizedServiceName);
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
      if ((Number(data?.summary?.total) || 0) === 0) {
        setReportMessage("No appointment planner records found for the selected period.");
      }
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
      nextVipFilter: vipFilter,
      nextSpecialistId: specialistId,
      nextClientId: clientId,
      nextServiceName: serviceName
    });
    setHasAutoLoaded(true);
  }, [clientId, from, hasAutoLoaded, loadReport, serviceName, showBootstrapSkeleton, specialistId, to, vipFilter]);

  useEffect(() => {
    if (showBootstrapSkeleton || hasLoadedFilterOptions) {
      return;
    }
    void loadFilterOptions();
    setHasLoadedFilterOptions(true);
  }, [hasLoadedFilterOptions, loadFilterOptions, showBootstrapSkeleton]);

  useEffect(() => {
    if (!clientId) {
      return;
    }
    if (!clientOptions.some((item) => item.value === clientId)) {
      setClientId("");
    }
  }, [clientId, clientOptions]);

  const isLoading = showBootstrapSkeleton || reportLoading;
  const summary = reportData?.summary || {
    total: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    noShow: 0
  };

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
            nextVipFilter: vipFilter,
            nextSpecialistId: specialistId,
            nextClientId: clientId,
            nextServiceName: serviceName
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
        <label className="field planner-report-field planner-report-field-vip" htmlFor="plannerReportVipTypeSelect">
          <span>Type</span>
          <CustomSelect
            id="plannerReportVipTypeSelect"
            value={vipFilter}
            options={VIP_FILTER_OPTIONS}
            placeholder="All types"
            menuPortal
            onChange={(nextValue) => setVipFilter(normalizeVipFilterValue(nextValue))}
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
        <label className="field planner-report-field planner-report-field-service" htmlFor="plannerReportServiceSelect">
          <span>Service</span>
          <CustomSelect
            id="plannerReportServiceSelect"
            value={serviceName}
            options={serviceOptions}
            placeholder="All services"
            menuPortal
            searchable
            searchPlaceholder="Search service"
            searchThreshold={8}
            onChange={(nextValue) => setServiceName(String(nextValue || "").trim())}
          />
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

          <div className="planner-report-section-grid">
            <section className="planner-report-section">
              <div className="planner-report-section-head">
                <h4>By Specialist</h4>
              </div>
              <div className="all-users-table-wrap">
                <table className="all-users-table planner-report-table" aria-label="Planner report by specialist">
                  <thead>
                    <tr>
                      <th>Specialist</th>
                      <th>Total</th>
                      <th>Confirmed</th>
                      <th>Pending</th>
                      <th>Cancelled</th>
                      <th>No Show</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(reportData?.bySpecialist) ? reportData.bySpecialist : []).map((row) => (
                      <tr key={`plannerReportSpecialist_${row.specialistId}`}>
                        <td>{row.specialistName || "-"}</td>
                        <td>{row.total || 0}</td>
                        <td className="planner-report-cell-confirmed">{row.confirmed || 0}</td>
                        <td className="planner-report-cell-pending">{row.pending || 0}</td>
                        <td className="planner-report-cell-cancelled">{row.cancelled || 0}</td>
                        <td className="planner-report-cell-no-show">{row.noShow || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="planner-report-section">
              <div className="planner-report-section-head">
                <h4>Daily Breakdown</h4>
              </div>
              <div className="all-users-table-wrap">
                <table className="all-users-table planner-report-table" aria-label="Planner report by day">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Confirmed</th>
                      <th>Pending</th>
                      <th>Cancelled</th>
                      <th>No Show</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(reportData?.byDate) ? reportData.byDate : []).map((row) => (
                      <tr key={`plannerReportDate_${row.date}`}>
                        <td>{formatDisplayDate(row.date)}</td>
                        <td>{row.total || 0}</td>
                        <td className="planner-report-cell-confirmed">{row.confirmed || 0}</td>
                        <td className="planner-report-cell-pending">{row.pending || 0}</td>
                        <td className="planner-report-cell-cancelled">{row.cancelled || 0}</td>
                        <td className="planner-report-cell-no-show">{row.noShow || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default StatisticsPlannerReportPanel;
