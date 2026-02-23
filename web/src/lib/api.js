function getDefaultApiBaseUrl() {
  if (typeof window === "undefined" || !window.location) {
    return "http://localhost:3003";
  }

  return `${window.location.protocol}//${window.location.hostname}:3003`;
}

const runtimeBaseUrl = getDefaultApiBaseUrl();
export const API_BASE_URL = (typeof window !== "undefined" && window.CRM_API_BASE_URL) || runtimeBaseUrl;

export async function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options
  });
}
