import { apiFetch, readApiResponseData } from "./api.js";

export const SITE_CONTENT_SECTIONS = Object.freeze(["kids", "team", "partners"]);

export function emptySiteContentGroups() {
  return {
    kids: [],
    team: [],
    partners: []
  };
}

export function normalizeSiteContentGroups(value) {
  const source = value && typeof value === "object" ? value : {};
  return SITE_CONTENT_SECTIONS.reduce((acc, sectionKey) => {
    acc[sectionKey] = Array.isArray(source[sectionKey]) ? source[sectionKey] : [];
    return acc;
  }, emptySiteContentGroups());
}

export async function fetchPublicSiteContent() {
  const response = await apiFetch("/api/site-content", {
    method: "GET",
    cache: "no-store"
  });
  const data = await readApiResponseData(response);
  if (!response.ok) {
    throw new Error(data?.message || "Failed to load site content.");
  }
  return normalizeSiteContentGroups(data?.items);
}

export async function fetchManagedSiteContent() {
  const response = await apiFetch("/api/site-content/manage", {
    method: "GET",
    cache: "no-store"
  });
  const data = await readApiResponseData(response);
  if (!response.ok) {
    throw new Error(data?.message || "Failed to load site content.");
  }
  return normalizeSiteContentGroups(data?.items);
}

export async function createSiteContent(payload) {
  const response = await apiFetch("/api/site-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizeSiteContentPayload(payload))
  });
  const data = await readApiResponseData(response);
  if (!response.ok) {
    const error = new Error(data?.message || "Failed to create site content.");
    error.field = data?.field || "";
    throw error;
  }
  return data?.item || null;
}

export async function updateSiteContent(id, payload) {
  const response = await apiFetch(`/api/site-content/${encodeURIComponent(String(id))}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizeSiteContentPayload(payload))
  });
  const data = await readApiResponseData(response);
  if (!response.ok) {
    const error = new Error(data?.message || "Failed to update site content.");
    error.field = data?.field || "";
    throw error;
  }
  return data?.item || null;
}

function normalizeSiteContentPayload(payload = {}) {
  const sectionKey = String(payload.sectionKey || payload.section_key || "").trim();
  const nextPayload = {
    ...payload,
    sectionKey,
    description: payload.description || payload.descriptionUz || payload.description_uz || ""
  };

  if (sectionKey === "kids") {
    nextPayload.author = payload.author || payload.authorUz || payload.author_uz || "";
    return nextPayload;
  }

  nextPayload.name = payload.name || payload.nameUz || payload.name_uz || "";
  if (sectionKey === "team") {
    nextPayload.role = payload.role || payload.roleUz || payload.role_uz || "";
  }
  return nextPayload;
}

export async function deleteSiteContent(id) {
  const response = await apiFetch(`/api/site-content/${encodeURIComponent(String(id))}`, {
    method: "DELETE"
  });
  const data = await readApiResponseData(response);
  if (!response.ok) {
    throw new Error(data?.message || "Failed to delete site content.");
  }
}
