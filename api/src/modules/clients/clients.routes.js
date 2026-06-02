import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { isValidNormalizedPhoneNumber, normalizePhoneNumber } from "../../lib/phone-number.js";
import {
  normalizeDateYmd as normalizeLooseDateYmd,
  validateBirthdayYmd
} from "../../lib/date.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import {
  createClient,
  deleteClientById,
  findDuplicateClientByName,
  findClientsRequester,
  getClientsPage,
  isClientNameConflictError,
  searchClientsForSchedule,
  updateClientById
} from "./clients.service.js";

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

function normalizeDateYmdValue(value) {
  return normalizeLooseDateYmd(value, {
    allowPrefix: true,
    allowDateParsing: true,
    requireValidExact: true
  });
}

function normalizeBooleanFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

function normalizeClientPayload(body) {
  const payload = body && typeof body === "object" ? body : {};
  const legacyName = splitLegacyFullName(payload?.fullName);
  const legacyNotes = parseLegacyNotes(payload?.notes);
  const phoneRaw = String(payload?.phone || payload?.phoneNumber || "").trim();

  return {
    firstName: String(payload?.firstName || legacyName.firstName || "").trim(),
    lastName: String(payload?.lastName || legacyName.lastName || "").trim(),
    middleName: String(payload?.middleName || legacyName.middleName || "").trim(),
    birthday: String(payload?.birthday || legacyNotes.birthday || "").trim(),
    phone: normalizePhoneNumber(phoneRaw),
    phoneRaw,
    tgMail: String(payload?.tgMail || payload?.telegramOrEmail || legacyNotes.contact || "").trim(),
    note: String(payload?.note || legacyNotes.note || "").trim(),
    isVip: normalizeBooleanFlag(payload?.isVip ?? payload?.is_vip)
  };
}

function validateClientPayload({ firstName, lastName, middleName, birthday, phone, phoneRaw, tgMail, note }) {
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

  if (!phoneRaw) {
    errors.phone = "Phone number is required.";
  } else if (!phone || !isValidNormalizedPhoneNumber(phoneRaw)) {
    errors.phone = "Enter phone number in international format, e.g. +998977861070.";
  }

  if (tgMail.length > 96) {
    errors.tgMail = "Telegram or email is too long (max 96).";
  }

  if (note.length > 255) {
    errors.note = "Note is too long (max 255).";
  }

  return errors;
}

function buildDuplicateClientNamePayload() {
  return {
    field: "firstName",
    message: "Client with the same first name, last name, and middle name already exists."
  };
}

function mapClient(row) {
  const firstName = String(row?.first_name ?? row?.firstName ?? "").trim();
  const lastName = String(row?.last_name ?? row?.lastName ?? "").trim();
  const middleName = String(row?.middle_name ?? row?.middleName ?? "").trim();
  const birthday = normalizeDateYmdValue(row?.birthday);
  const tgMail = String(row?.tg_mail ?? row?.tgMail ?? "").trim();
  const note = String(row?.note || "").trim();
  const fullName = [lastName, firstName, middleName].filter(Boolean).join(" ");
  const notes = [birthday ? `Birthday: ${birthday}` : "", tgMail ? `Contact: ${tgMail}` : "", note]
    .filter(Boolean)
    .join(" | ");

  return {
    id: String(row?.id || "").trim(),
    organizationId: String(row?.organization_id ?? row?.organizationId ?? "").trim(),
    firstName,
    lastName,
    middleName,
    birthday,
    phone: String(row?.phone_number ?? row?.phone ?? "").trim(),
    tgMail,
    telegramOrEmail: tgMail,
    isVip: Boolean(row?.is_vip ?? row?.isVip),
    createdById: String(row?.created_by ?? row?.createdBy ?? "").trim(),
    createdByName: String(row?.created_by_name ?? row?.createdByName ?? row?.created_by ?? "-").trim() || "-",
    updatedById: String(row?.updated_by ?? row?.updatedBy ?? "").trim(),
    updatedByName: String(row?.updated_by_name ?? row?.updatedByName ?? row?.updated_by ?? "-").trim() || "-",
    createdAt: row?.created_at ?? row?.createdAt ?? null,
    updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
    note,
    fullName,
    notes
  };
}

async function requireClientsCrudAccess(request, reply, permissionCode) {
  const requester = await findClientsRequester(request.authContext);
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }
  if (!(await hasPermission(requester.role_id, permissionCode))) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }
  return requester;
}

