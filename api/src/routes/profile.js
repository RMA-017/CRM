import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { Pool } from "pg";

const router = Router();

const pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DBNAME,
});

function getTokenPayload(req, res) {
    const token = req.cookies?.crm_access_token;
    if (!token) {
        res.status(401).json({ message: "Unauthorized" });
        return null;
    }

    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        res.status(401).json({ message: "Invalid or expired token." });
        return null;
    }
}

router.get("/", (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const payload = getTokenPayload(req, res);
    if (!payload) {
        return;
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

router.get("/all", async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const payload = getTokenPayload(req, res);
    if (!payload) {
        return;
    }

    const username = String(payload?.username || "").trim();
    if (!username) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    try {
        const requester = await pool.query(
            "SELECT role FROM users WHERE username = $1",
            [username]
        );

        if (!requester.rows[0]) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const requesterRole = String(requester.rows[0].role || "").toLowerCase();
        if (requesterRole !== "admin") {
            return res.status(403).json({ message: "Forbidden" });
        }

        const { rows } = await pool.query(
            "SELECT id::text AS id, username, email, full_name, birthday, phone_number, position, role, created_at FROM users ORDER BY created_at DESC"
        );

        const users = rows.map((user) => ({
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            birthday: user.birthday,
            role: user.role,
            phone: user.phone_number,
            position: user.position,
            createdAt: user.created_at
        }));

        return res.json({ users });
    } catch (error) {
        console.error("Error fetching all users:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
});

router.patch("/", async (req, res) => {
    const payload = getTokenPayload(req, res);
    if (!payload) {
        return;
    }

    const username = String(payload?.username || "").trim();
    if (!username) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const field = String(req.body?.field || "").trim();
    const rawValue = req.body?.value;

    const allowedFields = new Set(["email", "fullName", "birthday", "password", "phone", "position"]);
    if (!allowedFields.has(field)) {
        return res.status(400).json({ message: "Invalid field." });
    }

    let sql = "";
    let values = [];

    if (field === "password") {
        const password = String(rawValue || "");
        if (password.length < 6) {
            return res.status(400).json({ field: "password", message: "Password must be at least 6 characters." });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        sql = "UPDATE users SET password_hash = $1 WHERE username = $2";
        values = [passwordHash, username];
    } else if (field === "email") {
        const email = String(rawValue || "").trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ field: "email", message: "Invalid email format." });
        }
        sql = "UPDATE users SET email = $1 WHERE username = $2";
        values = [email || null, username];
    } else if (field === "fullName") {
        const fullName = String(rawValue || "").trim();
        if (!fullName) {
            return res.status(400).json({ field: "fullName", message: "Full name is required." });
        }
        sql = "UPDATE users SET full_name = $1 WHERE username = $2";
        values = [fullName, username];
    } else if (field === "birthday") {
        const birthday = String(rawValue || "").trim();
        if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
            return res.status(400).json({ field: "birthday", message: "Invalid birthday format." });
        }
        sql = "UPDATE users SET birthday = $1 WHERE username = $2";
        values = [birthday || null, username];
    } else if (field === "phone") {
        const phone = String(rawValue || "").trim();
        if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
            return res.status(400).json({ field: "phone", message: "Invalid phone number." });
        }
        sql = "UPDATE users SET phone_number = $1 WHERE username = $2";
        values = [phone || null, username];
    } else if (field === "position") {
        const position = String(rawValue || "").trim();
        sql = "UPDATE users SET position = $1 WHERE username = $2";
        values = [position || null, username];
    }

    try {
        const updateResult = await pool.query(sql, values);
        if (updateResult.rowCount === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        const { rows } = await pool.query(
            "SELECT username, email, full_name, birthday, role, phone_number, position FROM users WHERE username = $1",
            [username]
        );

        const user = rows[0];
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        return res.json({
            message: "Profile updated.",
            profile: {
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                birthday: user.birthday,
                role: user.role,
                phone: user.phone_number,
                position: user.position
            }
        });
    } catch (error) {
        if (error?.code === "23505" && field === "email") {
            return res.status(409).json({ field: "email", message: "Email already exists." });
        }
        console.error("Error updating profile:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
});

router.patch("/users/:id", async (req, res) => {
    const payload = getTokenPayload(req, res);
    if (!payload) {
        return;
    }

    const requesterUsername = String(payload?.username || "").trim();
    if (!requesterUsername) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = Number(req.params?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: "Invalid user id." });
    }

    const username = String(req.body?.username || "").trim();
    const email = String(req.body?.email || "").trim();
    const fullName = String(req.body?.fullName || "").trim();
    const birthday = String(req.body?.birthday || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const position = String(req.body?.position || "").trim();
    const role = String(req.body?.role || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const allowedRoles = new Set(["admin", "tutor", "educator", "specialist", "manager", "finance"]);
    const usernameRegex = /^[a-zA-Z0-9._-]{3,30}$/;

    const errors = {};
    if (!usernameRegex.test(username)) {
        errors.username = "Username must be 3-30 chars and contain letters, numbers, ., _, -";
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = "Invalid email format.";
    }
    if (!fullName) {
        errors.fullName = "Full name is required.";
    }
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
        errors.birthday = "Invalid birthday format.";
    }
    if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
        errors.phone = "Invalid phone number.";
    }
    if (!allowedRoles.has(role)) {
        errors.role = "Invalid role.";
    }
    if (password && password.length < 6) {
        errors.password = "Password must be at least 6 characters.";
    }

    if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
    }

    let client = null;
    try {
        client = await pool.connect();

        const requesterResult = await client.query(
            "SELECT role FROM users WHERE username = $1",
            [requesterUsername]
        );
        const requester = requesterResult.rows[0];
        if (!requester || String(requester.role || "").toLowerCase() !== "admin") {
            return res.status(403).json({ message: "Only admin can edit users." });
        }

        await client.query("BEGIN");

        await client.query(
            "UPDATE users SET username = $1, email = $2, full_name = $3, birthday = $4, phone_number = $5, position = $6, role = $7 WHERE id = $8",
            [username, email || null, fullName, birthday || null, phone || null, position || null, role, userId]
        );

        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            await client.query(
                "UPDATE users SET password_hash = $1 WHERE id = $2",
                [passwordHash, userId]
            );
        }

        const { rows } = await client.query(
            "SELECT id::text AS id, username, email, full_name, birthday, role, phone_number, position, created_at FROM users WHERE id = $1",
            [userId]
        );

        const user = rows[0];
        if (!user) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "User not found." });
        }

        await client.query("COMMIT");

        return res.json({
            message: "User updated successfully.",
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                birthday: user.birthday,
                role: user.role,
                phone: user.phone_number,
                position: user.position,
                createdAt: user.created_at
            }
        });
    } catch (error) {
        if (client) {
            await client.query("ROLLBACK").catch(() => {});
        }
        if (error?.code === "23505") {
            return res.status(409).json({ message: "Username or email already exists." });
        }
        console.error("Error updating user:", error);
        return res.status(500).json({ message: "Internal server error." });
    } finally {
        if (client) {
            client.release();
        }
    }
});

router.delete("/users/:id", async (req, res) => {
    const payload = getTokenPayload(req, res);
    if (!payload) {
        return;
    }

    const requesterUsername = String(payload?.username || "").trim();
    if (!requesterUsername) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = Number(req.params?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: "Invalid user id." });
    }

    try {
        const requesterResult = await pool.query(
            "SELECT id, role FROM users WHERE username = $1",
            [requesterUsername]
        );
        const requester = requesterResult.rows[0];
        if (!requester || String(requester.role || "").toLowerCase() !== "admin") {
            return res.status(403).json({ message: "Only admin can delete users." });
        }

        // Avoid deleting currently logged-in admin account by mistake.
        if (Number(requester.id) === userId) {
            return res.status(400).json({ message: "You cannot delete your own account." });
        }

        const deleteResult = await pool.query("DELETE FROM users WHERE id = $1", [userId]);
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        return res.json({ message: "User deleted successfully." });
    } catch (error) {
        console.error("Error deleting user:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
});

export default router;
