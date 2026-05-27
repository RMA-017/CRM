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
  service: "",
  specialist: "",
  position: "",
  cashier: "",
  paymentMethodId: "",
  transactionType: "",
  transactionStatus: "",
  ticketStatus: ""
});

const REPORT_GROUPS = Object.freeze([
  ["By Day", "byDay"],
  ["By Payment Method", "byPaymentMethod"],
  ["By Service", "byService"],
  ["By Specialist", "bySpecialist"],
  ["By Department", "byDepartment"],
  ["By Client", "byClient"],
  ["By Cashier", "byCashier"]
]);

const TRANSACTION_TYPE_OPTIONS = Object.freeze([
  { value: "", label: "All" },
  { value: "ticket_payment", label: "Ticket Payment" },
  { value: "deposit_ticket_payment", label: "Deposit Ticket Payment" },
  { value: "deposit_in", label: "Deposit In" },
  { value: "deposit_out", label: "Deposit Out" },
  { value: "refund", label: "Refund" },
  { value: "deposit_ticket_refund", label: "Deposit Ticket Refund" },
  { value: "correction", label: "Correction" }
]);

const TICKET_STATUS_OPTIONS = Object.freeze([
  { value: "", label: "All" },
  { value: "issued", label: "Tickets" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "voided", label: "Voided" }
]);

const TRANSACTION_STATUS_OPTIONS = Object.freeze([
  { value: "", label: "Active" },
  { value: "voided", label: "Cancelled" }
]);

