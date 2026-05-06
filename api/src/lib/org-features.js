import {
  filterKnownPermissionCodes,
  filterPermissionCodesByFeatures,
  filterPermissionOptionsByFeatures,
  hasAllowedFeature,
  isKnownPermissionCode,
  isPermissionAllowedByFeatures,
  normalizeAllowedFeatures
} from "../../../shared/access-registry.js";

export {
  normalizeAllowedFeatures,
  isKnownPermissionCode,
  filterKnownPermissionCodes
};

export function hasOrgFeature(allowedFeatures, featureKey) {
  return hasAllowedFeature(allowedFeatures, featureKey);
}

function getRequesterAllowedFeatures(requester) {
  const source = requester?.organization_allowed_features
    ?? requester?.organizationAllowedFeatures
    ?? requester?.orgFeatures
    ?? requester?.allowedFeatures
    ?? null;
  return normalizeAllowedFeatures(source);
}

export function requesterHasOrgFeature(requester, featureKey) {
  if (requester?.is_platform_admin) {
    return true;
  }
  return hasOrgFeature(getRequesterAllowedFeatures(requester), featureKey);
}

export function isPermissionAllowedByOrgFeatures(permissionCode, allowedFeatures) {
  return isPermissionAllowedByFeatures(permissionCode, allowedFeatures);
}

export function filterPermissionCodesByOrgFeatures(permissionCodes, allowedFeatures) {
  return filterPermissionCodesByFeatures(permissionCodes, allowedFeatures);
}

export function filterPermissionOptionsByOrgFeatures(permissionOptions, allowedFeatures) {
  return filterPermissionOptionsByFeatures(permissionOptions, allowedFeatures);
}
