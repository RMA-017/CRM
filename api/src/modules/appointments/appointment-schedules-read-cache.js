import { toBoundedInteger } from "../../lib/bounded-integer.js";
import { createTtlCache } from "../../lib/ttl-cache.js";

export const schedulesReadCache = createTtlCache({
  maxEntries: toBoundedInteger(process.env.APPOINTMENT_SCHEDULES_CACHE_MAX, 5000, 100, 50_000),
  defaultTtlMs: toBoundedInteger(process.env.APPOINTMENT_SCHEDULES_CACHE_TTL_MS, 5000, 500, 60_000)
});

export function clearAppointmentSchedulesReadCache() {
  schedulesReadCache.clear();
}
