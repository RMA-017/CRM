import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { formatDateYMD } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";
import CustomSelect from "../../../components/CustomSelect.jsx";

const EMPTY_FILTERS = Object.freeze({
  ticketNumber: "",
  ticketCreatedFrom: "",
  ticketCreatedTo: "",
  client: "",
  specialist: "",
  position: "",
  service: "",
  status: ""
});

const TICKET_STATUS_FILTER_OPTIONS = Object.freeze([
  { value: "issued", label: "Tickets" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "voided", label: "Voided" }
]);

const DEFAULT_TICKET_STATUS_FILTER = "issued,unpaid,paid";
const FINANCE_TICKET_COLUMNS_STORAGE_KEY = "aaron_crm_finance_ticket_columns";
const ALL_FINANCE_TICKET_COLUMN_IDS = Object.freeze([
  "ticketNumber",
  "createdAt",
  "clientName",
  "clientId",
  "ticketDate",
  "service",
  "department",
  "specialist",
  "status",
  "toPay",
  "paid",
  "remaining",
  "actions"
]);
const DEFAULT_FINANCE_TICKET_COLUMN_IDS = Object.freeze([
  "ticketNumber",
  "createdAt",
  "clientName",
  "clientId",
  "ticketDate",
  "service",
  "department",
  "specialist",
  "status",
  "toPay",
  "paid",
  "remaining",
  "actions"
]);

function loadStoredTicketColumnIds() {
  if (typeof window === "undefined") return [...DEFAULT_FINANCE_TICKET_COLUMN_IDS];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FINANCE_TICKET_COLUMNS_STORAGE_KEY) || "[]");
    const stored = Array.isArray(parsed) ? parsed : [];
    const allowed = new Set(ALL_FINANCE_TICKET_COLUMN_IDS);
    const normalized = ALL_FINANCE_TICKET_COLUMN_IDS.filter((id) => stored.includes(id) && allowed.has(id));
    return normalized.length > 0 ? normalized : [...DEFAULT_FINANCE_TICKET_COLUMN_IDS];
  } catch {
    return [...DEFAULT_FINANCE_TICKET_COLUMN_IDS];
  }
}

function storeTicketColumnIds(columnIds) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FINANCE_TICKET_COLUMNS_STORAGE_KEY, JSON.stringify(columnIds));
  } catch {
    // Ignore storage failures; the current session state still works.
  }
}

