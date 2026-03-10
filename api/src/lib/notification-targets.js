import { parsePositiveInteger } from "./number.js";
import {
  MANAGER_ROLE_MATCHERS,
  isManagerLikeRoleLabel,
  normalizeRoleLabel
} from "./role-labels.js";

export { MANAGER_ROLE_MATCHERS, isManagerLikeRoleLabel };

export function normalizeNotificationRoleLabel(value) {
  return normalizeRoleLabel(value);
}

export function normalizeNotificationTargetUserIds(value, {
  allowSingle = false
} = {}) {
  const source = Array.isArray(value) ? value : (allowSingle ? [value] : []);
  return Array.from(
    new Set(
      source
        .map((item) => parsePositiveInteger(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
}

export function normalizeNotificationRouteTargetUserIds(value) {
  return normalizeNotificationTargetUserIds(value, { allowSingle: true });
}

export function normalizeNotificationTargetRoles(value, {
  allowSingle = false,
  maxLength = Number.POSITIVE_INFINITY,
  allowedRoles = null
} = {}) {
  const source = Array.isArray(value) ? value : (allowSingle ? [value] : []);
  const allowedRoleSet = allowedRoles instanceof Set
    ? allowedRoles
    : (Array.isArray(allowedRoles) ? new Set(allowedRoles) : null);

  return Array.from(
    new Set(
      source
        .map((item) => normalizeNotificationRoleLabel(item))
        .filter((item) => item.length > 0 && item.length <= maxLength)
        .filter((item) => !allowedRoleSet || allowedRoleSet.has(item))
    )
  );
}

export function normalizeNotificationRouteTargetRoles(value) {
  return normalizeNotificationTargetRoles(value, {
    allowSingle: true,
    maxLength: 100
  });
}

export function normalizeManagerNotificationTargetRoles(value) {
  return normalizeNotificationTargetRoles(value, {
    allowedRoles: ["manager"]
  });
}
