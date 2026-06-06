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

function isFutureDateValue(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && normalized > todayDateValue();
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
    const hasMatchingItem = getTicketLineItems(item).some((row) => String(row?.serviceId || "") === serviceId);
    if (!hasMatchingItem) {
      return false;
    }
  }
  if (specialistId && String(item?.specialistId || "") !== specialistId) {
    const hasMatchingItem = getTicketLineItems(item).some((row) => String(row?.specialistId || "") === specialistId);
    if (!hasMatchingItem) {
      return false;
    }
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
  canPayFinanceCashier
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
    setAppointmentTicketForm(createAppointmentTicketForm(item));
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
      payload.items = [{
        serviceId,
        serviceName: getAppointmentTicketServiceName({
          source: item,
          services: board.services,
          serviceId
        }),
        specialistId: item.specialistId,
        priceUzs,
        discountType: appointmentTicketForm.discountType,
        discountValue: appointmentTicketForm.discountValue,
        discountUzs: appointmentDiscountUzs
      }];
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

  const appointmentPriceUzs = normalizeMoneyInput(appointmentTicketForm.priceUzs || appointmentTicketSource?.servicePriceUzs);
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
  const maxManualTicketDate = todayDateValue();

  const submitBatchPayment = async (event) => {
    event.preventDefault();
    if (batchPaymentSubmitting || !canPayFinanceCashier) return;
    const ticketIds = batchPaymentTickets.map((ticket) => Number.parseInt(String(ticket.id), 10)).filter(Boolean);
    const payments = batchPaymentRows
      .map((row) => {
        const source = row.source === "deposit" ? "deposit" : "method";
        const payment = {
          source,
          amountUzs: normalizeMoneyInput(row.amountUzs)
        };
        if (source === "deposit") {
          payment.clientId = String(row.clientId || "").trim();
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
    if (isFutureDateValue(ticketDate)) {
      window.alert?.(translate("Future ticket dates are not allowed."));
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
          <input
            type="search"
            className="panel-search-input finance-board-head-client-filter"
            value={boardFilters.clientQuery}
            aria-label={translate("Client")}
            placeholder={translate("Client")}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setBoardFilters((current) => ({ ...current, clientQuery: value }));
            }}
          />
          <div className="finance-board-head-select-filter" aria-label={translate("Service Name")}>
            <CustomSelect
              value={boardFilters.serviceId}
              options={[{ value: "", label: translate("All services"), selectedLabel: translate("Service Name") }, ...serviceOptions]}
              placeholder={translate("Service Name")}
              searchable
              searchPlaceholder={translate("Service Name")}
              searchThreshold={1}
              menuPortal
              maxVisibleOptions={8}
              onChange={(value) => setBoardFilters((current) => ({ ...current, serviceId: value }))}
            />
          </div>
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
              onChange={(value) => setBoardFilters((current) => ({ ...current, specialistId: value }))}
            />
          </div>
          <button
            type="button"
            className="table-action-btn finance-board-head-reset"
            disabled={!isBoardFilterActive}
            onClick={() => setBoardFilters({ clientQuery: "", serviceId: "", specialistId: "" })}
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
                    <div className="finance-batch-ticket-group" key={String(ticket.id)}>
                      <div className="finance-batch-ticket-row">
                        <strong>{formatTicketNumber(ticket.ticketNumber)}</strong>
                        <span>{formatDateYMD(ticket.ticketDate || ticket.appointmentDate)}</span>
                        <span>{ticket.clientName || "-"}</span>
                        <span>{getTicketSpecialistSummary(ticket)}</span>
                        <span>{getTicketServiceSummary(ticket)}</span>
                        <span>{formatMoney(getTicketPayableAmount(ticket))}</span>
                      </div>
                      {getTicketLineItems(ticket).length > 1 ? (
                        <div className="finance-batch-ticket-lines">
                          <div className="finance-batch-ticket-line finance-batch-ticket-line-head">
                            <span>{translate("Service")}</span>
                            <span>{translate("Specialist")}</span>
                            <span>{translate("Price")}</span>
                            <span>{translate("Discount")}</span>
                            <span>{translate("Final")}</span>
                          </div>
                          {getTicketLineItems(ticket).map((lineItem, lineIndex) => (
                            <div className="finance-batch-ticket-line" key={`${lineItem?.id || lineItem?.lineNumber || lineIndex}-${lineIndex}`}>
                              <strong>{lineItem?.serviceName || "-"}</strong>
                              <span>{lineItem?.specialistName || "-"}</span>
                              <span>{formatMoney(lineItem?.priceUzs ?? lineItem?.finalAmountUzs)}</span>
                              <span>{formatMoney(lineItem?.discountUzs)}</span>
                              <span>{formatMoney(lineItem?.finalAmountUzs ?? lineItem?.priceUzs)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
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
                        <CustomSelect
                          value={appointmentTicketForm.serviceId}
                          options={manualServiceOptions}
                          placeholder={translate("Select service type")}
                          searchable
                          searchPlaceholder={translate("Search")}
                          searchThreshold={8}
                          menuPortal
                          onChange={(value) => {
                            const service = board.services.find((entry) => String(entry.id) === String(value || "")) || {};
                            setAppointmentTicketForm((current) => ({
                              ...current,
                              serviceId: value,
                              priceUzs: String(normalizeMoneyInput(service.priceUzs ?? current.priceUzs))
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

    </section>
  );
}

export default FinanceCashierPanel;
