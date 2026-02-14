import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";

const router = Router();

const DEMO_USERNAME = process.env.DEMO_USERNAME || "admin";
const DEMO_PASSWORD_HASH =
  process.env.DEMO_PASSWORD_HASH || bcrypt.hashSync("admin123", 10);

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

  if (username !== DEMO_USERNAME) {
    return res.status(401).json({
      field: "password",
      message: "Invalid username or password."
    });
  }

  const isPasswordValid = await bcrypt.compare(password, DEMO_PASSWORD_HASH);
  if (!isPasswordValid) {
    return res.status(401).json({
      field: "password",
      message: "Invalid username or password."
    });
  }

  const token = crypto.randomBytes(24).toString("hex");
  res.cookie("crm_access_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24
  });

  return res.json({
    message: "Login successful.",
    token,
    user: {
      username: DEMO_USERNAME
    }
  });
});

export default router;
