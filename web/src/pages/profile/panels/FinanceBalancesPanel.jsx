import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FILTERS = Object.freeze({
  client: "",
  type: "all"
});

const EMPTY_OPERATION = Object.freeze({
  clientId: "",
  clientName: "",
  operation: "in",
  amountUzs: "",
  paymentMethodId: "",
  note: ""
});

const EMPTY_TICKET_PAYMENT = Object.freeze({
  clientId: "",
  clientName: "",
  depositUzs: 0,
  tickets: [],
  selectedIds: [],
  note: ""
});

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount > 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function normalizeAmountInput(value) {
  const parsed = Number.parseInt(String(value || "").replace(/\D+/g, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
}

function FinanceBalancesPanel({ onClose, canUpdateFinanceBalances }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [items, setItems] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [operationForm, setOperationForm] = useState(null);
  const [ticketPaymentForm, setTicketPaymentForm] = useState(null);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadBalances = useCallback(async (nextPage = 1, nextFilters = EMPTY_FILTERS) => {
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
      const response = await apiFetch(`/api/finance/client-balances?${query.toString()}`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Failed to load client balances.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
      setPage(Number.parseInt(String(data?.page || nextPage), 10) || 1);
      setTotalPages(Number.parseInt(String(data?.totalPages || 1), 10) || 1);
      setMessage("");
    } catch {
      setMessage("Failed to load client balances.");
      window.alert?.(translate("Failed to load client balances."));
    } finally {
      setLoading(false);
    }
  }, [translate]);

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

  useEffect(() => {
    void loadBalances(1, EMPTY_FILTERS);
    void loadPaymentMethods();
  }, [loadBalances, loadPaymentMethods]);

  const applyFilters = (event) => {
    event.preventDefault();
    setAppliedFilters(filters);
    void loadBalances(1, filters);
  };

  const fetchAllBalances = async () => {
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
      const response = await apiFetch(`/api/finance/client-balances?${query.toString()}`);
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

  const exportBalances = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = await fetchAllBalances();
      exportExcelWorkbook(buildExportFilename("finance-balances"), [{
        name: translate("Client Balances"),
        rows: [
          [
            "#",
            "ID",
            translate("Client"),
            translate("Debt"),
            translate("Deposit"),
            translate("Balance")
          ],
          ...rows.map((item, index) => [
            index + 1,
            item.clientId || "",
            item.clientName || "",
            Number.parseInt(String(item.debtUzs || 0), 10) || 0,
            Number.parseInt(String(item.depositUzs || 0), 10) || 0,
            Number.parseInt(String(item.balanceUzs || 0), 10) || 0
          ])
        ]
      }]);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  const openOperation = (item, operation) => {
    setOperationForm({
      ...EMPTY_OPERATION,
      clientId: String(item.clientId || ""),
      clientName: item.clientName || "",
      operation,
      paymentMethodId: String(paymentMethods[0]?.id || "")
    });
  };

  const closeOperation = () => {
    if (submitting) return;
    setOperationForm(null);
  };

  const openTicketPayment = async (item) => {
    if (submitting || ticketsLoading) return;
    const clientId = String(item.clientId || "");
    if (!clientId) return;
    setTicketsLoading(true);
    try {
      const response = await apiFetch(`/api/finance/client-balances/${clientId}/debt-tickets`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Failed to load client debt tickets."));
        return;
      }
      setTicketPaymentForm({
        ...EMPTY_TICKET_PAYMENT,
        clientId,
        clientName: item.clientName || "",
        depositUzs: Number.parseInt(String(item.depositUzs || 0), 10) || 0,
        tickets: Array.isArray(data?.items) ? data.items : []
      });
    } catch {
      window.alert?.(translate("Failed to load client debt tickets."));
    } finally {
      setTicketsLoading(false);
    }
  };

  const closeTicketPayment = () => {
    if (submitting) return;
    setTicketPaymentForm(null);
  };

  const toggleTicketSelection = (ticketId) => {
    const normalizedId = String(ticketId || "");
    if (!normalizedId) return;
    setTicketPaymentForm((current) => {
      if (!current) return current;
      const selected = new Set(current.selectedIds.map(String));
      if (selected.has(normalizedId)) {
        selected.delete(normalizedId);
      } else {
        selected.add(normalizedId);
      }
      return { ...current, selectedIds: Array.from(selected) };
    });
  };

  const submitOperation = async (event) => {
    event.preventDefault();
    if (!operationForm || submitting) return;
    setSubmitting(true);
    try {
      const response = await apiFetch("/api/finance/client-balances/deposit", {
        method: "POST",
        body: JSON.stringify({
          clientId: operationForm.clientId,
          paymentMethodId: operationForm.paymentMethodId,
          amountUzs: operationForm.amountUzs,
          operation: operationForm.operation,
          note: operationForm.note
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Deposit transaction failed."));
        return;
      }
      setOperationForm(null);
      await loadBalances(page, appliedFilters);
    } catch {
      window.alert?.(translate("Deposit transaction failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTicketTotal = useMemo(() => {
    if (!ticketPaymentForm) return 0;
    const selected = new Set(ticketPaymentForm.selectedIds.map(String));
    return ticketPaymentForm.tickets.reduce((sum, ticket) => (
      selected.has(String(ticket.id))
        ? sum + (Number.parseInt(String(ticket.totalUzs || 0), 10) || 0)
        : sum
    ), 0);
  }, [ticketPaymentForm]);

  const submitTicketPayment = async (event) => {
    event.preventDefault();
    if (!ticketPaymentForm || submitting) return;
    if (ticketPaymentForm.selectedIds.length === 0) {
      window.alert?.(translate("Select at least one ticket."));
      return;
    }
    if (selectedTicketTotal > ticketPaymentForm.depositUzs) {
      window.alert?.(translate("Deposit balance is not enough."));
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch("/api/finance/client-balances/pay-from-deposit", {
        method: "POST",
        body: JSON.stringify({
          clientId: ticketPaymentForm.clientId,
          ticketIds: ticketPaymentForm.selectedIds,
          note: ticketPaymentForm.note
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Deposit ticket payment failed."));
        return;
      }
      setTicketPaymentForm(null);
      await loadBalances(page, appliedFilters);
    } catch {
      window.alert?.(translate("Deposit ticket payment failed."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="financeBalancesPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-balances-panel">
      <div className="all-users-head">
        <h3>{translate("Client Balances")}</h3>
        <div className="all-users-head-actions">
          <form className="finance-balances-head-search" onSubmit={applyFilters}>
            <input
              type="search"
              className="panel-search-input"
              placeholder={translate("Client")}
              value={filters.client}
              onChange={(event) => setFilters((current) => ({ ...current, client: event.currentTarget.value }))}
            />
            <button type="submit" className="table-action-btn" disabled={loading}>
              {translate("Search")}
            </button>
          </form>
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            aria-label={translate("Export Excel")}
            title={translate("Export Excel")}
            disabled={loading || exporting}
            onClick={exportBalances}
          >
            <span className="finance-head-icon finance-head-icon-export" aria-hidden="true" />
          </button>
          <button type="button" className="header-btn panel-close-btn" aria-label="Close balances panel" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      <div className="all-users-table-scroll">
        <table className="all-users-table" aria-label="Finance client balances table">
          <thead>
            <tr>
              <th>#</th>
              <th>ID</th>
              <th>{translate("Client")}</th>
              <th>{translate("Debt")}</th>
              <th>{translate("Deposit")}</th>
              <th>{translate("Balance")}</th>
              <th>{translate("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="7" className="skel" />
                </tr>
              ))
            ) : items.map((item, index) => (
              <tr key={String(item.clientId)}>
                <td>{(page - 1) * 20 + index + 1}</td>
                <td>{item.clientId}</td>
                <td>{item.clientName || "-"}</td>
                <td>{formatMoney(item.debtUzs)}</td>
                <td>{formatMoney(item.depositUzs)}</td>
                <td>{formatMoney(Math.abs(item.balanceUzs))}</td>
                <td>
                  {canUpdateFinanceBalances ? (
                    <div className="table-actions-row">
                      <button type="button" className="table-action-btn" onClick={() => openOperation(item, "in")}>
                        {translate("Deposit In")}
                      </button>
                      <button
                        type="button"
                        className="table-action-btn"
                        disabled={(Number.parseInt(String(item.depositUzs || 0), 10) || 0) <= 0}
                        onClick={() => openOperation(item, "out")}
                      >
                        {translate("Deposit Out")}
                      </button>
                      <button
                        type="button"
                        className="table-action-btn"
                        disabled={
                          ticketsLoading
                          || (Number.parseInt(String(item.depositUzs || 0), 10) || 0) <= 0
                          || (Number.parseInt(String(item.debtUzs || 0), 10) || 0) <= 0
                        }
                        onClick={() => openTicketPayment(item)}
                      >
                        {translate("Pay Tickets")}
                      </button>
                    </div>
                  ) : "-"}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan="7" className="all-users-state">{translate("No items found.")}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <button
          type="button"
          className="table-action-btn"
          disabled={loading || page <= 1}
          onClick={() => loadBalances(page - 1, appliedFilters)}
        >
          {translate("Previous")}
        </button>
        <span>{`${page} / ${totalPages}`}</span>
        <button
          type="button"
          className="table-action-btn"
          disabled={loading || page >= totalPages}
          onClick={() => loadBalances(page + 1, appliedFilters)}
        >
          {translate("Next")}
        </button>
      </div>

      {operationForm ? (
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay"
            aria-label="Close deposit modal"
            onClick={closeOperation}
          />
          <form id="financeDepositModal" className="logout-confirm-modal all-users-edit-modal" onSubmit={submitOperation}>
            <h3>{translate(operationForm.operation === "in" ? "Deposit In" : "Deposit Out")}</h3>
            <label className="field">
              <span>{translate("Client")}</span>
              <input type="text" value={operationForm.clientName} disabled />
            </label>
            <label className="field">
              <span>{translate("Payment Method")}</span>
              <select
                value={operationForm.paymentMethodId}
                required
                onChange={(event) => setOperationForm((current) => ({ ...current, paymentMethodId: event.currentTarget.value }))}
              >
                <option value="">{translate("Select")}</option>
                {paymentMethods.map((method) => (
                  <option key={String(method.id)} value={String(method.id)}>{method.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{translate("Amount UZS")}</span>
              <input
                type="text"
                inputMode="numeric"
                value={operationForm.amountUzs}
                required
                onChange={(event) => setOperationForm((current) => ({
                  ...current,
                  amountUzs: normalizeAmountInput(event.currentTarget.value)
                }))}
              />
            </label>
            <label className="field">
              <span>{translate("Note")}</span>
              <input
                type="text"
                value={operationForm.note}
                onChange={(event) => setOperationForm((current) => ({ ...current, note: event.currentTarget.value }))}
              />
            </label>
            <div className="edit-actions">
              <button type="button" className="btn btn-secondary" disabled={submitting} onClick={closeOperation}>
                {translate("Cancel")}
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {translate("Save")}
              </button>
            </div>
          </form>
        </>
      ) : null}

      {ticketPaymentForm ? (
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay"
            aria-label="Close deposit ticket payment modal"
            onClick={closeTicketPayment}
          />
          <form id="financeDepositTicketPaymentModal" className="logout-confirm-modal all-users-edit-modal" onSubmit={submitTicketPayment}>
            <h3>{translate("Pay Tickets From Deposit")}</h3>
            <p className="all-users-state">{ticketPaymentForm.clientName || "-"}</p>
            <p className="all-users-state">{`${translate("Deposit")}: ${formatMoney(ticketPaymentForm.depositUzs)}`}</p>
            <p className="all-users-state">{`${translate("Selected Total")}: ${formatMoney(selectedTicketTotal)}`}</p>
            <div className="all-users-table-scroll">
              <table className="all-users-table" aria-label="Deposit ticket selection table">
                <thead>
                  <tr>
                    <th>{translate("Select")}</th>
                    <th>{translate("Ticket Number")}</th>
                    <th>{translate("Ticket Date")}</th>
                    <th>{translate("Service")}</th>
                    <th>{translate("Total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketPaymentForm.tickets.map((ticket) => (
                    <tr key={String(ticket.id)}>
                      <td>
                        <input
                          type="checkbox"
                          checked={ticketPaymentForm.selectedIds.includes(String(ticket.id))}
                          onChange={() => toggleTicketSelection(ticket.id)}
                        />
                      </td>
                      <td>{ticket.ticketNumber ? `#${ticket.ticketNumber}` : "-"}</td>
                      <td>{ticket.ticketDate || "-"}</td>
                      <td>{ticket.serviceName || "-"}</td>
                      <td>{formatMoney(ticket.totalUzs)}</td>
                    </tr>
                  ))}
                  {ticketPaymentForm.tickets.length === 0 ? (
                    <tr><td colSpan="5" className="all-users-state">{translate("No items found.")}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <label className="field">
              <span>{translate("Note")}</span>
              <input
                type="text"
                value={ticketPaymentForm.note}
                onChange={(event) => setTicketPaymentForm((current) => ({ ...current, note: event.currentTarget.value }))}
              />
            </label>
            <div className="edit-actions">
              <button type="button" className="btn btn-secondary" disabled={submitting} onClick={closeTicketPayment}>
                {translate("Cancel")}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  submitting
                  || ticketPaymentForm.selectedIds.length === 0
                  || selectedTicketTotal <= 0
                  || selectedTicketTotal > ticketPaymentForm.depositUzs
                }
              >
                {translate("Save")}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}

export default FinanceBalancesPanel;
