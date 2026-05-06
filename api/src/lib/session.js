import jwt from "jsonwebtoken";
import { appConfig } from "../config/app-config.js";
import pool from "../config/db.js";
import { trackUserActivity } from "../modules/monitoring/monitoring.store.js";
import { AUTH_COOKIE_NAME, getClearCookieOptions } from "./cookies.js";
import { parsePositiveInteger } from "./number.js";
import { normalizeOrganizationCode } from "./organization-code.js";

export function signAccessToken({ userId, organizationId, organizationCode, username }) {
  return jwt.sign({
    userId,
    organizationId,
    organizationCode,
    username
  }, appConfig.jwtSecret, {
    algorithm: "HS256",
    expiresIn: appConfig.jwtExpiresIn
  });
}

function clearAuthCookie(reply) {
  reply.clearCookie?.(AUTH_COOKIE_NAME, getClearCookieOptions());
}

function getAuthPayload(request, reply) {
  const token = request.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    reply.status(401).send({ message: "Unauthorized" });
    return null;
  }

  try {
    return jwt.verify(token, appConfig.jwtSecret, {
      algorithms: ["HS256"]
    });
  } catch {
    clearAuthCookie(reply);
    reply.status(401).send({ message: "Invalid or expired token." });
    return null;
  }
}

async function getRequesterByAuthContext({ userId, organizationId }) {
  const { rows } = await pool.query(
    `SELECT
       u.id,
       u.role_id,
       u.position_id,
       u.username,
       u.email,
       u.full_name,
       u.birthday,
       COALESCE(NULLIF(TRIM(r.label), ''), '') AS role,
       (COALESCE(u.is_platform_admin, FALSE) OR COALESCE(r.is_admin, FALSE)) AS is_admin,
       COALESCE(u.is_platform_admin, FALSE) AS is_platform_admin,
       COALESCE(r.is_admin, FALSE) AS is_organization_admin,
       u.phone_number,
       COALESCE(NULLIF(TRIM(p.label), ''), '') AS position,
       o.id AS organization_id,
       o.code AS organization_code,
       o.name AS organization_name,
       COALESCE(NULLIF(TRIM(r.label), ''), '') AS role_label,
       COALESCE(NULLIF(TRIM(p.label), ''), '') AS position_label
      FROM users u
      JOIN organizations o ON o.id = $2
      JOIN role_options r ON r.id = u.role_id
       AND r.is_active = TRUE
      LEFT JOIN position_options p ON p.id = u.position_id
     WHERE u.id = $1
       AND (u.organization_id = $2 OR COALESCE(u.is_platform_admin, FALSE) = TRUE)
       AND o.is_active = TRUE
     LIMIT 1`,
    [userId, organizationId]
  );

  return rows[0] || null;
}

export async function authPreHandler(request, reply) {
  const authContext = getAuthContext(request, reply);
  if (!authContext) {
    return; // getAuthContext already sent 401
  }

  const requester = await getRequesterByAuthContext(authContext);
  if (!requester) {
    clearAuthCookie(reply);
    reply.status(401).send({ message: "Unauthorized" });
    return;
  }

  request.authContext = {
    ...authContext,
    requester
  };

  trackUserActivity({
    userId: requester.id,
    username: requester.username,
    fullName: requester.full_name,
    method: request.method,
    route: request.routeOptions?.url || request.url.split("?")[0],
    ip: request.ip
  });
}

function getAuthContext(request, reply) {
  const payload = getAuthPayload(request, reply);
  if (!payload) {
    return null;
  }

  const userId = parsePositiveInteger(payload?.userId);
  const organizationId = parsePositiveInteger(payload?.organizationId);
  const organizationCode = normalizeOrganizationCode(payload?.organizationCode);
  const username = String(payload?.username || "").trim();

  if (!userId || !organizationId || !organizationCode || !username) {
    clearAuthCookie(reply);
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
