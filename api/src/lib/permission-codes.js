export function normalizePermissionCode(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePermissionCodes(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizePermissionCode(value))
        .filter(Boolean)
    )
  );
}
