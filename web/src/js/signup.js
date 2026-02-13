const API_BASE_URL = window.CRM_API_BASE_URL || "http://localhost:3000/api";

const signupForm = document.getElementById("signupForm");
const signupBtn = document.getElementById("signupBtn");
const signupStatus = document.getElementById("signupStatus");
const formFields = ["fullName", "email", "password", "phone"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+]?[0-9\s\-()]{7,20}$/;

function setStatus(message, type = "") {
  signupStatus.textContent = message;
  signupStatus.className = `status ${type}`.trim();
}

function clearFieldErrors() {
  formFields.forEach((fieldName) => {
    const input = signupForm?.elements?.[fieldName];
    const errorNode = document.getElementById(`${fieldName}Error`);

    input?.classList.remove("input-error");
    if (errorNode) {
      errorNode.textContent = "";
    }
  });
}

function setFieldError(fieldName, message) {
  const input = signupForm?.elements?.[fieldName];
  const errorNode = document.getElementById(`${fieldName}Error`);

  input?.classList.add("input-error");
  if (errorNode) {
    errorNode.textContent = message;
  }
}

function validate(values) {
  const errors = {};

  if (!values.fullName.trim()) {
    errors.fullName = "Full name is required.";
  }

  if (!EMAIL_REGEX.test(values.email)) {
    errors.email = "Invalid email format.";
  }

  if (values.password.length < 6) {
    errors.password = "Password must be at least 6 characters long.";
  }

  if (!PHONE_REGEX.test(values.phone)) {
    errors.phone = "Invalid phone number format.";
  }

  return errors;
}

signupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(signupForm);
  const payload = {
    fullName: String(formData.get("fullName") || "").trim(),
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || ""),
    phone: String(formData.get("phone") || "").trim()
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
    signupBtn.disabled = true;
    setStatus("Submitting...");

    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || "Sign up failed.");
    }

    setStatus(data.message || "Sign up completed successfully.", "success");
    signupForm.reset();

    setTimeout(() => {
      window.location.href = "./login.html";
    }, 1000);
  } catch (errorObj) {
    setStatus(errorObj.message || "Unexpected error.", "error");
  } finally {
    signupBtn.disabled = false;
  }
});

formFields.forEach((fieldName) => {
  const input = signupForm?.elements?.[fieldName];
  input?.addEventListener("input", () => {
    input.classList.remove("input-error");
    const errorNode = document.getElementById(`${fieldName}Error`);
    if (errorNode) {
      errorNode.textContent = "";
    }
  });
});
