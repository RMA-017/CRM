import { ORGANIZATION_CODE_REGEX, PERMISSION_CODE_REGEX } from "../../constants/validation.js";
import { appConfig } from "../../config/app-config.js";
import { setNoCacheHeaders } from "../../lib/http.js";
import {
  normalizePermissionCode,
  normalizePermissionCodes
} from "../../lib/permission-codes.js";
import { normalizeOrganizationCode } from "../../lib/organization-code.js";
import {
  getNotificationRetentionDaysMessage,
  parseNotificationRetentionDays
} from "../../lib/notification-retention.js";
import { normalizeInteger, parsePositiveInteger } from "../../lib/number.js";
import { parseBooleanOr, parseOptionalOrganizationId } from "../../lib/request-parsers.js";
import { normalizeAllowedFeatures, requesterHasOrgFeature } from "../../lib/org-features.js";
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
  createAppointmentNorm,
  createOrganization,
  createPositionOption,
  createRoleOption,
  deleteAppointmentNormById,
  deleteOrganizationById,
  deletePositionOptionById,
  deleteRoleOptionById,
  findSettingsRequester,
  getPositionOptionById,
  getRoleOptionById,
  listAppointmentNorms,
  listOrganizations,
  listPermissionOptionsForSettings,
  listPositionOptionsForSettings,
  listRoleOptionsForSettings,
  updateAppointmentNorm,
  updateOrganization,
  updatePositionOption,
  updateRoleOption
} from "./settings.service.js";
import {
  getNotificationRetentionSettingsByOrganization,
  saveNotificationRetentionSettingsByOrganization
} from "../notifications/notifications.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { clearUserOptionsCache } from "../meta/meta.service.js";
import { settingsRouteSchemas } from "./settings.route-schemas.js";

