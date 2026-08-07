import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { formatDateYMD } from "../../../lib/formatters.js";
import { useEscapeKey } from "../../../lib/use-escape-key.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const CASHIER_BOARD_LIMIT_STEP = 100;
const CASHIER_BOARD_COLUMN_KEYS = Object.freeze([
  "pendingAppointments",
  "cancelledAppointments",
  "noShowAppointments",
  "overdueConfirmedAppointments",
  "issuedTickets"
]);
const CASHIER_BOARD_PERIOD_TODAY = "today";
const CASHIER_BOARD_PERIOD_CURRENT_MONTH = "current-month";
const CASHIER_BOARD_PERIOD_PREVIOUS_MONTH = "previous-month";
const DISCOUNT_MAX_PERCENT_VALUE = 100;

function formatDateValue(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateValue() {
  return formatDateValue(new Date());
}

function getCashierBoardPeriodBounds(period) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const todayYmd = formatDateValue(today);
  if (period === CASHIER_BOARD_PERIOD_CURRENT_MONTH) {
    return {
      dateFrom: formatDateValue(new Date(year, month, 1)),
      dateTo: todayYmd
    };
  }
  if (period === CASHIER_BOARD_PERIOD_PREVIOUS_MONTH) {
    return {
      dateFrom: formatDateValue(new Date(year, month - 1, 1)),
      dateTo: formatDateValue(new Date(year, month, 0))
    };
  }
  return { dateFrom: todayYmd, dateTo: todayYmd };
}

function isFutureDateValue(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && normalized > todayDateValue();
}

function createManualItem() {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    specialistId: "",
    serviceId: "",
    priceUzs: ""
  };
}

function createManualForm() {
  return {
    ticketDate: todayDateValue(),
    clientId: "",
    items: [createManualItem()],
    discountType: "amount",
    discountValue: "0",
    note: ""
  };
}

function createBatchPaymentRow(amountUzs = "") {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    source: "method",
    paymentMethodId: "",
    clientId: "",
    amountUzs: amountUzs === "" ? "" : String(amountUzs)
  };
}

const EMPTY_APPOINTMENT_TICKET_FORM = Object.freeze({
  serviceId: "",
  priceUzs: "",
  discountType: "amount",
  discountValue: "0",
  note: ""
});

function createAppointmentTicketForm(item = null) {
  return {
    serviceId: String(item?.serviceId || ""),
    priceUzs: String(normalizeMoneyInput(item?.servicePriceUzs)),
    discountType: "amount",
    discountValue: "0",
    note: ""
  };
}

function getAppointmentTicketServiceName({ source, services, serviceId }) {
  const selectedService = (Array.isArray(services) ? services : [])
    .find((entry) => String(entry?.id || "") === String(serviceId || ""));
  const sourceServiceName = String(source?.serviceName || "").trim();
  if (String(serviceId || "") === String(source?.serviceId || "") && sourceServiceName) {
    return sourceServiceName;
  }
  return String(selectedService?.name || sourceServiceName || "").trim();
}

function buildAppointmentServiceOptions({ services, source }) {
  const options = (Array.isArray(services) ? services : []).filter(Boolean).map((item) => ({
    value: String(item.id),
    label: `${item.name || item.id} - ${formatMoney(item.priceUzs)}`,
    item
  }));
  const sourceServiceId = String(source?.serviceId || "").trim();
  if (!sourceServiceId) return options;

  const matchingIndex = options.findIndex((option) => option.value === sourceServiceId);
  const matchingService = matchingIndex >= 0 ? options[matchingIndex].item : null;
  const snapshotService = {
    ...matchingService,
    id: sourceServiceId,
    name: String(source?.serviceName || matchingService?.name || sourceServiceId).trim(),
    priceUzs: normalizeMoneyInput(source?.servicePriceUzs)
  };
  const snapshotOption = {
    value: sourceServiceId,
    label: `${snapshotService.name} - ${formatMoney(snapshotService.priceUzs)}`,
    item: snapshotService
  };

  if (matchingIndex >= 0) {
    options[matchingIndex] = snapshotOption;
    return options;
  }
  return [snapshotOption, ...options];
}

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount > 0 ? amount.toLocaleString("ru-RU") : "-";
}

function formatSignedMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  if (amount === 0) return "-";
  const prefix = amount > 0 ? "+" : "-";
  return `${prefix}${Math.abs(amount).toLocaleString("ru-RU")}`;
}

function formatTicketNumber(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return number > 0 ? `#${String(number).padStart(5, "0")}` : "#-----";
}

function formatTicketCountLabel(translate, tickets) {
  const count = Array.isArray(tickets) ? tickets.length : 0;
  return translate("Ticket count").replace("{count}", String(count));
}

function formatTime(value) {
  return String(value || "").slice(0, 5) || "-";
}

function formatShortDateDM(value) {
  const formatted = formatDateYMD(value);
  return formatted && formatted !== "-" ? formatted.slice(0, 5) : "-";
}

function calculateDiscount(priceUzs, discountType, discountValue) {
  const price = Number.parseInt(String(priceUzs ?? 0), 10) || 0;
  const value = Number.parseInt(String(discountValue ?? 0), 10) || 0;
  if (discountType === "percent") {
    return Math.min(price, Math.floor((price * Math.min(value, DISCOUNT_MAX_PERCENT_VALUE)) / 100));
  }
  return Math.min(price, value);
}

