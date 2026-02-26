import { useCallback, useState } from "react";
import { apiFetch, readApiResponseData } from "../../lib/api.js";
import { formatDateForInput } from "../../lib/formatters.js";
import {
  ALL_USERS_LIMIT,
  createEmptyAllUsersDeleteState,
  createEmptyAllUsersEditState
} from "./profile.constants.js";
import { handleProtectedStatus } from "./profile.helpers.js";

export function useAllUsersSection({
  canReadUsers,
  canUpdateUsers,
  canDeleteUsers,
  navigate,
  ensureOrganizationsLoaded,
  getBirthdayValidationMessage
}) {
  const [allUsers, setAllUsers] = useState([]);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [allUsersMessage, setAllUsersMessage] = useState("");
  const [allUsersPage, setAllUsersPage] = useState(1);
  const [allUsersTotalPages, setAllUsersTotalPages] = useState(1);
  const [allUsersEdit, setAllUsersEdit] = useState(createEmptyAllUsersEditState);
  const [allUsersDelete, setAllUsersDelete] = useState(createEmptyAllUsersDeleteState);

  const closeAllUsersEditModal = useCallback(() => {
    setAllUsersEdit(createEmptyAllUsersEditState());
  }, []);

  const closeAllUsersDeleteModal = useCallback(() => {
    setAllUsersDelete(createEmptyAllUsersDeleteState());
  }, []);

  const loadAllUsers = useCallback(async (requestedPage = 1) => {
    if (!canReadUsers) {
      navigate("/404", { replace: true });
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

      const response = await apiFetch(`/api/users?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
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
  }, [canReadUsers, navigate]);

  const openAllUsersEditModal = useCallback((userId) => {
    if (!canUpdateUsers) {
      return;
    }

    ensureOrganizationsLoaded();

    const currentUser = allUsers.find((user) => String(user.id) === String(userId));
    if (!currentUser) {
      return;
    }

    setAllUsersEdit({
      open: true,
      id: String(currentUser.id || ""),
      submitting: false,
      form: {
        organizationName: String(currentUser.organizationName || ""),
        organizationCode: String(currentUser.organizationCode || ""),
        username: String(currentUser.username || ""),
        email: String(currentUser.email || ""),
        fullName: String(currentUser.fullName || ""),
        birthday: formatDateForInput(currentUser.birthday),
        phone: String(currentUser.phone || ""),
        position: String(currentUser.positionId || ""),
        role: String(currentUser.roleId || ""),
        password: ""
      },
      errors: {}
    });
  }, [allUsers, canUpdateUsers, ensureOrganizationsLoaded]);

  const openAllUsersDeleteModal = useCallback((userId) => {
    if (!canDeleteUsers) {
      return;
    }
    setAllUsersDelete({
      open: true,
      id: String(userId || ""),
      error: "",
      submitting: false
    });
  }, [canDeleteUsers]);

  const handleAllUsersEditSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!canUpdateUsers) {
      setAllUsersEdit((prev) => ({
        ...prev,
        errors: { username: "You do not have permission to edit users." }
      }));
      return;
    }

    if (!allUsersEdit.id) {
      return;
    }

    const payload = {
      organizationCode: String(allUsersEdit.form.organizationCode || "").trim().toLowerCase(),
      username: String(allUsersEdit.form.username || "").trim(),
      email: String(allUsersEdit.form.email || "").trim(),
      fullName: String(allUsersEdit.form.fullName || "").trim(),
      birthday: String(allUsersEdit.form.birthday || "").trim(),
      phone: String(allUsersEdit.form.phone || "").trim(),
      position: String(allUsersEdit.form.position || "").trim(),
      role: String(allUsersEdit.form.role || "").trim(),
      password: String(allUsersEdit.form.password || "")
    };

    const birthdayError = getBirthdayValidationMessage(payload.birthday);
    if (birthdayError) {
      setAllUsersEdit((prev) => ({
        ...prev,
        submitting: false,
        errors: { ...prev.errors, birthday: birthdayError }
      }));
      return;
    }

    try {
      setAllUsersEdit((prev) => ({
        ...prev,
        submitting: true,
        errors: {}
      }));

      const response = await apiFetch(`/api/users/${encodeURIComponent(allUsersEdit.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setAllUsersEdit((prev) => ({
          ...prev,
          submitting: false,
          errors: data?.errors && typeof data.errors === "object"
            ? data.errors
            : data?.field
              ? { [data.field]: data.message || "Invalid value." }
              : { username: data?.message || "Failed to update user." }
        }));
        return;
      }

      closeAllUsersEditModal();
      await loadAllUsers(allUsersPage);
    } catch {
      setAllUsersEdit((prev) => ({
        ...prev,
        submitting: false,
        errors: { username: "Unexpected error. Please try again." }
      }));
    }
  }, [
    allUsersEdit.form.birthday,
    allUsersEdit.form.email,
    allUsersEdit.form.fullName,
    allUsersEdit.form.organizationCode,
    allUsersEdit.form.password,
    allUsersEdit.form.phone,
    allUsersEdit.form.position,
    allUsersEdit.form.role,
    allUsersEdit.form.username,
    allUsersEdit.id,
    allUsersPage,
    canUpdateUsers,
    closeAllUsersEditModal,
    getBirthdayValidationMessage,
    loadAllUsers,
    navigate
  ]);

  const handleAllUsersDelete = useCallback(async () => {
    if (!canDeleteUsers) {
      setAllUsersDelete((prev) => ({
        ...prev,
        error: "You do not have permission to delete users."
      }));
      return;
    }

    if (!allUsersDelete.id) {
      return;
    }

    try {
      setAllUsersDelete((prev) => ({
        ...prev,
        submitting: true,
        error: ""
      }));

      const response = await apiFetch(`/api/users/${encodeURIComponent(allUsersDelete.id)}`, {
        method: "DELETE"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setAllUsersDelete((prev) => ({
          ...prev,
          submitting: false,
          error: data?.message || "Failed to delete user."
        }));
        return;
      }

      closeAllUsersDeleteModal();
      await loadAllUsers(allUsersPage);
    } catch {
      setAllUsersDelete((prev) => ({
        ...prev,
        submitting: false,
        error: "Unexpected error. Please try again."
      }));
    }
  }, [
    allUsersDelete.id,
    allUsersPage,
    canDeleteUsers,
    closeAllUsersDeleteModal,
    loadAllUsers,
    navigate
  ]);

  return {
    allUsers,
    allUsersLoading,
    allUsersMessage,
    allUsersPage,
    allUsersTotalPages,
    allUsersEdit,
    allUsersDelete,
    setAllUsersEdit,
    loadAllUsers,
    openAllUsersEditModal,
    openAllUsersDeleteModal,
    handleAllUsersEditSubmit,
    handleAllUsersDelete,
    closeAllUsersEditModal,
    closeAllUsersDeleteModal
  };
}

