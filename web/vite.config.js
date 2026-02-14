import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "crm-route-rewrite",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const rawUrl = req.url || "";
          const pathname = rawUrl.split("?")[0];

          if (pathname.startsWith("/src/html/")) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Not Found");
            return;
          }

          if (pathname === "/admin-create") {
            req.url = "/src/html/admin-create.html";
            return next();
          }

          if (pathname === "/login") {
            req.url = "/src/html/login.html";
            return next();
          }

          const acceptsHtml = String(req.headers.accept || "").includes("text/html");
          const isHtmlRequest = req.method === "GET" && acceptsHtml;
          const allowedRoutes = new Set(["/", "/home", "/admin-create", "/login"]);

          if (isHtmlRequest && !allowedRoutes.has(pathname)) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Not Found");
            return;
          }

          next();
        });
      }
    }
  ]
});
