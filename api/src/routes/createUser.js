import argon2 from "argon2";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;
const ALLOWED_ROLES = new Set([
  "admin",
  "tutor",
  "educator",
  "specialist",
  "manager",
  "finance",
  "director"
]);

const DEFAULT_CREATED_USER_PASSWORD = process.env.DEFAULT_CREATED_USER_PASSWORD || "aaron2021";

async function createUserRoutes(fastify) {
  fastify.post(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const username = String(request.body?.username || "").trim();
      const fullName = String(request.body?.fullName || request.body?.full_name || "").trim();
      const role = String(request.body?.role || "").trim().toLowerCase();

      const token = request.cookies?.crm_access_token;
      if (!token) {
        return reply.status(401).send({ message: "Unauthorized." });
      }

      let payload = null;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        return reply.status(401).send({ message: "Invalid or expired token." });
      }

      const actorUsername = String(payload?.username || "").trim();
      if (!actorUsername) {
        return reply.status(401).send({ message: "Unauthorized." });
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
        return reply.status(400).send({ errors });
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
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (String(actor.role || "").toLowerCase() !== "admin") {
          return reply.status(403).send({ message: "Only admin can create users." });
        }

        const temporaryPassword = DEFAULT_CREATED_USER_PASSWORD;
        const password_hash = await argon2.hash(temporaryPassword);

        const sql = {
          text: "INSERT INTO users (username, email, full_name, birthday, password_hash, phone_number, position, role) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username, email, full_name, birthday, phone_number, position, role",
          values: [username, null, fullName, null, password_hash, null, null, role]
        };

        const { rows } = await client.query(sql);
        createdUser = rows[0];
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({
            field: "username",
            message: "Username already exists."
          });
        }
        console.error("Error executing SQL:", error);
        return reply.status(500).send({ message: "Internal server error." });
      } finally {
        if (client) {
          client.release();
        }
      }

      return reply.status(201).send({
        message: "User successfully created.",
        user: createdUser
      });
    }
  );
}

export default createUserRoutes;
