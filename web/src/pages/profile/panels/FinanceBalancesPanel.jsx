import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { formatDateYMD } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FILTERS = Object.freeze({
  client: "",
  type: "active"
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

function formatDateTime(value) {
  const raw = String(value || "");
  if (!raw) return "-";
  const date = formatDateYMD(raw);
  const timeMatch = raw.match(/T(\d{2}:\d{2})/);
  return timeMatch ? `${date} ${timeMatch[1]}` : date;
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
  const base = translate(labels[type] || translateTransactionType(translate, type));
  return ticket && ["ticket_payment", "deposit_ticket_payment", "deposit_ticket_refund", "refund"].includes(type)
    ? `${base}${ticket}`
    : base;
}

function getTransactionStatusLabel(translate, status) {
  return String(status || "") === "voided" ? translate("Cancelled") : translate("Active");
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
  if (String(item?.status || "") !== "voided") return note || "-";
  const cancelledText = voidReason ? `${translate("Cancelled")}: ${voidReason}` : translate("Cancelled");
  return note ? `${note} | ${cancelledText}` : cancelledText;
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

  const ledgerColumns = [
    {
      id: "operationDate",
      label: "Operation Date",
      className: "finance-client-ledger-col-date",
      widthPx: 128,
      render: (item) => formatDateTime(item.transactionAt || item.createdAt),
      exportValue: (item) => formatDateTime(item.transactionAt || item.createdAt)
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
      widthPx: 92,
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
      widthPx: 120,
      render: (item) => item.cashierName || "-",
      exportValue: (item) => item.cashierName || ""
    },
    {
      id: "status",
      label: "Status",
      className: "finance-client-ledger-col-status",
      widthPx: 96,
      render: (item) => (
        <span className={item.status === "voided" ? "finance-transaction-status-voided" : "finance-transaction-status-active"}>
          {getTransactionStatusLabel(translate, item.status)}
        </span>
      ),
      exportValue: (item) => getTransactionStatusLabel(translate, item.status)
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

  const ledgerItems = Array.isArray(ledgerData?.items) ? ledgerData.items : [];

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
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>{translate("Client ID")}</th>
              <th>{translate("Client")}</th>
              <th>{translate("Debt")}</th>
              <th>{translate("Deposit")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="5" className="skel" />
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
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan="5" className="all-users-state">{translate("No items found.")}</td>
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
                    {visibleLedgerColumns.map((column) => (
                      <th key={column.id} className={typeof column.cellClassName === "string" ? column.cellClassName : undefined}>
                        {translate(column.label)}
                      </th>
                    ))}
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
                        return (
                          <td key={column.id} className={cellClassName || undefined}>
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

    </section>
  );
}

export default FinanceBalancesPanel;
