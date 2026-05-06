import {
  filterKnownPermissionCodes,
  hasAllowedFeature,
  isKnownPermissionCode,
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

export function requesterHasOrgFeature(requester, featureKey) {
  return true;
}

export function isPermissionAllowedByOrgFeatures(permissionCode, allowedFeatures) {
  return true;
}

export function filterPermissionCodesByOrgFeatures(permissionCodes, allowedFeatures) {
  return Array.isArray(permissionCodes) ? filterKnownPermissionCodes(permissionCodes) : [];
}

export function filterPermissionOptionsByOrgFeatures(permissionOptions, allowedFeatures) {
  return Array.isArray(permissionOptions) ? permissionOptions : [];
}
