import jwt from "jsonwebtoken";
import argon2 from "argon2";
import pool from "../config/db.js";

async function loginRoutes(fastify) {
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

      let client = null;
      let user = null;

      try {
        client = await pool.connect();
        const { rows } = await client.query(
          "SELECT username, password_hash FROM users WHERE username = $1",
          [username]
        );
        user = rows[0];
      } catch (error) {
        console.error("Error executing SQL:", error);
        return reply.status(500).send({ message: "Internal server error." });
      } finally {
        if (client) {
          client.release();
        }
      }

      if (!user) {
        return reply.status(401).send({
          message: "Invalid username or password."
        });
      }

      let isPasswordValid = false;
      try {
        isPasswordValid = await argon2.verify(String(user.password_hash || ""), password);
      } catch {
        isPasswordValid = false;
      }
      if (!isPasswordValid) {
        return reply.status(401).send({
          message: "Invalid username or password."
        });
      }

      const token = jwt.sign({ username }, process.env.JWT_SECRET, {
        expiresIn: "7d"
      });

      reply.setCookie("crm_access_token", token, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: false,
        maxAge: 60 * 60 * 24 * 7
      });

      return reply.send({
        message: "Successful",
        user: {
          username: user.username
        }
      });
    }
  );

  fastify.post(
    "/logout",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      reply.clearCookie("crm_access_token", {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: false
      });

      return reply.send({ message: "Logged out." });
    }
  );
}

export default loginRoutes;
