import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

import loginRouter from "./routes/login.js";
import adminRouter from "./routes/createUser.js";
import profileRouter from "./routes/profile.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webRoot = path.resolve(__dirname, "../../web");
const webPublic = path.join(webRoot, "public");
const webCss = path.join(webRoot, "src", "css");
const webJs = path.join(webRoot, "src", "js");
const allowedOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";
const trustProxy = String(process.env.TRUST_PROXY || "").toLowerCase();

const apiRateLimiter = rateLimit({
  windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  limit: Number(process.env.API_RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." }
});

const loginRateLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  limit: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." }
});

const corsOptions = {
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

if (trustProxy === "1" || trustProxy === "true") {
  app.set("trust proxy", 1);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(webPublic));
app.use("/src/css", express.static(webCss));
app.use("/src/js", express.static(webJs));

app.get("/", (req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

app.get("/profile", (req, res) => {
  const token = req.cookies?.crm_access_token;
  if (!token) {
    return res.redirect("/");
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.redirect("/");
  }

  return res.sendFile(path.join(webRoot, "src", "html", "profile.html"));
});

app.use("/api", apiRateLimiter);
app.use("/api/login", loginRateLimiter, loginRouter);
app.use("/api/admin-create", adminRouter);
app.use("/api/profile", profileRouter);

app.use((req, res) => {
  res.status(404).send("Not Found");
});


const port = process.env.PORT || 3003;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
