import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { formatDateYMD } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

function todayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createManualItem() {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    specialistId: "",
    serviceId: ""
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

const EMPTY_SESSION_FORM = Object.freeze({
  submittedAmountUzs: "",
  note: ""
});

const EMPTY_APPOINTMENT_TICKET_FORM = Object.freeze({
  discountType: "amount",
  discountValue: "0",
  note: ""
});

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount > 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function formatSignedMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  if (amount === 0) return "-";
  const prefix = amount > 0 ? "+" : "-";
  return `${prefix}${Math.abs(amount).toLocaleString("ru-RU")} UZS`;
}

function formatTicketNumber(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return number > 0 ? `#${String(number).padStart(5, "0")}` : "#-----";
}

function formatTime(value) {
  return String(value || "").slice(0, 5) || "-";
}

function formatDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const formattedDate = formatDateYMD(raw);
    const timeMatch = raw.match(/[T\s](\d{2}:\d{2})/);
    return timeMatch && formattedDate !== "-" ? `${formattedDate} ${timeMatch[1]}` : formattedDate;
  }
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((accumulator, part) => {
    accumulator[part.type] = part.value;
    return accumulator;
  }, {});
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}

function formatShortDateDM(value) {
  const formatted = formatDateYMD(value);
  return formatted && formatted !== "-" ? formatted.slice(0, 5) : "-";
}

