import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    serviceId: "",
    discountType: "amount",
    discountValue: "0"
  };
}

function createManualForm() {
  return {
    ticketDate: todayDateValue(),
    clientId: "",
    items: [createManualItem()],
    note: ""
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

function formatTime(value) {
  return String(value || "").slice(0, 5) || "-";
}

function formatDateTime(value) {
  const raw = String(value || "");
  if (!raw) return "-";
  const date = formatDateYMD(raw);
  const timeMatch = raw.match(/T(\d{2}:\d{2})/);
  return timeMatch ? `${date} ${timeMatch[1]}` : date;
}

function calculateDiscount(priceUzs, discountType, discountValue) {
  const price = Number.parseInt(String(priceUzs ?? 0), 10) || 0;
  const value = Number.parseInt(String(discountValue ?? 0), 10) || 0;
  if (discountType === "percent") {
    return Math.min(price, Math.floor((price * Math.min(value, 100)) / 100));
  }
  return Math.min(price, value);
}

function normalizeMoneyInput(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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
  compact = false,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd
}) {
  const statusKey = normalizeStatusKey(item?.status);
  const className = [
    "settings-card",
    compact ? "finance-card-compact" : "",
    statusKey ? `finance-board-card-${statusKey}` : "",
    onClick ? "settings-card-clickable" : "",
    draggable ? "finance-board-card-draggable" : "",
    isDragging ? "finance-board-card-dragging" : ""
  ].filter(Boolean).join(" ");
  const clientName = item.clientName || "-";
  const serviceName = item.serviceName || "-";
  const specialistName = item.specialistName || "-";
  const startTime = formatTime(item.startTime);

  return (
    <article
      className={className}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={compact ? `${startTime} - ${clientName} - ${serviceName} - ${specialistName}` : undefined}
      onClick={onClick}
      draggable={draggable}
      aria-grabbed={draggable ? isDragging : undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="settings-card-row">
        <strong>{clientName}</strong>
      </div>
      <div className="settings-card-row">
        <span>{serviceName}</span>
        <span>{startTime}</span>
      </div>
      <div className="settings-card-row">
        <span>{specialistName}</span>
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
    issuedTickets: [],
    paymentMethods: [],
    services: [],
    specialists: []
  });
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
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
  const [draggedAppointment, setDraggedAppointment] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState("");
  const boardRequestRef = useRef(0);
  const suppressCardClickRef = useRef(false);

  const paymentMethodOptions = useMemo(() => board.paymentMethods.map((item) => ({
    value: String(item.id),
    label: item.name
  })), [board.paymentMethods]);

  const serviceOptions = useMemo(() => board.services.map((item) => ({
      value: String(item.id),
      label: item.name || String(item.id),
      item
    })), [board.services]);

  const specialistOptions = useMemo(() => board.specialists.map((item) => ({
    value: String(item.id),
    label: `${item.fullName || item.id}${item.positionLabel ? ` - ${item.positionLabel}` : ""}`
  })), [board.specialists]);

  const visibleBoard = useMemo(() => ({
    pendingAppointments: filterBoardItems(board.pendingAppointments, boardFilters),
    cancelledAppointments: filterBoardItems(board.cancelledAppointments, boardFilters),
    noShowAppointments: filterBoardItems(board.noShowAppointments, boardFilters),
    confirmedAppointments: filterBoardItems(board.confirmedAppointments, boardFilters),
    issuedTickets: filterBoardItems(board.issuedTickets, boardFilters)
  }), [board, boardFilters]);
  const isBoardFilterActive = Boolean(
    normalizeSearchValue(boardFilters.clientQuery)
    || boardFilters.serviceId
    || boardFilters.specialistId
  );
  const currentCashierName = String(currentUser?.fullName || currentUser?.username || "").trim();
  const nowLabel = formatDateTime(new Date().toISOString());

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
        issuedTickets: Array.isArray(data?.issuedTickets) ? data.issuedTickets : [],
        paymentMethods: Array.isArray(data?.paymentMethods) ? data.paymentMethods : [],
        services: Array.isArray(data?.services) ? data.services : [],
        specialists: Array.isArray(data?.specialists) ? data.specialists : []
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

  const searchClients = useCallback(async () => {
    const query = clientSearch.trim();
    if (!query || (!/^\d+$/.test(query) && query.length < 3)) {
      setClientOptions([]);
      return;
    }
    setClientSearchBusy(true);
    try {
      const response = await apiFetch(`/api/finance/cashier/clients?q=${encodeURIComponent(query)}&limit=30`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Failed to search clients."));
        return;
      }
      setClientOptions((Array.isArray(data?.items) ? data.items : []).map((item) => ({
        value: String(item.id),
        label: `${item.fullName || item.id}${item.phone ? ` - ${item.phone}` : ""}`
      })));
    } catch {
      window.alert?.(translate("Failed to search clients."));
    } finally {
      setClientSearchBusy(false);
    }
  }, [clientSearch, translate]);

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

  const resetBoardDrag = useCallback(() => {
    setDraggedAppointment(null);
    setDragOverColumn("");
  }, []);

  const suppressNextCardClick = useCallback(() => {
    suppressCardClickRef.current = true;
    globalThis.setTimeout(() => {
      suppressCardClickRef.current = false;
    }, 0);
  }, []);

  const updateDraggedAppointmentStatus = async (item, status, { reload = true } = {}) => {
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

  const handleAppointmentDragStart = (event, item) => {
    const id = String(item?.id || "");
    if (!id || busyId || !canUpdateFinanceCashier) {
      event.preventDefault();
      return;
    }
    setDraggedAppointment(item);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-finance-appointment", JSON.stringify({
      id,
      status: normalizeStatusKey(item?.status)
    }));
    event.dataTransfer.setData("text/plain", id);
  };

  const handleAppointmentDragEnd = () => {
    suppressNextCardClick();
    resetBoardDrag();
  };

  const handleColumnDragOver = (event, columnKey) => {
    if (!draggedAppointment || busyId || !canUpdateFinanceCashier) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== columnKey) {
      setDragOverColumn(columnKey);
    }
  };

  const handleColumnDragLeave = (event, columnKey) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    if (dragOverColumn === columnKey) {
      setDragOverColumn("");
    }
  };

  const handleAppointmentStatusDrop = async (event, targetStatus) => {
    event.preventDefault();
    const item = draggedAppointment;
    suppressNextCardClick();
    resetBoardDrag();
    if (!item || busyId || !canUpdateFinanceCashier) return;
    const nextStatus = normalizeStatusKey(targetStatus);
    if (!nextStatus || normalizeStatusKey(item.status) === nextStatus) return;
    await updateDraggedAppointmentStatus(item, nextStatus);
  };

  const handleTicketColumnDrop = async (event) => {
    event.preventDefault();
    const item = draggedAppointment;
    suppressNextCardClick();
    resetBoardDrag();
    if (!item || busyId || !canUpdateFinanceCashier) return;
    if (!canCreateFinanceCashier) {
      window.alert?.(translate("Ticket create failed."));
      return;
    }
    const currentStatus = normalizeStatusKey(item.status);
    const ticketSource = currentStatus === "confirmed"
      ? item
      : await updateDraggedAppointmentStatus(item, "confirmed");
    if (!ticketSource) return;
    openAppointmentTicketModal(ticketSource);
  };

  const getAppointmentColumnProps = (columnKey, status) => ({
    className: [
      "settings-card-column",
      dragOverColumn === columnKey ? "finance-board-drop-active" : ""
    ].filter(Boolean).join(" "),
    onDragOver: (event) => handleColumnDragOver(event, columnKey),
    onDragLeave: (event) => handleColumnDragLeave(event, columnKey),
    onDrop: (event) => handleAppointmentStatusDrop(event, status)
  });

  const ticketColumnProps = {
    className: [
      "settings-card-column",
      dragOverColumn === "tickets" ? "finance-board-drop-active" : ""
    ].filter(Boolean).join(" "),
    onDragOver: (event) => handleColumnDragOver(event, "tickets"),
    onDragLeave: (event) => handleColumnDragLeave(event, "tickets"),
    onDrop: handleTicketColumnDrop
  };

  const getAppointmentDragProps = (item) => ({
    draggable: Boolean(canUpdateFinanceCashier && !busyId),
    isDragging: String(draggedAppointment?.id || "") === String(item?.id || ""),
    onDragStart: (event) => handleAppointmentDragStart(event, item),
    onDragEnd: handleAppointmentDragEnd
  });

  const handleConfirmedCardClick = (item) => {
    if (suppressCardClickRef.current) return;
    openAppointmentTicketModal(item);
  };

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

  const appointmentPriceUzs = Number.parseInt(String(appointmentTicketSource?.servicePriceUzs ?? 0), 10) || 0;
  const appointmentDiscountUzs = calculateDiscount(
    appointmentPriceUzs,
    appointmentTicketForm.discountType,
    appointmentTicketForm.discountValue
  );
  const appointmentFinalUzs = Math.max(appointmentPriceUzs - appointmentDiscountUzs, 0);

  const manualTotals = useMemo(() => {
    return manualForm.items.reduce((totals, item) => {
      const service = board.services.find((entry) => String(entry.id) === String(item.serviceId || ""));
      const priceUzs = normalizeMoneyInput(service?.priceUzs);
      const discountUzs = calculateDiscount(priceUzs, item.discountType, item.discountValue);
      return {
        subtotalUzs: totals.subtotalUzs + priceUzs,
        discountUzs: totals.discountUzs + discountUzs,
        totalUzs: totals.totalUzs + Math.max(priceUzs - discountUzs, 0)
      };
    }, { subtotalUzs: 0, discountUzs: 0, totalUzs: 0 });
  }, [board.services, manualForm.items]);

  const payTicket = async (item) => {
    const id = String(item?.id || "");
    const methodId = String(paymentMethodId || "");
    if (!id || busyId || !canPayFinanceCashier) return;
    if (!methodId) {
      window.alert?.(translate("Payment method is required."));
      return;
    }
    if (!cashSession) {
      window.alert?.(translate("Cash is closed. Open cash before accepting payments."));
      return;
    }
    setBusyId(`pay-${id}`);
    try {
      const response = await apiFetch(`/api/finance/cashier/tickets/${id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethodId: methodId,
          amountUzs: item.amountUzs
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Ticket payment failed."));
        return;
      }
      await refreshCashier();
    } catch {
      window.alert?.(translate("Ticket payment failed."));
    } finally {
      setBusyId("");
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
    for (const item of manualForm.items) {
      if (!String(item.specialistId || "").trim()) {
        window.alert?.(translate("Specialist is required."));
        return;
      }
      if (!String(item.serviceId || "").trim()) {
        window.alert?.(translate("Service is required."));
        return;
      }
      const service = getManualItemService(item);
      if (normalizeMoneyInput(service?.priceUzs) <= 0) {
        window.alert?.(translate("Service price is required."));
        return;
      }
    }
    if (manualTotals.totalUzs <= 0) {
      window.alert?.(translate("Ticket amount is required."));
      return;
    }
    setManualSubmitting(true);
    try {
      const response = await apiFetch("/api/finance/cashier/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          ticketDate,
          items: manualForm.items.map((item) => ({
            specialistId: item.specialistId,
            serviceId: item.serviceId,
            discountType: item.discountType,
            discountValue: item.discountValue
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
            className="table-action-btn"
            hidden={!canCreateFinanceCashier}
            onClick={openManualModal}
          >
            {translate("Create Manual Ticket")}
          </button>
          <button
            type="button"
            className="table-action-btn"
            hidden={!canPayFinanceCashier || Boolean(cashSession)}
            onClick={() => openSessionModal("open")}
          >
            {translate("Open Cash")}
          </button>
          <button
            type="button"
            className="table-action-btn"
            hidden={!canPayFinanceCashier || !cashSession}
            onClick={() => openSessionModal("close")}
          >
            {translate("Close Cash")}
          </button>
          <button type="button" className="table-action-btn" onClick={refreshCashier}>{translate("Refresh")}</button>
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
            onChange={(event) => setBoardFilters((current) => ({ ...current, clientQuery: event.target.value }))}
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
        <section {...getAppointmentColumnProps("pending", "pending")}>
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
              {...getAppointmentDragProps(item)}
            />
          ))}
          {visibleBoard.pendingAppointments.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

        <section {...getAppointmentColumnProps("cancelled", "cancelled")}>
          <BoardColumnTitle count={visibleBoard.cancelledAppointments.length} total={board.cancelledAppointments.length} label="Cancelled" translate={translate} />
          {visibleBoard.cancelledAppointments.map((item) => (
            <TicketCard
              key={String(item.id)}
              item={item}
              translate={translate}
              compact
              {...getAppointmentDragProps(item)}
            />
          ))}
          {visibleBoard.cancelledAppointments.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

        <section {...getAppointmentColumnProps("no-show", "no-show")}>
          <BoardColumnTitle count={visibleBoard.noShowAppointments.length} total={board.noShowAppointments.length} label="No-show" translate={translate} />
          {visibleBoard.noShowAppointments.map((item) => (
            <TicketCard
              key={String(item.id)}
              item={item}
              translate={translate}
              compact
              {...getAppointmentDragProps(item)}
            />
          ))}
          {visibleBoard.noShowAppointments.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

        <section {...getAppointmentColumnProps("confirmed", "confirmed")}>
          <BoardColumnTitle count={visibleBoard.confirmedAppointments.length} total={board.confirmedAppointments.length} label="Confirmed Appointments" translate={translate} />
          {visibleBoard.confirmedAppointments.map((item) => (
            <TicketCard
              key={String(item.id)}
              item={item}
              onClick={() => handleConfirmedCardClick(item)}
              compact
              {...getAppointmentDragProps(item)}
            />
          ))}
          {visibleBoard.confirmedAppointments.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

        <section {...ticketColumnProps}>
          <BoardColumnTitle count={visibleBoard.issuedTickets.length} total={board.issuedTickets.length} label="Tickets" translate={translate} />
          {visibleBoard.issuedTickets.map((item) => (
            <TicketCard
              key={String(item.id)}
              item={item}
              footer={(
                <>
                  <CustomSelect
                    value={paymentMethodId}
                    options={[{ value: "", label: translate("Payment Method") }, ...paymentMethodOptions]}
                    onChange={setPaymentMethodId}
                  />
                  <button
                    type="button"
                    className="table-action-btn"
                    disabled={!canPayFinanceCashier || busyId === `pay-${item.id}`}
                    onClick={() => payTicket(item)}
                  >
                    {translate("Paid")}
                  </button>
                  <button
                    type="button"
                    className="table-action-btn"
                    disabled={!canUpdateFinanceCashier || busyId === `unpaid-${item.id}`}
                    onClick={() => markUnpaid(item)}
                  >
                    {translate("Unpaid")}
                  </button>
                </>
              )}
            />
          ))}
          {visibleBoard.issuedTickets.length === 0 ? <p className="all-users-state">{translate("No items found.")}</p> : null}
        </section>

      </div>

      {appointmentTicketSource ? (
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay"
            aria-label={translate("Close ticket modal")}
            onClick={() => closeAppointmentTicketModal()}
          />
          <div id="financeAppointmentTicketModal" className="logout-confirm-modal all-users-edit-modal finance-modal">
            <h3>{translate("Create Ticket")}</h3>
            <form className="auth-form" onSubmit={submitAppointmentTicket}>
              <div className="all-users-edit-fields">
                <div className="finance-ticket-summary">
                  <div><strong>{translate("Client")}</strong><span>{appointmentTicketSource.clientName || "-"}</span></div>
                  <div><strong>{translate("Date")}</strong><span>{formatDateYMD(appointmentTicketSource.appointmentDate)}</span></div>
                  <div><strong>{translate("Specialist")}</strong><span>{appointmentTicketSource.specialistName || "-"}</span></div>
                </div>

                <div className="finance-ticket-item-row">
                  <div>
                    <span>{translate("Service")}</span>
                    <strong>{appointmentTicketSource.serviceName || "-"}</strong>
                  </div>
                  <div>
                    <span>{translate("Price")}</span>
                    <strong>{formatMoney(appointmentPriceUzs)}</strong>
                  </div>
                </div>

                <div className="finance-ticket-discount-row">
                  <label className="field">
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
                  <label className="field">
                    <span>{translate("Discount")}</span>
                    <input
                      type="number"
                      min="0"
                      max={appointmentTicketForm.discountType === "percent" ? "100" : undefined}
                      value={appointmentTicketForm.discountValue}
                      onChange={(event) => setAppointmentTicketForm((current) => ({ ...current, discountValue: event.currentTarget.value }))}
                    />
                  </label>
                </div>

                <div className="finance-ticket-summary finance-ticket-total">
                  <div><strong>{translate("Discount")}</strong><span>{formatMoney(appointmentDiscountUzs)}</span></div>
                  <div><strong>{translate("Total")}</strong><span>{formatMoney(appointmentFinalUzs)}</span></div>
                </div>

                <label className="field">
                  <span>{translate("Note")}</span>
                  <input
                    type="text"
                    maxLength={255}
                    value={appointmentTicketForm.note}
                    onChange={(event) => setAppointmentTicketForm((current) => ({ ...current, note: event.currentTarget.value }))}
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
      ) : null}

      {manualModalOpen ? (
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay"
            aria-label={translate("Close manual ticket modal")}
            onClick={() => closeManualModal()}
          />
          <div id="financeManualTicketModal" className="logout-confirm-modal all-users-edit-modal finance-modal">
            <h3>{translate("Create Manual Ticket")}</h3>
            <form className="auth-form" onSubmit={submitManualTicket}>
              <div className="all-users-edit-fields">
                <div className="finance-manual-top-row">
                  <label className="field">
                    <span>{translate("Ticket Date")}</span>
                    <input
                      type="date"
                      value={manualForm.ticketDate}
                      onChange={(event) => setManualForm((current) => ({ ...current, ticketDate: event.currentTarget.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>{translate("Search client")}</span>
                    <div className="settings-inline-form finance-manual-client-search">
                      <input
                        type="search"
                        value={clientSearch}
                        placeholder={translate("Search by name or ID")}
                        onChange={(event) => setClientSearch(event.currentTarget.value)}
                      />
                      <button type="button" className="table-action-btn" disabled={clientSearchBusy} onClick={searchClients}>
                        {clientSearchBusy ? "..." : translate("Search")}
                      </button>
                    </div>
                  </label>
                </div>

                <label className="field finance-manual-client-select">
                  <span>{translate("Client")}</span>
                  <CustomSelect
                    value={manualForm.clientId}
                    options={clientOptions}
                    placeholder={translate("Select client")}
                    searchable
                    searchThreshold={1}
                    menuPortal
                    emptyText={translate("No clients found.")}
                    onChange={(value) => setManualForm((current) => ({ ...current, clientId: value }))}
                  />
                </label>

                <div className="finance-manual-items">
                  {manualForm.items.map((item, index) => {
                    const service = getManualItemService(item);
                    const priceUzs = normalizeMoneyInput(service?.priceUzs);
                    const discountUzs = calculateDiscount(priceUzs, item.discountType, item.discountValue);
                    const finalUzs = Math.max(priceUzs - discountUzs, 0);
                    return (
                      <div className="finance-manual-item" key={item.key}>
                        <div className="settings-card-row finance-manual-item-head">
                          <strong>{`${translate("Item")} ${index + 1}`}</strong>
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
                        <div className="finance-manual-item-grid">
                          <label className="field">
                            <span>{translate("Specialist")}</span>
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
                            <span>{translate("Service")}</span>
                            <CustomSelect
                              value={item.serviceId}
                              options={serviceOptions}
                              placeholder={translate("Select service")}
                              searchable
                              searchThreshold={1}
                              menuPortal
                              emptyText={translate("No items found.")}
                              onChange={(value) => updateManualItem(item.key, { serviceId: value })}
                            />
                          </label>
                          <div className="finance-ticket-line-total">
                            <span>{translate("Price")}</span>
                            <strong>{formatMoney(priceUzs)}</strong>
                          </div>
                          <label className="field">
                            <span>{translate("Discount Type")}</span>
                            <CustomSelect
                              value={item.discountType}
                              options={[
                                { value: "amount", label: translate("Amount") },
                                { value: "percent", label: translate("Percent") }
                              ]}
                              menuPortal
                              onChange={(value) => updateManualItem(item.key, { discountType: value })}
                            />
                          </label>
                          <label className="field">
                            <span>{translate("Discount")}</span>
                            <input
                              type="number"
                              min="0"
                              max={item.discountType === "percent" ? "100" : undefined}
                              value={item.discountValue}
                              onChange={(event) => updateManualItem(item.key, { discountValue: event.currentTarget.value })}
                            />
                          </label>
                          <div className="finance-ticket-line-total">
                            <span>{translate("Final")}</span>
                            <strong>{formatMoney(finalUzs)}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="table-action-btn finance-manual-add-btn"
                    aria-label={translate("Add Service")}
                    title={translate("Add Service")}
                    onClick={addManualItem}
                  >
                    +
                  </button>
                </div>

                <div className="finance-ticket-summary finance-ticket-total">
                  <div><strong>{translate("Subtotal")}</strong><span>{formatMoney(manualTotals.subtotalUzs)}</span></div>
                  <div><strong>{translate("Discount")}</strong><span>{formatMoney(manualTotals.discountUzs)}</span></div>
                  <div><strong>{translate("Total")}</strong><span>{formatMoney(manualTotals.totalUzs)}</span></div>
                </div>

                <label className="field">
                  <span>{translate("Note")}</span>
                  <input
                    type="text"
                    maxLength={255}
                    value={manualForm.note}
                    onChange={(event) => setManualForm((current) => ({ ...current, note: event.currentTarget.value }))}
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
      ) : null}

      {sessionModal ? (
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay"
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
                      onChange={(event) => setSessionForm((current) => ({ ...current, submittedAmountUzs: event.currentTarget.value }))}
                    />
                  </label>
                ) : null}
                <label className="field">
                  <span>{translate("Note")}</span>
                  <input
                    type="text"
                    maxLength={255}
                    value={sessionForm.note}
                    onChange={(event) => setSessionForm((current) => ({ ...current, note: event.currentTarget.value }))}
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
      ) : null}
    </section>
  );
}

export default FinanceCashierPanel;