async function clientsRoutes(fastify) {
  fastify.get(
    "/search",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const clientId = parsePositiveInteger(request.query?.clientId ?? request.query?.client_id);
      const firstName = String(request.query?.firstName || "").trim();
      const lastName = String(request.query?.lastName || "").trim();
      const middleName = String(request.query?.middleName || "").trim();
      const query = String(request.query?.q || "").trim();
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;

      const combinedLength = `${firstName}${lastName}${middleName}`.length;
      const canUseGenericQuery = Boolean(query) && (/^\d+$/.test(query) || query.length >= 3);
      if (!clientId && combinedLength < 3 && !canUseGenericQuery) {
        return reply.send({ items: [] });
      }

      try {
        const requester = await findClientsRequester(request.authContext);
        if (!requester) {
          return reply.status(401).send({ message: "Unauthorized." });
        }

        const [canReadClients, canSearchAppointmentClients] = await Promise.all([
          hasPermission(requester.role_id, PERMISSIONS.CLIENTS_READ),
          hasPermission(requester.role_id, PERMISSIONS.APPOINTMENTS_CLIENT_SEARCH)
        ]);
        const canUseClientsDirectory = canReadClients;
        const canUseAppointmentSearch = canSearchAppointmentClients;

        if (!canUseClientsDirectory && !canUseAppointmentSearch) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const rows = await searchClientsForSchedule({
          organizationId: request.authContext.organizationId,
          clientId,
          firstName,
          lastName,
          middleName,
          query,
          limit
        });

        return reply.send({
          items: rows.map(mapClient)
        });
      } catch (error) {
        request.log.error({ err: error }, "Error searching clients");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      const pageParam = Number.parseInt(String(request.query?.page || ""), 10);
      const limitParam = Number.parseInt(String(request.query?.limit || ""), 10);
      const search = String(request.query?.q || "").trim();
      const firstName = String(request.query?.firstName || "").trim();
      const lastName = String(request.query?.lastName || "").trim();
      const middleName = String(request.query?.middleName || "").trim();
      const clientId = parsePositiveInteger(request.query?.clientId ?? request.query?.client_id);
      const activeOnly = normalizeBooleanFlag(
        request.query?.active
        ?? request.query?.activeOnly
        ?? request.query?.active_only
        ?? request.query?.isVip
        ?? request.query?.is_vip
      );
      const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

      try {
        const requester = await requireClientsCrudAccess(request, reply, PERMISSIONS.CLIENTS_READ);
        if (!requester) {
          return;
        }

        const { total, totalPages, rows, page: safePage } = await getClientsPage({
          organizationId: request.authContext.organizationId,
          page,
          limit,
          search,
          firstName,
          lastName,
          middleName,
          clientId,
          activeOnly
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
        request.log.error({ err: error }, "Error fetching clients");
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
      const input = normalizeClientPayload(request.body);
      const errors = validateClientPayload(input);
      if (Object.keys(errors).length > 0) {
        return reply.status(400).send({ errors });
      }

      try {
        const requester = await requireClientsCrudAccess(request, reply, PERMISSIONS.CLIENTS_CREATE);
        if (!requester) {
          return;
        }

        const duplicateClient = await findDuplicateClientByName({
          organizationId: request.authContext.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName
        });
        if (duplicateClient) {
          return reply.status(409).send(buildDuplicateClientNamePayload());
        }

        const item = await createClient({
          organizationId: request.authContext.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          birthday: input.birthday,
          phone: input.phone,
          tgMail: input.tgMail,
          note: input.note,
          isVip: input.isVip,
          createdBy: request.authContext.userId
        });

        return reply.status(201).send({
          message: "Client created.",
          item: mapClient(item)
        });
      } catch (error) {
        if (isClientNameConflictError(error)) {
          return reply.status(409).send(buildDuplicateClientNamePayload());
        }
        request.log.error({ err: error }, "Error creating client");
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
        const requester = await requireClientsCrudAccess(request, reply, PERMISSIONS.CLIENTS_UPDATE);
        if (!requester) {
          return;
        }

        const duplicateClient = await findDuplicateClientByName({
          organizationId: request.authContext.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          excludeClientId: id
        });
        if (duplicateClient) {
          return reply.status(409).send(buildDuplicateClientNamePayload());
        }

        const item = await updateClientById({
          id,
          organizationId: request.authContext.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          middleName: input.middleName,
          birthday: input.birthday,
          phone: input.phone,
          tgMail: input.tgMail,
          note: input.note,
          isVip: input.isVip,
          updatedBy: request.authContext.userId
        });

        if (!item) {
          return reply.status(404).send({ message: "Client not found." });
        }

        return reply.send({
          message: "Client updated.",
          item: mapClient(item)
        });
      } catch (error) {
        if (isClientNameConflictError(error)) {
          return reply.status(409).send(buildDuplicateClientNamePayload());
        }
        request.log.error({ err: error }, "Error updating client");
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
      const id = parsePositiveInteger(request.params?.id);
      if (!id) {
        return reply.status(400).send({ message: "Invalid client id." });
      }

      try {
        const requester = await requireClientsCrudAccess(request, reply, PERMISSIONS.CLIENTS_DELETE);
        if (!requester) {
          return;
        }

        const result = await deleteClientById({
          id,
          organizationId: request.authContext.organizationId
        });
        if ((result?.rowCount || 0) === 0) {
          return reply.status(404).send({ message: "Client not found." });
        }

        return reply.send({ message: "Client deleted." });
      } catch (error) {
        request.log.error({ err: error }, "Error deleting client");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export default clientsRoutes;
