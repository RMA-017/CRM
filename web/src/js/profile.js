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

const myProfilePanel = document.getElementById("myProfilePanel");
const closeMyProfileBtn = document.getElementById("closeMyProfileBtn");
const myProfilePhotoImage = document.getElementById("myProfilePhotoImage");
const myProfilePhotoFallback = document.getElementById("myProfilePhotoFallback");

const logoutConfirmModal = document.getElementById("logoutConfirmModal");
const logoutConfirmOverlay = document.getElementById("logoutConfirmOverlay");
const logoutConfirmYes = document.getElementById("logoutConfirmYes");
const logoutConfirmNo = document.getElementById("logoutConfirmNo");
const openCreateUserBtn = document.getElementById("openCreateUserBtn");
const closeCreateUserBtn = document.getElementById("closeCreateUserBtn");
const openAllUsersBtn = document.getElementById("openAllUsersBtn");
const createUserPanel = document.getElementById("createUserPanel");
const allUsersPanel = document.getElementById("allUsersPanel");
const closeAllUsersBtn = document.getElementById("closeAllUsersBtn");
const allUsersState = document.getElementById("allUsersState");
const allUsersTableWrap = document.getElementById("allUsersTableWrap");
const allUsersTableBody = document.getElementById("allUsersTableBody");
const allUsersEditModal = document.getElementById("allUsersEditModal");
const allUsersEditOverlay = document.getElementById("allUsersEditOverlay");
const allUsersEditForm = document.getElementById("allUsersEditForm");
const allUsersEditSaveBtn = document.getElementById("allUsersEditSaveBtn");
const allUsersEditCancelBtn = document.getElementById("allUsersEditCancelBtn");
const allUsersDeleteModal = document.getElementById("allUsersDeleteModal");
const allUsersDeleteOverlay = document.getElementById("allUsersDeleteOverlay");
const allUsersDeleteYesBtn = document.getElementById("allUsersDeleteYesBtn");
const allUsersDeleteNoBtn = document.getElementById("allUsersDeleteNoBtn");
const allUsersDeleteError = document.getElementById("allUsersDeleteError");
const adminCreateForm = document.getElementById("adminCreateForm");
const adminCreateBtn = document.getElementById("adminCreateBtn");
const createUserStatus = document.getElementById("createUserStatus");
const adminFormFields = ["username", "fullName", "role"];
const roleSelect = document.getElementById("roleSelect");
const roleSelectTrigger = document.getElementById("roleSelectTrigger");
const roleSelectMenu = document.getElementById("roleSelectMenu");
const roleSelectLabel = document.getElementById("roleSelectLabel");
const roleSelectOptions = Array.from(document.querySelectorAll(".custom-select-option"));
const profileEditButtons = Array.from(document.querySelectorAll(".profile-edit-btn"));
const profileEditModal = document.getElementById("profileEditModal");
const profileEditOverlay = document.getElementById("profileEditOverlay");
const profileEditForm = document.getElementById("profileEditForm");
const profileEditTitle = document.getElementById("profileEditTitle");
const profileEditLabel = document.getElementById("profileEditLabel");
const profileEditValue = document.getElementById("profileEditValue");
const profileEditError = document.getElementById("profileEditError");
const profileEditSubmit = document.getElementById("profileEditSubmit");
const LOGOUT_FLAG_KEY = "crm_just_logged_out";
const MAIN_VIEW_KEY = "crm_profile_main_view";

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

let currentProfile = null;
let activeEditField = "";
let allUsersCache = [];
let activeAllUsersEditId = "";
let activeAllUsersDeleteId = "";

const profileEditConfig = {
  email: { label: "Email", inputType: "email", valueKey: "email", required: false, placeholder: "example@mail.com" },
  fullName: { label: "Full Name", inputType: "text", valueKey: "fullName", required: true, placeholder: "Full name" },
  birthday: { label: "Birthday", inputType: "date", valueKey: "birthday", required: false, placeholder: "" },
  password: { label: "Password", inputType: "password", valueKey: "", required: true, placeholder: "New password" },
  phone: { label: "Phone", inputType: "tel", valueKey: "phone", required: false, placeholder: "+998..." },
  position: { label: "Position", inputType: "text", valueKey: "position", required: false, placeholder: "Position" }
};

