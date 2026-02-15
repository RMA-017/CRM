const API_BASE_URL = window.CRM_API_BASE_URL || "http://localhost:3003";

const menuToggle = document.getElementById("menuToggle");
const mainMenu = document.getElementById("mainMenu");
const menuOverlay = document.getElementById("menuOverlay");
const toggleUsersMenuBtn = document.getElementById("toggleUsersMenuBtn");
const usersSubMenu = document.getElementById("usersSubMenu");
const usersMenuGroup = document.getElementById("usersMenuGroup");

const headerUserNameBtn = document.getElementById("headerUserNameBtn");
const headerUserNameText = document.getElementById("headerUserNameText");
const headerUserMenu = document.getElementById("headerUserMenu");
const openMyProfileBtn = document.getElementById("openMyProfileBtn");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const headerLogoutBtn = document.getElementById("headerLogoutBtn");

const headerAvatarInput = document.getElementById("headerAvatarInput");
const headerAvatarImage = document.getElementById("headerAvatarImage");
const headerAvatarFallback = document.getElementById("headerAvatarFallback");

const myProfileModal = document.getElementById("myProfileModal");
const myProfileOverlay = document.getElementById("myProfileOverlay");
const myProfilePhotoImage = document.getElementById("myProfilePhotoImage");
const myProfilePhotoFallback = document.getElementById("myProfilePhotoFallback");

const logoutConfirmModal = document.getElementById("logoutConfirmModal");
const logoutConfirmOverlay = document.getElementById("logoutConfirmOverlay");
const logoutConfirmYes = document.getElementById("logoutConfirmYes");
const logoutConfirmNo = document.getElementById("logoutConfirmNo");
const openCreateUserBtn = document.getElementById("openCreateUserBtn");
const createUserModal = document.getElementById("createUserModal");
const createUserOverlay = document.getElementById("createUserOverlay");
const adminCreateForm = document.getElementById("adminCreateForm");
const adminCreateBtn = document.getElementById("adminCreateBtn");
const adminFormFields = ["username", "fullName", "role"];
const roleSelect = document.getElementById("roleSelect");
const roleSelectTrigger = document.getElementById("roleSelectTrigger");
const roleSelectMenu = document.getElementById("roleSelectMenu");
const roleSelectLabel = document.getElementById("roleSelectLabel");
const roleSelectOptions = Array.from(document.querySelectorAll(".custom-select-option"));
const LOGOUT_FLAG_KEY = "crm_just_logged_out";

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

let currentProfile = null;

function getInitial(text) {
  const value = String(text || "").trim();
  return (value[0] || "U").toUpperCase();
}

function formatDateYMD(value) {
  if (!value) {
    return "-";
  }

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return {};
  }

  return {
    username: profile.username || "",
    email: profile.email || "",
    fullName: profile.fullName || profile.full_name || profile.name || "",
    birthday: profile.birthday || "",
    phone: profile.phone || profile.phone_number || "",
    position: profile.position || "",
    role: profile.role || ""
  };
}

function getAvatarStorageKey() {
  const username = String(currentProfile?.username || "").trim();
  if (!username) {
    return null;
  }
  return `crm_avatar_${username}`;
}

function applyAvatar(dataUrl) {
  const fallback = getInitial(currentProfile?.fullName || currentProfile?.username || "User");

  headerAvatarFallback.textContent = fallback;
  myProfilePhotoFallback.textContent = fallback;

  if (dataUrl) {
    headerAvatarImage.src = dataUrl;
    myProfilePhotoImage.src = dataUrl;

    headerAvatarImage.hidden = false;
    myProfilePhotoImage.hidden = false;

    headerAvatarFallback.hidden = true;
    myProfilePhotoFallback.hidden = true;
    return;
  }

  headerAvatarImage.hidden = true;
  myProfilePhotoImage.hidden = true;
  headerAvatarFallback.hidden = false;
  myProfilePhotoFallback.hidden = false;
}

function loadSavedAvatar() {
  const key = getAvatarStorageKey();
  if (!key) {
    applyAvatar("");
    return;
  }

  const saved = localStorage.getItem(key) || "";
  applyAvatar(saved);
}

function applyRoleVisibility() {
  if (!usersMenuGroup) {
    return;
  }

  const role = String(currentProfile?.role || "").toLowerCase();
  usersMenuGroup.hidden = role !== "admin";
}

function closeMenu() {
  const activeElement = document.activeElement;
  if (activeElement && mainMenu.contains(activeElement)) {
    activeElement.blur();
    menuToggle?.focus();
  }

  mainMenu.classList.remove("open");
  menuOverlay.hidden = true;
  menuToggle.setAttribute("aria-expanded", "false");
  mainMenu.setAttribute("aria-hidden", "true");
  if (usersSubMenu && toggleUsersMenuBtn) {
    usersSubMenu.hidden = true;
    toggleUsersMenuBtn.setAttribute("aria-expanded", "false");
  }
}

function openMenu() {
  mainMenu.classList.add("open");
  menuOverlay.hidden = false;
  menuToggle.setAttribute("aria-expanded", "true");
  mainMenu.setAttribute("aria-hidden", "false");
}

