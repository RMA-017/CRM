const { existsSync } = require("node:fs");

const instances = String(process.env.PM2_INSTANCES || "1").trim() || "1";
const useCluster = instances !== "1";
const envFile = process.env.CRM_ENV_FILE
  || (existsSync(".env.production.local") ? ".env.production.local" : ".env");
const listenTimeout = Number.parseInt(String(process.env.PM2_LISTEN_TIMEOUT || "15000"), 10) || 15000;
const killTimeout = Number.parseInt(String(process.env.PM2_KILL_TIMEOUT || "15000"), 10) || 15000;
const restartDelay = Number.parseInt(String(process.env.PM2_RESTART_DELAY || "5000"), 10) || 5000;
const maxRestarts = Number.parseInt(String(process.env.PM2_MAX_RESTARTS || "10"), 10) || 10;

module.exports = {
  apps: [
    {
      name: "crm-api",
      script: "src/index.js",
      node_args: `--env-file=${envFile}`,
      exec_mode: useCluster ? "cluster" : "fork",
      instances: useCluster ? instances : 1,
      watch: false,
      autorestart: true,
      wait_ready: true,
      listen_timeout: listenTimeout,
      kill_timeout: Math.max(killTimeout, listenTimeout),
      restart_delay: restartDelay,
      exp_backoff_restart_delay: 100,
      max_restarts: maxRestarts,
      min_uptime: "10s",
      merge_logs: true,
      max_memory_restart: process.env.PM2_MAX_MEMORY || "400M",
      time: true,
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production",
        TRUST_PROXY: process.env.TRUST_PROXY || "true",
        COOKIE_SECURE: process.env.COOKIE_SECURE || "true",
        BROWSER_ORIGIN_CHECK_ENABLED: process.env.BROWSER_ORIGIN_CHECK_ENABLED || "true"
      }
    }
  ]
};
