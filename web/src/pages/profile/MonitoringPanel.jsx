import { useCallback, useEffect, useState } from "react";
import { apiFetch, readApiResponseData } from "../../lib/api.js";

function formatUptime({ days, hours, minutes }) {
  const parts = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function formatTimestamp(ts) {
  if (!ts) {
    return "-";
  }
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function SpeedBadge({ avgMs }) {
  if (avgMs >= 1000) {
    return <span className="monitoring-badge monitoring-badge-slow">Slow</span>;
  }
  if (avgMs >= 300) {
    return <span className="monitoring-badge monitoring-badge-warn">Warn</span>;
  }
  return <span className="monitoring-badge monitoring-badge-ok">Fast</span>;
}

function MonitoringPanel({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await apiFetch("/api/monitoring/health", {
        method: "GET",
        cache: "no-store"
      });
      const json = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(json?.message || "Failed to load monitoring data.");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setMessage("Unexpected error. Please try again.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section id="monitoringPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Monitoring</h3>
        <button
          id="closeMonitoringBtn"
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close monitoring panel"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="monitoring-toolbar">
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={() => { void load(); }}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
        {data?.timestamp && (
          <span className="monitoring-refreshed">
            Updated: {formatTimestamp(data.timestamp)}
          </span>
        )}
      </div>

      {message && (
        <p className="form-error" style={{ marginTop: "12px" }}>{message}</p>
      )}

      {data && (
        <>
          {/* ── Server info cards ── */}
          <div className="monitoring-grid">
            <div className="monitoring-card">
              <div className="monitoring-card-label">Uptime</div>
              <div className="monitoring-card-value">{formatUptime(data.uptime)}</div>
            </div>

            <div className="monitoring-card">
              <div className="monitoring-card-label">Database</div>
              <div className={`monitoring-card-value monitoring-status-${data.db === "up" ? "ok" : "error"}`}>
                {data.db === "up" ? "Connected" : "Disconnected"}
              </div>
            </div>

            <div className="monitoring-card">
              <div className="monitoring-card-label">Heap Used / Total</div>
              <div className="monitoring-card-value">
                {data.memory.heapUsedMb} MB / {data.memory.heapTotalMb} MB
              </div>
            </div>

            <div className="monitoring-card">
              <div className="monitoring-card-label">RSS Memory</div>
              <div className="monitoring-card-value">{data.memory.rssMb} MB</div>
            </div>

            <div className="monitoring-card">
              <div className="monitoring-card-label">Total Requests</div>
              <div className="monitoring-card-value">{data.requests.total}</div>
            </div>

            <div className="monitoring-card">
              <div className="monitoring-card-label">Error Rate</div>
              <div className={`monitoring-card-value ${data.requests.errorRate >= 10 ? "monitoring-status-error" : data.requests.errorRate >= 3 ? "monitoring-status-warn" : "monitoring-status-ok"}`}>
                {data.requests.errorRate}%
                <span className="monitoring-card-sub"> ({data.requests.errors} errors)</span>
              </div>
            </div>

            <div className="monitoring-card">
              <div className="monitoring-card-label">Node.js</div>
              <div className="monitoring-card-value">{data.nodeVersion}</div>
            </div>
          </div>

          {/* ── Slow routes ── */}
          <div className="monitoring-section">
            <h4 className="monitoring-section-title">Slowest Routes (since last restart)</h4>
            {data.requests.slowRoutes.length === 0 ? (
              <p className="monitoring-empty">No request data yet.</p>
            ) : (
              <div className="monitoring-table-wrap">
                <table className="monitoring-table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Route</th>
                      <th>Avg ms</th>
                      <th>Max ms</th>
                      <th>Count</th>
                      <th>Speed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.requests.slowRoutes.map((r, i) => (
                      <tr key={i}>
                        <td><span className="monitoring-method">{r.method}</span></td>
                        <td className="monitoring-route">{r.route}</td>
                        <td>{r.avgMs}</td>
                        <td>{r.maxMs}</td>
                        <td>{r.count}</td>
                        <td><SpeedBadge avgMs={r.avgMs} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Recent errors ── */}
          <div className="monitoring-section">
            <h4 className="monitoring-section-title">Recent Errors (from log file)</h4>
            {data.recentErrors.length === 0 ? (
              <p className="monitoring-empty">No errors found.</p>
            ) : (
              <div className="monitoring-table-wrap">
                <table className="monitoring-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Level</th>
                      <th>Message</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentErrors.map((err, i) => (
                      <tr key={i}>
                        <td className="monitoring-ts">{formatTimestamp(err.timestamp)}</td>
                        <td>
                          <span className={`monitoring-badge monitoring-badge-${err.level === "fatal" ? "slow" : "warn"}`}>
                            {err.level}
                          </span>
                        </td>
                        <td>{err.message}</td>
                        <td className="monitoring-err-detail">
                          {err.payload?.errName && <span>{err.payload.errName}: </span>}
                          {err.payload?.errMessage || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default MonitoringPanel;
