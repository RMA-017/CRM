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

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount > 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function formatSignedMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
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
    setLedgerClient(null);
    setLedgerData(null);
  };

  const ledgerSummary = ledgerData?.summary || {};
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
            <h3>{`${translate("Client Transactions")} - ${ledgerData?.client?.clientName || ledgerClient.clientName || "-"}`}</h3>
            <div className="finance-client-ledger-summary" aria-busy={ledgerLoading ? "true" : "false"}>
              <div>
                <strong>{translate("Debt")}</strong>
                <span className={ledgerSummary.debtUzs > 0 ? "finance-balance-negative" : ""}>{formatMoney(ledgerSummary.debtUzs)}</span>
              </div>
              <div>
                <strong>{translate("Deposit")}</strong>
                <span className={ledgerSummary.depositUzs > 0 ? "finance-balance-positive" : ""}>{formatMoney(ledgerSummary.depositUzs)}</span>
              </div>
              <div>
                <strong>{translate("Cash In")}</strong>
                <span>{formatMoney(ledgerSummary.cashInUzs)}</span>
              </div>
              <div>
                <strong>{translate("Cash Out")}</strong>
                <span>{formatMoney(ledgerSummary.cashOutUzs)}</span>
              </div>
              <div>
                <strong>{translate("Ticket Paid")}</strong>
                <span>{formatMoney(ledgerSummary.ticketPaidUzs)}</span>
              </div>
              <div>
                <strong>{translate("Deposit Used")}</strong>
                <span>{formatMoney(ledgerSummary.depositUsedUzs)}</span>
              </div>
            </div>
            <div className="all-users-table-scroll finance-client-ledger-table-scroll">
              <table className="all-users-table finance-client-ledger-table" aria-label="Client transaction ledger table">
                <thead>
                  <tr>
                    <th>{translate("Created At")}</th>
                    <th>{translate("Action")}</th>
                    <th>{translate("Ticket Number")}</th>
                    <th>{translate("Service Name")}</th>
                    <th>{translate("Payment Method")}</th>
                    <th>{translate("Cash In")}</th>
                    <th>{translate("Cash Out")}</th>
                    <th>{translate("Deposit +/-")}</th>
                    <th>{translate("Deposit Balance")}</th>
                    <th>{translate("Cashier")}</th>
                    <th>{translate("Status")}</th>
                    <th>{translate("Note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerLoading ? (
                    [0, 1, 2].map((index) => (
                      <tr key={index} aria-hidden="true">
                        <td colSpan="12" className="skel" />
                      </tr>
                    ))
                  ) : ledgerItems.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{formatDateTime(item.createdAt || item.transactionAt)}</td>
                      <td>{getTransactionActionLabel(translate, item)}</td>
                      <td>{item.ticketNumber ? `#${item.ticketNumber}` : "-"}</td>
                      <td>{item.serviceName || "-"}</td>
                      <td>{item.paymentMethodName || translate("Balance")}</td>
                      <td>{formatMoney(item.cashInUzs)}</td>
                      <td>{formatMoney(item.cashOutUzs)}</td>
                      <td className={item.depositChangeUzs > 0 ? "finance-balance-positive" : item.depositChangeUzs < 0 ? "finance-balance-negative" : undefined}>
                        {formatSignedMoney(item.depositChangeUzs)}
                      </td>
                      <td>{formatMoney(item.depositBalanceAfterUzs)}</td>
                      <td>{item.cashierName || "-"}</td>
                      <td>{item.status === "voided" ? translate("Cancelled") : translate("Active")}</td>
                      <td>{item.note || "-"}</td>
                    </tr>
                  ))}
                  {!ledgerLoading && ledgerItems.length === 0 ? (
                    <tr>
                      <td colSpan="12" className="all-users-state">{translate("No items found.")}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="edit-actions">
              <button type="button" className="btn btn-secondary" onClick={closeClientLedger}>{translate("Close")}</button>
            </div>
          </div>
        </>
      ), document.body) : null}

    </section>
  );
}

export default FinanceBalancesPanel;
