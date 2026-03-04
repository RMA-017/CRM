import { useCallback, useEffect, useRef, useState } from "react";
import FaceCapture from "../../../components/FaceCapture.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";

const GPS_ACCURACY_THRESHOLD = 80; // metres
const GPS_TIMEOUT_MS = 20000;

function formatTime(isoString) {
  if (!isoString) return "-";
  const s = String(isoString).trim();
  const noTz = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (noTz) return `${noTz[4]}:${noTz[5]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const s = String(dateStr).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

function statusLabel(status) {
  if (status === "late") return "Late";
  if (status === "on_time") return "On time";
  return status || "-";
}

function statusClass(status) {
  if (status === "late") return "att-badge att-badge-late";
  if (status === "on_time") return "att-badge att-badge-ok";
  return "att-badge";
}

function todayYmd() {
  return new Date().toISOString().split("T")[0];
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0];
}

function GpsStatus({ gps }) {
  if (gps.state === "idle") {
    return <span className="att-gps-hint">Location not acquired yet</span>;
  }
  if (gps.state === "loading") {
    return <span className="att-gps-hint">Acquiring location...</span>;
  }
  if (gps.state === "error") {
    return <span className="att-gps-hint att-gps-error">{gps.error}</span>;
  }
  if (gps.state === "ready") {
    const color = gps.accuracy <= GPS_ACCURACY_THRESHOLD ? "#22c55e" : "#f59e0b";
    return (
      <span className="att-gps-hint" style={{ color }}>
        Accuracy: ~{Math.round(gps.accuracy)} m
        {gps.accuracy > GPS_ACCURACY_THRESHOLD ? " (waiting...)" : " — ready"}
      </span>
    );
  }
  return null;
}

export default function StaffAttendancePanel({ onClose }) {
  const [today, setToday] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [gps, setGps] = useState({ state: "idle", lat: null, lng: null, accuracy: null, error: null });
  const watchIdRef = useRef(null);

  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [faceCaptureOpen, setFaceCaptureOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // "checkin" | "checkout"
  const pendingGpsRef = useRef(null);

  const loadToday = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [recRes, setRes] = await Promise.all([
        apiFetch("/api/staff-attendance/me/today"),
        apiFetch("/api/staff-attendance/settings")
      ]);
      const recData = await readApiResponseData(recRes);
      const setData = await readApiResponseData(setRes);
      setToday(recData?.record ?? null);
      setSettings(setData ?? null);
    } catch {
      setMessage("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/staff-attendance/me?from=${thirtyDaysAgo()}&to=${todayYmd()}`);
      const data = await readApiResponseData(res);
      setHistory(Array.isArray(data?.records) ? data.records : []);
    } catch {
      // non-critical
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadToday();
    void loadHistory();
    apiFetch("/api/staff-attendance/me/face")
      .then((res) => readApiResponseData(res))
      .then((data) => setFaceEnrolled(Boolean(data?.enrolled)))
      .catch(() => {});
  }, [loadToday, loadHistory]);

  const startGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGps({ state: "error", error: "Browser does not support geolocation." });
      return;
    }
    setGps({ state: "loading", lat: null, lng: null, accuracy: null, error: null });

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          state: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          error: null
        });
      },
      (err) => {
        const msg = err.code === 1
          ? "Location permission denied."
          : err.code === 3
            ? "Location acquisition timed out."
            : "Location error.";
        setGps({ state: "error", error: msg, lat: null, lng: null, accuracy: null });
      },
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 }
    );
  }, []);

  const stopGps = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGps({ state: "idle", lat: null, lng: null, accuracy: null, error: null });
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const gpsReady = gps.state === "ready" && gps.accuracy != null && gps.accuracy <= GPS_ACCURACY_THRESHOLD;

  async function submitCheckIn(faceDescriptor) {
    setSubmitting(true);
    setMessage("");
    try {
      const body = { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy };
      if (faceDescriptor) body.faceDescriptor = faceDescriptor;
      const res = await apiFetch("/api/staff-attendance/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await readApiResponseData(res);
      if (!res.ok) {
        setMessage(data?.message || "An error occurred.");
        return;
      }
      stopGps();
      setToday(data.record);
      setHistory((prev) => [data.record, ...prev.filter((r) => r.date !== data.record.date)]);
    } catch {
      setMessage("Failed to connect to server.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCheckIn() {
    if (!gpsReady) return;
    if (faceEnrolled) {
      pendingGpsRef.current = { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy };
      setPendingAction("checkin");
      setFaceCaptureOpen(true);
    } else {
      void submitCheckIn(null);
    }
  }

  async function submitCheckOut(faceDescriptor) {
    setSubmitting(true);
    setMessage("");
    try {
      const body = { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy };
      if (faceDescriptor) body.faceDescriptor = faceDescriptor;
      const res = await apiFetch("/api/staff-attendance/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await readApiResponseData(res);
      if (!res.ok) {
        setMessage(data?.message || "An error occurred.");
        return;
      }
      stopGps();
      setToday(data.record);
      setHistory((prev) => prev.map((r) => (r.date === data.record.date ? data.record : r)));
    } catch {
      setMessage("Failed to connect to server.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCheckOut() {
    if (!gpsReady) return;
    if (faceEnrolled) {
      pendingGpsRef.current = { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy };
      setPendingAction("checkout");
      setFaceCaptureOpen(true);
    } else {
      void submitCheckOut(null);
    }
  }

  function handleFaceCaptured(descriptor) {
    setFaceCaptureOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    if (action === "checkin") void submitCheckIn(descriptor);
    else if (action === "checkout") void submitCheckOut(descriptor);
  }

  function handleFaceCaptureClosed() {
    setFaceCaptureOpen(false);
    setPendingAction(null);
  }

  const canCheckIn = !today?.checkInAt;
  const canCheckOut = Boolean(today?.checkInAt) && !today?.checkOutAt;
  const gpsActive = gps.state !== "idle";

  return (
    <section id="staffAttendancePanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>Staff Attendance</h3>
        <button
          type="button"
          className="header-btn panel-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {loading
        ? <p className="att-msg">Loading...</p>
        : (
          <>
            <div className="att-today-card">
              <div className="att-today-row">
                <span className="att-today-label">Today</span>
                <span className="att-today-date">{formatDate(todayYmd())}</span>
              </div>

              {!today?.checkInAt && (
                <div className="att-today-status att-status-absent">Not checked in yet</div>
              )}
              {today?.checkInAt && (
                <div className="att-today-rows">
                  <div className="att-today-row">
                    <span className="att-today-label">Check In</span>
                    <span className="att-today-val">{formatTime(today.checkInAt)}</span>
                    <span className={statusClass(today.status)}>{statusLabel(today.status)}</span>
                  </div>
                  {today.checkOutAt && (
                    <div className="att-today-row">
                      <span className="att-today-label">Check Out</span>
                      <span className="att-today-val">{formatTime(today.checkOutAt)}</span>
                    </div>
                  )}
                  {!today.checkOutAt && (
                    <div className="att-today-row">
                      <span className="att-today-label">Check Out</span>
                      <span className="att-today-val att-today-pending">—</span>
                    </div>
                  )}
                </div>
              )}

              {settings && (
                <div className="att-settings-hint">
                  Work hours: {settings.workStart?.slice(0, 5)} – {settings.workEnd?.slice(0, 5)}
                  {settings.locationLat != null && (
                    <span> &nbsp;·&nbsp; Radius: {settings.locationRadiusMeters} m</span>
                  )}
                </div>
              )}
            </div>

            {(canCheckIn || canCheckOut) && (
              <div className="att-action-card">
                {!gpsActive && (
                  <button
                    type="button"
                    className="btn att-gps-btn"
                    onClick={startGps}
                  >
                    Get Location
                  </button>
                )}

                {gpsActive && <GpsStatus gps={gps} />}

                {gpsActive && (
                  <div className="att-btn-row">
                    {canCheckIn && (
                      <button
                        type="button"
                        className="btn att-checkin-btn"
                        disabled={!gpsReady || submitting}
                        onClick={handleCheckIn}
                      >
                        {submitting ? "Saving..." : "Check In"}
                      </button>
                    )}
                    {canCheckOut && (
                      <button
                        type="button"
                        className="btn att-checkout-btn"
                        disabled={!gpsReady || submitting}
                        onClick={handleCheckOut}
                      >
                        {submitting ? "Saving..." : "Check Out"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn att-cancel-btn"
                      disabled={submitting}
                      onClick={stopGps}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {message && <p className="att-msg att-msg-error">{message}</p>}
              </div>
            )}

            {today?.checkInAt && today?.checkOutAt && !message && (
              <p className="att-msg att-msg-done">Today's attendance has been fully recorded.</p>
            )}

            <div className="att-history">
              <h4 className="att-history-title">Last 30 days</h4>
              {historyLoading && <p className="att-msg">Loading...</p>}
              {!historyLoading && history.length === 0 && (
                <p className="att-msg">No records found.</p>
              )}
              {!historyLoading && history.length > 0 && (
                <div className="all-users-table-wrap">
                  <table className="all-users-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Check In</th>
                        <th>Check Out</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((rec) => (
                        <tr key={rec.id}>
                          <td>{formatDate(rec.date)}</td>
                          <td>{formatTime(rec.checkInAt)}</td>
                          <td>{formatTime(rec.checkOutAt)}</td>
                          <td><span className={statusClass(rec.status)}>{statusLabel(rec.status)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

      <FaceCapture
        isOpen={faceCaptureOpen}
        onClose={handleFaceCaptureClosed}
        onCapture={handleFaceCaptured}
        title={pendingAction === "checkout" ? "Face Verification — Check Out" : "Face Verification — Check In"}
      />
    </section>
  );
}
