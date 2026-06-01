import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { ALL_USERS_LIMIT } from "../profile.constants.js";

const PLANNER_REPORT_COLUMNS_STORAGE_KEY = "aaron_crm_planner_report_columns";
const DEFAULT_PLANNER_REPORT_COLUMN_IDS = Object.freeze([
  "ticketDate",
  "clientName",
  "clientId",
  "serviceName",
  "specialistName",
  "status",
  "note"
]);

function loadStoredPlannerReportColumnIds() {
  if (typeof window === "undefined") {
    return [...DEFAULT_PLANNER_REPORT_COLUMN_IDS];
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLANNER_REPORT_COLUMNS_STORAGE_KEY) || "[]");
    const stored = Array.isArray(parsed) ? parsed : [];
    const allowed = new Set(DEFAULT_PLANNER_REPORT_COLUMN_IDS);
    const normalized = DEFAULT_PLANNER_REPORT_COLUMN_IDS.filter((id) => stored.includes(id) && allowed.has(id));
    return normalized.length > 0 ? normalized : [...DEFAULT_PLANNER_REPORT_COLUMN_IDS];
  } catch {
    return [...DEFAULT_PLANNER_REPORT_COLUMN_IDS];
  }
}

function storePlannerReportColumnIds(columnIds) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PLANNER_REPORT_COLUMNS_STORAGE_KEY, JSON.stringify(columnIds));
  } catch {
    // Keep the current session state even when localStorage is unavailable.
  }
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
  const { translate } = useI18n();
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
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState(() => loadStoredPlannerReportColumnIds());
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
  const plannerReportColumns = useMemo(() => [
    {
      id: "ticketDate",
      label: "Ticket Date",
      className: "planner-report-date-cell",
      render: (row) => formatPlannerReportDate(row.appointmentDate)
    },
    {
      id: "clientName",
      label: "Client Name",
      className: "planner-report-client-cell",
      render: (row) => (
        <span className="planner-report-client-text" title={row.clientName || "-"}>
          {row.clientName || "-"}
        </span>
      )
    },
    {
      id: "clientId",
      label: "Client ID",
      className: "planner-report-client-id-cell",
      render: (row) => row.clientId || "-"
    },
    {
      id: "serviceName",
      label: "Service Name",
      className: "planner-report-service-cell",
      render: (row) => row.serviceName || "-"
    },
    {
      id: "specialistName",
      label: "Specialist Name",
      className: "planner-report-specialist-cell",
      render: (row) => row.specialistName || "-"
    },
    {
      id: "status",
      label: "Status",
      className: "planner-report-status-cell",
      render: (row) => {
        const statusPresentation = getPlannerReportStatusPresentation(row.status);
        return <span className={statusPresentation.className}>{statusPresentation.label}</span>;
      }
    },
    {
      id: "note",
      label: "Note",
      className: "planner-report-note-cell",
      render: (row) => {
        const note = String(row?.note || "").trim();
        return <span className="planner-report-note-text" title={note || "-"}>{note || "-"}</span>;
      }
    }
  ], []);
  const visibleColumns = plannerReportColumns.filter((column) => visibleColumnIds.includes(column.id));
  const visibleColumnCount = Math.max(visibleColumns.length, 1);

  const toggleColumnVisibility = (columnId) => {
    setVisibleColumnIds((current) => {
      let next = current;
      if (current.includes(columnId)) {
        next = current.length > 1 ? current.filter((id) => id !== columnId) : current;
      } else if (plannerReportColumns.some((column) => column.id === columnId)) {
        const nextIds = new Set([...current, columnId]);
        next = plannerReportColumns.map((column) => column.id).filter((id) => nextIds.has(id));
      }
      if (next !== current) {
        storePlannerReportColumnIds(next);
      }
      return next;
    });
  };

  const closeColumns = () => {
    setColumnsOpen(false);
  };

  return (
    <section id="statisticsPlannerReportPanel" className="all-users-panel">
      <div className="all-users-head">
        <h3>{translate("Dashboard")}</h3>
        <div className="all-users-head-actions">
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            aria-label={translate("Table columns")}
            title={translate("Table columns")}
            onClick={() => setColumnsOpen(true)}
          >
            <span className="finance-head-icon finance-head-icon-columns" aria-hidden="true" />
          </button>
          <button
            id="closeStatisticsPlannerReportBtn"
            type="button"
            className="header-btn panel-close-btn"
            aria-label={translate("Close planner report panel")}
            onClick={closeStatisticsPanel}
          >
            ×
          </button>
        </div>
      </div>

      {columnsOpen && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close")}
            onClick={closeColumns}
          />
          <div id="plannerReportColumnsModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-ticket-columns-modal">
            <h3>{translate("Table columns")}</h3>
            <div className="finance-ticket-columns-list">
              {plannerReportColumns.map((column) => {
                const checked = visibleColumnIds.includes(column.id);
                return (
                  <label className="finance-ticket-column-option" key={column.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checked && visibleColumnIds.length <= 1}
                      onChange={() => toggleColumnVisibility(column.id)}
                    />
                    <span>{translate(column.label)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      ), document.body) : null}

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
              <colgroup>
                {visibleColumns.map((column) => (
                  <col key={column.id} className={`planner-report-col-${column.id}`} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.map((column) => (
                    <th key={column.id} className={column.className}>{translate(column.label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleDetailRows.length > 0 ? visibleDetailRows.map((row) => {
                  return (
                    <tr
                      key={`plannerReportDetail_${row.appointmentId || `${row.appointmentDate}_${row.startTime}_${row.specialistId}_${row.clientId}_${row.serviceName}_${row.status}`}`}
                    >
                      {visibleColumns.map((column) => (
                        <td key={column.id} className={column.className}>{column.render(row)}</td>
                      ))}
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={visibleColumnCount} className="all-users-state">{translate("No lesson records found.")}</td>
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
