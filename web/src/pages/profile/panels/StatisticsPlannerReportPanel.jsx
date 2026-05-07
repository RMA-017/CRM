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

function mergePlannerReportSelectOptions(primaryOptions = [], fallbackOptions = []) {
  const optionMap = new Map();
  [...(Array.isArray(primaryOptions) ? primaryOptions : []), ...(Array.isArray(fallbackOptions) ? fallbackOptions : [])]
    .forEach((option) => {
      const value = String(option?.value || "").trim();
      const label = String(option?.label || "").trim();
      if (value && label && !optionMap.has(value)) {
        optionMap.set(value, label);
      }
    });

  return [...optionMap.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
}

function formatPlannerReportDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw || "-";
  }
  const [year, month, day] = raw.split("-");
  return `${day}.${month}.${year}`;
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

function normalizePlannerReportStatusFilter(statusValue) {
  const status = String(statusValue || "").trim().toLowerCase();
  if (status === "confirmed" || status === "pending" || status === "cancelled" || status === "no-show") {
    return status;
  }
  return "all";
}

function StatisticsPlannerReportPanel({
  closeStatisticsPanel,
  showBootstrapSkeleton = false
}) {
  const initialBounds = getCurrentMonthBounds();
  const [from, setFrom] = useState(initialBounds.from);
  const [to, setTo] = useState(initialBounds.to);
  const [specialistId, setSpecialistId] = useState("");
  const [reportData, setReportData] = useState(null);
  const [reportFilterOptions, setReportFilterOptions] = useState({
    specialists: [],
    scope: {}
  });
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [hasLoadedFilterOptions, setHasLoadedFilterOptions] = useState(false);
  const [page, setPage] = useState(1);
  const [detailStatusFilter, setDetailStatusFilter] = useState("all");
  const reportRequestIdRef = useRef(0);

  const reportScope = reportData?.scope || reportFilterOptions?.scope || {};
  const isSpecialistLocked = Boolean(reportScope?.specialistLocked);
  const lockedSpecialistId = String(reportScope?.specialistId || "").trim();

  const specialistOptions = useMemo(() => {
    const options = mergePlannerReportSelectOptions(
      (Array.isArray(reportFilterOptions?.specialists) ? reportFilterOptions.specialists : [])
        .map((item) => ({
          value: String(item?.id || "").trim(),
          label: String(item?.name || "").trim()
        }))
        .filter((item) => Boolean(item.value) && Boolean(item.label)),
      (Array.isArray(reportData?.details) ? reportData.details : [])
        .map((row) => ({
          value: String(row?.specialistId || "").trim(),
          label: String(row?.specialistName || "").trim()
        }))
        .filter((item) => Boolean(item.value) && Boolean(item.label))
    );
    if (isSpecialistLocked) {
      return options.filter((option) => option.value === lockedSpecialistId);
    }
    return [
      { value: "", label: "All specialists" },
      ...options
    ];
  }, [isSpecialistLocked, lockedSpecialistId, reportData?.details, reportFilterOptions?.specialists]);

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
        scope: data?.scope && typeof data.scope === "object" ? data.scope : {}
      });
      if (data?.scope?.specialistLocked && data?.scope?.specialistId) {
        setSpecialistId(String(data.scope.specialistId || "").trim());
      }
    } catch {
      // Keep the report usable even if filter metadata fails to load.
    }
  }, []);

  const loadReport = useCallback(async ({
    fromDate = "",
    toDate = "",
    nextSpecialistId = ""
  } = {}) => {
    const normalizedFrom = String(fromDate || "").trim() || initialBounds.from;
    const normalizedTo = String(toDate || "").trim() || initialBounds.to;
    const normalizedSpecialistId = String(nextSpecialistId || "").trim();
    const requestId = reportRequestIdRef.current + 1;
    reportRequestIdRef.current = requestId;

    setReportLoading(true);
    setReportMessage("");
    try {
      const query = new URLSearchParams({
        from: normalizedFrom,
        to: normalizedTo
      });
      if (normalizedSpecialistId) {
        query.set("specialistId", normalizedSpecialistId);
      }
      const response = await apiFetch(`/api/appointments/report?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (requestId !== reportRequestIdRef.current) {
        return;
      }
      if (!response.ok) {
        setReportData(null);
        setReportMessage(String(data?.message || "Failed to load planner report.").trim());
        return;
      }

      setReportData(data);
      if (data?.scope?.specialistLocked && data?.scope?.specialistId) {
        setSpecialistId(String(data.scope.specialistId || "").trim());
      }
    } catch {
      if (requestId !== reportRequestIdRef.current) {
        return;
      }
      setReportData(null);
      setReportMessage("Unexpected error. Please try again.");
    } finally {
      if (requestId === reportRequestIdRef.current) {
        setReportLoading(false);
      }
    }
  }, [initialBounds.from, initialBounds.to]);

  useEffect(() => {
    if (showBootstrapSkeleton) {
      return;
    }
    void loadReport({
      fromDate: from,
      toDate: to,
      nextSpecialistId: specialistId
    });
  }, [from, loadReport, showBootstrapSkeleton, specialistId, to]);

  useEffect(() => {
    if (showBootstrapSkeleton || hasLoadedFilterOptions) {
      return;
    }
    void loadFilterOptions();
    setHasLoadedFilterOptions(true);
  }, [hasLoadedFilterOptions, loadFilterOptions, showBootstrapSkeleton]);

  useEffect(() => {
    if (isSpecialistLocked) {
      if (lockedSpecialistId && specialistId !== lockedSpecialistId) {
        setSpecialistId(lockedSpecialistId);
      }
      return;
    }
    if (!specialistId) {
      return;
    }
    if (!specialistOptions.some((item) => item.value === specialistId)) {
      setSpecialistId("");
    }
  }, [isSpecialistLocked, lockedSpecialistId, specialistId, specialistOptions]);

  useEffect(() => {
    setPage(1);
  }, [detailStatusFilter, reportData]);

  const isLoading = showBootstrapSkeleton || reportLoading;
  const summary = reportData?.summary || {
    total: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
    noShow: 0
  };
  const detailRows = Array.isArray(reportData?.details) ? reportData.details : [];
  const summaryItems = [
    { key: "all", label: "Total Lessons", value: summary.total, className: "is-total" },
    { key: "confirmed", label: "Confirmed", value: summary.confirmed, className: "is-confirmed" },
    { key: "pending", label: "Pending", value: summary.pending, className: "is-pending" },
    { key: "cancelled", label: "Cancelled", value: summary.cancelled, className: "is-cancelled" },
    { key: "no-show", label: "No Show", value: summary.noShow, className: "is-no-show" }
  ];
  const filteredDetailRows = detailRows.filter((row) => (
    detailStatusFilter === "all"
      || normalizePlannerReportStatusFilter(row?.status) === detailStatusFilter
  ));
  const totalPages = Math.max(1, Math.ceil(filteredDetailRows.length / ALL_USERS_LIMIT) || 1);
  const safePage = Math.min(page, totalPages);
  const visibleDetailRows = filteredDetailRows.slice(
    (safePage - 1) * ALL_USERS_LIMIT,
    safePage * ALL_USERS_LIMIT
  );

  return (
    <section id="statisticsPlannerReportPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>Dashboard</h3>
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
            nextSpecialistId: specialistId
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
            disabled={isLoading || isSpecialistLocked || specialistOptions.length <= 1}
            onChange={(nextValue) => setSpecialistId(String(nextValue || "").trim())}
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
            {summaryItems.map((item) => {
              const isActive = detailStatusFilter === item.key;
              return (
                <article
                  key={item.key}
                  className={`planner-report-summary-card ${item.className}${isActive ? " is-active" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isActive ? "true" : "false"}
                  onClick={() => {
                    setDetailStatusFilter((current) => (
                      current === item.key
                        ? "all"
                        : item.key
                    ));
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") {
                      return;
                    }
                    event.preventDefault();
                    setDetailStatusFilter((current) => (
                      current === item.key
                        ? "all"
                        : item.key
                    ));
                  }}
                >
                  <span className="planner-report-summary-label">{item.label}</span>
                  <strong className="planner-report-summary-value">{item.value}</strong>
                </article>
              );
            })}
          </div>

          <div className="all-users-table-wrap">
            <table className="all-users-table planner-report-table is-detail-report" aria-label="Lesson status report details">
              <thead>
                <tr>
                  <th>Client Name</th>
                  <th>Client ID</th>
                  <th>Date</th>
                  <th>Service Name</th>
                  <th>Specialist Name</th>
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
                      <td className="planner-report-client-cell">
                        <span className="planner-report-client-text" title={row.clientName || "-"}>
                          {row.clientName || "-"}
                        </span>
                      </td>
                      <td>{row.clientId || "-"}</td>
                      <td>{formatPlannerReportDate(row.appointmentDate)}</td>
                      <td>{row.serviceName || "-"}</td>
                      <td>{row.specialistName || "-"}</td>
                      <td className={statusPresentation.className}>{statusPresentation.label}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="6" className="all-users-state">No lesson records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="all-users-pagination" hidden={filteredDetailRows.length === 0 || totalPages <= 1}>
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
