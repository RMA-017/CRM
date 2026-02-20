import { appConfig } from "./config/app-config.js";
import { buildApp } from "./app.js";

const app = await buildApp();

try {
  await app.listen({ port: appConfig.port, host: "0.0.0.0" });
  console.log(`Server is running on port ${appConfig.port}`);
} catch (error) {
  app.log.error(error);
  console.error("Failed to start server:", error);
  process.exit(1);
}
