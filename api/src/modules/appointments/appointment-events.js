const listenersByOrganization = new Map();

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeRoleLabel(value) {
  return String(value || "").trim().toLowerCase();
}

function isManagerRole({ roleLabel, isAdmin }) {
  if (Boolean(isAdmin)) {
    return true;
  }
  const normalizedRole = normalizeRoleLabel(roleLabel);
  return (
    normalizedRole.includes("manager")
    || normalizedRole.includes("menedj")
    || normalizedRole.includes("meneger")
    || normalizedRole.includes("menejer")
    || normalizedRole.includes("менедж")
  );
}

function normalizeTargetUserIds(value) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      source
        .map((item) => normalizePositiveInteger(item))
        .filter((item) => item > 0)
    )
  );
}

function normalizeTargetRoles(value) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      source
        .map((item) => normalizeRoleLabel(item))
        .filter((item) => item === "manager")
    )
  );
}

function shouldDeliverToSubscriber(subscriber, payload) {
  if (payload.sourceUserId > 0 && subscriber.userId === payload.sourceUserId) {
    return false;
  }

  const hasTargetUserIds = payload.targetUserIds.length > 0;
  const hasTargetRoles = payload.targetRoles.length > 0;
  if (!hasTargetUserIds && !hasTargetRoles) {
    return false;
  }

  if (hasTargetUserIds && payload.targetUserIds.includes(subscriber.userId)) {
    return true;
  }

  if (hasTargetRoles && payload.targetRoles.includes("manager") && subscriber.isManager) {
    return true;
  }

  return false;
}

export function subscribeAppointmentEvents({
  organizationId,
  userId,
  roleLabel = "",
  isAdmin = false,
  listener
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  const normalizedUserId = normalizePositiveInteger(userId);
  if (!normalizedOrganizationId || !normalizedUserId || typeof listener !== "function") {
    return () => {};
  }

  const subscriber = {
    userId: normalizedUserId,
    roleLabel: normalizeRoleLabel(roleLabel),
    isManager: isManagerRole({ roleLabel, isAdmin: Boolean(isAdmin) }),
    listener
  };

  let listeners = listenersByOrganization.get(normalizedOrganizationId);
  if (!listeners) {
    listeners = new Set();
    listenersByOrganization.set(normalizedOrganizationId, listeners);
  }
  listeners.add(subscriber);

  return () => {
    const registeredListeners = listenersByOrganization.get(normalizedOrganizationId);
    if (!registeredListeners) {
      return;
    }
    registeredListeners.delete(subscriber);
    if (registeredListeners.size === 0) {
      listenersByOrganization.delete(normalizedOrganizationId);
    }
  };
}

export function publishAppointmentEvent({
  organizationId,
  type = "schedule-updated",
  message = "",
  sourceUserId = "",
  sourceUsername = "",
  targetUserIds = [],
  targetRoles = [],
  data = {}
}) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId) {
    return 0;
  }

  const listeners = listenersByOrganization.get(normalizedOrganizationId);
  if (!listeners || listeners.size === 0) {
    return 0;
  }

  const payload = {
    organizationId: normalizedOrganizationId,
    type: String(type || "schedule-updated").trim().toLowerCase() || "schedule-updated",
    message: String(message || "").trim(),
    sourceUserId: normalizePositiveInteger(sourceUserId),
    sourceUsername: String(sourceUsername || "").trim(),
    targetUserIds: normalizeTargetUserIds(targetUserIds),
    targetRoles: normalizeTargetRoles(targetRoles),
    data: data && typeof data === "object" ? data : {},
    timestamp: new Date().toISOString()
  };

  if (payload.targetUserIds.length === 0 && payload.targetRoles.length === 0) {
    return 0;
  }

  let deliveredCount = 0;
  listeners.forEach((subscriber) => {
    if (!shouldDeliverToSubscriber(subscriber, payload)) {
      return;
    }
    try {
      subscriber.listener(payload);
      deliveredCount += 1;
    } catch {
      // Listener errors must not break other subscribers.
    }
  });
  return deliveredCount;
}
