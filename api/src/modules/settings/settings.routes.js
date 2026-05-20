import { ORGANIZATION_CODE_REGEX, PERMISSION_CODE_REGEX } from "../../constants/validation.js";
import { setNoCacheHeaders } from "../../lib/http.js";
import {
  normalizePermissionCode,
  normalizePermissionCodes
} from "../../lib/permission-codes.js";
import { normalizeOrganizationCode } from "../../lib/organization-code.js";
import { normalizeInteger, parsePositiveInteger } from "../../lib/number.js";
import { parseBooleanOr, parseOptionalOrganizationId } from "../../lib/request-parsers.js";
import {
  DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  MAX_APPOINTMENT_HISTORY_LOCK_DAYS,
  MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
  MIN_APPOINTMENT_HISTORY_LOCK_DAYS,
  getAppointmentHistoryLockDaysByOrganization,
  getAppointmentSlotCellHeightPxByOrganization,
  saveAppointmentHistoryLockDaysByOrganization,
  saveAppointmentSlotCellHeightPxByOrganization
} from "../appointments/services/appointment-settings-config.service.js";
import {
  createOrganization,
  createFinancePaymentMethod,
  createPositionOption,
  createRoleOption,
  createServiceCatalogItem,
  deactivateFinancePaymentMethodById,
  deactivateServiceCatalogItemById,
  deleteOrganizationById,
  deletePositionOptionById,
  deleteRoleOptionById,
  findSettingsRequester,
  getPositionOptionById,
  getFinancePaymentMethodById,
  getRoleOptionById,
  getServiceCatalogItemById,
  hasActiveServicesForPosition,
  listOrganizations,
  listFinancePaymentMethodsForSettings,
  listPermissionOptionsForSettings,
  listPositionOptionsForSettings,
  listRoleOptionsForSettings,
  listServiceCatalogForSettings,
  updateOrganization,
  updateFinancePaymentMethod,
  updatePositionOption,
  updateRoleOption,
  updateServiceCatalogItem
} from "./settings.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { clearUserOptionsCache } from "../meta/meta.service.js";
import { settingsRouteSchemas } from "./settings.route-schemas.js";

const SETTINGS_ROUTE_PERMISSION_CONFIG = Object.freeze({
  appointments: Object.freeze({
    legacyRequiresPlatformAdmin: false,
    permissions: Object.freeze({
      read: PERMISSIONS.SETTINGS_APPOINTMENTS_READ,
      update: PERMISSIONS.SETTINGS_APPOINTMENTS_UPDATE
    })
  }),
  roles: Object.freeze({
    legacyRequiresPlatformAdmin: false,
    permissions: Object.freeze({
      read: PERMISSIONS.SETTINGS_ROLES_READ,
      create: PERMISSIONS.SETTINGS_ROLES_CREATE,
      update: PERMISSIONS.SETTINGS_ROLES_UPDATE,
      delete: PERMISSIONS.SETTINGS_ROLES_DELETE
    })
  }),
  positions: Object.freeze({
    legacyRequiresPlatformAdmin: false,
    permissions: Object.freeze({
      read: PERMISSIONS.SETTINGS_POSITIONS_READ,
      create: PERMISSIONS.SETTINGS_POSITIONS_CREATE,
      update: PERMISSIONS.SETTINGS_POSITIONS_UPDATE,
      delete: PERMISSIONS.SETTINGS_POSITIONS_DELETE
    })
  }),
  services: Object.freeze({
    legacyRequiresPlatformAdmin: false,
    permissions: Object.freeze({
      read: PERMISSIONS.SETTINGS_SERVICES_READ,
      create: PERMISSIONS.SETTINGS_SERVICES_CREATE,
      update: PERMISSIONS.SETTINGS_SERVICES_UPDATE,
      delete: PERMISSIONS.SETTINGS_SERVICES_DELETE
    })
  }),
  finance: Object.freeze({
    legacyRequiresPlatformAdmin: false,
    permissions: Object.freeze({
      read: PERMISSIONS.SETTINGS_FINANCE_READ,
      create: PERMISSIONS.SETTINGS_FINANCE_CREATE,
      update: PERMISSIONS.SETTINGS_FINANCE_UPDATE,
      delete: PERMISSIONS.SETTINGS_FINANCE_DELETE
    })
  })
});
const SETTINGS_ROUTE_PERMISSION_CODES = Object.freeze(
  Array.from(
    new Set(
      Object.values(SETTINGS_ROUTE_PERMISSION_CONFIG)
        .flatMap((resource) => Object.values(resource.permissions))
        .map((code) => normalizePermissionCode(code))
        .filter(Boolean)
    )
  )
);

