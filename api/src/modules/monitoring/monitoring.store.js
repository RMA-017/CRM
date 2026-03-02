// In-memory request metrics store (resets on server restart)

// ── Active user activity (15-minute window) ──────────────────────────────────
const ACTIVITY_TTL_MS = 15 * 60 * 1000;
const userActivity = new Map(); // userId → { username, fullName, method, route, ip, lastSeen }

export function trackUserActivity({ userId, username, fullName, method, route, ip }) {
  userActivity.set(userId, {
    username: String(username || ""),
    fullName: String(fullName || ""),
    method: String(method || "").toUpperCase(),
    route: String(route || ""),
    ip: String(ip || ""),
    lastSeen: Date.now()
  });
}

export function getActiveUsers() {
  const cutoff = Date.now() - ACTIVITY_TTL_MS;
  const result = [];
  for (const [userId, entry] of userActivity) {
    if (entry.lastSeen >= cutoff) {
      result.push({ userId, ...entry });
    } else {
      userActivity.delete(userId);
    }
  }
  return result.sort((a, b) => b.lastSeen - a.lastSeen);
}

// ── Request metrics ───────────────────────────────────────────────────────────
const MAX_RECORDS = 1000;
const records = [];
let totalCount = 0;
let errorCount = 0;

export function recordRequest({ method, route, statusCode, responseTimeMs }) {
  totalCount += 1;
  if (statusCode >= 400) {
    errorCount += 1;
  }
  if (records.length >= MAX_RECORDS) {
    records.shift();
  }
  records.push({
    method: String(method || "").toUpperCase(),
    route: String(route || "unknown"),
    statusCode,
    responseTimeMs,
    ts: Date.now()
  });
}

export function getRequestStats() {
  const routeMap = new Map();

  for (const r of records) {
    const key = `${r.method} ${r.route}`;
    const entry = routeMap.get(key);
    if (!entry) {
      routeMap.set(key, {
        method: r.method,
        route: r.route,
        count: 1,
        totalMs: r.responseTimeMs,
        maxMs: r.responseTimeMs
      });
    } else {
      entry.count += 1;
      entry.totalMs += r.responseTimeMs;
      entry.maxMs = Math.max(entry.maxMs, r.responseTimeMs);
    }
  }

  const slowRoutes = Array.from(routeMap.values())
    .map((r) => ({
      method: r.method,
      route: r.route,
      count: r.count,
      avgMs: Math.round(r.totalMs / r.count),
      maxMs: r.maxMs
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 10);

  return {
    total: totalCount,
    errors: errorCount,
    errorRate: totalCount > 0 ? Math.round((errorCount / totalCount) * 100) : 0,
    slowRoutes
  };
}
