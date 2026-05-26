import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { formatDateYMD, getTodayYmd } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FILTERS = Object.freeze({
  dateFrom: getTodayYmd(),
  dateTo: getTodayYmd(),
  ticketNumber: "",
  client: "",
  paymentMethodId: ""
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
  const ticket = item?.ticketNumber ? ` #${item.ticketNumber}` : "";
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
  const base = translate(labels[type] || translateTransactionType(translate, type));
  return ticket && ["ticket_payment", "deposit_ticket_payment", "deposit_ticket_refund", "refund"].includes(type)
    ? `${base}${ticket}`
    : base;
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

function FinanceTransactionsPanel({ onClose }) {
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

  const paymentMethodOptions = useMemo(() => paymentMethods.map((item) => ({
    value: String(item.id),
    label: item.name
  })), [paymentMethods]);

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
          [
            translate("Date"),
            translate("Action"),
            translate("Ticket Number"),
            translate("Client"),
            translate("Client ID"),
            translate("Payment Method"),
            translate("Amount UZS"),
            translate("Cashier"),
            translate("Status")
          ],
          ...rows.map((item) => [
            formatDateTime(item.transactionAt),
            getTransactionActionLabel(translate, item),
            item.ticketNumber || "",
            item.clientName || "",
            item.clientId || "",
            item.paymentMethodName || "",
            Number.parseInt(String(item.amountUzs || 0), 10) || 0,
            item.cashierName || "",
            getTransactionStatusLabel(translate, item.status)
          ])
        ]
      }]);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  const openVoidTransaction = (item) => {
    if (!item || item.status === "voided" || voidingId) return;
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
                <button type="button" className="btn btn-secondary" disabled={Boolean(voidingId)} onClick={closeVoidTransaction}>{translate("Cancel")}</button>
                <button type="submit" className="btn" disabled={Boolean(voidingId)}>{voidingId ? "..." : translate("Confirm")}</button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="all-users-table-scroll">
        <table className="all-users-table finance-transactions-table" aria-label="Finance transactions table">
          <colgroup>
            <col className="finance-transactions-col-date" />
            <col className="finance-transactions-col-action" />
            <col className="finance-transactions-col-ticket" />
            <col className="finance-transactions-col-client" />
            <col className="finance-transactions-col-client-id" />
            <col className="finance-transactions-col-method" />
            <col className="finance-transactions-col-amount" />
            <col className="finance-transactions-col-cashier" />
            <col className="finance-transactions-col-status" />
          </colgroup>
          <thead>
            <tr>
              <th>{translate("Date")}</th>
              <th>{translate("Action")}</th>
              <th>{translate("Ticket Number")}</th>
              <th>{translate("Client")}</th>
              <th>{translate("Client ID")}</th>
              <th>{translate("Payment Method")}</th>
              <th>{translate("Amount UZS")}</th>
              <th>{translate("Cashier")}</th>
              <th>{translate("Status")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="9" className="skel" />
                </tr>
              ))
            ) : items.map((item) => (
              <tr key={String(item.id)}>
                <td>{formatDateTime(item.transactionAt)}</td>
                <td>{getTransactionActionLabel(translate, item)}</td>
                <td>{item.ticketNumber ? `#${item.ticketNumber}` : "-"}</td>
                <td>{item.clientName || "-"}</td>
                <td>{item.clientId || "-"}</td>
                <td>{item.paymentMethodName || translate("Balance")}</td>
                <td>{formatMoney(item.amountUzs)}</td>
                <td>{item.cashierName || "-"}</td>
                <td className="finance-transactions-status-cell">
                  {item.status === "voided" ? (
                    <span className="finance-transaction-status-voided">{translate("Cancelled")}</span>
                  ) : (
                    <button
                      type="button"
                      className="finance-transaction-void-btn"
                      title={translate("Cancel transaction")}
                      aria-label={translate("Cancel transaction")}
                      disabled={voidingId === String(item.id)}
                      onClick={() => openVoidTransaction(item)}
                    >
                      ⓧ
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr><td colSpan="9" className="all-users-state">{translate("No items found.")}</td></tr>
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
