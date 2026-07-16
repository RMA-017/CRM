import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, readApiResponseData } from "../../../lib/api.js";
import { useI18n } from "../../../i18n/I18nProvider.jsx";

const STATUS_LABELS = Object.freeze({
  ok: "OK",
  warning: "Предупреждение",
  error: "Ошибка"
});

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return value.toLocaleString("ru-RU");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, entryValue]) => `${key}: ${typeof entryValue === "number" ? entryValue.toLocaleString("ru-RU") : String(entryValue ?? "-")}`)
      .join(", ");
  }
  return String(value);
}

function getStatusClassName(status) {
  const normalized = String(status || "ok").toLowerCase();
  if (normalized === "error") return "is-error";
  if (normalized === "warning") return "is-warning";
  return "is-ok";
}

function FinanceAuditPanel({ onClose }) {
  const { translate } = useI18n();
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadAudit = useCallback(async () => {
    try {
      setLoading(true);
      setMessage("");
      const response = await apiFetch("/api/finance/audit?limit=100");
      const data = await readApiResponseData(response);
      if (!response.ok) {
        setAudit(null);
        setMessage(data?.message || "Failed to load finance audit.");
        return;
      }
      setAudit(data);
    } catch {
      setAudit(null);
      setMessage("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const summary = audit?.summary || { status: "ok", issueCount: 0, errorCount: 0, warningCount: 0, checkCount: 0 };
  const summaryStatusClassName = getStatusClassName(summary.status);
  const summaryStatusLabel = loading ? "Проверка..." : (STATUS_LABELS[summary.status] || STATUS_LABELS.ok);
  const generatedAtLabel = audit?.generatedAt ? formatDateTime(audit.generatedAt) : "-";
  const allIssues = useMemo(() => (
    (audit?.checks || []).flatMap((check) => (
      (check.issues || []).map((issue) => ({
        ...issue,
        checkTitle: check.title,
        checkKey: check.key
      }))
    ))
  ), [audit]);

  return (
    <section id="financeAuditPanel" className="all-users-panel settings-panel ops-panel-shell finance-panel-shell finance-audit-panel">
      <div className={`all-users-head finance-audit-head ${summaryStatusClassName}`}>
        <div className="finance-audit-head-main">
          <div className="finance-audit-title-row">
            <span className={`finance-audit-mark ${summaryStatusClassName}`} aria-hidden="true" />
            <h3>Финансовый аудит</h3>
            <span className={`finance-audit-status-badge ${summaryStatusClassName}`}>{summaryStatusLabel}</span>
          </div>
          <div className="finance-audit-meta-row">
            <span>Проверено</span>
            <strong>{generatedAtLabel}</strong>
          </div>
        </div>
        <div className="all-users-head-actions finance-audit-head-actions">
          <button
            type="button"
            className="table-action-btn finance-head-icon-btn"
            onClick={loadAudit}
            disabled={loading}
            title="Проверить"
            aria-label="Проверить"
          >
            {loading ? "..." : <span className="finance-head-icon finance-head-icon-refresh" aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="all-users-close"
            onClick={onClose}
            aria-label={translate("Close finance reports panel")}
          >
            x
          </button>
        </div>
      </div>

      <div className="finance-ticket-summary finance-ticket-total finance-audit-summary">
        <div className={`finance-total-cell ${summaryStatusClassName}`}>
          <span>Общий статус</span>
          <strong>{STATUS_LABELS[summary.status] || STATUS_LABELS.ok}</strong>
        </div>
        <div className="finance-total-cell">
          <span>Проверки</span>
          <strong>{summary.checkCount || 0}</strong>
        </div>
        <div className="finance-total-cell">
          <span>Ошибки</span>
          <strong>{summary.errorCount || 0}</strong>
        </div>
        <div className="finance-total-cell">
          <span>Предупреждения</span>
          <strong>{summary.warningCount || 0}</strong>
        </div>
      </div>

      {message ? <p className="all-users-state">{message}</p> : null}

      <div className="finance-audit-checks">
        {(audit?.checks || []).map((check) => (
          <article key={check.key} className={`finance-audit-check ${getStatusClassName(check.status)}`}>
            <div>
              <h4>{check.title}</h4>
              <p>{check.checkedCount} проверено</p>
            </div>
            <strong>{check.issueCount}</strong>
          </article>
        ))}
      </div>

      <div className="all-users-table-scroll">
        <table className="all-users-table finance-audit-table" aria-label="Finance audit issues">
          <thead>
            <tr>
              <th>Тип</th>
              <th>Уровень</th>
              <th>Объект</th>
              <th>Ошибка</th>
              <th>Ожидалось</th>
              <th>Факт</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="all-users-state">Загрузка...</td>
              </tr>
            ) : allIssues.length === 0 ? (
              <tr>
                <td colSpan={6} className="all-users-state">Ошибок не найдено.</td>
              </tr>
            ) : allIssues.map((issue, index) => (
              <tr key={`${issue.checkKey}-${issue.objectType}-${issue.objectId}-${index}`}>
                <td>{issue.checkTitle || issue.type}</td>
                <td>
                  <span className={`finance-audit-status ${getStatusClassName(issue.severity)}`}>
                    {STATUS_LABELS[issue.severity] || issue.severity}
                  </span>
                </td>
                <td>{issue.objectLabel || issue.objectId || "-"}</td>
                <td>{issue.message}</td>
                <td>{formatValue(issue.expected)}</td>
                <td>{formatValue(issue.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default FinanceAuditPanel;
