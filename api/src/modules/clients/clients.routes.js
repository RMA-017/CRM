import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { getAuthContext } from "../../lib/session.js";
import { validateBirthdayYmd } from "../../lib/date.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import {
  createClient,
  deleteClientById,
  findClientsRequester,
  getClientsPage,
  updateClientById
} from "./clients.service.js";

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

function splitLegacyFullName(value) {
  const tokens = String(value || "").trim().split(/\s+/).filter(Boolean);
  return {
    lastName: tokens[0] || "",
    firstName: tokens[1] || "",
    middleName: tokens.slice(2).join(" ")
  };
}

function parseLegacyNotes(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { birthday: "", contact: "", note: "" };
  }

  const chunks = raw.split("|").map((item) => item.trim()).filter(Boolean);
  let birthday = "";
  let contact = "";
  const noteParts = [];

  chunks.forEach((chunk) => {
    const birthdayMatch = chunk.match(/^Birthday:\s*(\d{4}-\d{2}-\d{2})$/i);
    if (birthdayMatch) {
      birthday = birthdayMatch[1];
      return;
    }

    const contactMatch = chunk.match(/^Contact:\s*(.+)$/i);
    if (contactMatch) {
      contact = String(contactMatch[1] || "").trim();
      return;
    }

    noteParts.push(chunk);
  });

  return { birthday, contact, note: noteParts.join(" | ") };
}

function parseNullableBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function normalizeClientPayload(body) {
  const payload = body && typeof body === "object" ? body : {};
  const legacyFullName = String(payload?.fullName || "").trim();
  const legacyNotes = String(payload?.notes || "").trim();
  const legacyNameParts = splitLegacyFullName(legacyFullName);
  const legacyNotesParts = parseLegacyNotes(legacyNotes);

  return {
    firstName: String(payload?.firstName || legacyNameParts.firstName || "").trim(),
    lastName: String(payload?.lastName || legacyNameParts.lastName || "").trim(),
    middleName: String(payload?.middleName || legacyNameParts.middleName || "").trim(),
    birthday: String(payload?.birthday || legacyNotesParts.birthday || "").trim(),
    phone: String(payload?.phone || payload?.phoneNumber || "").trim(),
    tgMail: String(payload?.tgMail || payload?.telegramOrEmail || legacyNotesParts.contact || "").trim(),
    isVip: parseNullableBoolean(payload?.isVip ?? payload?.is_vip),
    note: String(payload?.note || legacyNotesParts.note || "").trim()
  };
}

function mapClient(row) {
  const firstName = String(row.first_name || "").trim();
  const lastName = String(row.last_name || "").trim();
  const middleName = String(row.middle_name || "").trim();
  const birthday = row.birthday ? String(row.birthday).slice(0, 10) : "";
  const tgMail = String(row.tg_mail || "").trim();
  const note = String(row.note || "").trim();
  const fullName = [lastName, firstName, middleName].filter(Boolean).join(" ");
  const notes = [birthday ? `Birthday: ${birthday}` : "", tgMail ? `Contact: ${tgMail}` : "", note]
    .filter(Boolean)
    .join(" | ");

  return {
    id: row.id,
    organizationId: row.organization_id,
    firstName,
    lastName,
    middleName,
    birthday,
    phone: row.phone_number,
    tgMail,
    telegramOrEmail: tgMail,
    isVip: Boolean(row.is_vip),
    is_vip: Boolean(row.is_vip),
    createdById: row.created_by,
    createdByName: row.created_by_name || row.created_by || "-",
    createdBy: row.created_by_name || row.created_by || "-",
    updatedById: row.updated_by,
    updatedByName: row.updated_by_name || row.updated_by || "-",
    updatedBy: row.updated_by_name || row.updated_by || "-",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    note,
    fullName,
    notes
  };
}