function toggleUsersSubMenu() {
  if (!usersSubMenu || !toggleUsersMenuBtn) {
    return;
  }

  const willOpen = usersSubMenu.hidden;
  usersSubMenu.hidden = !willOpen;
  toggleUsersMenuBtn.setAttribute("aria-expanded", String(willOpen));
}

function closeUserDropdown() {
  headerUserMenu.hidden = true;
  headerUserNameBtn.setAttribute("aria-expanded", "false");
}

function openUserDropdown() {
  headerUserMenu.hidden = false;
  headerUserNameBtn.setAttribute("aria-expanded", "true");
}

function toggleUserDropdown() {
  if (headerUserMenu.hidden) {
    openUserDropdown();
    return;
  }
  closeUserDropdown();
}

function closeMyProfileModal() {
  myProfileModal.hidden = true;
  myProfileOverlay.hidden = true;
}

function openMyProfileModal() {
  if (!currentProfile) {
    return;
  }

  document.getElementById("modalProfileUsername").textContent = currentProfile.username || "-";
  document.getElementById("modalProfileEmail").textContent = currentProfile.email || "-";
  document.getElementById("modalProfileFullName").textContent = currentProfile.fullName || "-";
  document.getElementById("modalProfileBirthday").textContent = formatDateYMD(currentProfile.birthday);
  document.getElementById("modalProfilePassword").textContent = "********";
  document.getElementById("modalProfilePhone").textContent = currentProfile.phone || "-";
  document.getElementById("modalProfilePosition").textContent = currentProfile.position || "-";
  document.getElementById("modalProfileRole").textContent = currentProfile.role || "-";

  myProfileModal.hidden = false;
  myProfileOverlay.hidden = false;
}

function closeLogoutConfirm() {
  logoutConfirmModal.hidden = true;
  logoutConfirmOverlay.hidden = true;
}

function openLogoutConfirm() {
  logoutConfirmModal.hidden = false;
  logoutConfirmOverlay.hidden = false;
}

function clearAdminFieldErrors() {
  adminFormFields.forEach((fieldName) => {
    const input = adminCreateForm?.elements?.[fieldName];
    const errorNode = document.getElementById(`${fieldName}Error`);

    input?.classList.remove("input-error");
    if (fieldName === "role") {
      roleSelectTrigger?.classList.remove("input-error");
    }
    if (errorNode) {
      errorNode.textContent = "";
    }
  });
}

function setAdminFieldError(fieldName, message) {
  const input = adminCreateForm?.elements?.[fieldName];
  const errorNode = document.getElementById(`${fieldName}Error`);

  input?.classList.add("input-error");
  if (fieldName === "role") {
    roleSelectTrigger?.classList.add("input-error");
  }
  if (errorNode) {
    errorNode.textContent = message;
  }
}

function closeRoleSelect() {
  if (!roleSelectMenu || !roleSelectTrigger || !roleSelect) {
    return;
  }
  roleSelectMenu.hidden = true;
  roleSelectTrigger.setAttribute("aria-expanded", "false");
  roleSelect.classList.remove("open-up");
  roleSelectMenu.style.maxHeight = "";
}

function openRoleSelect() {
  if (!roleSelectMenu || !roleSelectTrigger || !roleSelect) {
    return;
  }

  roleSelect.classList.remove("open-up");
  roleSelectMenu.hidden = false;
  roleSelectTrigger.setAttribute("aria-expanded", "true");

  const triggerRect = roleSelectTrigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - triggerRect.bottom - 12;
  const spaceAbove = triggerRect.top - 12;
  const desiredMenuHeight = 184;
  const shouldOpenUp = spaceBelow < desiredMenuHeight && spaceAbove > spaceBelow;

  if (shouldOpenUp) {
    roleSelect.classList.add("open-up");
  }

  const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
  const menuMaxHeight = Math.max(120, Math.min(desiredMenuHeight, availableSpace - 8));
  roleSelectMenu.style.maxHeight = `${menuMaxHeight}px`;
}

function syncRoleSelectUI() {
  const value = String(adminCreateForm?.elements?.role?.value || "");
  const selectedOption = roleSelectOptions.find((option) => option.dataset.value === value);
  roleSelectLabel.textContent = selectedOption ? selectedOption.textContent : "Select role";

  roleSelectOptions.forEach((option) => {
    option.setAttribute("aria-selected", String(option.dataset.value === value));
  });
}

function validateAdminPayload(values) {
  const errors = {};

  if (!USERNAME_REGEX.test(values.username)) {
    errors.username = "Username must be 3-30 chars and contain letters, numbers, ., _, -";
  }

  if (!values.fullName.trim()) {
    errors.fullName = "Full name is required.";
  }

  if (!values.role) {
    errors.role = "Role is required.";
  }

  return errors;
}

function closeCreateUserModal() {
  createUserModal.hidden = true;
  createUserOverlay.hidden = true;
  closeRoleSelect();
  clearAdminFieldErrors();
  adminCreateForm?.reset();
  syncRoleSelectUI();
}

