
const API_BASE_URL = window.CRM_API_BASE_URL || "http://localhost:3003";

async function loadProfile() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
      method: "GET",
      credentials: "include"
    });

    const profileData = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.location.href = "/login";
      return;
    }

    document.getElementById("profileUsername").textContent = profileData.username || "-";
    document.getElementById("profileFullName").textContent = profileData.fullName || "-";
    document.getElementById("profileRole").textContent = profileData.role || "-";
    document.getElementById("profilePhone").textContent = profileData.phone || "-";
  } catch {
    window.location.href = "/login";
  }
}

loadProfile();
