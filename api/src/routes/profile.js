import jwt from "jsonwebtoken";
import argon2 from "argon2";
import pool from "../config/db.js";

function setNoCacheHeaders(reply) {
  reply.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  reply.header("Pragma", "no-cache");
  reply.header("Expires", "0");
}

function getTokenPayload(request, reply) {
  const token = request.cookies?.crm_access_token;
  if (!token) {
    reply.status(401).send({ message: "Unauthorized" });
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    reply.status(401).send({ message: "Invalid or expired token." });
    return null;
  }
}

async function profileRoutes(fastify) {
  fastify.get(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const payload = getTokenPayload(request, reply);
      if (!payload) {
        return;
      }

      const username = String(payload?.username || "").trim();
      if (!username) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      try {
        const { rows } = await pool.query(
          "SELECT username, email, full_name, birthday, role, phone_number, position FROM users WHERE username = $1",
          [username]
        );
        const user = rows[0];
        if (!user) {
          reply.clearCookie("crm_access_token", {
            httpOnly: true,
            path: "/",
            sameSite: "lax",
            secure: false
          });
          return reply.status(401).send({ message: "Unauthorized" });
        }

        return reply.send({
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          birthday: user.birthday,
          role: user.role,
          phone: user.phone_number,
          position: user.position
        });
      } catch (error) {
        console.error("Error fetching profile:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/all",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const payload = getTokenPayload(request, reply);
      if (!payload) {
        return;
      }

      const username = String(payload?.username || "").trim();
      if (!username) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const pageParam = Number.parseInt(String(request.query?.page || ""), 10);
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

      try {
        const requester = await pool.query(
          "SELECT role FROM users WHERE username = $1",
          [username]
        );

        if (!requester.rows[0]) {
          return reply.status(401).send({ message: "Unauthorized" });
        }

        const requesterRole = String(requester.rows[0].role || "").toLowerCase();
        if (requesterRole !== "admin") {
          return reply.status(403).send({ message: "Forbidden" });
        }

        const totalResult = await pool.query("SELECT COUNT(*)::int AS total FROM users");
        const total = Number(totalResult.rows[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);
        const offset = (safePage - 1) * limit;

        const { rows } = await pool.query(
          "SELECT id::text AS id, username, email, full_name, birthday, phone_number, position, role, created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2",
          [limit, offset]
        );

        const users = rows.map((user) => ({
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          birthday: user.birthday,
          role: user.role,
          phone: user.phone_number,
          position: user.position,
          createdAt: user.created_at
        }));

        return reply.send({
          users,
          pagination: {
            page: safePage,
            limit,
            total,
            totalPages,
            hasPrev: safePage > 1,
            hasNext: safePage < totalPages
          }
        });
      } catch (error) {
        console.error("Error fetching all users:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const payload = getTokenPayload(request, reply);
      if (!payload) {
        return;
      }

      const username = String(payload?.username || "").trim();
      if (!username) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const field = String(request.body?.field || "").trim();
      const rawValue = request.body?.value;

      const allowedFields = new Set(["email", "fullName", "birthday", "password", "phone", "position"]);
      if (!allowedFields.has(field)) {
        return reply.status(400).send({ message: "Invalid field." });
      }

      let sql = "";
      let values = [];

      if (field === "password") {
        const password = String(rawValue || "");
        if (password.length < 6) {
          return reply.status(400).send({ field: "password", message: "Password must be at least 6 characters." });
        }

        const passwordHash = await argon2.hash(password);
        sql = "UPDATE users SET password_hash = $1 WHERE username = $2";
        values = [passwordHash, username];
      } else if (field === "email") {
        const email = String(rawValue || "").trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return reply.status(400).send({ field: "email", message: "Invalid email format." });
        }
        sql = "UPDATE users SET email = $1 WHERE username = $2";
        values = [email || null, username];
      } else if (field === "fullName") {
        const fullName = String(rawValue || "").trim();
        if (!fullName) {
          return reply.status(400).send({ field: "fullName", message: "Full name is required." });
        }
        sql = "UPDATE users SET full_name = $1 WHERE username = $2";
        values = [fullName, username];
      } else if (field === "birthday") {
        const birthday = String(rawValue || "").trim();
        if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
          return reply.status(400).send({ field: "birthday", message: "Invalid birthday format." });
        }
        sql = "UPDATE users SET birthday = $1 WHERE username = $2";
        values = [birthday || null, username];
      } else if (field === "phone") {
        const phone = String(rawValue || "").trim();
        if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
          return reply.status(400).send({ field: "phone", message: "Invalid phone number." });
        }
        sql = "UPDATE users SET phone_number = $1 WHERE username = $2";
        values = [phone || null, username];
      } else if (field === "position") {
        const position = String(rawValue || "").trim();
        sql = "UPDATE users SET position = $1 WHERE username = $2";
        values = [position || null, username];
      }

      try {
        const updateResult = await pool.query(sql, values);
        if (updateResult.rowCount === 0) {
          return reply.status(404).send({ message: "User not found." });
        }

        const { rows } = await pool.query(
          "SELECT username, email, full_name, birthday, role, phone_number, position FROM users WHERE username = $1",
          [username]
        );

        const user = rows[0];
        if (!user) {
          return reply.status(404).send({ message: "User not found." });
        }

        return reply.send({
          message: "Profile updated.",
          profile: {
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            birthday: user.birthday,
            role: user.role,
            phone: user.phone_number,
            position: user.position
          }
        });
      } catch (error) {
        if (error?.code === "23505" && field === "email") {
          return reply.status(409).send({ field: "email", message: "Email already exists." });
        }
        console.error("Error updating profile:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/users/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const payload = getTokenPayload(request, reply);
      if (!payload) {
        return;
      }

      const requesterUsername = String(payload?.username || "").trim();
      if (!requesterUsername) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const userId = Number(request.params?.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.status(400).send({ message: "Invalid user id." });
      }

      const username = String(request.body?.username || "").trim();
      const email = String(request.body?.email || "").trim();
      const fullName = String(request.body?.fullName || "").trim();
      const birthday = String(request.body?.birthday || "").trim();
      const phone = String(request.body?.phone || "").trim();
      const position = String(request.body?.position || "").trim();
      const role = String(request.body?.role || "").trim().toLowerCase();
      const password = String(request.body?.password || "");

      const allowedRoles = new Set(["admin", "director", "tutor", "educator", "specialist", "manager", "finance"]);
      const usernameRegex = /^[a-zA-Z0-9._-]{3,30}$/;

      const errors = {};
      if (!usernameRegex.test(username)) {
        errors.username = "Username must be 3-30 chars and contain letters, numbers, ., _, -";
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = "Invalid email format.";
      }
      if (!fullName) {
        errors.fullName = "Full name is required.";
      }
      if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
        errors.birthday = "Invalid birthday format.";
      }
      if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) {
        errors.phone = "Invalid phone number.";
      }
      if (!allowedRoles.has(role)) {
        errors.role = "Invalid role.";
      }
      if (password && password.length < 6) {
        errors.password = "Password must be at least 6 characters.";
      }

      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      let client = null;
      try {
        client = await pool.connect();

        const requesterResult = await client.query(
          "SELECT role FROM users WHERE username = $1",
          [requesterUsername]
        );
        const requester = requesterResult.rows[0];
        if (!requester || String(requester.role || "").toLowerCase() !== "admin") {
          return reply.status(403).send({ message: "Only admin can edit users." });
        }

        await client.query("BEGIN");

        await client.query(
          "UPDATE users SET username = $1, email = $2, full_name = $3, birthday = $4, phone_number = $5, position = $6, role = $7 WHERE id = $8",
          [username, email || null, fullName, birthday || null, phone || null, position || null, role, userId]
        );

        if (password) {
          const passwordHash = await argon2.hash(password);
          await client.query(
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            [passwordHash, userId]
          );
        }

        const { rows } = await client.query(
          "SELECT id::text AS id, username, email, full_name, birthday, role, phone_number, position, created_at FROM users WHERE id = $1",
          [userId]
        );

        const user = rows[0];
        if (!user) {
          await client.query("ROLLBACK");
          return reply.status(404).send({ message: "User not found." });
        }

        await client.query("COMMIT");

        return reply.send({
          message: "User updated successfully.",
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            birthday: user.birthday,
            role: user.role,
            phone: user.phone_number,
            position: user.position,
            createdAt: user.created_at
          }
        });
      } catch (error) {
        if (client) {
          await client.query("ROLLBACK").catch(() => {});
        }
        if (error?.code === "23505") {
          return reply.status(409).send({ message: "Username or email already exists." });
        }
        console.error("Error updating user:", error);
        return reply.status(500).send({ message: "Internal server error." });
      } finally {
        if (client) {
          client.release();
        }
      }
    }
  );

  fastify.delete(
    "/users/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const payload = getTokenPayload(request, reply);
      if (!payload) {
        return;
      }

      const requesterUsername = String(payload?.username || "").trim();
      if (!requesterUsername) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const userId = Number(request.params?.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.status(400).send({ message: "Invalid user id." });
      }

      try {
        const requesterResult = await pool.query(
          "SELECT id, role FROM users WHERE username = $1",
          [requesterUsername]
        );
        const requester = requesterResult.rows[0];
        if (!requester || String(requester.role || "").toLowerCase() !== "admin") {
          return reply.status(403).send({ message: "Only admin can delete users." });
        }

        if (Number(requester.id) === userId) {
          return reply.status(400).send({ message: "You cannot delete your own account." });
        }

        const deleteResult = await pool.query("DELETE FROM users WHERE id = $1", [userId]);
        if (deleteResult.rowCount === 0) {
          return reply.status(404).send({ message: "User not found." });
        }

        return reply.send({ message: "User deleted successfully." });
      } catch (error) {
        console.error("Error deleting user:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default profileRoutes;
