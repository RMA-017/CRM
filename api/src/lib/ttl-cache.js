function toBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function createTtlCache({
  maxEntries = 500,
  defaultTtlMs = 10_000
} = {}) {
  const normalizedMaxEntries = toBoundedInteger(maxEntries, 500, 1, 50_000);
  const normalizedDefaultTtlMs = toBoundedInteger(defaultTtlMs, 10_000, 250, 24 * 60 * 60 * 1000);
  const store = new Map();

  function deleteExpired(nowMs = Date.now()) {
    if (store.size === 0) {
      return;
    }
    for (const [key, entry] of store.entries()) {
      if (!entry || entry.expiresAt <= nowMs) {
        store.delete(key);
      }
    }
  }

  function trimIfNeeded() {
    if (store.size <= normalizedMaxEntries) {
      return;
    }
    const excess = store.size - normalizedMaxEntries;
    const keysToDrop = [];
    let dropped = 0;
    for (const key of store.keys()) {
      keysToDrop.push(key);
      dropped += 1;
      if (dropped >= excess) {
        break;
      }
    }
    keysToDrop.forEach((key) => store.delete(key));
  }

  return {
    get(key) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) {
        return undefined;
      }

      const nowMs = Date.now();
      const entry = store.get(normalizedKey);
      if (!entry) {
        deleteExpired(nowMs);
        return undefined;
      }

      if (entry.expiresAt <= nowMs) {
        store.delete(normalizedKey);
        deleteExpired(nowMs);
        return undefined;
      }

      // Refresh insertion order for simple LRU behavior.
      store.delete(normalizedKey);
      store.set(normalizedKey, entry);
      return entry.value;
    },
    set(key, value, ttlMs = normalizedDefaultTtlMs) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) {
        return;
      }

      const normalizedTtlMs = toBoundedInteger(ttlMs, normalizedDefaultTtlMs, 250, 24 * 60 * 60 * 1000);
      const nowMs = Date.now();
      deleteExpired(nowMs);
      store.set(normalizedKey, {
        value,
        expiresAt: nowMs + normalizedTtlMs
      });
      trimIfNeeded();
    },
    delete(key) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) {
        return;
      }
      store.delete(normalizedKey);
    },
    clear() {
      store.clear();
    },
    size() {
      deleteExpired(Date.now());
      return store.size;
    }
  };
}

