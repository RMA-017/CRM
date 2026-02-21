import { useCallback, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { formatDateForInput } from "../../lib/formatters.js";
import { ALL_USERS_LIMIT, createEmptyClientsDeleteState } from "./profile.constants.js";
import { handleProtectedStatus } from "./profile.helpers.js";

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const TELEGRAM_USERNAME_REGEX = /^@?[a-zA-Z0-9_]{5,32}$/;

const EMPTY_CLIENT_CREATE_FORM = {
  firstName: "",
  lastName: "",
  middleName: "",
  birthday: "",
  phone: "",
  telegramOrEmail: "",
  isVip: false
};

const EMPTY_CLIENT_EDIT_FORM = {
  firstName: "",
  lastName: "",
  middleName: "",
  birthday: "",
  phone: "",
  tgMail: "",
  isVip: false,
  note: ""
};

export function useClientsSection({
  canReadClients,
  canCreateClients,
  canUpdateClients,
  canDeleteClients,
  navigate,
  getBirthdayValidationMessage
}) {
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsMessage, setClientsMessage] = useState("");
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsTotalPages, setClientsTotalPages] = useState(1);
  const [clientCreateForm, setClientCreateForm] = useState({ ...EMPTY_CLIENT_CREATE_FORM });
  const [clientCreateErrors, setClientCreateErrors] = useState({});
  const [clientCreateSubmitting, setClientCreateSubmitting] = useState(false);
  const [clientEditId, setClientEditId] = useState("");
  const [clientEditForm, setClientEditForm] = useState({ ...EMPTY_CLIENT_EDIT_FORM });
  const [clientEditErrors, setClientEditErrors] = useState({});
  const [clientEditSubmitting, setClientEditSubmitting] = useState(false);
  const [clientsEditOpen, setClientsEditOpen] = useState(false);
  const [clientsDelete, setClientsDelete] = useState(createEmptyClientsDeleteState());

  const closeClientsEditModal = useCallback(() => {
    setClientsEditOpen(false);
    setClientEditId("");
    setClientEditForm({ ...EMPTY_CLIENT_EDIT_FORM });
    setClientEditErrors({});
    setClientEditSubmitting(false);
  }, []);

  const closeClientsDeleteModal = useCallback(() => {
    setClientsDelete(createEmptyClientsDeleteState());
  }, []);

  const validateClientCreateForm = useCallback((form) => {
    const errors = {};
    const firstName = String(form?.firstName || "").trim();
    const lastName = String(form?.lastName || "").trim();
    const middleName = String(form?.middleName || "").trim();
    const birthday = String(form?.birthday || "").trim();
    const phone = String(form?.phone || "").trim();
    const telegramOrEmail = String(form?.telegramOrEmail || "").trim();
    const fullName = [lastName, firstName, middleName].filter(Boolean).join(" ").trim();

    if (!firstName) {
      errors.firstName = "First name is required.";
    } else if (firstName.length > 64) {
      errors.firstName = "First name is too long (max 64).";
    }

    if (!lastName) {
      errors.lastName = "Last name is required.";
    } else if (lastName.length > 64) {
      errors.lastName = "Last name is too long (max 64).";
    }

    if (middleName && middleName.length > 64) {
      errors.middleName = "Middle name is too long (max 64).";
    }

    const birthdayError = getBirthdayValidationMessage(birthday, { required: true });
    if (birthdayError) {
      errors.birthday = birthdayError;
    }

    if (phone && !PHONE_REGEX.test(phone)) {
      errors.phone = "Invalid phone number.";
    }

    if (telegramOrEmail) {
      const isEmail = EMAIL_REGEX.test(telegramOrEmail);
      const isTelegram = TELEGRAM_USERNAME_REGEX.test(telegramOrEmail);
      if (!isEmail && !isTelegram) {
        errors.telegramOrEmail = "Enter valid Telegram username or email.";
      } else if (telegramOrEmail.length > 96) {
        errors.telegramOrEmail = "Telegram or email is too long (max 96).";
      }
    }

    if (fullName.length > 96) {
      errors.firstName = "Full name is too long (max 96).";
    }

    return errors;
  }, [getBirthdayValidationMessage]);

  const validateClientEditForm = useCallback((form) => {
    const errors = {};
    const firstName = String(form?.firstName || "").trim();
    const lastName = String(form?.lastName || "").trim();
    const middleName = String(form?.middleName || "").trim();
    const birthday = String(form?.birthday || "").trim();
    const phone = String(form?.phone || "").trim();
    const tgMail = String(form?.tgMail || "").trim();
    const note = String(form?.note || "").trim();

    if (!firstName) {
      errors.firstName = "First name is required.";
    } else if (firstName.length > 64) {
      errors.firstName = "First name is too long (max 64).";
    }

    if (!lastName) {
      errors.lastName = "Last name is required.";
    } else if (lastName.length > 64) {
      errors.lastName = "Last name is too long (max 64).";
    }

    if (middleName && middleName.length > 64) {
      errors.middleName = "Middle name is too long (max 64).";
    }

    const birthdayError = getBirthdayValidationMessage(birthday, { required: true });
    if (birthdayError) {
      errors.birthday = birthdayError;
    }

    if (phone && !PHONE_REGEX.test(phone)) {
      errors.phone = "Invalid phone number.";
    }

    if (tgMail && tgMail.length > 96) {
      errors.tgMail = "Telegram or email is too long (max 96).";
    }

    if (note.length > 255) {
      errors.note = "Note is too long (max 255).";
    }

    return errors;
  }, [getBirthdayValidationMessage]);

  const loadClients = useCallback(async (requestedPage = 1) => {
    if (!canReadClients) {
      navigate("/404", { replace: true });
      return;
    }

    const nextPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    setClientsLoading(true);
    setClientsMessage("Loading clients...");

    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        limit: String(ALL_USERS_LIMIT)
      });

      const response = await apiFetch(`/api/clients?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setClients([]);
        setClientsMessage(data?.message || "Failed to load clients.");
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      const pagination = data?.pagination || {};

      setClientsPage(Number(pagination.page) || 1);
      setClientsTotalPages(Number(pagination.totalPages) || 1);

      if (items.length === 0) {
        setClients([]);
        setClientsMessage("No clients found.");
        return;
      }

      setClients(items);
      setClientsMessage("");
    } catch {
      setClients([]);
      setClientsMessage("Unexpected error. Please try again.");
    } finally {
      setClientsLoading(false);
    }
  }, [canReadClients, navigate]);

  const handleClientCreateSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!canCreateClients) {
      setClientCreateErrors({ firstName: "You do not have permission to create clients." });
      return;
    }

    const firstName = String(clientCreateForm.firstName || "").trim();
    const lastName = String(clientCreateForm.lastName || "").trim();
    const middleName = String(clientCreateForm.middleName || "").trim();
    const birthday = String(clientCreateForm.birthday || "").trim();
    const telegramOrEmail = String(clientCreateForm.telegramOrEmail || "").trim();
    const createErrors = validateClientCreateForm(clientCreateForm);
    setClientCreateErrors(createErrors);
    if (Object.keys(createErrors).length > 0) {
      return;
    }

    const payload = {
      firstName,
      lastName,
      middleName,
      birthday,
      phone: String(clientCreateForm.phone || "").trim(),
      tgMail: telegramOrEmail,
      isVip: Boolean(clientCreateForm.isVip),
      note: ""
    };

    try {
      setClientCreateSubmitting(true);

      const response = await apiFetch("/api/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        if (data?.errors && typeof data.errors === "object") {
          setClientCreateErrors({
            firstName: data.errors.firstName || data.errors.fullName || "",
            lastName: data.errors.lastName || "",
            middleName: data.errors.middleName || "",
            birthday: data.errors.birthday || data.errors.notes || "",
            phone: data.errors.phone || "",
            telegramOrEmail: data.errors.tgMail || data.errors.notes || ""
          });
        } else if (data?.field) {
          if (data.field === "fullName" || data.field === "firstName") {
            setClientCreateErrors({ firstName: data.message || "Invalid value." });
          } else if (data.field === "lastName") {
            setClientCreateErrors({ lastName: data.message || "Invalid value." });
          } else if (data.field === "middleName") {
            setClientCreateErrors({ middleName: data.message || "Invalid value." });
          } else if (data.field === "birthday") {
            setClientCreateErrors({ birthday: data.message || "Invalid value." });
          } else if (data.field === "notes") {
            setClientCreateErrors({ telegramOrEmail: data.message || "Invalid value." });
          } else if (data.field === "tgMail") {
            setClientCreateErrors({ telegramOrEmail: data.message || "Invalid value." });
          } else {
            setClientCreateErrors({ [data.field]: data.message || "Invalid value." });
          }
        } else {
          setClientCreateErrors({ firstName: data?.message || "Failed to create client." });
        }
        return;
      }

      setClientCreateForm({ ...EMPTY_CLIENT_CREATE_FORM });
      setClientCreateErrors({});
      if (canReadClients) {
        await loadClients(1);
      }
    } catch {
      setClientCreateErrors({ firstName: "Unexpected error. Please try again." });
    } finally {
      setClientCreateSubmitting(false);
    }
  }, [
    canCreateClients,
    canReadClients,
    clientCreateForm,
    loadClients,
    navigate,
    validateClientCreateForm
  ]);

  const startClientEdit = useCallback((item) => {
    setClientEditId(String(item?.id || ""));
    setClientsEditOpen(true);
    setClientEditForm({
      firstName: String(item?.firstName || item?.first_name || "").trim(),
      lastName: String(item?.lastName || item?.last_name || "").trim(),
      middleName: String(item?.middleName || item?.middle_name || "").trim(),
      birthday: formatDateForInput(item?.birthday || item?.birthdate || ""),
      phone: String(item?.phone || ""),
      tgMail: String(
        item?.tgMail
        || item?.telegramOrEmail
        || item?.telegram_or_email
        || item?.tg_mail
        || ""
      ).trim(),
      isVip: Boolean(item?.isVip ?? item?.is_vip),
      note: String(item?.note || "").trim()
    });
    setClientEditErrors({});
  }, []);

  const handleClientEditSave = useCallback(async (id) => {
    if (!canUpdateClients) {
      setClientEditErrors({ firstName: "You do not have permission to update clients." });
      return;
    }

    const clientId = String(id || "").trim();
    if (!clientId) {
      return;
    }

    const payload = {
      firstName: String(clientEditForm.firstName || "").trim(),
      lastName: String(clientEditForm.lastName || "").trim(),
      middleName: String(clientEditForm.middleName || "").trim(),
      birthday: String(clientEditForm.birthday || "").trim(),
      phone: String(clientEditForm.phone || "").trim(),
      tgMail: String(clientEditForm.tgMail || "").trim(),
      isVip: Boolean(clientEditForm.isVip),
      note: String(clientEditForm.note || "").trim()
    };

    const errors = validateClientEditForm(clientEditForm);
    setClientEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    try {
      setClientEditSubmitting(true);

      const response = await apiFetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        if (data?.errors && typeof data.errors === "object") {
          setClientEditErrors({
            firstName: data.errors.firstName || data.errors.fullName || "",
            lastName: data.errors.lastName || "",
            middleName: data.errors.middleName || "",
            birthday: data.errors.birthday || data.errors.notes || "",
            phone: data.errors.phone || "",
            tgMail: data.errors.tgMail || "",
            isVip: data.errors.isVip || "",
            note: data.errors.note || ""
          });
        } else if (data?.field) {
          setClientEditErrors({ [data.field]: data.message || "Invalid value." });
        } else {
          setClientEditErrors({ firstName: data?.message || "Failed to update client." });
        }
        return;
      }

      closeClientsEditModal();
      if (canReadClients) {
        await loadClients(clientsPage);
      }
    } catch {
      setClientEditErrors({ firstName: "Unexpected error. Please try again." });
    } finally {
      setClientEditSubmitting(false);
    }
  }, [
    canReadClients,
    canUpdateClients,
    clientEditForm,
    clientsPage,
    closeClientsEditModal,
    loadClients,
    navigate,
    validateClientEditForm
  ]);

  const handleClientEditSubmit = useCallback(async (event) => {
    event.preventDefault();
    await handleClientEditSave(clientEditId);
  }, [clientEditId, handleClientEditSave]);

  const openClientsDeleteModal = useCallback((client) => {
    if (!canDeleteClients) {
      return;
    }

    const clientId = String(client?.id || "").trim();
    if (!clientId) {
      return;
    }

    const firstName = String(client?.firstName || client?.first_name || "").trim();
    const lastName = String(client?.lastName || client?.last_name || "").trim();
    const middleName = String(client?.middleName || client?.middle_name || "").trim();
    const label = [lastName, firstName, middleName].filter(Boolean).join(" ").trim();

    setClientsDelete({
      open: true,
      id: clientId,
      label,
      error: "",
      submitting: false
    });
  }, [canDeleteClients]);

  const handleClientsDeleteConfirm = useCallback(async () => {
    if (!canDeleteClients) {
      setClientsDelete((prev) => ({
        ...prev,
        error: "You do not have permission to delete clients."
      }));
      return;
    }

    const clientId = String(clientsDelete.id || "").trim();
    if (!clientId) {
      return;
    }

    try {
      setClientsDelete((prev) => ({
        ...prev,
        submitting: true,
        error: ""
      }));

      const response = await apiFetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "DELETE"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setClientsDelete((prev) => ({
          ...prev,
          submitting: false,
          error: data?.message || "Failed to delete client."
        }));
        return;
      }

      if (clientEditId === clientId) {
        closeClientsEditModal();
      }
      closeClientsDeleteModal();
      if (canReadClients) {
        await loadClients(clientsPage);
      }
    } catch {
      setClientsDelete((prev) => ({
        ...prev,
        submitting: false,
        error: "Unexpected error. Please try again."
      }));
    }
  }, [
    canDeleteClients,
    canReadClients,
    clientEditId,
    clientsDelete.id,
    clientsPage,
    closeClientsDeleteModal,
    closeClientsEditModal,
    loadClients,
    navigate
  ]);

  return {
    clients,
    clientsLoading,
    clientsMessage,
    clientsPage,
    clientsTotalPages,
    clientCreateForm,
    clientCreateErrors,
    clientCreateSubmitting,
    clientEditId,
    clientEditForm,
    clientEditErrors,
    clientEditSubmitting,
    clientsEditOpen,
    clientsDelete,
    setClientCreateForm,
    setClientCreateErrors,
    setClientEditForm,
    setClientEditErrors,
    loadClients,
    handleClientCreateSubmit,
    startClientEdit,
    handleClientEditSave,
    handleClientEditSubmit,
    openClientsDeleteModal,
    handleClientsDeleteConfirm,
    closeClientsEditModal,
    closeClientsDeleteModal
  };
}
