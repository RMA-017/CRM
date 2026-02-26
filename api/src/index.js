import { appConfig } from "./config/app-config.js";
import pool from "./config/db.js";
import { buildApp } from "./app.js";

let isShuttingDown = false;
let app = null;

function toError(reason) {
  if (reason instanceof Error) {
    return reason;
  }
  const fallback = typeof reason === "string"
    ? reason
    : `Unhandled rejection: ${String(reason)}`;
  return new Error(fallback);
}

async function shutdown({
  signal = "shutdown",
  error = null
} = {}) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  const exitCode = error ? 1 : 0;
  const timeoutMs = appConfig.gracefulShutdownTimeoutMs;
  const forceExitTimer = setTimeout(() => {
    if (app?.log) {
      app.log.error(
        { signal, timeoutMs },
        "Graceful shutdown timeout reached. Forcing process exit."
      );
    } else {
      console.error(`[shutdown] timeout reached (${signal}). Forcing process exit.`);
    }
    process.exit(1);
  }, timeoutMs);
  forceExitTimer.unref?.();

  try {
    if (error) {
      if (app?.log) {
        app.log.error({ err: error, signal }, "Shutdown triggered by runtime error");
      } else {
        console.error(`[shutdown] triggered by runtime error (${signal}):`, error);
      }
    } else {
      if (app?.log) {
        app.log.info({ signal }, "Graceful shutdown requested");
      } else {
        console.log(`[shutdown] requested (${signal})`);
      }
    }

    if (app) {
      await app.close();
    }
    await pool.end().catch(() => {});
    if (app?.log) {
      app.log.info({ signal }, "Graceful shutdown completed");
    } else {
      console.log(`[shutdown] completed (${signal})`);
    }
  } catch (shutdownError) {
    if (app?.log) {
      app.log.error({ err: shutdownError, signal }, "Graceful shutdown failed");
    } else {
      console.error(`[shutdown] failed (${signal}):`, shutdownError);
    }
    clearTimeout(forceExitTimer);
    process.exit(1);
    return;
  }

  clearTimeout(forceExitTimer);
  process.exit(exitCode);
}

process.once("SIGINT", () => {
  void shutdown({ signal: "SIGINT" });
});

process.once("SIGTERM", () => {
  void shutdown({ signal: "SIGTERM" });
});

process.once("uncaughtException", (error) => {
  void shutdown({ signal: "uncaughtException", error });
});

process.once("unhandledRejection", (reason) => {
  void shutdown({ signal: "unhandledRejection", error: toError(reason) });
});

try {
  app = await buildApp();
  await app.listen({ port: appConfig.port, host: "0.0.0.0" });
  app.log.info({ port: appConfig.port }, "Server is running");
} catch (error) {
  await shutdown({ signal: "startup-failure", error: toError(error) });
}
