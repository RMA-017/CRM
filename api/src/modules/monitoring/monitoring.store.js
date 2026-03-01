// In-memory request metrics store (resets on server restart)

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
