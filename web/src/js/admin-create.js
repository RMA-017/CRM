const API_BASE_URL = window.CRM_API_BASE_URL || "http://localhost:3003";

const adminCreateForm = document.getElementById("adminCreateForm");
const adminCreateBtn = document.getElementById("adminCreateBtn");
const formFields = ["username", "fullName", "phone", "password", "role"];

const PHONE_REGEX = /^[+]?[0-9\s\-()]{7,15}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

function clearFieldErrors() {
  formFields.forEach((fieldName) => {
    const input = adminCreateForm?.elements?.[fieldName];
    const errorNode = document.getElementById(`${fieldName}Error`);

    input?.classList.remove("input-error");
    if (errorNode) {
      errorNode.textContent = "";
    }
  });
}

function setFieldError(fieldName, message) {
  const input = adminCreateForm?.elements?.[fieldName];
  const errorNode = document.getElementById(`${fieldName}Error`);

  input?.classList.add("input-error");
  if (errorNode) {
    errorNode.textContent = message;
  }
}

function validate(values) {
  const errors = {};

  if (!USERNAME_REGEX.test(values.username)) {
    errors.username = "Username must be 3-30 chars and contain letters, numbers, ., _, -";
  }

  if (!values.fullName.trim()) {
    errors.fullName = "Full name is required.";
  }

  if (!PHONE_REGEX.test(values.phone)) {
    errors.phone = "Phone number must be 7-15 characters.";
  }

  if (values.password.length < 6) {
    errors.password = "Password must be at least 6 characters long.";
  }

  if (!values.role) {
    errors.role = "Role is required.";
  }

  return errors;
}

adminCreateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(adminCreateForm);
  const payload = {
    username: String(formData.get("username") || "").trim(),
    fullName: String(formData.get("fullName") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    password: String(formData.get("password") || ""),
    role: String(formData.get("role") || "").trim()
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
    adminCreateBtn.disabled = true;

    const response = await fetch(`${API_BASE_URL}/api/admin-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data?.errors && typeof data.errors === "object") {
        Object.entries(data.errors).forEach(([fieldName, message]) => {
          if (formFields.includes(fieldName)) {
            setFieldError(fieldName, String(message));
          }
        });
      } else if (data?.field && formFields.includes(data.field)) {
        setFieldError(data.field, data.message || "Invalid value.");
      } else {
        setFieldError("username", data.message || "Failed to create employee account.");
      }
      return;
    }

    if (!data?.user) {
      setFieldError("username", data?.message || "Invalid server response.");
      return;
    }

    adminCreateForm.reset();
    console.log("Created user:", data.user);
    alert(data.message || "Successfully registered.");
  } catch {
    setFieldError("username", "Unexpected error. Please try again.");
  } finally {
    adminCreateBtn.disabled = false;
  }
});

formFields.forEach((fieldName) => {
  const input = adminCreateForm?.elements?.[fieldName];
  input?.addEventListener("input", () => {
    input.classList.remove("input-error");
    const errorNode = document.getElementById(`${fieldName}Error`);
    if (errorNode) {
      errorNode.textContent = "";
    }
  });

  input?.addEventListener("change", () => {
    input.classList.remove("input-error");
    const errorNode = document.getElementById(`${fieldName}Error`);
    if (errorNode) {
      errorNode.textContent = "";
    }
  });
});