function validateClientPayload({ firstName, lastName, middleName, birthday, phone, tgMail, note }) {
  const errors = {};

  if (!firstName) {
    errors.firstName = "First name is required.";
  } else if (firstName.length > 64) {
    errors.firstName = "First name must be max 64 chars.";
  }

  if (!lastName) {
    errors.lastName = "Last name is required.";
  } else if (lastName.length > 64) {
    errors.lastName = "Last name must be max 64 chars.";
  }

  if (middleName.length > 64) {
    errors.middleName = "Middle name must be max 64 chars.";
  }

  const birthdayError = validateBirthdayYmd(birthday, { required: true });
  if (birthdayError) {
    errors.birthday = birthdayError;
  }

  if (phone && !PHONE_REGEX.test(phone)) {
    errors.phone = "Invalid phone number.";
  }

  if (tgMail.length > 96) {
    errors.tgMail = "Telegram or email is too long (max 96).";
  }

  if (note.length > 255) {
    errors.note = "Note is too long (max 255).";
  }

  return errors;
}

async function clientsRoutes(fastify) {
  fastify.get(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const authContext = getAuthContext(request, reply);
      if (!authContext) {
        return;
      }

      const pageParam = Number.parseInt(String(request.query?.page || ""), 10);
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const search = String(request.query?.q || "").trim();
      const firstName = String(request.query?.firstName || "").trim();
      const lastName = String(request.query?.lastName || "").trim();
      const middleName = String(request.query?.middleName || "").trim();
      const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ))) {
          return reply.status(404).send({ message: "Not found." });
        }

        const { total, totalPages, rows, page: safePage } = await getClientsPage({
          organizationId: authContext.organizationId,
          page,
          limit,
          search,
          firstName,
          lastName,
          middleName
        });

        return reply.send({
          items: rows.map(mapClient),
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
        console.error("Error fetching clients:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = getAuthContext(request, reply);
      if (!authContext) {
        return;
      }

      const input = normalizeClientPayload(request.body);
      const errors = validateClientPayload(input);

      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.CLIENTS_CREATE))) {
          return reply.status(404).send({ message: "Not found." });
        }

        const item = await createClient({
          organizationId: authContext.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          birthday: input.birthday,
          phone: input.phone,
          tgMail: input.tgMail,
          isVip: input.isVip ?? false,
          note: input.note,
          createdBy: authContext.userId
        });

        return reply.status(201).send({
          message: "Client created.",
          item: mapClient(item)
        });
      } catch (error) {
        console.error("Error creating client:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = getAuthContext(request, reply);
      if (!authContext) {
        return;
      }

      const id = parsePositiveInteger(request.params?.id);
      if (!id) {
        return reply.status(400).send({ message: "Invalid client id." });
      }

      const input = normalizeClientPayload(request.body);
      const errors = validateClientPayload(input);

      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.CLIENTS_UPDATE))) {
          return reply.status(404).send({ message: "Not found." });
        }

        const item = await updateClientById({
          id,
          organizationId: authContext.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          birthday: input.birthday,
          phone: input.phone,
          tgMail: input.tgMail,
          isVip: input.isVip,
          note: input.note,
          updatedBy: authContext.userId
        });

        if (!item) {
          return reply.status(404).send({ message: "Client not found." });
        }

        return reply.send({
          message: "Client updated.",
          item: mapClient(item)
        });
      } catch (error) {
        console.error("Error updating client:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const authContext = getAuthContext(request, reply);
      if (!authContext) {
        return;
      }

      const id = parsePositiveInteger(request.params?.id);
      if (!id) {
        return reply.status(400).send({ message: "Invalid client id." });
      }

      try {
        const requester = await findClientsRequester(authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }
        if (!(await hasPermission(requester.role_id, PERMISSIONS.CLIENTS_DELETE))) {
          return reply.status(404).send({ message: "Not found." });
        }

        const result = await deleteClientById({ id, organizationId: authContext.organizationId });
        if (result.rowCount === 0) {
          return reply.status(404).send({ message: "Client not found." });
        }

        return reply.send({ message: "Client deleted." });
      } catch (error) {
        console.error("Error deleting client:", error);
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default clientsRoutes;
