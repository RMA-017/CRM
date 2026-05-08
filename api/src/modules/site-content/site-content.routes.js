import { setNoCacheHeaders } from "../../lib/http.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { findSettingsRequester } from "../settings/settings.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import {
  SITE_CONTENT_SECTIONS,
  createSiteContentItem,
  deleteSiteContentItem,
  groupSiteContentItems,
  listPublicSiteContentItems,
  listSiteContentItemsByOrganization,
  updateSiteContentItem
} from "./site-content.service.js";

const MAX_IMAGE_DATA_LENGTH = 750_000;
const SITE_CONTENT_BODY_LIMIT = 5 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 4000;

function normalizeText(value, maxLength = 128) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizePayload(body = {}) {
  const sectionKey = normalizeText(body.sectionKey ?? body.section_key, 32);
  const authorUz = normalizeText(body.authorUz ?? body.author_uz ?? body.author, 128);
  const authorRu = normalizeText(body.authorRu ?? body.author_ru, 128);
  const nameUz = normalizeText(body.nameUz ?? body.name_uz ?? body.name, 128);
  const nameRu = normalizeText(body.nameRu ?? body.name_ru, 128);
  const roleUz = normalizeText(body.roleUz ?? body.role_uz ?? body.role, 128);
  const roleRu = normalizeText(body.roleRu ?? body.role_ru, 128);
  const descriptionUz = normalizeText(body.descriptionUz ?? body.description_uz ?? body.description, MAX_DESCRIPTION_LENGTH);
  const descriptionRu = normalizeText(body.descriptionRu ?? body.description_ru, MAX_DESCRIPTION_LENGTH);

  return {
    sectionKey,
    image: normalizeText(body.image ?? body.imageData ?? body.image_data, MAX_IMAGE_DATA_LENGTH),
    author: authorUz,
    authorUz,
    authorRu,
    name: nameUz,
    nameUz,
    nameRu,
    role: roleUz,
    roleUz,
    roleRu,
    description: descriptionUz,
    descriptionUz,
    descriptionRu
  };
}

function validatePayload(payload) {
  if (!SITE_CONTENT_SECTIONS.includes(payload.sectionKey)) {
    return { field: "sectionKey", message: "Invalid section." };
  }
  if (!payload.image) {
    return { field: "image", message: "Image is required." };
  }
  if (payload.image.length > MAX_IMAGE_DATA_LENGTH) {
    return { field: "image", message: "Image is too large." };
  }
  if (!payload.image.startsWith("data:image/")) {
    return { field: "image", message: "Image must be an uploaded image file." };
  }
  if (!payload.descriptionUz) {
    return { field: "descriptionUz", message: "Uzbek description is required." };
  }
  if (!payload.descriptionRu) {
    return { field: "descriptionRu", message: "Russian description is required." };
  }
  if (payload.sectionKey === "kids" && !payload.authorUz) {
    return { field: "authorUz", message: "Uzbek author is required." };
  }
  if (payload.sectionKey === "kids" && !payload.authorRu) {
    return { field: "authorRu", message: "Russian author is required." };
  }
  if (payload.sectionKey !== "kids" && !payload.nameUz) {
    return { field: "nameUz", message: "Uzbek name is required." };
  }
  if (payload.sectionKey !== "kids" && !payload.nameRu) {
    return { field: "nameRu", message: "Russian name is required." };
  }
  if (payload.sectionKey === "team" && !payload.roleUz) {
    return { field: "roleUz", message: "Uzbek role is required." };
  }
  if (payload.sectionKey === "team" && !payload.roleRu) {
    return { field: "roleRu", message: "Russian role is required." };
  }
  return null;
}

const SITE_CONTENT_PERMISSION_BY_ACTION = Object.freeze({
  read: PERMISSIONS.WEBSITE_MANAGEMENT_READ,
  create: PERMISSIONS.WEBSITE_MANAGEMENT_CREATE,
  update: PERMISSIONS.WEBSITE_MANAGEMENT_UPDATE,
  delete: PERMISSIONS.WEBSITE_MANAGEMENT_DELETE
});

async function requireSiteContentAccess(request, reply, action = "read") {
  const requester = await findSettingsRequester(request.authContext);
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }
  const permissionCode = SITE_CONTENT_PERMISSION_BY_ACTION[action] || SITE_CONTENT_PERMISSION_BY_ACTION.read;
  const hasActionPermission = await hasPermission(requester.role_id, permissionCode);
  if (!requester.is_admin && !hasActionPermission) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }
  return {
    requester,
    organizationId: request.authContext.organizationId,
    actorUserId: request.authContext.userId
  };
}

