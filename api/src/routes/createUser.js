import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

const router = Router();

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;
const ALLOWED_ROLES = new Set([
  "admin",
  "tutor",
  "educator",
  "specialist",
  "manager",
  "finance"
]);
const DEFAULT_CREATED_USER_PASSWORD = process.env.DEFAULT_CREATED_USER_PASSWORD || "aaron2021";

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DBNAME,
});

router.post("/", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const fullName = String(req.body?.fullName || req.body?.full_name || "").trim();
  const role = String(req.body?.role || "").trim().toLowerCase();

  const token = req.cookies?.crm_access_token;
  if (!token) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  let payload = null;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }

  const actorUsername = String(payload?.username || "").trim();
  if (!actorUsername) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  const errors = {};

  if (!USERNAME_REGEX.test(username)) {
    errors.username = "Username must be 3-30 chars and contain letters, numbers, ., _, -";
  }

  if (!fullName) {
    errors.fullName = "Full name is required.";
  }

  if (!role) {
    errors.role = "Role is required.";
  } else if (!ALLOWED_ROLES.has(role)) {
    errors.role = "Invalid role.";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  let client = null;
  let createdUser = null;

  try {
    client = await pool.connect();

    const actorResult = await client.query(
      "SELECT role FROM users WHERE username = $1",
      [actorUsername]
    );

    const actor = actorResult.rows[0];
    if (!actor) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (String(actor.role || "").toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Only admin can create users." });
    }

    // Frontend currently sends username/fullName/role only.
    // Keep DB constraints satisfied until full profile flow is implemented.

    const temporaryPassword = DEFAULT_CREATED_USER_PASSWORD;
    const password_hash = await bcrypt.hash(temporaryPassword, 10);

    const sql = {
      text: "INSERT INTO users (username, email, full_name, birthday, password_hash, phone_number, position, role) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username, email, full_name, birthday, phone_number, position, role",
      values: [username, null, fullName, null, password_hash, null, null, role]
    };

    const { rows } = await client.query(sql);
    createdUser = rows[0];
  }
  catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({
        field: "username",
        message: "Username already exists."
      });
    }
    console.error("Error executing SQL:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
  finally {
    if (client) {
      client.release();
    }
  }

  return res.status(201).json({
    message: "User successfully created.",
    user: createdUser
  });
});

export default router;
