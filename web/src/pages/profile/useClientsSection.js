import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, readApiResponseData } from "../../lib/api.js";
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

const CLIENT_MEDICAL_HISTORY_TEXT_LIMITS = Object.freeze({
  conditionName: 160,
  symptoms: 2000,
  diagnosis: 2000,
  treatmentPlan: 4000,
  note: 4000
});

function createEmptyClientMedicalHistoryForm() {
  return {
    id: "",
    entryDate: formatDateForInput(new Date()),
    conditionName: "",
    symptoms: "",
    diagnosis: "",
    treatmentPlan: "",
    note: ""
  };
}

function createEmptyClientMedicalHistoryClient() {
  return {
    id: "",
    fullName: "",
    birthday: "",
    isVip: false
  };
}

function createEmptyClientMedicalHistoryClientSearch() {
  return {
    id: "",
    firstName: "",
    lastName: "",
    middleName: ""
  };
}

function createEmptyClientMedicalHistoryDeleteState() {
  return {
    open: false,
    clientId: "",
    entryId: "",
    deleteAll: false,
    label: "",
    error: "",
    submitting: false
  };
}

function resolveClientMedicalHistorySkeletonCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 12);
  }
  return 3;
}

function normalizeClientMedicalHistoryClientOption(item) {
  const id = String(item?.id || "").trim();
  const firstName = String(item?.firstName || item?.first_name || "").trim();
  const lastName = String(item?.lastName || item?.last_name || "").trim();
  const middleName = String(item?.middleName || item?.middle_name || "").trim();
  const fullName = String(item?.fullName || [lastName, firstName, middleName].filter(Boolean).join(" ")).trim();

  return {
    id,
    firstName,
    lastName,
    middleName,
    fullName,
    birthday: String(item?.birthday || "").trim(),
    isVip: Boolean(item?.isVip ?? item?.is_vip)
  };
}

function normalizeClientMedicalHistoryItem(item) {
  return {
    id: String(item?.id || "").trim(),
    clientId: String(item?.clientId || item?.client_id || "").trim(),
    entryDate: String(item?.entryDate || item?.entry_date || "").trim(),
    conditionName: String(item?.conditionName || item?.condition_name || "").trim(),
    symptoms: String(item?.symptoms || "").trim(),
    diagnosis: String(item?.diagnosis || "").trim(),
    treatmentPlan: String(item?.treatmentPlan || item?.treatment_plan || "").trim(),
    note: String(item?.note || "").trim(),
    specialistId: String(item?.specialistId || item?.authorUserId || item?.author_user_id || "").trim(),
    specialistPosition: String(item?.specialistPosition || item?.authorPositionLabel || item?.author_position_label || "").trim(),
    specialistName: String(item?.specialistName || item?.authorName || item?.author_name || "").trim(),
    createdAt: item?.createdAt || item?.created_at || null,
    updatedAt: item?.updatedAt || item?.updated_at || null
  };
}

function compareClientMedicalHistoryItems(left, right) {
  const entryDateCompare = String(right?.entryDate || "").localeCompare(String(left?.entryDate || ""));
  if (entryDateCompare !== 0) {
    return entryDateCompare;
  }

  const updatedAtLeft = Date.parse(String(left?.updatedAt || left?.createdAt || ""));
  const updatedAtRight = Date.parse(String(right?.updatedAt || right?.createdAt || ""));
  if (!Number.isNaN(updatedAtLeft) && !Number.isNaN(updatedAtRight) && updatedAtLeft !== updatedAtRight) {
    return updatedAtRight - updatedAtLeft;
  }

  return String(right?.id || "").localeCompare(String(left?.id || ""));
}

