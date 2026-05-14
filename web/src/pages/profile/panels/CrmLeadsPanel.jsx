import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../../lib/api.js";
import { normalizePhoneNumber } from "../../../lib/phone-number.js";

const PIPELINE_STATUSES = Object.freeze(["new", "contacted", "converted", "lost"]);
const SOURCE_OPTIONS = Object.freeze(["", "website", "telegram"]);

const TEXT = Object.freeze({
  uz: {
    title: "CRM",
    search: "Ism yoki telefon",
    searchPlaceholder: "Ism yoki telefon kiriting",
    allSources: "Barcha manbalar",
    dateFrom: "Dan",
    dateTo: "Gacha",
    filter: "Qidirish",
    close: "Yopish",
    empty: "Hozircha leadlar yo'q.",
    loading: "Yuklanmoqda...",
    source: { website: "Sayt", telegram: "Telegram" },
    status: { new: "Yangi", contacted: "Bog'lanildi", converted: "Client bo'ldi", lost: "Yo'qotildi" },
    note: "Izoh",
    convertTitle: "Leadni clientga aylantirish",
    firstName: "Ism",
    lastName: "Familiya",
    middleName: "Otasining ismi",
    birthday: "Tug'ilgan sana",
    phone: "Telefon",
    telegramOrEmail: "Email / Telegram",
    active: "Aktiv",
    saveClient: "Client yaratish",
    savingClient: "Yaratilmoqda...",
    cancel: "Bekor qilish",
    createClientPermission: "Client yaratish uchun ruxsat yo'q.",
    required: "Majburiy maydon.",
    createClientFailed: "Client yaratib bo'lmadi."
  },
  ru: {
    title: "CRM",
    search: "Имя или телефон",
    searchPlaceholder: "Введите имя или телефон",
    allSources: "Все источники",
    dateFrom: "С",
    dateTo: "До",
    filter: "Поиск",
    close: "Закрыть",
    empty: "Пока заявок нет.",
    loading: "Загрузка...",
    source: { website: "Сайт", telegram: "Telegram" },
    status: { new: "Новая", contacted: "Связались", converted: "Клиент", lost: "Потеряна" },
    note: "Заметка",
    convertTitle: "Перевести заявку в клиента",
    firstName: "Имя",
    lastName: "Фамилия",
    middleName: "Отчество",
    birthday: "Дата рождения",
    phone: "Телефон",
    telegramOrEmail: "Email / Telegram",
    active: "Активен",
    saveClient: "Создать клиента",
    savingClient: "Создание...",
    cancel: "Отмена",
    createClientPermission: "Нет доступа на создание клиента.",
    required: "Обязательное поле.",
    createClientFailed: "Не удалось создать клиента."
  }
});

function formatDate(value, language) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function normalizeStatus(value) {
  const status = String(value || "new").trim();
  return PIPELINE_STATUSES.includes(status) ? status : "new";
}

function normalizeSource(value) {
  const source = String(value || "website").trim();
  return SOURCE_OPTIONS.includes(source) && source ? source : "website";
}

function splitLeadName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return {
      lastName: parts[0] || "",
      firstName: parts[1] || "",
      middleName: parts.slice(2).join(" ")
    };
  }
  if (parts.length === 2) {
    return {
      lastName: parts[0] || "",
      firstName: parts[1] || "",
      middleName: ""
    };
  }
  return {
    lastName: "",
    firstName: parts[0] || "",
    middleName: ""
  };
}

function createConversionForm(item = {}) {
  const nameParts = splitLeadName(item?.fullName);
  return {
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    middleName: nameParts.middleName,
    birthday: "",
    phone: normalizePhoneNumber(item?.phoneNumber || item?.phoneDigits || ""),
    telegramOrEmail: "",
    isVip: true
  };
}