function calculateDiscount(priceUzs, discountType, discountValue) {
  const price = Number.parseInt(String(priceUzs ?? 0), 10) || 0;
  const value = Number.parseInt(String(discountValue ?? 0), 10) || 0;
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

function normalizeMoneyInput(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getTicketPayableAmount(ticket) {
  return normalizeMoneyInput(ticket?.remainingAmountUzs ?? ticket?.remaining_amount_uzs ?? ticket?.totalUzs ?? ticket?.amountUzs);
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function ticketCardMatchesFilters(item, filters) {
  const clientQuery = normalizeSearchValue(filters?.clientQuery);
  const serviceId = String(filters?.serviceId || "").trim();
  const specialistId = String(filters?.specialistId || "").trim();
  if (clientQuery) {
    const clientHaystack = [
      item?.clientName,
      item?.clientId
    ].map(normalizeSearchValue).join(" ");
    if (!clientHaystack.includes(clientQuery)) {
      return false;
    }
  }
  if (serviceId && String(item?.serviceId || "") !== serviceId) {
    return false;
  }
  if (specialistId && String(item?.specialistId || "") !== specialistId) {
    return false;
  }
  return true;
}

function filterBoardItems(items, filters) {
  const hasFilters = Boolean(
    normalizeSearchValue(filters?.clientQuery)
    || String(filters?.serviceId || "").trim()
    || String(filters?.specialistId || "").trim()
  );
  if (!hasFilters) return items;
  return items.filter((item) => ticketCardMatchesFilters(item, filters));
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
  onSelectionChange
}) {
  const statusKey = normalizeStatusKey(item?.status);
  const className = [
    "settings-card",
    compact ? "finance-card-compact" : "",
    statusKey ? `finance-board-card-${statusKey}` : "",
    selected ? "finance-board-card-selected" : "",
    onClick ? "settings-card-clickable" : "",
    onDoubleClick ? "finance-board-card-ticketable" : ""
  ].filter(Boolean).join(" ");
  const clientName = item.clientName || "-";
  const serviceName = item.serviceName || "-";
  const specialistName = item.specialistName || "-";
  const startTime = formatTime(item.startTime);
  const shortDate = showShortDate
    ? formatShortDateDM(item.createdAt || item.ticketDate || item.appointmentDate)
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
            className="finance-ticket-select-control"
            aria-label={selected ? "Deselect ticket" : "Select ticket"}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={(event) => {
                event.stopPropagation();
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
  canPayFinanceCashier,
  currentUser
}) {
  const { translate } = useI18n();
  const [board, setBoard] = useState({
    pendingAppointments: [],
    cancelledAppointments: [],
    noShowAppointments: [],
    confirmedAppointments: [],
    overdueConfirmedAppointments: [],
    issuedTickets: [],
    paymentMethods: [],
    services: [],
    specialists: [],
    nextTicketNumber: null
  });
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
    clientQuery: "",
    serviceId: "",
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
  const [cashSession, setCashSession] = useState(null);
  const [sessionModal, setSessionModal] = useState("");
  const [sessionForm, setSessionForm] = useState(EMPTY_SESSION_FORM);
  const [sessionSubmitting, setSessionSubmitting] = useState(false);
  const boardRequestRef = useRef(0);

  const paymentMethodOptions = useMemo(() => board.paymentMethods.filter(Boolean).map((item) => ({
    value: String(item.id),
    label: item.name
  })), [board.paymentMethods]);

  const serviceOptions = useMemo(() => board.services.filter(Boolean).map((item) => ({
      value: String(item.id),
      label: item.name || String(item.id),
      item
    })), [board.services]);

  const manualServiceOptions = useMemo(() => board.services.filter(Boolean).map((item) => ({
    value: String(item.id),
    label: `${item.name || item.id} - ${formatMoney(item.priceUzs)}`,
    item
  })), [board.services]);

  const specialistOptions = useMemo(() => board.specialists.filter(Boolean).map((item) => ({
    value: String(item.id),
    label: `${item.fullName || item.id}${item.positionLabel ? ` - ${item.positionLabel}` : ""}`
  })), [board.specialists]);

  const visibleBoard = useMemo(() => ({
    pendingAppointments: filterBoardItems(board.pendingAppointments, boardFilters),
    cancelledAppointments: filterBoardItems(board.cancelledAppointments, boardFilters),
    noShowAppointments: filterBoardItems(board.noShowAppointments, boardFilters),
    confirmedAppointments: filterBoardItems(board.confirmedAppointments, boardFilters),
    overdueConfirmedAppointments: filterBoardItems(board.overdueConfirmedAppointments, boardFilters),
    issuedTickets: filterBoardItems(board.issuedTickets, boardFilters)
  }), [board, boardFilters]);
  const isBoardFilterActive = Boolean(
    normalizeSearchValue(boardFilters.clientQuery)
    || boardFilters.serviceId
    || boardFilters.specialistId
  );
  const currentCashierName = String(currentUser?.fullName || currentUser?.username || "").trim();
  const nowLabel = formatDateTime(new Date().toISOString());

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
        clientName: ticket?.clientName || "-",
        selectedTotalUzs: 0,
        ticketCount: 0
      };
      current.selectedTotalUzs += getTicketPayableAmount(ticket);
      current.ticketCount += 1;
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
  const batchClientOptions = useMemo(() => batchClientSummaries.map((client) => ({
    value: client.clientId,
    label: `${client.clientName} - ${translate("Deposit")}: ${formatMoney(client.depositUzs)}`
  })), [batchClientSummaries, translate]);
  const batchDepositTotalUzs = useMemo(() => (
    batchPaymentRows.reduce((sum, row) => row.source === "deposit" ? sum + normalizeMoneyInput(row.amountUzs) : sum, 0)
  ), [batchPaymentRows]);
  const batchExternalTotalUzs = Math.max(batchPaidTotalUzs - batchDepositTotalUzs, 0);

  const loadBoard = useCallback(async () => {
    const requestId = boardRequestRef.current + 1;
    boardRequestRef.current = requestId;
    const isCurrentRequest = () => requestId === boardRequestRef.current;
    try {
      const response = await apiFetch("/api/finance/cashier/board");
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
        confirmedAppointments: Array.isArray(data?.confirmedAppointments) ? data.confirmedAppointments : [],
        overdueConfirmedAppointments: Array.isArray(data?.overdueConfirmedAppointments)
          ? data.overdueConfirmedAppointments.map((item) => ({ ...item, boardGroup: "overdue-ticket" }))
          : [],
        issuedTickets: Array.isArray(data?.issuedTickets) ? data.issuedTickets : [],
        paymentMethods: Array.isArray(data?.paymentMethods) ? data.paymentMethods : [],
        services: Array.isArray(data?.services) ? data.services : [],
        specialists: Array.isArray(data?.specialists) ? data.specialists : [],
        nextTicketNumber: data?.nextTicketNumber ?? data?.next_ticket_number ?? null
      });
      setMessage("");
    } catch {
      if (!isCurrentRequest()) return;
      setMessage("Failed to load cashier board.");
      window.alert?.(translate("Failed to load cashier board."));
    }
  }, [translate]);

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

  const refreshCashier = async () => {
    await Promise.all([loadBoard(), loadCashSession()]);
  };

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

  const openAppointmentTicketModal = (item) => {
    if (!canCreateFinanceCashier) return;
    setAppointmentTicketSource(item);
    setAppointmentTicketForm(EMPTY_APPOINTMENT_TICKET_FORM);
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
    const currentStatus = normalizeStatusKey(item.status);
    if (currentStatus === "confirmed") {
      openAppointmentTicketModal(item);
      return;
    }
    const ticketSource = await updateAppointmentStatus(item, "confirmed");
    if (ticketSource) {
      openAppointmentTicketModal(ticketSource);
    }
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
  };

  const submitAppointmentTicket = async (event) => {
    event.preventDefault();
    const item = appointmentTicketSource;
    const id = String(item?.id || "");
    if (!id || appointmentTicketSubmitting || !canCreateFinanceCashier) return;
    const priceUzs = Number.parseInt(String(item?.servicePriceUzs ?? 0), 10) || 0;
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
      if (item?.serviceId) {
        payload.items = [{
          serviceId: item.serviceId,
          specialistId: item.specialistId,
          discountType: appointmentTicketForm.discountType,
          discountValue: appointmentTicketForm.discountValue
        }];
      }
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
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      if (checked) {
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
    const itemId = String(item?.id || "");
    const selectedItems = board.issuedTickets.filter((ticket) => selectedTicketIds.has(String(ticket.id)));
    const nextTickets = selectedItems.length > 0 && selectedTicketIds.has(itemId)
      ? selectedItems
      : (item ? [item] : selectedItems);
    if (nextTickets.length === 0) return;
    const totalUzs = nextTickets.reduce((sum, ticket) => sum + normalizeMoneyInput(ticket?.totalUzs ?? ticket?.amountUzs), 0);
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
      const next = { ...row, ...updates };
      if (Object.prototype.hasOwnProperty.call(updates, "source")) {
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

  const appointmentPriceUzs = Number.parseInt(String(appointmentTicketSource?.servicePriceUzs ?? 0), 10) || 0;
  const appointmentDiscountUzs = calculateDiscount(
    appointmentPriceUzs,
    appointmentTicketForm.discountType,
    appointmentTicketForm.discountValue
  );
  const appointmentFinalUzs = Math.max(appointmentPriceUzs - appointmentDiscountUzs, 0);

  const manualTotals = useMemo(() => {
    const subtotalUzs = manualForm.items.reduce((sum, item) => {
      const service = board.services.find((entry) => String(entry.id) === String(item.serviceId || ""));
      return sum + normalizeMoneyInput(service?.priceUzs);
    }, 0);
    const discountUzs = calculateDiscount(subtotalUzs, manualForm.discountType, manualForm.discountValue);
    return {
      subtotalUzs,
      discountUzs,
      totalUzs: Math.max(subtotalUzs - discountUzs, 0)
    };
  }, [board.services, manualForm.discountType, manualForm.discountValue, manualForm.items]);

  const submitBatchPayment = async (event) => {
    event.preventDefault();
    if (batchPaymentSubmitting || !canPayFinanceCashier) return;
    const ticketIds = batchPaymentTickets.map((ticket) => Number.parseInt(String(ticket.id), 10)).filter(Boolean);
    const payments = batchPaymentRows
      .map((row) => {
        const source = row.source === "deposit" ? "deposit" : "method";
        return {
          source,
          paymentMethodId: String(row.paymentMethodId || "").trim(),
          clientId: String(row.clientId || "").trim(),
          amountUzs: normalizeMoneyInput(row.amountUzs)
        };
      })
      .filter((row) => row.amountUzs > 0 && (row.source === "deposit" ? row.clientId : row.paymentMethodId));
    if (ticketIds.length === 0) return;
    if (payments.length === 0) {
      window.alert?.(translate("Payment method is required."));
      return;
    }
    if (batchOverpaidUzs > 0) {
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
      await refreshCashier();
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
    const manualItemsWithServices = manualForm.items.map((item) => ({
      item,
      service: getManualItemService(item)
    }));
    for (const { item, service } of manualItemsWithServices) {
      if (!String(item.specialistId || "").trim()) {
        window.alert?.(translate("Specialist is required."));
        return;
      }
      if (!String(item.serviceId || "").trim()) {
        window.alert?.(translate("Service is required."));
        return;
      }
      if (normalizeMoneyInput(service?.priceUzs) <= 0) {
        window.alert?.(translate("Service price is required."));
        return;
      }
    }
    if (manualTotals.totalUzs <= 0) {
      window.alert?.(translate("Ticket amount is required."));
      return;
    }
    const manualItemDiscounts = distributeDiscountUzs(
      manualItemsWithServices.map(({ service }) => service?.priceUzs),
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
            discountType: "amount",
            discountValue: manualItemDiscounts[index] || 0
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
      await refreshCashier();
    } catch {
      window.alert?.(translate(sessionModal === "open" ? "Cash session open failed." : "Cash session close failed."));
    } finally {
      setSessionSubmitting(false);
    }
  };

  return (
    <section id="financeCashierPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-cashier-panel">
      <div className="all-users-head">
        <h3>{translate("Cashier")}</h3>
        <div className="all-users-head-actions">
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
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close cashier panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="finance-board-search">
        <label className="panel-search-label">
          <span>{translate("Client")}</span>
          <input
            type="search"
            className="panel-search-input"
            value={boardFilters.clientQuery}
            placeholder={translate("Search client")}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setBoardFilters((current) => ({ ...current, clientQuery: value }));
            }}
          />
        </label>
        <label className="panel-search-label finance-board-select-filter">
          <span>{translate("Service Name")}</span>
          <CustomSelect
            value={boardFilters.serviceId}
            options={[{ value: "", label: translate("All services") }, ...serviceOptions]}
            placeholder={translate("Select service")}
            searchable
            searchThreshold={1}
            menuPortal
            maxVisibleOptions={8}
            onChange={(value) => setBoardFilters((current) => ({ ...current, serviceId: value }))}
          />
        </label>
        <label className="panel-search-label finance-board-select-filter">
          <span>{translate("Specialist")}</span>
          <CustomSelect
            value={boardFilters.specialistId}
            options={[{ value: "", label: translate("All specialists") }, ...specialistOptions]}
            placeholder={translate("Select specialist")}
            searchable
            searchThreshold={1}
            menuPortal
            maxVisibleOptions={8}
            onChange={(value) => setBoardFilters((current) => ({ ...current, specialistId: value }))}
          />
        </label>
        <button
          type="button"
          className="table-action-btn"
          disabled={!isBoardFilterActive}
          onClick={() => setBoardFilters({ clientQuery: "", serviceId: "", specialistId: "" })}
        >
          {translate("Reset")}
        </button>
      </div>

      <div className="settings-card-grid finance-board-grid">
        <section className="settings-card-column">
          <BoardColumnTitle
            count={visibleBoard.pendingAppointments.length}
            total={board.pendingAppointments.length}
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
          <BoardColumnTitle count={visibleBoard.cancelledAppointments.length} total={board.cancelledAppointments.length} label="Cancelled" translate={translate} />
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
          <BoardColumnTitle count={visibleBoard.noShowAppointments.length} total={board.noShowAppointments.length} label="No-show" translate={translate} />
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

        <section className="settings-card-column">
          <BoardColumnTitle count={visibleBoard.confirmedAppointments.length} total={board.confirmedAppointments.length} label="Confirmed Appointments" translate={translate} />
          {visibleBoard.confirmedAppointments.map((item) => (
            <TicketCard
              key={String(item.id)}
              item={item}
              compact
              showShortDate
              {...getCreateTicketDoubleClickProps(item)}
            />
          ))}
          {visibleBoard.confirmedAppointments.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

        <section className="settings-card-column finance-board-readonly-column">
          <BoardColumnTitle count={visibleBoard.overdueConfirmedAppointments.length} total={board.overdueConfirmedAppointments.length} label="Awaiting Ticket" translate={translate} />
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
          <BoardColumnTitle count={selectedTicketCount} total={board.issuedTickets.length} label="Tickets" translate={translate} />
          {visibleBoard.issuedTickets.map((item) => (
            <TicketCard
              key={String(item.id)}
              item={item}
              compact
              showShortDate
              selectable
              selected={selectedTicketIds.has(String(item.id))}
              onSelectionChange={(checked) => toggleTicketSelection(item, checked)}
              onDoubleClick={() => openBatchPaymentModal(item)}
              actionTitle={selectedTicketCount > 0 ? translate("Double-click to pay selected tickets") : translate("Double-click to pay ticket")}
            />
          ))}
          {visibleBoard.issuedTickets.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

      </div>

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
              <span className="finance-modal-ticket-number">{batchPaymentTickets.length}</span>
            </h3>
            <form className="auth-form" onSubmit={submitBatchPayment}>
              <div className="all-users-edit-fields">
                <div className="finance-batch-client-balances" aria-busy={batchClientBalancesLoading ? "true" : "false"}>
                  <div className="finance-batch-client-balance-row finance-batch-client-balance-head">
                    <span>{translate("Client")}</span>
                    <span>{translate("Selected Total")}</span>
                    <span>{translate("Deposit")}</span>
                    <span>{translate("Debt")}</span>
                  </div>
                  {batchClientSummaries.map((client) => (
                    <div className="finance-batch-client-balance-row" key={client.clientId}>
                      <strong>{client.clientName}</strong>
                      <span>{formatMoney(client.selectedTotalUzs)}</span>
                      <span className={client.depositUzs > 0 ? "finance-balance-positive" : ""}>{formatMoney(client.depositUzs)}</span>
                      <span className={client.debtUzs > 0 ? "finance-balance-negative" : ""}>{formatMoney(client.debtUzs)}</span>
                    </div>
                  ))}
                </div>

                <div className="finance-batch-ticket-list">
                  <div className="finance-batch-ticket-row finance-batch-ticket-head">
                    <span>{translate("Ticket Number")}</span>
                    <span>{translate("Ticket Date")}</span>
                    <span>{translate("Client")}</span>
                    <span>{translate("Specialist")}</span>
                    <span>{translate("Service")}</span>
                    <span>{translate("Total")}</span>
                  </div>
                  {batchPaymentTickets.map((ticket) => (
                    <div className="finance-batch-ticket-row" key={String(ticket.id)}>
                      <strong>{formatTicketNumber(ticket.ticketNumber)}</strong>
                      <span>{formatDateYMD(ticket.ticketDate || ticket.appointmentDate)}</span>
                      <span>{ticket.clientName || "-"}</span>
                      <span>{ticket.specialistName || "-"}</span>
                      <span>{ticket.serviceName || "-"}</span>
                      <span>{formatMoney(getTicketPayableAmount(ticket))}</span>
                    </div>
                  ))}
                </div>

                <div className="finance-batch-payment-methods">
                  <div className="finance-batch-section-title">
                    <span>{translate("Payment Sources")}</span>
                    <strong>{formatMoney(batchPaidTotalUzs)}</strong>
                  </div>
                  <div className="finance-batch-payment-list">
                    {batchPaymentRows.map((row) => (
                      <div
                        className={`finance-batch-payment-row finance-batch-payment-row-${row.source === "deposit" ? "deposit" : "method"}`}
                        key={row.key}
                      >
                        <label className="field">
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
                          <label className="field">
                            <CustomSelect
                              value={row.clientId}
                              options={batchClientOptions}
                              placeholder={translate("Client")}
                              menuPortal
                              onChange={(value) => updateBatchPaymentRow(row.key, { clientId: value })}
                            />
                          </label>
                        ) : (
                          <label className="field">
                            <CustomSelect
                              value={row.paymentMethodId}
                              options={paymentMethodOptions}
                              placeholder={translate("Payment Method")}
                              menuPortal
                              onChange={(value) => updateBatchPaymentRow(row.key, { paymentMethodId: value })}
                            />
                          </label>
                        )}
                        <label className="field">
                          <input
                            type="number"
                            min="0"
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
                      </div>
                    ))}
                  </div>
                </div>

                <div className="finance-ticket-summary finance-ticket-total">
                  <div className="finance-total-cell finance-total-cell-total"><strong>{translate("Total")}</strong><span>{formatMoney(batchPaymentTotalUzs)}</span></div>
                  <div className="finance-total-cell finance-total-cell-external"><strong>{translate("External Payment")}</strong><span>{formatMoney(batchExternalTotalUzs)}</span></div>
                  <div className="finance-total-cell finance-total-cell-deposit"><strong>{translate("From Client Balance")}</strong><span>{formatMoney(batchDepositTotalUzs)}</span></div>
                  <div className="finance-total-cell finance-total-cell-pay"><strong>{translate("To Pay")}</strong><span>{formatMoney(batchPaidTotalUzs)}</span></div>
                  <div className="finance-total-cell finance-total-cell-remaining"><strong>{translate("Remaining")}</strong><span>{formatMoney(batchRemainingUzs)}</span></div>
                </div>

                <label className="field">
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
                        <input type="text" value={appointmentTicketSource.serviceName || "-"} readOnly />
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
                      onChange={(value) => setAppointmentTicketForm((current) => ({ ...current, discountType: value }))}
                    />
                  </label>
                  <label className="field finance-total-cell">
                    <span>{translate("Discount")}</span>
                    <input
                      type="number"
                      min="0"
                      max={appointmentTicketForm.discountType === "percent" ? "100" : undefined}
                      value={appointmentTicketForm.discountValue}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
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
                <button type="submit" className="btn" disabled={appointmentTicketSubmitting || appointmentFinalUzs <= 0}>
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
                        <div className="finance-manual-item-grid">
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
                              onChange={(value) => updateManualItem(item.key, { serviceId: value })}
                            />
                          </label>
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
                      onChange={(value) => setManualForm((current) => ({ ...current, discountType: value }))}
                    />
                  </label>
                  <label className="field finance-total-cell">
                    <span>{translate("Discount")}</span>
                    <input
                      type="number"
                      min="0"
                      max={manualForm.discountType === "percent" ? "100" : undefined}
                      value={manualForm.discountValue}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
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
                <button type="submit" className="btn" disabled={manualSubmitting || manualTotals.totalUzs <= 0}>
                  {manualSubmitting ? "..." : translate("Create")}
                </button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}

      {sessionModal && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            style={FINANCE_MODAL_OVERLAY_STYLE}
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
                  <strong>{sessionModal === "open" ? nowLabel : formatDateTime(cashSession?.openedAt)}</strong>
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

export default FinanceCashierPanel;
