import { useCallback, useEffect, useState } from "react";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function todayYmd() {
  return new Date().toISOString().split("T")[0];
}

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

function formatDate(s) {
  if (!s) return "-";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

function formatTime(isoStr) {
  if (!isoStr) return "-";
  const s = String(isoStr).trim();
  const noTz = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (noTz) return `${noTz[4]}:${noTz[5]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function statusLabel(s) {
  if (s === "late") return "Late";
  if (s === "on_time") return "On time";
  return s || "-";
}

function statusClass(s) {
  if (s === "late") return "att-badge att-badge-late";
  if (s === "on_time") return "att-badge att-badge-ok";
  return "att-badge";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ReportTab({ users }) {
  const [from, setFrom] = useState(sevenDaysAgo());
  const [to, setTo] = useState(todayYmd());
  const [userId, setUserId] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      let url = `/api/staff-attendance?from=${from}&to=${to}`;
      if (userId) url += `&userId=${userId}`;
      const res = await apiFetch(url);
      const data = await readApiResponseData(res);
      if (!res.ok) {
        setMessage(data?.message || "An error occurred.");
        return;
      }
      setRecords(Array.isArray(data?.records) ? data.records : []);
    } catch {
      setMessage("Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  }, [from, to, userId]);

  useEffect(() => { void load(); }, [load]);

  const total = records.length;
  const onTime = records.filter((r) => r.status === "on_time").length;
  const late = records.filter((r) => r.status === "late").length;
  const noCheckout = records.filter((r) => r.checkInAt && !r.checkOutAt).length;

  return (
    <div className="att-admin-tab">
      <div className="att-admin-filters">
        <div className="att-admin-filter-group">
          <label>From</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="att-admin-filter-group">
          <label>To</label>
          <input type="date" value={to} min={from} max={todayYmd()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="att-admin-filter-group">
          <label>Employee</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">All</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName || u.username}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn" disabled={loading} onClick={load}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {message && <p className="att-msg att-msg-error">{message}</p>}

      {!loading && records.length > 0 && (
        <div className="att-admin-stats">
          <div className="att-stat-card">
            <div className="att-stat-val">{total}</div>
            <div className="att-stat-label">Total records</div>
          </div>
          <div className="att-stat-card att-stat-ok">
            <div className="att-stat-val">{onTime}</div>
            <div className="att-stat-label">On time</div>
          </div>
          <div className="att-stat-card att-stat-late">
            <div className="att-stat-val">{late}</div>
            <div className="att-stat-label">Late</div>
          </div>
          <div className="att-stat-card att-stat-warn">
            <div className="att-stat-val">{noCheckout}</div>
            <div className="att-stat-label">No check-out</div>
          </div>
        </div>
      )}

      {!loading && records.length === 0 && !message && (
        <p className="att-msg">No records found.</p>
      )}

      {records.length > 0 && (
        <div className="all-users-table-wrap">
          <table className="all-users-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{r.fullName || r.username || `#${r.userId}`}</td>
                  <td>{formatDate(r.date)}</td>
                  <td>{formatTime(r.checkInAt)}</td>
                  <td>{formatTime(r.checkOutAt)}</td>
                  <td>
                    {r.checkInAt
                      ? <span className={statusClass(r.status)}>{statusLabel(r.status)}</span>
                      : <span className="att-badge">Absent</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrgSettingsTab() {
  const [form, setForm] = useState({
    workStart: "09:00",
    workEnd: "18:00",
    lateThresholdMinutes: 15,
    locationLat: "",
    locationLng: "",
    locationRadiusMeters: 100,
    faceCheckFrequency: 5
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    apiFetch("/api/staff-attendance/settings")
      .then((res) => readApiResponseData(res))
      .then((data) => {
        if (data) {
          setForm({
            workStart: String(data.workStart || "09:00:00").slice(0, 5),
            workEnd: String(data.workEnd || "18:00:00").slice(0, 5),
            lateThresholdMinutes: data.lateThresholdMinutes ?? 15,
            locationLat: data.locationLat != null ? String(data.locationLat) : "",
            locationLng: data.locationLng != null ? String(data.locationLng) : "",
            locationRadiusMeters: data.locationRadiusMeters ?? 100,
            faceCheckFrequency: data.faceCheckFrequency ?? 5
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");
    setIsError(false);
    try {
      const res = await apiFetch("/api/staff-attendance/settings/org", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workStart: form.workStart,
          workEnd: form.workEnd,
          lateThresholdMinutes: Number(form.lateThresholdMinutes),
          locationLat: form.locationLat !== "" ? Number(form.locationLat) : null,
          locationLng: form.locationLng !== "" ? Number(form.locationLng) : null,
          locationRadiusMeters: Number(form.locationRadiusMeters),
          faceCheckFrequency: Number(form.faceCheckFrequency)
        })
      });
      const data = await readApiResponseData(res);
      if (!res.ok) {
        setIsError(true);
        setMessage(data?.message || "An error occurred.");
        return;
      }
      setMessage("Settings saved.");
    } catch {
      setIsError(true);
      setMessage("Failed to connect to server.");
    } finally {
      setSubmitting(false);
    }
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage("");
  }

  if (loading) return <p className="att-msg">Loading...</p>;

  return (
    <div className="att-admin-tab">
      <form onSubmit={handleSubmit} className="att-settings-form">

        <fieldset className="att-fieldset">
          <legend>Work Hours</legend>
          <div className="att-form-row">
            <div className="field">
              <label>Start</label>
              <input
                type="time"
                value={form.workStart}
                onChange={(e) => setField("workStart", e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>End</label>
              <input
                type="time"
                value={form.workEnd}
                onChange={(e) => setField("workEnd", e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Late threshold (minutes)</label>
              <input
                type="number"
                min={0}
                max={120}
                value={form.lateThresholdMinutes}
                onChange={(e) => setField("lateThresholdMinutes", e.target.value)}
                required
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="att-fieldset">
          <legend>Location</legend>
          <p className="att-fieldset-hint">
            If empty — location check is disabled.
          </p>
          <div className="att-form-row">
            <div className="field">
              <label>Latitude</label>
              <input
                type="number"
                step="any"
                placeholder="41.2995"
                value={form.locationLat}
                onChange={(e) => setField("locationLat", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Longitude</label>
              <input
                type="number"
                step="any"
                placeholder="69.2401"
                value={form.locationLng}
                onChange={(e) => setField("locationLng", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Radius (meters)</label>
              <input
                type="number"
                min={10}
                max={5000}
                value={form.locationRadiusMeters}
                onChange={(e) => setField("locationRadiusMeters", e.target.value)}
                required
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="att-fieldset">
          <legend>Face Verification</legend>
          <div className="att-form-row">
            <div className="field">
              <label>Frequency (0 = disabled)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.faceCheckFrequency}
                onChange={(e) => setField("faceCheckFrequency", e.target.value)}
                required
              />
              <span className="att-fieldset-hint">
                {Number(form.faceCheckFrequency) === 0
                  ? "Face verification disabled"
                  : `Face required every ${form.faceCheckFrequency} check-ins`}
              </span>
            </div>
          </div>
        </fieldset>

        {message && (
          <p className={`att-msg ${isError ? "att-msg-error" : "att-msg-done"}`}>{message}</p>
        )}

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}

function UserSettingsTab({ users }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [form, setForm] = useState({ workStart: "", workEnd: "" });
  const [userSettingsList, setUserSettingsList] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    apiFetch("/api/staff-attendance/settings/users")
      .then((res) => readApiResponseData(res))
      .then((data) => {
        setUserSettingsList(Array.isArray(data?.userSettings) ? data.userSettings : []);
      })
      .catch(() => {});
  }, []);

  function selectUser(uid) {
    setSelectedUserId(uid);
    setMessage("");
    const existing = userSettingsList.find((s) => String(s.userId) === String(uid));
    setForm({
      workStart: existing?.workStart ? String(existing.workStart).slice(0, 5) : "",
      workEnd: existing?.workEnd ? String(existing.workEnd).slice(0, 5) : ""
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedUserId) return;
    setSubmitting(true);
    setMessage("");
    setIsError(false);
    try {
      const res = await apiFetch(`/api/staff-attendance/settings/user/${selectedUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workStart: form.workStart || null,
          workEnd: form.workEnd || null
        })
      });
      const data = await readApiResponseData(res);
      if (!res.ok) {
        setIsError(true);
        setMessage(data?.message || "An error occurred.");
        return;
      }
      setMessage("Saved.");
      setUserSettingsList((prev) => {
        const next = prev.filter((s) => String(s.userId) !== String(selectedUserId));
        if (data.userSettings) next.push(data.userSettings);
        return next;
      });
    } catch {
      setIsError(true);
      setMessage("Failed to connect to server.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedUser = users.find((u) => String(u.id) === String(selectedUserId));

  return (
    <div className="att-admin-tab">
      <p className="att-fieldset-hint" style={{ marginBottom: 12 }}>
        Set individual work hours for an employee. If empty — organization settings are used.
      </p>

      <div className="att-form-row" style={{ marginBottom: 16 }}>
        <div className="field" style={{ minWidth: 220 }}>
          <label>Select employee</label>
          <select value={selectedUserId} onChange={(e) => selectUser(e.target.value)}>
            <option value="">— Select —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName || u.username}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedUserId && (
        <form onSubmit={handleSubmit} className="att-settings-form">
          <fieldset className="att-fieldset">
            <legend>{selectedUser?.fullName || selectedUser?.username} — Work Hours</legend>
            <div className="att-form-row">
              <div className="field">
                <label>Start</label>
                <input
                  type="time"
                  value={form.workStart}
                  onChange={(e) => { setForm((p) => ({ ...p, workStart: e.target.value })); setMessage(""); }}
                />
              </div>
              <div className="field">
                <label>End</label>
                <input
                  type="time"
                  value={form.workEnd}
                  onChange={(e) => { setForm((p) => ({ ...p, workEnd: e.target.value })); setMessage(""); }}
                />
              </div>
            </div>
            <p className="att-fieldset-hint">
              If empty — organization settings are used
            </p>
          </fieldset>

          {message && (
            <p className={`att-msg ${isError ? "att-msg-error" : "att-msg-done"}`}>{message}</p>
          )}

          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </button>
        </form>
      )}

      {userSettingsList.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4 className="att-history-title">Employees with custom settings</h4>
          <div className="all-users-table-wrap">
            <table className="all-users-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Start</th>
                  <th>End</th>
                </tr>
              </thead>
              <tbody>
                {userSettingsList.map((s) => {
                  const u = users.find((x) => String(x.id) === String(s.userId));
                  return (
                    <tr
                      key={s.userId}
                      className="att-user-row"
                      onClick={() => selectUser(s.userId)}
                    >
                      <td>{s.fullName || u?.fullName || u?.username || `#${s.userId}`}</td>
                      <td>{s.workStart ? String(s.workStart).slice(0, 5) : "—"}</td>
                      <td>{s.workEnd ? String(s.workEnd).slice(0, 5) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

const TABS = [
  { key: "report", label: "Report" },
  { key: "org", label: "Org Settings" },
  { key: "users", label: "User Settings" }
];

export default function StaffAttendanceAdminPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState("report");
  const [users, setUsers] = useState([]);

  useEffect(() => {
    apiFetch("/api/users?limit=200")
      .then((res) => readApiResponseData(res))
      .then((data) => {
        const list = Array.isArray(data?.users) ? data.users : [];
        setUsers(list.map((u) => ({
          id: String(u.id),
          fullName: u.fullName || u.full_name || "",
          username: u.username || ""
        })));
      })
      .catch(() => {});
  }, []);

  return (
    <section id="staffAttendanceAdminPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Attendance Admin</h3>
        <button
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="att-admin-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`att-admin-tab-btn${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "report" && <ReportTab users={users} />}
      {activeTab === "org" && <OrgSettingsTab />}
      {activeTab === "users" && <UserSettingsTab users={users} />}
    </section>
  );
}
