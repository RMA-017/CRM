import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "../../../components/CustomSelect.jsx";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { formatDateTimeTashkent } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FILTERS = Object.freeze({
  client: "",
  type: "active"
});

const EMPTY_DEPOSIT_FORM = Object.freeze({
  paymentMethodId: "",
  amountUzs: "",
  note: "",
  reason: ""
});

const FINANCE_CLIENT_LEDGER_COLUMNS_STORAGE_KEY = "aaron_crm_finance_client_ledger_columns";
const DEFAULT_FINANCE_CLIENT_LEDGER_COLUMN_IDS = Object.freeze([
  "operationDate",
  "operationNumber",
  "action",
  "ticketNumber",
  "serviceName",
  "paymentMethod",
  "cashIn",
  "cashOut",
  "depositChange",
  "depositBalance",
  "cashier",
  "status",
  "note"
]);

function loadStoredClientLedgerColumnIds() {
  if (typeof window === "undefined") return [...DEFAULT_FINANCE_CLIENT_LEDGER_COLUMN_IDS];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FINANCE_CLIENT_LEDGER_COLUMNS_STORAGE_KEY) || "[]");
    const stored = Array.isArray(parsed) ? parsed : [];
    const allowed = new Set(DEFAULT_FINANCE_CLIENT_LEDGER_COLUMN_IDS);
    const normalized = DEFAULT_FINANCE_CLIENT_LEDGER_COLUMN_IDS.filter((id) => stored.includes(id) && allowed.has(id));
    return normalized.length > 0 ? normalized : [...DEFAULT_FINANCE_CLIENT_LEDGER_COLUMN_IDS];
  } catch {
    return [...DEFAULT_FINANCE_CLIENT_LEDGER_COLUMN_IDS];
  }
}

function storeClientLedgerColumnIds(columnIds) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FINANCE_CLIENT_LEDGER_COLUMNS_STORAGE_KEY, JSON.stringify(columnIds));
  } catch {
    // Ignore storage failures; the current session state still works.
  }
}

