import jwt from "jsonwebtoken";
import { appConfig } from "../config/app-config.js";
import { AUTH_COOKIE_NAME } from "./cookies.js";

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function signAccessToken({ userId, organizationId, organizationCode, username }) {
  return jwt.sign({
    userId,
    organizationId,
    organizationCode,
    username
  }, appConfig.jwtSecret, {
    expiresIn: "7d"
  });
}

export function getAuthPayload(request, reply) {
  const token = request.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    reply.status(401).send({ message: "Unauthorized" });
    return null;
  }

  try {
    return jwt.verify(token, appConfig.jwtSecret);
  } catch {
    reply.status(401).send({ message: "Invalid or expired token." });
    return null;
  }
}

export function getAuthContext(request, reply) {
  const payload = getAuthPayload(request, reply);
  if (!payload) {
    return null;
  }

  const userId = normalizePositiveInteger(payload?.userId);
  const organizationId = normalizePositiveInteger(payload?.organizationId);
  const organizationCode = String(payload?.organizationCode || "").trim().toLowerCase();
  const username = String(payload?.username || "").trim();

  if (!userId || !organizationId || !organizationCode || !username) {
    reply.status(401).send({ message: "Unauthorized" });
    return null;
  }

  return {
    userId,
    organizationId,
    organizationCode,
    username
  };
}
