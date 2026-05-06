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

function formatPercent(value) {
  const percent = Number.parseInt(String(value || "0"), 10) || 0;
  return `${Math.max(0, Math.min(100, percent))}%`;
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

function buildCountMap(rows, getKey, getLabel) {
  const map = new Map();
  rows.forEach((row) => {
    const key = String(getKey(row) || "").trim();
    if (!key) {
      return;
    }
    const current = map.get(key) || {
      key,
      label: String(getLabel(row) || key).trim() || key,
      count: 0,
      minutes: 0
    };
    current.count += 1;
    current.minutes += getDurationMinutes(row);
    map.set(key, current);
  });
  return [...map.values()].sort((left, right) => right.count - left.count || right.minutes - left.minutes || left.label.localeCompare(right.label));
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
    const uniqueSpecialists = new Set();
    let bookedMinutes = 0;

    detailRows.forEach((row) => {
      const status = normalizeStatus(row?.status);
      if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
        statusCounts[status] += 1;
      }
      const clientId = String(row?.clientId || "").trim();
      const currentSpecialistId = String(row?.specialistId || "").trim();
      if (clientId) {
        uniqueClients.add(clientId);
      }
      if (currentSpecialistId) {
        uniqueSpecialists.add(currentSpecialistId);
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

    const byHourMap = new Map();
    detailRows.forEach((row) => {
      const hour = String(row?.startTime || "").trim().slice(0, 2);
      if (!hour) {
        return;
      }
      const label = `${hour}:00`;
      const current = byHourMap.get(label) || { key: label, label, count: 0, minutes: 0 };
      current.count += 1;
      current.minutes += getDurationMinutes(row);
      byHourMap.set(label, current);
    });

    const daily = [...byDateMap.values()].sort((left, right) => left.key.localeCompare(right.key));
    const hourly = [...byHourMap.values()].sort((left, right) => left.key.localeCompare(right.key));
    const topClients = buildCountMap(detailRows, (row) => row?.clientId, (row) => row?.clientName).slice(0, 5);
    const allServices = buildCountMap(detailRows, (row) => row?.serviceName, (row) => row?.serviceName);
    const topServices = allServices.slice(0, 5);
    const activeTotal = statusCounts.confirmed + statusCounts.pending;
    const completionRate = detailRows.length > 0 ? Math.round((statusCounts.confirmed / detailRows.length) * 100) : 0;
    const cancellationRate = detailRows.length > 0 ? Math.round((statusCounts.cancelled / detailRows.length) * 100) : 0;
    const noShowRate = detailRows.length > 0 ? Math.round((statusCounts["no-show"] / detailRows.length) * 100) : 0;
    const pendingRate = detailRows.length > 0 ? Math.round((statusCounts.pending / detailRows.length) * 100) : 0;

    return {
      statusCounts,
      uniqueClients: uniqueClients.size,
      uniqueSpecialists: uniqueSpecialists.size,
      bookedMinutes: workloadTotals.bookedMinutes || bookedMinutes,
      activeTotal,
      completionRate,
      cancellationRate,
      noShowRate,
      pendingRate,
      daily,
      hourly,
      topClients,
      topServices,
      allServices
    };
  }, [detailRows, workloadTotals.bookedMinutes]);

  const specialistPerformance = useMemo(() => {
    const rowStats = new Map();
    detailRows.forEach((row) => {
      const id = String(row?.specialistId || "").trim();
      if (!id) {
        return;
      }
      const current = rowStats.get(id) || {
        appointmentCount: 0,
        confirmed: 0,
        pending: 0,
        cancelled: 0,
        noShow: 0
      };
      current.appointmentCount += 1;
      const status = normalizeStatus(row?.status);
      if (status === "confirmed") {
        current.confirmed += 1;
      } else if (status === "pending") {
        current.pending += 1;
      } else if (status === "cancelled") {
        current.cancelled += 1;
      } else if (status === "no-show") {
        current.noShow += 1;
      }
      rowStats.set(id, current);
    });

    return workloadSpecialists
      .map((item) => {
        const id = String(item?.specialistId || "").trim();
        const stats = rowStats.get(id) || {};
        return {
          specialistId: id,
          specialistName: String(item?.specialistName || "").trim() || `Specialist #${id}`,
          appointmentCount: Number.parseInt(String(stats.appointmentCount || "0"), 10) || 0,
          confirmed: Number.parseInt(String(stats.confirmed || "0"), 10) || 0,
          pending: Number.parseInt(String(stats.pending || "0"), 10) || 0,
          cancelled: Number.parseInt(String(stats.cancelled || "0"), 10) || 0,
          noShow: Number.parseInt(String(stats.noShow || "0"), 10) || 0,
          bookedMinutes: Number.parseInt(String(item?.bookedMinutes || "0"), 10) || 0,
          availableMinutes: Number.parseInt(String(item?.availableMinutes || "0"), 10) || 0,
          emptyMinutes: Number.parseInt(String(item?.emptyMinutes || "0"), 10) || 0,
          utilizationPercent: Number.parseInt(String(item?.utilizationPercent || "0"), 10) || 0
        };
      })
      .sort((left, right) => (
        right.utilizationPercent - left.utilizationPercent
        || right.bookedMinutes - left.bookedMinutes
        || left.specialistName.localeCompare(right.specialistName)
      ));
  }, [detailRows, workloadSpecialists]);

  const directorInsights = useMemo(() => {
    const utilization = Number.parseInt(String(workloadTotals.utilizationPercent || "0"), 10) || 0;
    const attendanceRisk = Math.min(100, analytics.cancellationRate + analytics.noShowRate);
    const pendingPressure = analytics.pendingRate;
    const healthScore = Math.max(0, Math.min(100, Math.round(
      (utilization * 0.45)
      + (analytics.completionRate * 0.35)
      + ((100 - attendanceRisk) * 0.15)
      + ((100 - pendingPressure) * 0.05)
    )));
    const emptyMinutes = Number.parseInt(String(workloadTotals.emptyMinutes || "0"), 10) || 0;
    const bookedMinutes = Number.parseInt(String(workloadTotals.bookedMinutes || "0"), 10) || 0;
    const averageDuration = analytics.activeTotal > 0 ? Math.max(1, Math.round(bookedMinutes / analytics.activeTotal)) : 0;
    const appointmentOpportunity = averageDuration > 0 ? Math.floor(emptyMinutes / averageDuration) : 0;
    const overloadedSpecialists = specialistPerformance.filter((item) => item.utilizationPercent >= 85).length;
    const underloadedSpecialists = specialistPerformance.filter((item) => item.availableMinutes > 0 && item.utilizationPercent <= 35).length;

    return {
      healthScore,
      attendanceRisk,
      pendingPressure,
      appointmentOpportunity,
      overloadedSpecialists,
      underloadedSpecialists
    };
  }, [analytics.activeTotal, analytics.cancellationRate, analytics.completionRate, analytics.noShowRate, analytics.pendingRate, specialistPerformance, workloadTotals.bookedMinutes, workloadTotals.emptyMinutes, workloadTotals.utilizationPercent]);

  const maxDailyCount = Math.max(1, ...analytics.daily.map((item) => item.count));
  const maxHourlyCount = Math.max(1, ...analytics.hourly.map((item) => item.count));
  const maxDailyUtilization = Math.max(1, ...workloadDaily.map((item) => Number.parseInt(String(item?.utilizationPercent || "0"), 10) || 0));
  const statusItems = [
    { key: "confirmed", label: "Confirmed", value: analytics.statusCounts.confirmed },
    { key: "pending", label: "Pending", value: analytics.statusCounts.pending },
    { key: "cancelled", label: "Cancelled", value: analytics.statusCounts.cancelled },
    { key: "no-show", label: "No Show", value: analytics.statusCounts["no-show"] }
  ];
  const maxStatusCount = Math.max(1, ...statusItems.map((item) => item.value));
  const maxServiceCount = Math.max(1, ...analytics.allServices.map((item) => item.count));
  const visibleRows = filteredRows.slice(0, ALL_USERS_LIMIT);
  const isLoading = showBootstrapSkeleton || loading;
  const exportDashboardCsv = useCallback(() => {
    const rows = [
      ["Date", "Time", "Client", "Specialist", "Service", "Status", "Duration"]
    ];
    filteredRows.forEach((row) => {
      rows.push([
        String(row?.appointmentDate || "").trim(),
        [row?.startTime, row?.endTime].filter(Boolean).join(" - "),
        String(row?.clientName || "").trim(),
        String(row?.specialistName || "").trim(),
        String(row?.serviceName || "").trim(),
        formatStatus(row?.status),
        formatMinutes(getDurationMinutes(row))
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
          <small>{analytics.uniqueSpecialists || 0} specialists</small>
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
        <article className="dashboard-kpi-card is-no-show">
          <span>No Show</span>
          <strong>{analytics.statusCounts["no-show"]}</strong>
          <small>Monthly review only</small>
        </article>
      </div>

      <section className="dashboard-insights" aria-label="Director insights">
        <article className="dashboard-insight-card is-health">
          <span>Health Score</span>
          <strong>{directorInsights.healthScore}</strong>
          <small>{formatPercent(workloadTotals.utilizationPercent)} utilization</small>
        </article>
        <article className="dashboard-insight-card is-capacity">
          <span>Capacity Opportunity</span>
          <strong>{directorInsights.appointmentOpportunity}</strong>
          <small>{formatMinutes(workloadTotals.emptyMinutes)} empty time</small>
        </article>
        <article className="dashboard-insight-card is-risk">
          <span>Attendance Risk</span>
          <strong>{formatPercent(directorInsights.attendanceRisk)}</strong>
          <small>{analytics.statusCounts.cancelled + analytics.statusCounts["no-show"]} cancelled / no show</small>
        </article>
        <article className="dashboard-insight-card is-balance">
          <span>Load Balance</span>
          <strong>{directorInsights.overloadedSpecialists}/{directorInsights.underloadedSpecialists}</strong>
          <small>overloaded / underloaded</small>
        </article>
      </section>

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

        <section className="dashboard-chart-panel" aria-label="Peak hours">
          <div className="dashboard-section-head">
            <h4>Peak Hours</h4>
            <span>{analytics.hourly.length} slots</span>
          </div>
          <div className="dashboard-peak-grid">
            {analytics.hourly.length > 0 ? analytics.hourly.map((item) => (
              <div key={item.key} className="dashboard-peak-item">
                <i style={{ height: `${Math.max(10, Math.round((item.count / maxHourlyCount) * 100))}%` }} />
                <strong>{item.count}</strong>
                <span>{item.label}</span>
              </div>
            )) : <p className="dashboard-empty">No peak hour data.</p>}
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

        <section className="dashboard-chart-panel dashboard-chart-panel-wide" aria-label="Specialist performance">
          <div className="dashboard-section-head">
            <h4>Specialist Performance</h4>
            <span>{specialistPerformance.length} specialists</span>
          </div>
          <div className="dashboard-performance-list">
            {specialistPerformance.length > 0 ? specialistPerformance.slice(0, 8).map((item) => (
              <article key={item.specialistId} className="dashboard-performance-card">
                <div>
                  <strong>{item.specialistName}</strong>
                  <span>{item.appointmentCount} appointments</span>
                </div>
                <div className="dashboard-performance-meter">
                  <i style={{ width: `${Math.max(5, item.utilizationPercent)}%` }} />
                </div>
                <div className="dashboard-performance-meta">
                  <span>{formatPercent(item.utilizationPercent)} used</span>
                  <span>{formatMinutes(item.bookedMinutes)} booked</span>
                  <span>{formatMinutes(item.emptyMinutes)} empty</span>
                  <span>{item.cancelled + item.noShow} risk</span>
                </div>
              </article>
            )) : <p className="dashboard-empty">No specialist performance data.</p>}
          </div>
        </section>

        <section className="dashboard-chart-panel" aria-label="Top services and clients">
          <div className="dashboard-section-head">
            <h4>Top Lists</h4>
            <span>Clients / Services</span>
          </div>
          <div className="dashboard-top-grid">
            <div>
              <h5>Top Clients</h5>
              {analytics.topClients.length > 0 ? analytics.topClients.map((item) => (
                <p key={item.key}><span>{item.label}</span><strong>{item.count}</strong></p>
              )) : <small>No clients</small>}
            </div>
            <div>
              <h5>Top Services</h5>
              {analytics.topServices.length > 0 ? analytics.topServices.map((item) => (
                <p key={item.key}><span>{item.label}</span><strong>{item.count}</strong></p>
              )) : <small>No services</small>}
            </div>
          </div>
        </section>

        <section className="dashboard-chart-panel" aria-label="Service mix">
          <div className="dashboard-section-head">
            <h4>Service Mix</h4>
            <span>{analytics.allServices.length} services</span>
          </div>
          <div className="dashboard-bars">
            {analytics.allServices.length > 0 ? analytics.allServices.slice(0, 8).map((item) => (
              <div key={item.key} className="dashboard-bar-row dashboard-bar-row-wide">
                <span>{item.label}</span>
                <div className="dashboard-bar-track dashboard-bar-track-service">
                  <i style={{ width: `${Math.max(5, Math.round((item.count / maxServiceCount) * 100))}%` }} />
                </div>
                <strong>{item.count}</strong>
              </div>
            )) : <p className="dashboard-empty">No service mix data.</p>}
          </div>
        </section>
      </div>

      <div className="dashboard-table-head">
        <h4>Latest Appointments</h4>
        <div className="dashboard-table-actions">
          <button type="button" className="header-btn" onClick={exportDashboardCsv} disabled={filteredRows.length === 0}>
            Export CSV
          </button>
          <button type="button" className="header-btn" onClick={() => setStatusFilter("all")} disabled={statusFilter === "all"}>
            All statuses
          </button>
        </div>
      </div>
      <div className="all-users-table-wrap dashboard-table-wrap">
        <table className="all-users-table planner-report-table dashboard-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Client</th>
              <th>Specialist</th>
              <th>Service</th>
              <th>Status</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length > 0 ? visibleRows.map((row) => (
              <tr key={row.appointmentId || `${row.appointmentDate}-${row.startTime}-${row.clientId}`}>
                <td>{String(row?.appointmentDate || "").trim() || "-"}</td>
                <td>{[row?.startTime, row?.endTime].filter(Boolean).join(" - ") || "-"}</td>
                <td>{String(row?.clientName || "").trim() || "-"}</td>
                <td>{String(row?.specialistName || "").trim() || "-"}</td>
                <td>{String(row?.serviceName || "").trim() || "-"}</td>
                <td><span className={`dashboard-status-pill is-${normalizeStatus(row?.status)}`}>{formatStatus(row?.status)}</span></td>
                <td>{formatMinutes(getDurationMinutes(row))}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7}>No appointments found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default DashboardPanel;
