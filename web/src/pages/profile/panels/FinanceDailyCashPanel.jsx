import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { formatDateTimeTashkent, getTodayYmd } from "../../../lib/formatters.js";
import { useEscapeKey } from "../../../lib/use-escape-key.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FILTERS = Object.freeze({
  dateFrom: getTodayYmd(),
  dateTo: getTodayYmd(),
  client: "",
  service: "",
  paymentMethodId: "",
  sessionScope: "current"
});

const EMPTY_SESSION_FORM = Object.freeze({
  submittedAmountUzs: "",
  note: ""
});

const FINANCE_DAILY_CASH_COLUMNS_STORAGE_KEY = "aaron_crm_finance_daily_cash_columns";
const DEFAULT_FINANCE_DAILY_CASH_COLUMN_IDS = Object.freeze([
  "index",
  "client",
  "clientId",
  "date",
  "paymentMethod",
  "amount",
  "ticketNumber",
  "service",
  "cashier"
]);

function loadStoredDailyCashColumnIds() {
  if (typeof window === "undefined") return [...DEFAULT_FINANCE_DAILY_CASH_COLUMN_IDS];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FINANCE_DAILY_CASH_COLUMNS_STORAGE_KEY) || "[]");
    const stored = Array.isArray(parsed) ? parsed : [];
    const allowed = new Set(DEFAULT_FINANCE_DAILY_CASH_COLUMN_IDS);
    const normalized = DEFAULT_FINANCE_DAILY_CASH_COLUMN_IDS.filter((id) => stored.includes(id) && allowed.has(id));
    return normalized.length > 0 ? normalized : [...DEFAULT_FINANCE_DAILY_CASH_COLUMN_IDS];
  } catch {
    return [...DEFAULT_FINANCE_DAILY_CASH_COLUMN_IDS];
  }
}

function storeDailyCashColumnIds(columnIds) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FINANCE_DAILY_CASH_COLUMNS_STORAGE_KEY, JSON.stringify(columnIds));
  } catch {
    // The current state still works even if localStorage is unavailable.
  }
}

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount !== 0 ? amount.toLocaleString("ru-RU") : "-";
}

function formatMoneyValue(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount.toLocaleString("ru-RU");
}

function getDailyCashSignedAmount(item) {
  const amount = Number.parseInt(String(item?.amountUzs || 0), 10) || 0;
  return String(item?.direction || "") === "out" ? -Math.abs(amount) : amount;
}

function getDailyCashSummaryColumnValue(columnId, summary) {
  if (columnId === "amount") {
    return Number.parseInt(String(summary?.netUzs ?? 0), 10) || 0;
  }
  return null;
}