function openCreateUserModal() {
  closeMenu();
  createUserModal.hidden = false;
  createUserOverlay.hidden = false;
  adminCreateForm?.elements?.username?.focus();
}

async function loadProfile() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
      method: "GET",
      credentials: "include"
    });

    const profileData = await response.json().catch(() => ({}));

    if (!response.ok) {
      window.location.replace("/");
      return;
    }

    currentProfile = normalizeProfile(profileData);
    applyRoleVisibility();

    const rawName = String(currentProfile.fullName || currentProfile.username || "User").trim();
    const firstName = rawName.split(/\s+/)[0] || "User";

    headerUserNameText.textContent = firstName;
    loadSavedAvatar();
  } catch {
    window.location.replace("/");
  }
}

menuToggle?.addEventListener("click", () => {
  if (mainMenu.classList.contains("open")) {
    closeMenu();
    return;
  }
  openMenu();
});

menuOverlay?.addEventListener("click", closeMenu);
toggleUsersMenuBtn?.addEventListener("click", toggleUsersSubMenu);

headerUserNameBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleUserDropdown();
});

headerAvatarInput?.addEventListener("change", (event) => {
  const file = event.target?.files?.[0];
  if (!file) {
    return;
  }

  const key = getAvatarStorageKey();
  if (!key) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    if (!dataUrl) {
      return;
    }

    localStorage.setItem(key, dataUrl);
    applyAvatar(dataUrl);
  };

  reader.readAsDataURL(file);
});

openMyProfileBtn?.addEventListener("click", () => {
  closeUserDropdown();
  openMyProfileModal();
});

openSettingsBtn?.addEventListener("click", () => {
  closeUserDropdown();
  headerAvatarInput?.click();
});

myProfileOverlay?.addEventListener("click", closeMyProfileModal);

headerLogoutBtn?.addEventListener("click", openLogoutConfirm);
logoutConfirmNo?.addEventListener("click", closeLogoutConfirm);
logoutConfirmOverlay?.addEventListener("click", closeLogoutConfirm);

logoutConfirmYes?.addEventListener("click", async () => {
  try {
    await fetch(`${API_BASE_URL}/api/login/logout`, {
      method: "POST",
      credentials: "include"
    });
  } finally {
    sessionStorage.setItem(LOGOUT_FLAG_KEY, "1");
    closeLogoutConfirm();
    window.location.replace("/");
  }
});

openCreateUserBtn?.addEventListener("click", openCreateUserModal);
createUserOverlay?.addEventListener("click", closeCreateUserModal);

roleSelectTrigger?.addEventListener("click", () => {
  if (roleSelectMenu.hidden) {
    openRoleSelect();
    return;
  }
  closeRoleSelect();
});

roleSelectOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const value = String(option.dataset.value || "");
    const roleInput = adminCreateForm?.elements?.role;
    if (!roleInput || !value) {
      return;
    }

    roleInput.value = value;
    roleInput.classList.remove("input-error");
    roleSelectTrigger?.classList.remove("input-error");
    const roleError = document.getElementById("roleError");
    if (roleError) {
      roleError.textContent = "";
    }
    syncRoleSelectUI();
    closeRoleSelect();
  });
});

adminCreateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(adminCreateForm);
  const payload = {
    username: String(formData.get("username") || "").trim(),
    fullName: String(formData.get("fullName") || "").trim(),
    role: String(formData.get("role") || "").trim()
  };

  clearAdminFieldErrors();

  const errors = validateAdminPayload(payload);
  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([fieldName, message]) => {
      setAdminFieldError(fieldName, message);
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
          if (adminFormFields.includes(fieldName)) {
            setAdminFieldError(fieldName, String(message));
          }
        });
      } else if (data?.field && adminFormFields.includes(data.field)) {
        setAdminFieldError(data.field, data.message || "Invalid value.");
      } else {
        setAdminFieldError("username", data.message || "Failed to create employee account.");
      }
      return;
    }

    if (!data?.user) {
      setAdminFieldError("username", data?.message || "Invalid server response.");
      return;
    }

    adminCreateForm.reset();
    alert(data.message || "Successfully registered.");
    closeCreateUserModal();
  } catch {
    setAdminFieldError("username", "Unexpected error. Please try again.");
  } finally {
    adminCreateBtn.disabled = false;
  }
});

adminFormFields.forEach((fieldName) => {
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

document.addEventListener("click", (event) => {
  if (!headerUserMenu.hidden && !event.target.closest(".user-menu-wrap")) {
    closeUserDropdown();
  }
  if (roleSelectMenu && !roleSelectMenu.hidden && !event.target.closest("#roleSelect")) {
    closeRoleSelect();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    closeUserDropdown();
    if (!myProfileModal.hidden) {
      closeMyProfileModal();
    }
    if (!logoutConfirmModal.hidden) {
      closeLogoutConfirm();
    }
    if (!createUserModal.hidden) {
      closeCreateUserModal();
    }
    closeRoleSelect();
  }
});

loadProfile();
syncRoleSelectUI();
