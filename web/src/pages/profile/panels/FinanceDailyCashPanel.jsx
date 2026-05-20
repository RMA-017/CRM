import { useCallback, useEffect, useMemo, useState } from "react";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { formatDateYMD, getTodayYmd } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FILTERS = Object.freeze({
  dateFrom: getTodayYmd(),
  dateTo: getTodayYmd(),
  cashier: "",
  client: "",
  service: "",
  paymentMethodId: ""
});

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount !== 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
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
    refund: "Refund",
    correction: "Correction"
  };
  return translate(labels[String(type || "")] || String(type || "-"));
}

function FinanceDailyCashPanel({ onClose }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ totalInUzs: 0, totalOutUzs: 0, netUzs: 0, transactionCount: 0 });
  const [paymentSummary, setPaymentSummary] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);

  const paymentMethodOptions = useMemo(() => paymentMethods.map((item) => ({
    value: String(item.id),
    label: item.name
  })), [paymentMethods]);

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
      setTotal(Number.parseInt(String(data?.total || 0), 10) || 0);
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
    void loadDailyCash(1, EMPTY_FILTERS);
  }, [loadDailyCash, loadPaymentMethods]);

  const applyFilters = (event) => {
    event.preventDefault();
    setAppliedFilters(filters);
    void loadDailyCash(1, filters);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    void loadDailyCash(1, EMPTY_FILTERS);
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
            [
              translate("Date"),
              translate("Cashier"),
              translate("Client"),
              translate("Ticket Number"),
              translate("Service"),
              translate("Payment Method"),
              translate("Amount UZS"),
              translate("Type")
            ],
            ...result.items.map((item) => [
              formatDateTime(item.transactionAt),
              item.cashierName || "",
              item.clientName || "",
              item.ticketNumber || "",
              item.serviceName || "",
              item.paymentMethodName || "",
              Number.parseInt(String(item.amountUzs || 0), 10) || 0,
              translateTransactionType(translate, item.transactionType)
            ])
          ]
        },
        {
          name: translate("Reports"),
          rows: [
            [translate("Name"), translate("Amount UZS")],
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
          <button type="button" className="table-action-btn" disabled={loading || exporting} onClick={exportDailyCash}>
            {translate("Export Excel")}
          </button>
          <button type="button" className="table-action-btn" onClick={() => loadDailyCash(page, appliedFilters)}>
            {translate("Refresh")}
          </button>
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close daily cash panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <form className="settings-filter-grid" onSubmit={applyFilters}>
        <label className="field">
          <span>{translate("Date From")}</span>
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.currentTarget.value }))} />
        </label>
        <label className="field">
          <span>{translate("Date To")}</span>
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.currentTarget.value }))} />
        </label>
        <label className="field">
          <span>{translate("Cashier")}</span>
          <input type="search" value={filters.cashier} onChange={(event) => setFilters((current) => ({ ...current, cashier: event.currentTarget.value }))} />
        </label>
        <label className="field">
          <span>{translate("Client")}</span>
          <input type="search" value={filters.client} onChange={(event) => setFilters((current) => ({ ...current, client: event.currentTarget.value }))} />
        </label>
        <label className="field">
          <span>{translate("Service")}</span>
          <input type="search" value={filters.service} onChange={(event) => setFilters((current) => ({ ...current, service: event.currentTarget.value }))} />
        </label>
        <label className="field">
          <span>{translate("Payment Method")}</span>
          <CustomSelect
            value={filters.paymentMethodId}
            options={[{ value: "", label: translate("All") }, ...paymentMethodOptions]}
            onChange={(value) => setFilters((current) => ({ ...current, paymentMethodId: value }))}
          />
        </label>
        <div className="settings-filter-actions">
          <button type="submit" className="table-action-btn" disabled={loading}>{translate("Search")}</button>
          <button type="button" className="table-action-btn" disabled={loading} onClick={resetFilters}>{translate("Reset")}</button>
        </div>
      </form>

      <div className="finance-summary-grid">
        <div className="finance-summary-card">
          <span>{translate("Total In")}</span>
          <strong>{formatMoney(summary.totalInUzs)}</strong>
        </div>
        <div className="finance-summary-card">
          <span>{translate("Total Out")}</span>
          <strong>{formatMoney(summary.totalOutUzs)}</strong>
        </div>
        <div className="finance-summary-card">
          <span>{translate("Net Total")}</span>
          <strong>{formatMoney(summary.netUzs)}</strong>
        </div>
        <div className="finance-summary-card">
          <span>{translate("Transactions")}</span>
          <strong>{Number.parseInt(String(summary.transactionCount || 0), 10) || 0}</strong>
        </div>
      </div>

      <div className="finance-payment-summary" hidden={paymentSummary.length === 0}>
        {paymentSummary.map((item) => (
          <span key={`${item.paymentMethodId || "none"}-${item.paymentMethodName}`}>
            {`${item.paymentMethodName || "-"}: ${formatMoney(item.netUzs)}`}
          </span>
        ))}
      </div>

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>
      <p className="all-users-state">{`${translate("Total")}: ${total}`}</p>

      <div className="all-users-table-scroll">
        <table className="all-users-table" aria-label="Finance daily cash table">
          <thead>
            <tr>
              <th>{translate("Date")}</th>
              <th>{translate("Cashier")}</th>
              <th>{translate("Client")}</th>
              <th>{translate("Ticket Number")}</th>
              <th>{translate("Service")}</th>
              <th>{translate("Payment Method")}</th>
              <th>{translate("Amount UZS")}</th>
              <th>{translate("Type")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="8" className="skel" />
                </tr>
              ))
            ) : items.map((item) => (
              <tr key={String(item.id)}>
                <td>{formatDateTime(item.transactionAt)}</td>
                <td>{item.cashierName || "-"}</td>
                <td>{item.clientName || "-"}</td>
                <td>{item.ticketNumber ? `#${item.ticketNumber}` : "-"}</td>
                <td>{item.serviceName || "-"}</td>
                <td>{item.paymentMethodName || "-"}</td>
                <td>{formatMoney(item.amountUzs)}</td>
                <td>{translateTransactionType(translate, item.transactionType)}</td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr><td colSpan="8" className="all-users-state">{translate("No items found.")}</td></tr>
            ) : null}
          </tbody>
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
    </section>
  );
}

export default FinanceDailyCashPanel;
