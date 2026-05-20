import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { formatDateYMD } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FILTERS = Object.freeze({
  ticketNumber: "",
  dateFrom: "",
  dateTo: "",
  client: "",
  specialist: "",
  position: "",
  service: "",
  status: ""
});

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount > 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function formatDateTime(value) {
  const raw = String(value || "");
  if (!raw) return "-";
  const date = formatDateYMD(raw);
  const timeMatch = raw.match(/T(\d{2}:\d{2})/);
  return timeMatch ? `${date} ${timeMatch[1]}` : date;
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

function FinanceTicketsPanel({ onClose }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [items, setItems] = useState([]);
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
        window.alert?.(translate(nextMessage));
        return;
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
      setPage(Number.parseInt(String(data?.page || nextPage), 10) || 1);
      setTotalPages(Number.parseInt(String(data?.totalPages || 1), 10) || 1);
      setTotal(Number.parseInt(String(data?.total || 0), 10) || 0);
      setMessage("");
    } catch {
      setMessage("Failed to load tickets.");
      window.alert?.(translate("Failed to load tickets."));
    } finally {
      setLoading(false);
    }
  }, [translate]);

  useEffect(() => {
    void loadTickets(1, EMPTY_FILTERS);
  }, [loadTickets]);

  const applyFilters = (event) => {
    event.preventDefault();
    setAppliedFilters(filters);
    void loadTickets(1, filters);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    void loadTickets(1, EMPTY_FILTERS);
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
      allItems.push(...(Array.isArray(data?.items) ? data.items : []));
      nextTotalPages = Number.parseInt(String(data?.totalPages || 1), 10) || 1;
      nextPage += 1;
    } while (nextPage <= nextTotalPages);
    return allItems;
  };

  const exportTickets = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = await fetchAllTickets();
      exportExcelWorkbook(buildExportFilename("finance-tickets"), [{
        name: translate("Tickets"),
        rows: [
          [
            translate("Ticket Number"),
            translate("Ticket Date"),
            translate("Client"),
            translate("Specialist"),
            translate("Department"),
            translate("Service"),
            translate("Total"),
            translate("Status")
          ],
          ...rows.map((item) => [
            item.ticketNumber || "",
            formatDateYMD(item.ticketDate),
            item.clientName || "",
            getTicketSpecialistText(item),
            getTicketPositionText(item),
            getTicketServiceText(item),
            Number.parseInt(String(item.totalUzs ?? item.amountUzs ?? 0), 10) || 0,
            translateTicketStatus(translate, item.status)
          ])
        ]
      }]);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  const filterFields = useMemo(() => ([
    { key: "ticketNumber", label: "Ticket Number", type: "text" },
    { key: "dateFrom", label: "Ticket Date From", type: "date" },
    { key: "dateTo", label: "Ticket Date To", type: "date" },
    { key: "client", label: "Client", type: "text" },
    { key: "specialist", label: "Specialist", type: "text" },
    { key: "position", label: "Department", type: "text" },
    { key: "service", label: "Service", type: "text" }
  ]), []);

  return (
    <section id="financeTicketsPanel" className="all-users-panel settings-panel">
      <div className="all-users-head">
        <h3>{translate("Tickets")}</h3>
        <div className="all-users-head-actions">
          <button type="button" className="table-action-btn" disabled={loading || exporting} onClick={exportTickets}>
            {translate("Export Excel")}
          </button>
          <button type="button" className="table-action-btn" onClick={() => loadTickets(page, appliedFilters)}>{translate("Refresh")}</button>
          <button type="button" className="header-btn panel-close-btn" aria-label={translate("Close tickets panel")} onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <form className="settings-filter-grid" onSubmit={applyFilters}>
        {filterFields.map((field) => (
          <label className="field" key={field.key}>
            <span>{translate(field.label)}</span>
            <input
              type={field.type}
              value={filters[field.key]}
              onChange={(event) => setFilters((current) => ({ ...current, [field.key]: event.currentTarget.value }))}
            />
          </label>
        ))}
        <label className="field">
          <span>{translate("Status")}</span>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.currentTarget.value }))}
          >
            <option value="">{translate("All")}</option>
            <option value="issued">{translate("Tickets")}</option>
            <option value="paid">{translate("Paid")}</option>
            <option value="unpaid">{translate("Unpaid")}</option>
            <option value="voided">{translate("Voided")}</option>
          </select>
        </label>
        <div className="settings-filter-actions">
          <button type="submit" className="table-action-btn" disabled={loading}>{translate("Search")}</button>
          <button type="button" className="table-action-btn" disabled={loading} onClick={resetFilters}>{translate("Reset")}</button>
        </div>
      </form>

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>
      <p className="all-users-state">{`${translate("Total")}: ${total}`}</p>

      <div className="all-users-table-scroll">
        <table className="all-users-table" aria-label="Finance tickets table">
          <thead>
            <tr>
              <th>{translate("Ticket Number")}</th>
              <th>{translate("Ticket Date")}</th>
              <th>{translate("Client")}</th>
              <th>{translate("Specialist")}</th>
              <th>{translate("Department")}</th>
              <th>{translate("Service")}</th>
              <th>{translate("Total")}</th>
              <th>{translate("Status")}</th>
              <th>{translate("Actions")}</th>
              <th>{translate("Ticket History")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} aria-hidden="true">
                  <td colSpan="10" className="skel" />
                </tr>
              ))
            ) : items.map((item) => (
              <tr key={String(item.id)}>
                <td>{item.ticketNumber ? `#${item.ticketNumber}` : "-"}</td>
                <td>{formatDateYMD(item.ticketDate)}</td>
                <td>{item.clientName || "-"}</td>
                <td>{getTicketSpecialistText(item)}</td>
                <td>{getTicketPositionText(item)}</td>
                <td>{getTicketServiceText(item)}</td>
                <td>{formatMoney(item.totalUzs ?? item.amountUzs)}</td>
                <td>{translateTicketStatus(translate, item.status)}</td>
                <td>
                  {item.status === "paid" ? (
                    <button
                      type="button"
                      className="table-action-btn"
                      disabled={refundingId === String(item.id)}
                      onClick={() => refundTicket(item)}
                    >
                      {translate("Refund")}
                    </button>
                  ) : "-"}
                </td>
                <td>
                  <button type="button" className="table-action-btn" onClick={() => openHistory(item)}>
                    {translate("Ticket History")}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan="10" className="all-users-state">{translate("No items found.")}</td>
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

      {historyTicket ? (
        <>
          <button
            type="button"
            className="login-overlay stacked-modal-overlay"
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
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr><td colSpan="4" className="skel" /></tr>
                  ) : historyItems.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>{translate(item.action || "-")}</td>
                      <td>{[item.fromStatus, item.toStatus].filter(Boolean).map((status) => translateTicketStatus(translate, status)).join(" -> ") || "-"}</td>
                      <td>{item.actorName || "-"}</td>
                    </tr>
                  ))}
                  {!historyLoading && historyItems.length === 0 ? (
                    <tr><td colSpan="4" className="all-users-state">{translate("No items found.")}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="edit-actions">
              <button type="button" className="btn btn-secondary" onClick={closeHistory}>{translate("Close")}</button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default FinanceTicketsPanel;
