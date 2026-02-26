function getDefaultApiBaseUrl() {
  if (typeof window === "undefined" || !window.location) {
    return "http://localhost:3003";
  }

  return `${window.location.protocol}//${window.location.hostname}:3003`;
}

const runtimeBaseUrl = getDefaultApiBaseUrl();
export const API_BASE_URL = (typeof window !== "undefined" && window.CRM_API_BASE_URL) || runtimeBaseUrl;

const DEFAULT_ERROR_MESSAGES = Object.freeze({
  400: "Bad request.",
  401: "Unauthorized.",
  403: "Forbidden.",
  404: "Not found.",
  409: "Conflict.",
  429: "Too many requests.",
  500: "Internal server error."
});

export async function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options
  });
}

export async function readApiResponseData(response) {
  const status = Number(response?.status || 0);
  if (status === 204 || status === 205) {
    return {};
  }

  const contentType = String(response?.headers?.get?.("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => ({}));
    if (payload && typeof payload === "object") {
      return payload;
    }
    return { value: payload };
  }

  const text = await response.text().catch(() => "");
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    return {};
  }
  try {
    const parsed = JSON.parse(normalizedText);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return { value: parsed };
  } catch {
    return { message: normalizedText };
  }
}

export function normalizeApiError(response, data, fallbackMessage = "Request failed.") {
  const payload = data && typeof data === "object" ? data : {};
  const status = Number(response?.status || 0);

  const payloadMessage = typeof payload.message === "string" ? payload.message.trim() : "";
  const message = payloadMessage
    || DEFAULT_ERROR_MESSAGES[status]
    || fallbackMessage;

  return {
    status,
    message,
    field: typeof payload.field === "string" ? payload.field.trim() : "",
    errors: payload.errors && typeof payload.errors === "object" && !Array.isArray(payload.errors)
      ? payload.errors
      : {},
    code: typeof payload.code === "string" ? payload.code.trim() : ""
  };
}

export function getApiErrorMessage(response, data, fallbackMessage = "Request failed.") {
  return normalizeApiError(response, data, fallbackMessage).message;
}
