import { processPendingOutboxEvents, pruneProcessedOutboxEvents } from "./notifications.service.js";

function toPositiveNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toNonNegativeNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function toBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function createOutboxWorker(options = {}) {
  const {
    enabled = true,
    pollIntervalMs = 5000,
    processLimit = 100,
    retryDelaySeconds = 30,
    retentionDays = 30,
    retentionLimit = 500,
    retentionEveryCycles = 120,
    processor = null,
    logger = null
  } = options;

  const config = {
    enabled: toBoolean(enabled, true),
    pollIntervalMs: toPositiveNumber(pollIntervalMs, 5000),
    processLimit: toPositiveNumber(processLimit, 100),
    retryDelaySeconds: toPositiveNumber(retryDelaySeconds, 30),
    retentionDays: toNonNegativeNumber(retentionDays, 30),
    retentionLimit: toPositiveNumber(retentionLimit, 500),
    retentionEveryCycles: toPositiveNumber(retentionEveryCycles, 120)
  };

  let timer = null;
  let cycleCount = 0;
  let currentRun = Promise.resolve();
  let isProcessing = false;

  async function runCycle() {
    if (isProcessing) {
      return currentRun;
    }

    currentRun = (async () => {
      isProcessing = true;
      try {
        const processed = await processPendingOutboxEvents({
          limit: config.processLimit,
          retryDelaySeconds: config.retryDelaySeconds,
          processor
        });

        cycleCount += 1;

        let pruned = { deletedCount: 0 };
        const shouldRunRetention = config.retentionDays > 0
          && cycleCount % config.retentionEveryCycles === 0;
        if (shouldRunRetention) {
          pruned = await pruneProcessedOutboxEvents({
            retentionDays: config.retentionDays,
            limit: config.retentionLimit
          });
        }

        const processedCount = Number(processed?.processedCount || 0);
        const requeuedCount = Number(processed?.requeuedCount || 0);
        const failedCount = Number(processed?.failedCount || 0);
        const deletedCount = Number(pruned?.deletedCount || 0);

        if (processedCount > 0 || requeuedCount > 0 || failedCount > 0 || deletedCount > 0) {
          logger?.info?.({
            processedCount,
            requeuedCount,
            failedCount,
            deletedCount
          }, "Outbox worker cycle completed");
        }
      } catch (error) {
        logger?.error?.({ err: error }, "Outbox worker cycle failed");
      } finally {
        isProcessing = false;
      }
    })();

    return currentRun;
  }

  function start() {
    if (!config.enabled || timer) {
      return false;
    }

    void runCycle();
    timer = setInterval(() => {
      void runCycle();
    }, config.pollIntervalMs);
    timer.unref?.();
    return true;
  }

  async function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    await currentRun.catch(() => {});
  }

  return {
    start,
    stop,
    runCycle,
    isRunning() {
      return Boolean(timer);
    }
  };
}

