import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("react-router-dom") || id.includes("react-router")) {
            return "vendor-router";
          }

          if (
            id.includes("react-dom") ||
            id.includes("scheduler") ||
            id.includes(`${String.raw`node_modules/react/`}`)
          ) {
            return "vendor-react";
          }

          if (id.includes("face-api.js")) {
            return "vendor-face-api";
          }

          return "vendor";
        }
      }
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3003",
        changeOrigin: true
      },
      "/health": {
        target: "http://localhost:3003",
        changeOrigin: true
      },
      "/ready": {
        target: "http://localhost:3003",
        changeOrigin: true
      }
    }
  }
});