function todayDateValue() {
  const date = new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDefaultFilters() {
  return {
    ...EMPTY_FILTERS,
    status: DEFAULT_TICKET_STATUS_FILTER
  };
}

function createInitialAppliedFilters() {
  const today = todayDateValue();
  return {
    ...createDefaultFilters(),
    ticketCreatedFrom: today,
    ticketCreatedTo: today
  };
}

const EMPTY_TICKET_EDIT_FORM = Object.freeze({
  ticketDate: "",
  clientId: "",
  discountType: "amount",
  discountValue: "0",
  reason: "",
  items: []
});

const EMPTY_TICKET_LIST_SUMMARY = Object.freeze({
  totalAmountUzs: 0,
  paidAmountUzs: 0,
  remainingAmountUzs: 0
});

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount > 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function formatSummaryMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return `${Math.max(amount, 0).toLocaleString("ru-RU")} UZS`;
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

function getTicketRemainingAmount(item) {
  const provided = Number.parseInt(String(item?.remainingAmountUzs ?? ""), 10);
  if (Number.isFinite(provided)) {
    return Math.max(provided, 0);
  }
  const totalUzs = normalizeMoneyInput(item?.totalUzs ?? item?.amountUzs);
  const paidAmountUzs = normalizeMoneyInput(item?.paidAmountUzs);
  return Math.max(totalUzs - paidAmountUzs, 0);
}

function hasTicketPaymentActivity(item) {
  const paidAmountUzs = Number.parseInt(String(item?.paidAmountUzs ?? 0), 10) || 0;
  const paymentActivityCount = Number.parseInt(String(item?.paymentActivityCount ?? 0), 10) || 0;
  return paidAmountUzs > 0 || paymentActivityCount > 0;
}

function hasTicketPostedPaymentActivity(item) {
  const paidAmountUzs = Number.parseInt(String(item?.paidAmountUzs ?? 0), 10) || 0;
  const paymentActivityCount = Number.parseInt(String(item?.postedPaymentActivityCount ?? 0), 10) || 0;
  return paidAmountUzs > 0 || paymentActivityCount > 0;
}

function calculateDiscountUzs({ priceUzs, discountType, discountValue }) {
  const price = normalizeMoneyInput(priceUzs);
  const value = Math.max(0, Number.parseInt(String(discountValue ?? 0), 10) || 0);
  if (discountType === "percent") {
    return Math.min(price, Math.floor((price * Math.min(value, 100)) / 100));
  }
  return Math.min(price, value);
}

function distributeDiscountUzs(prices, discountUzs) {
  const normalizedPrices = prices.map((price) => normalizeMoneyInput(price));
  const subtotal = normalizedPrices.reduce((sum, price) => sum + price, 0);
  const normalizedDiscount = Math.min(normalizeMoneyInput(discountUzs), subtotal);
  let remainingDiscount = normalizedDiscount;
  let remainingPrice = subtotal;
  if (remainingDiscount <= 0 || subtotal <= 0) {
    return normalizedPrices.map(() => 0);
  }

  return normalizedPrices.map((price, index) => {
    if (price <= 0 || remainingDiscount <= 0) {
      remainingPrice -= price;
      return 0;
    }
    if (index === normalizedPrices.length - 1) {
      const amount = Math.min(price, remainingDiscount);
      remainingDiscount -= amount;
      remainingPrice -= price;
      return amount;
    }
    const remainingPriceAfterItem = remainingPrice - price;
    const proportionalAmount = Math.floor((normalizedDiscount * price) / subtotal);
    const minimumAmount = Math.max(0, remainingDiscount - remainingPriceAfterItem);
    const amount = Math.min(price, remainingDiscount, Math.max(proportionalAmount, minimumAmount));
    remainingDiscount -= amount;
    remainingPrice -= price;
    return amount;
  });
}

function getTicketEditRowDiscountUzs(row) {
  if (row?.discountUzs !== undefined && row?.discountUzs !== null) {
    return normalizeMoneyInput(row.discountUzs);
  }
  return calculateDiscountUzs({
    priceUzs: row?.priceUzs ?? row?.finalAmountUzs,
    discountType: row?.discountType,
    discountValue: row?.discountValue
  });
}

function createTicketEditDiscountForm(item) {
  const rows = Array.isArray(item?.items) && item.items.length > 0 ? item.items : [];
  const percentValue = String(rows[0]?.discountValue ?? 0);
  const usesSharedPercent = rows.length > 0 && rows.every((row) => (
    String(row?.discountType || "").toLowerCase() === "percent"
      && String(row?.discountValue ?? 0) === percentValue
  ));
  if (usesSharedPercent) {
    return {
      discountType: "percent",
      discountValue: percentValue
    };
  }
  const discountUzs = rows.length > 0
    ? rows.reduce((sum, row) => sum + getTicketEditRowDiscountUzs(row), 0)
    : normalizeMoneyInput(item?.discountUzs);
  return {
    discountType: "amount",
    discountValue: String(discountUzs)
  };
}

function createTicketEditItemRows(item) {
  const rows = Array.isArray(item?.items) && item.items.length > 0
    ? item.items
    : [{
        specialistId: item?.specialistId,
        specialistName: item?.specialistName,
        serviceId: item?.serviceId,
        serviceName: item?.serviceName,
        priceUzs: item?.totalUzs ?? item?.amountUzs
      }];
  return rows.map((row) => ({
    specialistId: String(row?.specialistId || ""),
    specialistName: String(row?.specialistName || ""),
    serviceId: String(row?.serviceId || ""),
    serviceName: String(row?.serviceName || ""),
    priceUzs: normalizeMoneyInput(row?.priceUzs ?? row?.finalAmountUzs)
  }));
}

function createTicketEditForm(item = null) {
  if (!item) return EMPTY_TICKET_EDIT_FORM;
  const discountForm = createTicketEditDiscountForm(item);
  return {
    ticketDate: formatDateInput(item.ticketDate),
    clientId: String(item.clientId || ""),
    discountType: discountForm.discountType,
    discountValue: discountForm.discountValue,
    reason: "",
    items: createTicketEditItemRows(item)
  };
}

function isAppointmentSourceTicket(item) {
  return String(item?.source || "").toLowerCase() === "appointment" || Boolean(item?.appointmentScheduleId);
}

function makeClientOption(item) {
  const id = String(item?.id ?? item?.clientId ?? "").trim();
  if (!id) return null;
  const label = String(item?.fullName || item?.clientName || `#${id}`).trim() || `#${id}`;
  return { value: id, label };
}

function normalizeTicketListSummary(summary) {
  return {
    totalAmountUzs: Number.parseInt(String(summary?.totalAmountUzs ?? 0), 10) || 0,
    paidAmountUzs: Number.parseInt(String(summary?.paidAmountUzs ?? 0), 10) || 0,
    remainingAmountUzs: Number.parseInt(String(summary?.remainingAmountUzs ?? 0), 10) || 0
  };
}

function getTicketSummaryColumnValue(columnId, summary) {
  if (columnId === "toPay") return Number.parseInt(String(summary?.totalAmountUzs ?? 0), 10) || 0;
  if (columnId === "paid") return Number.parseInt(String(summary?.paidAmountUzs ?? 0), 10) || 0;
  if (columnId === "remaining") return Number.parseInt(String(summary?.remainingAmountUzs ?? 0), 10) || 0;
  return null;
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

function getHistoryActionLabel(translate, action) {
  const labels = {
    created: "Ticket created",
    updated: "Ticket updated",
    paid: "Ticket paid",
    refunded: "Ticket refunded",
    voided: "Ticket voided",
    transaction_voided: "Transaction cancelled",
    marked_unpaid: "Marked unpaid"
  };
  return translate(labels[String(action || "")] || String(action || "-"));
}

function makeHistoryLine(label, value) {
  const normalized = value === null || value === undefined ? "" : String(value).trim();
  return normalized && normalized !== "-" ? { label, value: normalized } : null;
}

function makeHistoryItemsLine(translate, items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return makeHistoryLine(
    "Services",
    items.map((item) => {
      const service = String(item?.serviceName || item?.service_name || "-").trim();
      const specialist = String(item?.specialistName || item?.specialist_name || "").trim();
      const finalAmount = item?.finalAmountUzs ?? item?.final_amount_uzs;
      const discount = item?.discountUzs ?? item?.discount_uzs;
      const parts = [service];
      if (specialist) parts.push(`${translate("Specialist")}: ${specialist}`);
      parts.push(`${translate("Final")}: ${formatMoney(finalAmount)}`);
      if (Number.parseInt(String(discount ?? 0), 10) > 0) {
        parts.push(`${translate("Discount")}: ${formatMoney(discount)}`);
      }
      return parts.join(" / ");
    }).join("; ")
  );
}

function buildTicketHistoryDetails(translate, item) {
  const details = item?.details && typeof item.details === "object" ? item.details : {};
  const reason = String(details.reason || details.changeReason || "").trim();
  const note = String(details.note || details.ticketNote || "").trim();
  return [
    reason,
    note ? `${translate("Note")}: ${note}` : ""
  ].filter(Boolean);
}

function FinanceTicketsPanel({ onClose, canUpdateFinanceCashier = false }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(() => createInitialAppliedFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => createInitialAppliedFilters());
  const [items, setItems] = useState([]);
  const [ticketSummary, setTicketSummary] = useState(EMPTY_TICKET_LIST_SUMMARY);
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
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState(() => loadStoredTicketColumnIds());
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
        setTicketSummary(EMPTY_TICKET_LIST_SUMMARY);
        window.alert?.(translate(nextMessage));
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTicketSummary(normalizeTicketListSummary(data?.summary));
      setPage(Number.parseInt(String(data?.page || nextPage), 10) || 1);
      setTotalPages(Number.parseInt(String(data?.totalPages || 1), 10) || 1);
      setTotal(Number.parseInt(String(data?.total || 0), 10) || 0);
      setMessage("");
    } catch {
      setTicketSummary(EMPTY_TICKET_LIST_SUMMARY);
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

  const ticketColumns = [
    {
      id: "ticketNumber",
      label: "Ticket Number",
      render: (item) => item.ticketNumber ? `#${item.ticketNumber}` : "-",
      exportValue: (item) => item.ticketNumber || ""
    },
    {
      id: "createdAt",
      label: "Created At",
      render: (item) => formatDateTime(item.createdAt),
      exportValue: (item) => formatDateTime(item.createdAt)
    },
    {
      id: "clientName",
      label: "Client",
      render: (item) => item.clientName || "-",
      exportValue: (item) => item.clientName || ""
    },
    {
      id: "clientId",
      label: "Client ID",
      render: (item) => item.clientId || "-",
      exportValue: (item) => item.clientId || ""
    },
    {
      id: "ticketDate",
      label: "Ticket Date",
      render: (item) => formatDateYMD(item.ticketDate),
      exportValue: (item) => formatDateYMD(item.ticketDate)
    },
    {
      id: "service",
      label: "Service",
      render: (item) => getTicketServiceText(item),
      exportValue: (item) => getTicketServiceText(item)
    },
    {
      id: "department",
      label: "Department",
      render: (item) => getTicketPositionText(item),
      exportValue: (item) => getTicketPositionText(item)
    },
    {
      id: "specialist",
      label: "Specialist",
      render: (item) => getTicketSpecialistText(item),
      exportValue: (item) => getTicketSpecialistText(item)
    },
    {
      id: "status",
      label: "Status",
      render: (item) => translateTicketStatus(translate, item.status),
      exportValue: (item) => translateTicketStatus(translate, item.status)
    },
    {
      id: "toPay",
      label: "To Pay",
      render: (item) => formatMoney(item.totalUzs ?? item.amountUzs),
      exportValue: (item) => Number.parseInt(String(item.totalUzs ?? item.amountUzs ?? 0), 10) || 0
    },
    {
      id: "paid",
      label: "Paid",
      render: (item) => formatMoney(item.paidAmountUzs),
      exportValue: (item) => Number.parseInt(String(item.paidAmountUzs ?? 0), 10) || 0
    },
    {
      id: "remaining",
      label: "Remaining",
      render: (item) => formatMoney(getTicketRemainingAmount(item)),
      exportValue: (item) => getTicketRemainingAmount(item)
    },
    {
      id: "actions",
      label: "Actions",
      render: (item) => {
        const id = String(item.id);
        const canEditRow = canUpdateFinanceCashier
          && item.status !== "paid"
          && item.status !== "voided"
          && !hasTicketPostedPaymentActivity(item);
        const canDeleteRow = canEditRow && !hasTicketPaymentActivity(item);
        const hasAction = canEditRow || item.status === "paid";
        return hasAction ? (
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
                {canDeleteRow ? (
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
                ) : null}
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
        ) : "-";
      },
      exportValue: () => ""
    }
  ];
  const visibleColumns = ticketColumns.filter((column) => visibleColumnIds.includes(column.id));
  const visibleColumnCount = Math.max(visibleColumns.length, 1);

  const toggleColumnVisibility = (columnId) => {
    setVisibleColumnIds((current) => {
      let next = current;
      if (current.includes(columnId)) {
        next = current.length > 1 ? current.filter((id) => id !== columnId) : current;
      } else if (ticketColumns.some((column) => column.id === columnId)) {
        const nextIds = new Set([...current, columnId]);
        next = ticketColumns.map((column) => column.id).filter((id) => nextIds.has(id));
      }
      if (next !== current) {
        storeTicketColumnIds(next);
      }
      return next;
    });
  };

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
    const subtotalUzs = editForm.items.reduce((sum, item) => {
      const service = editServiceById.get(String(item.serviceId || ""));
      const priceUzs = normalizeMoneyInput(service?.priceUzs ?? item.priceUzs);
      return sum + priceUzs;
    }, 0);
    const discountUzs = calculateDiscountUzs({
      priceUzs: subtotalUzs,
      discountType: editForm.discountType,
      discountValue: editForm.discountValue
    });
    return {
      subtotalUzs,
      discountUzs,
      totalUzs: Math.max(subtotalUzs - discountUzs, 0)
    };
  }, [editForm.discountType, editForm.discountValue, editForm.items, editServiceById]);

  const applyFilters = (event) => {
    event.preventDefault();
    setAppliedFilters(filters);
    setFiltersOpen(false);
    void loadTickets(1, filters);
  };

  const toggleStatusFilter = (status) => {
    setFilters((current) => {
      const selected = new Set(String(current.status || "").split(",").filter(Boolean));
      if (selected.has(status)) {
        selected.delete(status);
      } else {
        selected.add(status);
      }
      const ordered = TICKET_STATUS_FILTER_OPTIONS
        .map((option) => option.value)
        .filter((value) => selected.has(value));
      return { ...current, status: ordered.join(",") };
    });
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
    if (hasTicketPostedPaymentActivity(item)) {
      window.alert?.(translate("Tickets with payments cannot be edited."));
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
    const isAppointmentTicket = isAppointmentSourceTicket(editTicket);
    if (!isAppointmentTicket && !/^\d{4}-\d{2}-\d{2}$/.test(editForm.ticketDate)) {
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
    const reason = String(editForm.reason || "").trim();
    if (!reason) {
      window.alert?.(translate("Change reason is required."));
      return;
    }
    const editItemDiscounts = distributeDiscountUzs(
      editForm.items.map((item) => {
        const service = editServiceById.get(String(item.serviceId || ""));
        return normalizeMoneyInput(service?.priceUzs ?? item.priceUzs);
      }),
      editTotals.discountUzs
    );

    setEditSubmitting(true);
    try {
      const payload = {
        items: editForm.items.map((item, index) => ({
          specialistId: item.specialistId,
          serviceId: item.serviceId,
          discountType: editForm.discountType === "percent" ? "percent" : "amount",
          discountValue: editForm.discountType === "percent"
            ? editForm.discountValue
            : editItemDiscounts[index] || 0,
          discountUzs: editItemDiscounts[index] || 0
        })),
        reason
      };
      if (!isAppointmentTicket) {
        payload.ticketDate = editForm.ticketDate;
      }
      const response = await apiFetch(`/api/finance/cashier/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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
    if (hasTicketPaymentActivity(item)) {
      window.alert?.(translate("Tickets with payments cannot be deleted."));
      return;
    }
    const reason = String(window.prompt?.(translate("Enter ticket delete reason")) || "").trim();
    if (!reason) {
      window.alert?.(translate("Delete reason is required."));
      return;
    }
    setVoidingId(id);
    try {
      const response = await apiFetch(`/api/finance/cashier/tickets/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
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
    let summary = ticketSummary;
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
      if (nextPage === 1) {
        summary = normalizeTicketListSummary(data?.summary);
      }
      allItems.push(...(Array.isArray(data?.items) ? data.items : []));
      nextTotalPages = Number.parseInt(String(data?.totalPages || 1), 10) || 1;
      nextPage += 1;
    } while (nextPage <= nextTotalPages);
    return { items: allItems, summary };
  };

  const exportTickets = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const exportData = await fetchAllTickets();
      exportExcelWorkbook(buildExportFilename("finance-tickets"), [{
        name: translate("Tickets"),
        rows: [
          visibleColumns.map((column) => translate(column.label)),
          ...exportData.items.map((item) => visibleColumns.map((column) => column.exportValue(item))),
          visibleColumns.map((column, index) => {
            const summaryValue = getTicketSummaryColumnValue(column.id, exportData.summary);
            if (summaryValue !== null) return summaryValue;
            return index === 0 ? translate("Total") : "";
          })
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

  const closeColumns = () => {
    setColumnsOpen(false);
  };

  return (
    <section id="financeTicketsPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-tickets-panel">
      <div className="all-users-head">
        <h3>{translate("Tickets")}</h3>
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

      {columnsOpen && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close")}
            onClick={closeColumns}
          />
          <div id="financeTicketColumnsModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-ticket-columns-modal">
            <h3>{translate("Table columns")}</h3>
            <div className="finance-ticket-columns-list">
              {ticketColumns.map((column) => {
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
                    <span>{translate("Ticket Created From")}</span>
                    <input
                      type="date"
                      value={filters.ticketCreatedFrom}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFilters((current) => ({ ...current, ticketCreatedFrom: value }));
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>{translate("Ticket Created To")}</span>
                    <input
                      type="date"
                      value={filters.ticketCreatedTo}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setFilters((current) => ({ ...current, ticketCreatedTo: value }));
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
                    disabled={filterReferencesLoading}
                    onChange={(value) => setFilters((current) => ({ ...current, service: value }))}
                  />
                </label>
                <label className="field finance-ticket-status-filter-field">
                  <span>{translate("Status")}</span>
                  <div className="finance-ticket-status-filter-list">
                    {TICKET_STATUS_FILTER_OPTIONS.map((option) => {
                      const checked = String(filters.status || "").split(",").includes(option.value);
                      return (
                        <label className="finance-ticket-status-filter-option" key={option.value}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStatusFilter(option.value)}
                          />
                          <span>{translate(option.label)}</span>
                        </label>
                      );
                    })}
                  </div>
                </label>
              </div>
              <div className="edit-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>{translate("Search")}</button>
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
              {visibleColumns.map((column) => (
                <th key={column.id}>{translate(column.label)}</th>
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
            ) : items.map((item) => {
              const id = String(item.id);
              return (
                <tr
                  key={id}
                  title={translate("Double-click to view ticket history")}
                  onDoubleClick={() => openHistory(item)}
                >
                  {visibleColumns.map((column) => (
                    <td key={column.id}>{column.render(item)}</td>
                  ))}
                </tr>
              );
            })}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="all-users-state">{translate("No items found.")}</td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="finance-ticket-total-row">
              {visibleColumns.map((column, index) => {
                const summaryValue = getTicketSummaryColumnValue(column.id, ticketSummary);
                if (summaryValue !== null) {
                  return (
                    <td key={column.id} className="finance-ticket-total-value">
                      {formatSummaryMoney(summaryValue)}
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

      {editTicket && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close ticket edit modal")}
            onClick={() => closeEditTicket()}
          />
          <div id="financeTicketEditModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-ticket-edit-modal">
            <h3 className="finance-modal-title-with-number">
              <span>{translate("Edit Ticket")}</span>
              <span className={`finance-ticket-source-badge ${isAppointmentSourceTicket(editTicket) ? "is-appointment" : "is-manual"}`}>
                {translate(isAppointmentSourceTicket(editTicket) ? "Appointment Ticket" : "Manual Ticket")}
              </span>
              {editTicket.ticketNumber ? (
                <span className="finance-modal-ticket-number">{`#${editTicket.ticketNumber}`}</span>
              ) : null}
            </h3>
            <form className="auth-form finance-ticket-edit-form" onSubmit={submitEditTicket}>
              <div className="all-users-edit-fields">
                <div className="finance-ticket-edit-top-row">
                  <label className="field">
                    <span>{translate("Ticket Date")}</span>
                    <input
                      type="date"
                      value={editForm.ticketDate}
                      disabled={isAppointmentSourceTicket(editTicket)}
                      title={isAppointmentSourceTicket(editTicket) ? translate("Field is locked because ticket was created from appointment.") : undefined}
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
                      disabled
                      title={translate("Ticket client cannot be changed.")}
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
                            className="table-action-btn table-action-btn-danger finance-ticket-icon-btn"
                            aria-label={translate("Remove")}
                            title={translate("Remove")}
                            disabled={isAppointmentSourceTicket(editTicket) || editForm.items.length <= 1}
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
                          disabled={isAppointmentSourceTicket(editTicket) || editReferencesLoading}
                          title={isAppointmentSourceTicket(editTicket) ? translate("Field is locked because ticket was created from appointment.") : undefined}
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

                <label className="field finance-ticket-edit-reason-field">
                  <span>{translate("Change reason")}</span>
                  <textarea
                    rows="2"
                    maxLength="255"
                    required
                    value={editForm.reason}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEditForm((current) => ({ ...current, reason: value }));
                    }}
                  />
                </label>

                <div className="finance-ticket-summary finance-ticket-total finance-ticket-edit-total">
                  <div className="finance-total-cell">
                    <span>{translate("Subtotal")}</span>
                    <strong>{formatMoney(editTotals.subtotalUzs)}</strong>
                  </div>
                  <label className="field finance-total-cell">
                    <span>{translate("Discount Type")}</span>
                    <CustomSelect
                      value={editForm.discountType}
                      options={[
                        { value: "amount", label: translate("Amount") },
                        { value: "percent", label: translate("Percent") }
                      ]}
                      menuPortal
                      onChange={(value) => setEditForm((current) => ({ ...current, discountType: value }))}
                    />
                  </label>
                  <label className="field finance-total-cell">
                    <span>{translate("Discount")}</span>
                    <input
                      type="number"
                      min="0"
                      max={editForm.discountType === "percent" ? "100" : undefined}
                      value={editForm.discountValue}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setEditForm((current) => ({ ...current, discountValue: value }));
                      }}
                    />
                  </label>
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
      ), document.body) : null}

      {historyTicket && typeof document !== "undefined" ? createPortal((
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
                    <th>{translate("Details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr><td colSpan="5" className="skel" /></tr>
                  ) : historyItems.map((item) => {
                    const detailLines = buildTicketHistoryDetails(translate, item);
                    return (
                      <tr key={String(item.id)}>
                        <td>{formatDateTime(item.createdAt)}</td>
                        <td>{getHistoryActionLabel(translate, item.action)}</td>
                        <td>{[item.fromStatus, item.toStatus].filter(Boolean).map((status) => translateTicketStatus(translate, status)).join(" -> ") || "-"}</td>
                        <td>{item.actorName || "-"}</td>
                        <td>
                          {detailLines.length > 0 ? (
                            <div className="finance-ticket-history-details">
                              {detailLines.map((line) => (
                                <div key={line}>{line}</div>
                              ))}
                            </div>
                          ) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {!historyLoading && historyItems.length === 0 ? (
                    <tr><td colSpan="5" className="all-users-state">{translate("No items found.")}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="edit-actions">
              <button type="button" className="btn btn-secondary" onClick={closeHistory}>{translate("Close")}</button>
            </div>
          </div>
        </>
      ), document.body) : null}
    </section>
  );
}

export default FinanceTicketsPanel;
