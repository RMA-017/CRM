import { useCallback, useEffect, useState } from "react";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { buildExportFilename, exportExcelWorkbook } from "../../../lib/excel-export.js";
import { getTodayYmd } from "../../../lib/formatters.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const EMPTY_FILTERS = Object.freeze({
  dateFrom: getTodayYmd(),
  dateTo: getTodayYmd()
});

function formatMoney(value) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  return amount !== 0 ? `${amount.toLocaleString("ru-RU")} UZS` : "-";
}

function ReportTable({ title, items, translate }) {
  return (
    <section className="finance-report-section">
      <h4>{translate(title)}</h4>
      <div className="all-users-table-scroll">
        <table className="all-users-table" aria-label={`${title} report table`}>
          <thead>
            <tr>
              <th>{translate("Name")}</th>
              <th>{translate("Amount UZS")}</th>
              <th>{translate("Count")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${title}-${item.id || item.label}`}>
                <td>{item.label || "-"}</td>
                <td>{formatMoney(item.amountUzs)}</td>
                <td>{item.count || 0}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr><td colSpan="3" className="all-users-state">{translate("No items found.")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FinanceReportsPanel({ onClose }) {
  const { translate } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);

  const loadReports = useCallback(async (nextFilters = EMPTY_FILTERS) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      Object.entries(nextFilters).forEach(([key, value]) => {
        const normalized = String(value || "").trim();
        if (normalized) {
          query.set(key, normalized);
        }
      });
      const response = await apiFetch(`/api/finance/reports?${query.toString()}`);
      const data = await readApiResponseData(response);
      if (!response.ok) {
        const nextMessage = data?.message || "Failed to load finance reports.";
        setMessage(nextMessage);
        window.alert?.(translate(nextMessage));
        return;
      }
      setReport(data || {});
      setMessage("");
    } catch {
      setMessage("Failed to load finance reports.");
      window.alert?.(translate("Failed to load finance reports."));
    } finally {
      setLoading(false);
    }
  }, [translate]);

  useEffect(() => {
    void loadReports(EMPTY_FILTERS);
  }, [loadReports]);

  const applyFilters = (event) => {
    event.preventDefault();
    setAppliedFilters(filters);
    void loadReports(filters);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    void loadReports(EMPTY_FILTERS);
  };

  const exportReports = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      let nextReport = report;
      if (!nextReport) {
        const query = new URLSearchParams();
        Object.entries(appliedFilters).forEach(([key, value]) => {
          const normalized = String(value || "").trim();
          if (normalized) {
            query.set(key, normalized);
          }
        });
        const response = await apiFetch(`/api/finance/reports?${query.toString()}`);
        const data = await readApiResponseData(response);
        if (!response.ok) {
          throw new Error(data?.message || "Export failed.");
        }
        nextReport = data || {};
      }
      const nextSummary = nextReport?.summary || {};
      const reportSheets = [
        {
          name: translate("Reports"),
          rows: [
            [translate("Name"), translate("Amount UZS"), translate("Count")],
            [
              translate("Net Total"),
              Number.parseInt(String(nextSummary.amountUzs || 0), 10) || 0,
              Number.parseInt(String(nextSummary.transactionCount || 0), 10) || 0
            ]
          ]
        },
        ["By Service", nextReport?.byService || []],
        ["By Specialist", nextReport?.bySpecialist || []],
        ["By Department", nextReport?.byDepartment || []],
        ["By Client", nextReport?.byClient || []],
        ["By Cashier", nextReport?.byCashier || []]
      ].map((sheet) => {
        if (!Array.isArray(sheet)) return sheet;
        const [title, items] = sheet;
        return {
          name: translate(title),
          rows: [
            [translate("Name"), translate("Amount UZS"), translate("Count")],
            ...items.map((item) => [
              item.label || "",
              Number.parseInt(String(item.amountUzs || 0), 10) || 0,
              Number.parseInt(String(item.count || 0), 10) || 0
            ])
          ]
        };
      });
      exportExcelWorkbook(buildExportFilename("finance-reports"), reportSheets);
    } catch (error) {
      window.alert?.(translate(error?.message || "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  const summary = report?.summary || {};

  return (
    <section id="financeReportsPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-reports-panel">
      <div className="all-users-head">
        <h3>{translate("Reports")}</h3>
        <div className="all-users-head-actions">
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            aria-label={translate("Export Excel")}
            title={translate("Export Excel")}
            disabled={loading || exporting}
            onClick={exportReports}
          >
            <span className="finance-head-icon finance-head-icon-export" aria-hidden="true" />
          </button>
          <button type="button" className="header-btn panel-close-btn" aria-label="Close finance reports panel" onClick={onClose}>
            ×
          </button>
        </div>
      </div>

      <form className="settings-filter-grid" onSubmit={applyFilters}>
        <label className="field">
          <span>{translate("Date From")}</span>
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.currentTarget.value }))} />
        </label>
        <label className="field">
          <span>{translate("Date To")}</span>
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.currentTarget.value }))} />
        </label>
        <div className="settings-filter-actions">
          <button type="submit" className="table-action-btn" disabled={loading}>{translate("Search")}</button>
          <button type="button" className="table-action-btn" disabled={loading} onClick={resetFilters}>{translate("Reset")}</button>
        </div>
      </form>

      <div className="finance-summary-grid">
        <div className="finance-summary-card">
          <span>{translate("Net Total")}</span>
          <strong>{formatMoney(summary.amountUzs)}</strong>
        </div>
        <div className="finance-summary-card">
          <span>{translate("Transactions")}</span>
          <strong>{Number.parseInt(String(summary.transactionCount || 0), 10) || 0}</strong>
        </div>
      </div>

      <p className="all-users-state" hidden={!message}>{translate(message)}</p>

      {loading ? <p className="all-users-state">{translate("Loading...")}</p> : (
        <div className="finance-report-grid">
          <ReportTable title="By Service" items={report?.byService || []} translate={translate} />
          <ReportTable title="By Specialist" items={report?.bySpecialist || []} translate={translate} />
          <ReportTable title="By Department" items={report?.byDepartment || []} translate={translate} />
          <ReportTable title="By Client" items={report?.byClient || []} translate={translate} />
          <ReportTable title="By Cashier" items={report?.byCashier || []} translate={translate} />
        </div>
      )}
    </section>
  );
}

export default FinanceReportsPanel;
