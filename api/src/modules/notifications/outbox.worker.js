import { processPendingOutboxEvents, pruneProcessedOutboxEvents, pruneUserNotifications } from "./notifications.service.js";

export function createOutboxWorker(options = {}) {
  const config = {
    enabled:                         options.enabled ?? true,
    pollIntervalMs:                  options.pollIntervalMs ?? 5000,
    processLimit:                    options.processLimit ?? 100,
    retryDelaySeconds:               options.retryDelaySeconds ?? 30,
    retentionDays:                   options.retentionDays ?? 30,
    retentionLimit:                  options.retentionLimit ?? 500,
    retentionEveryCycles:            options.retentionEveryCycles ?? 120,
    userNotificationsRetentionDays:  options.userNotificationsRetentionDays ?? 0,
    userNotificationsRetentionLimit: options.userNotificationsRetentionLimit ?? 500
  };
  const processor = options.processor ?? null;
  const logger = options.logger ?? null;

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
        let notificationsPruned = { deletedCount: 0 };
        if (cycleCount % config.retentionEveryCycles === 0) {
          [pruned, notificationsPruned] = await Promise.all([
            pruneProcessedOutboxEvents({
              retentionDays: config.retentionDays,
              limit: config.retentionLimit
            }),
            pruneUserNotifications({
              retentionDays: config.userNotificationsRetentionDays,
              limit: config.userNotificationsRetentionLimit
            })
          ]);
        }

        const processedCount = Number(processed?.processedCount || 0);
        const requeuedCount = Number(processed?.requeuedCount || 0);
        const failedCount = Number(processed?.failedCount || 0);
        const deletedCount = Number(pruned?.deletedCount || 0);
        const notificationsDeletedCount = Number(notificationsPruned?.deletedCount || 0);

        if (processedCount > 0 || requeuedCount > 0 || failedCount > 0 || deletedCount > 0 || notificationsDeletedCount > 0) {
          logger?.info?.({
            processedCount,
            requeuedCount,
            failedCount,
            deletedCount,
            notificationsDeletedCount
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
