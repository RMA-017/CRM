import pool from "../../config/db.js";
import { normalizePositiveInteger } from "../../lib/number.js";

const MAX_ISSUES_PER_CHECK = 100;

function normalizeAmount(value) {
  const amount = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeCheckLimit(value) {
  const parsed = normalizePositiveInteger(value);
  if (!parsed) {
    return MAX_ISSUES_PER_CHECK;
  }
  return Math.min(Math.max(parsed, 1), 500);
}

function normalizeDateTime(value) {
  return value || null;
}

function createIssue({
  type,
  severity = "error",
  objectType,
  objectId,
  objectLabel,
  message,
  expected = null,
  actual = null,
  details = {}
}) {
  return {
    type,
    severity,
    objectType,
    objectId: objectId ? String(objectId) : "",
    objectLabel: String(objectLabel || "").trim(),
    message,
    expected,
    actual,
    details
  };
}

function createCheck({ key, title, issues, checkedCount = 0, hasMore = false }) {
  const normalizedIssues = Array.isArray(issues) ? issues : [];
  const errorCount = normalizedIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = normalizedIssues.filter((issue) => issue.severity === "warning").length;
  return {
    key,
    title,
    status: errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "ok",
    checkedCount,
    issueCount: normalizedIssues.length,
    errorCount,
    warningCount,
    hasMore,
    issues: normalizedIssues
  };
}

function createSummary(checks) {
  const sourceChecks = Array.isArray(checks) ? checks : [];
  const errorCount = sourceChecks.reduce((sum, check) => sum + (check.errorCount || 0), 0);
  const warningCount = sourceChecks.reduce((sum, check) => sum + (check.warningCount || 0), 0);
  const issueCount = sourceChecks.reduce((sum, check) => sum + (check.issueCount || 0), 0);
  return {
    status: errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "ok",
    checkCount: sourceChecks.length,
    issueCount,
    errorCount,
    warningCount
  };
}

async function auditTicketTotals({ organizationId, limit }) {
  const { rows } = await pool.query(
    `WITH ticket_rows AS (
       SELECT
         ft.id,
         ft.ticket_number,
         ft.amount_uzs,
         COALESCE(ft.subtotal_uzs, ft.amount_uzs, 0) AS stored_subtotal_uzs,
         COALESCE(ft.discount_uzs, 0) AS stored_discount_uzs,
         COALESCE(ft.total_uzs, ft.amount_uzs, 0) AS stored_total_uzs,
         COALESCE(item_totals.item_subtotal_uzs, COALESCE(ft.subtotal_uzs, ft.amount_uzs, 0)) AS expected_subtotal_uzs,
         COALESCE(item_totals.item_discount_uzs, COALESCE(ft.discount_uzs, 0)) AS expected_discount_uzs,
         COALESCE(item_totals.item_total_uzs, COALESCE(ft.total_uzs, ft.amount_uzs, 0)) AS expected_total_uzs,
         ft.status,
         ft.updated_at
        FROM finance_tickets ft
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(fti.price_uzs), 0) AS item_subtotal_uzs,
            COALESCE(SUM(fti.discount_uzs), 0) AS item_discount_uzs,
            COALESCE(SUM(fti.final_amount_uzs), 0) AS item_total_uzs
           FROM finance_ticket_items fti
          WHERE fti.organization_id = ft.organization_id
            AND fti.ticket_id = ft.id
        ) item_totals ON TRUE
       WHERE ft.organization_id = $1
         AND ft.status <> 'voided'
     ),
     mismatches AS (
       SELECT *
         FROM ticket_rows
        WHERE stored_subtotal_uzs <> expected_subtotal_uzs
           OR stored_discount_uzs <> expected_discount_uzs
           OR stored_total_uzs <> expected_total_uzs
           OR stored_total_uzs <> stored_subtotal_uzs - stored_discount_uzs
           OR stored_total_uzs < 0
           OR stored_discount_uzs < 0
     ),
     limited AS (
       SELECT *
         FROM mismatches
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT $2
     )
     SELECT
       (SELECT COUNT(*)::integer FROM ticket_rows) AS checked_count,
       (SELECT COUNT(*)::integer FROM mismatches) AS total_issues,
       limited.*
      FROM (SELECT 1) marker
      LEFT JOIN limited ON TRUE`,
    [organizationId, limit]
  );
  const firstRow = rows[0] || {};
  const issues = rows.filter((row) => row.id).map((row) => {
    const storedTotal = normalizeAmount(row.stored_total_uzs);
    const expectedTotal = normalizeAmount(row.expected_total_uzs);
    const formulaTotal = normalizeAmount(row.stored_subtotal_uzs) - normalizeAmount(row.stored_discount_uzs);
    const messages = [];
    if (normalizeAmount(row.stored_subtotal_uzs) !== normalizeAmount(row.expected_subtotal_uzs)) {
      messages.push("Цена услуг не совпадает с суммой строк талона.");
    }
    if (normalizeAmount(row.stored_discount_uzs) !== normalizeAmount(row.expected_discount_uzs)) {
      messages.push("Скидка не совпадает с суммой скидок строк талона.");
    }
    if (storedTotal !== expectedTotal || storedTotal !== formulaTotal) {
      messages.push("К оплате не совпадает с формулой талона.");
    }
    if (storedTotal < 0 || normalizeAmount(row.stored_discount_uzs) < 0) {
      messages.push("В талоне есть отрицательная сумма.");
    }
    return createIssue({
      type: "ticket_totals",
      objectType: "ticket",
      objectId: row.id,
      objectLabel: row.ticket_number ? `#${row.ticket_number}` : `ID ${row.id}`,
      message: messages.join(" ") || "Суммы талона не совпадают.",
      expected: {
        subtotalUzs: normalizeAmount(row.expected_subtotal_uzs),
        discountUzs: normalizeAmount(row.expected_discount_uzs),
        totalUzs: expectedTotal
      },
      actual: {
        subtotalUzs: normalizeAmount(row.stored_subtotal_uzs),
        discountUzs: normalizeAmount(row.stored_discount_uzs),
        totalUzs: storedTotal
      },
      details: {
        status: row.status,
        updatedAt: normalizeDateTime(row.updated_at)
      }
    });
  });
  return createCheck({
    key: "ticket_totals",
    title: "Талоны: суммы",
    checkedCount: Number.parseInt(String(firstRow.checked_count || "0"), 10) || 0,
    hasMore: (Number.parseInt(String(firstRow.total_issues || "0"), 10) || 0) > rows.length,
    issues
  });
}

async function auditTicketPayments({ organizationId, limit }) {
  const { rows } = await pool.query(
    `WITH ticket_rows AS (
       SELECT
         ft.id,
         ft.ticket_number,
         COALESCE(ft.total_uzs, ft.amount_uzs, 0) AS total_uzs,
         ft.status,
         ft.updated_at,
         COALESCE(payment_totals.paid_uzs, 0) AS paid_uzs
        FROM finance_tickets ft
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(CASE
                   WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
                   WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
                   ELSE 0
                 END), 0) AS paid_uzs
            FROM finance_transactions t
           WHERE t.organization_id = ft.organization_id
             AND t.ticket_id = ft.id
             AND t.status = 'posted'
             AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
        ) payment_totals ON TRUE
       WHERE ft.organization_id = $1
         AND ft.status <> 'voided'
     ),
     mismatches AS (
       SELECT *
         FROM ticket_rows
        WHERE paid_uzs < 0
           OR paid_uzs > total_uzs
           OR (status = 'paid' AND paid_uzs <> total_uzs)
           OR (status = 'unpaid' AND (paid_uzs <= 0 OR paid_uzs >= total_uzs))
           OR (status = 'issued' AND paid_uzs <> 0)
     ),
     limited AS (
       SELECT *
         FROM mismatches
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT $2
     )
     SELECT
       (SELECT COUNT(*)::integer FROM ticket_rows) AS checked_count,
       (SELECT COUNT(*)::integer FROM mismatches) AS total_issues,
       limited.*
      FROM (SELECT 1) marker
      LEFT JOIN limited ON TRUE`,
    [organizationId, limit]
  );
  const firstRow = rows[0] || {};
  const issues = rows.filter((row) => row.id).map((row) => {
    const total = normalizeAmount(row.total_uzs);
    const paid = normalizeAmount(row.paid_uzs);
    const remaining = total - paid;
    const messages = [];
    if (paid < 0) messages.push("Оплачено ушло в минус.");
    if (paid > total) messages.push("Оплачено больше суммы к оплате.");
    if (row.status === "paid" && paid !== total) messages.push("Статус оплачен, но сумма оплаты не равна итогу.");
    if (row.status === "unpaid" && (paid <= 0 || paid >= total)) messages.push("Статус частичной оплаты не совпадает с суммой.");
    if (row.status === "issued" && paid !== 0) messages.push("Статус выдан, но по талону есть posted оплата.");
    return createIssue({
      type: "ticket_payments",
      objectType: "ticket",
      objectId: row.id,
      objectLabel: row.ticket_number ? `#${row.ticket_number}` : `ID ${row.id}`,
      message: messages.join(" ") || "Оплата талона не совпадает со статусом.",
      expected: {
        totalUzs: total,
        paidRange: row.status === "paid" ? "paid = total" : row.status === "issued" ? "paid = 0" : "0 < paid < total"
      },
      actual: {
        totalUzs: total,
        paidUzs: paid,
        remainingUzs: remaining,
        status: row.status
      },
      details: {
        updatedAt: normalizeDateTime(row.updated_at)
      }
    });
  });
  return createCheck({
    key: "ticket_payments",
    title: "Талоны: оплаты",
    checkedCount: Number.parseInt(String(firstRow.checked_count || "0"), 10) || 0,
    hasMore: (Number.parseInt(String(firstRow.total_issues || "0"), 10) || 0) > rows.length,
    issues
  });
}

async function auditClientBalances({ organizationId, limit }) {
  const { rows } = await pool.query(
    `WITH client_balances AS (
       SELECT
         c.id AS client_id,
         CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
         COALESCE(debt.debt_uzs, 0) AS debt_uzs,
         COALESCE(deposit.deposit_uzs, 0) AS deposit_uzs
        FROM clients c
        LEFT JOIN (
          SELECT ft.client_id,
                 SUM(GREATEST(COALESCE(ft.total_uzs, ft.amount_uzs, 0) - COALESCE(payment_totals.paid_uzs, 0), 0)) AS debt_uzs
            FROM finance_tickets ft
            LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(CASE
                       WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
                       WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
                       ELSE 0
                     END), 0) AS paid_uzs
                FROM finance_transactions t
               WHERE t.organization_id = ft.organization_id
                 AND t.ticket_id = ft.id
                 AND t.status = 'posted'
                 AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
            ) payment_totals ON TRUE
           WHERE ft.organization_id = $1
             AND ft.status IN ('issued', 'unpaid')
           GROUP BY ft.client_id
        ) debt ON debt.client_id = c.id
        LEFT JOIN (
          SELECT client_id,
                 SUM(CASE
                   WHEN transaction_type = 'deposit_in' AND direction = 'in' THEN amount_uzs
                   WHEN transaction_type = 'deposit_out' AND direction = 'out' THEN -amount_uzs
                   WHEN transaction_type = 'deposit_ticket_payment' AND direction = 'transfer' THEN -amount_uzs
                   WHEN transaction_type = 'deposit_ticket_refund' AND direction = 'transfer' THEN amount_uzs
                   ELSE 0
                 END) AS deposit_uzs
            FROM finance_transactions
           WHERE organization_id = $1
             AND status = 'posted'
             AND transaction_type IN ('deposit_in', 'deposit_out', 'deposit_ticket_payment', 'deposit_ticket_refund')
           GROUP BY client_id
        ) deposit ON deposit.client_id = c.id
       WHERE c.organization_id = $1
     ),
     mismatches AS (
       SELECT *
         FROM client_balances
        WHERE debt_uzs < 0
           OR deposit_uzs < 0
     ),
     limited AS (
       SELECT *
         FROM mismatches
        ORDER BY ABS(debt_uzs) DESC, ABS(deposit_uzs) DESC, client_id DESC
        LIMIT $2
     )
     SELECT
       (SELECT COUNT(*)::integer FROM client_balances) AS checked_count,
       (SELECT COUNT(*)::integer FROM mismatches) AS total_issues,
       limited.*
      FROM (SELECT 1) marker
      LEFT JOIN limited ON TRUE`,
    [organizationId, limit]
  );
  const firstRow = rows[0] || {};
  const issues = rows.filter((row) => row.client_id).map((row) => {
    const debt = normalizeAmount(row.debt_uzs);
    const deposit = normalizeAmount(row.deposit_uzs);
    const messages = [];
    if (debt < 0) messages.push("Долг клиента ушел в минус.");
    if (deposit < 0) messages.push("Депозит клиента ушел в минус.");
    return createIssue({
      type: "client_balances",
      objectType: "client",
      objectId: row.client_id,
      objectLabel: row.client_name || `ID ${row.client_id}`,
      message: messages.join(" ") || "Баланс клиента требует проверки.",
      expected: {
        debtUzs: ">= 0",
        depositUzs: ">= 0"
      },
      actual: {
        debtUzs: debt,
        depositUzs: deposit
      }
    });
  });
  return createCheck({
    key: "client_balances",
    title: "Балансы клиентов",
    checkedCount: Number.parseInt(String(firstRow.checked_count || "0"), 10) || 0,
    hasMore: (Number.parseInt(String(firstRow.total_issues || "0"), 10) || 0) > rows.length,
    issues
  });
}

export async function getFinanceAudit({ organizationId, options = {} }) {
  const normalizedOrganizationId = normalizePositiveInteger(organizationId);
  if (!normalizedOrganizationId) {
    return {
      generatedAt: new Date().toISOString(),
      summary: createSummary([]),
      checks: []
    };
  }
  const limit = normalizeCheckLimit(options.limit);
  const checks = await Promise.all([
    auditTicketTotals({ organizationId: normalizedOrganizationId, limit }),
    auditTicketPayments({ organizationId: normalizedOrganizationId, limit }),
    auditClientBalances({ organizationId: normalizedOrganizationId, limit })
  ]);
  return {
    generatedAt: new Date().toISOString(),
    summary: createSummary(checks),
    checks
  };
}
