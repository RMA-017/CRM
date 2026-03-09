import {
  ALL_ORG_FEATURE_KEYS,
  filterPermissionCodesByFeatures,
  filterPermissionOptionsByFeatures,
  getPrimaryFeatureKeyForPermissionCode,
  getFeatureKeysForPermissionCode,
  hasAllowedFeature,
  isPermissionAllowedByFeatures,
  normalizeAllowedFeatures
} from "../../../shared/access-registry.js";

export { ALL_ORG_FEATURE_KEYS, normalizeAllowedFeatures, getFeatureKeysForPermissionCode };

export function hasOrgFeature(allowedFeatures, featureKey) {
  return hasAllowedFeature(allowedFeatures, featureKey);
}

export function getRequesterAllowedFeatures(requester) {
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

export function getFeatureForPermissionCode(permissionCode) {
  return getPrimaryFeatureKeyForPermissionCode(permissionCode);
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
