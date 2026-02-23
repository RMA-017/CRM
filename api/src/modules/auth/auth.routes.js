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
      const username = String(request.body?.username || "").trim();
      const password = String(request.body?.password || "");

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
        const user = await findAuthUserForLogin({ username });
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
        const permissions = await getRolePermissions(user.role_id);

        return reply.send({
          message: "Successful",
          user: {
            username: user.username,
            roleId: user.role_id,
            role: user.role,
            isAdmin: Boolean(user.is_admin),
            organizationCode: user.organization_code,
            organizationName: user.organization_name,
            permissions
          }
        });
      } catch (error) {
        request.log.error({ err: error }, "Error during login");
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
