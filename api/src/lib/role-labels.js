export const MANAGER_ROLE_MATCHERS = Object.freeze([
  "manager",
  "menedj",
  "meneger",
  "menejer",
  "менедж"
]);

export const DIRECTOR_ROLE_MATCHERS = Object.freeze([
  "director",
  "direktor",
  "директор"
]);

export const SPECIALIST_ROLE_MATCHERS = Object.freeze([
  "specialist",
  "spetsialist",
  "mutaxassis",
  "специалист"
]);

export const TUTOR_ROLE_MATCHERS = Object.freeze([
  "tutor"
]);

export function normalizeRoleLabel(value) {
  return String(value || "").trim().toLowerCase();
}

export function joinNormalizedRoleLabelParts(...parts) {
  return parts
    .map((part) => normalizeRoleLabel(part))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function hasAnyRoleMatcher(value, matchers) {
  const normalized = normalizeRoleLabel(value);
  if (!normalized) {
    return false;
  }
  return matchers.some((matcher) => normalized.includes(matcher));
}

export function isManagerLikeRoleLabel(value) {
  return hasAnyRoleMatcher(value, MANAGER_ROLE_MATCHERS);
}

export function isDirectorLikeRoleLabel(value) {
  return hasAnyRoleMatcher(value, DIRECTOR_ROLE_MATCHERS);
}

export function isSpecialistLikeRoleLabel(value) {
  return hasAnyRoleMatcher(value, SPECIALIST_ROLE_MATCHERS);
}

export function isTutorLikeRoleLabel(value) {
  return hasAnyRoleMatcher(value, TUTOR_ROLE_MATCHERS);
}
