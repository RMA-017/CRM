import { parsePositiveInteger } from "../../lib/number.js";
import {
  isDirectorLikeRoleLabel,
  isManagerLikeRoleLabel,
  isSpecialistLikeRoleLabel,
  joinNormalizedRoleLabelParts
} from "../../lib/role-labels.js";
import { isNotificationsSchemaMissing, persistNotificationEvent } from "../notifications/notifications.service.js";
import { hasPermission } from "../users/access.service.js";
import { PERMISSIONS } from "../users/users.constants.js";
import { publishAppointmentEvent } from "./appointment-events.js";
import { normalizeSpecialistIds } from "./appointment-route-helpers.js";

function isDirectorLikeRequester(requester) {
  if (Boolean(requester?.is_admin)) {
    return true;
  }
  const roleText = joinNormalizedRoleLabelParts(
    requester?.role_label || requester?.role,
    requester?.position_label || requester?.position
  );
  return isDirectorLikeRoleLabel(roleText);
}

function isSpecialistRole(requester) {
  return isSpecialistLikeRoleLabel(
    joinNormalizedRoleLabelParts(
      requester?.role_label || requester?.role,
      requester?.position_label || requester?.position
    )
  );
}

async function resolveNotificationAudience(access, specialistIds) {
  const actorUserId = parsePositiveInteger(access?.authContext?.userId);
  const actorRoleId = parsePositiveInteger(access?.requester?.role_id || access?.requester?.roleId);
  const normalizedSpecialistIds = normalizeSpecialistIds(specialistIds);
  if (!actorUserId || !actorRoleId || normalizedSpecialistIds.length === 0) {
    return {
      targetUserIds: [],
      targetRoles: []
    };
  }

  if (Boolean(access?.requester?.is_admin) || isManagerLikeRoleLabel(access?.requester?.role)) {
    const canNotifySpecialists = await hasPermission(
      actorRoleId,
      PERMISSIONS.NOTIFICATIONS_NOTIFY_TO_SPECIALIST
    );
    if (!canNotifySpecialists) {
      return {
        targetUserIds: [],
        targetRoles: []
      };
    }

    const targetSpecialistIds = normalizedSpecialistIds.filter((id) => id !== actorUserId);
    if (targetSpecialistIds.length === 0) {
      return {
        targetUserIds: [],
        targetRoles: []
      };
    }

    return {
      targetUserIds: targetSpecialistIds,
      targetRoles: []
    };
  }

  if (isSpecialistRole(access?.requester) || normalizedSpecialistIds.includes(actorUserId)) {
    const canNotifyManagers = await hasPermission(
      actorRoleId,
      PERMISSIONS.NOTIFICATIONS_NOTIFY_TO_MANAGER
    );
    if (!canNotifyManagers) {
      return {
        targetUserIds: [],
        targetRoles: []
      };
    }

    return {
      targetUserIds: [],
      targetRoles: ["manager"]
    };
  }

  return {
    targetUserIds: [],
    targetRoles: []
  };
}

export async function broadcastAppointmentChange(access, {
  type,
  message,
  specialistIds,
  data = {}
}) {
  const normalizedSpecialistIds = normalizeSpecialistIds(specialistIds);
  const normalizedData = data && typeof data === "object" ? data : {};
  const payloadData = {
    specialistIds: normalizedSpecialistIds,
    ...normalizedData
  };
  const audience = await resolveNotificationAudience(access, specialistIds);
  if (audience.targetUserIds.length === 0 && audience.targetRoles.length === 0) {
    return;
  }

  const organizationId = parsePositiveInteger(access?.authContext?.organizationId);
  const sourceUserId = parsePositiveInteger(access?.authContext?.userId);
  const sourceUsername = String(access?.authContext?.username || "").trim();

  const publishFallbackEvent = () => {
    publishAppointmentEvent({
      organizationId,
      type,
      message,
      sourceUserId,
      sourceUsername,
      targetUserIds: audience.targetUserIds,
      targetRoles: audience.targetRoles,
      data: payloadData
    });
  };

  try {
    const persisted = await persistNotificationEvent({
      organizationId,
      sourceUserId,
      eventType: type,
      message,
      targetUserIds: audience.targetUserIds,
      targetRoles: audience.targetRoles,
      payload: payloadData
    });

    if (!Array.isArray(persisted?.recipientUserIds) || persisted.recipientUserIds.length === 0) {
      return;
    }

    publishAppointmentEvent({
      organizationId,
      type,
      message,
      sourceUserId,
      sourceUsername,
      targetUserIds: persisted.recipientUserIds,
      data: payloadData
    });
  } catch (error) {
    if (isNotificationsSchemaMissing(error)) {
      publishFallbackEvent();
      return;
    }
    publishFallbackEvent();
  }
}

export async function resolveAppointmentVipReadScope({ roleId, requester }) {
  const [canReadAllScope, canReadAssignedScope] = await Promise.all([
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_SCOPE_ALL),
    hasPermission(roleId, PERMISSIONS.APPOINTMENTS_VIP_CLIENTS_SCOPE_ASSIGNED)
  ]);
  if (canReadAllScope) {
    return "all";
  }
  if (canReadAssignedScope) {
    return "assigned";
  }
  return isDirectorLikeRequester(requester) ? "all" : "assigned";
}

export function resolveOwnAppointmentSpecialistUserId(access) {
  const requester = access?.requester;
  if (!requester) {
    return null;
  }
  if (Boolean(requester?.is_admin) || Boolean(requester?.is_platform_admin)) {
    return null;
  }
  if (!isSpecialistRole(requester)) {
    return null;
  }
  const requesterUserId = parsePositiveInteger(access?.authContext?.userId);
  return requesterUserId || null;
}
