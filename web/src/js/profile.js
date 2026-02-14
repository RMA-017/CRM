const API_BASE_URL = window.CRM_API_BASE_URL || "http://localhost:3003";
const logoutBtn = document.getElementById("logoutBtn");
const LOGOUT_FLAG_KEY = "crm_just_logged_out";

async function loadProfile() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
      method: "GET",
      credentials: "include"
    });

    const profileData = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.location.replace("/login");
      return;
    }

    document.getElementById("profileUsername").textContent = profileData.username || "-";
    document.getElementById("profileFullName").textContent = profileData.fullName || "-";
    document.getElementById("profileRole").textContent = profileData.role || "-";
    document.getElementById("profilePhone").textContent = profileData.phone || "-";
  } catch {
    window.location.replace("/login");
  }
}

loadProfile();

logoutBtn?.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  sessionStorage.setItem(LOGOUT_FLAG_KEY, "1");

  try {
    await fetch(`${API_BASE_URL}/api/login/logout`, {
      method: "POST",
      credentials: "include"
    });
  } finally {
    window.location.replace("/login");
  }
});
