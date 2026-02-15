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
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

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
        "SELECT username, email, full_name, birthday, role, phone_number, position FROM users WHERE username = $1",
        [username]
    )
        .then(({ rows }) => {
            const user = rows[0];
            if (!user) {
                res.clearCookie("crm_access_token", {
                    httpOnly: true,
                    path: "/",
                    sameSite: "lax",
                    secure: false
                });
                return res.status(401).json({ message: "Unauthorized" });
            }

            return res.json({
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                birthday: user.birthday,
                role: user.role,
                phone: user.phone_number,
                position: user.position
            });
        })
        .catch((error) => {
            console.error("Error fetching profile:", error);
            return res.status(500).json({ message: "Internal server error." });
        });
});

export default router;
