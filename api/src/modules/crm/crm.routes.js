import { setNoCacheHeaders } from "../../lib/http.js";
import { normalizePositiveInteger } from "../../lib/number.js";
import { isValidPhoneInput, normalizePhoneNumber } from "../../lib/phone-number.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import {
  createOrUpdateCrmLead,
  getCrmLeadsPage,
  updateCrmLeadById
} from "./crm.service.js";

function normalizeText(value, maxLength = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeLeadPayload(body = {}) {
  const payload = body && typeof body === "object" ? body : {};
  return {
    fullName: normalizeText(payload.fullName || payload.full_name || payload.name, 180),
    phoneNumber: normalizeText(payload.phone || payload.phoneNumber || payload.phone_number, 32),
    note: normalizeText(payload.note || payload.message, 2000),
    source: normalizeText(payload.source, 32) || "website",
    organizationCode: normalizeText(payload.organizationCode || payload.organization_code, 64)
  };
}

async function requireCrmAccess(request, reply, action = "read") {
  const requester = request.authContext?.requester;
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }
  const permissionCode = action === "update"
    ? PERMISSIONS.CRM_LEADS_UPDATE
    : PERMISSIONS.CRM_LEADS_READ;
  const canUse = Boolean(requester.is_platform_admin) || Boolean(requester.is_admin) || await hasPermission(requester.role_id, permissionCode);
  if (!canUse) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }
  return {
    organizationId: request.authContext.organizationId,
    requester
  };
}

export async function crmPublicRoutes(fastify) {
  fastify.post(
    "/public-leads",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const payload = normalizeLeadPayload(request.body);
      if (payload.fullName.length < 3) {
        return reply.status(400).send({ field: "fullName", message: "Full name is required." });
      }
      if (!isValidPhoneInput(payload.phoneNumber)) {
        return reply.status(400).send({ field: "phone", message: "Phone number is required." });
      }
      const item = await createOrUpdateCrmLead({
        organizationCode: payload.organizationCode,
        fullName: payload.fullName,
        phoneNumber: normalizePhoneNumber(payload.phoneNumber),
        source: "website",
        note: payload.note,
        payload: {
          source: "website",
          submittedAt: new Date().toISOString()
        }
      });
      if (!item) {
        return reply.status(400).send({ message: "Lead could not be saved." });
      }
      return reply.status(201).send({ message: "Request saved.", item });
    }
  );
}

export async function crmProtectedRoutes(fastify) {
  fastify.get(
    "/leads",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      const access = await requireCrmAccess(request, reply, "read");
      if (!access) {
        return null;
      }
      const items = await getCrmLeadsPage({
        organizationId: access.organizationId,
        status: request.query?.status,
        source: request.query?.source,
        search: request.query?.search,
        dateFrom: request.query?.dateFrom,
        dateTo: request.query?.dateTo,
        limit: request.query?.limit
      });
      return reply.send({ items });
    }
  );

  fastify.patch(
    "/leads/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const access = await requireCrmAccess(request, reply, "update");
      if (!access) {
        return null;
      }
      const id = normalizePositiveInteger(request.params?.id);
      if (!id) {
        return reply.status(400).send({ message: "Invalid lead id." });
      }
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const hasFullName = Object.prototype.hasOwnProperty.call(body, "fullName")
        || Object.prototype.hasOwnProperty.call(body, "full_name")
        || Object.prototype.hasOwnProperty.call(body, "name");
      const fullName = hasFullName ? normalizeText(body.fullName || body.full_name || body.name, 180) : undefined;
      if (hasFullName && fullName.length < 3) {
        return reply.status(400).send({ field: "fullName", message: "Full name is required." });
      }
      const item = await updateCrmLeadById({
        organizationId: access.organizationId,
        id,
        fullName,
        status: body.status,
        note: body.note
      });
      if (!item) {
        return reply.status(404).send({ message: "Lead not found." });
      }
      return reply.send({ message: "Lead updated.", item });
    }
  );
}