const parseSortOrder = normalizeInteger;
const parseIsActive = parseBooleanOr;

function parseHistoryLockDays(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (
    !Number.isInteger(parsed)
    || parsed < MIN_APPOINTMENT_HISTORY_LOCK_DAYS
    || parsed > MAX_APPOINTMENT_HISTORY_LOCK_DAYS
  ) {
    return {
      error: {
        field: "appointmentHistoryLockDays",
        message: `History lock days must be an integer between ${MIN_APPOINTMENT_HISTORY_LOCK_DAYS} and ${MAX_APPOINTMENT_HISTORY_LOCK_DAYS}.`
      }
    };
  }
  return { value: parsed };
}

function parseSlotCellHeightPx(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (
    !Number.isInteger(parsed)
    || parsed < MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX
    || parsed > MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX
  ) {
    return {
      error: {
        field: "appointmentSlotCellHeightPx",
        message: `Slot cell height must be an integer between ${MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX} and ${MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX}.`
      }
    };
  }
  return { value: parsed };
}

function parsePermissionCodes(value) {
  if (value == null) {
    return { codes: null };
  }

  if (!Array.isArray(value)) {
    return {
      error: {
        field: "permissionCodes",
        message: "permissionCodes must be an array."
      }
    };
  }

  const codes = normalizePermissionCodes(value);

  const invalidCode = codes.find((code) => !PERMISSION_CODE_REGEX.test(code));
  if (invalidCode) {
    return {
      error: {
        field: "permissionCodes",
        message: `Invalid permission code: ${invalidCode}`
      }
    };
  }

  return { codes };
}

function validateOrganizationPayload({ code, name }) {
  if (!ORGANIZATION_CODE_REGEX.test(code)) {
    return { field: "code", message: "Code must be 2-64 chars and contain lowercase letters, numbers, ., _, -" };
  }
  if (!name) {
    return { field: "name", message: "Name is required." };
  }
  if (name.length > 128) {
    return { field: "name", message: "Name is too long (max 128)." };
  }
  return null;
}

function validateRolePayload({ label }) {
  if (!label) {
    return { field: "label", message: "Label is required." };
  }
  if (label.length > 64) {
    return { field: "label", message: "Label is too long (max 64)." };
  }
  return null;
}

function validatePositionPayload({ label }) {
  if (!label) {
    return { field: "label", message: "Label is required." };
  }
  if (label.length > 96) {
    return { field: "label", message: "Label is too long (max 96)." };
  }
  return null;
}

function parsePriceUzs(value) {
  if (value == null || String(value).trim() === "") {
    return { value: 0 };
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { error: { field: "priceUzs", message: "Price must be a non-negative integer." } };
  }
  return { value: parsed };
}

function validateServicePayload({ name, positionId }) {
  if (!positionId) {
    return { field: "positionId", message: "Position is required." };
  }
  if (!name) {
    return { field: "name", message: "Service name is required." };
  }
  if (name.length > 128) {
    return { field: "name", message: "Service name is too long (max 128)." };
  }
  return null;
}

function validatePaymentMethodPayload({ name }) {
  if (!name) {
    return { field: "name", message: "Payment method name is required." };
  }
  if (name.length > 96) {
    return { field: "name", message: "Payment method name is too long (max 96)." };
  }
  return null;
}

function normalizeServicesStatus(value) {
  const status = String(value || "active").trim().toLowerCase();
  return ["active", "inactive", "all"].includes(status) ? status : "active";
}

async function requireOrganizationAdmin(request, reply) {
  const authContext = request.authContext;

  const requester = await findSettingsRequester(authContext);
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }

  if (!requester.is_admin) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }

  return { authContext, requester };
}

