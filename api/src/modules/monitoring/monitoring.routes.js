import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../../config/db.js";
import { setNoCacheHeaders } from "../../lib/http.js";
import { findSettingsRequester } from "../settings/settings.service.js";
import { getActiveUsers, getRequestStats } from "./monitoring.store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE_PATH = resolve(__dirname, "../../../logs/errors.log");
const MAX_LOG_ERRORS = 30;

async function readRecentErrors() {
  try {
    const content = await readFile(LOG_FILE_PATH, "utf8");
    const lines = content.split("\n").filter((line) => line.trim());
    const lastLines = lines.slice(-MAX_LOG_ERRORS);
    return lastLines
      .map((line) => {
        try {
          const parsed = JSON.parse(line);
          return {
            timestamp: parsed.timestamp || null,
            level: parsed.level || "error",
            message: String(parsed.message || "").slice(0, 200),
            payload: parsed.payload
              ? {
                  errMessage: String(parsed.payload?.err?.message || "").slice(0, 200) || undefined,
                  errName: parsed.payload?.err?.name || undefined
                }
              : undefined
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse(); // newest first
  } catch {
    return [];
  }
}

async function monitoringRoutes(fastify) {
  fastify.get(
    "/health",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = request.authContext;

      try {
        const requester = await findSettingsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!requester.is_platform_admin) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        let dbStatus = "up";
        try {
          await pool.query("SELECT 1");
        } catch {
          dbStatus = "down";
        }

        const mem = process.memoryUsage();
        const uptimeSeconds = Math.floor(process.uptime());

        const [recentErrors, requestStats] = await Promise.all([
          readRecentErrors(),
          Promise.resolve(getRequestStats())
        ]);
        const activeUsers = getActiveUsers();

        return reply.send({
          uptime: {
            seconds: uptimeSeconds,
            days: Math.floor(uptimeSeconds / 86400),
            hours: Math.floor((uptimeSeconds % 86400) / 3600),
            minutes: Math.floor((uptimeSeconds % 3600) / 60)
          },
          memory: {
            heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
            rssMb: Math.round(mem.rss / 1024 / 1024)
          },
          db: dbStatus,
          nodeVersion: process.version,
          timestamp: new Date().toISOString(),
          requests: requestStats,
          recentErrors,
          activeUsers
        });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching monitoring health");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default monitoringRoutes;
