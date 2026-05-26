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
            translate("Payment Method"),
            translate("Client"),
            translate("Amount UZS"),
            translate("Type"),
            translate("Ticket Number"),
            translate("Cashier")
          ],
          ...rows.map((item) => [
            formatDateTime(item.transactionAt),
            item.paymentMethodName || "",
            item.clientName || "",
            Number.parseInt(String(item.amountUzs || 0), 10) || 0,
            translateTransactionType(translate, item.transactionType),
            item.ticketNumber || "",
            item.cashierName || ""
          ])
        ]
      }]);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setExporting(false);
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
                  <input
                    type="search"
                    value={filters.client}
                    onChange={(event) => setFilters((current) => ({ ...current, client: event.currentTarget.value }))}
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
        <table className="all-users-table" aria-label="Finance transactions table">
          <thead>
            <tr>
              <th>{translate("Date")}</th>
              <th>{translate("Payment Method")}</th>
              <th>{translate("Client")}</th>
              <th>{translate("Amount UZS")}</th>
              <th>{translate("Type")}</th>
              <th>{translate("Ticket Number")}</th>
              <th>{translate("Cashier")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="7" className="skel" />
                </tr>
              ))
            ) : items.map((item) => (
              <tr key={String(item.id)}>
                <td>{formatDateTime(item.transactionAt)}</td>
                <td>{item.paymentMethodName || "-"}</td>
                <td>{item.clientName || "-"}</td>
                <td>{formatMoney(item.amountUzs)}</td>
                <td>{translateTransactionType(translate, item.transactionType)}</td>
                <td>{item.ticketNumber ? `#${item.ticketNumber}` : "-"}</td>
                <td>{item.cashierName || "-"}</td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr><td colSpan="7" className="all-users-state">{translate("No items found.")}</td></tr>
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