function normalizeMoneyInput(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function makeClientOption(item) {
  const id = String(item?.id ?? item?.clientId ?? "").trim();
  if (!id) return null;
  const label = String(item?.fullName || item?.clientName || `#${id}`).trim() || `#${id}`;
  return { value: id, label };
}

function getPaymentMethodSummaryCards(paymentMethods, paymentSummary) {
  const summaryById = new Map();
  const methodIds = new Set();
  const unmatchedSummaries = [];
  (Array.isArray(paymentSummary) ? paymentSummary : []).forEach((item) => {
    const id = String(item?.paymentMethodId || "").trim();
    if (id) {
      summaryById.set(id, item);
    } else {
      unmatchedSummaries.push(item);
    }
  });

  const cards = (Array.isArray(paymentMethods) ? paymentMethods : []).map((method, index) => {
    const id = String(method?.id || "").trim();
    if (id) {
      methodIds.add(id);
    }
    const summaryItem = summaryById.get(id) || {};
    return {
      key: `method-${id || method?.name || index}`,
      paymentMethodId: id,
      paymentMethodName: method?.name || summaryItem.paymentMethodName || "-",
      totalInUzs: Number.parseInt(String(summaryItem.totalInUzs || 0), 10) || 0,
      totalOutUzs: Number.parseInt(String(summaryItem.totalOutUzs || 0), 10) || 0,
      netUzs: Number.parseInt(String(summaryItem.netUzs || 0), 10) || 0
    };
  });

  (Array.isArray(paymentSummary) ? paymentSummary : []).forEach((item) => {
    const id = String(item?.paymentMethodId || "").trim();
    if (!id || methodIds.has(id)) return;
    cards.push({
      key: `summary-method-${id}`,
      paymentMethodId: id,
      paymentMethodName: item?.paymentMethodName || `#${id}`,
      totalInUzs: Number.parseInt(String(item?.totalInUzs || 0), 10) || 0,
      totalOutUzs: Number.parseInt(String(item?.totalOutUzs || 0), 10) || 0,
      netUzs: Number.parseInt(String(item?.netUzs || 0), 10) || 0
    });
  });

  unmatchedSummaries.forEach((item, index) => {
    cards.push({
      key: `summary-${item?.paymentMethodName || index}`,
      paymentMethodId: "",
      paymentMethodName: item?.paymentMethodName || "No payment method",
      totalInUzs: Number.parseInt(String(item?.totalInUzs || 0), 10) || 0,
      totalOutUzs: Number.parseInt(String(item?.totalOutUzs || 0), 10) || 0,
      netUzs: Number.parseInt(String(item?.netUzs || 0), 10) || 0
    });
  });

  return cards;
}

function FinanceDailyCashPanel({ onClose, canPayFinanceCashier = false, currentUser = null }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ totalInUzs: 0, totalOutUzs: 0, netUzs: 0, transactionCount: 0 });
  const [paymentSummary, setPaymentSummary] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [services, setServices] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterClientSearch, setFilterClientSearch] = useState("");
  const [filterClientOptions, setFilterClientOptions] = useState([]);
  const [filterClientSearchBusy, setFilterClientSearchBusy] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState(() => loadStoredDailyCashColumnIds());
  const [cashSession, setCashSession] = useState(null);
  const [sessionModal, setSessionModal] = useState("");
  const [sessionForm, setSessionForm] = useState(EMPTY_SESSION_FORM);
  const [sessionSubmitting, setSessionSubmitting] = useState(false);
  const currentCashierName = String(currentUser?.fullName || currentUser?.username || "").trim();
  const nowLabel = formatDateTimeTashkent(new Date().toISOString());

  const paymentMethodOptions = useMemo(() => paymentMethods.map((item) => ({
    value: String(item.id),
    label: item.name
  })), [paymentMethods]);

  const paymentMethodSummaryCards = useMemo(
    () => getPaymentMethodSummaryCards(paymentMethods, paymentSummary),
    [paymentMethods, paymentSummary]
  );

  const serviceOptions = useMemo(() => services.map((item) => ({
    value: String(item.name || ""),
    label: item.name || "-"
  })).filter((item) => item.value), [services]);

  const dailyCashColumns = [
    {
      id: "index",
      label: "#",
      className: "finance-daily-cash-col-index",
      cellClassName: "finance-daily-cash-cell-center",
      render: (_item, index) => (page - 1) * 20 + index + 1,
      exportValue: (_item, index) => index + 1
    },
    {
      id: "client",
      label: "Client",
      className: "finance-daily-cash-col-client",
      render: (item) => item.clientName || "-",
      exportValue: (item) => item.clientName || ""
    },
    {
      id: "clientId",
      label: "Client ID",
      className: "finance-daily-cash-col-client-id",
      cellClassName: "finance-daily-cash-cell-center",
      render: (item) => item.clientId || "-",
      exportValue: (item) => item.clientId || ""
    },
    {
      id: "date",
      label: "Date",
      className: "finance-daily-cash-col-date",
      render: (item) => formatDateTimeTashkent(item.transactionAt),
      exportValue: (item) => formatDateTimeTashkent(item.transactionAt)
    },
    {
      id: "paymentMethod",
      label: "Payment Method",
      className: "finance-daily-cash-col-method",
      render: (item) => item.paymentMethodName || "-",
      exportValue: (item) => item.paymentMethodName || ""
    },
    {
      id: "amount",
      label: "Amount",
      className: "finance-daily-cash-col-amount",
      cellClassName: "finance-daily-cash-cell-amount",
      render: (item) => formatMoney(getDailyCashSignedAmount(item)),
      exportValue: (item) => getDailyCashSignedAmount(item)
    },
    {
      id: "ticketNumber",
      label: "Ticket Number",
      className: "finance-daily-cash-col-ticket",
      cellClassName: "finance-daily-cash-cell-center",
      render: (item) => item.ticketNumber ? `#${item.ticketNumber}` : "-",
      exportValue: (item) => item.ticketNumber || ""
    },
    {
      id: "service",
      label: "Service",
      className: "finance-daily-cash-col-service",
      render: (item) => item.serviceName || "-",
      exportValue: (item) => item.serviceName || ""
    },
    {
      id: "cashier",
      label: "Cashier",
      className: "finance-daily-cash-col-cashier",
      render: (item) => item.cashierName || "-",
      exportValue: (item) => item.cashierName || ""
    }
  ];
  const visibleColumns = dailyCashColumns.filter((column) => visibleColumnIds.includes(column.id));
  const visibleColumnCount = Math.max(visibleColumns.length, 1);

  const toggleColumnVisibility = (columnId) => {
    setVisibleColumnIds((current) => {
      const currentIds = Array.isArray(current) ? current : DEFAULT_FINANCE_DAILY_CASH_COLUMN_IDS;
      const nextIds = new Set(currentIds);
      if (nextIds.has(columnId)) {
        if (nextIds.size <= 1) return currentIds;
        nextIds.delete(columnId);
      } else if (dailyCashColumns.some((column) => column.id === columnId)) {
        nextIds.add(columnId);
      }
      const next = dailyCashColumns.map((column) => column.id).filter((id) => nextIds.has(id));
      if (next.length > 0) {
        storeDailyCashColumnIds(next);
        return next;
      }
      return currentIds;
    });
  };

  const closeColumns = () => {
    setColumnsOpen(false);
  };

  const loadPaymentMethods = useCallback(async () => {
    try {
      const response = await apiFetch("/api/finance/payment-methods");
      const data = await readApiResponseData(response);
      if (response.ok) {
        setPaymentMethods(Array.isArray(data?.items) ? data.items : []);
      }
    } catch {
      setPaymentMethods([]);
    }
  }, []);

  const loadServices = useCallback(async () => {
    try {
      const response = await apiFetch("/api/services");
      const data = await readApiResponseData(response);
      if (response.ok) {
        setServices(Array.isArray(data?.items) ? data.items : []);
      }
    } catch {
      setServices([]);
    }
  }, []);

  const loadCashSession = useCallback(async () => {
    if (!canPayFinanceCashier) {
      setCashSession(null);
      return;
    }
    try {
      const response = await apiFetch("/api/finance/cashier/session/current");
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Failed to load cash session."));
        setCashSession(null);
        return;
      }
      setCashSession(data?.item || null);
    } catch {
      window.alert?.(translate("Failed to load cash session."));
      setCashSession(null);
    }
  }, [canPayFinanceCashier, translate]);

  const loadDailyCash = useCallback(async (nextPage = 1, nextFilters = EMPTY_FILTERS) => {
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
      const response = await apiFetch(`/api/finance/daily-cash?${query.toString()}`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Failed to load daily cash.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
      setSummary(data?.summary && typeof data.summary === "object" ? data.summary : {});
      setPaymentSummary(Array.isArray(data?.paymentMethods) ? data.paymentMethods : []);
      setPage(Number.parseInt(String(data?.page || nextPage), 10) || 1);
      setTotalPages(Number.parseInt(String(data?.totalPages || 1), 10) || 1);
      setMessage("");
    } catch {
      setMessage("Failed to load daily cash.");
      window.alert?.(translate("Failed to load daily cash."));
    } finally {
      setLoading(false);
    }
  }, [translate]);

  useEffect(() => {
    void loadPaymentMethods();
    void loadServices();
    void loadCashSession();
    void loadDailyCash(1, EMPTY_FILTERS);
  }, [loadCashSession, loadDailyCash, loadPaymentMethods, loadServices]);

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
        const response = await apiFetch(`/api/finance/transactions/clients?q=${encodeURIComponent(query)}&limit=30`);
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

  const applyFilters = (event) => {
    event.preventDefault();
    const nextFilters = {
      ...filters,
      sessionScope: "all"
    };
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setFiltersOpen(false);
    void loadDailyCash(1, nextFilters);
  };

  const applyPaymentMethodSummaryFilter = (paymentMethodId) => {
    const normalizedPaymentMethodId = String(paymentMethodId || "").trim();
    if (!normalizedPaymentMethodId || loading) return;
    const nextFilters = {
      ...appliedFilters,
      paymentMethodId: normalizedPaymentMethodId
    };
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
    void loadDailyCash(1, nextFilters);
  };

  const openSessionModal = (type) => {
    if (!canPayFinanceCashier) return;
    setSessionModal(type);
    setSessionForm({
      submittedAmountUzs: type === "close" ? String(cashSession?.expectedBalanceUzs || 0) : "",
      note: ""
    });
  };

  const closeSessionModal = (force = false) => {
    if (sessionSubmitting && !force) return;
    setSessionModal("");
    setSessionForm(EMPTY_SESSION_FORM);
  };

  useEscapeKey(Boolean(sessionModal || filtersOpen || columnsOpen), () => {
    if (sessionModal) {
      closeSessionModal();
      return;
    }
    if (filtersOpen) {
      setFiltersOpen(false);
      return;
    }
    if (columnsOpen) {
      closeColumns();
    }
  });

  const submitCashSession = async (event) => {
    event.preventDefault();
    if (!sessionModal || sessionSubmitting || !canPayFinanceCashier) return;
    const submittedAmountUzs = normalizeMoneyInput(sessionForm.submittedAmountUzs);
    setSessionSubmitting(true);
    try {
      const isOpening = sessionModal === "open";
      const response = await apiFetch(`/api/finance/cashier/session/${isOpening ? "open" : "close"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isOpening
          ? { note: sessionForm.note }
          : { closingBalanceUzs: submittedAmountUzs, note: sessionForm.note })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || (isOpening ? "Cash session open failed." : "Cash session close failed.")));
        return;
      }
      setCashSession(data?.item || null);
      closeSessionModal(true);
      await Promise.all([
        loadCashSession(),
        loadDailyCash(1, appliedFilters)
      ]);
    } catch {
      window.alert?.(translate(sessionModal === "open" ? "Cash session open failed." : "Cash session close failed."));
    } finally {
      setSessionSubmitting(false);
    }
  };

  const fetchAllDailyCash = async () => {
    const allItems = [];
    let nextSummary = summary;
    let nextPaymentSummary = paymentSummary;
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
      const response = await apiFetch(`/api/finance/daily-cash?${query.toString()}`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        throw new Error(data?.message || "Export failed.");
      }
      if (nextPage === 1) {
        nextSummary = data?.summary && typeof data.summary === "object" ? data.summary : {};
        nextPaymentSummary = Array.isArray(data?.paymentMethods) ? data.paymentMethods : [];
      }
      allItems.push(...(Array.isArray(data?.items) ? data.items : []));
      nextTotalPages = Number.parseInt(String(data?.totalPages || 1), 10) || 1;
      nextPage += 1;
    } while (nextPage <= nextTotalPages);
    return { items: allItems, summary: nextSummary, paymentSummary: nextPaymentSummary };
  };

  const exportDailyCash = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await fetchAllDailyCash();
      exportExcelWorkbook(buildExportFilename("finance-daily-cash"), [
        {
          name: translate("Daily Cash"),
          rows: [
            visibleColumns.map((column) => column.label === "#" ? "#" : translate(column.label)),
            ...result.items.map((item, index) => visibleColumns.map((column) => column.exportValue(item, index))),
            visibleColumns.map((column, index) => {
              const summaryValue = getDailyCashSummaryColumnValue(column.id, result.summary);
              if (summaryValue !== null) return summaryValue;
              return index === 0 ? translate("Total") : "";
            })
          ]
        },
        {
          name: translate("Reports"),
          rows: [
            [translate("Name"), translate("Amount")],
            [translate("Total In"), Number.parseInt(String(result.summary.totalInUzs || 0), 10) || 0],
            [translate("Total Out"), Number.parseInt(String(result.summary.totalOutUzs || 0), 10) || 0],
            [translate("Net Total"), Number.parseInt(String(result.summary.netUzs || 0), 10) || 0],
            [translate("Transactions"), Number.parseInt(String(result.summary.transactionCount || 0), 10) || 0],
            ...result.paymentSummary.map((item) => [
              item.paymentMethodName || "",
              Number.parseInt(String(item.netUzs || 0), 10) || 0
            ])
          ]
        }
      ]);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section id="financeDailyCashPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-daily-cash-panel">
      <div className="all-users-head">
        <h3>{translate("Daily Cash")}</h3>
        <div className="all-users-head-actions">
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            hidden={!canPayFinanceCashier || Boolean(cashSession)}
            aria-label={translate("Open Cash")}
            title={translate("Open Cash")}
            onClick={() => openSessionModal("open")}
          >
            <span className="finance-head-icon finance-head-icon-cash" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            hidden={!canPayFinanceCashier || !cashSession}
            aria-label={translate("Close Cash")}
            title={translate("Close Cash")}
            onClick={() => openSessionModal("close")}
          >
            <span className="finance-head-icon finance-head-icon-cash-close" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            aria-label={translate("Table columns")}
            title={translate("Table columns")}
            onClick={() => setColumnsOpen(true)}
          >
            <span className="finance-head-icon finance-head-icon-columns" aria-hidden="true" />
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
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            aria-label={translate("Export Excel")}
            title={translate("Export Excel")}
            disabled={loading || exporting}
            onClick={exportDailyCash}
          >
            <span className="finance-head-icon finance-head-icon-export" aria-hidden="true" />
          </button>
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close daily cash panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <div className="finance-daily-cash-method-summary" aria-busy={loading ? "true" : "false"}>
        {paymentMethodSummaryCards.length > 0 ? paymentMethodSummaryCards.map((item) => {
          const paymentMethodId = String(item.paymentMethodId || "").trim();
          const isActive = paymentMethodId && paymentMethodId === String(appliedFilters.paymentMethodId || "");
          return (
          <button
            type="button"
            className={`finance-daily-cash-method-card${isActive ? " is-active" : ""}`}
            key={item.key}
            disabled={!paymentMethodId || loading}
            aria-pressed={isActive ? "true" : "false"}
            onClick={() => applyPaymentMethodSummaryFilter(paymentMethodId)}
          >
            <span title={item.paymentMethodName}>{item.paymentMethodName}</span>
            <strong>{formatMoneyValue(item.netUzs)}</strong>
          </button>
          );
        }) : (
          <article className="finance-daily-cash-method-card">
            <span>{translate("Payment Method")}</span>
            <strong>{formatMoneyValue(0)}</strong>
          </article>
        )}
      </div>

      {columnsOpen && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close")}
            onClick={closeColumns}
          />
          <div id="financeDailyCashColumnsModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-ticket-columns-modal finance-daily-cash-columns-modal">
            <h3>{translate("Table columns")}</h3>
            <div className="finance-ticket-columns-list">
              {dailyCashColumns.map((column) => {
                const checked = visibleColumnIds.includes(column.id);
                return (
                  <label className="finance-ticket-column-option" key={column.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checked && visibleColumnIds.length <= 1}
                      onChange={() => toggleColumnVisibility(column.id)}
                    />
                    <span>{column.label === "#" ? "#" : translate(column.label)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      ), document.body) : null}

      {filtersOpen && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close")}
            onClick={() => setFiltersOpen(false)}
          />
          <div id="financeDailyCashFilterModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-daily-cash-filter-modal">
            <h3>{translate("Filter")}</h3>
            <form className="auth-form" onSubmit={applyFilters}>
              <div className="all-users-edit-fields settings-filter-grid finance-daily-cash-filter-grid">
                <div className="finance-daily-cash-filter-date-row">
                  <label className="field">
                    <span>{translate("Date From")}</span>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.currentTarget.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>{translate("Date To")}</span>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.currentTarget.value }))}
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
                  <span>{translate("Service")}</span>
                  <CustomSelect
                    value={filters.service}
                    options={[{ value: "", label: translate("All") }, ...serviceOptions]}
                    placeholder={translate("Service")}
                    searchable
                    searchPlaceholder={translate("Search...")}
                    searchThreshold={0}
                    menuPortal
                    menuHeightScale={1.2}
                    onChange={(value) => setFilters((current) => ({ ...current, service: value }))}
                  />
                </label>
                <label className="field">
                  <span>{translate("Payment Method")}</span>
                  <CustomSelect
                    value={filters.paymentMethodId}
                    options={[{ value: "", label: translate("All") }, ...paymentMethodOptions]}
                    menuPortal
                    onChange={(value) => setFilters((current) => ({ ...current, paymentMethodId: value }))}
                  />
                </label>
              </div>
              <div className="edit-actions">
                <button type="submit" className="btn" disabled={loading}>{translate("Search")}</button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="all-users-table-scroll">
        <table className="all-users-table finance-daily-cash-table" aria-label="Finance daily cash table">
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column.id} className={column.className} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.id} className={column.cellClassName}>{column.label === "#" ? "#" : translate(column.label)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan={visibleColumnCount} className="skel" />
                </tr>
              ))
            ) : items.map((item, index) => (
              <tr key={String(item.id)}>
                {visibleColumns.map((column) => (
                  <td key={column.id} className={column.cellClassName}>
                    {column.render(item, index)}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr><td colSpan={visibleColumnCount} className="all-users-state">{translate("No items found.")}</td></tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="finance-ticket-total-row finance-daily-cash-total-row">
              {visibleColumns.map((column, index) => {
                const summaryValue = getDailyCashSummaryColumnValue(column.id, summary);
                if (summaryValue !== null) {
                  return (
                    <td key={column.id} className="finance-ticket-total-value finance-daily-cash-cell-amount">
                      {formatMoneyValue(summaryValue)}
                    </td>
                  );
                }
                return (
                  <td key={column.id} className={index === 0 ? "finance-ticket-total-label" : undefined}>
                    {index === 0 ? translate("Total") : ""}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="table-pagination">
        <button type="button" className="table-action-btn" disabled={loading || page <= 1} onClick={() => loadDailyCash(page - 1, appliedFilters)}>
          {translate("Previous")}
        </button>
        <span>{`${page} / ${totalPages}`}</span>
        <button type="button" className="table-action-btn" disabled={loading || page >= totalPages} onClick={() => loadDailyCash(page + 1, appliedFilters)}>
          {translate("Next")}
        </button>
      </div>

      {sessionModal && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close cash session modal")}
            onClick={() => closeSessionModal()}
          />
          <div id="financeCashSessionModal" className="logout-confirm-modal all-users-edit-modal finance-modal">
            <h3>{translate(sessionModal === "open" ? "Open Cash" : "Close Cash")}</h3>
            <form className="auth-form" onSubmit={submitCashSession}>
              <div className="all-users-edit-fields">
                <div className="finance-session-info-grid">
                  <span>{translate("Cashier")}</span>
                  <strong>{sessionModal === "open" ? (currentCashierName || "-") : (cashSession?.cashierName || currentCashierName || "-")}</strong>
                  <span>{translate(sessionModal === "open" ? "Opening Time" : "Opened At")}</span>
                  <strong>{sessionModal === "open" ? nowLabel : formatDateTimeTashkent(cashSession?.openedAt)}</strong>
                  {sessionModal === "close" ? (
                    <>
                      <span>{translate("Closing Time")}</span>
                      <strong>{nowLabel}</strong>
                      <span>{translate("Collected Cash")}</span>
                      <strong>{formatMoney(cashSession?.expectedBalanceUzs)}</strong>
                    </>
                  ) : null}
                </div>
                {sessionModal === "close" ? (
                  <label className="field">
                    <span>{translate("Submitted Cash")}</span>
                    <input
                      type="number"
                      min="0"
                      value={sessionForm.submittedAmountUzs}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setSessionForm((current) => ({ ...current, submittedAmountUzs: value }));
                      }}
                    />
                  </label>
                ) : null}
                <label className="field">
                  <span>{translate("Note")}</span>
                  <input
                    type="text"
                    maxLength={255}
                    value={sessionForm.note}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSessionForm((current) => ({ ...current, note: value }));
                    }}
                  />
                </label>
              </div>
              <div className="edit-actions">
                <button type="button" className="btn btn-secondary" onClick={() => closeSessionModal()}>{translate("Cancel")}</button>
                <button type="submit" className="btn" disabled={sessionSubmitting}>
                  {sessionSubmitting ? "..." : translate("Save")}
                </button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}
    </section>
  );
}

export default FinanceDailyCashPanel;