async function requirePlatformAdmin(request, reply) {
  const adminContext = await requireOrganizationAdmin(request, reply);
  if (!adminContext) {
    return null;
  }
  if (!adminContext.requester.is_platform_admin) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }
  return adminContext;
}

async function getSettingsPermissionSnapshot(roleId) {
  const normalizedRoleId = Number.parseInt(String(roleId || "").trim(), 10);
  if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) {
    return {
      usesAdvancedSettingsPermissions: false,
      appointments: { read: false, update: false },
      roles: { read: false, create: false, update: false, delete: false },
      positions: { read: false, create: false, update: false, delete: false },
      services: { read: false, create: false, update: false, delete: false },
      finance: { read: false, create: false, update: false, delete: false }
    };
  }

  const checks = await Promise.all(
    SETTINGS_ROUTE_PERMISSION_CODES.map((code) => hasPermission(normalizedRoleId, code))
  );
  const permissionState = new Map(
    SETTINGS_ROUTE_PERMISSION_CODES.map((code, index) => [code, Boolean(checks[index])])
  );
  const resourceState = Object.fromEntries(
    Object.entries(SETTINGS_ROUTE_PERMISSION_CONFIG).map(([resourceKey, config]) => [
      resourceKey,
      Object.fromEntries(
        Object.entries(config.permissions).map(([actionKey, permissionCode]) => [
          actionKey,
          permissionState.get(normalizePermissionCode(permissionCode)) === true
        ])
      )
    ])
  );

  return {
    usesAdvancedSettingsPermissions: Array.from(permissionState.values()).some(Boolean),
    appointments: resourceState.appointments,
    roles: resourceState.roles,
    positions: resourceState.positions,
    services: resourceState.services,
    finance: resourceState.finance
  };
}

async function requireSettingsRouteAccess(request, reply, resourceKey, actionKey = "read") {
  const resourceConfig = SETTINGS_ROUTE_PERMISSION_CONFIG[resourceKey];
  if (!resourceConfig) {
    throw new Error(`Unknown settings resource: ${resourceKey}`);
  }

  const authContext = request.authContext;
  const requester = await findSettingsRequester(authContext);
  if (!requester) {
    reply.status(401).send({ message: "Unauthorized." });
    return null;
  }

  const permissionSnapshot = await getSettingsPermissionSnapshot(requester.role_id);
  const usesAdvancedSettingsPermissions = permissionSnapshot.usesAdvancedSettingsPermissions;
  const hasResourcePermission = permissionSnapshot?.[resourceKey]?.[actionKey] === true;
  const isLegacyAllowed = resourceConfig.legacyRequiresPlatformAdmin
    ? Boolean(requester.is_platform_admin)
    : Boolean(requester.is_admin);

  if (resourceConfig.legacyRequiresPlatformAdmin && !requester.is_platform_admin) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }

  if (usesAdvancedSettingsPermissions ? !hasResourcePermission : !isLegacyAllowed) {
    reply.status(403).send({ message: "Forbidden." });
    return null;
  }

  return {
    authContext,
    requester,
    settingsPermissions: permissionSnapshot,
    usesAdvancedSettingsPermissions
  };
}