function CrmLeadsPanel({ canUpdateCrm = false, canCreateClients = false, onClose }) {
  const { language } = useI18n();
  const ui = TEXT[language] || TEXT.ru;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({ search: "", source: "", dateFrom: "", dateTo: "" });
  const [draftFilters, setDraftFilters] = useState({ search: "", source: "", dateFrom: "", dateTo: "" });
  const [conversion, setConversion] = useState({
    open: false,
    submitting: false,
    lead: null,
    form: createConversionForm(),
    errors: {}
  });

  const itemsByStatus = useMemo(() => {
    const grouped = { new: [], contacted: [], converted: [], lost: [] };
    items.forEach((item) => {
      grouped[normalizeStatus(item?.status)].push(item);
    });
    return grouped;
  }, [items]);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (filters.search.trim()) query.set("search", filters.search.trim());
      if (filters.source) query.set("source", filters.source);
      if (filters.dateFrom) query.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) query.set("dateTo", filters.dateTo);
      const response = await apiFetch(`/api/crm/leads?${query.toString()}`, { cache: "no-store" });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setMessage(getApiErrorMessage(response, data, "Failed to load CRM leads."));
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
      setMessage("");
    } catch {
      setMessage("Failed to load CRM leads.");
    } finally {
      setLoading(false);
    }
  }, [filters.dateFrom, filters.dateTo, filters.search, filters.source]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleFiltersSubmit = useCallback((event) => {
    event.preventDefault();
    setFilters({ ...draftFilters });
  }, [draftFilters]);

  const updateLead = useCallback(async (item, patch) => {
    if (!canUpdateCrm) {
      return false;
    }
    const id = String(item?.id || "").trim();
    if (!id) {
      return false;
    }
    const previousItems = items;
    setItems((current) => current.map((lead) => (
      String(lead?.id || "") === id ? { ...lead, ...patch } : lead
    )));
    try {
      const response = await apiFetch(`/api/crm/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setItems(previousItems);
        setMessage(getApiErrorMessage(response, data, "Failed to update lead."));
        return false;
      }
      if (data?.item) {
        setItems((current) => current.map((lead) => (
          String(lead?.id || "") === id ? data.item : lead
        )));
      }
      return true;
    } catch {
      setItems(previousItems);
      setMessage("Failed to update lead.");
      return false;
    }
  }, [canUpdateCrm, items]);

  const openConversionModal = useCallback((item) => {
    if (!canCreateClients) {
      setMessage(ui.createClientPermission);
      return;
    }
    setConversion({
      open: true,
      submitting: false,
      lead: item,
      form: createConversionForm(item),
      errors: {}
    });
  }, [canCreateClients, ui.createClientPermission]);

  const closeConversionModal = useCallback(() => {
    setConversion({
      open: false,
      submitting: false,
      lead: null,
      form: createConversionForm(),
      errors: {}
    });
  }, []);

  const handleStatusChange = useCallback((item, nextStatus) => {
    const normalizedNextStatus = normalizeStatus(nextStatus);
    const currentStatus = normalizeStatus(item?.status);
    if (normalizedNextStatus === currentStatus) {
      return;
    }
    if (normalizedNextStatus === "converted") {
      openConversionModal(item);
      return;
    }
    void updateLead(item, { status: normalizedNextStatus });
  }, [openConversionModal, updateLead]);

  const updateConversionField = useCallback((field, value) => {
    setConversion((prev) => ({
      ...prev,
      form: {
        ...prev.form,
        [field]: value
      },
      errors: {
        ...prev.errors,
        [field]: ""
      }
    }));
  }, []);

  const handleConversionSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (!conversion.lead || conversion.submitting || !canCreateClients) {
      return;
    }
    const form = conversion.form || {};
    const errors = {};
    ["firstName", "lastName", "birthday", "phone"].forEach((field) => {
      if (!String(form[field] || "").trim()) {
        errors[field] = ui.required;
      }
    });
    if (Object.keys(errors).length > 0) {
      setConversion((prev) => ({ ...prev, errors }));
      return;
    }

    setConversion((prev) => ({ ...prev, submitting: true, errors: {} }));
    try {
      const response = await apiFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: String(form.firstName || "").trim(),
          lastName: String(form.lastName || "").trim(),
          middleName: String(form.middleName || "").trim(),
          birthday: String(form.birthday || "").trim(),
          phone: normalizePhoneNumber(form.phone),
          tgMail: String(form.telegramOrEmail || "").trim(),
          isVip: Boolean(form.isVip),
          note: `CRM lead #${conversion.lead.id || ""}`.trim()
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        if (data?.errors && typeof data.errors === "object") {
          setConversion((prev) => ({
            ...prev,
            submitting: false,
            errors: {
              firstName: data.errors.firstName || data.errors.fullName || "",
              lastName: data.errors.lastName || "",
              middleName: data.errors.middleName || "",
              birthday: data.errors.birthday || "",
              phone: data.errors.phone || "",
              telegramOrEmail: data.errors.tgMail || data.errors.notes || ""
            }
          }));
          return;
        }
        const field = String(data?.field || "").trim();
        setConversion((prev) => ({
          ...prev,
          submitting: false,
          errors: field ? { [field]: data?.message || ui.createClientFailed } : { firstName: getApiErrorMessage(response, data, ui.createClientFailed) }
        }));
        return;
      }

      const updated = await updateLead(conversion.lead, { status: "converted" });
      if (updated) {
        closeConversionModal();
        return;
      }
      setConversion((prev) => ({ ...prev, submitting: false }));
    } catch {
      setConversion((prev) => ({
        ...prev,
        submitting: false,
        errors: { firstName: ui.createClientFailed }
      }));
    }
  }, [canCreateClients, closeConversionModal, conversion, ui.createClientFailed, ui.required, updateLead]);

  return (
    <section id="crmPanel" className="all-users-panel crm-panel">
      <form className="crm-toolbar" onSubmit={handleFiltersSubmit}>
        <label className="crm-toolbar-field crm-toolbar-search-field">
          <span>{ui.search}</span>
          <input
            value={draftFilters.search}
            placeholder={ui.searchPlaceholder}
            onInput={(event) => {
              const value = event.currentTarget.value;
              setDraftFilters((prev) => ({ ...prev, search: value }));
            }}
          />
        </label>
        <label className="crm-toolbar-field">
          <span>{ui.dateFrom}</span>
          <input
            type="date"
            value={draftFilters.dateFrom}
            onInput={(event) => {
              const value = event.currentTarget.value;
              setDraftFilters((prev) => ({ ...prev, dateFrom: value }));
            }}
          />
        </label>
        <label className="crm-toolbar-field">
          <span>{ui.dateTo}</span>
          <input
            type="date"
            value={draftFilters.dateTo}
            onInput={(event) => {
              const value = event.currentTarget.value;
              setDraftFilters((prev) => ({ ...prev, dateTo: value }));
            }}
          />
        </label>
        <label className="crm-toolbar-field">
          <span>{ui.allSources}</span>
          <select
            value={draftFilters.source}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraftFilters((prev) => ({ ...prev, source: value }));
            }}
          >
            {SOURCE_OPTIONS.map((source) => (
              <option key={source || "all"} value={source}>{source ? ui.source[source] : ui.allSources}</option>
            ))}
          </select>
        </label>
        <div className="crm-toolbar-actions">
          <button type="submit" className="btn" disabled={loading}>{ui.filter}</button>
          <button type="button" className="header-btn panel-close-btn" onClick={onClose} aria-label={ui.close}>×</button>
        </div>
      </form>

      {message ? <p className="all-users-state">{message}</p> : null}
      {loading && items.length === 0 ? <p className="all-users-state">{ui.loading}</p> : null}
      {!loading && items.length === 0 && !message ? <p className="all-users-state">{ui.empty}</p> : null}

      <div className="crm-lead-board">
        {PIPELINE_STATUSES.map((columnStatus) => (
          <section key={columnStatus} className={`crm-pipeline-column is-${columnStatus}`}>
            <header className="crm-pipeline-column-head">
              <span>{ui.status[columnStatus]}</span>
              <strong>{itemsByStatus[columnStatus].length}</strong>
            </header>
            <div className="crm-pipeline-column-body">
              {itemsByStatus[columnStatus].map((item) => {
                const status = normalizeStatus(item?.status);
                const source = normalizeSource(item?.source);
                return (
                  <article key={item.id} className={`crm-lead-card is-${status}`}>
                    <div className="crm-lead-card-head">
                      <strong>{item.fullName || "-"}</strong>
                      <span>{ui.source[source] || source}</span>
                    </div>
                    <a className="crm-lead-phone" href={`tel:${item.phoneNumber}`}>{item.phoneNumber || item.phoneDigits || "-"}</a>
                    <div className="crm-lead-meta">
                      <time>{formatDate(item.updatedAt || item.createdAt, language)}</time>
                      <select
                        value={status}
                        disabled={!canUpdateCrm}
                        onChange={(event) => handleStatusChange(item, event.currentTarget.value)}
                      >
                        {PIPELINE_STATUSES.map((nextStatus) => (
                          <option key={nextStatus} value={nextStatus}>{ui.status[nextStatus]}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      defaultValue={item.note || ""}
                      placeholder={ui.note}
                      disabled={!canUpdateCrm}
                      onBlur={(event) => {
                        const nextNote = event.currentTarget.value;
                        if (nextNote !== String(item.note || "")) {
                          void updateLead(item, { note: nextNote });
                        }
                      }}
                    />
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {conversion.open ? (
        <>
          <section id="crmConvertClientModal" className="logout-confirm-modal all-users-edit-modal crm-convert-modal">
            <h3>{ui.convertTitle}</h3>
            <form className="auth-form" noValidate onSubmit={handleConversionSubmit}>
              <div className="all-users-edit-fields">
                <div className="field">
                  <label htmlFor="crmConvertFirstName">{ui.firstName}</label>
                  <input
                    id="crmConvertFirstName"
                    value={conversion.form.firstName}
                    className={conversion.errors.firstName ? "input-error" : ""}
                    onInput={(event) => updateConversionField("firstName", event.currentTarget.value)}
                  />
                  <small className="field-error">{conversion.errors.firstName || ""}</small>
                </div>
                <div className="field">
                  <label htmlFor="crmConvertLastName">{ui.lastName}</label>
                  <input
                    id="crmConvertLastName"
                    value={conversion.form.lastName}
                    className={conversion.errors.lastName ? "input-error" : ""}
                    onInput={(event) => updateConversionField("lastName", event.currentTarget.value)}
                  />
                  <small className="field-error">{conversion.errors.lastName || ""}</small>
                </div>
                <div className="field">
                  <label htmlFor="crmConvertMiddleName">{ui.middleName}</label>
                  <input
                    id="crmConvertMiddleName"
                    value={conversion.form.middleName}
                    className={conversion.errors.middleName ? "input-error" : ""}
                    onInput={(event) => updateConversionField("middleName", event.currentTarget.value)}
                  />
                  <small className="field-error">{conversion.errors.middleName || ""}</small>
                </div>
                <div className="client-birthday-vip-row">
                  <div className="field">
                    <label htmlFor="crmConvertBirthday">{ui.birthday}</label>
                    <input
                      id="crmConvertBirthday"
                      type="date"
                      min="1950-01-01"
                      max={new Date().toISOString().slice(0, 10)}
                      value={conversion.form.birthday}
                      className={conversion.errors.birthday ? "input-error" : ""}
                      onInput={(event) => updateConversionField("birthday", event.currentTarget.value)}
                    />
                    <small className="field-error">{conversion.errors.birthday || ""}</small>
                  </div>
                  <div className="field clients-create-vip-field">
                    <label htmlFor="crmConvertIsVip">{ui.active}</label>
                    <label className={`clients-create-vip-toggle${conversion.form.isVip ? " is-active" : ""}`} htmlFor="crmConvertIsVip">
                      <input
                        id="crmConvertIsVip"
                        type="checkbox"
                        checked={Boolean(conversion.form.isVip)}
                        onChange={(event) => updateConversionField("isVip", event.currentTarget.checked)}
                      />
                    </label>
                    <small className="field-error" />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="crmConvertPhone">{ui.phone}</label>
                  <input
                    id="crmConvertPhone"
                    type="tel"
                    inputMode="tel"
                    placeholder="+998977861070"
                    value={conversion.form.phone}
                    className={conversion.errors.phone ? "input-error" : ""}
                    onInput={(event) => updateConversionField("phone", event.currentTarget.value)}
                  />
                  <small className="field-error">{conversion.errors.phone || ""}</small>
                </div>
                <div className="field">
                  <label htmlFor="crmConvertTelegramOrEmail">{ui.telegramOrEmail}</label>
                  <input
                    id="crmConvertTelegramOrEmail"
                    value={conversion.form.telegramOrEmail}
                    className={conversion.errors.telegramOrEmail ? "input-error" : ""}
                    onInput={(event) => updateConversionField("telegramOrEmail", event.currentTarget.value)}
                  />
                  <small className="field-error">{conversion.errors.telegramOrEmail || ""}</small>
                </div>
              </div>
              <div className="edit-actions">
                <button type="submit" className="btn" disabled={conversion.submitting}>
                  {conversion.submitting ? ui.savingClient : ui.saveClient}
                </button>
                <button type="button" className="header-btn" disabled={conversion.submitting} onClick={closeConversionModal}>
                  {ui.cancel}
                </button>
              </div>
            </form>
          </section>
          <div className="login-overlay" onClick={closeConversionModal} />
        </>
      ) : null}
    </section>
  );
}

export default CrmLeadsPanel;
