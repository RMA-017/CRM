import { parsePositiveInteger } from "./number.js";

export function parseNullableBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

export function parseBooleanOr(value, fallback = false) {
  const parsed = parseNullableBoolean(value);
  return parsed === null ? fallback : parsed;
}

export function parseOptionalOrganizationId(value) {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }

  const parsed = parsePositiveInteger(value);
  if (!parsed) {
    return {
      error: {
        field: "organizationId",
        message: "Invalid organization id."
      }
    };
  }

  return { value: parsed };
}
