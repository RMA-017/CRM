import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CustomSelect from "../components/CustomSelect.jsx";
import { POSITION_OPTIONS, ROLE_OPTIONS } from "../constants/options.js";
import { apiFetch } from "../lib/api.js";
import { formatDateForInput, formatDateYMD, getInitial, normalizeProfile } from "../lib/formatters.js";

const LOGOUT_FLAG_KEY = "crm_just_logged_out";
const MAIN_VIEW_KEY = "crm_profile_main_view";
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;
const ALL_USERS_LIMIT = 20;

const PROFILE_EDIT_CONFIG = {
  email: { label: "Email", inputType: "email", valueKey: "email", required: false, placeholder: "example@mail.com" },
  fullName: { label: "Full Name", inputType: "text", valueKey: "fullName", required: true, placeholder: "Full name" },
  birthday: { label: "Birthday", inputType: "date", valueKey: "birthday", required: false, placeholder: "" },
  password: { label: "Password", inputType: "password", valueKey: "", required: true, placeholder: "New password" },
  phone: { label: "Phone", inputType: "tel", valueKey: "phone", required: false, placeholder: "+998..." },
  position: { label: "Position", inputType: "text", valueKey: "position", required: false, placeholder: "Select position" }
};

function ProfilePage() {
  const navigate = useNavigate();
  const userMenuWrapRef = useRef(null);
  const avatarInputRef = useRef(null);
  const restoredMainViewRef = useRef(false);

  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);
  const [usersMenuOpen, setUsersMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [mainView, setMainViewState] = useState("none");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [profileEdit, setProfileEdit] = useState({
    open: false,
    field: "",
    value: "",
    error: "",
    submitting: false
  });

  const [createForm, setCreateForm] = useState({
    username: "",
    fullName: "",
    role: ""
  });
  const [createErrors, setCreateErrors] = useState({});
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [allUsers, setAllUsers] = useState([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [allUsersMessage, setAllUsersMessage] = useState("");
  const [allUsersPage, setAllUsersPage] = useState(1);
  const [allUsersTotalPages, setAllUsersTotalPages] = useState(1);

  const [allUsersEdit, setAllUsersEdit] = useState({
    open: false,
    id: "",
    submitting: false,
    form: {
      username: "",
      email: "",
      fullName: "",
      birthday: "",
      phone: "",
      position: "",
      role: "",
      password: ""
    },
    errors: {}
  });

  const [allUsersDelete, setAllUsersDelete] = useState({
    open: false,
    id: "",
    error: "",
    submitting: false
  });

  const isAdmin = useMemo(
    () => String(profile?.role || "").toLowerCase() === "admin",
    [profile?.role]
  );

  const firstName = useMemo(() => {
    const rawName = String(profile?.fullName || profile?.username || "User").trim();
    return rawName.split(/\s+/)[0] || "User";
  }, [profile?.fullName, profile?.username]);

  const avatarFallback = useMemo(
    () => getInitial(profile?.fullName || profile?.username || "User"),
    [profile?.fullName, profile?.username]
  );

  const avatarStorageKey = useMemo(() => {
    const username = String(profile?.username || "").trim();
    return username ? `crm_avatar_${username}` : "";
  }, [profile?.username]);

  const profileEditConfig = PROFILE_EDIT_CONFIG[profileEdit.field] || {
    label: "Value",
    inputType: "text",
    required: false,
    placeholder: ""
  };

  const setMainView = useCallback((view) => {
    setMainViewState(view);
    sessionStorage.setItem(MAIN_VIEW_KEY, view);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setUsersMenuOpen(false);
  }, []);

  const closeUserDropdown = useCallback(() => {
    setUserMenuOpen(false);
  }, []);

  const closeProfileEditModal = useCallback(() => {
    setProfileEdit({
      open: false,
      field: "",
      value: "",
      error: "",
      submitting: false
    });
  }, []);

  const closeAllUsersEditModal = useCallback(() => {
    setAllUsersEdit({
      open: false,
      id: "",
      submitting: false,
      form: {
        username: "",
        email: "",
        fullName: "",
        birthday: "",
        phone: "",
        position: "",
        role: "",
        password: ""
      },
      errors: {}
    });
  }, []);

  const closeAllUsersDeleteModal = useCallback(() => {
    setAllUsersDelete({
      open: false,
      id: "",
      error: "",
      submitting: false
    });
  }, []);

  const openAvatarPicker = useCallback(() => {
    avatarInputRef.current?.click();
  }, []);

  const saveAvatarFromFile = useCallback((file) => {
    if (!file || !avatarStorageKey) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) {
        return;
      }
      localStorage.setItem(avatarStorageKey, dataUrl);
      setAvatarDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }, [avatarStorageKey]);

  const loadAllUsers = useCallback(async (requestedPage = 1, activateView = false) => {
    if (activateView) {
      setMainView("all-users");
    }

    if (!isAdmin) {
      setAllUsers([]);
      setAllUsersMessage("Only admin can view users.");
      return;
    }

    const nextPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    setAllUsersLoading(true);
    setAllUsersMessage("Loading users...");

    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        limit: String(ALL_USERS_LIMIT)
      });

      const response = await apiFetch(`/api/profile/all?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          navigate("/", { replace: true });
          return;
        }
        if (response.status === 403) {
          setAllUsers([]);
          setAllUsersMessage("Only admin can view users.");
          return;
        }
        setAllUsers([]);
        setAllUsersMessage(data?.message || "Failed to load users.");
        return;
      }

      const users = Array.isArray(data?.users) ? data.users : [];
      const pagination = data?.pagination || {};

      setAllUsersPage(Number(pagination.page) || 1);
      setAllUsersTotalPages(Number(pagination.totalPages) || 1);

      if (users.length === 0) {
        setAllUsers([]);
        setAllUsersMessage("No users found.");
        return;
      }

      setAllUsers(users);
      setAllUsersMessage("");
    } catch {
      setAllUsers([]);
      setAllUsersMessage("Unexpected error. Please try again.");
    } finally {
      setAllUsersLoading(false);
    }
  }, [isAdmin, navigate, setMainView]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const response = await apiFetch("/api/profile", {
          method: "GET",
          cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));

        if (!active) {
          return;
        }

        if (!response.ok) {
          navigate("/", { replace: true });
          return;
        }

        setProfile(normalizeProfile(data));
      } catch {
        if (active) {
          navigate("/", { replace: true });
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!avatarStorageKey) {
      setAvatarDataUrl("");
      return;
    }
    setAvatarDataUrl(localStorage.getItem(avatarStorageKey) || "");
  }, [avatarStorageKey]);

  useEffect(() => {
    if (!profile || restoredMainViewRef.current) {
      return;
    }

    restoredMainViewRef.current = true;
    const savedView = String(sessionStorage.getItem(MAIN_VIEW_KEY) || "none");

    if (savedView === "my-profile") {
      setMainView("my-profile");
      return;
    }

    if (savedView === "all-users" && isAdmin) {
      loadAllUsers(1, true);
      return;
    }

    if (savedView === "create-user" && isAdmin) {
      setMainView("create-user");
      return;
    }

    setMainView("none");
  }, [isAdmin, loadAllUsers, profile, setMainView]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!userMenuWrapRef.current) {
        return;
      }
      if (!userMenuWrapRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key !== "Escape") {
        return;
      }
      closeMenu();
      closeUserDropdown();
      setLogoutConfirmOpen(false);
      closeProfileEditModal();
      closeAllUsersEditModal();
      closeAllUsersDeleteModal();
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeAllUsersDeleteModal, closeAllUsersEditModal, closeMenu, closeProfileEditModal, closeUserDropdown]);

  useEffect(() => {
    function preventFileDropNavigation(event) {
      event.preventDefault();
      event.stopPropagation();
    }

    function handleDrop(event) {
      preventFileDropNavigation(event);
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        saveAvatarFromFile(file);
      }
    }

    const events = ["dragenter", "dragover", "drop"];
    events.forEach((eventName) => {
      window.addEventListener(eventName, preventFileDropNavigation, true);
      document.addEventListener(eventName, preventFileDropNavigation, true);
    });
    window.addEventListener("drop", handleDrop, true);

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, preventFileDropNavigation, true);
        document.removeEventListener(eventName, preventFileDropNavigation, true);
      });
      window.removeEventListener("drop", handleDrop, true);
    };
  }, [saveAvatarFromFile]);

  function openMyProfilePanel() {
    closeMenu();
    closeUserDropdown();
    setMainView("my-profile");
  }

  function closeMyProfilePanel() {
    if (mainView === "my-profile") {
      setMainView("none");
    }
  }

  function openCreateUserPanel() {
    closeMenu();
    closeUserDropdown();
    setMainView("create-user");
  }

  function closeCreateUserPanel() {
    if (mainView === "create-user") {
      setMainView("none");
    }
  }

  function closeAllUsersPanel() {
    if (mainView === "all-users") {
      setMainView("none");
    }
  }

  function validateCreatePayload(payload) {
    const errors = {};
    if (!USERNAME_REGEX.test(payload.username)) {
      errors.username = "Username must be 3-30 chars and contain letters, numbers, ., _, -";
    }
    if (!payload.fullName) {
      errors.fullName = "Full name is required.";
    }
    if (!payload.role) {
      errors.role = "Role is required.";
    }
    return errors;
  }

  async function handleCreateUserSubmit(event) {
    event.preventDefault();

    const payload = {
      username: String(createForm.username || "").trim(),
      fullName: String(createForm.fullName || "").trim(),
      role: String(createForm.role || "").trim().toLowerCase()
    };

    const errors = validateCreatePayload(payload);
    setCreateErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    try {
      setCreateSubmitting(true);

      const response = await apiFetch("/api/admin-create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data?.errors && typeof data.errors === "object") {
          setCreateErrors(data.errors);
        } else if (data?.field) {
          setCreateErrors({ [data.field]: data.message || "Invalid value." });
        } else {
          setCreateErrors({ username: data?.message || "Failed to create employee account." });
        }
        return;
      }

      setCreateForm({ username: "", fullName: "", role: "" });
      setCreateErrors({});
    } catch {
      setCreateErrors({ username: "Unexpected error. Please try again." });
    } finally {
      setCreateSubmitting(false);
    }
  }

  function openProfileEditModal(fieldName) {
    const config = PROFILE_EDIT_CONFIG[fieldName];
    if (!config) {
      return;
    }

    let value = "";
    if (fieldName !== "password") {
      value = String(profile?.[config.valueKey] || "");
    }
    if (fieldName === "birthday") {
      value = formatDateForInput(value);
    }

    setProfileEdit({
      open: true,
      field: fieldName,
      value,
      error: "",
      submitting: false
    });
  }

  async function handleProfileEditSubmit(event) {
    event.preventDefault();
    const field = profileEdit.field;
    const value = String(profileEdit.value || "").trim();

    if (!field) {
      return;
    }

    if (field === "password" && value.length < 6) {
      setProfileEdit((prev) => ({
        ...prev,
        error: "Password must be at least 6 characters."
      }));
      return;
    }

    try {
      setProfileEdit((prev) => ({
        ...prev,
        submitting: true,
        error: ""
      }));

      const response = await apiFetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ field, value })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setProfileEdit((prev) => ({
          ...prev,
          submitting: false,
          error: data?.message || "Failed to update profile."
        }));
        return;
      }

      if (data?.profile) {
        setProfile(normalizeProfile(data.profile));
      }
      closeProfileEditModal();
    } catch {
      setProfileEdit((prev) => ({
        ...prev,
        submitting: false,
        error: "Unexpected error. Please try again."
      }));
    }
  }

  function openAllUsersEditModal(userId) {
    const currentUser = allUsers.find((user) => String(user.id) === String(userId));
    if (!currentUser) {
      return;
    }

    setAllUsersEdit({
      open: true,
      id: String(currentUser.id || ""),
      submitting: false,
      form: {
        username: String(currentUser.username || ""),
        email: String(currentUser.email || ""),
        fullName: String(currentUser.fullName || ""),
        birthday: formatDateForInput(currentUser.birthday),
        phone: String(currentUser.phone || ""),
        position: String(currentUser.position || ""),
        role: String(currentUser.role || "").toLowerCase(),
        password: ""
      },
      errors: {}
    });
  }

  function openAllUsersDeleteModal(userId) {
    setAllUsersDelete({
      open: true,
      id: String(userId || ""),
      error: "",
      submitting: false
    });
  }

  async function handleAllUsersEditSubmit(event) {
    event.preventDefault();

    if (!allUsersEdit.id) {
      return;
    }

    const payload = {
      username: String(allUsersEdit.form.username || "").trim(),
      email: String(allUsersEdit.form.email || "").trim(),
      fullName: String(allUsersEdit.form.fullName || "").trim(),
      birthday: String(allUsersEdit.form.birthday || "").trim(),
      phone: String(allUsersEdit.form.phone || "").trim(),
      position: String(allUsersEdit.form.position || "").trim(),
      role: String(allUsersEdit.form.role || "").trim(),
      password: String(allUsersEdit.form.password || "")
    };

    try {
      setAllUsersEdit((prev) => ({
        ...prev,
        submitting: true,
        errors: {}
      }));

      const response = await apiFetch(`/api/profile/users/${encodeURIComponent(allUsersEdit.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setAllUsersEdit((prev) => ({
          ...prev,
          submitting: false,
          errors: data?.errors && typeof data.errors === "object"
            ? data.errors
            : { username: data?.message || "Failed to update user." }
        }));
        return;
      }

      closeAllUsersEditModal();
      await loadAllUsers(allUsersPage, false);
    } catch {
      setAllUsersEdit((prev) => ({
        ...prev,
        submitting: false,
        errors: { username: "Unexpected error. Please try again." }
      }));
    }
  }

  async function handleAllUsersDelete() {
    if (!allUsersDelete.id) {
      return;
    }

    try {
      setAllUsersDelete((prev) => ({
        ...prev,
        submitting: true,
        error: ""
      }));

      const response = await apiFetch(`/api/profile/users/${encodeURIComponent(allUsersDelete.id)}`, {
        method: "DELETE"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setAllUsersDelete((prev) => ({
          ...prev,
          submitting: false,
          error: data?.message || "Failed to delete user."
        }));
        return;
      }

      closeAllUsersDeleteModal();
      await loadAllUsers(allUsersPage, false);
    } catch {
      setAllUsersDelete((prev) => ({
        ...prev,
        submitting: false,
        error: "Unexpected error. Please try again."
      }));
    }
  }

  async function handleLogout() {
    try {
      await apiFetch("/api/login/logout", {
        method: "POST"
      });
    } finally {
      sessionStorage.setItem(LOGOUT_FLAG_KEY, "1");
      sessionStorage.removeItem(MAIN_VIEW_KEY);
      navigate("/", { replace: true });
    }
  }

  return (
    <>
      <div className="home-layout">
        <header className="home-header">
          <div className="brand-wrap">
            <button
              id="menuToggle"
              className="menu-toggle"
              type="button"
              aria-label="Open main menu"
              aria-expanded={menuOpen ? "true" : "false"}
              aria-controls="mainMenu"
              onClick={() => {
                if (menuOpen) {
                  closeMenu();
                  return;
                }
                setMenuOpen(true);
              }}
            >
              <span />
              <span />
              <span />
            </button>

            <Link className="brand" to="/" aria-label="AARON CRM home">
              <img src="/crm.svg" alt="AARON CRM logo" className="brand-logo" />
              <span className="brand-text">AARON</span>
            </Link>
          </div>

          <nav className="header-actions" aria-label="Header actions">
            <div ref={userMenuWrapRef} className="user-menu-wrap">
              <button
                id="headerUserNameBtn"
                type="button"
                className="header-btn user-name-btn"
                aria-expanded={userMenuOpen ? "true" : "false"}
                onClick={() => setUserMenuOpen((prev) => !prev)}
              >
                <span className="header-avatar-inline">
                  <img
                    id="headerAvatarImage"
                    className="header-avatar-image"
                    alt="Profile photo"
                    hidden={!avatarDataUrl}
                    src={avatarDataUrl || undefined}
                  />
                  <span id="headerAvatarFallback" className="header-avatar-fallback" hidden={Boolean(avatarDataUrl)}>
                    {avatarFallback}
                  </span>
                </span>
                <span id="headerUserNameText">{profileLoading ? "-" : firstName}</span>
              </button>

              <input
                id="headerAvatarInput"
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  saveAvatarFromFile(file);
                  event.currentTarget.value = "";
                }}
              />

              <div id="headerUserMenu" className="header-user-menu" hidden={!userMenuOpen}>
                <button id="openMyProfileBtn" type="button" className="header-user-menu-item" onClick={openMyProfilePanel}>
                  My Profile
                </button>
                <button
                  id="openSettingsBtn"
                  type="button"
                  className="header-user-menu-item"
                  onClick={() => {
                    closeUserDropdown();
                    openAvatarPicker();
                  }}
                >
                  Settings
                </button>
              </div>
            </div>

            <button id="headerLogoutBtn" type="button" className="header-btn" onClick={() => setLogoutConfirmOpen(true)}>
              Logout
            </button>
          </nav>
        </header>

        <main className="home-main" aria-label="Main content">
          {mainView === "my-profile" && (
            <section id="myProfilePanel" className="my-profile-panel">
              <div className="all-users-head">
                <h3>My Profile</h3>
                <button
                  id="closeMyProfileBtn"
                  type="button"
                  className="header-btn"
                  aria-label="Close my profile panel"
                  onClick={closeMyProfilePanel}
                >
                  ×
                </button>
              </div>

              <div
                className="profile-modal-photo"
                id="myProfilePhoto"
                role="button"
                tabIndex={0}
                aria-label="Upload profile photo"
                onClick={openAvatarPicker}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openAvatarPicker();
                  }
                }}
              >
                <img
                  id="myProfilePhotoImage"
                  className="profile-modal-photo-image"
                  alt="My profile photo"
                  hidden={!avatarDataUrl}
                  src={avatarDataUrl || undefined}
                />
                <span id="myProfilePhotoFallback" hidden={Boolean(avatarDataUrl)}>
                  {avatarFallback}
                </span>
              </div>

              <dl className="profile-modal-list">
                <div>
                  <dt>Username</dt>
                  <dd id="modalProfileUsername">{profile?.username || "-"}</dd>
                  <span className="profile-no-edit" />
                </div>
                <div>
                  <dt>Role</dt>
                  <dd id="modalProfileRole">{profile?.role || "-"}</dd>
                  <span className="profile-no-edit" />
                </div>
                <div>
                  <dt>Email</dt>
                  <dd id="modalProfileEmail">{profile?.email || "-"}</dd>
                  <button type="button" className="profile-edit-btn" onClick={() => openProfileEditModal("email")}>
                    Edit
                  </button>
                </div>
                <div>
                  <dt>Full Name</dt>
                  <dd id="modalProfileFullName">{profile?.fullName || "-"}</dd>
                  <button type="button" className="profile-edit-btn" onClick={() => openProfileEditModal("fullName")}>
                    Edit
                  </button>
                </div>
                <div>
                  <dt>Birthday</dt>
                  <dd id="modalProfileBirthday">{formatDateYMD(profile?.birthday)}</dd>
                  <button type="button" className="profile-edit-btn" onClick={() => openProfileEditModal("birthday")}>
                    Edit
                  </button>
                </div>
                <div>
                  <dt>Password</dt>
                  <dd id="modalProfilePassword">********</dd>
                  <button type="button" className="profile-edit-btn" onClick={() => openProfileEditModal("password")}>
                    Edit
                  </button>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd id="modalProfilePhone">{profile?.phone || "-"}</dd>
                  <button type="button" className="profile-edit-btn" onClick={() => openProfileEditModal("phone")}>
                    Edit
                  </button>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd id="modalProfilePosition">{profile?.position || "-"}</dd>
                  <button type="button" className="profile-edit-btn" onClick={() => openProfileEditModal("position")}>
                    Edit
                  </button>
                </div>
              </dl>
            </section>
          )}

          {mainView === "all-users" && (
            <section id="allUsersPanel" className="all-users-panel">
              <div className="all-users-head">
                <h3>All Users</h3>
                <button
                  id="closeAllUsersBtn"
                  type="button"
                  className="header-btn"
                  aria-label="Close all users panel"
                  onClick={closeAllUsersPanel}
                >
                  ×
                </button>
              </div>

              <p id="allUsersState" className="all-users-state" hidden={!allUsersMessage}>
                {allUsersMessage}
              </p>

              <div id="allUsersTableWrap" className="all-users-table-wrap" hidden={allUsers.length === 0}>
                <table className="all-users-table" aria-label="All users table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Full Name</th>
                      <th>Birthday</th>
                      <th>Phone</th>
                      <th>Position</th>
                      <th>Role</th>
                      <th>Created At</th>
                      <th>Edit</th>
                      <th>Delete</th>
                    </tr>
                  </thead>
                  <tbody id="allUsersTableBody">
                    {allUsers.map((user) => (
                      <tr key={String(user.id)}>
                        <td>{user.id || "-"}</td>
                        <td>{user.username || "-"}</td>
                        <td>{user.email || "-"}</td>
                        <td>{user.fullName || "-"}</td>
                        <td>{formatDateYMD(user.birthday)}</td>
                        <td>{user.phone || "-"}</td>
                        <td>{user.position || "-"}</td>
                        <td>{user.role || "-"}</td>
                        <td>{formatDateYMD(user.createdAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="table-action-btn"
                            onClick={() => openAllUsersEditModal(user.id)}
                          >
                            Edit
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="table-action-btn table-action-btn-danger"
                            onClick={() => openAllUsersDeleteModal(user.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div id="allUsersPagination" className="all-users-pagination" hidden={allUsers.length === 0}>
                <button
                  id="allUsersPrevBtn"
                  type="button"
                  className="header-btn"
                  disabled={allUsersPage <= 1 || allUsersLoading}
                  onClick={() => loadAllUsers(allUsersPage - 1, false)}
                >
                  Previous
                </button>
                <span id="allUsersPageInfo" className="all-users-page-info">
                  Page {allUsersPage} of {allUsersTotalPages}
                </span>
                <button
                  id="allUsersNextBtn"
                  type="button"
                  className="header-btn"
                  disabled={allUsersPage >= allUsersTotalPages || allUsersLoading}
                  onClick={() => loadAllUsers(allUsersPage + 1, false)}
                >
                  Next
                </button>
              </div>
            </section>
          )}

          {mainView === "create-user" && (
            <section id="createUserPanel" className="create-user-panel">
              <div className="all-users-head">
                <h3>Create User</h3>
                <button
                  id="closeCreateUserBtn"
                  type="button"
                  className="header-btn"
                  aria-label="Close create user panel"
                  onClick={closeCreateUserPanel}
                >
                  ×
                </button>
              </div>

              <form className="auth-form" id="adminCreateForm" noValidate onSubmit={handleCreateUserSubmit}>
                <div className="field">
                  <label htmlFor="username">Username</label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    placeholder="Username"
                    autoComplete="username"
                    required
                  className={createErrors.username ? "input-error" : ""}
                  value={createForm.username}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setCreateForm((prev) => ({ ...prev, username: nextValue }));
                    if (createErrors.username) {
                      setCreateErrors((prev) => ({ ...prev, username: "" }));
                    }
                  }}
                  />
                  <small className="field-error" id="usernameError">{createErrors.username || ""}</small>
                </div>

                <div className="field">
                  <label htmlFor="fullName">Full Name</label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    placeholder="Muhammad Rahmonov"
                    autoComplete="name"
                    required
                  className={createErrors.fullName ? "input-error" : ""}
                  value={createForm.fullName}
                  onInput={(event) => {
                    const nextValue = event.currentTarget.value;
                    setCreateForm((prev) => ({ ...prev, fullName: nextValue }));
                    if (createErrors.fullName) {
                      setCreateErrors((prev) => ({ ...prev, fullName: "" }));
                    }
                  }}
                  />
                  <small className="field-error" id="fullNameError">{createErrors.fullName || ""}</small>
                </div>

                <div className="field">
                  <label htmlFor="roleSelect">Role</label>
                  <CustomSelect
                    id="roleSelect"
                    placeholder="Select role"
                    value={createForm.role}
                    options={ROLE_OPTIONS}
                    error={Boolean(createErrors.role)}
                    onChange={(nextRole) => {
                      setCreateForm((prev) => ({ ...prev, role: nextRole }));
                      if (createErrors.role) {
                        setCreateErrors((prev) => ({ ...prev, role: "" }));
                      }
                    }}
                  />
                  <small className="field-error" id="roleError">{createErrors.role || ""}</small>
                </div>

                <button id="adminCreateBtn" className="btn" type="submit" disabled={createSubmitting}>
                  Create
                </button>
              </form>
            </section>
          )}
        </main>

        <footer className="home-footer">
          <a
            className="footer-link"
            href="https://www.instagram.com/aaron_uzb?igsh=MWxod2Q1eDV6NGowZw=="
            target="_blank"
            rel="noreferrer"
          >
            <img src="/icon/instagram.svg" alt="" aria-hidden="true" className="footer-link-icon" />
            <span>Instagram</span>
          </a>
          <a className="footer-link" href="https://t.me/aaron_uz" target="_blank" rel="noreferrer">
            <img src="/icon/telegram.svg" alt="" aria-hidden="true" className="footer-link-icon" />
            <span>Telegram</span>
          </a>
          <a className="footer-link" href="tel:+998954550033">
            <img src="/icon/call-center.svg" alt="" aria-hidden="true" className="footer-link-icon" />
            <span>Call Center</span>
          </a>
        </footer>
      </div>

      <section id="logoutConfirmModal" className="logout-confirm-modal" hidden={!logoutConfirmOpen}>
        <h3>Are you sure you want to log out?</h3>
        <div className="logout-confirm-actions">
          <button
            id="logoutConfirmYes"
            type="button"
            className="header-btn logout-confirm-yes"
            onClick={handleLogout}
          >
            Yes
          </button>
          <button
            id="logoutConfirmNo"
            type="button"
            className="header-btn"
            onClick={() => setLogoutConfirmOpen(false)}
          >
            No
          </button>
        </div>
      </section>
      <div
        id="logoutConfirmOverlay"
        className="login-overlay"
        hidden={!logoutConfirmOpen}
        onClick={() => setLogoutConfirmOpen(false)}
      />

      <section id="profileEditModal" className="logout-confirm-modal profile-edit-modal" hidden={!profileEdit.open}>
        <h3 id="profileEditTitle">Edit {profileEditConfig.label}</h3>
        <form id="profileEditForm" className="auth-form" noValidate onSubmit={handleProfileEditSubmit}>
          <div className="field">
            <label id="profileEditLabel" htmlFor="profileEditValue">{profileEditConfig.label}</label>
            <input
              id="profileEditValue"
              name="value"
              type={profileEditConfig.inputType}
              autoComplete="off"
              required={profileEditConfig.required}
              placeholder={profileEditConfig.placeholder}
              hidden={profileEdit.field === "position"}
              className={profileEdit.error ? "input-error" : ""}
              value={profileEdit.field === "position" ? "" : profileEdit.value}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setProfileEdit((prev) => ({ ...prev, value: nextValue, error: "" }));
              }}
            />

            <div id="profileEditPositionSelect" hidden={profileEdit.field !== "position"}>
              <CustomSelect
                id="profileEditPositionSelectControl"
                placeholder="Select position"
                value={profileEdit.field === "position" ? profileEdit.value : ""}
                options={POSITION_OPTIONS}
                error={Boolean(profileEdit.error)}
                onChange={(nextPosition) => {
                  setProfileEdit((prev) => ({ ...prev, value: nextPosition, error: "" }));
                }}
              />
            </div>
            <small id="profileEditError" className="field-error">{profileEdit.error}</small>
          </div>

          <button id="profileEditSubmit" className="btn" type="submit" disabled={profileEdit.submitting}>
            Save
          </button>
        </form>
      </section>
      <div id="profileEditOverlay" className="login-overlay" hidden={!profileEdit.open} onClick={closeProfileEditModal} />

      <section id="allUsersEditModal" className="logout-confirm-modal all-users-edit-modal" hidden={!allUsersEdit.open}>
        <h3>Edit User</h3>
        <form id="allUsersEditForm" className="auth-form" noValidate onSubmit={handleAllUsersEditSubmit}>
          <div className="field">
            <label htmlFor="allUsersEditUsername">Username</label>
            <input
              id="allUsersEditUsername"
              name="username"
              type="text"
              autoComplete="username"
              required
              className={allUsersEdit.errors.username ? "input-error" : ""}
              value={allUsersEdit.form.username}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setAllUsersEdit((prev) => ({
                  ...prev,
                  form: { ...prev.form, username: nextValue },
                  errors: { ...prev.errors, username: "" }
                }));
              }}
            />
            <small id="allUsersEditUsernameError" className="field-error">{allUsersEdit.errors.username || ""}</small>
          </div>

          <div className="field">
            <label htmlFor="allUsersEditEmail">Email</label>
            <input
              id="allUsersEditEmail"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="user@gmail.com"
              className={allUsersEdit.errors.email ? "input-error" : ""}
              value={allUsersEdit.form.email}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setAllUsersEdit((prev) => ({
                  ...prev,
                  form: { ...prev.form, email: nextValue },
                  errors: { ...prev.errors, email: "" }
                }));
              }}
            />
            <small id="allUsersEditEmailError" className="field-error">{allUsersEdit.errors.email || ""}</small>
          </div>

          <div className="field">
            <label htmlFor="allUsersEditFullName">Full Name</label>
            <input
              id="allUsersEditFullName"
              name="fullName"
              type="text"
              autoComplete="name"
              required
              className={allUsersEdit.errors.fullName ? "input-error" : ""}
              value={allUsersEdit.form.fullName}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setAllUsersEdit((prev) => ({
                  ...prev,
                  form: { ...prev.form, fullName: nextValue },
                  errors: { ...prev.errors, fullName: "" }
                }));
              }}
            />
            <small id="allUsersEditFullNameError" className="field-error">{allUsersEdit.errors.fullName || ""}</small>
          </div>

          <div className="field">
            <label htmlFor="allUsersEditBirthday">Birthday</label>
            <input
              id="allUsersEditBirthday"
              name="birthday"
              type="date"
              autoComplete="bday"
              className={allUsersEdit.errors.birthday ? "input-error" : ""}
              value={allUsersEdit.form.birthday}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setAllUsersEdit((prev) => ({
                  ...prev,
                  form: { ...prev.form, birthday: nextValue },
                  errors: { ...prev.errors, birthday: "" }
                }));
              }}
            />
            <small id="allUsersEditBirthdayError" className="field-error">{allUsersEdit.errors.birthday || ""}</small>
          </div>

          <div className="field">
            <label htmlFor="allUsersEditPhone">Phone</label>
            <input
              id="allUsersEditPhone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+998954550033"
              className={allUsersEdit.errors.phone ? "input-error" : ""}
              value={allUsersEdit.form.phone}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setAllUsersEdit((prev) => ({
                  ...prev,
                  form: { ...prev.form, phone: nextValue },
                  errors: { ...prev.errors, phone: "" }
                }));
              }}
            />
            <small id="allUsersEditPhoneError" className="field-error">{allUsersEdit.errors.phone || ""}</small>
          </div>

          <div className="field">
            <label htmlFor="allUsersEditPositionSelect">Position</label>
            <CustomSelect
              id="allUsersEditPositionSelect"
              placeholder="Select position"
              value={allUsersEdit.form.position}
              options={POSITION_OPTIONS}
              error={Boolean(allUsersEdit.errors.position)}
              onChange={(nextValue) => {
                setAllUsersEdit((prev) => ({
                  ...prev,
                  form: { ...prev.form, position: nextValue },
                  errors: { ...prev.errors, position: "" }
                }));
              }}
            />
            <small id="allUsersEditPositionError" className="field-error">{allUsersEdit.errors.position || ""}</small>
          </div>

          <div className="field">
            <label htmlFor="allUsersEditRoleSelect">Role</label>
            <CustomSelect
              id="allUsersEditRoleSelect"
              placeholder="Select role"
              value={allUsersEdit.form.role}
              options={ROLE_OPTIONS}
              error={Boolean(allUsersEdit.errors.role)}
              onChange={(nextValue) => {
                setAllUsersEdit((prev) => ({
                  ...prev,
                  form: { ...prev.form, role: nextValue },
                  errors: { ...prev.errors, role: "" }
                }));
              }}
            />
            <small id="allUsersEditRoleError" className="field-error">{allUsersEdit.errors.role || ""}</small>
          </div>

          <div className="field">
            <label htmlFor="allUsersEditPassword">New Password (optional)</label>
            <input
              id="allUsersEditPassword"
              name="password"
              type="password"
              autoComplete="new-password"
              className={allUsersEdit.errors.password ? "input-error" : ""}
              value={allUsersEdit.form.password}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setAllUsersEdit((prev) => ({
                  ...prev,
                  form: { ...prev.form, password: nextValue },
                  errors: { ...prev.errors, password: "" }
                }));
              }}
            />
            <small id="allUsersEditPasswordError" className="field-error">{allUsersEdit.errors.password || ""}</small>
          </div>

          <div className="edit-actions">
            <button id="allUsersEditSaveBtn" className="btn" type="submit" disabled={allUsersEdit.submitting}>
              Save
            </button>
            <button id="allUsersEditCancelBtn" className="header-btn" type="button" onClick={closeAllUsersEditModal}>
              Cancel
            </button>
          </div>
        </form>
      </section>
      <div id="allUsersEditOverlay" className="login-overlay" hidden={!allUsersEdit.open} onClick={closeAllUsersEditModal} />

      <section id="allUsersDeleteModal" className="logout-confirm-modal" hidden={!allUsersDelete.open}>
        <h3>Are you sure you want to delete this user?</h3>
        <p id="allUsersDeleteError" className="field-error">{allUsersDelete.error}</p>
        <div className="logout-confirm-actions">
          <button
            id="allUsersDeleteYesBtn"
            type="button"
            className="header-btn logout-confirm-yes"
            disabled={allUsersDelete.submitting}
            onClick={handleAllUsersDelete}
          >
            Yes
          </button>
          <button
            id="allUsersDeleteNoBtn"
            type="button"
            className="header-btn"
            disabled={allUsersDelete.submitting}
            onClick={closeAllUsersDeleteModal}
          >
            No
          </button>
        </div>
      </section>
      <div id="allUsersDeleteOverlay" className="login-overlay" hidden={!allUsersDelete.open} onClick={closeAllUsersDeleteModal} />

      <aside id="mainMenu" className={`side-menu${menuOpen ? " open" : ""}`} aria-label="Main menu" aria-hidden={menuOpen ? "false" : "true"}>
        <div className="side-menu-head">
          <img src="/crm.svg" alt="CRM logo" className="side-logo" />
          <strong>Main Menu</strong>
        </div>
        <nav className="side-menu-links">
          <div id="usersMenuGroup" className="side-menu-group" hidden={!isAdmin}>
            <button
              id="toggleUsersMenuBtn"
              type="button"
              className="side-menu-action side-menu-parent"
              aria-expanded={usersMenuOpen ? "true" : "false"}
              onClick={() => setUsersMenuOpen((prev) => !prev)}
            >
              Users
            </button>
            <div id="usersSubMenu" className="side-submenu" hidden={!usersMenuOpen}>
              <button
                id="openAllUsersBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={() => {
                  closeMenu();
                  loadAllUsers(1, true);
                }}
              >
                All Users
              </button>
              <button
                id="openCreateUserBtn"
                type="button"
                className="side-submenu-link side-submenu-action"
                onClick={openCreateUserPanel}
              >
                Create User
              </button>
            </div>
          </div>
        </nav>
      </aside>

      <div id="menuOverlay" className="menu-overlay" hidden={!menuOpen} onClick={closeMenu} />
    </>
  );
}

export default ProfilePage;