export function useClientsSection({
  currentView = "",
  isAdmin = false,
  isPlatformAdmin = false,
  canReadClients,
  canCreateClients,
  canUpdateClients,
  canDeleteClients,
  canReadClientMedicalHistory,
  canCreateClientMedicalHistory,
  canUpdateClientMedicalHistory,
  canDeleteClientMedicalHistory,
  navigate,
  getBirthdayValidationMessage
}) {
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsMessage, setClientsMessage] = useState("");
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsTotalPages, setClientsTotalPages] = useState(1);
  const [clientsSearch, setClientsSearch] = useState("");
  const [clientsIsVip, setClientsIsVip] = useState("");
  const [clientsHistoryIdSearch, setClientsHistoryIdSearch] = useState("");
  const [clientsHistorySelectedClientId, setClientsHistorySelectedClientId] = useState("");
  const [clientsHistoryNameSearch, setClientsHistoryNameSearch] = useState("");
  const [clientsHistoryDateFrom, setClientsHistoryDateFrom] = useState("");
  const [clientsHistoryDateTo, setClientsHistoryDateTo] = useState("");
  const [clientsHistoryPositionId, setClientsHistoryPositionId] = useState("");
  const [clientsHistorySpecialistId, setClientsHistorySpecialistId] = useState("");
  const clientsSearchRef = useRef("");
  const clientsIsVipRef = useRef("");
  const clientsHistoryIdSearchRef = useRef("");
  const clientsHistorySelectedClientIdRef = useRef("");
  const clientsHistoryNameSearchRef = useRef("");
  const clientsHistoryDateFromRef = useRef("");
  const clientsHistoryDateToRef = useRef("");
  const clientsHistoryPositionIdRef = useRef("");
  const clientsHistorySpecialistIdRef = useRef("");
  const lastClientsRequestKeyRef = useRef("");
  const lastMedicalHistoryRequestKeyRef = useRef("");
  const [clientCreateForm, setClientCreateForm] = useState({ ...EMPTY_CLIENT_CREATE_FORM });
  const [clientCreateErrors, setClientCreateErrors] = useState({});
  const [clientCreateSubmitting, setClientCreateSubmitting] = useState(false);
  const [clientEditId, setClientEditId] = useState("");
  const [clientEditForm, setClientEditForm] = useState({ ...EMPTY_CLIENT_EDIT_FORM });
  const [clientEditErrors, setClientEditErrors] = useState({});
  const [clientEditSubmitting, setClientEditSubmitting] = useState(false);
  const [clientsEditOpen, setClientsEditOpen] = useState(false);
  const [clientsDelete, setClientsDelete] = useState(createEmptyClientsDeleteState());
  const [clientMedicalHistoryOpen, setClientMedicalHistoryOpen] = useState(false);
  const [clientMedicalHistoryClient, setClientMedicalHistoryClient] = useState(createEmptyClientMedicalHistoryClient);
  const [clientMedicalHistoryClientSearch, setClientMedicalHistoryClientSearch] = useState(() => createEmptyClientMedicalHistoryClientSearch());
  const [clientMedicalHistoryClientOptions, setClientMedicalHistoryClientOptions] = useState([]);
  const [clientMedicalHistoryClientOptionsLoading, setClientMedicalHistoryClientOptionsLoading] = useState(false);
  const [clientMedicalHistoryMode, setClientMedicalHistoryMode] = useState("create");
  const [clientMedicalHistoryItems, setClientMedicalHistoryItems] = useState([]);
  const [clientMedicalHistorySkeletonCount, setClientMedicalHistorySkeletonCount] = useState(3);
  const [clientMedicalHistoryLoading, setClientMedicalHistoryLoading] = useState(false);
  const [clientMedicalHistoryMessage, setClientMedicalHistoryMessage] = useState("");
  const [clientMedicalHistoryForm, setClientMedicalHistoryForm] = useState(() => createEmptyClientMedicalHistoryForm());
  const [clientMedicalHistoryErrors, setClientMedicalHistoryErrors] = useState({});
  const [clientMedicalHistorySubmitting, setClientMedicalHistorySubmitting] = useState(false);
  const [clientMedicalHistoryDeletingId, setClientMedicalHistoryDeletingId] = useState("");
  const [clientMedicalHistoryDelete, setClientMedicalHistoryDelete] = useState(createEmptyClientMedicalHistoryDeleteState());
  const isClientMedicalHistoryView = currentView === "clients-medical-history";
  const hasMedicalHistoryReadAccess = canReadClientMedicalHistory || isAdmin || isPlatformAdmin;
  const hasMedicalHistoryCreateAccess = canCreateClientMedicalHistory || isAdmin || isPlatformAdmin;
  const hasMedicalHistoryUpdateAccess = canUpdateClientMedicalHistory || isAdmin || isPlatformAdmin;
  const hasMedicalHistoryDeleteAccess = canDeleteClientMedicalHistory || isAdmin || isPlatformAdmin;
  const hasMedicalHistoryBulkDeleteAccess = isAdmin || isPlatformAdmin;

  useEffect(() => {
    clientsSearchRef.current = clientsSearch;
  }, [clientsSearch]);

  useEffect(() => {
    clientsIsVipRef.current = clientsIsVip;
  }, [clientsIsVip]);

  useEffect(() => {
    clientsHistoryIdSearchRef.current = clientsHistoryIdSearch;
  }, [clientsHistoryIdSearch]);

  useEffect(() => {
    clientsHistorySelectedClientIdRef.current = clientsHistorySelectedClientId;
  }, [clientsHistorySelectedClientId]);

  useEffect(() => {
    clientsHistoryNameSearchRef.current = clientsHistoryNameSearch;
  }, [clientsHistoryNameSearch]);

  useEffect(() => {
    clientsHistoryDateFromRef.current = clientsHistoryDateFrom;
  }, [clientsHistoryDateFrom]);

  useEffect(() => {
    clientsHistoryDateToRef.current = clientsHistoryDateTo;
  }, [clientsHistoryDateTo]);

  useEffect(() => {
    clientsHistoryPositionIdRef.current = clientsHistoryPositionId;
  }, [clientsHistoryPositionId]);

  useEffect(() => {
    clientsHistorySpecialistIdRef.current = clientsHistorySpecialistId;
  }, [clientsHistorySpecialistId]);

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

  const closeClientMedicalHistoryDeleteModal = useCallback(() => {
    setClientMedicalHistoryDelete(createEmptyClientMedicalHistoryDeleteState());
  }, []);

  const resetClientMedicalHistoryForm = useCallback(() => {
    setClientMedicalHistoryForm(createEmptyClientMedicalHistoryForm());
    setClientMedicalHistoryErrors({});
  }, []);

  const closeClientMedicalHistoryModal = useCallback(() => {
    setClientMedicalHistoryOpen(false);
    setClientMedicalHistoryMode("create");
    setClientMedicalHistoryClient(createEmptyClientMedicalHistoryClient());
    setClientMedicalHistoryClientSearch(createEmptyClientMedicalHistoryClientSearch());
    setClientMedicalHistoryClientOptions([]);
    setClientMedicalHistoryClientOptionsLoading(false);
    setClientMedicalHistoryItems([]);
    setClientMedicalHistorySkeletonCount(3);
    setClientMedicalHistoryLoading(false);
    setClientMedicalHistoryMessage("");
    setClientMedicalHistoryDeletingId("");
    setClientMedicalHistoryDelete(createEmptyClientMedicalHistoryDeleteState());
    setClientMedicalHistorySubmitting(false);
    resetClientMedicalHistoryForm();
  }, [resetClientMedicalHistoryForm]);

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

  const validateClientMedicalHistoryForm = useCallback((form) => {
    const errors = {};
    const entryDate = String(form?.entryDate || "").trim();
    const conditionName = String(form?.conditionName || "").trim();
    const symptoms = String(form?.symptoms || "").trim();
    const diagnosis = String(form?.diagnosis || "").trim();
    const treatmentPlan = String(form?.treatmentPlan || "").trim();
    const note = String(form?.note || "").trim();

    if (!entryDate) {
      errors.entryDate = "Entry date is required.";
    }

    if (!conditionName) {
      errors.conditionName = "Condition is required.";
    } else if (conditionName.length > CLIENT_MEDICAL_HISTORY_TEXT_LIMITS.conditionName) {
      errors.conditionName = `Condition is too long (max ${CLIENT_MEDICAL_HISTORY_TEXT_LIMITS.conditionName}).`;
    }

    if (symptoms.length > CLIENT_MEDICAL_HISTORY_TEXT_LIMITS.symptoms) {
      errors.symptoms = `Symptoms are too long (max ${CLIENT_MEDICAL_HISTORY_TEXT_LIMITS.symptoms}).`;
    }

    if (diagnosis.length > CLIENT_MEDICAL_HISTORY_TEXT_LIMITS.diagnosis) {
      errors.diagnosis = `Diagnosis is too long (max ${CLIENT_MEDICAL_HISTORY_TEXT_LIMITS.diagnosis}).`;
    }

    if (treatmentPlan.length > CLIENT_MEDICAL_HISTORY_TEXT_LIMITS.treatmentPlan) {
      errors.treatmentPlan = `Treatment plan is too long (max ${CLIENT_MEDICAL_HISTORY_TEXT_LIMITS.treatmentPlan}).`;
    }

    if (note.length > CLIENT_MEDICAL_HISTORY_TEXT_LIMITS.note) {
      errors.note = `Note is too long (max ${CLIENT_MEDICAL_HISTORY_TEXT_LIMITS.note}).`;
    }

    return errors;
  }, []);

  const loadClients = useCallback(async (requestedPage = 1, overrides = {}) => {
    if (!canReadClients) {
      navigate("/404", { replace: true });
      return;
    }

    const normalizedOverrides = overrides && typeof overrides === "object" ? overrides : {};
    const nextPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const force = normalizedOverrides.force === true;
    const trimmedSearch = String(
      normalizedOverrides.search !== undefined ? normalizedOverrides.search : clientsSearchRef.current
    ).trim();
    const vipFilter = normalizedOverrides.isVip !== undefined ? normalizedOverrides.isVip : clientsIsVipRef.current;
    const requestKey = JSON.stringify({
      page: nextPage,
      search: trimmedSearch,
      isVip: vipFilter === "true" || vipFilter === "false" ? vipFilter : ""
    });
    if (!force && lastClientsRequestKeyRef.current === requestKey) {
      return;
    }
    setClientsMessage("");
    setClientsLoading(true);

    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        limit: String(ALL_USERS_LIMIT)
      });
      if (trimmedSearch) {
        query.set("q", trimmedSearch);
      }
      if (vipFilter === "true" || vipFilter === "false") {
        query.set("isVip", vipFilter);
      }

      const response = await apiFetch(`/api/clients?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);

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
      lastClientsRequestKeyRef.current = requestKey;

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
  }, [
    canReadClients,
    navigate
  ]);

  const loadClientMedicalHistoryClients = useCallback(async (requestedPage = 1, overrides = {}) => {
    if (!canReadClients || !hasMedicalHistoryReadAccess) {
      navigate("/404", { replace: true });
      return;
    }

    const normalizedOverrides = overrides && typeof overrides === "object" ? overrides : {};
    const nextPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const force = normalizedOverrides.force === true;
    const trimmedSearch = String(
      normalizedOverrides.search !== undefined ? normalizedOverrides.search : clientsSearchRef.current
    ).trim();
    const vipFilter = normalizedOverrides.isVip !== undefined ? normalizedOverrides.isVip : clientsIsVipRef.current;
    const requestKey = JSON.stringify({
      page: nextPage,
      search: trimmedSearch,
      isVip: vipFilter === "true" || vipFilter === "false" ? vipFilter : ""
    });
    if (!force && lastMedicalHistoryRequestKeyRef.current === requestKey) {
      return;
    }
    setClientsMessage("");
    setClientsLoading(true);

    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        limit: String(ALL_USERS_LIMIT)
      });
      if (trimmedSearch) {
        query.set("q", trimmedSearch);
      }
      if (vipFilter === "true" || vipFilter === "false") {
        query.set("isVip", vipFilter);
      }

      const response = await apiFetch(`/api/clients/medical-history?${query.toString()}`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setClients([]);
        setClientsMessage(data?.message || "Failed to load client medical history.");
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      const pagination = data?.pagination || {};

      setClientsPage(Number(pagination.page) || 1);
      setClientsTotalPages(Number(pagination.totalPages) || 1);
      lastMedicalHistoryRequestKeyRef.current = requestKey;

      if (items.length === 0) {
        setClients([]);
        setClientsMessage("No medical history clients found.");
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
  }, [
    canReadClients,
    hasMedicalHistoryReadAccess,
    navigate
  ]);

  const reloadCurrentClientsView = useCallback(async (requestedPage = clientsPage, overrides = {}) => {
    if (isClientMedicalHistoryView) {
      await loadClientMedicalHistoryClients(requestedPage, overrides);
      return;
    }
    await loadClients(requestedPage, overrides);
  }, [
    clientsPage,
    isClientMedicalHistoryView,
    loadClientMedicalHistoryClients,
    loadClients
  ]);

  const handleClientCreateSubmit = useCallback(async (event) => {
    event.preventDefault();

    if (!canCreateClients) {
      setClientCreateErrors({ firstName: "You do not have permission to create clients." });
      return false;
    }

    const firstName = String(clientCreateForm.firstName || "").trim();
    const lastName = String(clientCreateForm.lastName || "").trim();
    const middleName = String(clientCreateForm.middleName || "").trim();
    const birthday = String(clientCreateForm.birthday || "").trim();
    const telegramOrEmail = String(clientCreateForm.telegramOrEmail || "").trim();
    const createErrors = validateClientCreateForm(clientCreateForm);
    setClientCreateErrors(createErrors);
    if (Object.keys(createErrors).length > 0) {
      return false;
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
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return false;
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
        return false;
      }

      setClientCreateForm({ ...EMPTY_CLIENT_CREATE_FORM });
      setClientCreateErrors({});
      if (canReadClients) {
        await loadClients(1, { force: true });
      }
      return true;
    } catch {
      setClientCreateErrors({ firstName: "Unexpected error. Please try again." });
      return false;
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
      const data = await readApiResponseData(response);

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
        await reloadCurrentClientsView(clientsPage, { force: true });
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
    navigate,
    reloadCurrentClientsView,
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
      const data = await readApiResponseData(response);

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
        await reloadCurrentClientsView(clientsPage, { force: true });
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
    navigate,
    reloadCurrentClientsView
  ]);

  const loadClientMedicalHistory = useCallback(async (clientId, clientFallback = null) => {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      return;
    }

    if (!hasMedicalHistoryReadAccess) {
      setClientMedicalHistoryItems([]);
      setClientMedicalHistoryMessage("You do not have permission to view medical history.");
      return;
    }

    setClientMedicalHistoryLoading(true);
    setClientMedicalHistoryMessage("");

    try {
      const response = await apiFetch(`/api/clients/${encodeURIComponent(normalizedClientId)}/medical-history`, {
        method: "GET",
        cache: "no-store"
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return;
        }
        setClientMedicalHistoryItems([]);
        setClientMedicalHistoryMessage(data?.message || "Failed to load medical history.");
        return;
      }

      const serverClient = data?.client && typeof data.client === "object" ? data.client : {};
      const fallbackClient = clientFallback && typeof clientFallback === "object" ? clientFallback : {};
      const fullName = String(
        serverClient.fullName
        || [
          serverClient.lastName,
          serverClient.firstName,
          serverClient.middleName
        ].filter(Boolean).join(" ")
        || [
          fallbackClient.lastName || fallbackClient.last_name,
          fallbackClient.firstName || fallbackClient.first_name,
          fallbackClient.middleName || fallbackClient.middle_name
        ].filter(Boolean).join(" ")
      ).trim();

      setClientMedicalHistoryClient({
        id: String(serverClient.id || normalizedClientId).trim(),
        fullName,
        birthday: String(serverClient.birthday || fallbackClient.birthday || "").trim(),
        isVip: Boolean(serverClient.isVip ?? serverClient.is_vip ?? fallbackClient.isVip ?? fallbackClient.is_vip)
      });

      const items = (Array.isArray(data?.items) ? data.items : [])
        .map((item) => normalizeClientMedicalHistoryItem(item))
        .filter((item) => Boolean(item.id))
        .sort(compareClientMedicalHistoryItems);

      setClientMedicalHistoryItems(items);
      setClientMedicalHistorySkeletonCount(resolveClientMedicalHistorySkeletonCount(items.length));
      setClientMedicalHistoryMessage("");
    } catch {
      setClientMedicalHistoryItems([]);
      setClientMedicalHistorySkeletonCount(3);
      setClientMedicalHistoryMessage("Unexpected error. Please try again.");
    } finally {
      setClientMedicalHistoryLoading(false);
    }
  }, [hasMedicalHistoryReadAccess, navigate]);

  const openClientMedicalHistoryCreateModal = useCallback(() => {
    if (!hasMedicalHistoryCreateAccess) {
      return;
    }

    setClientMedicalHistoryOpen(true);
    setClientMedicalHistoryMode("create");
    setClientMedicalHistoryClient(createEmptyClientMedicalHistoryClient());
    setClientMedicalHistoryClientSearch(createEmptyClientMedicalHistoryClientSearch());
    setClientMedicalHistoryClientOptions([]);
    setClientMedicalHistoryItems([]);
    setClientMedicalHistorySkeletonCount(3);
    setClientMedicalHistoryMessage("");
    setClientMedicalHistoryDeletingId("");
    setClientMedicalHistoryDelete(createEmptyClientMedicalHistoryDeleteState());
    resetClientMedicalHistoryForm();
  }, [
    hasMedicalHistoryCreateAccess,
    resetClientMedicalHistoryForm
  ]);

  const selectClientMedicalHistoryClient = useCallback((clientId) => {
    const normalizedClientId = String(clientId || "").trim();
    if (!normalizedClientId) {
      setClientMedicalHistoryClient(createEmptyClientMedicalHistoryClient());
      setClientMedicalHistoryItems([]);
      setClientMedicalHistorySkeletonCount(3);
      setClientMedicalHistoryLoading(false);
      setClientMedicalHistoryMessage("");
      return;
    }

    const fallbackClient = clientMedicalHistoryClientOptions.find((item) => item.id === normalizedClientId)
      || createEmptyClientMedicalHistoryClient();

    setClientMedicalHistoryClient({
      id: normalizedClientId,
      fullName: fallbackClient.fullName,
      birthday: fallbackClient.birthday,
      isVip: fallbackClient.isVip
    });
    setClientMedicalHistoryItems([]);
    setClientMedicalHistorySkeletonCount(resolveClientMedicalHistorySkeletonCount(
      fallbackClient?.medicalHistoryCount
      || fallbackClient?.historyCount
      || fallbackClient?.medical_history_count
    ));
    setClientMedicalHistoryMessage("");
    setClientMedicalHistoryDeletingId("");
    setClientMedicalHistoryDelete(createEmptyClientMedicalHistoryDeleteState());

    if (hasMedicalHistoryReadAccess && clientMedicalHistoryMode === "view") {
      setClientMedicalHistoryLoading(true);
      void loadClientMedicalHistory(normalizedClientId, fallbackClient);
    }
  }, [
    clientMedicalHistoryMode,
    clientMedicalHistoryClientOptions,
    hasMedicalHistoryReadAccess,
    loadClientMedicalHistory
  ]);

  const openClientMedicalHistoryModal = useCallback((client) => {
    if (!hasMedicalHistoryReadAccess) {
      return;
    }

    const clientId = String(client?.id || "").trim();
    if (!clientId) {
      return;
    }

    const fullName = [
      String(client?.lastName || client?.last_name || "").trim(),
      String(client?.firstName || client?.first_name || "").trim(),
      String(client?.middleName || client?.middle_name || "").trim()
    ].filter(Boolean).join(" ").trim();

    setClientMedicalHistoryOpen(true);
    setClientMedicalHistoryMode("view");
    setClientMedicalHistoryClient({
      id: clientId,
      fullName,
      birthday: String(client?.birthday || client?.birthdate || "").trim(),
      isVip: Boolean(client?.isVip ?? client?.is_vip)
    });
    setClientMedicalHistoryClientSearch(createEmptyClientMedicalHistoryClientSearch());
    setClientMedicalHistoryClientOptions([]);
    setClientMedicalHistoryItems([]);
    setClientMedicalHistorySkeletonCount(resolveClientMedicalHistorySkeletonCount(
      client?.medicalHistoryCount
      || client?.historyCount
      || client?.medical_history_count
    ));
    setClientMedicalHistoryLoading(true);
    setClientMedicalHistoryMessage("");
    setClientMedicalHistoryDeletingId("");
    setClientMedicalHistoryDelete(createEmptyClientMedicalHistoryDeleteState());
    resetClientMedicalHistoryForm();
    void loadClientMedicalHistory(clientId, client);
  }, [
    hasMedicalHistoryReadAccess,
    loadClientMedicalHistory,
    resetClientMedicalHistoryForm
  ]);

  useEffect(() => {
    if (!clientMedicalHistoryOpen || !canReadClients || (!hasMedicalHistoryReadAccess && !hasMedicalHistoryCreateAccess)) {
      setClientMedicalHistoryClientOptions([]);
      setClientMedicalHistoryClientOptionsLoading(false);
      return undefined;
    }

    const clientId = String(clientMedicalHistoryClientSearch.id || "").trim();
    const firstName = String(clientMedicalHistoryClientSearch.firstName || "").trim();
    const lastName = String(clientMedicalHistoryClientSearch.lastName || "").trim();
    const middleName = String(clientMedicalHistoryClientSearch.middleName || "").trim();
    const combinedLength = `${firstName}${lastName}${middleName}`.length;

    if (!clientId && combinedLength === 0) {
      setClientMedicalHistoryClientOptions([]);
      setClientMedicalHistoryClientOptionsLoading(false);
      return undefined;
    }

    if (!clientId && combinedLength < 3) {
      setClientMedicalHistoryClientOptions([]);
      setClientMedicalHistoryClientOptionsLoading(false);
      return undefined;
    }

    let active = true;
    const timerId = window.setTimeout(async () => {
      try {
        setClientMedicalHistoryClientOptionsLoading(true);

        const queryParams = new URLSearchParams({
          limit: "50"
        });
        if (clientId) {
          queryParams.set("clientId", clientId);
        }
        if (firstName) {
          queryParams.set("firstName", firstName);
        }
        if (lastName) {
          queryParams.set("lastName", lastName);
        }
        if (middleName) {
          queryParams.set("middleName", middleName);
        }

        const response = await apiFetch(`/api/clients/search?${queryParams.toString()}`, {
          method: "GET",
          cache: "no-store"
        });
        const data = await readApiResponseData(response);

        if (!active) {
          return;
        }

        if (!response.ok) {
          if (handleProtectedStatus(response, navigate)) {
            return;
          }
          setClientMedicalHistoryClientOptions([]);
          return;
        }

        const items = (Array.isArray(data?.items) ? data.items : [])
          .map((item) => normalizeClientMedicalHistoryClientOption(item))
          .filter((item) => Boolean(item.id));
        setClientMedicalHistoryClientOptions(items);
      } catch {
        if (!active) {
          return;
        }
        setClientMedicalHistoryClientOptions([]);
      } finally {
        if (active) {
          setClientMedicalHistoryClientOptionsLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [
    canReadClients,
    clientMedicalHistoryClientSearch,
    clientMedicalHistoryOpen,
    hasMedicalHistoryCreateAccess,
    hasMedicalHistoryReadAccess,
    navigate
  ]);

  const startClientMedicalHistoryEdit = useCallback((item) => {
    const normalized = normalizeClientMedicalHistoryItem(item);
    setClientMedicalHistoryForm({
      id: normalized.id,
      entryDate: normalized.entryDate || formatDateForInput(new Date()),
      conditionName: normalized.conditionName,
      symptoms: normalized.symptoms,
      diagnosis: normalized.diagnosis,
      treatmentPlan: normalized.treatmentPlan,
      note: normalized.note
    });
    setClientMedicalHistoryErrors({});
    setClientMedicalHistoryMessage("");
  }, []);

  const openClientMedicalHistoryDeleteModal = useCallback(async (item) => {
    if (!hasMedicalHistoryDeleteAccess) {
      setClientMedicalHistoryMessage("You do not have permission to delete medical history.");
      return false;
    }

    const deleteAll = item?.deleteAll === true;
    if (deleteAll && !hasMedicalHistoryBulkDeleteAccess) {
      setClientMedicalHistoryMessage("Only admins can delete all client medical history.");
      return false;
    }
    const clientId = String(
      item?.clientId
      || item?.client_id
      || clientMedicalHistoryClient.id
      || item?.id
      || ""
    ).trim();
    let entryId = String(
      item?.historyEntryId
      || item?.history_entry_id
      || item?.id
      || ""
    ).trim();
    if (!clientId) {
      return false;
    }

    const itemFullName = String(
      item?.fullName
      || [
        item?.lastName,
        item?.firstName,
        item?.middleName
      ].filter(Boolean).join(" ")
      || [
        item?.last_name,
        item?.first_name,
        item?.middle_name
      ].filter(Boolean).join(" ")
      || clientMedicalHistoryClient.fullName
      || item?.label
      || ""
    ).trim();
    const itemConditionName = String(
      item?.conditionName
      || item?.condition_name
      || ""
    ).trim();
    let label = deleteAll ? itemFullName : itemConditionName;

    if (!deleteAll && !entryId && hasMedicalHistoryReadAccess) {
      try {
        const response = await apiFetch(`/api/clients/${encodeURIComponent(clientId)}/medical-history?limit=1`, {
          method: "GET",
          cache: "no-store"
        });
        const data = await readApiResponseData(response);

        if (!response.ok) {
          if (handleProtectedStatus(response, navigate)) {
            return false;
          }
          setClientMedicalHistoryMessage(data?.message || "Failed to load medical history.");
          return false;
        }

        const latestItem = Array.isArray(data?.items) && data.items.length > 0 ? data.items[0] : null;
        entryId = String(latestItem?.id || "").trim();
        if (!label) {
          label = String(latestItem?.conditionName || latestItem?.condition_name || "").trim();
        }
      } catch {
        setClientMedicalHistoryMessage("Unexpected error. Please try again.");
        return false;
      }
    }

    if (!deleteAll && !entryId) {
      setClientMedicalHistoryMessage("Medical history entry not found.");
      return false;
    }

    setClientMedicalHistoryDelete({
      open: true,
      clientId,
      entryId: deleteAll ? "" : entryId,
      deleteAll,
      label: label || (deleteAll ? itemFullName : "Medical history entry"),
      error: "",
      submitting: false
    });
    return true;
  }, [
    clientMedicalHistoryClient.id,
    clientMedicalHistoryClient.fullName,
    hasMedicalHistoryBulkDeleteAccess,
    hasMedicalHistoryDeleteAccess,
    hasMedicalHistoryReadAccess,
    navigate
  ]);

  const handleClientMedicalHistorySubmit = useCallback(async (event) => {
    event.preventDefault();

    const isEditMode = Boolean(String(clientMedicalHistoryForm.id || "").trim());
    if (isEditMode && !hasMedicalHistoryUpdateAccess) {
      setClientMedicalHistoryErrors({ conditionName: "You do not have permission to update medical history." });
      return false;
    }
    if (!isEditMode && !hasMedicalHistoryCreateAccess) {
      setClientMedicalHistoryErrors({ conditionName: "You do not have permission to create medical history." });
      return false;
    }

    const clientId = String(clientMedicalHistoryClient.id || "").trim();
    if (!clientId) {
      setClientMedicalHistoryMessage("Client is required.");
      return false;
    }

    const payload = {
      entryDate: String(clientMedicalHistoryForm.entryDate || "").trim(),
      conditionName: String(clientMedicalHistoryForm.conditionName || "").trim(),
      symptoms: String(clientMedicalHistoryForm.symptoms || "").trim(),
      diagnosis: String(clientMedicalHistoryForm.diagnosis || "").trim(),
      treatmentPlan: String(clientMedicalHistoryForm.treatmentPlan || "").trim(),
      note: String(clientMedicalHistoryForm.note || "").trim()
    };

    const errors = validateClientMedicalHistoryForm(payload);
    setClientMedicalHistoryErrors(errors);
    if (Object.keys(errors).length > 0) {
      return false;
    }

    const entryId = String(clientMedicalHistoryForm.id || "").trim();
    const endpoint = isEditMode
      ? `/api/clients/${encodeURIComponent(clientId)}/medical-history/${encodeURIComponent(entryId)}`
      : `/api/clients/${encodeURIComponent(clientId)}/medical-history`;
    const method = isEditMode ? "PATCH" : "POST";

    try {
      setClientMedicalHistorySubmitting(true);
      setClientMedicalHistoryMessage("");

      const response = await apiFetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return false;
        }
        if (data?.errors && typeof data.errors === "object") {
          setClientMedicalHistoryErrors({
            entryDate: data.errors.entryDate || "",
            conditionName: data.errors.conditionName || "",
            symptoms: data.errors.symptoms || "",
            diagnosis: data.errors.diagnosis || "",
            treatmentPlan: data.errors.treatmentPlan || "",
            note: data.errors.note || ""
          });
        } else if (data?.field) {
          setClientMedicalHistoryErrors({ [data.field]: data.message || "Invalid value." });
        } else {
          setClientMedicalHistoryMessage(data?.message || "Failed to save medical history.");
        }
        return false;
      }

      const nextItem = normalizeClientMedicalHistoryItem(data?.item);
      const successMessage = isEditMode
        ? String(data?.message || "Medical history saved.").trim()
        : "Medical history entry created.";
      setClientMedicalHistoryItems((prev) => {
        const baseItems = Array.isArray(prev) ? prev : [];
        const filtered = baseItems.filter((item) => item.id !== nextItem.id);
        return [nextItem, ...filtered].sort(compareClientMedicalHistoryItems);
      });
      if (canReadClients) {
        await reloadCurrentClientsView(clientsPage, { force: true });
      }
      resetClientMedicalHistoryForm();
      if (!isEditMode) {
        closeClientMedicalHistoryModal();
        if (typeof window !== "undefined") {
          window.alert(successMessage);
        }
        return true;
      }
      return true;
    } catch {
      setClientMedicalHistoryMessage("Unexpected error. Please try again.");
      return false;
    } finally {
      setClientMedicalHistorySubmitting(false);
    }
  }, [
    canReadClients,
    clientMedicalHistoryClient.id,
    clientMedicalHistoryForm,
    clientsPage,
    hasMedicalHistoryCreateAccess,
    hasMedicalHistoryUpdateAccess,
    navigate,
    closeClientMedicalHistoryModal,
    reloadCurrentClientsView,
    resetClientMedicalHistoryForm,
    validateClientMedicalHistoryForm
  ]);

  const deleteClientMedicalHistoryItem = useCallback(async (item) => {
    if (!hasMedicalHistoryDeleteAccess) {
      setClientMedicalHistoryMessage("You do not have permission to delete medical history.");
      return false;
    }

    const clientId = String(
      item?.clientId
      || item?.client_id
      || clientMedicalHistoryClient.id
      || item?.id
      || ""
    ).trim();
    const entryId = String(
      item?.historyEntryId
      || item?.history_entry_id
      || item?.id
      || ""
    ).trim();
    if (!clientId || !entryId) {
      return false;
    }

    try {
      setClientMedicalHistoryDeletingId(entryId);
      setClientMedicalHistoryMessage("");

      const response = await apiFetch(
        `/api/clients/${encodeURIComponent(clientId)}/medical-history/${encodeURIComponent(entryId)}`,
        {
          method: "DELETE"
        }
      );
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return false;
        }
        setClientMedicalHistoryMessage(data?.message || "Failed to delete medical history entry.");
        return false;
      }

      const nextItems = (Array.isArray(clientMedicalHistoryItems) ? clientMedicalHistoryItems : [])
        .filter((entry) => entry.id !== entryId);
      setClientMedicalHistoryItems(nextItems);
      setClientMedicalHistoryMessage("");
      if (canReadClients) {
        await reloadCurrentClientsView(clientsPage, { force: true });
      }

      if (String(clientMedicalHistoryForm.id || "").trim() === entryId) {
        resetClientMedicalHistoryForm();
      }
      return true;
    } catch {
      setClientMedicalHistoryMessage("Unexpected error. Please try again.");
      return false;
    } finally {
      setClientMedicalHistoryDeletingId("");
    }
  }, [
    canReadClients,
    clientMedicalHistoryClient.id,
    clientMedicalHistoryForm.id,
    clientMedicalHistoryItems,
    clientsPage,
    hasMedicalHistoryDeleteAccess,
    navigate,
    reloadCurrentClientsView,
    resetClientMedicalHistoryForm
  ]);

  const deleteAllClientMedicalHistoryItems = useCallback(async (item) => {
    if (!hasMedicalHistoryBulkDeleteAccess) {
      setClientMedicalHistoryMessage("Only admins can delete all client medical history.");
      return false;
    }

    const clientId = String(
      item?.clientId
      || item?.client_id
      || clientMedicalHistoryClient.id
      || item?.id
      || ""
    ).trim();
    if (!clientId) {
      return false;
    }

    try {
      setClientMedicalHistoryDeletingId(`client:${clientId}`);
      setClientMedicalHistoryMessage("");

      const response = await apiFetch(
        `/api/clients/${encodeURIComponent(clientId)}/medical-history`,
        {
          method: "DELETE"
        }
      );
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (handleProtectedStatus(response, navigate)) {
          return false;
        }
        setClientMedicalHistoryMessage(data?.message || "Failed to delete client medical history.");
        return false;
      }

      setClientMedicalHistoryItems([]);
      setClientMedicalHistoryMessage("");
      if (canReadClients) {
        await reloadCurrentClientsView(clientsPage, { force: true });
      }

      if (String(clientMedicalHistoryClient.id || "").trim() === clientId) {
        resetClientMedicalHistoryForm();
      }
      return true;
    } catch {
      setClientMedicalHistoryMessage("Unexpected error. Please try again.");
      return false;
    } finally {
      setClientMedicalHistoryDeletingId("");
    }
  }, [
    canReadClients,
    clientMedicalHistoryClient.id,
    clientsPage,
    hasMedicalHistoryBulkDeleteAccess,
    navigate,
    reloadCurrentClientsView,
    resetClientMedicalHistoryForm
  ]);

  const handleClientMedicalHistoryDeleteConfirm = useCallback(async () => {
    if (!hasMedicalHistoryDeleteAccess) {
      setClientMedicalHistoryDelete((prev) => ({
        ...prev,
        error: "You do not have permission to delete medical history."
      }));
      return false;
    }

    const clientId = String(clientMedicalHistoryDelete.clientId || "").trim();
    const entryId = String(clientMedicalHistoryDelete.entryId || "").trim();
    const deleteAll = clientMedicalHistoryDelete.deleteAll === true;
    if (deleteAll && !hasMedicalHistoryBulkDeleteAccess) {
      setClientMedicalHistoryDelete((prev) => ({
        ...prev,
        error: "Only admins can delete all client medical history."
      }));
      return false;
    }
    if (!clientId || (!deleteAll && !entryId)) {
      return false;
    }

    try {
      setClientMedicalHistoryDelete((prev) => ({
        ...prev,
        submitting: true,
        error: ""
      }));

      const success = deleteAll
        ? await deleteAllClientMedicalHistoryItems({ clientId })
        : await deleteClientMedicalHistoryItem({
          clientId,
          id: entryId
        });
      if (!success) {
        setClientMedicalHistoryDelete((prev) => ({
          ...prev,
          submitting: false,
          error: clientMedicalHistoryMessage || (deleteAll
            ? "Failed to delete client medical history."
            : "Failed to delete medical history entry.")
        }));
        return false;
      }

      closeClientMedicalHistoryDeleteModal();
      return true;
    } catch {
      setClientMedicalHistoryDelete((prev) => ({
        ...prev,
        submitting: false,
        error: "Unexpected error. Please try again."
      }));
      return false;
    }
  }, [
    clientMedicalHistoryDelete.clientId,
    clientMedicalHistoryDelete.deleteAll,
    clientMedicalHistoryDelete.entryId,
    clientMedicalHistoryMessage,
    closeClientMedicalHistoryDeleteModal,
    deleteAllClientMedicalHistoryItems,
    deleteClientMedicalHistoryItem,
    hasMedicalHistoryBulkDeleteAccess,
    hasMedicalHistoryDeleteAccess
  ]);

  return {
    clients,
    clientsLoading,
    clientsMessage,
    clientsPage,
    clientsTotalPages,
    clientsSearch,
    setClientsSearch,
    clientsIsVip,
    setClientsIsVip,
    clientsHistoryIdSearch,
    setClientsHistoryIdSearch,
    clientsHistorySelectedClientId,
    setClientsHistorySelectedClientId,
    clientsHistoryNameSearch,
    setClientsHistoryNameSearch,
    clientsHistoryDateFrom,
    setClientsHistoryDateFrom,
    clientsHistoryDateTo,
    setClientsHistoryDateTo,
    clientsHistoryPositionId,
    setClientsHistoryPositionId,
    clientsHistorySpecialistId,
    setClientsHistorySpecialistId,
    clientCreateForm,
    clientCreateErrors,
    clientCreateSubmitting,
    clientEditId,
    clientEditForm,
    clientEditErrors,
    clientEditSubmitting,
    clientsEditOpen,
    clientsDelete,
    clientMedicalHistoryOpen,
    clientMedicalHistoryClient,
    clientMedicalHistoryClientSearch,
    clientMedicalHistoryClientOptions,
    clientMedicalHistoryClientOptionsLoading,
    clientMedicalHistoryMode,
    clientMedicalHistoryItems,
    clientMedicalHistorySkeletonCount,
    clientMedicalHistoryLoading,
    clientMedicalHistoryMessage,
    clientMedicalHistoryForm,
    clientMedicalHistoryErrors,
    clientMedicalHistorySubmitting,
    clientMedicalHistoryDeletingId,
    clientMedicalHistoryDelete,
    setClientCreateForm,
    setClientCreateErrors,
    setClientEditForm,
    setClientEditErrors,
    setClientMedicalHistoryClientSearch,
    setClientMedicalHistoryForm,
    setClientMedicalHistoryErrors,
    loadClients,
    loadClientMedicalHistoryClients,
    handleClientCreateSubmit,
    startClientEdit,
    handleClientEditSave,
    handleClientEditSubmit,
    openClientsDeleteModal,
    handleClientsDeleteConfirm,
    openClientMedicalHistoryModal,
    openClientMedicalHistoryCreateModal,
    selectClientMedicalHistoryClient,
    closeClientMedicalHistoryModal,
    closeClientMedicalHistoryDeleteModal,
    resetClientMedicalHistoryForm,
    startClientMedicalHistoryEdit,
    openClientMedicalHistoryDeleteModal,
    handleClientMedicalHistorySubmit,
    deleteClientMedicalHistoryItem,
    handleClientMedicalHistoryDeleteConfirm,
    closeClientsEditModal,
    closeClientsDeleteModal
  };
}
