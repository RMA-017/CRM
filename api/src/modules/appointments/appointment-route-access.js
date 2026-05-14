import { parsePositiveInteger } from "../../lib/number.js";
import {
  isManagerLikeRoleLabel,
  isSpecialistLikeRoleLabel,
  joinNormalizedRoleLabelParts
} from "../../lib/role-labels.js";
import { isNotificationsSchemaMissing, persistNotificationEvent } from "../notifications/notifications.service.js";
import { notifyTelegramParentsForAppointmentChange } from "../telegram-bot/telegram-bot.service.js";
import { publishAppointmentEvent } from "./appointment-events.js";
import { normalizeSpecialistIds } from "./appointment-route-helpers.js";

function isSpecialistRole(requester) {
  const roleText = joinNormalizedRoleLabelParts(requester?.role_label || requester?.role);
  if (isManagerLikeRoleLabel(roleText)) {
    return false;
  }
  if (isSpecialistLikeRoleLabel(roleText)) {
    return true;
  }
  const positionText = joinNormalizedRoleLabelParts(requester?.position_label || requester?.position);
  return !roleText && isSpecialistLikeRoleLabel(positionText);
}

async function resolveNotificationAudience(access, specialistIds) {
  const actorUserId = parsePositiveInteger(access?.authContext?.userId);
  const normalizedSpecialistIds = normalizeSpecialistIds(specialistIds);
  if (!actorUserId || normalizedSpecialistIds.length === 0) {
    return {
      targetUserIds: [],
      targetRoles: []
    };
  }

  const requesterRoleText = joinNormalizedRoleLabelParts(
    access?.requester?.role_label || access?.requester?.role
  );
  if (
    Boolean(access?.requester?.is_admin)
    || Boolean(access?.requester?.is_platform_admin)
    || isManagerLikeRoleLabel(requesterRoleText)
  ) {
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
  const organizationId = parsePositiveInteger(access?.authContext?.organizationId);
  const sourceUserId = parsePositiveInteger(access?.authContext?.userId);
  const sourceUsername = String(access?.authContext?.username || "").trim();
  const notifyParents = async () => {
    await notifyTelegramParentsForAppointmentChange({
      organizationId,
      eventType: type,
      items: payloadData.items,
      actorName: payloadData.actorFullName || payloadData.actorFirstName || sourceUsername,
      notificationContext: payloadData
    }).catch(() => {});
  };
  const audience = await resolveNotificationAudience(access, specialistIds);
  if (audience.targetUserIds.length === 0 && audience.targetRoles.length === 0) {
    await notifyParents();
    return;
  }

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
      await notifyParents();
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
    await notifyParents();
  } catch (error) {
    if (isNotificationsSchemaMissing(error)) {
      publishFallbackEvent();
      await notifyParents();
      return;
    }
    publishFallbackEvent();
    await notifyParents();
  }
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
