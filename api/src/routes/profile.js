import { Router } from "express";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

const router = Router();

const pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DBNAME,
});

router.get("/", (req, res) => {
    const token = req.cookies?.crm_access_token;
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ message: "Invalid or expired token." });
    }

    const username = String(payload?.username || "").trim();
    if (!username) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    pool.query(
        "SELECT username, name, role, phone_number FROM users WHERE username = $1",
        [username]
    )
        .then(({ rows }) => {
            const user = rows[0];
            if (!user) {
                return res.status(404).json({ message: "User not found." });
            }

            return res.json({
                username: user.username,
                fullName: user.name,
                role: user.role,
                phone: user.phone_number
            });
        })
        .catch((error) => {
            console.error("Error fetching profile:", error);
            return res.status(500).json({ message: "Internal server error." });
        });
});

export default router;