async function settingsRoutes(fastify) {
  fastify.get(
    "/organizations",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const adminContext = await requirePlatformAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const items = await listOrganizations();
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching organizations:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/organizations",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: settingsRouteSchemas.organizationCreateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requirePlatformAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const code = normalizeOrganizationCode(request.body?.code);
        const name = String(request.body?.name || "").trim();
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validateOrganizationPayload({ code, name });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await createOrganization({
          code,
          name,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        clearUserOptionsCache();
        return reply.status(201).send({
          message: "Organization created.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "code", message: "Organization code already exists." });
        }
        request.log.error({ err: error }, "Error creating organization:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/organizations/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams,
        body: settingsRouteSchemas.organizationUpdateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requirePlatformAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid organization id." });
        }

        const code = normalizeOrganizationCode(request.body?.code);
        const name = String(request.body?.name || "").trim();
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validateOrganizationPayload({ code, name });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        if (id === adminContext.authContext.organizationId && !isActive) {
          return reply.status(400).send({ message: "You cannot deactivate your current organization." });
        }

        const item = await updateOrganization({
          id,
          code,
          name,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "Organization not found." });
        }

        clearUserOptionsCache();
        return reply.send({
          message: "Organization updated.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "code", message: "Organization code already exists." });
        }
        request.log.error({ err: error }, "Error updating organization:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/organizations/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requirePlatformAdmin(request, reply);
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid organization id." });
        }

        if (id === adminContext.authContext.organizationId) {
          return reply.status(400).send({ message: "You cannot delete your current organization." });
        }

        const result = await deleteOrganizationById(id);
        if (result.rowCount === 0) {
          return reply.status(404).send({ message: "Organization not found." });
        }

        clearUserOptionsCache();
        return reply.send({ message: "Organization deleted." });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Organization contains linked data and could not be fully deleted." });
        }
        request.log.error({ err: error }, "Error deleting organization:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/admin-options",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: settingsRouteSchemas.adminOptionsQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "appointments", "read");
        if (!adminContext) {
          return;
        }

        const { value: requestedOrganizationId, error: organizationError } = parseOptionalOrganizationId(
          request.query?.organizationId ?? request.query?.organization_id
        );
        if (organizationError) {
          return reply.status(400).send(organizationError);
        }

        if (
          requestedOrganizationId
          && !adminContext.requester.is_platform_admin
          && requestedOrganizationId !== Number(adminContext.authContext.organizationId)
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const targetOrganizationId = adminContext.requester.is_platform_admin
          ? (requestedOrganizationId || adminContext.authContext.organizationId)
          : adminContext.authContext.organizationId;
        const [appointmentHistoryLockDays, appointmentSlotCellHeightPx] = await Promise.all([
          getAppointmentHistoryLockDaysByOrganization(targetOrganizationId),
          getAppointmentSlotCellHeightPxByOrganization(targetOrganizationId)
        ]);

        return reply.send({
          item: {
            organizationId: String(targetOrganizationId),
            appointmentHistoryLockDays: String(appointmentHistoryLockDays),
            appointmentSlotCellHeightPx: String(appointmentSlotCellHeightPx)
          },
          bounds: {
            min: MIN_APPOINTMENT_HISTORY_LOCK_DAYS,
            max: MAX_APPOINTMENT_HISTORY_LOCK_DAYS,
            slotCellHeightPx: {
              min: MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
              max: MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX,
              default: DEFAULT_APPOINTMENT_SLOT_CELL_HEIGHT_PX
            }
          }
        });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching admin options:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/admin-options",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: settingsRouteSchemas.adminOptionsPatchBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "appointments", "update");
        if (!adminContext) {
          return;
        }

        const { value: requestedOrganizationId, error: organizationError } = parseOptionalOrganizationId(
          request.body?.organizationId ?? request.body?.organization_id
        );
        if (organizationError) {
          return reply.status(400).send(organizationError);
        }

        const hasHistoryLockDays = (
          request.body?.appointmentHistoryLockDays !== undefined
          || request.body?.historyLockDays !== undefined
          || request.body?.appointment_history_lock_days !== undefined
        );
        const hasSlotCellHeightPx = (
          request.body?.appointmentSlotCellHeightPx !== undefined
          || request.body?.slotCellHeightPx !== undefined
          || request.body?.appointment_slot_cell_height_px !== undefined
        );

        let parsedHistoryLockDays = { value: null };
        if (hasHistoryLockDays) {
          parsedHistoryLockDays = parseHistoryLockDays(
            request.body?.appointmentHistoryLockDays
            ?? request.body?.historyLockDays
            ?? request.body?.appointment_history_lock_days
          );
          if (parsedHistoryLockDays.error) {
            return reply.status(400).send(parsedHistoryLockDays.error);
          }
        }

        let parsedSlotCellHeightPx = { value: null };
        if (hasSlotCellHeightPx) {
          parsedSlotCellHeightPx = parseSlotCellHeightPx(
            request.body?.appointmentSlotCellHeightPx
            ?? request.body?.slotCellHeightPx
            ?? request.body?.appointment_slot_cell_height_px
          );
          if (parsedSlotCellHeightPx.error) {
            return reply.status(400).send(parsedSlotCellHeightPx.error);
          }
        }

        if (
          requestedOrganizationId
          && !adminContext.requester.is_platform_admin
          && requestedOrganizationId !== Number(adminContext.authContext.organizationId)
        ) {
          return reply.status(403).send({ message: "Forbidden." });
        }

        const targetOrganizationId = adminContext.requester.is_platform_admin
          ? (requestedOrganizationId || adminContext.authContext.organizationId)
          : adminContext.authContext.organizationId;
        const [appointmentHistoryLockDays, appointmentSlotCellHeightPx] = await Promise.all([
          hasHistoryLockDays
            ? saveAppointmentHistoryLockDaysByOrganization({
                organizationId: targetOrganizationId,
                actorUserId: adminContext.authContext.userId,
                historyLockDays: parsedHistoryLockDays.value
              })
            : getAppointmentHistoryLockDaysByOrganization(targetOrganizationId),
          hasSlotCellHeightPx
            ? saveAppointmentSlotCellHeightPxByOrganization({
                organizationId: targetOrganizationId,
                actorUserId: adminContext.authContext.userId,
                slotCellHeightPx: parsedSlotCellHeightPx.value
              })
            : getAppointmentSlotCellHeightPxByOrganization(targetOrganizationId)
        ]);

        return reply.send({
          message: "Admin options updated.",
          item: {
            organizationId: String(targetOrganizationId),
            appointmentHistoryLockDays: String(appointmentHistoryLockDays),
            appointmentSlotCellHeightPx: String(appointmentSlotCellHeightPx)
          }
        });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(400).send({
            field: "organizationId",
            message: "Invalid organization id."
          });
        }
        if (error?.code === "INVALID_HISTORY_LOCK_DAYS") {
          return reply.status(400).send({
            field: "appointmentHistoryLockDays",
            message: `History lock days must be an integer between ${MIN_APPOINTMENT_HISTORY_LOCK_DAYS} and ${MAX_APPOINTMENT_HISTORY_LOCK_DAYS}.`
          });
        }
        if (error?.code === "INVALID_SLOT_CELL_HEIGHT_PX") {
          return reply.status(400).send({
            field: "appointmentSlotCellHeightPx",
            message: `Slot cell height must be an integer between ${MIN_APPOINTMENT_SLOT_CELL_HEIGHT_PX} and ${MAX_APPOINTMENT_SLOT_CELL_HEIGHT_PX}.`
          });
        }
        if (error?.code === "MIGRATION_REQUIRED") {
          return reply.status(500).send({
            message: "DB migration required: appointment settings table is missing required columns."
          });
        }
        request.log.error({ err: error }, "Error updating admin options:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/roles",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "roles", "read");
        if (!adminContext) {
          return;
        }

        const [items, permissions] = await Promise.all([
          listRoleOptionsForSettings(adminContext.authContext.organizationId),
          listPermissionOptionsForSettings()
        ]);
        return reply.send({ items, permissions });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching roles:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/roles",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: settingsRouteSchemas.roleCreateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "roles", "create");
        if (!adminContext) {
          return;
        }

        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const parsedPermissions = parsePermissionCodes(request.body?.permissionCodes);
        if (parsedPermissions.error) {
          return reply.status(400).send(parsedPermissions.error);
        }
        const validationError = validateRolePayload({ label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const permissionCodes = Array.isArray(parsedPermissions.codes) ? parsedPermissions.codes : [];
        const isPlatformAdminRequester = Boolean(adminContext.requester?.is_platform_admin);
        const isAdmin = isPlatformAdminRequester && Boolean(request.body?.isAdmin);

        const item = await createRoleOption({
          organizationId: adminContext.authContext.organizationId,
          label,
          sortOrder,
          isActive,
          isAdmin,
          permissionCodes,
          actorUserId: adminContext.authContext.userId
        });
        clearUserOptionsCache();
        return reply.status(201).send({
          message: "Role created.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "label", message: "Role label already exists." });
        }
        if (error?.code === "ROLE_DEACTIVATION_BLOCKED_ASSIGNED_USERS") {
          return reply.status(409).send({
            field: "isActive",
            message: "Role cannot be deactivated while users are assigned to it."
          });
        }
        if (error?.code === "INVALID_PERMISSION_CODES") {
          const invalidCodes = Array.isArray(error.invalidCodes) ? error.invalidCodes.join(", ") : "";
          return reply.status(400).send({
            field: "permissionCodes",
            message: invalidCodes
              ? `Unknown permission code(s): ${invalidCodes}`
              : "Unknown permission code(s)."
          });
        }
        request.log.error({ err: error }, "Error creating role:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/roles/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams,
        body: settingsRouteSchemas.roleUpdateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "roles", "update");
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid role id." });
        }

        const existing = await getRoleOptionById(id, adminContext.authContext.organizationId, false);
        if (!existing) {
          return reply.status(404).send({ message: "Role not found." });
        }

        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const parsedPermissions = parsePermissionCodes(request.body?.permissionCodes);
        if (parsedPermissions.error) {
          return reply.status(400).send(parsedPermissions.error);
        }
        const validationError = validateRolePayload({ label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const isAdminRole = Boolean(existing.isAdmin);
        const isPlatformAdminRequester = Boolean(adminContext.requester?.is_platform_admin);
        if (isAdminRole && !isPlatformAdminRequester) {
          return reply.status(403).send({ message: "Only platform admin can modify admin roles." });
        }
        const hasRequestedIsAdmin = Object.prototype.hasOwnProperty.call(request.body || {}, "isAdmin");
        const requestedIsAdmin = hasRequestedIsAdmin
          ? parseIsActive(request.body?.isAdmin, Boolean(existing.isAdmin))
          : Boolean(existing.isAdmin);
        if (!isPlatformAdminRequester && hasRequestedIsAdmin && requestedIsAdmin !== Boolean(existing.isAdmin)) {
          return reply.status(403).send({ message: "Only platform admin can change admin role status." });
        }

        const permissionCodes = Array.isArray(parsedPermissions.codes)
          ? parsedPermissions.codes
          : (Array.isArray(existing.permissionCodes) ? existing.permissionCodes : []);

        const item = await updateRoleOption({
          id,
          organizationId: adminContext.authContext.organizationId,
          label,
          sortOrder,
          isActive,
          isAdmin: requestedIsAdmin,
          permissionCodes,
          actorUserId: adminContext.authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "Role not found." });
        }

        clearUserOptionsCache();
        return reply.send({
          message: "Role updated.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "label", message: "Role label already exists." });
        }
        if (error?.code === "ROLE_DEACTIVATION_BLOCKED_ASSIGNED_USERS") {
          return reply.status(409).send({
            field: "isActive",
            message: "Role cannot be deactivated while users are assigned to it."
          });
        }
        if (error?.code === "INVALID_PERMISSION_CODES") {
          const invalidCodes = Array.isArray(error.invalidCodes) ? error.invalidCodes.join(", ") : "";
          return reply.status(400).send({
            field: "permissionCodes",
            message: invalidCodes
              ? `Unknown permission code(s): ${invalidCodes}`
              : "Unknown permission code(s)."
          });
        }
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Role is used by users and cannot be changed." });
        }
        request.log.error({ err: error }, "Error updating role:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/roles/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "roles", "delete");
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid role id." });
        }

        const existing = await getRoleOptionById(id, adminContext.authContext.organizationId, false);
        if (!existing) {
          return reply.status(404).send({ message: "Role not found." });
        }
        if (existing.isAdmin) {
          return reply.status(400).send({ message: "Admin role cannot be deleted." });
        }

        const result = await deleteRoleOptionById(id, adminContext.authContext.organizationId);
        if (result.rowCount === 0) {
          return reply.status(404).send({ message: "Role not found." });
        }

        clearUserOptionsCache();
        return reply.send({ message: "Role deleted." });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Role is used by users and cannot be deleted." });
        }
        request.log.error({ err: error }, "Error deleting role:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/positions",
    {
      config: { rateLimit: fastify.apiRateLimit }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "positions", "read");
        if (!adminContext) {
          return;
        }

        const items = await listPositionOptionsForSettings(adminContext.authContext.organizationId);
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching positions:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/positions",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: settingsRouteSchemas.positionCreateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "positions", "create");
        if (!adminContext) {
          return;
        }

        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validatePositionPayload({ label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await createPositionOption({
          organizationId: adminContext.authContext.organizationId,
          label,
          sortOrder,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        clearUserOptionsCache();
        return reply.status(201).send({
          message: "Position created.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "label", message: "Position label already exists." });
        }
        request.log.error({ err: error }, "Error creating position:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/positions/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams,
        body: settingsRouteSchemas.positionUpdateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "positions", "update");
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid position id." });
        }

        const label = String(request.body?.label || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder);
        const isActive = parseIsActive(request.body?.isActive, true);
        const validationError = validatePositionPayload({ label });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        if (!isActive && await hasActiveServicesForPosition({
          organizationId: adminContext.authContext.organizationId,
          positionId: id
        })) {
          return reply.status(409).send({
            field: "isActive",
            message: "Position is used by active services and cannot be deactivated."
          });
        }

        const item = await updatePositionOption({
          id,
          organizationId: adminContext.authContext.organizationId,
          label,
          sortOrder,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "Position not found." });
        }

        clearUserOptionsCache();
        return reply.send({
          message: "Position updated.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "label", message: "Position label already exists." });
        }
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Position is used by users and cannot be changed." });
        }
        request.log.error({ err: error }, "Error updating position:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/positions/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "positions", "delete");
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid position id." });
        }

        const existing = await getPositionOptionById(id, adminContext.authContext.organizationId, false);
        if (!existing) {
          return reply.status(404).send({ message: "Position not found." });
        }

        if (await hasActiveServicesForPosition({
          organizationId: adminContext.authContext.organizationId,
          positionId: id
        })) {
          return reply.status(409).send({
            message: "Position is used by active services and cannot be deleted."
          });
        }

        const result = await deletePositionOptionById(id, adminContext.authContext.organizationId);
        if (result.rowCount === 0) {
          return reply.status(404).send({ message: "Position not found." });
        }

        clearUserOptionsCache();
        return reply.send({ message: "Position deleted." });
      } catch (error) {
        if (error?.code === "23503") {
          return reply.status(409).send({ message: "Position is used by users and cannot be deleted." });
        }
        request.log.error({ err: error }, "Error deleting position:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/services",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: settingsRouteSchemas.servicesQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "services", "read");
        if (!adminContext) {
          return;
        }

        const items = await listServiceCatalogForSettings(
          adminContext.authContext.organizationId,
          normalizeServicesStatus(request.query?.status)
        );
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching service catalog:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/services",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: settingsRouteSchemas.serviceCreateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "services", "create");
        if (!adminContext) {
          return;
        }

        const positionId = parsePositiveInteger(request.body?.positionId ?? request.body?.position_id);
        const name = String(request.body?.name || "").trim();
        const price = parsePriceUzs(request.body?.priceUzs ?? request.body?.price_uzs);
        if (price.error) {
          return reply.status(400).send(price.error);
        }
        const isActive = parseIsActive(request.body?.isActive ?? request.body?.is_active, true);
        const validationError = validateServicePayload({ name, positionId });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const position = await getPositionOptionById(positionId, adminContext.authContext.organizationId, false);
        if (!position) {
          return reply.status(400).send({ field: "positionId", message: "Position not found." });
        }
        if (isActive && !position.isActive) {
          return reply.status(400).send({ field: "positionId", message: "Inactive position cannot be used for an active service." });
        }

        const item = await createServiceCatalogItem({
          organizationId: adminContext.authContext.organizationId,
          positionId,
          name,
          priceUzs: price.value,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        return reply.status(201).send({
          message: "Service created.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "name", message: "Service name already exists." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ field: "positionId", message: "Invalid position." });
        }
        request.log.error({ err: error }, "Error creating service catalog item:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/services/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams,
        body: settingsRouteSchemas.serviceUpdateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "services", "update");
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid service id." });
        }
        const existing = await getServiceCatalogItemById(id, adminContext.authContext.organizationId);
        if (!existing) {
          return reply.status(404).send({ message: "Service not found." });
        }

        const positionId = parsePositiveInteger(request.body?.positionId ?? request.body?.position_id);
        const name = String(request.body?.name || "").trim();
        const price = parsePriceUzs(request.body?.priceUzs ?? request.body?.price_uzs);
        if (price.error) {
          return reply.status(400).send(price.error);
        }
        const isActive = parseIsActive(request.body?.isActive ?? request.body?.is_active, true);
        const validationError = validateServicePayload({ name, positionId });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const position = await getPositionOptionById(positionId, adminContext.authContext.organizationId, false);
        if (!position) {
          return reply.status(400).send({ field: "positionId", message: "Position not found." });
        }
        if (isActive && !position.isActive) {
          return reply.status(400).send({ field: "positionId", message: "Inactive position cannot be used for an active service." });
        }

        const item = await updateServiceCatalogItem({
          id,
          organizationId: adminContext.authContext.organizationId,
          positionId,
          name,
          priceUzs: price.value,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        return reply.send({
          message: "Service updated.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "name", message: "Service name already exists." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ field: "positionId", message: "Invalid position." });
        }
        request.log.error({ err: error }, "Error updating service catalog item:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/services/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "services", "delete");
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid service id." });
        }

        const item = await deactivateServiceCatalogItemById(
          id,
          adminContext.authContext.organizationId,
          adminContext.authContext.userId
        );
        if (!item) {
          return reply.status(404).send({ message: "Service not found." });
        }
        return reply.send({ message: "Service deactivated.", item });
      } catch (error) {
        request.log.error({ err: error }, "Error deactivating service catalog item:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.get(
    "/finance/payment-methods",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        querystring: settingsRouteSchemas.financePaymentMethodsQuery
      }
    },
    async (request, reply) => {
      setNoCacheHeaders(reply);

      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "finance", "read");
        if (!adminContext) {
          return;
        }

        const items = await listFinancePaymentMethodsForSettings(
          adminContext.authContext.organizationId,
          normalizeServicesStatus(request.query?.status)
        );
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching finance payment methods:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/finance/payment-methods",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        body: settingsRouteSchemas.financePaymentMethodCreateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "finance", "create");
        if (!adminContext) {
          return;
        }

        const name = String(request.body?.name || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder ?? request.body?.sort_order);
        const isActive = parseIsActive(request.body?.isActive ?? request.body?.is_active, true);
        const validationError = validatePaymentMethodPayload({ name });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await createFinancePaymentMethod({
          organizationId: adminContext.authContext.organizationId,
          name,
          sortOrder,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        return reply.status(201).send({
          message: "Payment method created.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "name", message: "Payment method name already exists." });
        }
        request.log.error({ err: error }, "Error creating finance payment method:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/finance/payment-methods/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams,
        body: settingsRouteSchemas.financePaymentMethodUpdateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "finance", "update");
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid payment method id." });
        }
        const existing = await getFinancePaymentMethodById(id, adminContext.authContext.organizationId);
        if (!existing) {
          return reply.status(404).send({ message: "Payment method not found." });
        }

        const name = String(request.body?.name || "").trim();
        const sortOrder = parseSortOrder(request.body?.sortOrder ?? request.body?.sort_order);
        const isActive = parseIsActive(request.body?.isActive ?? request.body?.is_active, true);
        const validationError = validatePaymentMethodPayload({ name });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await updateFinancePaymentMethod({
          id,
          organizationId: adminContext.authContext.organizationId,
          name,
          sortOrder,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        return reply.send({
          message: "Payment method updated.",
          item
        });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "name", message: "Payment method name already exists." });
        }
        request.log.error({ err: error }, "Error updating finance payment method:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/finance/payment-methods/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "finance", "delete");
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid payment method id." });
        }
        const item = await deactivateFinancePaymentMethodById(
          id,
          adminContext.authContext.organizationId,
          adminContext.authContext.userId
        );
        if (!item) {
          return reply.status(404).send({ message: "Payment method not found." });
        }
        return reply.send({ message: "Payment method deactivated.", item });
      } catch (error) {
        request.log.error({ err: error }, "Error deactivating finance payment method:");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

}

export const __settingsRouteContracts = Object.freeze({
  parseSortOrder,
  parseIsActive,
  parseHistoryLockDays,
  parseOptionalOrganizationId,
  parsePermissionCodes,
  validateOrganizationPayload,
  validateRolePayload,
  validatePositionPayload,
  validateServicePayload,
  validatePaymentMethodPayload,
  parsePriceUzs
});

export default settingsRoutes;