const SETTINGS_ROUTE_PERMISSION_CONFIG = Object.freeze({
  appointments: Object.freeze({
    featureKey: "settings.appointments",
    legacyRequiresPlatformAdmin: false,
    permissions: Object.freeze({
      read: PERMISSIONS.SETTINGS_APPOINTMENTS_READ,
      update: PERMISSIONS.SETTINGS_APPOINTMENTS_UPDATE
    })
  }),
  appointment_norms: Object.freeze({
    featureKey: "settings.appointment_norms",
    legacyRequiresPlatformAdmin: false,
    permissions: Object.freeze({
      read: PERMISSIONS.SETTINGS_APPOINTMENT_NORMS_READ,
      create: PERMISSIONS.SETTINGS_APPOINTMENT_NORMS_CREATE,
      update: PERMISSIONS.SETTINGS_APPOINTMENT_NORMS_UPDATE,
      delete: PERMISSIONS.SETTINGS_APPOINTMENT_NORMS_DELETE
    })
  }),
  roles: Object.freeze({
    featureKey: "settings.roles",
    legacyRequiresPlatformAdmin: false,
    permissions: Object.freeze({
      read: PERMISSIONS.SETTINGS_ROLES_READ,
      create: PERMISSIONS.SETTINGS_ROLES_CREATE,
      update: PERMISSIONS.SETTINGS_ROLES_UPDATE,
      delete: PERMISSIONS.SETTINGS_ROLES_DELETE
    })
  }),
  positions: Object.freeze({
    featureKey: "settings.positions",
    legacyRequiresPlatformAdmin: false,
    permissions: Object.freeze({
      read: PERMISSIONS.SETTINGS_POSITIONS_READ,
      create: PERMISSIONS.SETTINGS_POSITIONS_CREATE,
      update: PERMISSIONS.SETTINGS_POSITIONS_UPDATE,
      delete: PERMISSIONS.SETTINGS_POSITIONS_DELETE
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
      positions: { read: false, create: false, update: false, delete: false }
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
    appointment_norms: resourceState.appointment_norms,
    roles: resourceState.roles,
    positions: resourceState.positions
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

  if (resourceConfig.featureKey && !requesterHasOrgFeature(requester, resourceConfig.featureKey)) {
    reply.status(403).send({ message: "Forbidden." });
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
        const allowedFeatures = normalizeAllowedFeatures(request.body?.allowedFeatures);
        const validationError = validateOrganizationPayload({ code, name });
        if (validationError) {
          return reply.status(400).send(validationError);
        }

        const item = await createOrganization({
          code,
          name,
          isActive,
          allowedFeatures,
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
        const allowedFeatures = normalizeAllowedFeatures(request.body?.allowedFeatures);
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
          allowedFeatures,
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
        const defaultOutboxRetentionDays = Number.parseInt(
          String(appConfig?.outboxWorker?.retentionDays ?? 30),
          10
        );
        const defaultUserNotificationsRetentionDays = Number.parseInt(
          String(appConfig?.outboxWorker?.userNotificationsRetentionDays ?? 0),
          10
        );

        const [appointmentHistoryLockDays, appointmentSlotCellHeightPx, notificationRetention] = await Promise.all([
          getAppointmentHistoryLockDaysByOrganization(targetOrganizationId),
          getAppointmentSlotCellHeightPxByOrganization(targetOrganizationId),
          getNotificationRetentionSettingsByOrganization({
            organizationId: targetOrganizationId,
            defaultOutboxRetentionDays,
            defaultUserNotificationsRetentionDays
          })
        ]);

        return reply.send({
          item: {
            organizationId: String(targetOrganizationId),
            appointmentHistoryLockDays: String(appointmentHistoryLockDays),
            appointmentSlotCellHeightPx: String(appointmentSlotCellHeightPx),
            outboxWorkerRetentionDays: String(notificationRetention?.outboxRetentionDays ?? defaultOutboxRetentionDays),
            userNotificationsRetentionDays: String(
              notificationRetention?.userNotificationsRetentionDays ?? defaultUserNotificationsRetentionDays
            )
          },
          bounds: {
            min: MIN_APPOINTMENT_HISTORY_LOCK_DAYS,
            max: MAX_APPOINTMENT_HISTORY_LOCK_DAYS,
            retentionDays: {
              min: MIN_NOTIFICATION_RETENTION_DAYS,
              max: MAX_NOTIFICATION_RETENTION_DAYS
            },
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
        const hasOutboxWorkerRetentionDays = (
          request.body?.outboxWorkerRetentionDays !== undefined
          || request.body?.outboxRetentionDays !== undefined
          || request.body?.outbox_worker_retention_days !== undefined
        );
        const hasUserNotificationsRetentionDays = (
          request.body?.userNotificationsRetentionDays !== undefined
          || request.body?.user_notifications_retention_days !== undefined
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

        let parsedOutboxWorkerRetentionDays = { value: null };
        if (hasOutboxWorkerRetentionDays) {
          parsedOutboxWorkerRetentionDays = parseNotificationRetentionDays(
            request.body?.outboxWorkerRetentionDays
            ?? request.body?.outboxRetentionDays
            ?? request.body?.outbox_worker_retention_days,
            "outboxWorkerRetentionDays"
          );
          if (parsedOutboxWorkerRetentionDays.error) {
            return reply.status(400).send(parsedOutboxWorkerRetentionDays.error);
          }
        }

        let parsedUserNotificationsRetentionDays = { value: null };
        if (hasUserNotificationsRetentionDays) {
          parsedUserNotificationsRetentionDays = parseNotificationRetentionDays(
            request.body?.userNotificationsRetentionDays
            ?? request.body?.user_notifications_retention_days,
            "userNotificationsRetentionDays"
          );
          if (parsedUserNotificationsRetentionDays.error) {
            return reply.status(400).send(parsedUserNotificationsRetentionDays.error);
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
        const defaultOutboxRetentionDays = Number.parseInt(
          String(appConfig?.outboxWorker?.retentionDays ?? 30),
          10
        );
        const defaultUserNotificationsRetentionDays = Number.parseInt(
          String(appConfig?.outboxWorker?.userNotificationsRetentionDays ?? 0),
          10
        );
        const shouldReadCurrentNotificationRetention = (
          hasOutboxWorkerRetentionDays
          || hasUserNotificationsRetentionDays
        ) && !(hasOutboxWorkerRetentionDays && hasUserNotificationsRetentionDays);
        const currentNotificationRetention = shouldReadCurrentNotificationRetention
          ? await getNotificationRetentionSettingsByOrganization({
              organizationId: targetOrganizationId,
              defaultOutboxRetentionDays,
              defaultUserNotificationsRetentionDays
            })
          : null;

        const [appointmentHistoryLockDays, appointmentSlotCellHeightPx, notificationRetention] = await Promise.all([
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
            : getAppointmentSlotCellHeightPxByOrganization(targetOrganizationId),
          (hasOutboxWorkerRetentionDays || hasUserNotificationsRetentionDays)
            ? saveNotificationRetentionSettingsByOrganization({
                organizationId: targetOrganizationId,
                actorUserId: adminContext.authContext.userId,
                outboxRetentionDays: hasOutboxWorkerRetentionDays
                  ? parsedOutboxWorkerRetentionDays.value
                  : Number.parseInt(String(currentNotificationRetention?.outboxRetentionDays ?? defaultOutboxRetentionDays), 10),
                userNotificationsRetentionDays: hasUserNotificationsRetentionDays
                  ? parsedUserNotificationsRetentionDays.value
                  : Number.parseInt(
                      String(currentNotificationRetention?.userNotificationsRetentionDays ?? defaultUserNotificationsRetentionDays),
                      10
                    )
              })
            : getNotificationRetentionSettingsByOrganization({
              organizationId: targetOrganizationId,
              defaultOutboxRetentionDays,
              defaultUserNotificationsRetentionDays
            })
        ]);

        return reply.send({
          message: "Admin options updated.",
          item: {
            organizationId: String(targetOrganizationId),
            appointmentHistoryLockDays: String(appointmentHistoryLockDays),
            appointmentSlotCellHeightPx: String(appointmentSlotCellHeightPx),
            outboxWorkerRetentionDays: String(notificationRetention?.outboxRetentionDays ?? defaultOutboxRetentionDays),
            userNotificationsRetentionDays: String(
              notificationRetention?.userNotificationsRetentionDays ?? defaultUserNotificationsRetentionDays
            )
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
        if (error?.code === "INVALID_OUTBOX_RETENTION_DAYS") {
          return reply.status(400).send({
            field: "outboxWorkerRetentionDays",
            message: getNotificationRetentionDaysMessage()
          });
        }
        if (error?.code === "INVALID_USER_NOTIFICATIONS_RETENTION_DAYS") {
          return reply.status(400).send({
            field: "userNotificationsRetentionDays",
            message: getNotificationRetentionDaysMessage()
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
          listRoleOptionsForSettings(
            adminContext.authContext.organizationId,
            adminContext.requester.organization_allowed_features ?? null
          ),
          listPermissionOptionsForSettings(
            adminContext.requester.organization_allowed_features ?? null
          )
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

  // ── Appointment Norms ────────────────────────────────────────────────────

  fastify.get(
    "/appointment-norms",
    { config: { rateLimit: fastify.apiRateLimit } },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "appointment_norms", "read");
        if (!adminContext) {
          return;
        }
        setNoCacheHeaders(reply);
        const items = await listAppointmentNorms(adminContext.authContext.organizationId);
        return reply.send({ items });
      } catch (error) {
        request.log.error({ err: error }, "Error fetching appointment norms");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.post(
    "/appointment-norms",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: { body: settingsRouteSchemas.appointmentNormCreateBody }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "appointment_norms", "create");
        if (!adminContext) {
          return;
        }

        const positionId = parsePositiveInteger(request.body?.positionId);
        if (!positionId) {
          return reply.status(400).send({ field: "positionId", message: "Valid position is required." });
        }
        const maxPerWeek = Number.parseInt(String(request.body?.maxPerWeek ?? "").trim(), 10);
        if (!Number.isInteger(maxPerWeek) || maxPerWeek < 1 || maxPerWeek > 100) {
          return reply.status(400).send({ field: "maxPerWeek", message: "Max per week must be between 1 and 100." });
        }
        const isActive = parseIsActive(request.body?.isActive, true);

        const item = await createAppointmentNorm({
          organizationId: adminContext.authContext.organizationId,
          positionId,
          maxPerWeek,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        return reply.status(201).send({ message: "Norm created.", item });
      } catch (error) {
        if (error?.code === "23505") {
          return reply.status(409).send({ field: "positionId", message: "A norm for this position already exists." });
        }
        if (error?.code === "23503") {
          return reply.status(400).send({ field: "positionId", message: "Position not found." });
        }
        request.log.error({ err: error }, "Error creating appointment norm");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.patch(
    "/appointment-norms/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: {
        params: settingsRouteSchemas.idParams,
        body: settingsRouteSchemas.appointmentNormUpdateBody
      }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "appointment_norms", "update");
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid id." });
        }
        const maxPerWeek = Number.parseInt(String(request.body?.maxPerWeek ?? "").trim(), 10);
        if (!Number.isInteger(maxPerWeek) || maxPerWeek < 1 || maxPerWeek > 100) {
          return reply.status(400).send({ field: "maxPerWeek", message: "Max per week must be between 1 and 100." });
        }
        const isActive = parseIsActive(request.body?.isActive, true);

        const item = await updateAppointmentNorm({
          id,
          organizationId: adminContext.authContext.organizationId,
          maxPerWeek,
          isActive,
          actorUserId: adminContext.authContext.userId
        });
        if (!item) {
          return reply.status(404).send({ message: "Norm not found." });
        }
        return reply.send({ message: "Norm updated.", item });
      } catch (error) {
        request.log.error({ err: error }, "Error updating appointment norm");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );

  fastify.delete(
    "/appointment-norms/:id",
    {
      config: { rateLimit: fastify.apiRateLimit },
      schema: { params: settingsRouteSchemas.idParams }
    },
    async (request, reply) => {
      try {
        const adminContext = await requireSettingsRouteAccess(request, reply, "appointment_norms", "delete");
        if (!adminContext) {
          return;
        }

        const id = parsePositiveInteger(request.params?.id);
        if (!id) {
          return reply.status(400).send({ message: "Invalid id." });
        }
        const deleted = await deleteAppointmentNormById(id, adminContext.authContext.organizationId);
        if (!deleted) {
          return reply.status(404).send({ message: "Norm not found." });
        }
        return reply.send({ message: "Norm deleted." });
      } catch (error) {
        request.log.error({ err: error }, "Error deleting appointment norm");
        return reply.status(500).send({ message: "Internal server error." });
      }
    }
  );
}

export const __settingsRouteContracts = Object.freeze({
  parseSortOrder,
  parseIsActive,
  parseHistoryLockDays,
  parseNotificationRetentionDays,
  parseOptionalOrganizationId,
  parsePermissionCodes,
  validateOrganizationPayload,
  validateRolePayload,
  validatePositionPayload
});

export default settingsRoutes;