async function siteContentPublicRoutes(fastify) {
  fastify.get(
    "/",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (_request, reply) => {
      setNoCacheHeaders(reply);
      const items = await listPublicSiteContentItems();
      return reply.send({
        items: groupSiteContentItems(items)
      });
    }
  );
}

export async function siteContentProtectedRoutes(fastify) {
  fastify.get(
    "/manage",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);
      const adminContext = await requireSiteContentAccess(request, reply, "read");
      if (!adminContext) {
        return null;
      }

      const items = await listSiteContentItemsByOrganization(adminContext.organizationId);
      return reply.send({
        items: groupSiteContentItems(items)
      });
    }
  );

  fastify.post(
    "/",
    {
      bodyLimit: SITE_CONTENT_BODY_LIMIT,
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const adminContext = await requireSiteContentAccess(request, reply, "create");
      if (!adminContext) {
        return null;
      }
      const payload = normalizePayload(request.body);
      const validationError = validatePayload(payload);
      if (validationError) {
        return reply.status(400).send(validationError);
      }

      const item = await createSiteContentItem({
        organizationId: adminContext.organizationId,
        sectionKey: payload.sectionKey,
        image: payload.image,
        author: payload.sectionKey === "kids" ? payload.authorUz : null,
        authorUz: payload.sectionKey === "kids" ? payload.authorUz : null,
        authorRu: payload.sectionKey === "kids" ? payload.authorRu : null,
        name: payload.sectionKey === "kids" ? null : payload.nameUz,
        nameUz: payload.sectionKey === "kids" ? null : payload.nameUz,
        nameRu: payload.sectionKey === "kids" ? null : payload.nameRu,
        role: payload.sectionKey === "team" ? payload.roleUz : null,
        roleUz: payload.sectionKey === "team" ? payload.roleUz : null,
        roleRu: payload.sectionKey === "team" ? payload.roleRu : null,
        description: payload.descriptionUz,
        descriptionUz: payload.descriptionUz,
        descriptionRu: payload.descriptionRu,
        actorUserId: adminContext.actorUserId
      });

      return reply.status(201).send({ item });
    }
  );

  fastify.put(
    "/:id",
    {
      bodyLimit: SITE_CONTENT_BODY_LIMIT,
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const adminContext = await requireSiteContentAccess(request, reply, "update");
      if (!adminContext) {
        return null;
      }
      const id = parsePositiveInteger(request.params?.id);
      if (!id) {
        return reply.status(400).send({ field: "id", message: "Invalid item." });
      }
      const payload = normalizePayload(request.body);
      const validationError = validatePayload(payload);
      if (validationError) {
        return reply.status(400).send(validationError);
      }

      const item = await updateSiteContentItem({
        id,
        organizationId: adminContext.organizationId,
        sectionKey: payload.sectionKey,
        image: payload.image,
        author: payload.sectionKey === "kids" ? payload.authorUz : null,
        authorUz: payload.sectionKey === "kids" ? payload.authorUz : null,
        authorRu: payload.sectionKey === "kids" ? payload.authorRu : null,
        name: payload.sectionKey === "kids" ? null : payload.nameUz,
        nameUz: payload.sectionKey === "kids" ? null : payload.nameUz,
        nameRu: payload.sectionKey === "kids" ? null : payload.nameRu,
        role: payload.sectionKey === "team" ? payload.roleUz : null,
        roleUz: payload.sectionKey === "team" ? payload.roleUz : null,
        roleRu: payload.sectionKey === "team" ? payload.roleRu : null,
        description: payload.descriptionUz,
        descriptionUz: payload.descriptionUz,
        descriptionRu: payload.descriptionRu,
        actorUserId: adminContext.actorUserId
      });

      if (!item) {
        return reply.status(404).send({ message: "Not found." });
      }
      return reply.send({ item });
    }
  );

  fastify.delete(
    "/:id",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      const adminContext = await requireSiteContentAccess(request, reply, "delete");
      if (!adminContext) {
        return null;
      }
      const id = parsePositiveInteger(request.params?.id);
      if (!id) {
        return reply.status(400).send({ field: "id", message: "Invalid item." });
      }

      const deleted = await deleteSiteContentItem({
        id,
        organizationId: adminContext.organizationId
      });
      if (!deleted) {
        return reply.status(404).send({ message: "Not found." });
      }

      return reply.status(204).send();
    }
  );
}

export default siteContentPublicRoutes;
