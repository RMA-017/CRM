function getDefaultApiBaseUrl() {
  if (typeof window === "undefined" || !window.location) {
    return "http://localhost:3003";
  }

  const protocol = String(window.location.protocol || "http:");
  const hostname = String(window.location.hostname || "").trim().toLowerCase();
  const port = String(window.location.port || "").trim();
  const isPrivateIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) && (
    hostname.startsWith("10.")
    || hostname.startsWith("127.")
    || hostname.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
  const isLocalHost = hostname === "localhost" || hostname.endsWith(".local") || isPrivateIpv4;

  // In local Vite dev, route API calls through the dev proxy to avoid CORS issues.
  if (port === "5173") {
    return "";
  }

  // For local static preview and LAN testing, keep the API on port 3003.
  if (isLocalHost && port !== "3003") {
    return `${protocol}//${hostname}:3003`;
  }

  // In production, prefer same-origin /api behind a reverse proxy.
  return "";
}

const runtimeBaseUrl = getDefaultApiBaseUrl();
export const API_BASE_URL = (typeof window !== "undefined" && window.CRM_API_BASE_URL) || runtimeBaseUrl;
const STARTUP_RETRY_STATUS_CODES = new Set([502, 503, 504]);
const MAX_STARTUP_RETRIES = 5;
const STARTUP_RETRY_DELAY_MS = 350;

const DEFAULT_ERROR_MESSAGES = Object.freeze({
  400: "Bad request.",
  401: "Unauthorized.",
  403: "Forbidden.",
  404: "Not found.",
  409: "Conflict.",
  429: "Too many requests.",
  500: "Internal server error."
});

function shouldRetryApiRequest({ method, status, attempt, error }) {
  if (attempt >= MAX_STARTUP_RETRIES) {
    return false;
  }
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }
  if (error) {
    return true;
  }
  return STARTUP_RETRY_STATUS_CODES.has(status);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function apiFetch(path, options = {}) {
  const requestOptions = {
    credentials: "include",
    ...options
  };
  const method = String(requestOptions.method || "GET").trim().toUpperCase();
  const url = `${API_BASE_URL}${path}`;

  for (let attempt = 0; attempt <= MAX_STARTUP_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, requestOptions);
      if (!shouldRetryApiRequest({
        method,
        status: Number(response?.status || 0),
        attempt,
        error: null
      })) {
        return response;
      }
    } catch (error) {
      if (!shouldRetryApiRequest({ method, status: 0, attempt, error })) {
        throw error;
      }
    }

    const delayMs = STARTUP_RETRY_DELAY_MS * (attempt + 1);
    await wait(delayMs);
  }

  return fetch(url, requestOptions);
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