function toNumber(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function formatMoney(value) {
  const amount = toNumber(value);
  return amount !== 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function formatDateTime(value) {
  const raw = String(value || "");
  if (!raw) return "-";
  const date = formatDateYMD(raw);
  const timeMatch = raw.match(/T(\d{2}:\d{2})/);
  return timeMatch ? `${date} ${timeMatch[1]}` : date;
}

function makeClientOption(item) {
  const id = String(item?.id ?? item?.clientId ?? "").trim();
  if (!id) return null;
  const label = String(item?.fullName || item?.clientName || `#${id}`).trim() || `#${id}`;
  return { value: id, label };
}

function makeTextOption(value, label = value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return null;
  return {
    value: normalizedValue,
    label: String(label || normalizedValue).trim() || normalizedValue
  };
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
  const base = translate(labels[type] || type || "-");
  return ticket && ["ticket_payment", "deposit_ticket_payment", "deposit_ticket_refund", "refund"].includes(type)
    ? `${base}${ticket}`
    : base;
}

function ReportTable({ title, items, translate }) {
  return (
    <section className="finance-report-section">
      <h4>{translate(title)}</h4>
      <div className="all-users-table-scroll">
        <table className="all-users-table" aria-label={`${title} report table`}>
          <thead>
            <tr>
              <th>{translate("Name")}</th>
              <th>{translate("Amount UZS")}</th>
              <th>{translate("Count")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${title}-${item.id || item.label}`}>
                <td>{item.label || "-"}</td>
                <td>{formatMoney(item.amountUzs)}</td>
                <td>{toNumber(item.count)}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr><td colSpan="3" className="all-users-state">{translate("No items found.")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryCard({ label, value, translate, money = true }) {
  return (
    <div className="finance-summary-card">
      <span>{translate(label)}</span>
      <strong>{money ? formatMoney(value) : toNumber(value)}</strong>
    </div>
  );
}

function FinanceReportsPanel({ onClose }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [report, setReport] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [filterReferences, setFilterReferences] = useState({ services: [], specialists: [], positions: [] });
  const [filterReferencesLoading, setFilterReferencesLoading] = useState(false);
  const [filterClientSearch, setFilterClientSearch] = useState("");
  const [filterClientOptions, setFilterClientOptions] = useState([]);
  const [filterClientSearchBusy, setFilterClientSearchBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);

  const paymentMethodOptions = useMemo(() => paymentMethods.map((item) => ({
    value: String(item.id),
    label: item.name
  })), [paymentMethods]);

  const serviceOptions = useMemo(() => {
    const options = (Array.isArray(filterReferences.services) ? filterReferences.services : [])
      .map((item) => makeTextOption(
        item.name,
        item.name || item.id
      ))
      .filter(Boolean);
    return [{ value: "", label: translate("All") }, ...options];
  }, [filterReferences.services, translate]);

  const specialistOptions = useMemo(() => {
    const options = (Array.isArray(filterReferences.specialists) ? filterReferences.specialists : [])
      .map((item) => makeTextOption(
        item.fullName,
        `${item.fullName || item.id}${item.positionLabel ? ` - ${item.positionLabel}` : ""}`
      ))
      .filter(Boolean);
    return [{ value: "", label: translate("All") }, ...options];
  }, [filterReferences.specialists, translate]);

  const positionOptions = useMemo(() => {
    const options = (Array.isArray(filterReferences.positions) ? filterReferences.positions : [])
      .map((item) => makeTextOption(item.label))
      .filter(Boolean);
    return [{ value: "", label: translate("All") }, ...options];
  }, [filterReferences.positions, translate]);

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

  const loadReports = useCallback(async (nextFilters = EMPTY_FILTERS) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      Object.entries(nextFilters).forEach(([key, value]) => {
        const normalized = String(value || "").trim();
        if (normalized) {
          query.set(key, normalized);
        }
      });
      const response = await apiFetch(`/api/finance/reports?${query.toString()}`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Failed to load finance reports.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      setReport(data || {});
      setMessage("");
    } catch {
      setMessage("Failed to load finance reports.");
      window.alert?.(translate("Failed to load finance reports."));
    } finally {
      setLoading(false);
    }
  }, [translate]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void loadFilterReferences();
    void loadPaymentMethods();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [filtersOpen, loadFilterReferences, loadPaymentMethods]);

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
    setHasSearched(true);
    setFiltersOpen(false);
    void loadReports(filters);
  };

  const exportReports = async () => {
    if (exporting || !hasSearched) return;
    setExporting(true);
    try {
      let nextReport = report;
      if (!nextReport) {
        const query = new URLSearchParams();
        Object.entries(appliedFilters).forEach(([key, value]) => {
          const normalized = String(value || "").trim();
          if (normalized) {
            query.set(key, normalized);
          }
        });
        const response = await apiFetch(`/api/finance/reports?${query.toString()}`);
        const data = await readApiResponseData(response);
        if (!response.ok) {
          throw new Error(data?.message || "Export failed.");
        }
        nextReport = data || {};
      }
      const nextSummary = nextReport?.summary || {};
      const detailRows = Array.isArray(nextReport?.details) ? nextReport.details : [];
      const reportSheets = [
        {
          name: translate("Reports"),
          rows: [
            [translate("Name"), translate("Amount UZS")],
            [translate("Net Total"), toNumber(nextSummary.netTotalUzs)],
            [translate("Ticket Revenue"), toNumber(nextSummary.ticketRevenueUzs)],
            [translate("Cash In"), toNumber(nextSummary.cashInUzs)],
            [translate("Cash Out"), toNumber(nextSummary.cashOutUzs)],
            [translate("Cash Net"), toNumber(nextSummary.cashNetUzs)],
            [translate("Deposit In"), toNumber(nextSummary.depositInUzs)],
            [translate("Deposit Out"), toNumber(nextSummary.depositOutUzs)],
            [translate("Refunds"), toNumber(nextSummary.refundUzs)],
            [translate("Transactions"), toNumber(nextSummary.transactionCount)],
            [translate("Tickets"), toNumber(nextSummary.ticketCount)]
          ]
        },
        ...REPORT_GROUPS.map(([title, key]) => ({
          name: translate(title),
          rows: [
            [translate("Name"), translate("Amount UZS"), translate("Count")],
            ...(Array.isArray(nextReport?.[key]) ? nextReport[key] : []).map((item) => [
              item.label || "",
              toNumber(item.amountUzs),
              toNumber(item.count)
            ])
          ]
        })),
        {
          name: translate("Details"),
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
            ...detailRows.map((item) => [
              formatDateTime(item.transactionAt),
              getTransactionActionLabel(translate, item),
              item.ticketNumber || "",
              item.clientName || "",
              item.clientId || "",
              item.paymentMethodName || translate("Balance"),
              toNumber(item.signedAmountUzs),
              item.cashierName || "",
              item.status === "voided" ? translate("Cancelled") : translate("Active")
            ])
          ]
        }
      ];
      exportExcelWorkbook(buildExportFilename("finance-reports"), reportSheets);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  const summary = report?.summary || {};
  const details = Array.isArray(report?.details) ? report.details : [];

  return (
    <section id="financeReportsPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-reports-panel">
      <div className="all-users-head">
        <h3>{translate("Reports")}</h3>
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
            disabled={!hasSearched || loading || exporting}
            onClick={exportReports}
          >
            <span className="finance-head-icon finance-head-icon-export" aria-hidden="true" />
          </button>
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close finance reports panel")} onClick={onClose}>
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
          <div id="financeReportsFilterModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-reports-filter-modal">
            <h3>{translate("Filter")}</h3>
            <form className="auth-form" onSubmit={applyFilters}>
              <div className="all-users-edit-fields settings-filter-grid finance-reports-filter-grid">
                <div className="finance-reports-filter-date-row">
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
                  <span>{translate("Cashier")}</span>
                  <input
                    type="search"
                    value={filters.cashier}
                    onChange={(event) => setFilters((current) => ({ ...current, cashier: event.currentTarget.value }))}
                  />
                </label>
                <label className="field finance-reports-filter-wide-field">
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
                    options={serviceOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search")}
                    searchThreshold={8}
                    menuPortal
                    disabled={filterReferencesLoading}
                    onChange={(value) => setFilters((current) => ({ ...current, service: value }))}
                  />
                </label>
                <label className="field">
                  <span>{translate("Department")}</span>
                  <CustomSelect
                    value={filters.position}
                    options={positionOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search")}
                    searchThreshold={8}
                    menuPortal
                    disabled={filterReferencesLoading}
                    onChange={(value) => setFilters((current) => ({ ...current, position: value }))}
                  />
                </label>
                <label className="field finance-reports-filter-wide-field">
                  <span>{translate("Specialist")}</span>
                  <CustomSelect
                    value={filters.specialist}
                    options={specialistOptions}
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
                  <span>{translate("Payment Method")}</span>
                  <CustomSelect
                    value={filters.paymentMethodId}
                    options={[{ value: "", label: translate("All") }, ...paymentMethodOptions]}
                    menuPortal
                    onChange={(value) => setFilters((current) => ({ ...current, paymentMethodId: value }))}
                  />
                </label>
                <label className="field">
                  <span>{translate("Operation Type")}</span>
                  <CustomSelect
                    value={filters.transactionType}
                    options={TRANSACTION_TYPE_OPTIONS.map((option) => ({ ...option, label: translate(option.label) }))}
                    menuPortal
                    onChange={(value) => setFilters((current) => ({ ...current, transactionType: value }))}
                  />
                </label>
                <label className="field">
                  <span>{translate("Ticket Status")}</span>
                  <CustomSelect
                    value={filters.ticketStatus}
                    options={TICKET_STATUS_OPTIONS.map((option) => ({ ...option, label: translate(option.label) }))}
                    menuPortal
                    onChange={(value) => setFilters((current) => ({ ...current, ticketStatus: value }))}
                  />
                </label>
                <label className="field">
                  <span>{translate("Operation Status")}</span>
                  <CustomSelect
                    value={filters.transactionStatus}
                    options={TRANSACTION_STATUS_OPTIONS.map((option) => ({ ...option, label: translate(option.label) }))}
                    menuPortal
                    onChange={(value) => setFilters((current) => ({ ...current, transactionStatus: value }))}
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
      {loading ? <p className="all-users-state">{translate("Loading...")}</p> : null}

      {hasSearched && !loading ? (
        <>
          <div className="finance-summary-grid finance-reports-summary-grid">
            <SummaryCard label="Net Total" value={summary.netTotalUzs} translate={translate} />
            <SummaryCard label="Ticket Revenue" value={summary.ticketRevenueUzs ?? summary.amountUzs} translate={translate} />
            <SummaryCard label="Cash In" value={summary.cashInUzs} translate={translate} />
            <SummaryCard label="Cash Out" value={summary.cashOutUzs} translate={translate} />
            <SummaryCard label="Cash Net" value={summary.cashNetUzs} translate={translate} />
            <SummaryCard label="Deposit In" value={summary.depositInUzs} translate={translate} />
            <SummaryCard label="Deposit Out" value={summary.depositOutUzs} translate={translate} />
            <SummaryCard label="Refunds" value={summary.refundUzs} translate={translate} />
            <SummaryCard label="Transactions" value={summary.transactionCount} translate={translate} money={false} />
            <SummaryCard label="Tickets" value={summary.ticketCount} translate={translate} money={false} />
          </div>

          <div className="finance-report-grid">
            {REPORT_GROUPS.map(([title, key]) => (
              <ReportTable key={key} title={title} items={Array.isArray(report?.[key]) ? report[key] : []} translate={translate} />
            ))}
          </div>

          <section className="finance-report-section finance-report-details-section">
            <h4>{translate("Details")}</h4>
            <div className="all-users-table-scroll">
              <table className="all-users-table finance-reports-details-table" aria-label={translate("Finance report details")}>
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
                  {details.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{formatDateTime(item.transactionAt)}</td>
                      <td>{getTransactionActionLabel(translate, item)}</td>
                      <td>{item.ticketNumber ? `#${item.ticketNumber}` : "-"}</td>
                      <td>{item.clientName || "-"}</td>
                      <td>{item.clientId || "-"}</td>
                      <td>{item.paymentMethodName || translate("Balance")}</td>
                      <td className="finance-reports-amount-cell">{formatMoney(item.signedAmountUzs)}</td>
                      <td>{item.cashierName || "-"}</td>
                      <td>{item.status === "voided" ? translate("Cancelled") : translate("Active")}</td>
                    </tr>
                  ))}
                  {details.length === 0 ? (
                    <tr><td colSpan="9" className="all-users-state">{translate("No items found.")}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

export default FinanceReportsPanel;