function normalizeDiscountValueInput(discountType, value) {
  const rawValue = String(value ?? "");
  if (String(discountType || "") !== "percent" || rawValue.trim() === "") {
    return rawValue;
  }
  const amount = Number.parseInt(rawValue, 10) || 0;
  return amount > DISCOUNT_MAX_PERCENT_VALUE ? String(DISCOUNT_MAX_PERCENT_VALUE) : rawValue;
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

function normalizeMoneyInput(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeBoardTotal(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getBoardLoadedCount(board, key) {
  return Array.isArray(board?.[key]) ? board[key].length : 0;
}

function getBoardTotalCount(board, key) {
  return Math.max(
    normalizeBoardTotal(board?.totals?.[key], getBoardLoadedCount(board, key)),
    getBoardLoadedCount(board, key)
  );
}

function getTicketPayableAmount(ticket) {
  return normalizeMoneyInput(ticket?.remainingAmountUzs ?? ticket?.remaining_amount_uzs ?? ticket?.totalUzs ?? ticket?.amountUzs);
}

function getTicketTotalPayableAmount(ticket) {
  const totalAmount = normalizeMoneyInput(
    ticket?.totalUzs ?? ticket?.total_uzs ?? ticket?.amountUzs ?? ticket?.amount_uzs
  );
  if (totalAmount > 0) {
    return totalAmount;
  }
  return getTicketLineItems(ticket).reduce((sum, item) => sum + getTicketLineFinalAmount(item), 0);
}

function getTicketClientId(ticket) {
  return String(ticket?.clientId ?? ticket?.client_id ?? "").trim();
}

function getSelectedTicketClientId(ticketIds, tickets) {
  const ids = ticketIds instanceof Set ? ticketIds : new Set();
  const selectedTicket = (Array.isArray(tickets) ? tickets : [])
    .find((ticket) => ids.has(String(ticket?.id || "")));
  return getTicketClientId(selectedTicket);
}

function getTicketPaidAmount(ticket) {
  return normalizeMoneyInput(ticket?.paidAmountUzs ?? ticket?.paid_amount_uzs);
}

function getBatchPaymentRowAmountLimit(rows, key, totalUzs) {
  const otherRowsTotal = (Array.isArray(rows) ? rows : []).reduce((sum, row) => (
    row?.key === key ? sum : sum + normalizeMoneyInput(row?.amountUzs)
  ), 0);
  return Math.max(normalizeMoneyInput(totalUzs) - otherRowsTotal, 0);
}

function clampBatchPaymentAmountInput(value, maxAmountUzs) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return "";
  const amount = normalizeMoneyInput(rawValue);
  const maxAmount = Math.max(normalizeMoneyInput(maxAmountUzs), 0);
  return String(Math.min(amount, maxAmount));
}

function getTicketServicePriceAmount(ticket) {
  return getTicketLineItems(ticket).reduce((sum, item) => {
    return sum + getTicketLineServicePriceAmount(item);
  }, 0);
}

function getTicketDiscountAmount(ticket) {
  return getTicketLineItems(ticket).reduce((sum, item) => sum + normalizeMoneyInput(item?.discountUzs), 0);
}

function getTicketLineServicePriceAmount(lineItem) {
  const price = normalizeMoneyInput(lineItem?.priceUzs);
  if (price > 0) {
    return price;
  }
  return normalizeMoneyInput(lineItem?.finalAmountUzs) + normalizeMoneyInput(lineItem?.discountUzs);
}

function getTicketLineFinalAmount(lineItem) {
  const finalAmount = normalizeMoneyInput(lineItem?.finalAmountUzs);
  if (finalAmount > 0) {
    return finalAmount;
  }
  return Math.max(getTicketLineServicePriceAmount(lineItem) - normalizeMoneyInput(lineItem?.discountUzs), 0);
}

function getTicketLinePaidAmount(ticket, lineIndex) {
  const rows = getTicketLineItems(ticket);
  const paidAmount = getTicketPaidAmount(ticket);
  const currentFinalAmount = getTicketLineFinalAmount(rows[lineIndex]);
  const previousFinalAmount = rows
    .slice(0, lineIndex)
    .reduce((sum, item) => sum + getTicketLineFinalAmount(item), 0);
  return Math.max(Math.min(paidAmount - previousFinalAmount, currentFinalAmount), 0);
}

function getTicketLineItems(item) {
  const rows = Array.isArray(item?.items)
    ? item.items.filter((row) => row && typeof row === "object")
    : [];
  if (rows.length > 0) {
    return rows;
  }
  return [{
    specialistId: item?.specialistId,
    specialistName: item?.specialistName,
    serviceId: item?.serviceId,
    serviceName: item?.serviceName,
    priceUzs: item?.subtotalUzs ?? item?.amountUzs ?? item?.totalUzs,
    discountUzs: item?.discountUzs ?? 0,
    finalAmountUzs: item?.totalUzs ?? item?.amountUzs
  }];
}

function getUniqueLineValues(rows, fieldName) {
  const seen = new Set();
  const values = [];
  rows.forEach((row) => {
    const value = String(row?.[fieldName] || "").trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    values.push(value);
  });
  return values;
}

function getTicketServiceSummary(item) {
  const rows = getTicketLineItems(item);
  if (rows.length > 1) {
    return `${rows.length} services`;
  }
  return String(rows[0]?.serviceName || item?.serviceName || "-").trim() || "-";
}

function getTicketSpecialistSummary(item) {
  const rows = getTicketLineItems(item);
  const specialists = getUniqueLineValues(rows, "specialistName");
  if (rows.length > 1) {
    const count = specialists.length || rows.length;
    return `${count} ${count === 1 ? "specialist" : "specialists"}`;
  }
  return specialists[0] || String(item?.specialistName || "-").trim() || "-";
}

function getBoardCardDate(item) {
  if (item?.ticketNumber || item?.ticket_number) {
    return item?.createdAt || item?.created_at || item?.ticketDate || item?.ticket_date || item?.appointmentDate || item?.appointment_date;
  }
  return item?.appointmentDate || item?.appointment_date || item?.ticketDate || item?.ticket_date;
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeStatusKey(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}

const FINANCE_MODAL_OVERLAY_STYLE = Object.freeze({
  position: "fixed",
  inset: 0,
  width: "100vw",
  height: "100dvh",
  margin: 0,
  padding: 0,
  border: 0,
  backgroundColor: "rgba(10, 15, 50, 0.52)",
  backdropFilter: "blur(8px) saturate(85%)",
  WebkitBackdropFilter: "blur(8px) saturate(85%)",
  zIndex: "var(--z-modal)",
  appearance: "none",
  WebkitAppearance: "none"
});

function BoardColumnTitle({ count, total = count, label, translate }) {
  const countLabel = count === total ? String(count) : `${count}/${total}`;
  return (
    <h4 className="finance-board-column-title">
      <span>{translate(label)}</span>
      <span className="finance-board-count">{countLabel}</span>
    </h4>
  );
}

function TicketCard({
  item,
  footer,
  onClick,
  onDoubleClick,
  actionTitle = "",
  compact = false,
  showShortDate = false,
  selectable = false,
  selected = false,
  selectableDisabled = false,
  selectableDisabledTitle = "",
  onSelectionChange
}) {
  const statusKey = normalizeStatusKey(item?.status);
  const selectionBlocked = selectableDisabled && !selected;
  const className = [
    "settings-card",
    compact ? "finance-card-compact" : "",
    statusKey ? `finance-board-card-${statusKey}` : "",
    selected ? "finance-board-card-selected" : "",
    selectionBlocked ? "finance-board-card-selection-disabled" : "",
    onClick ? "settings-card-clickable" : "",
    onDoubleClick ? "finance-board-card-ticketable" : ""
  ].filter(Boolean).join(" ");
  const clientName = item.clientName || "-";
  const serviceName = getTicketServiceSummary(item);
  const specialistName = getTicketSpecialistSummary(item);
  const startTime = formatTime(item.startTime);
  const shortDate = showShortDate
    ? formatShortDateDM(getBoardCardDate(item))
    : "";
  const cardTitle = actionTitle || (compact
    ? [startTime, clientName, serviceName, specialistName].filter(Boolean).join(" - ")
    : undefined);

  return (
    <article
      className={className}
      role={onClick || onDoubleClick ? "button" : undefined}
      tabIndex={onClick || onDoubleClick ? 0 : undefined}
      title={cardTitle}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(event) => {
        const action = onClick || onDoubleClick;
        if (!action) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          action();
        }
      }}
    >
      <div className="settings-card-row">
        <strong>{clientName}</strong>
        {selectable ? (
          <label
            className={`finance-ticket-select-control${selectionBlocked ? " finance-ticket-select-control-disabled" : ""}`}
            aria-label={selectionBlocked ? selectableDisabledTitle || "Select another client first" : (selected ? "Deselect ticket" : "Select ticket")}
            title={selectionBlocked ? selectableDisabledTitle : undefined}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              disabled={selectionBlocked}
              onChange={(event) => {
                event.stopPropagation();
                if (selectionBlocked) return;
                onSelectionChange?.(event.currentTarget.checked);
              }}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            />
          </label>
        ) : null}
      </div>
      <div className="settings-card-row">
        <span>{serviceName}</span>
        <span>{startTime}</span>
      </div>
      <div className="settings-card-row">
        <span>{specialistName}</span>
        {shortDate ? <span className="finance-card-date">{shortDate}</span> : null}
      </div>
      {footer ? (
        <div className="settings-card-actions" onClick={(event) => event.stopPropagation()}>
          {footer}
        </div>
      ) : null}
    </article>
  );
}

function FinanceCashierPanel({
  onClose,
  canCreateFinanceCashier,
  canUpdateFinanceCashier,
  canPayFinanceCashier
}) {
  const { translate } = useI18n();
  const [board, setBoard] = useState({
    pendingAppointments: [],
    cancelledAppointments: [],
    noShowAppointments: [],
    overdueConfirmedAppointments: [],
    issuedTickets: [],
    paymentMethods: [],
    services: [],
    specialists: [],
    nextTicketNumber: null,
    totals: {},
    limit: CASHIER_BOARD_LIMIT_STEP
  });
  const [boardLimit, setBoardLimit] = useState(CASHIER_BOARD_LIMIT_STEP);
  const [boardLoading, setBoardLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [selectedTicketIds, setSelectedTicketIds] = useState(() => new Set());
  const [batchPaymentTickets, setBatchPaymentTickets] = useState([]);
  const [batchPaymentRows, setBatchPaymentRows] = useState(() => [createBatchPaymentRow()]);
  const [batchPaymentNote, setBatchPaymentNote] = useState("");
  const [batchPaymentSubmitting, setBatchPaymentSubmitting] = useState(false);
  const [batchClientBalances, setBatchClientBalances] = useState({});
  const [batchClientBalancesLoading, setBatchClientBalancesLoading] = useState(false);
  const [boardFilters, setBoardFilters] = useState({
    period: CASHIER_BOARD_PERIOD_TODAY,
    clientQuery: "",
    specialistId: ""
  });
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState(() => createManualForm());
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [clientSearchBusy, setClientSearchBusy] = useState(false);
  const [appointmentTicketSource, setAppointmentTicketSource] = useState(null);
  const [appointmentTicketForm, setAppointmentTicketForm] = useState(EMPTY_APPOINTMENT_TICKET_FORM);
  const [appointmentTicketSubmitting, setAppointmentTicketSubmitting] = useState(false);
  const [appointmentDiscountTouched, setAppointmentDiscountTouched] = useState(false);
  const [appointmentDiscountLocked, setAppointmentDiscountLocked] = useState(false);
  const [appointmentDiscountPreviewLoading, setAppointmentDiscountPreviewLoading] = useState(false);
  const [cashSession, setCashSession] = useState(null);
  const boardRequestRef = useRef(0);
  const appointmentDiscountPreviewRequestRef = useRef(0);

  const paymentMethodOptions = useMemo(() => board.paymentMethods.filter(Boolean).map((item) => ({
    value: String(item.id),
    label: item.name
  })), [board.paymentMethods]);

  const manualServiceOptions = useMemo(() => board.services.filter(Boolean).map((item) => ({
    value: String(item.id),
    label: `${item.name || item.id} - ${formatMoney(item.priceUzs)}`,
    item
  })), [board.services]);
  const appointmentServiceOptions = useMemo(() => buildAppointmentServiceOptions({
    services: board.services,
    source: appointmentTicketSource
  }), [appointmentTicketSource, board.services]);

  const specialistOptions = useMemo(() => board.specialists.filter(Boolean).map((item) => ({
    value: String(item.id),
    label: `${item.fullName || item.id}${item.positionLabel ? ` - ${item.positionLabel}` : ""}`
  })), [board.specialists]);

  const boardPeriodOptions = useMemo(() => [
    { value: CASHIER_BOARD_PERIOD_TODAY, label: translate("Today") },
    { value: CASHIER_BOARD_PERIOD_CURRENT_MONTH, label: translate("Current month") },
    { value: CASHIER_BOARD_PERIOD_PREVIOUS_MONTH, label: translate("Previous month") }
  ], [translate]);

  const boardPeriodBounds = useMemo(
    () => getCashierBoardPeriodBounds(boardFilters.period),
    [boardFilters.period]
  );

  const visibleBoard = useMemo(() => ({
    pendingAppointments: board.pendingAppointments,
    cancelledAppointments: board.cancelledAppointments,
    noShowAppointments: board.noShowAppointments,
    overdueConfirmedAppointments: board.overdueConfirmedAppointments,
    issuedTickets: board.issuedTickets
  }), [board]);
  const isBoardFilterActive = Boolean(
    boardFilters.period !== CASHIER_BOARD_PERIOD_TODAY
    || normalizeSearchValue(boardFilters.clientQuery)
    || boardFilters.specialistId
  );
  const hasMoreBoardItems = CASHIER_BOARD_COLUMN_KEYS.some((key) => (
    getBoardLoadedCount(board, key) < getBoardTotalCount(board, key)
  ));
  const getBoardDisplayTotal = (key) => getBoardTotalCount(board, key);
  const loadMoreBoardItems = () => {
    setBoardLimit((current) => current + CASHIER_BOARD_LIMIT_STEP);
  };
  const selectedTicketClientId = useMemo(
    () => getSelectedTicketClientId(selectedTicketIds, board.issuedTickets),
    [board.issuedTickets, selectedTicketIds]
  );
  const selectedTicketCount = selectedTicketIds.size;
  const batchPaymentTotalUzs = useMemo(() => (
    batchPaymentTickets.reduce((sum, item) => sum + getTicketPayableAmount(item), 0)
  ), [batchPaymentTickets]);
  const batchPaidTotalUzs = useMemo(() => (
    batchPaymentRows.reduce((sum, row) => sum + normalizeMoneyInput(row.amountUzs), 0)
  ), [batchPaymentRows]);
  const batchRemainingUzs = Math.max(batchPaymentTotalUzs - batchPaidTotalUzs, 0);
  const batchOverpaidUzs = Math.max(batchPaidTotalUzs - batchPaymentTotalUzs, 0);
  const batchClientSummaries = useMemo(() => {
    const byClient = new Map();
    batchPaymentTickets.forEach((ticket) => {
      const clientId = String(ticket?.clientId || "");
      if (!clientId) return;
      const current = byClient.get(clientId) || {
        clientId,
        clientName: ticket?.clientName || "-"
      };
      byClient.set(clientId, current);
    });
    return Array.from(byClient.values()).map((item) => {
      const balance = batchClientBalances[item.clientId] || {};
      const depositUzs = normalizeMoneyInput(balance.depositUzs);
      const debtUzs = normalizeMoneyInput(balance.debtUzs);
      return {
        ...item,
        depositUzs,
        debtUzs
      };
    });
  }, [batchPaymentTickets, batchClientBalances]);
  const batchPaymentClient = batchClientSummaries[0] || null;
  const batchPaymentClientName = String(batchPaymentClient?.clientName || batchPaymentTickets[0]?.clientName || "-").trim() || "-";
  const batchDepositTotalUzs = useMemo(() => (
    batchPaymentRows.reduce((sum, row) => row.source === "deposit" ? sum + normalizeMoneyInput(row.amountUzs) : sum, 0)
  ), [batchPaymentRows]);
  const batchExternalTotalUzs = Math.max(batchPaidTotalUzs - batchDepositTotalUzs, 0);

  useEffect(() => {
    setSelectedTicketIds((current) => {
      const ticketClientIds = new Map(
        board.issuedTickets.map((ticket) => [String(ticket?.id || ""), getTicketClientId(ticket)])
      );
      const next = new Set();
      let scopeClientId = "";
      current.forEach((id) => {
        const clientId = ticketClientIds.get(String(id)) || "";
        if (!clientId) return;
        if (!scopeClientId) {
          scopeClientId = clientId;
        }
        if (clientId === scopeClientId) {
          next.add(String(id));
        }
      });
      if (next.size === current.size && Array.from(next).every((id) => current.has(id))) {
        return current;
      }
      return next;
    });
  }, [board.issuedTickets]);

  const loadBoard = useCallback(async () => {
    const requestId = boardRequestRef.current + 1;
    boardRequestRef.current = requestId;
    const isCurrentRequest = () => requestId === boardRequestRef.current;
    setBoardLoading(true);
    try {
      const query = new URLSearchParams({ limit: String(boardLimit) });
      query.set("dateFrom", boardPeriodBounds.dateFrom);
      query.set("dateTo", boardPeriodBounds.dateTo);
      const clientQuery = String(boardFilters.clientQuery || "").trim();
      const specialistId = String(boardFilters.specialistId || "").trim();
      if (clientQuery) {
        query.set("clientQuery", clientQuery);
      }
      if (specialistId) {
        query.set("specialistId", specialistId);
      }
      const response = await apiFetch(`/api/finance/cashier/board?${query.toString()}`);
      const data = await readApiResponseData(response);
      if (!isCurrentRequest()) return;
      if (!response.ok) {
        const nextMessage = data?.message || "Failed to load cashier board.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      setBoard({
        pendingAppointments: Array.isArray(data?.pendingAppointments) ? data.pendingAppointments : [],
        cancelledAppointments: Array.isArray(data?.cancelledAppointments) ? data.cancelledAppointments : [],
        noShowAppointments: Array.isArray(data?.noShowAppointments) ? data.noShowAppointments : [],
        overdueConfirmedAppointments: Array.isArray(data?.overdueConfirmedAppointments)
          ? data.overdueConfirmedAppointments.map((item) => ({ ...item, boardGroup: "overdue-ticket" }))
          : [],
        issuedTickets: Array.isArray(data?.issuedTickets) ? data.issuedTickets : [],
        paymentMethods: Array.isArray(data?.paymentMethods) ? data.paymentMethods : [],
        services: Array.isArray(data?.services) ? data.services : [],
        specialists: Array.isArray(data?.specialists) ? data.specialists : [],
        nextTicketNumber: data?.nextTicketNumber ?? data?.next_ticket_number ?? null,
        totals: data?.totals && typeof data.totals === "object" ? data.totals : {},
        limit: normalizeBoardTotal(data?.limit, boardLimit)
      });
      setMessage("");
    } catch {
      if (!isCurrentRequest()) return;
      setMessage("Failed to load cashier board.");
      window.alert?.(translate("Failed to load cashier board."));
    } finally {
      if (isCurrentRequest()) {
        setBoardLoading(false);
      }
    }
  }, [boardFilters.clientQuery, boardFilters.specialistId, boardLimit, boardPeriodBounds.dateFrom, boardPeriodBounds.dateTo, translate]);

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

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    loadCashSession();
  }, [loadCashSession]);

  useEffect(() => {
    if (!appointmentTicketSource || appointmentDiscountTouched) {
      return undefined;
    }
    const appointmentId = String(appointmentTicketSource.id || "").trim();
    const serviceId = String(appointmentTicketForm.serviceId || "").trim();
    const priceUzs = normalizeMoneyInput(appointmentTicketForm.priceUzs || appointmentTicketSource.servicePriceUzs);
    if (!appointmentId || !serviceId || priceUzs <= 0) {
      return undefined;
    }

    let cancelled = false;
    const requestId = appointmentDiscountPreviewRequestRef.current + 1;
    appointmentDiscountPreviewRequestRef.current = requestId;
    setAppointmentDiscountPreviewLoading(true);
    const timeoutId = globalThis.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/finance/cashier/appointments/${encodeURIComponent(appointmentId)}/ticket-discount-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountUzs: priceUzs,
            items: [{
              serviceId,
              serviceName: getAppointmentTicketServiceName({
                source: appointmentTicketSource,
                services: board.services,
                serviceId
              }),
              specialistId: appointmentTicketSource.specialistId,
              priceUzs
            }]
          })
        });
        const data = await readApiResponseData(response);
        if (cancelled || appointmentDiscountPreviewRequestRef.current !== requestId || !response.ok) {
          setAppointmentDiscountLocked(false);
          return;
        }
        const previewItem = Array.isArray(data?.item?.items) ? data.item.items[0] : null;
        const discountType = String(previewItem?.discountType || "amount");
        const discountUzs = normalizeMoneyInput(previewItem?.discountUzs ?? data?.item?.discountUzs);
        const discountValue = discountType === "percent"
          ? normalizeMoneyInput(previewItem?.discountValue)
          : discountUzs;
        setAppointmentDiscountLocked(discountUzs > 0 && Boolean(previewItem?.clientDiscountRuleId));
        setAppointmentTicketForm((current) => {
          const currentServiceId = String(current.serviceId || "").trim();
          const currentPriceUzs = normalizeMoneyInput(current.priceUzs || appointmentTicketSource.servicePriceUzs);
          if (currentServiceId !== serviceId || currentPriceUzs !== priceUzs) {
            return current;
          }
          return {
            ...current,
            discountType: discountUzs > 0 ? discountType : "amount",
            discountValue: String(discountUzs > 0 ? discountValue : 0)
          };
        });
      } catch {
        if (!cancelled && appointmentDiscountPreviewRequestRef.current === requestId) {
          setAppointmentDiscountLocked(false);
          setAppointmentTicketForm((current) => ({
            ...current,
            discountType: "amount",
            discountValue: "0"
          }));
        }
      } finally {
        if (!cancelled && appointmentDiscountPreviewRequestRef.current === requestId) {
          setAppointmentDiscountPreviewLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, [
    appointmentDiscountTouched,
    appointmentTicketForm.priceUzs,
    appointmentTicketForm.serviceId,
    appointmentTicketSource,
    board.services
  ]);

  useEffect(() => {
    if (!manualModalOpen) {
      return undefined;
    }
    const query = clientSearch.trim();
    if (!query || (!/^\d+$/.test(query) && query.length < 3)) {
      setClientSearchBusy(false);
      return undefined;
    }
    let cancelled = false;
    const timeoutId = globalThis.setTimeout(async () => {
      setClientSearchBusy(true);
      try {
        const response = await apiFetch(`/api/finance/cashier/clients?q=${encodeURIComponent(query)}&limit=30`);
        const data = await readApiResponseData(response);
        if (cancelled) return;
        if (!response.ok) {
          window.alert?.(translate(data?.message || "Failed to search clients."));
          return;
        }
        setClientOptions((Array.isArray(data?.items) ? data.items : []).map((item) => ({
          value: String(item.id),
          label: `${item.fullName || item.id}${item.phone ? ` - ${item.phone}` : ""}`
        })));
      } catch {
        if (!cancelled) {
          window.alert?.(translate("Failed to search clients."));
        }
      } finally {
        if (!cancelled) {
          setClientSearchBusy(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, [clientSearch, manualModalOpen, translate]);

  const closeManualModal = (force = false) => {
    if (manualSubmitting && !force) return;
    setManualModalOpen(false);
    setManualForm(createManualForm());
    setClientSearch("");
    setClientOptions([]);
  };

  const openManualModal = () => {
    setManualForm(createManualForm());
    setClientSearch("");
    setClientOptions([]);
    setManualModalOpen(true);
  };

  const updateManualItem = (key, updates) => {
    setManualForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.key === key ? { ...item, ...updates } : item))
    }));
  };

  const addManualItem = () => {
    setManualForm((current) => ({
      ...current,
      items: [...current.items, createManualItem()]
    }));
  };

  const removeManualItem = (key) => {
    setManualForm((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((item) => item.key !== key) : current.items
    }));
  };

  const getManualItemService = useCallback((item) => (
    board.services.find((service) => String(service.id) === String(item?.serviceId || "")) || null
  ), [board.services]);

  const getManualItemPrice = useCallback((item) => {
    const service = getManualItemService(item);
    const catalogPriceUzs = normalizeMoneyInput(service?.priceUzs);
    return catalogPriceUzs > 0 ? catalogPriceUzs : normalizeMoneyInput(item?.priceUzs);
  }, [getManualItemService]);

  const openAppointmentTicketModal = (item) => {
    if (!canCreateFinanceCashier) return;
    setAppointmentTicketSource(item);
    setAppointmentTicketForm(createAppointmentTicketForm(item));
    setAppointmentDiscountTouched(false);
    setAppointmentDiscountLocked(false);
    setAppointmentDiscountPreviewLoading(false);
  };

  const updateAppointmentStatus = async (item, status, { reload = true } = {}) => {
    const id = String(item?.id || "");
    const nextStatus = normalizeStatusKey(status);
    if (!id || !nextStatus || busyId || !canUpdateFinanceCashier) return null;
    setBusyId(`status-${id}`);
    try {
      const response = await apiFetch(`/api/finance/cashier/appointments/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Appointment update failed."));
        return null;
      }
      const updatedItem = {
        ...item,
        ...(data?.item || {}),
        status: nextStatus
      };
      if (reload) await loadBoard();
      return updatedItem;
    } catch {
      window.alert?.(translate("Appointment update failed."));
      return null;
    } finally {
      setBusyId("");
    }
  };

  const openAppointmentTicketFromCard = async (item) => {
    if (!item || busyId || !canCreateFinanceCashier) return;
    openAppointmentTicketModal(item);
  };

  const getCreateTicketDoubleClickProps = (item) => ({
    onDoubleClick: () => {
      void openAppointmentTicketFromCard(item);
    },
    actionTitle: translate("Double-click to create ticket")
  });

  const closeAppointmentTicketModal = (force = false) => {
    if (appointmentTicketSubmitting && !force) return;
    setAppointmentTicketSource(null);
    setAppointmentTicketForm(EMPTY_APPOINTMENT_TICKET_FORM);
    setAppointmentDiscountTouched(false);
    setAppointmentDiscountLocked(false);
    setAppointmentDiscountPreviewLoading(false);
  };

  const submitAppointmentTicket = async (event) => {
    event.preventDefault();
    const item = appointmentTicketSource;
    const id = String(item?.id || "");
    if (!id || appointmentTicketSubmitting || !canCreateFinanceCashier) return;
    const serviceId = String(appointmentTicketForm.serviceId || "").trim();
    const priceUzs = normalizeMoneyInput(appointmentTicketForm.priceUzs);
    if (!serviceId) {
      window.alert?.(translate("Service is required."));
      return;
    }
    if (priceUzs <= 0) {
      window.alert?.(translate("Ticket amount is required."));
      return;
    }
    setAppointmentTicketSubmitting(true);
    setBusyId(`create-${id}`);
    try {
      const payload = {
        appointmentScheduleId: id,
        amountUzs: priceUzs,
        note: appointmentTicketForm.note
      };
      const ticketItem = {
        serviceId,
        serviceName: getAppointmentTicketServiceName({
          source: item,
          services: board.services,
          serviceId
        }),
        specialistId: item.specialistId,
        priceUzs
      };
      if (appointmentDiscountTouched) {
        ticketItem.discountType = appointmentTicketForm.discountType;
        ticketItem.discountValue = appointmentTicketForm.discountValue;
        ticketItem.discountUzs = appointmentDiscountUzs;
      }
      payload.items = [ticketItem];
      const response = await apiFetch("/api/finance/cashier/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Ticket create failed."));
        return;
      }
      closeAppointmentTicketModal(true);
      await loadBoard();
    } catch {
      window.alert?.(translate("Ticket create failed."));
    } finally {
      setBusyId("");
      setAppointmentTicketSubmitting(false);
    }
  };

  const markUnpaid = async (item) => {
    const id = String(item?.id || "");
    if (!id || busyId || !canUpdateFinanceCashier) return;
    setBusyId(`unpaid-${id}`);
    try {
      const response = await apiFetch(`/api/finance/cashier/tickets/${id}/unpaid`, { method: "POST" });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Ticket update failed."));
        return;
      }
      await loadBoard();
    } catch {
      window.alert?.(translate("Ticket update failed."));
    } finally {
      setBusyId("");
    }
  };

  const toggleTicketSelection = (item, checked) => {
    const id = String(item?.id || "");
    if (!id) return;
    const clientId = getTicketClientId(item);
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      if (checked) {
        const scopeClientId = getSelectedTicketClientId(current, board.issuedTickets);
        if (scopeClientId && clientId !== scopeClientId) {
          return current;
        }
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const loadBatchClientBalances = async (tickets) => {
    const clientIds = Array.from(new Set(
      (Array.isArray(tickets) ? tickets : [])
        .map((ticket) => String(ticket?.clientId || "").trim())
        .filter(Boolean)
    ));
    setBatchClientBalances({});
    if (clientIds.length === 0) return;
    setBatchClientBalancesLoading(true);
    try {
      const query = new URLSearchParams({
        clientIds: clientIds.join(","),
        type: "all",
        pageSize: String(Math.max(clientIds.length, 20))
      });
      const response = await apiFetch(`/api/finance/client-balances?${query.toString()}`);
      const data = await readApiResponseData(response);
      if (!response.ok) return;
      const nextBalances = {};
      (Array.isArray(data?.items) ? data.items : []).forEach((item) => {
        const clientId = String(item?.clientId || "");
        if (!clientId) return;
        nextBalances[clientId] = item;
      });
      setBatchClientBalances(nextBalances);
    } finally {
      setBatchClientBalancesLoading(false);
    }
  };

  const openBatchPaymentModal = (item) => {
    if (!canPayFinanceCashier) return;
    if (!cashSession) {
      window.alert?.(translate("Cash is closed. Open cash before accepting payments."));
      return;
    }
    const selectedItems = board.issuedTickets.filter((ticket) => selectedTicketIds.has(String(ticket.id)));
    const scopeClientId = selectedItems.length > 0
      ? getSelectedTicketClientId(selectedTicketIds, board.issuedTickets)
      : getTicketClientId(item);
    const candidates = selectedItems.length > 0 ? selectedItems : (item ? [item] : selectedItems);
    const nextTickets = candidates.filter((ticket) => getTicketClientId(ticket) === scopeClientId);
    if (nextTickets.length === 0) return;
    const totalUzs = nextTickets.reduce((sum, ticket) => sum + getTicketPayableAmount(ticket), 0);
    setBatchPaymentTickets(nextTickets);
    setBatchPaymentRows([createBatchPaymentRow(totalUzs)]);
    setBatchPaymentNote("");
    void loadBatchClientBalances(nextTickets);
  };

  const closeBatchPaymentModal = (force = false) => {
    if (batchPaymentSubmitting && !force) return;
    setBatchPaymentTickets([]);
    setBatchPaymentRows([createBatchPaymentRow()]);
    setBatchPaymentNote("");
    setBatchClientBalances({});
    setBatchClientBalancesLoading(false);
  };

  const updateBatchPaymentRow = (key, updates) => {
    setBatchPaymentRows((current) => current.map((row) => {
      if (row.key !== key) return row;
      const nextUpdates = { ...updates };
      if (Object.prototype.hasOwnProperty.call(nextUpdates, "amountUzs")) {
        nextUpdates.amountUzs = clampBatchPaymentAmountInput(
          nextUpdates.amountUzs,
          getBatchPaymentRowAmountLimit(current, key, batchPaymentTotalUzs)
        );
      }
      const next = { ...row, ...nextUpdates };
      if (Object.prototype.hasOwnProperty.call(nextUpdates, "source")) {
        next.paymentMethodId = "";
        next.clientId = "";
      }
      return next;
    }));
  };

  const addBatchPaymentRow = () => {
    setBatchPaymentRows((current) => [...current, createBatchPaymentRow(batchRemainingUzs > 0 ? batchRemainingUzs : "")]);
  };

  const removeBatchPaymentRow = (key) => {
    setBatchPaymentRows((current) => current.length > 1 ? current.filter((row) => row.key !== key) : current);
  };

  const appointmentPriceUzs = normalizeMoneyInput(appointmentTicketForm.priceUzs || appointmentTicketSource?.servicePriceUzs);
  const appointmentDiscountUzs = calculateDiscount(
    appointmentPriceUzs,
    appointmentTicketForm.discountType,
    appointmentTicketForm.discountValue
  );
  const appointmentFinalUzs = Math.max(appointmentPriceUzs - appointmentDiscountUzs, 0);

  const manualTotals = useMemo(() => {
    const subtotalUzs = manualForm.items.reduce(
      (sum, item) => sum + getManualItemPrice(item),
      0
    );
    const discountUzs = calculateDiscount(subtotalUzs, manualForm.discountType, manualForm.discountValue);
    return {
      subtotalUzs,
      discountUzs,
      totalUzs: Math.max(subtotalUzs - discountUzs, 0)
    };
  }, [getManualItemPrice, manualForm.discountType, manualForm.discountValue, manualForm.items]);
  const manualAmountDiscountExceedsSubtotal = manualForm.discountType !== "percent"
    && normalizeMoneyInput(manualForm.discountValue) > manualTotals.subtotalUzs;
  const maxManualTicketDate = todayDateValue();

  useEscapeKey(Boolean(batchPaymentTickets.length > 0 || appointmentTicketSource || manualModalOpen), () => {
    if (batchPaymentTickets.length > 0) {
      closeBatchPaymentModal();
      return;
    }
    if (appointmentTicketSource) {
      closeAppointmentTicketModal();
      return;
    }
    if (manualModalOpen) {
      closeManualModal();
    }
  });

  const submitBatchPayment = async (event) => {
    event.preventDefault();
    if (batchPaymentSubmitting || !canPayFinanceCashier) return;
    const ticketIds = batchPaymentTickets.map((ticket) => Number.parseInt(String(ticket.id), 10)).filter(Boolean);
    const batchClientIds = new Set(batchPaymentTickets.map(getTicketClientId).filter(Boolean));
    if (batchClientIds.size !== 1) {
      window.alert?.(translate("Select tickets from one client only."));
      return;
    }
    const batchClientId = Array.from(batchClientIds)[0] || "";
    const payments = batchPaymentRows
      .map((row) => {
        const source = row.source === "deposit" ? "deposit" : "method";
        const payment = {
          source,
          amountUzs: normalizeMoneyInput(row.amountUzs)
        };
        if (source === "deposit") {
          payment.clientId = batchClientId;
        } else {
          payment.paymentMethodId = String(row.paymentMethodId || "").trim();
        }
        return payment;
      })
      .filter((row) => row.amountUzs > 0 && (row.source === "deposit" ? row.clientId : row.paymentMethodId));
    if (ticketIds.length === 0) return;
    if (payments.length === 0) {
      window.alert?.(translate("Payment method is required."));
      return;
    }
    const paymentTotalUzs = payments.reduce((sum, row) => sum + normalizeMoneyInput(row.amountUzs), 0);
    if (paymentTotalUzs > batchPaymentTotalUzs) {
      window.alert?.(translate("Payment amount exceeds selected tickets total."));
      return;
    }
    setBatchPaymentSubmitting(true);
    try {
      const response = await apiFetch("/api/finance/cashier/tickets/pay-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketIds,
          payments,
          note: batchPaymentNote
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Ticket payment failed."));
        return;
      }
      closeBatchPaymentModal(true);
      setSelectedTicketIds(new Set());
      await Promise.all([loadBoard(), loadCashSession()]);
    } catch {
      window.alert?.(translate("Ticket payment failed."));
    } finally {
      setBatchPaymentSubmitting(false);
    }
  };

  const submitManualTicket = async (event) => {
    event.preventDefault();
    if (manualSubmitting || !canCreateFinanceCashier) return;
    const clientId = String(manualForm.clientId || "").trim();
    const ticketDate = String(manualForm.ticketDate || "").trim();
    if (!clientId) {
      window.alert?.(translate("Client is required."));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ticketDate)) {
      window.alert?.(translate("Ticket date is required."));
      return;
    }
    if (isFutureDateValue(ticketDate)) {
      window.alert?.(translate("Future ticket dates are not allowed."));
      return;
    }
    const manualItemsWithServices = manualForm.items.map((item) => ({
      item,
      service: getManualItemService(item),
      priceUzs: getManualItemPrice(item)
    }));
    for (const { item, priceUzs } of manualItemsWithServices) {
      if (!String(item.specialistId || "").trim()) {
        window.alert?.(translate("Specialist is required."));
        return;
      }
      if (!String(item.serviceId || "").trim()) {
        window.alert?.(translate("Service is required."));
        return;
      }
      if (priceUzs <= 0) {
        window.alert?.(translate("Service price is required."));
        return;
      }
    }
    if (manualTotals.subtotalUzs <= 0) {
      window.alert?.(translate("Ticket amount is required."));
      return;
    }
    if (manualAmountDiscountExceedsSubtotal) {
      window.alert?.(translate("Discount cannot be greater than ticket amount."));
      return;
    }
    const manualItemDiscounts = distributeDiscountUzs(
      manualItemsWithServices.map(({ priceUzs }) => priceUzs),
      manualTotals.discountUzs
    );
    setManualSubmitting(true);
    try {
      const response = await apiFetch("/api/finance/cashier/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          ticketDate,
          items: manualForm.items.map((item, index) => ({
            specialistId: item.specialistId,
            serviceId: item.serviceId,
            priceUzs: manualItemsWithServices[index]?.priceUzs || 0,
            discountType: manualForm.discountType === "percent" ? "percent" : "amount",
            discountValue: manualForm.discountType === "percent"
              ? manualForm.discountValue
              : manualItemDiscounts[index] || 0,
            discountUzs: manualItemDiscounts[index] || 0
          })),
          note: manualForm.note
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Ticket create failed."));
        return;
      }
      closeManualModal(true);
      await loadBoard();
    } catch {
      window.alert?.(translate("Ticket create failed."));
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <section id="financeCashierPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-cashier-panel">
      <div className="all-users-head">
        <h3>{translate("Cashier")}</h3>
        <div className="all-users-head-actions">
          <div className="finance-board-head-select-filter finance-board-head-period-filter" aria-label={translate("Period")}>
            <CustomSelect
              value={boardFilters.period}
              options={boardPeriodOptions}
              placeholder={translate("Period")}
              menuPortal
              maxVisibleOptions={3}
              onChange={(value) => {
                setBoardLimit(CASHIER_BOARD_LIMIT_STEP);
                setBoardFilters((current) => ({
                  ...current,
                  period: value || CASHIER_BOARD_PERIOD_TODAY
                }));
              }}
            />
          </div>
          <input
            type="search"
            className="panel-search-input finance-board-head-client-filter"
            value={boardFilters.clientQuery}
            aria-label={translate("Client")}
            placeholder={translate("Client")}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setBoardLimit(CASHIER_BOARD_LIMIT_STEP);
              setBoardFilters((current) => ({ ...current, clientQuery: value }));
            }}
          />
          <div className="finance-board-head-select-filter" aria-label={translate("Specialist")}>
            <CustomSelect
              value={boardFilters.specialistId}
              options={[{ value: "", label: translate("All specialists"), selectedLabel: translate("Specialist") }, ...specialistOptions]}
              placeholder={translate("Specialist")}
              searchable
              searchPlaceholder={translate("Specialist")}
              searchThreshold={1}
              menuPortal
              maxVisibleOptions={8}
              onChange={(value) => {
                setBoardLimit(CASHIER_BOARD_LIMIT_STEP);
                setBoardFilters((current) => ({ ...current, specialistId: value }));
              }}
            />
          </div>
          <button
            type="button"
            className="table-action-btn finance-board-head-reset"
            disabled={!isBoardFilterActive}
            onClick={() => {
              setBoardLimit(CASHIER_BOARD_LIMIT_STEP);
              setBoardFilters({
                period: CASHIER_BOARD_PERIOD_TODAY,
                clientQuery: "",
                specialistId: ""
              });
            }}
          >
            {translate("Reset")}
          </button>
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            hidden={!canCreateFinanceCashier}
            aria-label={translate("Create Manual Ticket")}
            title={translate("Create Manual Ticket")}
            onClick={openManualModal}
          >
            <span className="finance-head-icon finance-head-icon-ticket" aria-hidden="true" />
          </button>
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close cashier panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="settings-card-grid finance-board-grid">
        <section className="settings-card-column">
          <BoardColumnTitle
            count={visibleBoard.pendingAppointments.length}
            total={getBoardDisplayTotal("pendingAppointments")}
            label="Pending Appointments"
            translate={translate}
          />
          {visibleBoard.pendingAppointments.map((item) => (
            <TicketCard
              key={String(item.id)}
              item={item}
              compact
              showShortDate
              {...getCreateTicketDoubleClickProps(item)}
            />
          ))}
          {visibleBoard.pendingAppointments.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

        <section className="settings-card-column">
          <BoardColumnTitle count={visibleBoard.cancelledAppointments.length} total={getBoardDisplayTotal("cancelledAppointments")} label="Cancelled" translate={translate} />
          {visibleBoard.cancelledAppointments.map((item) => (
            <TicketCard
              key={String(item.id)}
              item={item}
              translate={translate}
              compact
              showShortDate
            />
          ))}
          {visibleBoard.cancelledAppointments.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

        <section className="settings-card-column">
          <BoardColumnTitle count={visibleBoard.noShowAppointments.length} total={getBoardDisplayTotal("noShowAppointments")} label="No-show" translate={translate} />
          {visibleBoard.noShowAppointments.map((item) => (
            <TicketCard
              key={String(item.id)}
              item={item}
              translate={translate}
              compact
              showShortDate
            />
          ))}
          {visibleBoard.noShowAppointments.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

        <section className="settings-card-column finance-board-readonly-column">
          <BoardColumnTitle count={visibleBoard.overdueConfirmedAppointments.length} total={getBoardDisplayTotal("overdueConfirmedAppointments")} label="Awaiting Ticket" translate={translate} />
          {visibleBoard.overdueConfirmedAppointments.map((item) => (
            <TicketCard
              key={String(item.id)}
              item={item}
              compact
              showShortDate
              {...getCreateTicketDoubleClickProps(item)}
            />
          ))}
          {visibleBoard.overdueConfirmedAppointments.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

        <section className="settings-card-column">
          <BoardColumnTitle count={selectedTicketCount} total={getBoardDisplayTotal("issuedTickets")} label="Tickets" translate={translate} />
          {visibleBoard.issuedTickets.map((item) => {
            const itemId = String(item.id);
            const selected = selectedTicketIds.has(itemId);
            const selectionDisabled = Boolean(
              selectedTicketClientId
              && getTicketClientId(item) !== selectedTicketClientId
              && !selected
            );
            return (
              <TicketCard
                key={itemId}
                item={item}
                compact
                showShortDate
                selectable
                selected={selected}
                selectableDisabled={selectionDisabled}
                selectableDisabledTitle={translate("Select tickets from one client only.")}
                onSelectionChange={(checked) => toggleTicketSelection(item, checked)}
                onDoubleClick={() => openBatchPaymentModal(item)}
                actionTitle={selectedTicketCount > 0 ? translate("Double-click to pay selected tickets") : translate("Double-click to pay ticket")}
              />
            );
          })}
          {visibleBoard.issuedTickets.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

      </div>

      {hasMoreBoardItems ? (
        <div className="finance-board-load-more-row">
          <button
            type="button"
            className="table-action-btn finance-board-load-more"
            disabled={boardLoading}
            onClick={loadMoreBoardItems}
          >
            <span>{translate("Show more")}</span>
            <span className="finance-board-load-more-icon" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {batchPaymentTickets.length > 0 && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            style={FINANCE_MODAL_OVERLAY_STYLE}
            aria-label={translate("Close ticket payment modal")}
            onClick={() => closeBatchPaymentModal()}
          />
          <div id="financeBatchPaymentModal" className="logout-confirm-modal all-users-edit-modal finance-modal">
            <h3 className="finance-modal-title-with-number">
              <span>{translate("Ticket Payment")}</span>
              <span className="finance-modal-ticket-number">{formatTicketCountLabel(translate, batchPaymentTickets)}</span>
            </h3>
            <form className="auth-form" onSubmit={submitBatchPayment}>
              <div className="all-users-edit-fields finance-payment-checkout">
                <div className="finance-payment-checkout-top">
                  <section className="finance-payment-checkout-panel finance-batch-client-balances" aria-busy={batchClientBalancesLoading ? "true" : "false"}>
                    <header className="finance-payment-panel-head">
                      <span>{translate("Client Balances")}</span>
                    </header>
                    <span className="finance-batch-client-balance-head-cell">{translate("Client")}</span>
                    <span className="finance-batch-client-balance-head-cell is-amount">{translate("Deposit")}</span>
                    <span className="finance-batch-client-balance-head-cell is-amount">{translate("Debt")}</span>
                    {batchClientSummaries.map((client) => (
                      <Fragment key={client.clientId}>
                        <strong className="finance-batch-client-balance-client">{client.clientName}</strong>
                        <span className="finance-batch-client-balance-value">{formatMoney(client.depositUzs)}</span>
                        <span className={`finance-batch-client-balance-value${client.debtUzs > 0 ? " finance-balance-negative" : ""}`}>{formatMoney(client.debtUzs)}</span>
                      </Fragment>
                    ))}
                  </section>

                  <section
                    className={`finance-payment-checkout-summary finance-ticket-summary finance-ticket-total${batchOverpaidUzs > 0 ? " is-overpaid" : ""}${batchRemainingUzs === 0 && batchPaidTotalUzs > 0 ? " is-balanced" : ""}`}
                    aria-label={translate("Ticket Payment")}
                  >
                    <div className="finance-total-cell finance-total-cell-total"><strong>{translate("Total To Pay")}</strong><span>{formatMoney(batchPaymentTotalUzs)}</span></div>
                    <div className="finance-total-cell finance-total-cell-external"><strong>{translate("External Payment")}</strong><span>{formatMoney(batchExternalTotalUzs)}</span></div>
                    <div className="finance-total-cell finance-total-cell-deposit"><strong>{translate("From Client Balance")}</strong><span>{formatMoney(batchDepositTotalUzs)}</span></div>
                  </section>
                </div>

                <section className="finance-payment-checkout-panel finance-payment-tickets-panel">
                  <header className="finance-payment-panel-head">
                    <span>{translate("Tickets")}</span>
                  </header>
                  <div className="finance-batch-ticket-list">
                    <div className="finance-batch-ticket-head">
                      <span className="finance-batch-ticket-cell is-number">{translate("Ticket Number")}</span>
                      <span className="finance-batch-ticket-cell is-date">{translate("Ticket Date")}</span>
                      <span className="finance-batch-ticket-cell is-specialist">{translate("Specialist")}</span>
                      <span className="finance-batch-ticket-cell is-service">{translate("Service")}</span>
                      <span className="finance-batch-ticket-cell is-money">{translate("Service Price")}</span>
                      <span className="finance-batch-ticket-cell is-money">{translate("Discount")}</span>
                      <span className="finance-batch-ticket-cell is-money is-payable">{translate("To Pay")}</span>
                      <span className="finance-batch-ticket-cell is-money is-paid">{translate("Paid")}</span>
                    </div>
                    {batchPaymentTickets.map((ticket) => (
                      <div className="finance-batch-ticket-group" key={String(ticket.id)}>
                        <strong className="finance-batch-ticket-cell is-number">{formatTicketNumber(ticket.ticketNumber)}</strong>
                        <span className="finance-batch-ticket-cell is-date">{formatDateYMD(ticket.ticketDate || ticket.appointmentDate)}</span>
                        <span className="finance-batch-ticket-cell is-specialist">{getTicketSpecialistSummary(ticket)}</span>
                        <span className="finance-batch-ticket-cell is-service">{getTicketServiceSummary(ticket)}</span>
                        <span className="finance-batch-ticket-cell is-money">{formatMoney(getTicketServicePriceAmount(ticket))}</span>
                        <span className="finance-batch-ticket-cell is-money">{formatMoney(getTicketDiscountAmount(ticket))}</span>
                        <span className="finance-batch-ticket-cell is-money is-payable">{formatMoney(getTicketTotalPayableAmount(ticket))}</span>
                        <span className="finance-batch-ticket-cell is-money is-paid">{formatMoney(getTicketPaidAmount(ticket))}</span>
                        {getTicketLineItems(ticket).length > 1 ? (
                          <div className="finance-batch-ticket-lines">
                            {getTicketLineItems(ticket).map((lineItem, lineIndex) => (
                              <div className="finance-batch-ticket-line" key={`${lineItem?.id || lineItem?.lineNumber || lineIndex}-${lineIndex}`}>
                                <span className="finance-batch-ticket-line-cell is-specialist">{lineItem?.specialistName || "-"}</span>
                                <strong className="finance-batch-ticket-line-cell is-service">{lineItem?.serviceName || "-"}</strong>
                                <span className="finance-batch-ticket-line-cell is-money is-price">{formatMoney(getTicketLineServicePriceAmount(lineItem))}</span>
                                <span className="finance-batch-ticket-line-cell is-money is-discount">{formatMoney(lineItem?.discountUzs)}</span>
                                <span className="finance-batch-ticket-line-cell is-money is-payable">{formatMoney(getTicketLineFinalAmount(lineItem))}</span>
                                <span className="finance-batch-ticket-line-cell is-money is-paid">{formatMoney(getTicketLinePaidAmount(ticket, lineIndex))}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="finance-payment-checkout-panel finance-batch-payment-methods">
                  <header className="finance-payment-panel-head">
                    <span>{translate("Payment Sources")}</span>
                  </header>
                  <div className="finance-batch-payment-list">
                    {batchPaymentRows.map((row) => {
                      const rowAmountLimit = getBatchPaymentRowAmountLimit(batchPaymentRows, row.key, batchPaymentTotalUzs);
                      return (
                      <Fragment key={row.key}>
                        <label className={`field finance-batch-payment-source finance-batch-payment-source-${row.source === "deposit" ? "deposit" : "method"}`}>
                          <CustomSelect
                            value={row.source || "method"}
                            options={[
                              { value: "method", label: translate("External Payment") },
                              { value: "deposit", label: translate("From Client Balance") }
                            ]}
                            menuPortal
                            onChange={(value) => updateBatchPaymentRow(row.key, { source: value })}
                          />
                        </label>
                        {row.source === "deposit" ? (
                          <div className="finance-batch-payment-target finance-batch-payment-client-locked" aria-label={translate("Client")}>
                            <span>{batchPaymentClientName}</span>
                          </div>
                        ) : (
                          <label className="field finance-batch-payment-target">
                            <CustomSelect
                              value={row.paymentMethodId}
                              options={paymentMethodOptions}
                              placeholder={translate("Payment Method")}
                              menuPortal
                              onChange={(value) => updateBatchPaymentRow(row.key, { paymentMethodId: value })}
                            />
                          </label>
                        )}
                        <label className="field finance-batch-payment-amount">
                          <input
                            type="number"
                            min="0"
                            max={rowAmountLimit}
                            step="1"
                            placeholder={translate("Amount")}
                            aria-label={translate("Amount")}
                            value={row.amountUzs}
                            onWheel={(event) => event.currentTarget.blur()}
                            onChange={(event) => updateBatchPaymentRow(row.key, { amountUzs: event.currentTarget.value })}
                          />
                        </label>
                        <div className="finance-batch-payment-actions">
                          <button
                            type="button"
                            className="table-action-btn finance-manual-icon-btn finance-manual-add-btn"
                            aria-label={translate("Add")}
                            title={translate("Add")}
                            onClick={addBatchPaymentRow}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="table-action-btn finance-manual-icon-btn"
                            aria-label={translate("Remove")}
                            title={translate("Remove")}
                            disabled={batchPaymentRows.length <= 1}
                            onClick={() => removeBatchPaymentRow(row.key)}
                          >
                            ×
                          </button>
                        </div>
                      </Fragment>
                      );
                    })}
                  </div>
                </section>

                <label className="field finance-payment-note-field">
                  <span>{translate("Note")}</span>
                  <input
                    type="text"
                    maxLength={255}
                    value={batchPaymentNote}
                    onChange={(event) => setBatchPaymentNote(event.currentTarget.value)}
                  />
                </label>
              </div>

              <div className="edit-actions">
                <button type="button" className="btn btn-secondary" onClick={() => closeBatchPaymentModal()}>{translate("Cancel")}</button>
                <button
                  type="submit"
                  className="btn"
                  disabled={batchPaymentSubmitting || batchPaymentTotalUzs <= 0 || batchPaidTotalUzs <= 0 || batchOverpaidUzs > 0}
                >
                  {batchPaymentSubmitting ? "..." : translate("Pay")}
                </button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}

      {appointmentTicketSource && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            style={FINANCE_MODAL_OVERLAY_STYLE}
            aria-label={translate("Close ticket modal")}
            onClick={() => closeAppointmentTicketModal()}
          />
          <div id="financeAppointmentTicketModal" className="logout-confirm-modal all-users-edit-modal finance-modal">
            <h3 className="finance-modal-title-with-number">
              <span>{translate("Create Ticket")}</span>
              <span className="finance-modal-ticket-number">{formatTicketNumber(board.nextTicketNumber)}</span>
            </h3>
            <form className="auth-form" onSubmit={submitAppointmentTicket}>
              <div className="all-users-edit-fields">
                <div className="finance-manual-top-row">
                  <label className="field finance-manual-date-field">
                    <span>{translate("Ticket Date")}</span>
                    <input type="text" value={formatDateYMD(appointmentTicketSource.appointmentDate)} readOnly />
                  </label>
                  <label className="field finance-manual-client-select">
                    <span>{translate("Client")}</span>
                    <input type="text" value={appointmentTicketSource.clientName || "-"} readOnly />
                  </label>
                </div>

                <div className="finance-manual-items">
                  <div className="finance-manual-item">
                    <div className="settings-card-row finance-manual-item-head">
                      <strong>{`${translate("Bill")} 1`}</strong>
                    </div>
                    <div className="finance-manual-item-grid">
                      <label className="field">
                        <span>{translate("Specialist")}</span>
                        <input type="text" value={appointmentTicketSource.specialistName || "-"} readOnly />
                      </label>
                      <label className="field">
                        <span>{translate("Service")}</span>
                        <CustomSelect
                          value={appointmentTicketForm.serviceId}
                          options={appointmentServiceOptions}
                          placeholder={translate("Select service type")}
                          searchable
                          searchPlaceholder={translate("Search")}
                          searchThreshold={8}
                          menuPortal
                          onChange={(value) => {
                            const service = appointmentServiceOptions
                              .find((option) => option.value === String(value || ""))?.item || {};
                            setAppointmentDiscountTouched(false);
                            setAppointmentDiscountLocked(false);
                            setAppointmentTicketForm((current) => ({
                              ...current,
                              serviceId: value,
                              priceUzs: String(normalizeMoneyInput(service.priceUzs ?? current.priceUzs)),
                              discountType: "amount",
                              discountValue: "0"
                            }));
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="finance-ticket-summary finance-ticket-total">
                  <div className="finance-total-cell"><strong>{translate("Subtotal")}</strong><span>{formatMoney(appointmentPriceUzs)}</span></div>
                  <label className="field finance-total-cell">
                    <span>{translate("Discount Type")}</span>
                    <CustomSelect
                      value={appointmentTicketForm.discountType}
                      options={[
                        { value: "amount", label: translate("Amount") },
                        { value: "percent", label: translate("Percent") }
                      ]}
                      menuPortal
                      disabled={appointmentDiscountLocked || appointmentDiscountPreviewLoading}
                      onChange={(value) => {
                        if (appointmentDiscountLocked || appointmentDiscountPreviewLoading) return;
                        setAppointmentDiscountTouched(true);
                        setAppointmentTicketForm((current) => ({
                          ...current,
                          discountType: value,
                          discountValue: normalizeDiscountValueInput(value, current.discountValue)
                        }));
                      }}
                    />
                  </label>
                  <label className="field finance-total-cell">
                    <span>{appointmentDiscountPreviewLoading ? translate("Loading...") : translate("Discount")}</span>
                    <input
                      type="number"
                      min="0"
                      max={appointmentTicketForm.discountType === "percent" ? String(DISCOUNT_MAX_PERCENT_VALUE) : undefined}
                      value={appointmentTicketForm.discountValue}
                      disabled={appointmentDiscountLocked || appointmentDiscountPreviewLoading}
                      onChange={(event) => {
                        if (appointmentDiscountLocked || appointmentDiscountPreviewLoading) return;
                        const value = normalizeDiscountValueInput(appointmentTicketForm.discountType, event.currentTarget.value);
                        setAppointmentDiscountTouched(true);
                        setAppointmentTicketForm((current) => ({ ...current, discountValue: value }));
                      }}
                    />
                  </label>
                  <div className="finance-total-cell"><strong>{translate("Total")}</strong><span>{formatMoney(appointmentFinalUzs)}</span></div>
                </div>

                <label className="field">
                  <span>{translate("Note")}</span>
                  <input
                    type="text"
                    maxLength={255}
                    value={appointmentTicketForm.note}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setAppointmentTicketForm((current) => ({ ...current, note: value }));
                    }}
                  />
                </label>
              </div>

              <div className="edit-actions">
                <button type="button" className="btn btn-secondary" onClick={() => closeAppointmentTicketModal()}>{translate("Cancel")}</button>
                <button type="submit" className="btn" disabled={appointmentTicketSubmitting || appointmentPriceUzs <= 0}>
                  {appointmentTicketSubmitting ? "..." : translate("Save")}
                </button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}

      {manualModalOpen && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            style={FINANCE_MODAL_OVERLAY_STYLE}
            aria-label={translate("Close manual ticket modal")}
            onClick={() => closeManualModal()}
          />
          <div id="financeManualTicketModal" className="logout-confirm-modal all-users-edit-modal finance-modal">
            <h3 className="finance-modal-title-with-number">
              <span>{translate("Create Manual Ticket")}</span>
              <span className="finance-modal-ticket-number">{formatTicketNumber(board.nextTicketNumber)}</span>
            </h3>
            <form className="auth-form" onSubmit={submitManualTicket}>
              <div className="all-users-edit-fields">
                <div className="finance-manual-top-row">
                  <label className="field finance-manual-date-field">
                    <span>{translate("Ticket Date")}</span>
                    <input
                      type="date"
                      max={maxManualTicketDate}
                      value={manualForm.ticketDate}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setManualForm((current) => ({ ...current, ticketDate: value }));
                      }}
                    />
                  </label>
                  <label className="field finance-manual-client-select">
                    <span>{translate("Client")}</span>
                    <CustomSelect
                      value={manualForm.clientId}
                      options={clientOptions}
                      placeholder={translate("Select client")}
                      searchable
                      searchPlaceholder={translate("Search by name or ID")}
                      searchThreshold={0}
                      menuPortal
                      maxVisibleOptions={8}
                      emptyText={clientSearchBusy ? "..." : translate("No clients found.")}
                      onSearchChange={setClientSearch}
                      onChange={(value) => setManualForm((current) => ({ ...current, clientId: value }))}
                    />
                  </label>
                </div>

                <div className="finance-manual-items">
                  {manualForm.items.map((item, index) => {
                    const selectedService = getManualItemService(item);
                    const requiresManualPrice = Boolean(item.serviceId)
                      && normalizeMoneyInput(selectedService?.priceUzs) <= 0;
                    return (
                      <div className="finance-manual-item" key={item.key}>
                        <div className="settings-card-row finance-manual-item-head">
                          <strong>{`${translate("Bill")} ${index + 1}`}</strong>
                          <div className="finance-manual-item-actions">
                            <button
                              type="button"
                              className="table-action-btn finance-manual-icon-btn finance-manual-add-btn"
                              aria-label={translate("Add Service")}
                              title={translate("Add Service")}
                              onClick={addManualItem}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className="table-action-btn finance-manual-icon-btn"
                              aria-label={translate("Remove")}
                              title={translate("Remove")}
                              disabled={manualForm.items.length <= 1}
                              onClick={() => removeManualItem(item.key)}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        <div className={`finance-manual-item-grid${requiresManualPrice ? " has-manual-price" : ""}`}>
                          <label className="field">
                            <CustomSelect
                              value={item.specialistId}
                              options={specialistOptions}
                              placeholder={translate("Select specialist")}
                              searchable
                              searchThreshold={1}
                              menuPortal
                              emptyText={translate("No items found.")}
                              onChange={(value) => updateManualItem(item.key, { specialistId: value })}
                            />
                          </label>
                          <label className="field">
                            <CustomSelect
                              value={item.serviceId}
                              options={manualServiceOptions}
                              placeholder={translate("Select service type")}
                              searchable
                              searchThreshold={1}
                              menuPortal
                              emptyText={translate("No items found.")}
                              onChange={(value) => {
                                const service = board.services.find(
                                  (entry) => String(entry.id) === String(value || "")
                                );
                                const catalogPriceUzs = normalizeMoneyInput(service?.priceUzs);
                                updateManualItem(item.key, {
                                  serviceId: value,
                                  priceUzs: catalogPriceUzs > 0 ? String(catalogPriceUzs) : ""
                                });
                              }}
                            />
                          </label>
                          {requiresManualPrice ? (
                            <label className="field finance-manual-price-field">
                              <input
                                type="number"
                                min="1"
                                inputMode="numeric"
                                aria-label={translate("Price")}
                                placeholder={translate("Price")}
                                value={item.priceUzs}
                                onChange={(event) => updateManualItem(item.key, {
                                  priceUzs: event.currentTarget.value
                                })}
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="finance-ticket-summary finance-ticket-total">
                  <div className="finance-total-cell"><strong>{translate("Subtotal")}</strong><span>{formatMoney(manualTotals.subtotalUzs)}</span></div>
                  <label className="field finance-total-cell">
                    <span>{translate("Discount Type")}</span>
                    <CustomSelect
                      value={manualForm.discountType}
                      options={[
                        { value: "amount", label: translate("Amount") },
                        { value: "percent", label: translate("Percent") }
                      ]}
                      menuPortal
                      onChange={(value) => setManualForm((current) => ({
                        ...current,
                        discountType: value,
                        discountValue: normalizeDiscountValueInput(value, current.discountValue)
                      }))}
                    />
                  </label>
                  <label className="field finance-total-cell">
                    <span>{translate("Discount")}</span>
                    <input
                      type="number"
                      min="0"
                      max={manualForm.discountType === "percent" ? String(DISCOUNT_MAX_PERCENT_VALUE) : String(manualTotals.subtotalUzs || 0)}
                      value={manualForm.discountValue}
                      onChange={(event) => {
                        const value = normalizeDiscountValueInput(manualForm.discountType, event.currentTarget.value);
                        setManualForm((current) => ({ ...current, discountValue: value }));
                      }}
                    />
                  </label>
                  <div className="finance-total-cell"><strong>{translate("Total")}</strong><span>{formatMoney(manualTotals.totalUzs)}</span></div>
                </div>

                <label className="field">
                  <span>{translate("Note")}</span>
                  <input
                    type="text"
                    maxLength={255}
                    value={manualForm.note}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setManualForm((current) => ({ ...current, note: value }));
                    }}
                  />
                </label>
              </div>

              <div className="edit-actions">
                <button type="button" className="btn btn-secondary" onClick={() => closeManualModal()}>{translate("Cancel")}</button>
                <button type="submit" className="btn" disabled={manualSubmitting || manualTotals.subtotalUzs <= 0 || manualAmountDiscountExceedsSubtotal}>
                  {manualSubmitting ? "..." : translate("Create")}
                </button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}

    </section>
  );
}

export default FinanceCashierPanel;
