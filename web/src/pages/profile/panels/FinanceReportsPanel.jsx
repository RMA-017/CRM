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

const REPORT_COLUMN_OPTIONS = Object.freeze([
  { key: "date", label: "Date" },
  { key: "ticketNumber", label: "Ticket Number" },
  { key: "client", label: "Client" },
  { key: "clientId", label: "Client ID" },
  { key: "service", label: "Service" },
  { key: "specialist", label: "Specialist" },
  { key: "department", label: "Department" },
  { key: "cashier", label: "Cashier" },
  { key: "paymentMethod", label: "Payment Method" },
  { key: "amount", label: "Amount UZS" },
  { key: "ticketSubtotal", label: "Subtotal" },
  { key: "ticketDiscount", label: "Discount" },
  { key: "ticketToPay", label: "To Pay" },
  { key: "ticketPaid", label: "Paid Amount" },
  { key: "ticketRemaining", label: "Remaining Amount" },
  { key: "ticketClosed", label: "Ticket Closed" },
  { key: "operationType", label: "Operation Type" },
  { key: "ticketStatus", label: "Ticket Status" },
  { key: "operationStatus", label: "Operation Status" }
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

function getTicketStatusLabel(translate, value) {
  const status = String(value || "").trim();
  const labels = {
    issued: "Tickets",
    unpaid: "Unpaid",
    paid: "Paid",
    voided: "Voided"
  };
  return status ? translate(labels[status] || status) : "-";
}

function getReportColumnValue(columnKey, item, translate, forExport = false) {
  const hasTicket = Boolean(item.ticketId || item.ticketNumber);
  const ticketNumberValue = (field) => {
    if (!hasTicket) return forExport ? "" : "-";
    return forExport ? toNumber(item[field]) : formatMoney(item[field]);
  };
  switch (columnKey) {
    case "date":
      return formatDateTime(item.transactionAt);
    case "ticketNumber":
      return forExport ? (item.ticketNumber || "") : (item.ticketNumber ? `#${item.ticketNumber}` : "-");
    case "client":
      return item.clientName || "-";
    case "clientId":
      return item.clientId || "-";
    case "service":
      return item.serviceName || "-";
    case "specialist":
      return item.specialistName || "-";
    case "department":
      return item.positionLabel || "-";
    case "cashier":
      return item.cashierName || "-";
    case "paymentMethod":
      return item.paymentMethodName || translate("Balance");
    case "amount":
      return forExport ? toNumber(item.signedAmountUzs) : formatMoney(item.signedAmountUzs);
    case "ticketSubtotal":
      return ticketNumberValue("ticketSubtotalUzs");
    case "ticketDiscount":
      return ticketNumberValue("ticketDiscountUzs");
    case "ticketToPay":
      return ticketNumberValue("ticketTotalUzs");
    case "ticketPaid":
      return ticketNumberValue("ticketPaidUzs");
    case "ticketRemaining":
      return ticketNumberValue("ticketRemainingUzs");
    case "ticketClosed":
      if (!hasTicket) return forExport ? "" : "-";
      return toNumber(item.ticketTotalUzs) > 0 && toNumber(item.ticketPaidUzs) >= toNumber(item.ticketTotalUzs)
        ? translate("Yes")
        : translate("No");
    case "operationType":
      return getTransactionActionLabel(translate, item);
    case "ticketStatus":
      return getTicketStatusLabel(translate, item.ticketStatus);
    case "operationStatus":
      return item.status === "voided" ? translate("Cancelled") : translate("Active");
    default:
      return "-";
  }
}

function getReportColumnClass(columnKey) {
  if (["amount", "ticketSubtotal", "ticketDiscount", "ticketToPay", "ticketPaid", "ticketRemaining"].includes(columnKey)) {
    return "finance-reports-amount-cell";
  }
  if (["ticketNumber", "clientId", "ticketStatus", "operationStatus", "ticketClosed"].includes(columnKey)) {
    return "finance-reports-center-cell";
  }
  return "";
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
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [appliedColumns, setAppliedColumns] = useState([]);
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

  const selectedColumnSet = useMemo(() => new Set(selectedColumns), [selectedColumns]);

  const appliedColumnDefinitions = useMemo(() => (
    appliedColumns
      .map((key) => REPORT_COLUMN_OPTIONS.find((item) => item.key === key))
      .filter(Boolean)
  ), [appliedColumns]);

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
    if (selectedColumns.length === 0) {
      window.alert?.(translate("Select at least one column."));
      return;
    }
    setAppliedFilters(filters);
    setAppliedColumns(selectedColumns);
    setHasSearched(true);
    setFiltersOpen(false);
    void loadReports(filters);
  };

  const toggleReportColumn = (columnKey) => {
    setSelectedColumns((current) => (
      current.includes(columnKey)
        ? current.filter((item) => item !== columnKey)
        : [...current, columnKey]
    ));
  };

  const exportReports = async () => {
    if (exporting || !hasSearched) return;
    const exportColumns = appliedColumnDefinitions;
    if (exportColumns.length === 0) {
      window.alert?.(translate("Select at least one column."));
      return;
    }
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
      const detailRows = Array.isArray(nextReport?.details) ? nextReport.details : [];
      const reportSheets = [
        {
          name: translate("Details"),
          rows: [
            exportColumns.map((column) => translate(column.label)),
            ...detailRows.map((item) => exportColumns.map((column) => (
              getReportColumnValue(column.key, item, translate, true)
            )))
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

  const details = Array.isArray(report?.details) ? report.details : [];
  const detailsTableMinWidth = Math.max(620, appliedColumnDefinitions.length * 148);

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
                <div className="finance-reports-column-picker">
                  <span className="finance-reports-column-picker-title">{translate("Columns")}</span>
                  <div className="finance-reports-column-picker-grid">
                    {REPORT_COLUMN_OPTIONS.map((column) => (
                      <label key={column.key} className="settings-checkbox settings-checkbox-inline finance-reports-column-option">
                        <input
                          type="checkbox"
                          checked={selectedColumnSet.has(column.key)}
                          onChange={() => toggleReportColumn(column.key)}
                        />
                        <span>{translate(column.label)}</span>
                      </label>
                    ))}
                  </div>
                </div>
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
        <section className="finance-report-section finance-report-details-section">
          <h4>{translate("Details")}</h4>
          <div className="all-users-table-scroll">
            <table
              className="all-users-table finance-reports-details-table"
              style={{ minWidth: `${detailsTableMinWidth}px` }}
              aria-label={translate("Finance report details")}
            >
              <thead>
                <tr>
                  {appliedColumnDefinitions.map((column) => (
                    <th key={column.key} className={`finance-reports-col-${column.key}`}>{translate(column.label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {details.map((item) => (
                  <tr key={String(item.id)}>
                    {appliedColumnDefinitions.map((column) => (
                      <td key={`${item.id}-${column.key}`} className={`finance-reports-col-${column.key} ${getReportColumnClass(column.key)}`}>
                        {getReportColumnValue(column.key, item, translate)}
                      </td>
                    ))}
                  </tr>
                ))}
                {details.length === 0 ? (
                  <tr><td colSpan={Math.max(appliedColumnDefinitions.length, 1)} className="all-users-state">{translate("No items found.")}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}

export default FinanceReportsPanel;
