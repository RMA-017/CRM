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

function mergeOptions(primaryOptions = [], fallbackOptions = []) {
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

function normalizeStatus(statusValue) {
  const status = String(statusValue || "").trim().toLowerCase().replace(/_/g, "-");
  return ["confirmed", "pending", "cancelled", "no-show"].includes(status) ? status : "other";
}

function formatStatus(statusValue) {
  const status = normalizeStatus(statusValue);
  if (status === "no-show") {
    return "No Show";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatMinutes(minutesValue) {
  const minutes = Number.parseInt(String(minutesValue || "0"), 10) || 0;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0 && remainder > 0) {
    return `${hours}h ${remainder}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${remainder}m`;
}

function formatDateLabel(value) {
  const date = String(value || "").trim();
  if (!date) {
    return "-";
  }
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  });
}

function getDurationMinutes(row) {
  const fromValue = Number.parseInt(String(row?.durationMinutes || "0"), 10) || 0;
  if (fromValue > 0) {
    return fromValue;
  }
  const start = String(row?.startTime || "").trim();
  const end = String(row?.endTime || "").trim();
  const [startHour, startMinute] = start.split(":").map((part) => Number.parseInt(part, 10));
  const [endHour, endMinute] = end.split(":").map((part) => Number.parseInt(part, 10));
  if ([startHour, startMinute, endHour, endMinute].some((part) => Number.isNaN(part))) {
    return 0;
  }
  return Math.max(0, ((endHour * 60) + endMinute) - ((startHour * 60) + startMinute));
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function downloadCsv(filename, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function DashboardPanel({
  closeDashboardPanel,
  showBootstrapSkeleton = false,
  canReadDashboard = false
}) {
  const initialBounds = getCurrentMonthBounds();
  const [from, setFrom] = useState(initialBounds.from);
  const [to, setTo] = useState(initialBounds.to);
  const [specialistId, setSpecialistId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dashboardData, setDashboardData] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ specialists: [], clients: [] });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hasLoadedFilters, setHasLoadedFilters] = useState(false);
  const requestIdRef = useRef(0);

  const detailRows = useMemo(() => (
    Array.isArray(dashboardData?.details) ? dashboardData.details : []
  ), [dashboardData?.details]);

  const specialistOptions = useMemo(() => [
    { value: "", label: "All specialists" },
    ...mergeOptions(
      (Array.isArray(filterOptions?.specialists) ? filterOptions.specialists : [])
        .map((item) => ({
          value: String(item?.id || "").trim(),
          label: String(item?.name || "").trim()
        })),
      detailRows.map((row) => ({
        value: String(row?.specialistId || "").trim(),
        label: String(row?.specialistName || "").trim()
      }))
    )
  ], [detailRows, filterOptions?.specialists]);

  const loadFilters = useCallback(async () => {
    try {
      const response = await apiFetch("/api/appointments/report/filters?includeAllClients=true", {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        return;
      }
      setFilterOptions({
        specialists: Array.isArray(data?.specialists) ? data.specialists : [],
        clients: Array.isArray(data?.clients) ? data.clients : []
      });
    } catch {
      // Dashboard still works with report details if filter metadata is unavailable.
    }
  }, []);

  const loadDashboard = useCallback(async ({
    fromDate = "",
    toDate = "",
    nextSpecialistId = ""
  } = {}) => {
    const normalizedFrom = String(fromDate || "").trim() || initialBounds.from;
    const normalizedTo = String(toDate || "").trim() || initialBounds.to;
    const normalizedSpecialistId = String(nextSpecialistId || "").trim();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setMessage("");
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
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (!response.ok) {
        setDashboardData(null);
        setMessage(String(data?.message || "Failed to load dashboard.").trim());
        return;
      }
      setDashboardData(data);
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setDashboardData(null);
      setMessage("Unexpected error. Please try again.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [initialBounds.from, initialBounds.to]);

  useEffect(() => {
    if (showBootstrapSkeleton || !canReadDashboard) {
      return;
    }
    void loadDashboard({
      fromDate: from,
      toDate: to,
      nextSpecialistId: specialistId
    });
  }, [canReadDashboard, from, loadDashboard, showBootstrapSkeleton, specialistId, to]);

  useEffect(() => {
    if (showBootstrapSkeleton || hasLoadedFilters || !canReadDashboard) {
      return;
    }
    void loadFilters();
    setHasLoadedFilters(true);
  }, [canReadDashboard, hasLoadedFilters, loadFilters, showBootstrapSkeleton]);

  useEffect(() => {
    if (!specialistId) {
      return;
    }
    if (!specialistOptions.some((option) => option.value === specialistId)) {
      setSpecialistId("");
    }
  }, [specialistId, specialistOptions]);

  const filteredRows = useMemo(() => (
    detailRows.filter((row) => statusFilter === "all" || normalizeStatus(row?.status) === statusFilter)
  ), [detailRows, statusFilter]);
  const workloadTotals = dashboardData?.workload?.totals || {
    workingMinutes: 0,
    breakMinutes: 0,
    blockedMinutes: 0,
    availableMinutes: 0,
    bookedMinutes: 0,
    emptyMinutes: 0,
    utilizationPercent: 0
  };
  const workloadSpecialists = Array.isArray(dashboardData?.workload?.specialists)
    ? dashboardData.workload.specialists
    : [];
  const workloadDaily = Array.isArray(dashboardData?.workload?.daily)
    ? dashboardData.workload.daily
    : [];

  const analytics = useMemo(() => {
    const statusCounts = {
      confirmed: 0,
      pending: 0,
      cancelled: 0,
      "no-show": 0
    };
    const uniqueClients = new Set();
    let bookedMinutes = 0;

    detailRows.forEach((row) => {
      const status = normalizeStatus(row?.status);
      if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
        statusCounts[status] += 1;
      }
      const clientId = String(row?.clientId || "").trim();
      if (clientId) {
        uniqueClients.add(clientId);
      }
      if (status === "confirmed" || status === "pending") {
        bookedMinutes += getDurationMinutes(row);
      }
    });

    const byDateMap = new Map();
    detailRows.forEach((row) => {
      const date = String(row?.appointmentDate || "").trim();
      if (!date) {
        return;
      }
      const current = byDateMap.get(date) || {
        key: date,
        label: formatDateLabel(date),
        count: 0,
        minutes: 0
      };
      current.count += 1;
      current.minutes += getDurationMinutes(row);
      byDateMap.set(date, current);
    });

    const daily = [...byDateMap.values()].sort((left, right) => left.key.localeCompare(right.key));
    const activeTotal = statusCounts.confirmed + statusCounts.pending;
    const completionRate = detailRows.length > 0 ? Math.round((statusCounts.confirmed / detailRows.length) * 100) : 0;
    const cancellationRate = detailRows.length > 0 ? Math.round((statusCounts.cancelled / detailRows.length) * 100) : 0;

    return {
      statusCounts,
      uniqueClients: uniqueClients.size,
      bookedMinutes: workloadTotals.bookedMinutes || bookedMinutes,
      activeTotal,
      completionRate,
      cancellationRate,
      daily
    };
  }, [detailRows, workloadTotals.bookedMinutes]);

  const maxDailyCount = Math.max(1, ...analytics.daily.map((item) => item.count));
  const maxDailyUtilization = Math.max(1, ...workloadDaily.map((item) => Number.parseInt(String(item?.utilizationPercent || "0"), 10) || 0));
  const statusItems = [
    { key: "confirmed", label: "Confirmed", value: analytics.statusCounts.confirmed },
    { key: "pending", label: "Pending", value: analytics.statusCounts.pending },
    { key: "cancelled", label: "Cancelled", value: analytics.statusCounts.cancelled }
  ];
  const maxStatusCount = Math.max(1, ...statusItems.map((item) => item.value));
  const visibleRows = filteredRows.slice(0, ALL_USERS_LIMIT);
  const isLoading = showBootstrapSkeleton || loading;
  const exportDashboardCsv = useCallback(() => {
    const rows = [
      ["Date", "Client", "Client ID", "Service", "Specialist", "Status"]
    ];
    filteredRows.forEach((row) => {
      rows.push([
        String(row?.appointmentDate || "").trim(),
        String(row?.clientName || "").trim(),
        String(row?.clientId || "").trim(),
        String(row?.serviceName || "").trim(),
        String(row?.specialistName || "").trim(),
        formatStatus(row?.status)
      ]);
    });
    downloadCsv(`dashboard-${from || "from"}-${to || "to"}.csv`, rows);
  }, [filteredRows, from, to]);

  if (!canReadDashboard && !showBootstrapSkeleton) {
    return (
      <section id="dashboardPanel" className="all-users-panel dashboard-panel">
        <div className="all-users-head">
          <h3>Dashboard</h3>
          <button type="button" className="header-btn panel-close-btn" aria-label="Close dashboard panel" onClick={closeDashboardPanel}>
            ×
          </button>
        </div>
        <p className="all-users-state">You do not have permission to view Dashboard.</p>
      </section>
    );
  }

  return (
    <section id="dashboardPanel" className="all-users-panel dashboard-panel">
      <div className="all-users-head">
        <h3>Dashboard</h3>
        <button type="button" className="header-btn panel-close-btn" aria-label="Close dashboard panel" onClick={closeDashboardPanel}>
          ×
        </button>
      </div>

      <form
        className="dashboard-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void loadDashboard({
            fromDate: from,
            toDate: to,
            nextSpecialistId: specialistId
          });
        }}
      >
        <label className="field dashboard-field" htmlFor="dashboardFromInput">
          <span>From</span>
          <input id="dashboardFromInput" type="date" value={from} disabled={isLoading} onChange={(event) => setFrom(String(event.currentTarget.value || "").trim())} />
        </label>
        <label className="field dashboard-field" htmlFor="dashboardToInput">
          <span>To</span>
          <input id="dashboardToInput" type="date" value={to} disabled={isLoading} onChange={(event) => setTo(String(event.currentTarget.value || "").trim())} />
        </label>
        <label className="field dashboard-field dashboard-field-specialist" htmlFor="dashboardSpecialistSelect">
          <span>Specialist</span>
          <CustomSelect
            id="dashboardSpecialistSelect"
            value={specialistId}
            options={specialistOptions}
            placeholder="All specialists"
            menuPortal
            searchable
            searchPlaceholder="Search specialist"
            searchThreshold={8}
            maxVisibleOptions={10}
            disabled={isLoading || specialistOptions.length <= 1}
            onChange={(nextValue) => setSpecialistId(String(nextValue || "").trim())}
          />
        </label>
        <button type="submit" className="header-btn dashboard-refresh-btn" disabled={isLoading}>
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </form>

      {message ? <p className="all-users-state dashboard-message">{message}</p> : null}

      <div className="dashboard-kpi-grid" aria-label="Dashboard summary">
        <article className="dashboard-kpi-card is-total">
          <span>Total Appointments</span>
          <strong>{detailRows.length}</strong>
          <small>{analytics.uniqueClients || 0} unique clients</small>
        </article>
        <article className="dashboard-kpi-card is-confirmed">
          <span>Confirmed</span>
          <strong>{analytics.statusCounts.confirmed}</strong>
          <small>{analytics.completionRate}% completion</small>
        </article>
        <article className="dashboard-kpi-card is-pending">
          <span>Pending</span>
          <strong>{analytics.statusCounts.pending}</strong>
          <small>{analytics.activeTotal} active total</small>
        </article>
        <article className="dashboard-kpi-card is-clients">
          <span>Utilization</span>
          <strong>{Number.parseInt(String(workloadTotals.utilizationPercent || "0"), 10) || 0}%</strong>
          <small>{formatMinutes(workloadTotals.bookedMinutes)} booked</small>
        </article>
        <article className="dashboard-kpi-card is-booked">
          <span>Booked Time</span>
          <strong>{formatMinutes(workloadTotals.bookedMinutes)}</strong>
          <small>{analytics.activeTotal} active appointments</small>
        </article>
        <article className="dashboard-kpi-card is-available">
          <span>Available Time</span>
          <strong>{formatMinutes(workloadTotals.availableMinutes)}</strong>
          <small>{formatMinutes(workloadTotals.emptyMinutes)} empty</small>
        </article>
        <article className="dashboard-kpi-card is-blocked">
          <span>Break / Block</span>
          <strong>{formatMinutes((workloadTotals.breakMinutes || 0) + (workloadTotals.blockedMinutes || 0))}</strong>
          <small>{formatMinutes(workloadTotals.workingMinutes)} planned</small>
        </article>
        <article className="dashboard-kpi-card is-cancelled">
          <span>Cancelled</span>
          <strong>{analytics.statusCounts.cancelled}</strong>
          <small>{analytics.cancellationRate}% cancellation</small>
        </article>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-chart-panel" aria-label="Daily workload">
          <div className="dashboard-section-head">
            <h4>Daily Workload</h4>
            <span>{formatMinutes(analytics.bookedMinutes)}</span>
          </div>
          <div className="dashboard-bars">
            {analytics.daily.length > 0 ? analytics.daily.map((item) => (
              <div key={item.key} className="dashboard-bar-row">
                <span>{item.label}</span>
                <div className="dashboard-bar-track">
                  <i style={{ width: `${Math.max(6, Math.round((item.count / maxDailyCount) * 100))}%` }} />
                </div>
                <strong>{item.count}</strong>
              </div>
            )) : <p className="dashboard-empty">No appointments in selected period.</p>}
          </div>
        </section>

        <section className="dashboard-chart-panel" aria-label="Status breakdown">
          <div className="dashboard-section-head">
            <h4>Status Breakdown</h4>
            <span>{detailRows.length} total</span>
          </div>
          <div className="dashboard-status-list">
            {statusItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`dashboard-status-row is-${item.key}${statusFilter === item.key ? " is-active" : ""}`}
                onClick={() => setStatusFilter((current) => current === item.key ? "all" : item.key)}
              >
                <span>{item.label}</span>
                <div className="dashboard-status-track">
                  <i style={{ width: `${Math.max(4, Math.round((item.value / maxStatusCount) * 100))}%` }} />
                </div>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="dashboard-chart-panel" aria-label="Real workload">
          <div className="dashboard-section-head">
            <h4>Real Workload</h4>
            <span>{Number.parseInt(String(workloadTotals.utilizationPercent || "0"), 10) || 0}% utilization</span>
          </div>
          <div className="dashboard-workload-grid">
            <div>
              <span>Working</span>
              <strong>{formatMinutes(workloadTotals.workingMinutes)}</strong>
            </div>
            <div>
              <span>Available</span>
              <strong>{formatMinutes(workloadTotals.availableMinutes)}</strong>
            </div>
            <div>
              <span>Booked</span>
              <strong>{formatMinutes(workloadTotals.bookedMinutes)}</strong>
            </div>
            <div>
              <span>Empty</span>
              <strong>{formatMinutes(workloadTotals.emptyMinutes)}</strong>
            </div>
            <div>
              <span>Breaks</span>
              <strong>{formatMinutes(workloadTotals.breakMinutes)}</strong>
            </div>
            <div>
              <span>Blocked</span>
              <strong>{formatMinutes(workloadTotals.blockedMinutes)}</strong>
            </div>
          </div>
        </section>

        <section className="dashboard-chart-panel" aria-label="Utilization by day">
          <div className="dashboard-section-head">
            <h4>Utilization By Day</h4>
            <span>{workloadDaily.length} days</span>
          </div>
          <div className="dashboard-bars">
            {workloadDaily.length > 0 ? workloadDaily.map((item) => {
              const percent = Number.parseInt(String(item?.utilizationPercent || "0"), 10) || 0;
              return (
                <div key={item.date} className="dashboard-bar-row">
                  <span>{formatDateLabel(item.date)}</span>
                  <div className="dashboard-bar-track dashboard-bar-track-utilization">
                    <i style={{ width: `${Math.max(5, Math.round((percent / maxDailyUtilization) * 100))}%` }} />
                  </div>
                  <strong>{percent}%</strong>
                </div>
              );
            }) : <p className="dashboard-empty">No workload data.</p>}
          </div>
        </section>

        <section className="dashboard-chart-panel" aria-label="Specialist workload">
          <div className="dashboard-section-head">
            <h4>Specialist Workload</h4>
            <span>{workloadSpecialists.length} specialists</span>
          </div>
          <div className="dashboard-bars">
            {workloadSpecialists.length > 0 ? workloadSpecialists.slice(0, 8).map((item) => (
              <div key={item.specialistId} className="dashboard-bar-row dashboard-bar-row-wide">
                <span>{item.specialistName || `Specialist #${item.specialistId}`}</span>
                <div className="dashboard-bar-track dashboard-bar-track-utilization">
                  <i style={{ width: `${Math.max(5, Number.parseInt(String(item.utilizationPercent || "0"), 10) || 0)}%` }} />
                </div>
                <strong>{Number.parseInt(String(item.utilizationPercent || "0"), 10) || 0}%</strong>
              </div>
            )) : <p className="dashboard-empty">No specialist workload.</p>}
          </div>
        </section>

      </div>

      <div className="dashboard-table-head">
        <h4>Latest Appointments</h4>
        <div className="dashboard-table-actions">
          <button type="button" className="header-btn" onClick={exportDashboardCsv} disabled={filteredRows.length === 0}>
            Export Excel
          </button>
        </div>
      </div>
      <div className="all-users-table-wrap dashboard-table-wrap">
        <table className="all-users-table planner-report-table dashboard-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Client ID</th>
              <th>Service</th>
              <th>Specialist</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length > 0 ? visibleRows.map((row) => (
              <tr key={row.appointmentId || `${row.appointmentDate}-${row.startTime}-${row.clientId}`}>
                <td>{String(row?.appointmentDate || "").trim() || "-"}</td>
                <td>{String(row?.clientName || "").trim() || "-"}</td>
                <td>{String(row?.clientId || "").trim() || "-"}</td>
                <td>{String(row?.serviceName || "").trim() || "-"}</td>
                <td>{String(row?.specialistName || "").trim() || "-"}</td>
                <td><span className={`dashboard-status-pill is-${normalizeStatus(row?.status)}`}>{formatStatus(row?.status)}</span></td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6}>No appointments found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default DashboardPanel;
