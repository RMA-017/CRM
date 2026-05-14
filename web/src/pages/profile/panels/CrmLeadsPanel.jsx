import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../../../lib/api.js";

const STATUS_OPTIONS = Object.freeze(["", "new", "contacted", "converted", "lost"]);
const SOURCE_OPTIONS = Object.freeze(["", "website", "telegram"]);

const TEXT = Object.freeze({
  uz: {
    title: "CRM",
    subtitle: "Varonka tizimi",
    search: "Ism yoki telefon",
    allStatuses: "Barcha statuslar",
    allSources: "Barcha manbalar",
    refresh: "Yangilash",
    close: "Yopish",
    empty: "Hozircha leadlar yo'q.",
    loading: "Yuklanmoqda...",
    source: { website: "Sayt", telegram: "Telegram" },
    status: { new: "Yangi", contacted: "Bog'lanildi", converted: "Client bo'ldi", lost: "Yo'qotildi" },
    stats: { new: "Yangi", contacted: "Bog'lanildi", converted: "Client", lost: "Yo'qotildi" },
    note: "Izoh"
  },
  ru: {
    title: "CRM",
    subtitle: "Воронка заявок",
    search: "Имя или телефон",
    allStatuses: "Все статусы",
    allSources: "Все источники",
    refresh: "Обновить",
    close: "Закрыть",
    empty: "Пока заявок нет.",
    loading: "Загрузка...",
    source: { website: "Сайт", telegram: "Telegram" },
    status: { new: "Новая", contacted: "Связались", converted: "Клиент", lost: "Потеряна" },
    stats: { new: "Новые", contacted: "Связались", converted: "Клиенты", lost: "Потеряно" },
    note: "Заметка"
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
  return STATUS_OPTIONS.includes(status) && status ? status : "new";
}

function normalizeSource(value) {
  const source = String(value || "website").trim();
  return SOURCE_OPTIONS.includes(source) && source ? source : "website";
}

function CrmLeadsPanel({ canUpdateCrm = false, onClose }) {
  const { language } = useI18n();
  const ui = TEXT[language] || TEXT.ru;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({ search: "", status: "", source: "" });

  const stats = useMemo(() => {
    const next = { new: 0, contacted: 0, converted: 0, lost: 0 };
    items.forEach((item) => {
      const status = normalizeStatus(item?.status);
      if (Object.prototype.hasOwnProperty.call(next, status)) {
        next[status] += 1;
      }
    });
    return next;
  }, [items]);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (filters.search.trim()) query.set("search", filters.search.trim());
      if (filters.status) query.set("status", filters.status);
      if (filters.source) query.set("source", filters.source);
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
  }, [filters.search, filters.source, filters.status]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const updateLead = useCallback(async (item, patch) => {
    if (!canUpdateCrm) {
      return;
    }
    const id = String(item?.id || "").trim();
    if (!id) {
      return;
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
        return;
      }
      if (data?.item) {
        setItems((current) => current.map((lead) => (
          String(lead?.id || "") === id ? data.item : lead
        )));
      }
    } catch {
      setItems(previousItems);
      setMessage("Failed to update lead.");
    }
  }, [canUpdateCrm, items]);

  return (
    <section id="crmPanel" className="all-users-panel crm-panel">
      <div className="all-users-head">
        <div>
          <h3>{ui.title}</h3>
          <p className="crm-panel-subtitle">{ui.subtitle}</p>
        </div>
        <div className="all-users-head-actions">
          <button type="button" className="header-btn" onClick={loadItems}>{ui.refresh}</button>
          <button type="button" className="header-btn panel-close-btn" onClick={onClose} aria-label={ui.close}>×</button>
        </div>
      </div>

      <div className="crm-summary-grid">
        {["new", "contacted", "converted", "lost"].map((status) => (
          <article key={status} className={`crm-summary-card is-${status}`}>
            <span>{ui.stats[status]}</span>
            <strong>{stats[status]}</strong>
          </article>
        ))}
      </div>

      <div className="crm-toolbar">
        <input
          value={filters.search}
          placeholder={ui.search}
          onInput={(event) => {
            const value = event.currentTarget.value;
            setFilters((prev) => ({ ...prev, search: value }));
          }}
        />
        <select
          value={filters.status}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setFilters((prev) => ({ ...prev, status: value }));
          }}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status || "all"} value={status}>{status ? ui.status[status] : ui.allStatuses}</option>
          ))}
        </select>
        <select
          value={filters.source}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setFilters((prev) => ({ ...prev, source: value }));
          }}
        >
          {SOURCE_OPTIONS.map((source) => (
            <option key={source || "all"} value={source}>{source ? ui.source[source] : ui.allSources}</option>
          ))}
        </select>
      </div>

      {message ? <p className="all-users-state">{message}</p> : null}
      {loading && items.length === 0 ? <p className="all-users-state">{ui.loading}</p> : null}
      {!loading && items.length === 0 && !message ? <p className="all-users-state">{ui.empty}</p> : null}

      <div className="crm-lead-board">
        {items.map((item) => {
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
                  onChange={(event) => updateLead(item, { status: event.currentTarget.value })}
                >
                  {STATUS_OPTIONS.filter(Boolean).map((nextStatus) => (
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
  );
}

export default CrmLeadsPanel;
