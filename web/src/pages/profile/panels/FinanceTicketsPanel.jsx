import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { formatDateYMD } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import CustomSelect from "../../../components/CustomSelect.jsx";

const EMPTY_FILTERS = Object.freeze({
  ticketNumber: "",
  dateFrom: "",
  dateTo: "",
  client: "",
  specialist: "",
  position: "",
  service: "",
  status: ""
});

function todayDateValue() {
  const date = new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDefaultFilters() {
  const today = todayDateValue();
  return {
    ...EMPTY_FILTERS,
    dateFrom: today,
    dateTo: today
  };
}

const EMPTY_TICKET_EDIT_FORM = Object.freeze({
  ticketDate: "",
  clientId: "",
  note: "",
  items: []
});

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount > 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function formatDateTime(value) {
  const raw = String(value || "");
  if (!raw) return "-";
  const date = formatDateYMD(raw);
  const timeMatch = raw.match(/T(\d{2}:\d{2})/);
  return timeMatch ? `${date} ${timeMatch[1]}` : date;
}

function formatDateInput(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function normalizeMoneyInput(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function calculateDiscountUzs({ priceUzs, discountType, discountValue }) {
  const price = normalizeMoneyInput(priceUzs);
  const value = Math.max(0, Number.parseInt(String(discountValue ?? 0), 10) || 0);
  if (discountType === "percent") {
    return Math.min(price, Math.floor((price * Math.min(value, 100)) / 100));
  }
  return Math.min(price, value);
}

function createTicketEditItemRows(item) {
  const rows = Array.isArray(item?.items) && item.items.length > 0
    ? item.items
    : [{
        specialistId: item?.specialistId,
        specialistName: item?.specialistName,
        serviceId: item?.serviceId,
        serviceName: item?.serviceName,
        priceUzs: item?.totalUzs ?? item?.amountUzs,
        discountType: "amount",
        discountValue: 0
      }];
  return rows.map((row) => ({
    specialistId: String(row?.specialistId || ""),
    specialistName: String(row?.specialistName || ""),
    serviceId: String(row?.serviceId || ""),
    serviceName: String(row?.serviceName || ""),
    priceUzs: normalizeMoneyInput(row?.priceUzs ?? row?.finalAmountUzs),
    discountType: String(row?.discountType || "amount"),
    discountValue: String(row?.discountValue ?? 0)
  }));
}

function createTicketEditForm(item = null) {
  if (!item) return EMPTY_TICKET_EDIT_FORM;
  return {
    ticketDate: formatDateInput(item.ticketDate),
    clientId: String(item.clientId || ""),
    note: item.note || "",
    items: createTicketEditItemRows(item)
  };
}

function makeClientOption(item) {
  const id = String(item?.id ?? item?.clientId ?? "").trim();
  if (!id) return null;
  const label = String(item?.fullName || item?.clientName || `#${id}`).trim() || `#${id}`;
  return { value: id, label };
}

function mergeOptions(baseOptions, nextOptions) {
  const map = new Map();
  [...baseOptions, ...nextOptions].forEach((option) => {
    if (option?.value) {
      map.set(String(option.value), option);
    }
  });
  return Array.from(map.values());
}

function makeTextOption(value, label = value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return null;
  return {
    value: normalizedValue,
    label: String(label || normalizedValue).trim() || normalizedValue
  };
}

function getTicketServiceText(item) {
  const services = Array.isArray(item?.items)
    ? item.items.map((row) => String(row?.serviceName || "").trim()).filter(Boolean)
    : [];
  return services.length > 0 ? services.join(", ") : (item?.serviceName || "-");
}

function getTicketSpecialistText(item) {
  const specialists = Array.isArray(item?.items)
    ? item.items.map((row) => String(row?.specialistName || "").trim()).filter(Boolean)
    : [];
  return specialists.length > 0 ? Array.from(new Set(specialists)).join(", ") : (item?.specialistName || "-");
}

function getTicketPositionText(item) {
  const positions = Array.isArray(item?.items)
    ? item.items.map((row) => String(row?.positionLabel || "").trim()).filter(Boolean)
    : [];
  return positions.length > 0 ? Array.from(new Set(positions)).join(", ") : (item?.positionLabel || "-");
}

function translateTicketStatus(translate, status) {
  const labels = {
    issued: "Tickets",
    paid: "Paid",
    unpaid: "Unpaid",
    voided: "Voided"
  };
  return translate(labels[String(status || "")] || String(status || "-"));
}

function FinanceTicketsPanel({ onClose, canUpdateFinanceCashier = false }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(() => createDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultFilters());
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [historyTicket, setHistoryTicket] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refundingId, setRefundingId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [editTicket, setEditTicket] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_TICKET_EDIT_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editServices, setEditServices] = useState([]);
  const [editSpecialists, setEditSpecialists] = useState([]);
  const [editReferencesLoading, setEditReferencesLoading] = useState(false);
  const [editClientSearch, setEditClientSearch] = useState("");
  const [editClientOptions, setEditClientOptions] = useState([]);
  const [editClientSearchBusy, setEditClientSearchBusy] = useState(false);
  const [voidingId, setVoidingId] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterReferences, setFilterReferences] = useState({ services: [], specialists: [], positions: [] });
  const [filterReferencesLoading, setFilterReferencesLoading] = useState(false);
  const [filterClientSearch, setFilterClientSearch] = useState("");
  const [filterClientOptions, setFilterClientOptions] = useState([]);
  const [filterClientSearchBusy, setFilterClientSearchBusy] = useState(false);

  const loadTickets = useCallback(async (nextPage = 1, nextFilters = EMPTY_FILTERS) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("page", String(nextPage));
      query.set("pageSize", "20");
      Object.entries(nextFilters).forEach(([key, value]) => {
        const normalized = String(value || "").trim();
        if (normalized) {
          query.set(key, normalized);
        }
      });
      const response = await apiFetch(`/api/finance/tickets?${query.toString()}`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Failed to load tickets.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
      setPage(Number.parseInt(String(data?.page || nextPage), 10) || 1);
      setTotalPages(Number.parseInt(String(data?.totalPages || 1), 10) || 1);
      setTotal(Number.parseInt(String(data?.total || 0), 10) || 0);
      setMessage("");
    } catch {
      setMessage("Failed to load tickets.");
      window.alert?.(translate("Failed to load tickets."));
    } finally {
      setLoading(false);
    }
  }, [translate]);

  useEffect(() => {
    void loadTickets(1, appliedFilters);
  }, [loadTickets]);

  const editServiceOptions = useMemo(() => {
    const options = editServices.map((item) => ({
      value: String(item.id),
      label: `${item.name || item.id} - ${formatMoney(item.priceUzs)}`,
      item
    }));
    const fallbackOptions = editForm.items
      .filter((item) => item.serviceId && item.serviceName)
      .map((item) => ({
        value: item.serviceId,
        label: `${item.serviceName} - ${formatMoney(item.priceUzs)}`,
        item
      }));
    return mergeOptions(options, fallbackOptions);
  }, [editForm.items, editServices]);

  const editSpecialistOptions = useMemo(() => {
    const options = editSpecialists.map((item) => ({
      value: String(item.id),
      label: `${item.fullName || item.id}${item.positionLabel ? ` - ${item.positionLabel}` : ""}`
    }));
    const fallbackOptions = editForm.items
      .filter((item) => item.specialistId && item.specialistName)
      .map((item) => ({
        value: item.specialistId,
        label: item.specialistName
      }));
    return mergeOptions(options, fallbackOptions);
  }, [editForm.items, editSpecialists]);

  const filterSpecialistOptions = useMemo(() => {
    const options = (Array.isArray(filterReferences.specialists) ? filterReferences.specialists : [])
      .map((item) => makeTextOption(
        item.fullName,
        `${item.fullName || item.id}${item.positionLabel ? ` - ${item.positionLabel}` : ""}`
      ))
      .filter(Boolean);
    return [{ value: "", label: translate("All") }, ...options];
  }, [filterReferences.specialists, translate]);

  const filterPositionOptions = useMemo(() => {
    const options = (Array.isArray(filterReferences.positions) ? filterReferences.positions : [])
      .map((item) => makeTextOption(item.label))
      .filter(Boolean);
    return [{ value: "", label: translate("All") }, ...options];
  }, [filterReferences.positions, translate]);

  const filterServiceOptions = useMemo(() => {
    const options = (Array.isArray(filterReferences.services) ? filterReferences.services : [])
      .map((item) => makeTextOption(
        item.name,
        `${item.name || item.id}${item.positionLabel ? ` - ${item.positionLabel}` : ""}`
      ))
      .filter(Boolean);
    return [{ value: "", label: translate("All") }, ...options];
  }, [filterReferences.services, translate]);

  const editServiceById = useMemo(() => {
    const map = new Map();
    editServiceOptions.forEach((option) => {
      if (option?.value) {
        map.set(String(option.value), option.item || {});
      }
    });
    return map;
  }, [editServiceOptions]);

  const editTotals = useMemo(() => {
    return editForm.items.reduce((totals, item) => {
      const service = editServiceById.get(String(item.serviceId || ""));
      const priceUzs = normalizeMoneyInput(service?.priceUzs ?? item.priceUzs);
      const discountUzs = calculateDiscountUzs({
        priceUzs,
        discountType: item.discountType,
        discountValue: item.discountValue
      });
      return {
        subtotalUzs: totals.subtotalUzs + priceUzs,
        discountUzs: totals.discountUzs + discountUzs,
        totalUzs: totals.totalUzs + Math.max(priceUzs - discountUzs, 0)
      };
    }, { subtotalUzs: 0, discountUzs: 0, totalUzs: 0 });
  }, [editForm.items, editServiceById]);

  const applyFilters = (event) => {
    event.preventDefault();
    setAppliedFilters(filters);
    setFiltersOpen(false);
    void loadTickets(1, filters);
  };

  const resetFilters = () => {
    const nextFilters = createDefaultFilters();
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setFilterClientSearch("");
    setFilterClientOptions([]);
    void loadTickets(1, nextFilters);
  };

  const openHistory = async (item) => {
    const id = String(item?.id || "");
    if (!id) return;
    setHistoryTicket(item);
    setHistoryItems([]);
    setHistoryLoading(true);
    try {
      const response = await apiFetch(`/api/finance/tickets/${id}/history`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Failed to load ticket history."));
        return;
      }
      setHistoryItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      window.alert?.(translate("Failed to load ticket history."));
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistory = () => {
    if (historyLoading) return;
    setHistoryTicket(null);
    setHistoryItems([]);
  };

  const loadEditReferences = useCallback(async () => {
    setEditReferencesLoading(true);
    try {
      const response = await apiFetch("/api/finance/cashier/board");
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Failed to load cashier board."));
        return;
      }
      setEditServices(Array.isArray(data?.services) ? data.services : []);
      setEditSpecialists(Array.isArray(data?.specialists) ? data.specialists : []);
    } catch {
      window.alert?.(translate("Failed to load cashier board."));
    } finally {
      setEditReferencesLoading(false);
    }
  }, [translate]);

  const loadFilterReferences = useCallback(async () => {
    setFilterReferencesLoading(true);
    try {
      const response = await apiFetch("/api/finance/tickets/references");
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Failed to load ticket references."));
        return;
      }
      setFilterReferences({
        services: Array.isArray(data?.services) ? data.services : [],
        specialists: Array.isArray(data?.specialists) ? data.specialists : [],
        positions: Array.isArray(data?.positions) ? data.positions : []
      });
    } catch {
      window.alert?.(translate("Failed to load ticket references."));
    } finally {
      setFilterReferencesLoading(false);
    }
  }, [translate]);

  useEffect(() => {
    if (!filtersOpen) return;
    void loadFilterReferences();
  }, [filtersOpen, loadFilterReferences]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const query = filterClientSearch.trim();
    if (!query || (!/^\d+$/.test(query) && query.length < 3)) {
      setFilterClientSearchBusy(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setFilterClientSearchBusy(true);
      try {
        const response = await apiFetch(`/api/finance/tickets/clients?q=${encodeURIComponent(query)}&limit=30`);
        const data = await readApiResponseData(response);
        if (!response.ok) {
          if (!cancelled) {
            window.alert?.(translate(data?.message || "Failed to search clients."));
          }
          return;
        }
        if (!cancelled) {
          const options = (Array.isArray(data?.items) ? data.items : [])
            .map(makeClientOption)
            .filter(Boolean);
          setFilterClientOptions(options);
        }
      } catch {
        if (!cancelled) {
          window.alert?.(translate("Failed to search clients."));
        }
      } finally {
        if (!cancelled) {
          setFilterClientSearchBusy(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filterClientSearch, filtersOpen, translate]);

  useEffect(() => {
    if (!editTicket) return undefined;
    const query = editClientSearch.trim();
    const selectedOption = makeClientOption(editTicket);
    if (!query || (!/^\d+$/.test(query) && query.length < 3)) {
      setEditClientSearchBusy(false);
      setEditClientOptions((current) => mergeOptions(selectedOption ? [selectedOption] : [], current));
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setEditClientSearchBusy(true);
      try {
        const response = await apiFetch(`/api/finance/cashier/clients?q=${encodeURIComponent(query)}&limit=30`);
        const data = await readApiResponseData(response);
        if (!response.ok) {
          if (!cancelled) {
            window.alert?.(translate(data?.message || "Failed to search clients."));
          }
          return;
        }
        if (!cancelled) {
          const options = (Array.isArray(data?.items) ? data.items : [])
            .map(makeClientOption)
            .filter(Boolean);
          setEditClientOptions(mergeOptions(selectedOption ? [selectedOption] : [], options));
        }
      } catch {
        if (!cancelled) {
          window.alert?.(translate("Failed to search clients."));
        }
      } finally {
        if (!cancelled) {
          setEditClientSearchBusy(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editClientSearch, editTicket, translate]);

  const openEditTicket = (item) => {
    if (!canUpdateFinanceCashier) return;
    if (item?.status === "paid" || item?.status === "voided") {
      window.alert?.(translate("Paid or voided tickets cannot be edited."));
      return;
    }
    const form = createTicketEditForm(item);
    const clientOption = makeClientOption(item);
    setEditTicket(item);
    setEditForm(form);
    setEditClientSearch("");
    setEditClientOptions(clientOption ? [clientOption] : []);
    void loadEditReferences();
  };

  const closeEditTicket = (force = false) => {
    if (editSubmitting && !force) return;
    setEditTicket(null);
    setEditForm(EMPTY_TICKET_EDIT_FORM);
    setEditClientSearch("");
    setEditClientOptions([]);
  };

  const updateEditItem = (index, patch) => {
    setEditForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      ))
    }));
  };

  const addEditItem = () => {
    setEditForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          specialistId: "",
          specialistName: "",
          serviceId: "",
          serviceName: "",
          priceUzs: 0,
          discountType: "amount",
          discountValue: "0"
        }
      ]
    }));
  };

  const removeEditItem = (index) => {
    setEditForm((current) => ({
      ...current,
      items: current.items.length <= 1
        ? current.items
        : current.items.filter((_, itemIndex) => itemIndex !== index)
    }));
  };

  const submitEditTicket = async (event) => {
    event.preventDefault();
    const id = String(editTicket?.id || "");
    if (!id || editSubmitting || !canUpdateFinanceCashier) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editForm.ticketDate)) {
      window.alert?.(translate("Ticket date is required."));
      return;
    }
    if (!String(editForm.clientId || "").trim()) {
      window.alert?.(translate("Client is required."));
      return;
    }
    for (const item of editForm.items) {
      if (!String(item.specialistId || "").trim()) {
        window.alert?.(translate("Specialist is required."));
        return;
      }
      if (!String(item.serviceId || "").trim()) {
        window.alert?.(translate("Service is required."));
        return;
      }
    }
    if (editTotals.totalUzs <= 0) {
      window.alert?.(translate("Ticket amount is required."));
      return;
    }

    setEditSubmitting(true);
    try {
      const response = await apiFetch(`/api/finance/cashier/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketDate: editForm.ticketDate,
          clientId: editForm.clientId,
          items: editForm.items.map((item) => ({
            specialistId: item.specialistId,
            serviceId: item.serviceId,
            discountType: item.discountType || "amount",
            discountValue: Number.parseInt(String(item.discountValue || 0), 10) || 0
          })),
          note: editForm.note
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Ticket update failed."));
        return;
      }
      closeEditTicket(true);
      await loadTickets(page, appliedFilters);
    } catch {
      window.alert?.(translate("Ticket update failed."));
    } finally {
      setEditSubmitting(false);
    }
  };

  const deleteTicket = async (item) => {
    const id = String(item?.id || "");
    if (!id || voidingId || !canUpdateFinanceCashier) return;
    if (item?.status === "paid" || item?.status === "voided") {
      window.alert?.(translate("Paid or voided tickets cannot be edited."));
      return;
    }
    const confirmed = window.confirm?.(translate("Delete this ticket?")) ?? true;
    if (!confirmed) return;
    setVoidingId(id);
    try {
      const response = await apiFetch(`/api/finance/cashier/tickets/${id}/void`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Ticket delete failed."));
        return;
      }
      await loadTickets(page, appliedFilters);
    } catch {
      window.alert?.(translate("Ticket delete failed."));
    } finally {
      setVoidingId("");
    }
  };

  const refundTicket = async (item) => {
    const id = String(item?.id || "");
    if (!id || refundingId) return;
    const confirmed = window.confirm?.(translate("Refund this ticket?")) ?? true;
    if (!confirmed) return;
    setRefundingId(id);
    try {
      const response = await apiFetch(`/api/finance/cashier/tickets/${id}/refund`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Ticket refund failed."));
        return;
      }
      await loadTickets(page, appliedFilters);
    } catch {
      window.alert?.(translate("Ticket refund failed."));
    } finally {
      setRefundingId("");
    }
  };

  const fetchAllTickets = async () => {
    const allItems = [];
    let nextPage = 1;
    let nextTotalPages = 1;
    do {
      const query = new URLSearchParams();
      query.set("page", String(nextPage));
      query.set("pageSize", "100");
      Object.entries(appliedFilters).forEach(([key, value]) => {
        const normalized = String(value || "").trim();
        if (normalized) {
          query.set(key, normalized);
        }
      });
      const response = await apiFetch(`/api/finance/tickets?${query.toString()}`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        throw new Error(data?.message || "Export failed.");
      }
      allItems.push(...(Array.isArray(data?.items) ? data.items : []));
      nextTotalPages = Number.parseInt(String(data?.totalPages || 1), 10) || 1;
      nextPage += 1;
    } while (nextPage <= nextTotalPages);
    return allItems;
  };

  const exportTickets = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = await fetchAllTickets();
      exportExcelWorkbook(buildExportFilename("finance-tickets"), [{
        name: translate("Tickets"),
        rows: [
          [
            translate("Ticket Number"),
            translate("Ticket Date"),
            translate("Client"),
            translate("Specialist"),
            translate("Department"),
            translate("Service"),
            translate("Total"),
            translate("Status")
          ],
          ...rows.map((item) => [
            item.ticketNumber || "",
            formatDateYMD(item.ticketDate),
            item.clientName || "",
            getTicketSpecialistText(item),
            getTicketPositionText(item),
            getTicketServiceText(item),
            Number.parseInt(String(item.totalUzs ?? item.amountUzs ?? 0), 10) || 0,
            translateTicketStatus(translate, item.status)
          ])
        ]
      }]);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  const closeFilters = () => {
    if (loading) return;
    setFiltersOpen(false);
  };

  return (
    <section id="financeTicketsPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-tickets-panel">
      <div className="all-users-head">
        <h3>{translate("Tickets")}</h3>
        <div className="all-users-head-actions">
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            aria-label={translate("Export Excel")}
            title={translate("Export Excel")}
            disabled={loading || exporting}
            onClick={exportTickets}
          >
            <span className="finance-head-icon finance-head-icon-export" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            aria-label={translate("Filter")}
            title={translate("Filter")}
            onClick={() => setFiltersOpen(true)}
          >
            <span className="finance-head-icon finance-head-icon-filter" aria-hidden="true" />
          </button>
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close tickets panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      {filtersOpen && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close")}
            onClick={closeFilters}
          />
          <div id="financeTicketFilterModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-ticket-filter-modal">
            <h3>{translate("Filter")}</h3>
            <form className="auth-form" onSubmit={applyFilters}>
              <div className="all-users-edit-fields settings-filter-grid finance-ticket-filter-grid">
                <label className="field">
                  <span>{translate("Ticket Number")}</span>
                  <input
                    type="text"
                    value={filters.ticketNumber}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setFilters((current) => ({ ...current, ticketNumber: value }));
                    }}
                  />
                </label>
                <div className="finance-ticket-filter-date-row">
                  <label className="field">
                    <span>{translate("Ticket Date From")}</span>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFilters((current) => ({ ...current, dateFrom: value }));
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>{translate("Ticket Date To")}</span>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFilters((current) => ({ ...current, dateTo: value }));
                      }}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{translate("Client")}</span>
                  <CustomSelect
                    value={filters.client}
                    options={[{ value: "", label: translate("All") }, ...filterClientOptions]}
                    placeholder={translate("Client")}
                    searchable
                    searchPlaceholder={translate("Search by name or ID")}
                    searchThreshold={0}
                    menuPortal
                    menuHeightScale={1.2}
                    emptyText={filterClientSearchBusy ? "..." : translate("No clients found.")}
                    onSearchChange={setFilterClientSearch}
                    onChange={(value) => setFilters((current) => ({ ...current, client: value }))}
                  />
                </label>
                <label className="field">
                  <span>{translate("Specialist")}</span>
                  <CustomSelect
                    value={filters.specialist}
                    options={filterSpecialistOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search")}
                    searchThreshold={8}
                    menuPortal
                    disabled={filterReferencesLoading}
                    onChange={(value) => setFilters((current) => ({ ...current, specialist: value }))}
                  />
                </label>
                <label className="field">
                  <span>{translate("Department")}</span>
                  <CustomSelect
                    value={filters.position}
                    options={filterPositionOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search")}
                    searchThreshold={8}
                    menuPortal
                    disabled={filterReferencesLoading}
                    onChange={(value) => setFilters((current) => ({ ...current, position: value }))}
                  />
                </label>
                <label className="field">
                  <span>{translate("Service")}</span>
                  <CustomSelect
                    value={filters.service}
                    options={filterServiceOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search")}
                    searchThreshold={8}
                    menuPortal
                    menuWidthScale={1.2}
                    disabled={filterReferencesLoading}
                    onChange={(value) => setFilters((current) => ({ ...current, service: value }))}
                  />
                </label>
                <label className="field">
                  <span>{translate("Status")}</span>
                  <select
                    value={filters.status}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setFilters((current) => ({ ...current, status: value }));
                    }}
                  >
                    <option value="">{translate("All")}</option>
                    <option value="issued">{translate("Tickets")}</option>
                    <option value="paid">{translate("Paid")}</option>
                    <option value="unpaid">{translate("Unpaid")}</option>
                    <option value="voided">{translate("Voided")}</option>
                  </select>
                </label>
              </div>
              <div className="edit-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>{translate("Search")}</button>
                <button type="button" className="btn btn-secondary" disabled={loading} onClick={resetFilters}>{translate("Reset")}</button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="all-users-table-scroll">
        <table className="all-users-table" aria-label="Finance tickets table">
          <thead>
            <tr>
              <th>{translate("Ticket Number")}</th>
              <th>{translate("Ticket Date")}</th>
              <th>{translate("Client")}</th>
              <th>{translate("Specialist")}</th>
              <th>{translate("Department")}</th>
              <th>{translate("Service")}</th>
              <th>{translate("Total")}</th>
              <th>{translate("Status")}</th>
              <th>{translate("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="9" className="skel" />
                </tr>
              ))
            ) : items.map((item) => {
              const id = String(item.id);
              const canEditRow = canUpdateFinanceCashier && item.status !== "paid" && item.status !== "voided";
              const hasAction = canEditRow || item.status === "paid";
              return (
                <tr key={id} onDoubleClick={() => openHistory(item)}>
                  <td>{item.ticketNumber ? `#${item.ticketNumber}` : "-"}</td>
                  <td>{formatDateYMD(item.ticketDate)}</td>
                  <td>{item.clientName || "-"}</td>
                  <td>{getTicketSpecialistText(item)}</td>
                  <td>{getTicketPositionText(item)}</td>
                  <td>{getTicketServiceText(item)}</td>
                  <td>{formatMoney(item.totalUzs ?? item.amountUzs)}</td>
                  <td>{translateTicketStatus(translate, item.status)}</td>
                  <td>
                    {hasAction ? (
                      <div className="finance-ticket-action-group">
                        {canEditRow ? (
                          <>
                            <button
                              type="button"
                              className="table-action-btn finance-ticket-icon-btn"
                              aria-label={translate("Edit")}
                              title={translate("Edit")}
                              disabled={editSubmitting}
                              onClick={() => openEditTicket(item)}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="table-action-btn table-action-btn-danger finance-ticket-icon-btn"
                              aria-label={translate("Delete")}
                              title={translate("Delete")}
                              disabled={voidingId === id}
                              onClick={() => deleteTicket(item)}
                            >
                              {voidingId === id ? "..." : <span className="finance-ticket-trash-icon" aria-hidden="true" />}
                            </button>
                          </>
                        ) : null}
                        {item.status === "paid" ? (
                          <button
                            type="button"
                            className="table-action-btn"
                            disabled={refundingId === id}
                            onClick={() => refundTicket(item)}
                          >
                            {translate("Refund")}
                          </button>
                        ) : null}
                      </div>
                    ) : "-"}
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan="9" className="all-users-state">{translate("No items found.")}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <button
          type="button"
          className="table-action-btn"
          disabled={loading || page <= 1}
          onClick={() => loadTickets(page - 1, appliedFilters)}
        >
          {translate("Previous")}
        </button>
        <span>{`${page} / ${totalPages}`}</span>
        <button
          type="button"
          className="table-action-btn"
          disabled={loading || page >= totalPages}
          onClick={() => loadTickets(page + 1, appliedFilters)}
        >
          {translate("Next")}
        </button>
      </div>

      {editTicket ? (
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close ticket edit modal")}
            onClick={() => closeEditTicket()}
          />
          <div id="financeTicketEditModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-ticket-edit-modal">
            <h3>{`${translate("Edit Ticket")} ${editTicket.ticketNumber ? `#${editTicket.ticketNumber}` : ""}`}</h3>
            <form className="auth-form finance-ticket-edit-form" onSubmit={submitEditTicket}>
              <div className="all-users-edit-fields">
                <div className="finance-ticket-edit-top-row">
                  <label className="field">
                    <span>{translate("Ticket Date")}</span>
                    <input
                      type="date"
                      value={editForm.ticketDate}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setEditForm((current) => ({ ...current, ticketDate: value }));
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{translate("Client")}</span>
                    <CustomSelect
                      value={editForm.clientId}
                      options={editClientOptions}
                      placeholder={translate("Select client")}
                      searchable
                      searchPlaceholder={translate("Search by name or ID")}
                      searchThreshold={0}
                      menuPortal
                      menuHeightScale={1.2}
                      emptyText={editClientSearchBusy ? "..." : translate("No clients found.")}
                      onSearchChange={setEditClientSearch}
                      onChange={(value) => setEditForm((current) => ({ ...current, clientId: value }))}
                    />
                  </label>
                </div>

                <div className="finance-ticket-edit-items">
                  {editForm.items.map((item, index) => (
                    <div className="finance-ticket-edit-item" key={`${index}-${item.serviceId}-${item.specialistId}`}>
                      <div className="finance-ticket-edit-item-head">
                        <h4>{`${translate("Bill")} ${index + 1}`}</h4>
                        <div className="finance-ticket-edit-item-actions">
                          <button
                            type="button"
                            className="table-action-btn finance-ticket-icon-btn"
                            aria-label={translate("Add Service")}
                            title={translate("Add Service")}
                            onClick={addEditItem}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="table-action-btn table-action-btn-danger finance-ticket-icon-btn"
                            aria-label={translate("Remove")}
                            title={translate("Remove")}
                            disabled={editForm.items.length <= 1}
                            onClick={() => removeEditItem(index)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className="finance-ticket-edit-item-grid">
                        <CustomSelect
                          value={item.specialistId}
                          options={editSpecialistOptions}
                          placeholder={translate("Select specialist")}
                          searchable
                          searchPlaceholder={translate("Search")}
                          searchThreshold={8}
                          menuPortal
                          disabled={editReferencesLoading}
                          onChange={(value) => updateEditItem(index, { specialistId: value })}
                        />
                        <CustomSelect
                          value={item.serviceId}
                          options={editServiceOptions}
                          placeholder={translate("Select service type")}
                          searchable
                          searchPlaceholder={translate("Search")}
                          searchThreshold={8}
                          menuPortal
                          menuWidthScale={1.2}
                          disabled={editReferencesLoading}
                          onChange={(value) => {
                            const service = editServiceById.get(String(value)) || {};
                            updateEditItem(index, {
                              serviceId: value,
                              serviceName: service.name || item.serviceName,
                              priceUzs: normalizeMoneyInput(service.priceUzs ?? item.priceUzs)
                            });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <label className="field">
                  <span>{translate("Note")}</span>
                  <textarea
                    rows="2"
                    maxLength="255"
                    value={editForm.note}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEditForm((current) => ({ ...current, note: value }));
                    }}
                  />
                </label>

                <div className="finance-ticket-total finance-ticket-edit-total">
                  <div className="finance-total-cell">
                    <span>{translate("Subtotal")}</span>
                    <strong>{formatMoney(editTotals.subtotalUzs)}</strong>
                  </div>
                  <div className="finance-total-cell">
                    <span>{translate("Discount")}</span>
                    <strong>{formatMoney(editTotals.discountUzs)}</strong>
                  </div>
                  <div className="finance-total-cell">
                    <span>{translate("Total")}</span>
                    <strong>{formatMoney(editTotals.totalUzs)}</strong>
                  </div>
                </div>
              </div>
              <div className="edit-actions">
                <button type="submit" className="btn btn-primary" disabled={editSubmitting || editReferencesLoading}>
                  {translate("Save")}
                </button>
                <button type="button" className="btn btn-secondary" disabled={editSubmitting} onClick={() => closeEditTicket()}>
                  {translate("Cancel")}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}

      {historyTicket ? (
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close ticket history modal")}
            onClick={closeHistory}
          />
          <div id="financeTicketHistoryModal" className="logout-confirm-modal all-users-edit-modal">
            <h3>{`${translate("Ticket History")} #${historyTicket.ticketNumber || ""}`}</h3>
            <div className="all-users-table-scroll">
              <table className="all-users-table" aria-label="Ticket history table">
                <thead>
                  <tr>
                    <th>{translate("Date")}</th>
                    <th>{translate("Action")}</th>
                    <th>{translate("Status")}</th>
                    <th>{translate("User")}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr><td colSpan="4" className="skel" /></tr>
                  ) : historyItems.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>{translate(item.action || "-")}</td>
                      <td>{[item.fromStatus, item.toStatus].filter(Boolean).map((status) => translateTicketStatus(translate, status)).join(" -> ") || "-"}</td>
                      <td>{item.actorName || "-"}</td>
                    </tr>
                  ))}
                  {!historyLoading && historyItems.length === 0 ? (
                    <tr><td colSpan="4" className="all-users-state">{translate("No items found.")}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="edit-actions">
              <button type="button" className="btn btn-secondary" onClick={closeHistory}>{translate("Close")}</button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default FinanceTicketsPanel;
