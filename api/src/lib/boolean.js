const BASE_TRUTHY_VALUES = new Set(["1", "true", "yes"]);
const TRUTHY_WITH_ON_VALUES = new Set(["1", "true", "yes", "on"]);

export function toBooleanFlag(value, fallback = false, { acceptOn = false } = {}) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  const truthyValues = acceptOn ? TRUTHY_WITH_ON_VALUES : BASE_TRUTHY_VALUES;
  return truthyValues.has(normalized);
}
