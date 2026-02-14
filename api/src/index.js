import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import authRouter from "./routes/login.js";
import adminRouter from "./routes/admin-create.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webRoot = path.resolve(__dirname, "../../web");
const webPublic = path.join(webRoot, "public");
const webCss = path.join(webRoot, "src", "css");
const webJs = path.join(webRoot, "src", "js");
const allowedOrigin = process.env.WEB_ORIGIN || "http://localhost:5173";

const corsOptions = {
    origin: allowedOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
};


////// MIDDLEWARE settings
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(webPublic));
app.use("/src/css", express.static(webCss));
app.use("/src/js", express.static(webJs));
app.use("/api/login", authRouter);
app.use("/api/admin-create", adminRouter);



////// GET
app.get(["/", "/home"], (req, res) => {
    res.sendFile(path.join(webRoot, "index.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(webRoot, "src", "html", "login.html"));
});

app.get("/admin-create", (req, res) => {
    res.sendFile(path.join(webRoot, "src", "html", "admin-create.html"));
});

app.use((req, res) => {
    res.status(404).send("Not Found");
});



////// PORT
const port = process.env.PORT || 3003;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
