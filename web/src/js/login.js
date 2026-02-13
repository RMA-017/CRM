const API_BASE_URL = window.CRM_API_BASE_URL || "http://localhost:3000/api";

const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");
const formFields = ["email", "password"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setStatus(message, type = "") {
  loginStatus.textContent = message;
  loginStatus.className = `status ${type}`.trim();
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

  if (!EMAIL_REGEX.test(values.email)) {
    errors.email = "Invalid email format.";
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
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || "")
  };

  clearFieldErrors();
  setStatus("");

  const errors = validate(payload);
  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([fieldName, message]) => {
      setFieldError(fieldName, message);
    });
    setStatus("Please fix the highlighted fields.", "error");
    return;
  }

  try {
    loginBtn.disabled = true;
    setStatus("Verifying...");

    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data.message || "Invalid email or password.";
      setFieldError("password", message);
      throw new Error(message);
    }

    if (data.token) {
      localStorage.setItem("crm_access_token", data.token);
    }

    setStatus(data.message || "Login successful.", "success");
  } catch (errorObj) {
    setStatus(errorObj.message || "Unexpected error.", "error");
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
