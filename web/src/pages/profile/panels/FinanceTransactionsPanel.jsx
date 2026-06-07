import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { formatDateTimeTashkent, getTodayYmd } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FILTERS = Object.freeze({
  dateFrom: getTodayYmd(),
  dateTo: getTodayYmd(),
  ticketNumber: "",
  client: "",
  paymentMethodId: ""
});

const FINANCE_TRANSACTION_COLUMNS_STORAGE_KEY = "aaron_crm_finance_transaction_columns";
const DEFAULT_FINANCE_TRANSACTION_COLUMN_IDS = Object.freeze([
  "date",
  "action",
  "ticketNumber",
  "client",
  "clientId",
  "paymentMethod",
  "amount",
  "cashier",
  "status"
]);

function loadStoredTransactionColumnIds() {
  if (typeof window === "undefined") return [...DEFAULT_FINANCE_TRANSACTION_COLUMN_IDS];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FINANCE_TRANSACTION_COLUMNS_STORAGE_KEY) || "[]");
    const stored = Array.isArray(parsed) ? parsed : [];
    const allowed = new Set(DEFAULT_FINANCE_TRANSACTION_COLUMN_IDS);
    const normalized = DEFAULT_FINANCE_TRANSACTION_COLUMN_IDS.filter((id) => stored.includes(id) && allowed.has(id));
    return normalized.length > 0 ? normalized : [...DEFAULT_FINANCE_TRANSACTION_COLUMN_IDS];
  } catch {
    return [...DEFAULT_FINANCE_TRANSACTION_COLUMN_IDS];
  }
}

function storeTransactionColumnIds(columnIds) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FINANCE_TRANSACTION_COLUMNS_STORAGE_KEY, JSON.stringify(columnIds));
  } catch {
    // Ignore storage failures; the current session state still works.
  }
}

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount > 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function translateTransactionType(translate, type) {
  const labels = {
    ticket_payment: "Ticket Payment",
    deposit_in: "Deposit In",
    deposit_out: "Deposit Out",
    deposit_ticket_payment: "Deposit Ticket Payment",
    deposit_ticket_refund: "Deposit Ticket Refund",
    refund: "Refund",
    correction: "Correction"
  };
  return translate(labels[String(type || "")] || String(type || "-"));
}

function getTransactionActionLabel(translate, item) {
  const labels = {
    ticket_payment: "Ticket payment",
    deposit_in: "Client balance top-up",
    deposit_out: "Client balance withdrawal",
    deposit_ticket_payment: "Client balance ticket payment",
    deposit_ticket_refund: "Client balance ticket refund",
    refund: "Ticket refund",
    correction: "Balance correction"
  };
  const type = String(item?.transactionType || "");
  return translate(labels[type] || translateTransactionType(translate, type));
}

function getTransactionStatusLabel(translate, status) {
  return String(status || "") === "voided" ? translate("Cancelled") : translate("Active");
}

function makeClientOption(item) {
  const id = String(item?.id ?? item?.clientId ?? "").trim();
  if (!id) return null;
  const label = String(item?.fullName || item?.clientName || `#${id}`).trim() || `#${id}`;
  return { value: id, label };
}

