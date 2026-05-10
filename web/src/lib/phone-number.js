const NORMALIZED_PHONE_REGEX = /^\+\d{7,15}$/;
const PHONE_INPUT_REGEX = /^[+\d\s().-]+$/;

export function normalizePhoneDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.length === 9) {
    return `998${digits}`;
  }
  if (digits.length === 10) {
    return `7${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }
  return digits;
}

export function normalizePhoneNumber(value) {
  const digits = normalizePhoneDigits(value);
  return digits ? `+${digits}` : "";
}

export function isValidNormalizedPhoneNumber(value) {
  return NORMALIZED_PHONE_REGEX.test(String(value || "").trim());
}

export function isValidPhoneInput(value) {
  const raw = String(value || "").trim();
  if (!raw || !PHONE_INPUT_REGEX.test(raw)) {
    return false;
  }
  return isValidNormalizedPhoneNumber(normalizePhoneNumber(raw));
}
