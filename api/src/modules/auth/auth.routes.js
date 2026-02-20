import { getClearCookieOptions, getAuthCookieOptions, AUTH_COOKIE_NAME } from "../../lib/cookies.js";
import { signAccessToken } from "../../lib/session.js";
import { getRolePermissions } from "../users/access.service.js";
import { findAuthUserForLogin, verifyPassword } from "./auth.service.js";

async function authRoutes(fastify) {
  fastify.post(
    "/",
    {
      config: { rateLimit: fastify.loginRateLimit }
    },
    async (request, reply) => {
      const organizationCode = String(request.body?.organizationCode || "").trim();
      const username = String(request.body?.username || "").trim();
      const password = String(request.body?.password || "");

      if (!organizationCode) {
        return reply.status(400).send({
          field: "organizationCode",
          message: "Organization code is required."
        });
      }

      if (!username) {
        return reply.status(400).send({
          field: "username",
          message: "Username is required."
        });
      }

      if (!password) {
        return reply.status(400).send({
          field: "password",
          message: "Password is required."
        });
      }

      try {
        const user = await findAuthUserForLogin({ organizationCode, username });
        if (!user) {
          return reply.status(401).send({
            message: "Invalid username or password."
          });
        }

        const isPasswordValid = await verifyPassword(password, user.password_hash);
        if (!isPasswordValid) {
          return reply.status(401).send({
            message: "Invalid username or password."
          });
        }

        const token = signAccessToken({
          userId: user.id,
          organizationId: user.organization_id,
          organizationCode: user.organization_code,
          username: user.username
        });
        reply.setCookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
        const permissions = await getRolePermissions(user.role);

        return reply.send({
          message: "Successful",
          user: {
            username: user.username,
            role: user.role,
            organizationCode: user.organization_code,
            organizationName: user.organization_name,
            permissions
          }
        });
      } catch (error) {
        console.error("Error during login:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/logout",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (_request, reply) => {
      reply.clearCookie(AUTH_COOKIE_NAME, getClearCookieOptions());
      return reply.send({ message: "Logged out." });
    }
  );
}

export default authRoutes;
