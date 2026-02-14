import { Router } from "express";
import bcrypt from "bcrypt";
import { Pool } from "pg"

const router = Router();

const PHONE_REGEX = /^[+]?[0-9\s\-()]{7,20}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;
const ALLOWED_ROLES = new Set([
  "admin",
  "tutor",
  "educator",
  "specialist",
  "manager",
  "finance"
]);

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DBNAME,
});

router.post("/", async (req, res) => {

  const username = String(req.body?.username || "").trim();
  const fullName = String(req.body?.fullName || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "").trim().toLowerCase();

  const errors = {};

  if (!USERNAME_REGEX.test(username)) {
    errors.username = "Username must be 3-30 chars and contain letters, numbers, ., _, -";
  }

  if (!fullName) {
    errors.fullName = "Full name is required.";
  }

  if (!PHONE_REGEX.test(phone)) {
    errors.phone = "Invalid phone number format.";
  }

  if (password.length < 6) {
    errors.password = "Password must be at least 6 characters long.";
  }

  if (!role) {
    errors.role = "Role is required.";
  } else if (!ALLOWED_ROLES.has(role)) {
    errors.role = "Invalid role.";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const sql = {
    text: "INSERT INTO users (username, name, phone_number, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, phone_number, role",
    values: [username, fullName, phone, passwordHash, role]
  };

  let client = null;
  let createdUser = null;

  try {
    client = await pool.connect();
    const { rows } = await client.query(sql);
    createdUser = rows[0];
  }
  catch (error) {
    console.error("Error executing SQL:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
  finally {
    if (client) {
      client.release();
    }
  }

  return res.status(201).json({
    message: "Successfully registered.",
    user: createdUser
  });
});

export default router;