function setMainView(view) {
  sessionStorage.setItem(MAIN_VIEW_KEY, view);
}

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
    const [year, month, day] = raw.split("-");
    return `${day}.${month}.${year}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}.${month}.${year}`;
}

function formatDateForInput(value) {
  if (!value) {
    return "";
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

function saveAvatarFromFile(file) {
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
  myProfilePanel.hidden = true;
  if (allUsersPanel.hidden && createUserPanel.hidden) {
    setMainView("none");
  }
}

function openMyProfileModal() {
  if (!currentProfile) {
    return;
  }
  closeMenu();
  closeAllUsersPanel();
  closeCreateUserPanel();

  document.getElementById("modalProfileUsername").textContent = currentProfile.username || "-";
  document.getElementById("modalProfileEmail").textContent = currentProfile.email || "-";
  document.getElementById("modalProfileFullName").textContent = currentProfile.fullName || "-";
  document.getElementById("modalProfileBirthday").textContent = formatDateYMD(currentProfile.birthday);
  document.getElementById("modalProfilePassword").textContent = "********";
  document.getElementById("modalProfilePhone").textContent = currentProfile.phone || "-";
  document.getElementById("modalProfilePosition").textContent = currentProfile.position || "-";
  document.getElementById("modalProfileRole").textContent = currentProfile.role || "-";

  myProfilePanel.hidden = false;
  setMainView("my-profile");
}

function closeProfileEditModal() {
  profileEditModal.hidden = true;
  profileEditOverlay.hidden = true;
  profileEditForm.reset();
  profileEditError.textContent = "";
  profileEditValue.classList.remove("input-error");
  activeEditField = "";
}

function openProfileEditModal(fieldName) {
  const config = profileEditConfig[fieldName];
  if (!config) {
    return;
  }

  activeEditField = fieldName;
  profileEditTitle.textContent = `Edit ${config.label}`;
  profileEditLabel.textContent = config.label;
  profileEditValue.type = config.inputType;
  profileEditValue.placeholder = config.placeholder;
  profileEditValue.required = !!config.required;
  profileEditValue.classList.remove("input-error");
  profileEditError.textContent = "";

  let currentValue = "";
  if (fieldName !== "password") {
    currentValue = String(currentProfile?.[config.valueKey] || "");
  }
  if (fieldName === "birthday") {
    currentValue = formatDateForInput(currentValue);
  }

  profileEditValue.value = currentValue;
  profileEditModal.hidden = false;
  profileEditOverlay.hidden = false;
  profileEditValue.focus();
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
  if (createUserStatus) {
    createUserStatus.textContent = "";
    createUserStatus.className = "form-status";
  }
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

function closeCreateUserPanel() {
  createUserPanel.hidden = true;
  closeRoleSelect();
  clearAdminFieldErrors();
  adminCreateForm?.reset();
  syncRoleSelectUI();
  if (createUserStatus) {
    createUserStatus.textContent = "";
    createUserStatus.className = "form-status";
  }
  if (allUsersPanel.hidden) {
    setMainView("none");
  }
}

function setAllUsersState(message) {
  allUsersState.textContent = message;
  allUsersState.hidden = false;
  allUsersTableWrap.hidden = true;
  allUsersTableBody.replaceChildren();
}

function clearAllUsersEditErrors() {
  ["username", "email", "fullName", "birthday", "phone", "position", "role", "password"].forEach((field) => {
    const input = allUsersEditForm?.elements?.[field];
    const errorNode = document.getElementById(`allUsersEdit${field.charAt(0).toUpperCase() + field.slice(1)}Error`);
    input?.classList.remove("input-error");
    if (errorNode) {
      errorNode.textContent = "";
    }
  });
}

function setAllUsersEditError(field, message) {
  const input = allUsersEditForm?.elements?.[field];
  const errorNode = document.getElementById(`allUsersEdit${field.charAt(0).toUpperCase() + field.slice(1)}Error`);
  input?.classList.add("input-error");
  if (errorNode) {
    errorNode.textContent = message;
  }
}

function closeAllUsersEditModal() {
  allUsersEditModal.hidden = true;
  allUsersEditOverlay.hidden = true;
  clearAllUsersEditErrors();
  allUsersEditForm?.reset();
  activeAllUsersEditId = "";
}

function openAllUsersDeleteModal(userId) {
  activeAllUsersDeleteId = String(userId || "").trim();
  if (!activeAllUsersDeleteId) {
    return;
  }
  allUsersDeleteError.textContent = "";
  allUsersDeleteModal.hidden = false;
  allUsersDeleteOverlay.hidden = false;
}

function closeAllUsersDeleteModal() {
  allUsersDeleteModal.hidden = true;
  allUsersDeleteOverlay.hidden = true;
  allUsersDeleteError.textContent = "";
  activeAllUsersDeleteId = "";
}

function openAllUsersEditModal(userId) {
  const user = allUsersCache.find((item) => String(item.id) === String(userId));
  if (!user) {
    return;
  }

  activeAllUsersEditId = String(user.id);
  clearAllUsersEditErrors();

  allUsersEditForm.elements.username.value = user.username || "";
  allUsersEditForm.elements.email.value = user.email || "";
  allUsersEditForm.elements.fullName.value = user.fullName || "";
  allUsersEditForm.elements.birthday.value = formatDateForInput(user.birthday);
  allUsersEditForm.elements.phone.value = user.phone || "";
  allUsersEditForm.elements.position.value = user.position || "";
  allUsersEditForm.elements.role.value = user.role || "";
  allUsersEditForm.elements.password.value = "";

  allUsersEditModal.hidden = false;
  allUsersEditOverlay.hidden = false;
  allUsersEditForm.elements.username.focus();
}

function closeAllUsersPanel() {
  allUsersPanel.hidden = true;
  allUsersTableBody.replaceChildren();
  allUsersCache = [];
  allUsersTableWrap.hidden = true;
  allUsersState.hidden = true;
  allUsersState.textContent = "";
  if (createUserPanel.hidden) {
    setMainView("none");
  }
}

function renderAllUsers(users) {
  allUsersTableBody.replaceChildren();
  allUsersCache = users.slice();

  users.forEach((user) => {
    const row = document.createElement("tr");
    const userId = user.id ?? user.userId ?? user.user_id ?? null;

    const idCell = document.createElement("td");
    idCell.textContent = userId === null ? "-" : String(userId);

    const usernameCell = document.createElement("td");
    usernameCell.textContent = user.username || "-";

    const emailCell = document.createElement("td");
    emailCell.textContent = user.email || "-";

    const fullNameCell = document.createElement("td");
    fullNameCell.textContent = user.fullName || "-";

    const birthdayCell = document.createElement("td");
    birthdayCell.textContent = formatDateYMD(user.birthday);

    const phoneCell = document.createElement("td");
    phoneCell.textContent = user.phone || "-";

    const positionCell = document.createElement("td");
    positionCell.textContent = user.position || "-";

    const roleCell = document.createElement("td");
    roleCell.textContent = user.role || "-";

    const createdAtCell = document.createElement("td");
    createdAtCell.textContent = formatDateYMD(user.createdAt);

    const editCell = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "table-action-btn";
    editBtn.textContent = "Edit";
    editBtn.dataset.userId = userId === null ? "" : String(userId);
    editCell.append(editBtn);

    const deleteCell = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "table-action-btn table-action-btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.dataset.userId = userId === null ? "" : String(userId);
    deleteCell.append(deleteBtn);

    row.append(
      idCell,
      usernameCell,
      emailCell,
      fullNameCell,
      birthdayCell,
      phoneCell,
      positionCell,
      roleCell,
      createdAtCell,
      editCell,
      deleteCell
    );
    allUsersTableBody.append(row);
  });
}

async function openAllUsersPanel() {
  closeMenu();
  closeCreateUserPanel();
  closeMyProfileModal();
  allUsersPanel.hidden = false;
  setMainView("all-users");
  setAllUsersState("Loading users...");

  try {
    const response = await fetch(`${API_BASE_URL}/api/profile/all`, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        window.location.replace("/");
        return;
      }

      if (response.status === 403) {
        setAllUsersState("Only admin can view users.");
        return;
      }

      setAllUsersState(data?.message || "Failed to load users.");
      return;
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    if (users.length === 0) {
      setAllUsersState("No users found.");
      return;
    }

    allUsersState.hidden = true;
    allUsersTableWrap.hidden = false;
    renderAllUsers(users);
  } catch {
    setAllUsersState("Unexpected error. Please try again.");
  }
}

function openCreateUserPanel() {
  closeMenu();
  closeAllUsersPanel();
  closeMyProfileModal();
  createUserPanel.hidden = false;
  setMainView("create-user");
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
  saveAvatarFromFile(file);
});

openMyProfileBtn?.addEventListener("click", () => {
  closeUserDropdown();
  openMyProfileModal();
});

openSettingsBtn?.addEventListener("click", () => {
  closeUserDropdown();
  headerAvatarInput?.click();
});

closeMyProfileBtn?.addEventListener("click", closeMyProfileModal);
profileEditOverlay?.addEventListener("click", closeProfileEditModal);

profileEditButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const field = String(button.dataset.editField || "").trim();
    openProfileEditModal(field);
  });
});

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
    sessionStorage.removeItem(MAIN_VIEW_KEY);
    closeLogoutConfirm();
    window.location.replace("/");
  }
});

