import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DBNAME,
});
const router = Router();

router.post("/", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!username) {
    return res.status(400).json({
      field: "username",
      message: "Username is required."
    });
  }

  if (!password) {
    return res.status(400).json({
      field: "password",
      message: "Password is required."
    });
  }

  let client = null;
  let user = null;

  try {
    client = await pool.connect();
    const { rows } = await client.query(
      "SELECT username, password_hash FROM users WHERE username = $1",
      [username]
    );
    user = rows[0];
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

  if (!user) {
    return res.status(401).json({
      message: "Invalid username or password."
    });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    return res.status(401).json({
      field: "password",
      message: "Password is incorrect."
    });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });

  res.cookie("crm_access_token", token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7
  });

  return res.json({
    message: "Successful",
    user: {
      username: user.username
    }
  });
});

router.post("/logout", (req, res) => {
  res.clearCookie("crm_access_token", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: false
  });

  return res.json({ message: "Logged out." });
});

export default router;
