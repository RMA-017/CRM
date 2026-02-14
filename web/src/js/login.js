const API_BASE_URL = window.CRM_API_BASE_URL || "http://localhost:3003";

const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const formFields = ["username", "password"];
const LOGOUT_FLAG_KEY = "crm_just_logged_out";

async function redirectIfAuthenticated() {
  const justLoggedOut = sessionStorage.getItem(LOGOUT_FLAG_KEY) === "1";
  if (justLoggedOut) {
    sessionStorage.removeItem(LOGOUT_FLAG_KEY);
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
      method: "GET",
      credentials: "include"
    });

    if (response.ok) {
      window.location.replace("/profile");
    }
  } catch {
    // Stay on login page when profile check fails.
  }
}

function clearFieldErrors() {
  formFields.forEach((fieldName) => {
    const input = loginForm?.elements?.[fieldName];
    const errorNode = document.getElementById(`${fieldName}Error`);

    input?.classList.remove("input-error");
    if (errorNode) {
      errorNode.textContent = "";
    }
  });
}

function setFieldError(fieldName, message) {
  const input = loginForm?.elements?.[fieldName];
  const errorNode = document.getElementById(`${fieldName}Error`);

  input?.classList.add("input-error");
  if (errorNode) {
    errorNode.textContent = message;
  }
}

function validate(values) {
  const errors = {};

  if (!values.username.trim()) {
    errors.username = "Username is required.";
  }

  if (!values.password) {
    errors.password = "Password is required.";
  }

  return errors;
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const payload = {
    username: String(formData.get("username") || "").trim(),
    password: String(formData.get("password") || "")
  };

  clearFieldErrors();

  const errors = validate(payload);
  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([fieldName, message]) => {
      setFieldError(fieldName, message);
    });
    return;
  }

  try {
    loginBtn.disabled = true;

    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data?.field && formFields.includes(data.field)) {
        setFieldError(data.field, data.message || "Invalid value.");
      } else {
        setFieldError("password", data.message || "Invalid username or password.");
      }
      return;
    }

    window.location.replace("/profile");
  } catch {
    setFieldError("password", "Unexpected error. Please try again.");
  } finally {
    loginBtn.disabled = false;
  }
});

formFields.forEach((fieldName) => {
  const input = loginForm?.elements?.[fieldName];
  input?.addEventListener("input", () => {
    input.classList.remove("input-error");
    const errorNode = document.getElementById(`${fieldName}Error`);
    if (errorNode) {
      errorNode.textContent = "";
    }
  });
});

redirectIfAuthenticated();