function FinanceTransactionsPanel({ onClose, canPayFinanceCashier = false }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [items, setItems] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterClientSearch, setFilterClientSearch] = useState("");
  const [filterClientOptions, setFilterClientOptions] = useState([]);
  const [filterClientSearchBusy, setFilterClientSearchBusy] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidingId, setVoidingId] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState(() => loadStoredTransactionColumnIds());

  const paymentMethodOptions = useMemo(() => paymentMethods.map((item) => ({
    value: String(item.id),
    label: item.name
  })), [paymentMethods]);

  const transactionColumns = [
    {
      id: "date",
      label: "Date",
      className: "finance-transactions-col-date",
      render: (item) => formatDateTimeTashkent(item.transactionAt),
      exportValue: (item) => formatDateTimeTashkent(item.transactionAt)
    },
    {
      id: "action",
      label: "Action",
      className: "finance-transactions-col-action",
      render: (item) => getTransactionActionLabel(translate, item),
      exportValue: (item) => getTransactionActionLabel(translate, item)
    },
    {
      id: "ticketNumber",
      label: "Ticket Number",
      className: "finance-transactions-col-ticket",
      render: (item) => item.ticketNumber ? `#${item.ticketNumber}` : "-",
      exportValue: (item) => item.ticketNumber || ""
    },
    {
      id: "client",
      label: "Client",
      className: "finance-transactions-col-client",
      render: (item) => item.clientName || "-",
      exportValue: (item) => item.clientName || ""
    },
    {
      id: "clientId",
      label: "Client ID",
      className: "finance-transactions-col-client-id",
      render: (item) => item.clientId || "-",
      exportValue: (item) => item.clientId || ""
    },
    {
      id: "paymentMethod",
      label: "Payment Method",
      className: "finance-transactions-col-method",
      render: (item) => item.paymentMethodName || translate("Balance"),
      exportValue: (item) => item.paymentMethodName || translate("Balance")
    },
    {
      id: "amount",
      label: "Amount UZS",
      className: "finance-transactions-col-amount",
      render: (item) => formatMoney(item.amountUzs),
      exportValue: (item) => Number.parseInt(String(item.amountUzs || 0), 10) || 0
    },
    {
      id: "cashier",
      label: "Cashier",
      className: "finance-transactions-col-cashier",
      render: (item) => item.cashierName || "-",
      exportValue: (item) => item.cashierName || ""
    },
    {
      id: "status",
      label: "Status",
      className: "finance-transactions-col-status",
      render: (item) => (
        <span className="finance-transactions-status-cell">
          {item.status === "voided" ? (
            <span className="finance-transaction-status-voided">{translate("Cancelled")}</span>
          ) : !canPayFinanceCashier ? (
            <span className="finance-transaction-status-active">{translate("Active")}</span>
          ) : (
            <button
              type="button"
              className="table-action-btn table-action-btn-danger services-settings-action-btn finance-transaction-void-btn"
              title={translate("Cancel transaction")}
              aria-label={translate("Cancel transaction")}
              disabled={voidingId === String(item.id)}
              onClick={() => openVoidTransaction(item)}
            >
              {voidingId === String(item.id) ? "..." : (
                <span className="services-settings-trash-icon" aria-hidden="true" />
              )}
            </button>
          )}
        </span>
      ),
      exportValue: (item) => getTransactionStatusLabel(translate, item.status)
    }
  ];
  const visibleColumns = transactionColumns.filter((column) => visibleColumnIds.includes(column.id));
  const visibleColumnCount = Math.max(visibleColumns.length, 1);

  const toggleColumnVisibility = (columnId) => {
    setVisibleColumnIds((current) => {
      const currentIds = Array.isArray(current) ? current : DEFAULT_FINANCE_TRANSACTION_COLUMN_IDS;
      const nextIds = new Set(currentIds);
      if (nextIds.has(columnId)) {
        if (nextIds.size <= 1) return currentIds;
        nextIds.delete(columnId);
      } else if (transactionColumns.some((column) => column.id === columnId)) {
        nextIds.add(columnId);
      }
      const next = transactionColumns.map((column) => column.id).filter((id) => nextIds.has(id));
      if (next.length > 0) {
        storeTransactionColumnIds(next);
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
      if (!response.ok) return;
      setPaymentMethods(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setPaymentMethods([]);
    }
  }, []);

  const loadTransactions = useCallback(async (nextPage = 1, nextFilters = EMPTY_FILTERS) => {
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
      const response = await apiFetch(`/api/finance/transactions?${query.toString()}`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Failed to load transactions.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
      setPage(Number.parseInt(String(data?.page || nextPage), 10) || 1);
      setTotalPages(Number.parseInt(String(data?.totalPages || 1), 10) || 1);
      setMessage("");
    } catch {
      setMessage("Failed to load transactions.");
      window.alert?.(translate("Failed to load transactions."));
    } finally {
      setLoading(false);
    }
  }, [translate]);

  useEffect(() => {
    void loadPaymentMethods();
    void loadTransactions(1, EMPTY_FILTERS);
  }, [loadPaymentMethods, loadTransactions]);

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
    setAppliedFilters(filters);
    setFiltersOpen(false);
    void loadTransactions(1, filters);
  };

  const fetchAllTransactions = async () => {
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
      const response = await apiFetch(`/api/finance/transactions?${query.toString()}`);
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

  const exportTransactions = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = await fetchAllTransactions();
      exportExcelWorkbook(buildExportFilename("finance-transactions"), [{
        name: translate("Transactions"),
        rows: [
          visibleColumns.map((column) => translate(column.label)),
          ...rows.map((item) => visibleColumns.map((column) => column.exportValue(item)))
        ]
      }]);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  const openVoidTransaction = (item) => {
    if (!canPayFinanceCashier || !item || item.status === "voided" || voidingId) return;
    setVoidTarget(item);
    setVoidReason("");
  };

  const closeVoidTransaction = () => {
    if (voidingId) return;
    setVoidTarget(null);
    setVoidReason("");
  };

  const submitVoidTransaction = async (event) => {
    event.preventDefault();
    if (!canPayFinanceCashier) return;
    const id = String(voidTarget?.id || "");
    const reason = voidReason.trim();
    if (!id || voidingId) return;
    if (reason.length < 3) {
      window.alert?.(translate("Cancellation reason is required."));
      return;
    }
    setVoidingId(id);
    try {
      const response = await apiFetch(`/api/finance/transactions/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Transaction cancellation failed."));
        return;
      }
      closeVoidTransaction();
      void loadTransactions(page, appliedFilters);
    } catch {
      window.alert?.(translate("Transaction cancellation failed."));
    } finally {
      setVoidingId("");
    }
  };

  return (
    <section id="financeTransactionsPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-transactions-panel">
      <div className="all-users-head">
        <h3>{translate("Transactions")}</h3>
        <div className="all-users-head-actions">
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
            onClick={exportTransactions}
          >
            <span className="finance-head-icon finance-head-icon-export" aria-hidden="true" />
          </button>
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close transactions panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      {columnsOpen && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close")}
            onClick={closeColumns}
          />
          <div id="financeTransactionColumnsModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-ticket-columns-modal finance-transaction-columns-modal">
            <h3>{translate("Table columns")}</h3>
            <div className="finance-ticket-columns-list">
              {transactionColumns.map((column) => {
                const checked = visibleColumnIds.includes(column.id);
                return (
                  <label className="finance-ticket-column-option" key={column.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checked && visibleColumnIds.length <= 1}
                      onChange={() => toggleColumnVisibility(column.id)}
                    />
                    <span>{translate(column.label)}</span>
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
          <div id="financeTransactionsFilterModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-transactions-filter-modal">
            <h3>{translate("Filter")}</h3>
            <form className="auth-form" onSubmit={applyFilters}>
              <div className="all-users-edit-fields settings-filter-grid finance-transactions-filter-grid">
                <div className="finance-transactions-filter-date-row">
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
                  <span>{translate("Ticket Number")}</span>
                  <input
                    type="text"
                    value={filters.ticketNumber}
                    onChange={(event) => setFilters((current) => ({ ...current, ticketNumber: event.currentTarget.value }))}
                  />
                </label>
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

      {voidTarget && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close")}
            onClick={closeVoidTransaction}
          />
          <div id="financeTransactionVoidModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-transaction-void-modal">
            <h3>{translate("Cancel transaction")}</h3>
            <form className="auth-form" onSubmit={submitVoidTransaction}>
              <div className="all-users-edit-fields finance-transaction-void-fields">
                <label className="field">
                  <span>{translate("Cancellation reason")}</span>
                  <textarea
                    value={voidReason}
                    rows={3}
                    maxLength={255}
                    required
                    onChange={(event) => setVoidReason(event.currentTarget.value)}
                  />
                </label>
              </div>
              <div className="edit-actions">
                <button type="submit" className="btn" disabled={Boolean(voidingId)}>{voidingId ? "..." : translate("Void")}</button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="all-users-table-scroll">
        <table className="all-users-table finance-transactions-table" aria-label="Finance transactions table">
          <colgroup>
            {visibleColumns.map((column) => (
              <col key={column.id} className={column.className} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.id} className={column.className}>{translate(column.label)}</th>
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
            ) : items.map((item) => (
              <tr key={String(item.id)}>
                {visibleColumns.map((column) => (
                  <td
                    key={column.id}
                    className={[
                      column.className,
                      column.id === "amount" ? "finance-transactions-amount-cell" : ""
                    ].filter(Boolean).join(" ")}
                  >
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr><td colSpan={visibleColumnCount} className="all-users-state">{translate("No items found.")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <button
          type="button"
          className="table-action-btn"
          disabled={loading || page <= 1}
          onClick={() => loadTransactions(page - 1, appliedFilters)}
        >
          {translate("Previous")}
        </button>
        <span>{`${page} / ${totalPages}`}</span>
        <button
          type="button"
          className="table-action-btn"
          disabled={loading || page >= totalPages}
          onClick={() => loadTransactions(page + 1, appliedFilters)}
        >
          {translate("Next")}
        </button>
      </div>
    </section>
  );
}

export default FinanceTransactionsPanel;
