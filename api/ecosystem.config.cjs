module.exports = {
  apps: [
    {
      name: "crm-api",
      script: "src/index.js",
      node_args: "--env-file=.env",
      exec_mode: "cluster",
      instances: process.env.PM2_INSTANCES || "max",
      watch: false,
      max_memory_restart: process.env.PM2_MAX_MEMORY || "400M",
      time: true,
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};
