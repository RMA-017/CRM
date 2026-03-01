import { defineConfig } from "vite";

export default defineConfig({
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
