import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { formatDateYMD } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FILTERS = Object.freeze({
  ticketCreatedFrom: "",
  ticketCreatedTo: "",
  ticketDateFrom: "",
  ticketDateTo: "",
  paymentDateFrom: "",
  paymentDateTo: "",
  ticketNumber: "",
  paymentMethodId: "",
  cashier: "",
  client: "",
  clientId: "",
  clientBirthdayFrom: "",
  clientBirthdayTo: "",
  clientGender: "",
  clientPhone: "",
  specialist: "",
  position: "",
  service: "",
  serviceAmountFrom: "",
  serviceAmountTo: "",
  ticketDiscountFrom: "",
  ticketDiscountTo: "",
  ticketToPayFrom: "",
  ticketToPayTo: "",
  ticketPaidFrom: "",
  ticketPaidTo: "",
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

const CLIENT_GENDER_OPTIONS = Object.freeze([
  { value: "", label: "All" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" }
]);

const REPORT_COLUMN_OPTIONS = Object.freeze([
  { key: "ticketCreatedAt", label: "Ticket Created At" },
  { key: "ticketDate", label: "Ticket Date" },
  { key: "paymentDate", label: "Ticket Payment Date" },
  { key: "ticketNumber", label: "Ticket Number" },
  { key: "paymentMethod", label: "Payment Method" },
  { key: "cashier", label: "Cashier" },
  { key: "client", label: "Client" },
  { key: "clientId", label: "Client ID" },
  { key: "clientBirthday", label: "Client Birthday" },
  { key: "clientGender", label: "Client Gender" },
  { key: "clientPhone", label: "Client Phone" },
  { key: "specialist", label: "Specialist" },
  { key: "department", label: "Department" },
  { key: "service", label: "Service Name" },
  { key: "serviceAmount", label: "Service Amount" },
  { key: "ticketDiscount", label: "Discount" },
  { key: "ticketToPay", label: "To Pay" },
  { key: "ticketPaid", label: "Paid Amount" },
  { key: "operationType", label: "Operation Type" },
  { key: "operationStatus", label: "Operation Status" },
  { key: "ticketStatus", label: "Ticket Status" }
]);

const REPORT_COLUMN_DEPENDENCIES = Object.freeze({
  ticketToPay: ["ticketNumber"],
  ticketPaid: ["ticketNumber", "ticketToPay"],
  ticketStatus: ["ticketNumber"]
});

const REPORT_FILTER_KEYS_BY_COLUMN = Object.freeze({
  ticketCreatedAt: ["ticketCreatedFrom", "ticketCreatedTo"],
  ticketDate: ["ticketDateFrom", "ticketDateTo"],
  paymentDate: ["paymentDateFrom", "paymentDateTo"],
  ticketNumber: ["ticketNumber"],
  paymentMethod: ["paymentMethodId"],
  cashier: ["cashier"],
  client: ["client"],
  clientId: ["clientId"],
  clientBirthday: ["clientBirthdayFrom", "clientBirthdayTo"],
  clientGender: ["clientGender"],
  clientPhone: ["clientPhone"],
  specialist: ["specialist"],
  department: ["position"],
  service: ["service"],
  serviceAmount: ["serviceAmountFrom", "serviceAmountTo"],
  ticketDiscount: ["ticketDiscountFrom", "ticketDiscountTo"],
  ticketToPay: ["ticketToPayFrom", "ticketToPayTo"],
  ticketPaid: ["ticketPaidFrom", "ticketPaidTo"],
  operationType: ["transactionType"],
  operationStatus: ["transactionStatus"],
  ticketStatus: ["ticketStatus"]
});

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

function makeClientIdOption(item) {
  const id = String(item?.id ?? item?.clientId ?? "").trim();
  if (!id) return null;
  const fullName = String(item?.fullName || item?.clientName || "").trim();
  const phone = String(item?.phone || item?.clientPhone || item?.phoneNumber || "").trim();
  return {
    value: id,
    label: [`#${id}`, fullName, phone].filter(Boolean).join(" - "),
    selectedLabel: id
  };
}

function makeClientPhoneOption(item) {
  const phone = String(item?.phone || item?.clientPhone || item?.phoneNumber || "").trim();
  if (!phone) return null;
  const id = String(item?.id ?? item?.clientId ?? "").trim();
  const fullName = String(item?.fullName || item?.clientName || "").trim();
  return {
    value: phone,
    label: [phone, fullName, id ? `#${id}` : ""].filter(Boolean).join(" - "),
    selectedLabel: phone
  };
}

function mergeSelectOptions(...groups) {
  const seen = new Set();
  const merged = [];
  groups.flat().forEach((option) => {
    if (!option || option.value === undefined || option.value === null) return;
    const value = String(option.value);
    if (seen.has(value)) return;
    seen.add(value);
    merged.push({ ...option, value });
  });
  return merged;
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
    case "ticketCreatedAt":
      return formatDateTime(item.ticketCreatedAt);
    case "ticketDate":
      return formatDateYMD(item.ticketDate);
    case "paymentDate":
      return formatDateTime(item.transactionAt);
    case "ticketNumber":
      return forExport ? (item.ticketNumber || "") : (item.ticketNumber ? `#${item.ticketNumber}` : "-");
    case "client":
      return item.clientName || "-";
    case "clientId":
      return item.clientId || "-";
    case "clientBirthday":
      return formatDateYMD(item.clientBirthday);
    case "clientGender":
      return item.clientGender ? translate(item.clientGender === "female" ? "Female" : "Male") : "-";
    case "clientPhone":
      return item.clientPhone || "-";
    case "service":
      return item.serviceName || "-";
    case "serviceAmount":
      return forExport ? toNumber(item.serviceAmountUzs) : formatMoney(item.serviceAmountUzs);
    case "specialist":
      return item.specialistName || "-";
    case "department":
      return item.positionLabel || "-";
    case "cashier":
      return item.cashierName || "-";
    case "paymentMethod":
      return item.paymentMethodName || translate("Balance");
    case "ticketDiscount":
      return ticketNumberValue("serviceDiscountUzs");
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
  if (["serviceAmount", "ticketDiscount", "ticketToPay", "ticketPaid"].includes(columnKey)) {
    return "finance-reports-amount-cell";
  }
  if (["ticketNumber", "clientId", "clientGender", "ticketStatus", "operationStatus"].includes(columnKey)) {
    return "finance-reports-center-cell";
  }
  return "";
}

function appendColumnWithDependencies(columnKeys, columnKey) {
  const nextKeys = Array.isArray(columnKeys) ? [...columnKeys] : [];
  const seen = new Set(nextKeys);

  function appendKey(key) {
    if (seen.has(key)) return;
    (REPORT_COLUMN_DEPENDENCIES[key] || []).forEach(appendKey);
    seen.add(key);
    nextKeys.push(key);
  }

  appendKey(columnKey);
  return nextKeys;
}

function removeColumnWithDependents(columnKeys, columnKey) {
  const blocked = new Set([columnKey]);
  let changed = true;
  while (changed) {
    changed = false;
    columnKeys.forEach((key) => {
      if (blocked.has(key)) return;
      const dependencies = REPORT_COLUMN_DEPENDENCIES[key] || [];
      if (dependencies.some((dependency) => blocked.has(dependency))) {
        blocked.add(key);
        changed = true;
      }
    });
  }
  return columnKeys.filter((key) => !blocked.has(key));
}

function buildFinanceReportsQuery(filters, columnKeys) {
  const selected = new Set(Array.isArray(columnKeys) ? columnKeys : []);
  const activeFilterKeys = new Set();
  selected.forEach((columnKey) => {
    (REPORT_FILTER_KEYS_BY_COLUMN[columnKey] || []).forEach((filterKey) => activeFilterKeys.add(filterKey));
  });

  const query = new URLSearchParams();

  Object.entries(filters || {}).forEach(([key, value]) => {
    if (!activeFilterKeys.has(key)) return;
    const normalized = String(value || "").trim();
    if (normalized) {
      query.set(key, normalized);
    }
  });

  return query;
}

function clearFiltersForColumns(filters, columnKeys) {
  const nextFilters = { ...filters };
  (Array.isArray(columnKeys) ? columnKeys : []).forEach((columnKey) => {
    (REPORT_FILTER_KEYS_BY_COLUMN[columnKey] || []).forEach((filterKey) => {
      nextFilters[filterKey] = "";
    });
  });
  return nextFilters;
}

function applyFilterDefaultsForColumns(filters, columnKeys) {
  const nextFilters = { ...filters };
  void columnKeys;
  return nextFilters;
}

function FinanceReportsPanel({ onClose }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [report, setReport] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [filterReferences, setFilterReferences] = useState({ services: [], specialists: [], positions: [], cashiers: [] });
  const [filterReferencesLoading, setFilterReferencesLoading] = useState(false);
  const [filterClientSearch, setFilterClientSearch] = useState("");
  const [filterClientOptions, setFilterClientOptions] = useState([]);
  const [filterClientSearchBusy, setFilterClientSearchBusy] = useState(false);
  const [filterClientIdSearch, setFilterClientIdSearch] = useState("");
  const [filterClientIdOptions, setFilterClientIdOptions] = useState([]);
  const [filterClientIdSearchBusy, setFilterClientIdSearchBusy] = useState(false);
  const [filterClientPhoneSearch, setFilterClientPhoneSearch] = useState("");
  const [filterClientPhoneOptions, setFilterClientPhoneOptions] = useState([]);
  const [filterClientPhoneSearchBusy, setFilterClientPhoneSearchBusy] = useState(false);
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

  const cashierOptions = useMemo(() => {
    const options = (Array.isArray(filterReferences.cashiers) ? filterReferences.cashiers : [])
      .map((item) => makeTextOption(item.id, item.fullName || item.id))
      .filter(Boolean);
    return [{ value: "", label: translate("All") }, ...options];
  }, [filterReferences.cashiers, translate]);

  const clientIdOptions = useMemo(() => mergeSelectOptions(
    [{ value: "", label: translate("All"), selectedLabel: translate("All") }],
    filters.clientId
      ? [{ value: filters.clientId, label: `#${filters.clientId}`, selectedLabel: filters.clientId }]
      : [],
    filterClientIdOptions
  ), [filterClientIdOptions, filters.clientId, translate]);

  const clientPhoneOptions = useMemo(() => mergeSelectOptions(
    [{ value: "", label: translate("All"), selectedLabel: translate("All") }],
    filters.clientPhone
      ? [{ value: filters.clientPhone, label: filters.clientPhone, selectedLabel: filters.clientPhone }]
      : [],
    filterClientPhoneOptions
  ), [filterClientPhoneOptions, filters.clientPhone, translate]);

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
        positions: Array.isArray(data?.positions) ? data.positions : [],
        cashiers: Array.isArray(data?.cashiers) ? data.cashiers : []
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

  const loadReports = useCallback(async (nextFilters = EMPTY_FILTERS, nextColumns = []) => {
    setLoading(true);
    try {
      const query = buildFinanceReportsQuery(nextFilters, nextColumns);
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
        const response = await apiFetch(`/api/finance/reports/clients?q=${encodeURIComponent(query)}&limit=30`);
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
    if (!filtersOpen) return undefined;
    const query = filterClientIdSearch.trim();
    if (!query || (!/^\d+$/.test(query) && query.length < 3)) {
      setFilterClientIdSearchBusy(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setFilterClientIdSearchBusy(true);
      try {
        const response = await apiFetch(`/api/finance/reports/clients?q=${encodeURIComponent(query)}&limit=30`);
        const data = await readApiResponseData(response);
        if (!response.ok) {
          if (!cancelled) {
            window.alert?.(translate(data?.message || "Failed to search clients."));
          }
          return;
        }
        if (!cancelled) {
          const options = (Array.isArray(data?.items) ? data.items : [])
            .map(makeClientIdOption)
            .filter(Boolean);
          setFilterClientIdOptions(options);
        }
      } catch {
        if (!cancelled) {
          window.alert?.(translate("Failed to search clients."));
        }
      } finally {
        if (!cancelled) {
          setFilterClientIdSearchBusy(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filterClientIdSearch, filtersOpen, translate]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const query = filterClientPhoneSearch.trim();
    if (!query || (!/^\d+$/.test(query) && query.length < 3)) {
      setFilterClientPhoneSearchBusy(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setFilterClientPhoneSearchBusy(true);
      try {
        const response = await apiFetch(`/api/finance/reports/clients?q=${encodeURIComponent(query)}&limit=30`);
        const data = await readApiResponseData(response);
        if (!response.ok) {
          if (!cancelled) {
            window.alert?.(translate(data?.message || "Failed to search clients."));
          }
          return;
        }
        if (!cancelled) {
          const options = (Array.isArray(data?.items) ? data.items : [])
            .map(makeClientPhoneOption)
            .filter(Boolean);
          setFilterClientPhoneOptions(options);
        }
      } catch {
        if (!cancelled) {
          window.alert?.(translate("Failed to search clients."));
        }
      } finally {
        if (!cancelled) {
          setFilterClientPhoneSearchBusy(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [filterClientPhoneSearch, filtersOpen, translate]);

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
    void loadReports(filters, selectedColumns);
  };

  const toggleReportColumn = (columnKey) => {
    const wasSelected = selectedColumnSet.has(columnKey);
    const nextColumns = wasSelected
      ? removeColumnWithDependents(selectedColumns, columnKey)
      : appendColumnWithDependencies(selectedColumns, columnKey);
    const removedColumns = selectedColumns.filter((key) => !nextColumns.includes(key));
    const addedColumns = nextColumns.filter((key) => !selectedColumnSet.has(key));

    setSelectedColumns(nextColumns);
    setFilters((current) => applyFilterDefaultsForColumns(
      clearFiltersForColumns(current, removedColumns),
      addedColumns
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
        const query = buildFinanceReportsQuery(appliedFilters, appliedColumns);
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
  const isColumnSelected = (columnKey) => selectedColumnSet.has(columnKey);
  const getColumnOrder = (columnKey) => selectedColumns.indexOf(columnKey) + 1;
  const updateFilterValue = (filterKey, value) => {
    setFilters((current) => ({ ...current, [filterKey]: value }));
  };
  const renderColumnToggle = (columnKey, label) => (
    <label className="settings-checkbox settings-checkbox-inline finance-reports-field-toggle">
      <input
        type="checkbox"
        checked={isColumnSelected(columnKey)}
        onChange={() => toggleReportColumn(columnKey)}
      />
      <span className={`finance-reports-order-badge${isColumnSelected(columnKey) ? " is-active" : ""}`}>
        {isColumnSelected(columnKey) ? getColumnOrder(columnKey) : ""}
      </span>
      <span>{translate(label)}</span>
    </label>
  );
  const renderDateRangeField = (columnKey, label, fromKey, toKey) => (
    <div className="finance-reports-filter-date-row finance-reports-check-field">
      {renderColumnToggle(columnKey, label)}
      <div className="finance-reports-filter-date-inputs">
        <label className="field">
          <span>{translate("From")}</span>
          <input
            type="date"
            value={filters[fromKey]}
            disabled={!isColumnSelected(columnKey)}
            onChange={(event) => updateFilterValue(fromKey, event.currentTarget.value)}
          />
        </label>
        <label className="field">
          <span>{translate("To")}</span>
          <input
            type="date"
            value={filters[toKey]}
            disabled={!isColumnSelected(columnKey)}
            onChange={(event) => updateFilterValue(toKey, event.currentTarget.value)}
          />
        </label>
      </div>
    </div>
  );
  const renderAmountRangeField = (columnKey, label, fromKey, toKey) => (
    <div className="field finance-reports-check-field">
      {renderColumnToggle(columnKey, label)}
      <div className="finance-reports-filter-date-inputs">
        <input
          type="number"
          min="0"
          inputMode="numeric"
          placeholder={translate("From")}
          value={filters[fromKey]}
          disabled={!isColumnSelected(columnKey)}
          onChange={(event) => updateFilterValue(fromKey, event.currentTarget.value)}
        />
        <input
          type="number"
          min="0"
          inputMode="numeric"
          placeholder={translate("To")}
          value={filters[toKey]}
          disabled={!isColumnSelected(columnKey)}
          onChange={(event) => updateFilterValue(toKey, event.currentTarget.value)}
        />
      </div>
    </div>
  );

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
                {renderDateRangeField("ticketCreatedAt", "Ticket Created At", "ticketCreatedFrom", "ticketCreatedTo")}
                {renderDateRangeField("ticketDate", "Ticket Date", "ticketDateFrom", "ticketDateTo")}
                {renderDateRangeField("paymentDate", "Ticket Payment Date", "paymentDateFrom", "paymentDateTo")}
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("ticketNumber", "Ticket Number")}
                  <input
                    type="search"
                    inputMode="numeric"
                    value={filters.ticketNumber}
                    disabled={!isColumnSelected("ticketNumber")}
                    onChange={(event) => updateFilterValue("ticketNumber", event.currentTarget.value)}
                  />
                </div>
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("paymentMethod", "Payment Method")}
                  <CustomSelect
                    value={filters.paymentMethodId}
                    options={[{ value: "", label: translate("All") }, ...paymentMethodOptions]}
                    menuPortal
                    disabled={!isColumnSelected("paymentMethod")}
                    onChange={(value) => updateFilterValue("paymentMethodId", value)}
                  />
                </div>
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("cashier", "Cashier")}
                  <CustomSelect
                    value={filters.cashier}
                    options={cashierOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search")}
                    searchThreshold={0}
                    menuPortal
                    disabled={!isColumnSelected("cashier") || filterReferencesLoading}
                    onChange={(value) => updateFilterValue("cashier", value)}
                  />
                </div>
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("client", "Client")}
                  <CustomSelect
                    value={filters.client}
                    options={[{ value: "", label: translate("All") }, ...filterClientOptions]}
                    placeholder={translate("Client")}
                    searchable
                    searchPlaceholder={translate("Search by name or ID")}
                    searchThreshold={0}
                    menuPortal
                    menuHeightScale={1.2}
                    disabled={!isColumnSelected("client")}
                    emptyText={filterClientSearchBusy ? "..." : translate("No clients found.")}
                    onSearchChange={setFilterClientSearch}
                    onChange={(value) => updateFilterValue("client", value)}
                  />
                </div>
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("clientId", "Client ID")}
                  <CustomSelect
                    value={filters.clientId}
                    options={clientIdOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search by ID")}
                    searchThreshold={0}
                    menuPortal
                    menuHeightScale={1.2}
                    disabled={!isColumnSelected("clientId")}
                    emptyText={filterClientIdSearchBusy ? "..." : translate("No clients found.")}
                    onSearchChange={setFilterClientIdSearch}
                    onChange={(value) => updateFilterValue("clientId", value)}
                  />
                </div>
                {renderDateRangeField("clientBirthday", "Client Birthday", "clientBirthdayFrom", "clientBirthdayTo")}
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("clientGender", "Client Gender")}
                  <CustomSelect
                    value={filters.clientGender}
                    options={CLIENT_GENDER_OPTIONS.map((option) => ({ ...option, label: translate(option.label) }))}
                    menuPortal
                    disabled={!isColumnSelected("clientGender")}
                    onChange={(value) => updateFilterValue("clientGender", value)}
                  />
                </div>
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("clientPhone", "Client Phone")}
                  <CustomSelect
                    value={filters.clientPhone}
                    options={clientPhoneOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search by phone")}
                    searchThreshold={0}
                    menuPortal
                    menuHeightScale={1.2}
                    disabled={!isColumnSelected("clientPhone")}
                    emptyText={filterClientPhoneSearchBusy ? "..." : translate("No clients found.")}
                    onSearchChange={setFilterClientPhoneSearch}
                    onChange={(value) => updateFilterValue("clientPhone", value)}
                  />
                </div>
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("specialist", "Specialist")}
                  <CustomSelect
                    value={filters.specialist}
                    options={specialistOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search")}
                    searchThreshold={8}
                    menuPortal
                    disabled={!isColumnSelected("specialist") || filterReferencesLoading}
                    onChange={(value) => updateFilterValue("specialist", value)}
                  />
                </div>
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("department", "Department")}
                  <CustomSelect
                    value={filters.position}
                    options={positionOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search")}
                    searchThreshold={8}
                    menuPortal
                    disabled={!isColumnSelected("department") || filterReferencesLoading}
                    onChange={(value) => updateFilterValue("position", value)}
                  />
                </div>
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("service", "Service Name")}
                  <CustomSelect
                    value={filters.service}
                    options={serviceOptions}
                    placeholder={translate("All")}
                    searchable
                    searchPlaceholder={translate("Search")}
                    searchThreshold={8}
                    menuPortal
                    disabled={!isColumnSelected("service") || filterReferencesLoading}
                    onChange={(value) => updateFilterValue("service", value)}
                  />
                </div>
                {renderAmountRangeField("serviceAmount", "Service Amount", "serviceAmountFrom", "serviceAmountTo")}
                {renderAmountRangeField("ticketDiscount", "Discount", "ticketDiscountFrom", "ticketDiscountTo")}
                {renderAmountRangeField("ticketToPay", "To Pay", "ticketToPayFrom", "ticketToPayTo")}
                {renderAmountRangeField("ticketPaid", "Paid Amount", "ticketPaidFrom", "ticketPaidTo")}
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("operationType", "Operation Type")}
                  <CustomSelect
                    value={filters.transactionType}
                    options={TRANSACTION_TYPE_OPTIONS.map((option) => ({ ...option, label: translate(option.label) }))}
                    menuPortal
                    disabled={!isColumnSelected("operationType")}
                    onChange={(value) => updateFilterValue("transactionType", value)}
                  />
                </div>
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("ticketStatus", "Ticket Status")}
                  <CustomSelect
                    value={filters.ticketStatus}
                    options={TICKET_STATUS_OPTIONS.map((option) => ({ ...option, label: translate(option.label) }))}
                    menuPortal
                    disabled={!isColumnSelected("ticketStatus")}
                    onChange={(value) => updateFilterValue("ticketStatus", value)}
                  />
                </div>
                <div className="field finance-reports-check-field">
                  {renderColumnToggle("operationStatus", "Operation Status")}
                  <CustomSelect
                    value={filters.transactionStatus}
                    options={TRANSACTION_STATUS_OPTIONS.map((option) => ({ ...option, label: translate(option.label) }))}
                    menuPortal
                    disabled={!isColumnSelected("operationStatus")}
                    onChange={(value) => updateFilterValue("transactionStatus", value)}
                  />
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