openCreateUserBtn?.addEventListener("click", openCreateUserPanel);
closeCreateUserBtn?.addEventListener("click", closeCreateUserPanel);
openAllUsersBtn?.addEventListener("click", openAllUsersPanel);
closeAllUsersBtn?.addEventListener("click", closeAllUsersPanel);
allUsersEditCancelBtn?.addEventListener("click", closeAllUsersEditModal);
allUsersEditOverlay?.addEventListener("click", closeAllUsersEditModal);
allUsersDeleteNoBtn?.addEventListener("click", closeAllUsersDeleteModal);
allUsersDeleteOverlay?.addEventListener("click", closeAllUsersDeleteModal);

allUsersDeleteYesBtn?.addEventListener("click", async () => {
  if (!activeAllUsersDeleteId) {
    return;
  }

  allUsersDeleteYesBtn.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/api/profile/users/${encodeURIComponent(activeAllUsersDeleteId)}`, {
      method: "DELETE",
      credentials: "include"
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      allUsersDeleteError.textContent = data?.message || "Failed to delete user.";
      return;
    }

    closeAllUsersDeleteModal();
    await openAllUsersPanel();
  } catch {
    allUsersDeleteError.textContent = "Unexpected error. Please try again.";
  } finally {
    allUsersDeleteYesBtn.disabled = false;
  }
});

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
    if (createUserStatus) {
      createUserStatus.textContent = data.message || "Successfully registered.";
      createUserStatus.className = "form-status success";
    }
  } catch {
    setAdminFieldError("username", "Unexpected error. Please try again.");
    if (createUserStatus) {
      createUserStatus.textContent = "Unexpected error. Please try again.";
      createUserStatus.className = "form-status error";
    }
  } finally {
    adminCreateBtn.disabled = false;
  }
});

allUsersTableBody?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const editBtn = target.closest(".table-action-btn");
  if (!editBtn) {
    return;
  }

  const userId = String(editBtn.dataset.userId || "").trim();
  if (!userId) {
    return;
  }

  if (editBtn.classList.contains("table-action-btn-danger")) {
    openAllUsersDeleteModal(userId);
    return;
  }

  openAllUsersEditModal(userId);
});

allUsersEditForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeAllUsersEditId) {
    return;
  }

  clearAllUsersEditErrors();

  const payload = {
    username: String(allUsersEditForm.elements.username.value || "").trim(),
    email: String(allUsersEditForm.elements.email.value || "").trim(),
    fullName: String(allUsersEditForm.elements.fullName.value || "").trim(),
    birthday: String(allUsersEditForm.elements.birthday.value || "").trim(),
    phone: String(allUsersEditForm.elements.phone.value || "").trim(),
    position: String(allUsersEditForm.elements.position.value || "").trim(),
    role: String(allUsersEditForm.elements.role.value || "").trim(),
    password: String(allUsersEditForm.elements.password.value || "")
  };

  try {
    allUsersEditSaveBtn.disabled = true;

    const response = await fetch(`${API_BASE_URL}/api/profile/users/${encodeURIComponent(activeAllUsersEditId)}`, {
      method: "PATCH",
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
          setAllUsersEditError(fieldName, String(message));
        });
      } else {
        setAllUsersEditError("username", data?.message || "Failed to update user.");
      }
      return;
    }

    closeAllUsersEditModal();
    await openAllUsersPanel();
  } catch {
    setAllUsersEditError("username", "Unexpected error. Please try again.");
  } finally {
    allUsersEditSaveBtn.disabled = false;
  }
});

profileEditForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeEditField) {
    return;
  }

  const value = String(profileEditValue.value || "").trim();
  profileEditError.textContent = "";
  profileEditValue.classList.remove("input-error");

  if (activeEditField === "password" && value.length < 6) {
    profileEditError.textContent = "Password must be at least 6 characters.";
    profileEditValue.classList.add("input-error");
    return;
  }

  try {
    profileEditSubmit.disabled = true;

    const response = await fetch(`${API_BASE_URL}/api/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        field: activeEditField,
        value
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      profileEditError.textContent = data?.message || "Failed to update profile.";
      profileEditValue.classList.add("input-error");
      return;
    }

    if (data?.profile) {
      currentProfile = normalizeProfile(data.profile);
      const rawName = String(currentProfile.fullName || currentProfile.username || "User").trim();
      const firstName = rawName.split(/\s+/)[0] || "User";
      headerUserNameText.textContent = firstName;
      loadSavedAvatar();

      if (!myProfilePanel.hidden) {
        openMyProfileModal();
      }
    }

    closeProfileEditModal();
  } catch {
    profileEditError.textContent = "Unexpected error. Please try again.";
    profileEditValue.classList.add("input-error");
  } finally {
    profileEditSubmit.disabled = false;
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
    if (!myProfilePanel.hidden) {
      closeMyProfileModal();
    }
    if (!logoutConfirmModal.hidden) {
      closeLogoutConfirm();
    }
    if (!profileEditModal.hidden) {
      closeProfileEditModal();
    }
    if (!allUsersEditModal.hidden) {
      closeAllUsersEditModal();
    }
    if (!allUsersDeleteModal.hidden) {
      closeAllUsersDeleteModal();
    }
    if (!createUserPanel.hidden) {
      closeCreateUserPanel();
    }
    closeRoleSelect();
  }
});

function preventFileDropNavigation(event) {
  event.preventDefault();
  event.stopPropagation();
}

["dragenter", "dragover", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, preventFileDropNavigation, true);
  document.addEventListener(eventName, preventFileDropNavigation, true);
  document.documentElement?.addEventListener(eventName, preventFileDropNavigation, true);
  document.body?.addEventListener(eventName, preventFileDropNavigation, true);
});

window.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }

  saveAvatarFromFile(file);
}, true);

async function initProfilePage() {
  await loadProfile();
  syncRoleSelectUI();
  setMainView("none");
}

initProfilePage();
