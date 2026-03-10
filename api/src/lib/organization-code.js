export function normalizeOrganizationCode(value) {
  return String(value || "").trim().toLowerCase();
}
