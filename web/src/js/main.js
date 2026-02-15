const API_BASE_URL = window.CRM_API_BASE_URL || "http://localhost:3003";

const openLoginBtn = document.getElementById("openLoginBtn");
const openProfileBtn = document.getElementById("openProfileBtn");
const homeLoginPanel = document.getElementById("homeLoginPanel");
const homeLoginForm = document.getElementById("homeLoginForm");
const homeLoginSubmit = document.getElementById("homeLoginSubmit");
const loginOverlay = document.getElementById("loginOverlay");
const LOGOUT_FLAG_KEY = "crm_just_logged_out";
const MAIN_VIEW_KEY = "crm_profile_main_view";

openLoginBtn.hidden = true;
openProfileBtn.hidden = true;

function setError(field, message) {
  const input = homeLoginForm?.elements?.[field];
  const errorNode = document.getElementById(`home${field.charAt(0).toUpperCase() + field.slice(1)}Error`);
  input?.classList.add("input-error");
  if (errorNode) {
    errorNode.textContent = message;
  }
}

function clearErrors() {
  ["username", "password"].forEach((field) => {
    const input = homeLoginForm?.elements?.[field];
    const errorNode = document.getElementById(`home${field.charAt(0).toUpperCase() + field.slice(1)}Error`);
    input?.classList.remove("input-error");
    if (errorNode) {
      errorNode.textContent = "";
    }
  });
}

function renderGuest() {
  openLoginBtn.hidden = false;
  openProfileBtn.hidden = true;
}

function renderAuthenticated() {
  openLoginBtn.hidden = true;
  openProfileBtn.hidden = false;
}

async function loadCurrentUser() {
  const justLoggedOut = sessionStorage.getItem(LOGOUT_FLAG_KEY) === "1";
  if (justLoggedOut) {
    sessionStorage.removeItem(LOGOUT_FLAG_KEY);
    renderGuest();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.username) {
      renderGuest();
      return;
    }

    renderAuthenticated();
  } catch {
    renderGuest();
  }
}

function closeLogin() {
  homeLoginPanel.hidden = true;
  homeLoginPanel.classList.remove("open");
  loginOverlay.hidden = true;
  clearErrors();
  homeLoginForm?.reset();
}

function openLogin() {
  homeLoginPanel.hidden = false;
  homeLoginPanel.classList.add("open");
  loginOverlay.hidden = false;
}

openLoginBtn?.addEventListener("click", openLogin);
openProfileBtn?.addEventListener("click", () => {
  window.location.replace("/profile");
});
loginOverlay?.addEventListener("click", closeLogin);

homeLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(homeLoginForm);
  const payload = {
    username: String(formData.get("username") || "").trim(),
    password: String(formData.get("password") || "")
  };

  clearErrors();

  if (!payload.username) {
    setError("username", "Username is required.");
  }

  if (!payload.password) {
    setError("password", "Password is required.");
  }

  if (!payload.username || !payload.password) {
    return;
  }

  try {
    homeLoginSubmit.disabled = true;

    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data?.field === "username" || data?.field === "password") {
        setError(data.field, data.message || "Invalid value.");
      } else {
        setError("password", data?.message || "Invalid username or password.");
      }
      return;
    }

    sessionStorage.removeItem(MAIN_VIEW_KEY);
    window.location.replace("/profile");
  } catch {
    setError("password", "Unexpected error. Please try again.");
  } finally {
    homeLoginSubmit.disabled = false;
  }
});

["username", "password"].forEach((field) => {
  const input = homeLoginForm?.elements?.[field];
  input?.addEventListener("input", () => {
    input.classList.remove("input-error");
    const errorNode = document.getElementById(`home${field.charAt(0).toUpperCase() + field.slice(1)}Error`);
    if (errorNode) {
      errorNode.textContent = "";
    }
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!homeLoginPanel.hidden) {
      closeLogin();
    }
  }
});

loadCurrentUser();
