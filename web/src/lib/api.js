export const API_BASE_URL = window.CRM_API_BASE_URL || "http://localhost:3003";

export async function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options
  });
}