function toIntegerAmount(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function formatMoney(value) {
  const amount = toIntegerAmount(value);
  return amount !== 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function formatSignedMoney(value) {
  const amount = toIntegerAmount(value);
  if (amount === 0) return "-";
  const sign = amount > 0 ? "+" : "-";
  return `${sign}${Math.abs(amount).toLocaleString("ru-RU")} UZS`;
}

function translateTransactionType(translate, type) {
  const labels = {
    ticket_payment: "Ticket Payment",
    deposit_in: "Deposit In",
    deposit_out: "Deposit Out",
    deposit_ticket_payment: "Deposit Ticket Payment",
    deposit_ticket_refund: "Deposit Ticket Refund",
    refund: "Refund",
    correction: "Correction"
  };
  return translate(labels[String(type || "")] || String(type || "-"));
}

function getTransactionActionLabel(translate, item) {
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
  return translate(labels[type] || translateTransactionType(translate, type));
}

function isTransactionReversed(item) {
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  return Boolean(metadata.reversalTransactionId || metadata.reversal_transaction_id);
}

function getTransactionStatusLabel(translate, item) {
  if (String(item?.status || "") === "voided") return translate("Cancelled");
  if (isTransactionReversed(item)) return translate("Corrected");
  return translate("Active");
}

function getClientLedgerCashInUzs(item) {
  return String(item?.direction || "") === "in" ? toIntegerAmount(item?.amountUzs) : 0;
}

function getClientLedgerCashOutUzs(item) {
  return String(item?.direction || "") === "out" ? toIntegerAmount(item?.amountUzs) : 0;
}

function getClientLedgerNote(translate, item) {
  const note = String(item?.note || "").trim();
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const voidReason = String(metadata.voidReason || "").trim();
  const reversalReason = String(metadata.reversalReason || metadata.reversal_reason || "").trim();
  if (isTransactionReversed(item)) {
    const correctedText = reversalReason ? `${translate("Corrected")}: ${reversalReason}` : translate("Corrected");
    return note ? `${note} | ${correctedText}` : correctedText;
  }
  if (String(item?.status || "") !== "voided") return note || "-";
  const cancelledText = voidReason ? `${translate("Cancelled")}: ${voidReason}` : translate("Cancelled");
  return note ? `${note} | ${cancelledText}` : cancelledText;
}

function getDepositSourceRows(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.status === "posted" && toIntegerAmount(item?.depositChangeUzs) > 0)
    .map((item) => ({
      id: item.id,
      date: item.transactionAt || item.createdAt,
      paymentMethodName: item.paymentMethodName || "",
      amountUzs: toIntegerAmount(item.depositChangeUzs),
      note: item.note || ""
    }));
}

function FinanceBalancesPanel({ onClose }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [ledgerClient, setLedgerClient] = useState(null);
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerExporting, setLedgerExporting] = useState(false);
  const [ledgerColumnsOpen, setLedgerColumnsOpen] = useState(false);
  const [visibleLedgerColumnIds, setVisibleLedgerColumnIds] = useState(() => loadStoredClientLedgerColumnIds());
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [depositModal, setDepositModal] = useState(null);
  const [depositForm, setDepositForm] = useState(EMPTY_DEPOSIT_FORM);
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositSourceRows, setDepositSourceRows] = useState([]);
  const [depositSourceLoading, setDepositSourceLoading] = useState(false);

  const ledgerColumns = [
    {
      id: "operationDate",
      label: "Operation Date",
      className: "finance-client-ledger-col-date",
      widthPx: 128,
      render: (item) => formatDateTimeTashkent(item.transactionAt || item.createdAt),
      exportValue: (item) => formatDateTimeTashkent(item.transactionAt || item.createdAt)
    },
    {
      id: "operationNumber",
      label: "Operation Number",
      className: "finance-client-ledger-col-operation",
      widthPx: 96,
      render: (item) => item.id ? `#${item.id}` : "-",
      exportValue: (item) => item.id || ""
    },
    {
      id: "action",
      label: "Action",
      className: "finance-client-ledger-col-action",
      widthPx: 190,
      render: (item) => getTransactionActionLabel(translate, item),
      exportValue: (item) => getTransactionActionLabel(translate, item)
    },
    {
      id: "ticketNumber",
      label: "Ticket Number",
      className: "finance-client-ledger-col-ticket",
      widthPx: 124,
      render: (item) => item.ticketNumber ? `#${item.ticketNumber}` : "-",
      exportValue: (item) => item.ticketNumber || ""
    },
    {
      id: "serviceName",
      label: "Service Name",
      className: "finance-client-ledger-col-service",
      widthPx: 180,
      render: (item) => item.serviceName || "-",
      exportValue: (item) => item.serviceName || ""
    },
    {
      id: "paymentMethod",
      label: "Payment Method",
      className: "finance-client-ledger-col-method",
      widthPx: 132,
      render: (item) => item.paymentMethodName || translate("Balance"),
      exportValue: (item) => item.paymentMethodName || translate("Balance")
    },
    {
      id: "cashIn",
      label: "Cash In",
      className: "finance-client-ledger-col-money",
      cellClassName: "finance-client-ledger-money-cell",
      widthPx: 122,
      render: (item) => formatMoney(getClientLedgerCashInUzs(item)),
      exportValue: (item) => getClientLedgerCashInUzs(item)
    },
    {
      id: "cashOut",
      label: "Cash Out",
      className: "finance-client-ledger-col-money",
      cellClassName: "finance-client-ledger-money-cell",
      widthPx: 122,
      render: (item) => formatMoney(getClientLedgerCashOutUzs(item)),
      exportValue: (item) => getClientLedgerCashOutUzs(item)
    },
    {
      id: "depositChange",
      label: "Deposit +/-",
      className: "finance-client-ledger-col-deposit-change",
      widthPx: 122,
      cellClassName: (item) => [
        "finance-client-ledger-money-cell",
        item.depositChangeUzs > 0 ? "finance-balance-positive" : "",
        item.depositChangeUzs < 0 ? "finance-balance-negative" : ""
      ].filter(Boolean).join(" "),
      render: (item) => formatSignedMoney(item.depositChangeUzs),
      exportValue: (item) => toIntegerAmount(item.depositChangeUzs)
    },
    {
      id: "depositBalance",
      label: "Deposit Balance",
      className: "finance-client-ledger-col-deposit-balance",
      cellClassName: "finance-client-ledger-money-cell",
      widthPx: 132,
      render: (item) => formatMoney(item.depositBalanceAfterUzs),
      exportValue: (item) => toIntegerAmount(item.depositBalanceAfterUzs)
    },
    {
      id: "cashier",
      label: "Cashier",
      className: "finance-client-ledger-col-cashier",
      widthPx: 160,
      render: (item) => item.cashierName || "-",
      exportValue: (item) => item.cashierName || ""
    },
    {
      id: "status",
      label: "Status",
      className: "finance-client-ledger-col-status",
      widthPx: 96,
      render: (item) => (
        <span className={item.status === "voided" ? "finance-transaction-status-voided" : isTransactionReversed(item) ? "finance-transaction-status-reversed" : "finance-transaction-status-active"}>
          {getTransactionStatusLabel(translate, item)}
        </span>
      ),
      exportValue: (item) => getTransactionStatusLabel(translate, item)
    },
    {
      id: "note",
      label: "Note",
      className: "finance-client-ledger-col-note",
      widthPx: 210,
      render: (item) => getClientLedgerNote(translate, item),
      exportValue: (item) => getClientLedgerNote(translate, item)
    }
  ];

  const visibleLedgerColumns = ledgerColumns.filter((column) => visibleLedgerColumnIds.includes(column.id));
  const visibleLedgerColumnCount = Math.max(visibleLedgerColumns.length, 1);
  const visibleLedgerTableMinWidth = Math.max(
    640,
    visibleLedgerColumns.reduce((sum, column) => sum + (Number.parseInt(String(column.widthPx || 0), 10) || 120), 0)
  );

  const toggleLedgerColumnVisibility = (columnId) => {
    setVisibleLedgerColumnIds((current) => {
      const currentIds = Array.isArray(current) ? current : DEFAULT_FINANCE_CLIENT_LEDGER_COLUMN_IDS;
      const nextIds = new Set(currentIds);
      if (nextIds.has(columnId)) {
        if (nextIds.size <= 1) return currentIds;
        nextIds.delete(columnId);
      } else if (ledgerColumns.some((column) => column.id === columnId)) {
        nextIds.add(columnId);
      }
      const next = ledgerColumns.map((column) => column.id).filter((id) => nextIds.has(id));
      if (next.length > 0) {
        storeClientLedgerColumnIds(next);
        return next;
      }
      return currentIds;
    });
  };

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
    if (paymentMethodsLoading || paymentMethods.length > 0) return;
    setPaymentMethodsLoading(true);
    try {
      const response = await apiFetch("/api/finance/payment-methods");
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Failed to load payment methods."));
        return;
      }
      setPaymentMethods(Array.isArray(data?.items) ? data.items : []);
    } catch {
      window.alert?.(translate("Failed to load payment methods."));
    } finally {
      setPaymentMethodsLoading(false);
    }
  }, [paymentMethods.length, paymentMethodsLoading, translate]);

  useEffect(() => {
    void loadBalances(1, EMPTY_FILTERS);
  }, [loadBalances]);

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
            translate("Client ID"),
            translate("Client"),
            translate("Debt"),
            translate("Deposit")
          ],
          ...rows.map((item, index) => [
            index + 1,
            item.clientId || "",
            item.clientName || "",
            Number.parseInt(String(item.debtUzs || 0), 10) || 0,
            Number.parseInt(String(item.depositUzs || 0), 10) || 0
          ])
        ]
      }]);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  const exportClientLedger = () => {
    if (ledgerExporting || ledgerLoading) return;
    setLedgerExporting(true);
    try {
      const clientId = String(ledgerData?.client?.clientId || ledgerClient?.clientId || "").trim();
      exportExcelWorkbook(buildExportFilename(`finance-client-${clientId || "ledger"}-transactions`), [{
        name: translate("Client Transactions"),
        rows: [
          visibleLedgerColumns.map((column) => translate(column.label)),
          ...ledgerItems.map((item) => visibleLedgerColumns.map((column) => column.exportValue(item)))
        ]
      }]);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setLedgerExporting(false);
    }
  };

  const openClientLedger = async (item) => {
    const clientId = String(item?.clientId || "");
    if (!clientId || ledgerLoading) return;
    setLedgerClient(item);
    setLedgerData(null);
    setLedgerLoading(true);
    try {
      const response = await apiFetch(`/api/finance/client-balances/${clientId}/transactions`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Failed to load client transactions."));
        setLedgerClient(null);
        return;
      }
      setLedgerData(data || null);
    } catch {
      window.alert?.(translate("Failed to load client transactions."));
      setLedgerClient(null);
    } finally {
      setLedgerLoading(false);
    }
  };

  const closeClientLedger = () => {
    setLedgerColumnsOpen(false);
    setLedgerClient(null);
    setLedgerData(null);
  };

  const closeLedgerColumns = () => {
    setLedgerColumnsOpen(false);
  };

  const loadDepositSources = async (clientId) => {
    setDepositSourceRows([]);
    if (!clientId) return;
    setDepositSourceLoading(true);
    try {
      const response = await apiFetch(`/api/finance/client-balances/${clientId}/transactions`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Failed to load client transactions."));
        return;
      }
      setDepositSourceRows(getDepositSourceRows(data?.items));
    } catch {
      window.alert?.(translate("Failed to load client transactions."));
    } finally {
      setDepositSourceLoading(false);
    }
  };

  const openDepositModal = (type, item) => {
    setDepositModal({ type, item });
    setDepositForm(EMPTY_DEPOSIT_FORM);
    setDepositSourceRows([]);
    void loadPaymentMethods();
    if (type === "refund") {
      void loadDepositSources(item?.clientId);
    }
  };

  const closeDepositModal = (force = false) => {
    if (depositSubmitting && !force) return;
    setDepositModal(null);
    setDepositForm(EMPTY_DEPOSIT_FORM);
    setDepositSourceRows([]);
    setDepositSourceLoading(false);
  };

  const submitDepositOperation = async (event) => {
    event.preventDefault();
    if (depositSubmitting || !depositModal?.item) return;
    const clientId = String(depositModal.item.clientId || "").trim();
    const amountUzs = toIntegerAmount(depositForm.amountUzs);
    const paymentMethodId = String(depositForm.paymentMethodId || "").trim();
    const isRefund = depositModal.type === "refund";
    const reason = String(depositForm.reason || "").trim();
    if (!clientId) {
      window.alert?.(translate("Client is required."));
      return;
    }
    if (!paymentMethodId) {
      window.alert?.(translate("Payment method is required."));
      return;
    }
    if (amountUzs <= 0) {
      window.alert?.(translate("Payment amount is required."));
      return;
    }
    if (isRefund && amountUzs > toIntegerAmount(depositModal.item.depositUzs)) {
      window.alert?.(translate("Refund amount exceeds client deposit."));
      return;
    }
    if (isRefund && !reason) {
      window.alert?.(translate("Refund reason is required."));
      return;
    }
    setDepositSubmitting(true);
    try {
      const response = await apiFetch(`/api/finance/client-balances/${isRefund ? "refund" : "deposit"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          paymentMethodId,
          amountUzs,
          note: isRefund ? reason : depositForm.note,
          reason: isRefund ? reason : undefined
        })
      });
      const data = await readApiResponseData(response);
      if (!response.ok) {
        window.alert?.(translate(data?.message || "Deposit transaction failed."));
        return;
      }
      closeDepositModal(true);
      await loadBalances(page, appliedFilters);
      if (ledgerClient && String(ledgerClient.clientId || "") === clientId) {
        await openClientLedger(ledgerClient);
      }
    } catch {
      window.alert?.(translate("Deposit transaction failed."));
    } finally {
      setDepositSubmitting(false);
    }
  };

  const ledgerItems = Array.isArray(ledgerData?.items) ? ledgerData.items : [];
  const paymentMethodOptions = paymentMethods.map((item) => ({
    value: String(item.id),
    label: item.name || String(item.id)
  }));
  const depositModalClient = depositModal?.item || null;
  const isDepositRefund = depositModal?.type === "refund";
  const depositModalTitle = isDepositRefund ? "Refund money" : "Top up deposit";

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
              onChange={(event) => {
                const value = event.currentTarget.value;
                setFilters((current) => ({ ...current, client: value }));
              }}
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
        <table className="all-users-table finance-balances-table" aria-label="Finance client balances table">
          <colgroup>
            <col className="finance-balances-col-index" />
            <col className="finance-balances-col-client-id" />
            <col className="finance-balances-col-client" />
            <col className="finance-balances-col-debt" />
            <col className="finance-balances-col-deposit" />
            <col className="finance-balances-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>{translate("Client ID")}</th>
              <th>{translate("Client")}</th>
              <th>{translate("Debt")}</th>
              <th>{translate("Deposit")}</th>
              <th>{translate("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="6" className="skel" />
                </tr>
              ))
            ) : items.map((item, index) => (
              <tr
                key={String(item.clientId)}
                className="finance-balances-client-row"
                title={translate("Double-click to view client transactions")}
                tabIndex={0}
                onDoubleClick={() => openClientLedger(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void openClientLedger(item);
                  }
                }}
              >
                <td>{(page - 1) * 20 + index + 1}</td>
                <td>{item.clientId}</td>
                <td>{item.clientName || "-"}</td>
                <td>{formatMoney(item.debtUzs)}</td>
                <td>{formatMoney(item.depositUzs)}</td>
                <td className="finance-balances-actions-cell">
                  <div className="finance-balances-row-actions">
                    <button
                      type="button"
                      className="table-action-btn finance-balance-action-btn"
                      aria-label={translate("Top up deposit")}
                      title={translate("Top up deposit")}
                      onClick={(event) => {
                        event.stopPropagation();
                        openDepositModal("topup", item);
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <span className="finance-balance-action-icon finance-balance-action-icon-topup" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="table-action-btn finance-balance-action-btn finance-balance-refund-btn"
                      aria-label={translate("Refund money")}
                      title={translate("Refund money")}
                      disabled={toIntegerAmount(item.depositUzs) <= 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        openDepositModal("refund", item);
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <span className="finance-balance-action-icon finance-balance-action-icon-refund" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan="6" className="all-users-state">{translate("No items found.")}</td>
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

      {ledgerClient && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close client transactions modal")}
            onClick={closeClientLedger}
          />
          <div id="financeClientLedgerModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-client-ledger-modal">
            <div className="finance-client-ledger-head">
              <h3 className="finance-client-ledger-title">{translate("Client Transactions")}</h3>
              <div className="finance-client-ledger-client-name" title={ledgerData?.client?.clientName || ledgerClient.clientName || "-"}>
                {ledgerData?.client?.clientName || ledgerClient.clientName || "-"}
              </div>
              <div className="finance-client-ledger-head-actions">
                <button
                  type="button"
                  className="table-action-btn finance-head-icon-btn"
                  aria-label={translate("Table columns")}
                  title={translate("Table columns")}
                  onClick={() => setLedgerColumnsOpen(true)}
                >
                  <span className="finance-head-icon finance-head-icon-columns" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="table-action-btn finance-head-icon-btn"
                  aria-label={translate("Export Excel")}
                  title={translate("Export Excel")}
                  disabled={ledgerLoading || ledgerExporting}
                  onClick={exportClientLedger}
                >
                  <span className="finance-head-icon finance-head-icon-export" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="table-action-btn finance-head-icon-btn finance-client-ledger-close-btn"
                  aria-label={translate("Close client transactions modal")}
                  title={translate("Close")}
                  onClick={closeClientLedger}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="all-users-table-scroll finance-client-ledger-table-scroll">
              <table
                className="all-users-table finance-client-ledger-table"
                aria-label="Client transaction ledger table"
                style={{ minWidth: `${visibleLedgerTableMinWidth}px` }}
              >
                <colgroup>
                  {visibleLedgerColumns.map((column) => (
                    <col key={column.id} className={column.className || undefined} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {visibleLedgerColumns.map((column) => {
                      const headClassName = [
                        column.className,
                        typeof column.cellClassName === "string" ? column.cellClassName : ""
                      ].filter(Boolean).join(" ");
                      return (
                        <th key={column.id} className={headClassName || undefined}>
                          {translate(column.label)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {ledgerLoading ? (
                    [0, 1, 2].map((index) => (
                      <tr key={index} aria-hidden="true">
                        <td colSpan={visibleLedgerColumnCount} className="skel" />
                      </tr>
                    ))
                  ) : ledgerItems.map((item) => (
                    <tr key={String(item.id)} className={item.status === "voided" ? "finance-client-ledger-voided-row" : undefined}>
                      {visibleLedgerColumns.map((column) => {
                        const cellClassName = typeof column.cellClassName === "function"
                          ? column.cellClassName(item)
                          : column.cellClassName;
                        const mergedCellClassName = [column.className, cellClassName].filter(Boolean).join(" ");
                        return (
                          <td key={column.id} className={mergedCellClassName || undefined}>
                            {column.render(item)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {!ledgerLoading && ledgerItems.length === 0 ? (
                    <tr>
                      <td colSpan={visibleLedgerColumnCount} className="all-users-state">{translate("No items found.")}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          {ledgerColumnsOpen ? (
            <>
              <button
                type="button"
                className="login-overlay stacked-modal-overlay finance-modal-overlay"
                aria-label={translate("Close table columns modal")}
                onClick={closeLedgerColumns}
              />
              <div id="financeClientLedgerColumnsModal" className="logout-confirm-modal all-users-edit-modal finance-modal finance-ticket-columns-modal finance-client-ledger-columns-modal">
                <h3>{translate("Table columns")}</h3>
                <div className="finance-ticket-columns-list">
                  {ledgerColumns.map((column) => {
                    const checked = visibleLedgerColumnIds.includes(column.id);
                    return (
                      <label className="finance-ticket-column-option" key={column.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={checked && visibleLedgerColumnIds.length <= 1}
                          onChange={() => toggleLedgerColumnVisibility(column.id)}
                        />
                        <span>{translate(column.label)}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="edit-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeLedgerColumns}>{translate("Close")}</button>
                </div>
              </div>
            </>
          ) : null}
        </>
      ), document.body) : null}

      {depositModal && typeof document !== "undefined" ? createPortal((
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay finance-modal-overlay"
            aria-label={translate("Close deposit modal")}
            onClick={() => closeDepositModal()}
          />
          <div
            id="financeDepositOperationModal"
            className={`logout-confirm-modal all-users-edit-modal finance-modal finance-deposit-operation-modal ${isDepositRefund ? "is-refund" : "is-topup"}`}
          >
            <h3 className="finance-modal-title-with-number">
              <span>{translate(depositModalTitle)}</span>
            </h3>
            <form className="auth-form" onSubmit={submitDepositOperation}>
              <div className="all-users-edit-fields finance-deposit-operation-fields">
                <div className="finance-deposit-operation-summary">
                  <div className="finance-total-cell">
                    <strong>{translate("Client")}</strong>
                    <span>{depositModalClient?.clientName || "-"}</span>
                  </div>
                  <div className="finance-total-cell">
                    <strong>{translate("Current Deposit")}</strong>
                    <span>{formatMoney(depositModalClient?.depositUzs)}</span>
                  </div>
                  <div className="finance-total-cell">
                    <strong>{translate("Debt")}</strong>
                    <span>{formatMoney(depositModalClient?.debtUzs)}</span>
                  </div>
                </div>

                {isDepositRefund ? (
                  <section className="finance-deposit-source-panel">
                    <header className="finance-payment-panel-head">
                      <span>{translate("Deposit income history")}</span>
                    </header>
                    <div className="finance-deposit-source-list" aria-busy={depositSourceLoading ? "true" : "false"}>
                      <span className="finance-deposit-source-head">{translate("Operation Date")}</span>
                      <span className="finance-deposit-source-head">{translate("Payment Method")}</span>
                      <span className="finance-deposit-source-head is-money">{translate("Amount")}</span>
                      {depositSourceLoading ? (
                        <span className="all-users-state finance-deposit-source-empty">{translate("Loading...")}</span>
                      ) : depositSourceRows.length > 0 ? depositSourceRows.map((row) => (
                        <div className="finance-deposit-source-row" key={String(row.id)}>
                          <span>{formatDateTimeTashkent(row.date)}</span>
                          <span>{row.paymentMethodName || translate("Client Balance")}</span>
                          <strong>{formatMoney(row.amountUzs)}</strong>
                        </div>
                      )) : (
                        <span className="all-users-state finance-deposit-source-empty">{translate("No items found.")}</span>
                      )}
                    </div>
                  </section>
                ) : null}

                <div className="finance-deposit-operation-grid">
                  <label className="field">
                    <span>{translate(isDepositRefund ? "Refund Method" : "Payment Method")}</span>
                    <CustomSelect
                      value={depositForm.paymentMethodId}
                      options={paymentMethodOptions}
                      placeholder={paymentMethodsLoading ? "..." : translate("Payment Method")}
                      menuPortal
                      onChange={(value) => setDepositForm((current) => ({ ...current, paymentMethodId: value }))}
                    />
                  </label>
                  <label className="field">
                    <span>{translate(isDepositRefund ? "Refund Amount" : "Amount")}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={depositForm.amountUzs}
                      onWheel={(event) => event.currentTarget.blur()}
                      onChange={(event) => {
                        setDepositForm((current) => ({ ...current, amountUzs: event.currentTarget.value }));
                      }}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>{translate(isDepositRefund ? "Reason" : "Note")}</span>
                  <input
                    type="text"
                    maxLength={255}
                    value={isDepositRefund ? depositForm.reason : depositForm.note}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDepositForm((current) => isDepositRefund
                        ? { ...current, reason: value }
                        : { ...current, note: value });
                    }}
                  />
                </label>
              </div>

              <div className="edit-actions">
                <button type="button" className="btn btn-secondary" onClick={() => closeDepositModal()}>{translate("Cancel")}</button>
                <button type="submit" className="btn" disabled={depositSubmitting || paymentMethodsLoading}>
                  {depositSubmitting ? "..." : translate(isDepositRefund ? "Refund money" : "Top up")}
                </button>
              </div>
            </form>
          </div>
        </>
      ), document.body) : null}

    </section>
  );
}

export default FinanceBalancesPanel;
