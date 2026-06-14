import pool from "../../config/db.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { createMigrationRequiredError } from "../../lib/schema-guard.js";
import { getAppointmentHistoryLockDaysByOrganization } from "../appointments/appointment-settings.service.js";
import { updateAppointmentSchedulesByIds } from "../appointments/services/appointment-schedules.service.js";

const BOARD_LIMIT = 80;
const FINANCE_BATCH_PAYMENT_SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "23502", "23514"]);

function normalizeAmount(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parseIntegerAmount(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isFinanceBatchPaymentSchemaError(error) {
  const code = String(error?.code || "");
  if (!FINANCE_BATCH_PAYMENT_SCHEMA_ERROR_CODES.has(code)) {
    return false;
  }
  const message = String(error?.message || "").toLowerCase();
  return [
    "finance_payment_groups",
    "payment_group_id",
    "payment_method_id",
    "finance_ticket_payments",
    "finance_transactions",
    "chk_finance_transactions_type",
    "finance_transactions_transaction_type_check",
    "chk_finance_transactions_direction",
    "finance_transactions_direction_check"
  ].some((token) => message.includes(token));
}

function normalizeOptionalAmount(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatDateYmdInTashkent(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateYmdInTashkent(value);
  }
  const normalized = normalizeText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeGender(value) {
  const normalized = normalizeText(value, 24).toLowerCase();
  if (["male", "m", "man", "boy", "erkak", "муж", "мужской"].includes(normalized)) {
    return "male";
  }
  if (["female", "f", "woman", "girl", "ayol", "жен", "женский"].includes(normalized)) {
    return "female";
  }
  return "";
}

function getTodayYmdInTashkent() {
  return formatDateYmdInTashkent(new Date());
}

function addDaysToDateYmd(value, days) {
  const normalized = normalizeDate(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const nextYear = String(date.getUTCFullYear());
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function assertTicketDateIsNotFuture(ticketDate) {
  const normalizedTicketDate = normalizeDate(ticketDate);
  if (normalizedTicketDate && normalizedTicketDate > getTodayYmdInTashkent()) {
    const error = new Error("Future ticket dates are not allowed.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizePage(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizePageSize(value, fallback = 20) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 100);
}

function normalizeText(value, maxLength = 255) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeIdList(value, limit = 50) {
  const rawValues = Array.isArray(value) ? value : String(value ?? "").split(",");
  const ids = [];
  const seen = new Set();
  rawValues.forEach((item) => {
    const id = parsePositiveInteger(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids.slice(0, limit);
}

function normalizeDiscountType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "percent" ? "percent" : "amount";
}

function calculateDiscountUzs({ priceUzs, discountType, discountValue }) {
  const price = normalizeAmount(priceUzs, 0);
  const value = normalizeAmount(discountValue, 0);
  if (discountType === "percent") {
    return Math.min(price, Math.floor((price * Math.min(value, 100)) / 100));
  }
  return Math.min(price, value);
}

function mapTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    ticketDate: normalizeDate(row.ticket_date),
    source: row.source,
    appointmentScheduleId: row.appointment_schedule_id,
    clientId: row.client_id,
    clientName: row.client_name,
    specialistId: row.specialist_id,
    specialistName: row.specialist_name,
    serviceId: row.service_id,
    serviceName: row.service_name,
    amountUzs: row.total_uzs ?? row.amount_uzs,
    subtotalUzs: row.subtotal_uzs ?? row.amount_uzs,
    discountUzs: row.discount_uzs ?? 0,
    totalUzs: row.total_uzs ?? row.amount_uzs,
    paidAmountUzs: row.paid_amount_uzs ?? 0,
    paymentActivityCount: Number.parseInt(String(row.payment_activity_count ?? 0), 10) || 0,
    postedPaymentActivityCount: Number.parseInt(String(row.posted_payment_activity_count ?? 0), 10) || 0,
    remainingAmountUzs: Math.max(
      normalizeAmount(row.total_uzs ?? row.amount_uzs, 0) - normalizeAmount(row.paid_amount_uzs, 0),
      0
    ),
    status: row.status,
    note: row.note || "",
    appointmentDate: normalizeDate(row.appointment_date),
    startTime: row.start_time,
    paymentMethodId: row.payment_method_id,
    paymentMethodName: row.payment_method_name,
    paidAt: row.paid_at,
    itemCount: Number.parseInt(String(row.item_count ?? 1), 10) || 1,
    items: Array.isArray(row.items) ? row.items : [],
    positionLabel: row.position_label || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTicketHistory(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    action: row.action,
    fromStatus: row.from_status || "",
    toStatus: row.to_status || "",
    details: row.details || {},
    actorUserId: row.changed_by,
    actorName: row.actor_name || "",
    createdAt: row.created_at
  };
}

function mapCashSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    cashierUserId: row.cashier_user_id,
    cashierName: row.cashier_name || "",
    status: row.status,
    openingBalanceUzs: row.opening_balance_uzs,
    closingBalanceUzs: row.closing_balance_uzs,
    expectedBalanceUzs: row.expected_balance_uzs,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    note: row.note || "",
    closeNote: row.close_note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    cashSessionId: row.cash_session_id,
    transactionType: row.transaction_type,
    direction: row.direction,
    status: row.status,
    clientId: row.client_id,
    clientName: row.client_name || "",
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number,
    serviceName: row.service_name || "",
    ticketPaymentId: row.ticket_payment_id,
    paymentMethodId: row.payment_method_id,
    paymentMethodName: row.payment_method_name || "",
    amountUzs: row.amount_uzs,
    transactionAt: row.transaction_at,
    note: row.note || "",
    metadata: row.metadata || {},
    cashierUserId: row.cashier_user_id,
    cashierName: row.cashier_name || "",
    voidedAt: row.voided_at,
    voidedBy: row.voided_by,
    createdAt: row.created_at
  };
}

function mapDailyCashSummary(row) {
  return {
    totalInUzs: normalizeAmount(row.total_in_uzs, 0),
    totalOutUzs: normalizeAmount(row.total_out_uzs, 0),
    netUzs: normalizeAmount(row.total_in_uzs, 0) - normalizeAmount(row.total_out_uzs, 0),
    transactionCount: Number.parseInt(String(row.transaction_count || 0), 10) || 0
  };
}

function mapReportRow(row) {
  return {
    id: row.id,
    label: row.label || "",
    amountUzs: Number.parseInt(String(row.amount_uzs || 0), 10) || 0,
    count: Number.parseInt(String(row.item_count ?? row.transaction_count ?? 0), 10) || 0
  };
}

function mapFinanceReportDetail(row) {
  return {
    id: row.ticket_item_id ? `${row.id}:${row.ticket_item_id}` : row.id,
    transactionType: row.transaction_type || "",
    direction: row.direction || "",
    status: row.status || "",
    ticketStatus: row.ticket_status || "",
    ticketId: row.ticket_id,
    ticketNumber: row.ticket_number,
    ticketCreatedAt: row.ticket_created_at,
    ticketDate: normalizeDate(row.ticket_date),
    clientId: row.client_id,
    clientName: row.client_name || "",
    clientBirthday: normalizeDate(row.client_birthday),
    clientGender: row.client_gender || "",
    clientPhone: row.client_phone || "",
    ticketItemId: row.ticket_item_id,
    ticketItemLineNumber: Number.parseInt(String(row.ticket_item_line_number || 0), 10) || 0,
    serviceName: row.service_name || "",
    serviceAmountUzs: Number.parseInt(String(row.service_amount_uzs || 0), 10) || 0,
    specialistName: row.specialist_name || "",
    positionLabel: row.position_label || "",
    ticketSubtotalUzs: Number.parseInt(String(row.ticket_subtotal_uzs || 0), 10) || 0,
    ticketDiscountUzs: Number.parseInt(String(row.ticket_discount_uzs || row.service_discount_uzs || 0), 10) || 0,
    serviceDiscountUzs: Number.parseInt(String(row.service_discount_uzs || 0), 10) || 0,
    serviceFinalAmountUzs: Number.parseInt(String(row.service_final_amount_uzs || 0), 10) || 0,
    ticketTotalUzs: Number.parseInt(String(row.ticket_total_uzs || 0), 10) || 0,
    ticketPaidUzs: Number.parseInt(String(row.ticket_paid_uzs || 0), 10) || 0,
    ticketRemainingUzs: Math.max(
      (Number.parseInt(String(row.ticket_total_uzs || 0), 10) || 0)
        - (Number.parseInt(String(row.ticket_paid_uzs || 0), 10) || 0),
      0
    ),
    paymentMethodId: row.payment_method_id,
    paymentMethodName: row.payment_method_name || "",
    amountUzs: Number.parseInt(String(row.amount_uzs || 0), 10) || 0,
    signedAmountUzs: Number.parseInt(String(row.signed_amount_uzs || 0), 10) || 0,
    transactionAt: row.transaction_at,
    cashierUserId: row.cashier_user_id,
    cashierName: row.cashier_name || "",
    note: row.note || ""
  };
}

function normalizeBooleanFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function shouldUseLegacyReportFallback(error) {
  return Boolean(String(error?.code || ""));
}

async function runFinanceReportQuery(sql, params, fallbackRows = []) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (!shouldUseLegacyReportFallback(error)) {
      throw error;
    }
    return { rows: fallbackRows };
  }
}

function mapClientBalance(row) {
  if (!row) return null;
  const debtUzs = normalizeAmount(row.debt_uzs, 0);
  const depositUzs = parseIntegerAmount(row.deposit_uzs, 0);
  return {
    clientId: row.client_id,
    clientName: row.client_name || "",
    phone: row.phone_number || "",
    debtUzs,
    depositUzs,
    balanceUzs: depositUzs - debtUzs
  };
}

function mapClientDebtTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    ticketDate: normalizeDate(row.ticket_date),
    clientId: row.client_id,
    clientName: row.client_name || "",
    serviceName: row.service_name || "",
    totalUzs: row.total_uzs ?? row.amount_uzs,
    paidAmountUzs: row.paid_amount_uzs ?? 0,
    remainingAmountUzs: Math.max(
      normalizeAmount(row.total_uzs ?? row.amount_uzs, 0) - normalizeAmount(row.paid_amount_uzs, 0),
      0
    ),
    status: row.status
  };
}

function getLedgerDepositChange(row) {
  if (row?.status !== "posted") return 0;
  const amountUzs = normalizeAmount(row.amount_uzs, 0);
  switch (row.transaction_type) {
    case "deposit_in":
    case "deposit_ticket_refund":
      return amountUzs;
    case "deposit_out":
    case "deposit_ticket_payment":
      return -amountUzs;
    default:
      return 0;
  }
}

function getTransactionReversalSpec(row) {
  const type = String(row?.transaction_type || "").trim();
  switch (type) {
    case "ticket_payment":
      return {
        transactionType: "refund",
        direction: "out",
        paymentMethodId: row?.payment_method_id || null
      };
    case "refund":
      return {
        transactionType: "ticket_payment",
        direction: "in",
        paymentMethodId: row?.payment_method_id || null
      };
    case "deposit_ticket_payment":
      return {
        transactionType: "deposit_ticket_refund",
        direction: "transfer",
        paymentMethodId: null
      };
    case "deposit_ticket_refund":
      return {
        transactionType: "deposit_ticket_payment",
        direction: "transfer",
        paymentMethodId: null
      };
    case "deposit_in":
      return {
        transactionType: "deposit_out",
        direction: "out",
        paymentMethodId: row?.payment_method_id || null
      };
    case "deposit_out":
      return {
        transactionType: "deposit_in",
        direction: "in",
        paymentMethodId: row?.payment_method_id || null
      };
    case "correction":
      return {
        transactionType: "correction",
        direction: row?.direction === "in" ? "out" : "in",
        paymentMethodId: row?.payment_method_id || null
      };
    default:
      return null;
  }
}

function hasTransactionReversal(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return Boolean(metadata.reversalTransactionId || metadata.reversal_transaction_id);
}

function mapClientLedgerTransaction(row, depositBalanceAfterUzs) {
  const transaction = mapTransaction(row);
  const amountUzs = normalizeAmount(row.amount_uzs, 0);
  const isPosted = row.status === "posted";
  return {
    ...transaction,
    cashInUzs: isPosted && row.direction === "in" ? amountUzs : 0,
    cashOutUzs: isPosted && row.direction === "out" ? amountUzs : 0,
    depositChangeUzs: getLedgerDepositChange(row),
    depositBalanceAfterUzs
  };
}

function mapAppointment(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    specialistId: row.specialist_id,
    specialistName: row.specialist_name,
    serviceId: row.service_id,
    serviceName: row.service_name,
    servicePriceUzs: row.service_price_uzs,
    status: row.status,
    appointmentDate: normalizeDate(row.appointment_date),
    startTime: row.start_time,
    endTime: row.end_time
  };
}

function mapClientOption(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone_number || ""
  };
}

function mapServiceOption(row) {
  return {
    id: row.id,
    name: row.name || "",
    priceUzs: row.price_uzs ?? 0,
    positionId: row.position_id,
    positionLabel: row.position_label || ""
  };
}

function mapPositionOption(row) {
  return {
    id: row.id,
    label: row.label || ""
  };
}

function mapSpecialistOption(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    positionId: row.position_id,
    positionLabel: row.position_label || ""
  };
}

function getBoardDates({ dateFrom, dateTo }) {
  const normalizedFrom = normalizeText(dateFrom, 10);
  const normalizedTo = normalizeText(dateTo, 10);
  return {
    from: /^\d{4}-\d{2}-\d{2}$/.test(normalizedFrom) ? normalizedFrom : null,
    to: /^\d{4}-\d{2}-\d{2}$/.test(normalizedTo) ? normalizedTo : null
  };
}

async function getCashierAppointmentById(db, { organizationId, id, forUpdate = false }) {
  const lockClause = forUpdate ? "FOR UPDATE OF a" : "";
  const result = await db.query(
    `SELECT a.id,
            a.organization_id,
            a.client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            a.specialist_id,
            COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS specialist_name,
            a.service_id,
            a.service_name,
            a.service_price_uzs,
            a.status,
            a.appointment_date,
            a.start_time,
            a.end_time,
            a.duration_minutes,
            a.note,
            ft.id AS finance_ticket_id
       FROM appointment_schedules a
       JOIN clients c ON c.organization_id = a.organization_id AND c.id = a.client_id
       JOIN users u ON u.organization_id = a.organization_id AND u.id = a.specialist_id
       LEFT JOIN finance_tickets ft
         ON ft.organization_id = a.organization_id
        AND ft.appointment_schedule_id = a.id
        AND ft.status <> 'voided'
      WHERE a.organization_id = $1
        AND a.id = $2
      LIMIT 1
      ${lockClause}`,
    [organizationId, id]
  );
  return result.rows[0] || null;
}

async function insertHistory(db, { organizationId, ticketId, action, fromStatus, toStatus, details, actorUserId }) {
  await db.query(
    `INSERT INTO finance_ticket_history (
       organization_id, ticket_id, action, from_status, to_status, details, changed_by
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      organizationId,
      ticketId,
      action,
      fromStatus || null,
      toStatus || null,
      JSON.stringify(details || {}),
      actorUserId || null
    ]
  );
}

async function getTicketPaidAmount(db, { organizationId, ticketId }) {
  const result = await db.query(
    `SELECT COALESCE(SUM(CASE
              WHEN transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN amount_uzs
              WHEN transaction_type IN ('refund', 'deposit_ticket_refund') THEN -amount_uzs
              ELSE 0
            END), 0) AS paid_amount_uzs
       FROM finance_transactions
      WHERE organization_id = $1
        AND ticket_id = $2
        AND status = 'posted'
        AND transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')`,
    [organizationId, ticketId]
  );
  return normalizeAmount(result.rows[0]?.paid_amount_uzs, 0);
}

async function getTicketPostedPaymentActivityCount(db, { organizationId, ticketId }) {
  const result = await db.query(
    `SELECT COUNT(*) AS payment_activity_count
       FROM finance_transactions
      WHERE organization_id = $1
        AND ticket_id = $2
        AND status = 'posted'
        AND transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')`,
    [organizationId, ticketId]
  );
  return Number.parseInt(String(result.rows[0]?.payment_activity_count ?? 0), 10) || 0;
}

async function getOpenCashSession(db, { organizationId, cashierUserId, forUpdate = false }) {
  const result = await db.query(
    `SELECT s.*,
            COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), '') AS cashier_name
       FROM finance_cash_sessions s
       JOIN users u ON u.id = s.cashier_user_id
      WHERE s.organization_id = $1
        AND s.cashier_user_id = $2
        AND s.status = 'open'
      ORDER BY s.opened_at DESC, s.id DESC
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [organizationId, cashierUserId]
  );
  return result.rows[0] || null;
}

async function lockClientFinanceBalance(db, { organizationId, clientId }) {
  const normalizedClientId = parsePositiveInteger(clientId);
  if (!normalizedClientId) return;
  await db.query(
    "SELECT pg_advisory_xact_lock($1::int, $2::int)",
    [organizationId, normalizedClientId]
  );
}

async function getCashSessionExpectedBalance(db, { organizationId, cashSessionId }) {
  const result = await db.query(
    `SELECT COALESCE(s.opening_balance_uzs, 0)
            + COALESCE(SUM(
                CASE
                  WHEN t.status = 'posted' AND t.direction = 'in' THEN t.amount_uzs
                  WHEN t.status = 'posted' AND t.direction = 'out' THEN -t.amount_uzs
                  ELSE 0
                END
              ), 0) AS expected_balance_uzs
       FROM finance_cash_sessions s
       LEFT JOIN finance_transactions t
         ON t.organization_id = s.organization_id
        AND t.cash_session_id = s.id
      WHERE s.organization_id = $1
        AND s.id = $2
      GROUP BY s.id`,
    [organizationId, cashSessionId]
  );
  return normalizeAmount(result.rows[0]?.expected_balance_uzs, 0);
}

async function insertFinanceTransaction(db, {
  organizationId,
  cashSessionId,
  paymentGroupId = null,
  transactionType,
  direction,
  clientId,
  ticketId,
  ticketPaymentId,
  paymentMethodId,
  amountUzs,
  note,
  metadata,
  actorUserId
}) {
  const result = await db.query(
    `INSERT INTO finance_transactions (
       organization_id, cash_session_id, payment_group_id, transaction_type, direction, client_id,
       ticket_id, ticket_payment_id, payment_method_id, amount_uzs, note, metadata, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
     RETURNING *`,
    [
      organizationId,
      cashSessionId,
      paymentGroupId || null,
      transactionType,
      direction,
      clientId || null,
      ticketId || null,
      ticketPaymentId || null,
      paymentMethodId,
      amountUzs,
      note || null,
      JSON.stringify(metadata || {}),
      actorUserId || null
    ]
  );
  return result.rows[0];
}

async function getNextTicketNumber(db, organizationId) {
  await db.query(
    `INSERT INTO finance_ticket_counters (organization_id, next_ticket_number)
     VALUES ($1, 10000)
     ON CONFLICT (organization_id) DO NOTHING`,
    [organizationId]
  );
  const result = await db.query(
    `UPDATE finance_ticket_counters
        SET next_ticket_number = next_ticket_number + 1
      WHERE organization_id = $1
        AND next_ticket_number <= 99999
      RETURNING next_ticket_number - 1 AS ticket_number`,
    [organizationId]
  );
  const ticketNumber = Number.parseInt(String(result.rows[0]?.ticket_number || ""), 10);
  if (!ticketNumber) {
    const error = new Error("Ticket number limit reached.");
    error.statusCode = 409;
    throw error;
  }
  return ticketNumber;
}

async function getNextTicketNumberPreview(organizationId) {
  const result = await pool.query(
    `SELECT GREATEST(
              COALESCE((
                SELECT next_ticket_number
                  FROM finance_ticket_counters
                 WHERE organization_id = $1
              ), 10000),
              COALESCE((
                SELECT MAX(ticket_number) + 1
                  FROM finance_tickets
                 WHERE organization_id = $1
              ), 10000)
            ) AS ticket_number`,
    [organizationId]
  );
  const ticketNumber = Number.parseInt(String(result.rows[0]?.ticket_number || ""), 10);
  return ticketNumber > 0 && ticketNumber <= 99999 ? ticketNumber : null;
}

export async function getCashierBoard({ organizationId, dateFrom, dateTo, query }) {
  const dates = getBoardDates({ dateFrom, dateTo });
  const todayYmd = getTodayYmdInTashkent();
  const historyLockDays = await getAppointmentHistoryLockDaysByOrganization(organizationId);
  const historyLockCutoffDate = addDaysToDateYmd(todayYmd, -historyLockDays) || todayYmd;
  const boardDateFrom = dates.from || dates.to || todayYmd;
  const boardDateTo = dates.to || boardDateFrom;
  const normalizedQuery = normalizeText(query, 96);
  const normalizedQueryLike = `%${normalizedQuery.toLowerCase()}%`;
  const appointmentParams = [organizationId, boardDateFrom, boardDateTo];
  const appointmentFilters = [
    "a.organization_id = $1",
    "a.status IN ('pending', 'confirmed', 'cancelled', 'no-show')",
    "ft.id IS NULL",
    "a.appointment_date >= $2::date",
    "a.appointment_date <= $3::date"
  ];
  if (normalizedQuery) {
    appointmentParams.push(normalizedQueryLike);
    const likeParam = appointmentParams.length;
    appointmentParams.push(normalizedQuery);
    const exactParam = appointmentParams.length;
    appointmentFilters.push(`(
      LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $${likeParam}
      OR LOWER(COALESCE(a.service_name, '')) LIKE $${likeParam}
      OR LOWER(COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), '')) LIKE $${likeParam}
      OR a.id::text = $${exactParam}
      OR a.client_id::text = $${exactParam}
    )`);
  }
  appointmentParams.push(BOARD_LIMIT);

  const overdueAppointmentParams = [organizationId, historyLockCutoffDate, todayYmd];
  const overdueAppointmentFilters = [
    "a.organization_id = $1",
    "a.status = 'confirmed'",
    "ft.id IS NULL",
    "a.appointment_date >= $2::date",
    "a.appointment_date < $3::date"
  ];
  if (normalizedQuery) {
    overdueAppointmentParams.push(normalizedQueryLike);
    const likeParam = overdueAppointmentParams.length;
    overdueAppointmentParams.push(normalizedQuery);
    const exactParam = overdueAppointmentParams.length;
    overdueAppointmentFilters.push(`(
      LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $${likeParam}
      OR LOWER(COALESCE(a.service_name, '')) LIKE $${likeParam}
      OR LOWER(COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), '')) LIKE $${likeParam}
      OR a.id::text = $${exactParam}
      OR a.client_id::text = $${exactParam}
    )`);
  }
  overdueAppointmentParams.push(BOARD_LIMIT);

  const ticketParams = [organizationId];
  const ticketFilters = [
    "ft.organization_id = $1",
    "ft.status IN ('issued', 'unpaid')"
  ];
  if (normalizedQuery) {
    ticketParams.push(normalizedQueryLike);
    const likeParam = ticketParams.length;
    ticketParams.push(normalizedQuery);
    const exactParam = ticketParams.length;
    ticketFilters.push(`(
      LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $${likeParam}
      OR LOWER(COALESCE(ft.service_name, '')) LIKE $${likeParam}
      OR LOWER(COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), '')) LIKE $${likeParam}
      OR ft.ticket_number::text = $${exactParam}
      OR ft.id::text = $${exactParam}
      OR ft.client_id::text = $${exactParam}
      OR ft.appointment_schedule_id::text = $${exactParam}
    )`);
  }
  ticketParams.push(BOARD_LIMIT);
  const [
    appointmentsResult,
    overdueAppointmentsResult,
    ticketsResult,
    paymentMethodsResult,
    servicesResult,
    specialistsResult,
    nextTicketNumber
  ] = await Promise.all([
    pool.query(
      `SELECT a.id,
              a.client_id,
              CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
              a.specialist_id,
              COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS specialist_name,
              a.service_id,
              a.service_name,
              a.service_price_uzs,
              a.status,
              a.appointment_date,
              a.start_time,
              a.end_time
         FROM appointment_schedules a
         JOIN clients c ON c.organization_id = a.organization_id AND c.id = a.client_id
         JOIN users u ON u.organization_id = a.organization_id AND u.id = a.specialist_id
         LEFT JOIN finance_tickets ft
           ON ft.organization_id = a.organization_id
          AND ft.appointment_schedule_id = a.id
          AND ft.status <> 'voided'
        WHERE ${appointmentFilters.join(" AND ")}
        ORDER BY a.appointment_date ASC, a.start_time ASC, a.id ASC
        LIMIT $${appointmentParams.length}`,
      appointmentParams
    ),
    pool.query(
      `SELECT a.id,
              a.client_id,
              CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
              a.specialist_id,
              COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS specialist_name,
              a.service_id,
              a.service_name,
              a.service_price_uzs,
              a.status,
              a.appointment_date,
              a.start_time,
              a.end_time
         FROM appointment_schedules a
         JOIN clients c ON c.organization_id = a.organization_id AND c.id = a.client_id
         JOIN users u ON u.organization_id = a.organization_id AND u.id = a.specialist_id
         LEFT JOIN finance_tickets ft
           ON ft.organization_id = a.organization_id
          AND ft.appointment_schedule_id = a.id
          AND ft.status <> 'voided'
        WHERE ${overdueAppointmentFilters.join(" AND ")}
        ORDER BY a.appointment_date DESC, a.start_time ASC, a.id ASC
        LIMIT $${overdueAppointmentParams.length}`,
      overdueAppointmentParams
    ),
    pool.query(
      `SELECT ft.id,
              ft.ticket_number,
              ft.ticket_date,
              ft.source,
              ft.appointment_schedule_id,
              ft.client_id,
              CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
              ft.specialist_id,
              COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS specialist_name,
              ft.service_id,
              ft.service_name,
              ft.amount_uzs,
              ft.subtotal_uzs,
              ft.discount_uzs,
              ft.total_uzs,
              ft.status,
              ft.note,
              a.appointment_date,
              a.start_time,
              fp.payment_method_id,
              fpm.name AS payment_method_name,
              fp.paid_at,
              COALESCE(fpaid.paid_amount_uzs, 0) AS paid_amount_uzs,
              COALESCE(fti.item_count, 1) AS item_count,
              COALESCE(fti.items, '[]'::json) AS items,
              ft.created_at,
              ft.updated_at
         FROM finance_tickets ft
         JOIN clients c ON c.organization_id = ft.organization_id AND c.id = ft.client_id
         LEFT JOIN users u ON u.organization_id = ft.organization_id AND u.id = ft.specialist_id
         LEFT JOIN appointment_schedules a ON a.organization_id = ft.organization_id AND a.id = ft.appointment_schedule_id
         LEFT JOIN LATERAL (
           SELECT payment_method_id, paid_at
             FROM finance_ticket_payments
            WHERE organization_id = ft.organization_id AND ticket_id = ft.id
            ORDER BY paid_at DESC, id DESC
            LIMIT 1
         ) fp ON TRUE
         LEFT JOIN finance_payment_methods fpm ON fpm.organization_id = ft.organization_id AND fpm.id = fp.payment_method_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(CASE
                    WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
                    WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
                    ELSE 0
                  END), 0) AS paid_amount_uzs
             FROM finance_transactions t
            WHERE t.organization_id = ft.organization_id
              AND t.ticket_id = ft.id
              AND t.status = 'posted'
              AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
         ) fpaid ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS item_count,
                  COALESCE(
                    json_agg(
                      json_build_object(
                        'id', fti_item.id,
                        'lineNumber', fti_item.line_number,
                        'specialistId', fti_item.specialist_id,
                        'specialistName', COALESCE(NULLIF(TRIM(iu.full_name), ''), NULLIF(TRIM(iu.username), ''), ''),
                        'positionLabel', ip.label,
                        'serviceId', fti_item.service_id,
                        'serviceName', COALESCE(NULLIF(TRIM(a.service_name), ''), fti_item.service_name),
                        'priceUzs', fti_item.price_uzs,
                        'discountType', fti_item.discount_type,
                        'discountValue', fti_item.discount_value,
                        'discountUzs', fti_item.discount_uzs,
                        'finalAmountUzs', fti_item.final_amount_uzs
                      )
                      ORDER BY fti_item.line_number ASC, fti_item.id ASC
                    ),
                    '[]'::json
                  ) AS items
             FROM finance_ticket_items fti_item
             LEFT JOIN users iu ON iu.organization_id = fti_item.organization_id AND iu.id = fti_item.specialist_id
             LEFT JOIN position_options ip ON ip.organization_id = iu.organization_id AND ip.id = iu.position_id
            WHERE fti_item.organization_id = ft.organization_id
              AND fti_item.ticket_id = ft.id
         ) fti ON TRUE
        WHERE ${ticketFilters.join(" AND ")}
        ORDER BY ft.updated_at DESC, ft.id DESC
        LIMIT $${ticketParams.length}`,
      ticketParams
    ),
    pool.query(
      `SELECT id, name
         FROM finance_payment_methods
        WHERE organization_id = $1
          AND is_active = TRUE
        ORDER BY sort_order ASC, name ASC, id ASC`,
      [organizationId]
    ),
    pool.query(
      `SELECT id, name, price_uzs
         FROM service_catalog
        WHERE organization_id = $1
          AND is_active = TRUE
        ORDER BY name ASC, id ASC`,
      [organizationId]
    ),
    pool.query(
      `SELECT u.id,
              COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS full_name,
              p.label AS position_label
         FROM users u
         JOIN organizations o ON o.id = u.organization_id
         JOIN role_options r
           ON r.organization_id = u.organization_id
          AND r.id = u.role_id
         LEFT JOIN position_options p
           ON p.organization_id = u.organization_id
          AND p.id = u.position_id
        WHERE u.organization_id = $1
          AND o.is_active = TRUE
          AND r.is_active = TRUE
          AND (
            LOWER(TRIM(r.label)) LIKE '%specialist%'
            OR LOWER(TRIM(r.label)) LIKE '%spetsialist%'
            OR LOWER(TRIM(r.label)) LIKE '%mutaxassis%'
            OR LOWER(TRIM(r.label)) LIKE '%специалист%'
            OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%specialist%'
            OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%spetsialist%'
            OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%mutaxassis%'
            OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%специалист%'
          )
       ORDER BY full_name ASC, u.id ASC`,
      [organizationId]
    ),
    getNextTicketNumberPreview(organizationId)
  ]);

  const appointments = appointmentsResult.rows.map(mapAppointment);
  const overdueAppointments = overdueAppointmentsResult.rows.map(mapAppointment);
  const tickets = ticketsResult.rows.map(mapTicket);
  return {
    pendingAppointments: appointments.filter((item) => item.status === "pending"),
    cancelledAppointments: appointments.filter((item) => item.status === "cancelled"),
    noShowAppointments: appointments.filter((item) => item.status === "no-show"),
    confirmedAppointments: appointments.filter((item) => item.status === "confirmed"),
    overdueConfirmedAppointments: overdueAppointments,
    issuedTickets: tickets.filter((item) => item.status === "issued" || item.status === "unpaid"),
    paidTickets: tickets.filter((item) => item.status === "paid"),
    unpaidTickets: tickets.filter((item) => item.status === "unpaid"),
    paymentMethods: paymentMethodsResult.rows.map((row) => ({
      id: row.id,
      name: row.name
    })),
    services: servicesResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      priceUzs: row.price_uzs
    })),
    specialists: specialistsResult.rows.map(mapSpecialistOption),
    nextTicketNumber
  };
}

export async function confirmCashierAppointment({ organizationId, id, actorUserId }) {
  const appointmentId = parsePositiveInteger(id);
  if (!appointmentId) {
    const error = new Error("Appointment not found.");
    error.statusCode = 404;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const appointment = await getCashierAppointmentById(db, {
      organizationId,
      id: appointmentId,
      forUpdate: true
    });
    if (!appointment) {
      const error = new Error("Appointment not found.");
      error.statusCode = 404;
      throw error;
    }
    if (appointment.finance_ticket_id) {
      const error = new Error("This appointment has a finance ticket. Cancel the ticket before changing the appointment.");
      error.statusCode = 409;
      throw error;
    }
    if (appointment.status === "confirmed") {
      await db.query("COMMIT");
      return mapAppointment(appointment);
    }
    if (appointment.status !== "pending") {
      const error = new Error("Only pending appointments can be confirmed.");
      error.statusCode = 400;
      throw error;
    }

    const appointmentDate = normalizeDate(appointment.appointment_date);
    if (appointmentDate && appointmentDate > getTodayYmdInTashkent()) {
      const error = new Error(`Future appointments cannot be confirmed. Requested date: ${appointmentDate}.`);
      error.statusCode = 400;
      throw error;
    }

    await updateAppointmentSchedulesByIds({
      db,
      organizationId,
      actorUserId,
      ids: [appointmentId],
      specialistId: appointment.specialist_id,
      clientId: appointment.client_id,
      appointmentDate,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
      durationMinutes: appointment.duration_minutes,
      serviceId: appointment.service_id,
      serviceName: appointment.service_name,
      servicePriceUzs: appointment.service_price_uzs,
      status: "confirmed",
      note: appointment.note || "",
      applyAppointmentDate: false
    });

    const updatedAppointment = await getCashierAppointmentById(db, {
      organizationId,
      id: appointmentId
    });
    await db.query("COMMIT");
    return mapAppointment(updatedAppointment);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export async function updateCashierAppointmentStatus({ organizationId, id, status, actorUserId }) {
  const appointmentId = parsePositiveInteger(id);
  const nextStatus = String(status || "").trim().toLowerCase().replace(/_/g, "-");
  if (!appointmentId) {
    const error = new Error("Appointment not found.");
    error.statusCode = 404;
    throw error;
  }
  if (!["pending", "confirmed", "cancelled", "no-show"].includes(nextStatus)) {
    const error = new Error("Invalid appointment status.");
    error.statusCode = 400;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const appointment = await getCashierAppointmentById(db, {
      organizationId,
      id: appointmentId,
      forUpdate: true
    });
    if (!appointment) {
      const error = new Error("Appointment not found.");
      error.statusCode = 404;
      throw error;
    }
    if (appointment.finance_ticket_id) {
      const error = new Error("This appointment has a finance ticket. Cancel the ticket before changing the appointment.");
      error.statusCode = 409;
      throw error;
    }
    if (appointment.status === nextStatus) {
      await db.query("COMMIT");
      return mapAppointment(appointment);
    }

    const appointmentDate = normalizeDate(appointment.appointment_date);
    if (nextStatus === "confirmed" && appointmentDate && appointmentDate > getTodayYmdInTashkent()) {
      const error = new Error(`Future appointments cannot be confirmed. Requested date: ${appointmentDate}.`);
      error.statusCode = 400;
      throw error;
    }

    await updateAppointmentSchedulesByIds({
      db,
      organizationId,
      actorUserId,
      ids: [appointmentId],
      specialistId: appointment.specialist_id,
      clientId: appointment.client_id,
      appointmentDate,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
      durationMinutes: appointment.duration_minutes,
      serviceId: appointment.service_id,
      serviceName: appointment.service_name,
      servicePriceUzs: appointment.service_price_uzs,
      status: nextStatus,
      note: appointment.note || "",
      applyAppointmentDate: false
    });

    const updatedAppointment = await getCashierAppointmentById(db, {
      organizationId,
      id: appointmentId
    });
    await db.query("COMMIT");
    return mapAppointment(updatedAppointment);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export async function searchCashierClients({ organizationId, query, limit = 20 }) {
  const normalizedQuery = normalizeText(query, 96);
  const normalizedLimit = Math.max(1, Math.min(Number.parseInt(String(limit || 20), 10) || 20, 50));
  if (!normalizedQuery || (!/^\d+$/.test(normalizedQuery) && normalizedQuery.length < 3)) {
    return [];
  }
  const normalizedPhoneDigits = normalizedQuery.replace(/\D/g, "");
  const result = await pool.query(
    `SELECT id,
            CONCAT_WS(' ', last_name, first_name, middle_name) AS full_name,
            phone_number
       FROM clients
      WHERE organization_id = $1
        AND (
          LOWER(CONCAT_WS(' ', last_name, first_name, middle_name)) LIKE $2
          OR phone_number LIKE $3
          OR ($4 <> '' AND regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g') LIKE $4)
          OR id::text = $5
        )
      ORDER BY last_name ASC, first_name ASC, id ASC
      LIMIT $6`,
    [
      organizationId,
      `%${normalizedQuery.toLowerCase()}%`,
      `${normalizedQuery}%`,
      normalizedPhoneDigits ? `%${normalizedPhoneDigits}%` : "",
      normalizedQuery,
      normalizedLimit
    ]
  );
  return result.rows.map(mapClientOption);
}

export async function getFinanceTicketFilterReferences({ organizationId }) {
  const [servicesResult, specialistsResult, positionsResult, cashiersResult] = await Promise.all([
    pool.query(
      `SELECT sc.id,
              sc.name,
              sc.price_uzs,
              sc.position_id,
              p.label AS position_label
         FROM service_catalog sc
         JOIN position_options p
           ON p.organization_id = sc.organization_id
          AND p.id = sc.position_id
        WHERE sc.organization_id = $1
          AND sc.is_active = TRUE
          AND p.is_active = TRUE
        ORDER BY p.sort_order ASC, p.label ASC, sc.name ASC, sc.id ASC`,
      [organizationId]
    ),
    pool.query(
      `SELECT u.id,
              COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS full_name,
              u.position_id,
              p.label AS position_label
         FROM users u
         JOIN organizations o ON o.id = u.organization_id
         JOIN role_options r
           ON r.organization_id = u.organization_id
          AND r.id = u.role_id
         LEFT JOIN position_options p
           ON p.organization_id = u.organization_id
          AND p.id = u.position_id
        WHERE u.organization_id = $1
          AND o.is_active = TRUE
          AND r.is_active = TRUE
          AND (
            LOWER(TRIM(r.label)) LIKE '%specialist%'
            OR LOWER(TRIM(r.label)) LIKE '%spetsialist%'
            OR LOWER(TRIM(r.label)) LIKE '%mutaxassis%'
            OR LOWER(TRIM(r.label)) LIKE '%специалист%'
            OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%specialist%'
            OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%spetsialist%'
            OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%mutaxassis%'
            OR LOWER(TRIM(COALESCE(p.label, ''))) LIKE '%специалист%'
          )
        ORDER BY full_name ASC, u.id ASC`,
      [organizationId]
    ),
    pool.query(
      `SELECT id, label
         FROM position_options
        WHERE organization_id = $1
          AND is_active = TRUE
        ORDER BY sort_order ASC, label ASC, id ASC`,
      [organizationId]
    ),
    pool.query(
      `SELECT DISTINCT
              u.id,
              COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS full_name
         FROM users u
         LEFT JOIN role_options r
           ON r.organization_id = u.organization_id
          AND r.id = u.role_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id AND p.is_active = TRUE
        WHERE u.organization_id = $1
          AND (
            u.is_platform_admin = TRUE
            OR EXISTS (
              SELECT 1
                FROM finance_cash_sessions fcs
               WHERE fcs.organization_id = u.organization_id
                 AND fcs.cashier_user_id = u.id
            )
            OR (
              r.is_active = TRUE
              AND (
                r.is_admin = TRUE
                OR p.code LIKE 'finance.%'
              )
            )
          )
        ORDER BY full_name ASC, u.id ASC`,
      [organizationId]
    )
  ]);

  return {
    services: servicesResult.rows.map(mapServiceOption),
    specialists: specialistsResult.rows.map(mapSpecialistOption),
    positions: positionsResult.rows.map(mapPositionOption),
    cashiers: cashiersResult.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name
    }))
  };
}

export async function getFinanceActivePaymentMethods({ organizationId }) {
  const result = await pool.query(
    `SELECT id, name
       FROM finance_payment_methods
      WHERE organization_id = $1
        AND is_active = TRUE
      ORDER BY sort_order ASC, name ASC, id ASC`,
    [organizationId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name
  }));
}

function buildTicketsListWhere({ organizationId, filters = {} }) {
  const params = [organizationId];
  const where = ["ft.organization_id = $1"];
  const ticketNumber = normalizeText(filters.ticketNumber ?? filters.ticket_number, 5);
  const ticketCreatedFrom = normalizeDate(filters.ticketCreatedFrom ?? filters.ticket_created_from);
  const ticketCreatedTo = normalizeDate(filters.ticketCreatedTo ?? filters.ticket_created_to);
  const dateFrom = normalizeDate(filters.dateFrom ?? filters.date_from);
  const dateTo = normalizeDate(filters.dateTo ?? filters.date_to);
  const client = normalizeText(filters.client, 96).toLowerCase();
  const specialist = normalizeText(filters.specialist, 96).toLowerCase();
  const position = normalizeText(filters.position, 96).toLowerCase();
  const service = normalizeText(filters.service, 128).toLowerCase();
  const statuses = Array.from(new Set(
    normalizeText(filters.status, 64)
      .split(",")
      .map((item) => item.trim())
      .filter((item) => ["issued", "paid", "unpaid", "voided"].includes(item))
  ));

  if (/^\d{1,5}$/.test(ticketNumber)) {
    params.push(Number.parseInt(ticketNumber, 10));
    where.push(`ft.ticket_number = $${params.length}`);
  }
  if (ticketCreatedFrom) {
    params.push(ticketCreatedFrom);
    where.push(`ft.created_at::date >= $${params.length}::date`);
  }
  if (ticketCreatedTo) {
    params.push(ticketCreatedTo);
    where.push(`ft.created_at::date <= $${params.length}::date`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    where.push(`ft.ticket_date >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    where.push(`ft.ticket_date <= $${params.length}`);
  }
  if (client) {
    params.push(`%${client}%`);
    params.push(client);
    where.push(`(
      LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $${params.length - 1}
      OR c.id::text = $${params.length}
    )`);
  }
  if (specialist) {
    params.push(`%${specialist}%`);
    where.push(`(
      LOWER(COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), '')) LIKE $${params.length}
      OR EXISTS (
        SELECT 1
          FROM finance_ticket_items fti_filter
          JOIN users iu_filter
            ON iu_filter.organization_id = fti_filter.organization_id
           AND iu_filter.id = fti_filter.specialist_id
         WHERE fti_filter.organization_id = ft.organization_id
           AND fti_filter.ticket_id = ft.id
           AND LOWER(COALESCE(NULLIF(TRIM(iu_filter.full_name), ''), NULLIF(TRIM(iu_filter.username), ''), '')) LIKE $${params.length}
      )
    )`);
  }
  if (position) {
    params.push(`%${position}%`);
    where.push(`(
      LOWER(COALESCE(p.label, '')) LIKE $${params.length}
      OR EXISTS (
        SELECT 1
          FROM finance_ticket_items fti_position
          JOIN users iu_position
            ON iu_position.organization_id = fti_position.organization_id
           AND iu_position.id = fti_position.specialist_id
          LEFT JOIN position_options ip_position
            ON ip_position.organization_id = iu_position.organization_id
           AND ip_position.id = iu_position.position_id
         WHERE fti_position.organization_id = ft.organization_id
           AND fti_position.ticket_id = ft.id
           AND LOWER(COALESCE(ip_position.label, '')) LIKE $${params.length}
      )
    )`);
  }
  if (service) {
    params.push(`%${service}%`);
    where.push(`(
      LOWER(COALESCE(ft.service_name, '')) LIKE $${params.length}
      OR EXISTS (
        SELECT 1
          FROM finance_ticket_items fti_service
         WHERE fti_service.organization_id = ft.organization_id
           AND fti_service.ticket_id = ft.id
           AND LOWER(COALESCE(fti_service.service_name, '')) LIKE $${params.length}
      )
    )`);
  }
  if (statuses.length > 0) {
    params.push(statuses);
    where.push(`ft.status = ANY($${params.length}::text[])`);
  } else {
    where.push("ft.status <> 'voided'");
  }

  return { params, whereSql: where.join(" AND ") };
}

export async function getFinanceTickets({ organizationId, filters = {} }) {
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize ?? filters.page_size, 20);
  const offset = (page - 1) * pageSize;
  const { params, whereSql } = buildTicketsListWhere({ organizationId, filters });
  const fromSql = `
    FROM finance_tickets ft
    JOIN clients c ON c.organization_id = ft.organization_id AND c.id = ft.client_id
    LEFT JOIN users u ON u.organization_id = ft.organization_id AND u.id = ft.specialist_id
    LEFT JOIN position_options p ON p.organization_id = u.organization_id AND p.id = u.position_id
    LEFT JOIN appointment_schedules a ON a.organization_id = ft.organization_id AND a.id = ft.appointment_schedule_id
    LEFT JOIN LATERAL (
      SELECT payment_method_id, paid_at
        FROM finance_ticket_payments
       WHERE organization_id = ft.organization_id AND ticket_id = ft.id
       ORDER BY paid_at DESC, id DESC
       LIMIT 1
    ) fp ON TRUE
    LEFT JOIN finance_payment_methods fpm ON fpm.organization_id = ft.organization_id AND fpm.id = fp.payment_method_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(CASE
               WHEN t.status = 'posted' AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
               WHEN t.status = 'posted' AND t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
               ELSE 0
             END), 0) AS paid_amount_uzs,
             COUNT(*) AS payment_activity_count,
             COUNT(*) FILTER (WHERE t.status = 'posted') AS posted_payment_activity_count
        FROM finance_transactions t
       WHERE t.organization_id = ft.organization_id
         AND t.ticket_id = ft.id
         AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
    ) fpaid ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS item_count,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', fti.id,
                   'lineNumber', fti.line_number,
                   'specialistId', fti.specialist_id,
                   'specialistName', COALESCE(NULLIF(TRIM(iu.full_name), ''), NULLIF(TRIM(iu.username), ''), ''),
                   'positionLabel', ip.label,
                   'serviceId', fti.service_id,
                   'serviceName', fti.service_name,
                   'priceUzs', fti.price_uzs,
                   'discountType', fti.discount_type,
                   'discountValue', fti.discount_value,
                   'discountUzs', fti.discount_uzs,
                   'finalAmountUzs', fti.final_amount_uzs
                 )
                 ORDER BY fti.line_number ASC, fti.id ASC
               ),
               '[]'::json
             ) AS items
        FROM finance_ticket_items fti
        LEFT JOIN users iu ON iu.organization_id = fti.organization_id AND iu.id = fti.specialist_id
        LEFT JOIN position_options ip ON ip.organization_id = iu.organization_id AND ip.id = iu.position_id
       WHERE fti.organization_id = ft.organization_id
         AND fti.ticket_id = ft.id
    ) fti_summary ON TRUE
   WHERE ${whereSql}`;
  const countResult = await pool.query(`SELECT COUNT(*) AS total ${fromSql}`, params);
  const total = Number.parseInt(String(countResult.rows[0]?.total || "0"), 10) || 0;
  const summaryResult = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(ft.subtotal_uzs, ft.amount_uzs, 0)), 0) AS subtotal_amount_uzs,
            COALESCE(SUM(COALESCE(ft.discount_uzs, 0)), 0) AS discount_amount_uzs,
            COALESCE(SUM(COALESCE(ft.total_uzs, ft.amount_uzs, 0)), 0) AS total_amount_uzs,
            COALESCE(SUM(COALESCE(fpaid.paid_amount_uzs, 0)), 0) AS paid_amount_uzs,
            COALESCE(SUM(GREATEST(
              COALESCE(ft.total_uzs, ft.amount_uzs, 0) - COALESCE(fpaid.paid_amount_uzs, 0),
              0
            )), 0) AS remaining_amount_uzs
       ${fromSql}`,
    params
  );
  const summaryRow = summaryResult.rows[0] || {};
  const listParams = [...params, pageSize, offset];
  const result = await pool.query(
    `SELECT ft.id,
            ft.ticket_number,
            ft.ticket_date,
            ft.source,
            ft.appointment_schedule_id,
            ft.client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            ft.specialist_id,
            COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS specialist_name,
            p.label AS position_label,
            ft.service_id,
            ft.service_name,
            ft.amount_uzs,
            ft.subtotal_uzs,
            ft.discount_uzs,
            ft.total_uzs,
            COALESCE(fpaid.paid_amount_uzs, 0) AS paid_amount_uzs,
            COALESCE(fpaid.payment_activity_count, 0) AS payment_activity_count,
            COALESCE(fpaid.posted_payment_activity_count, 0) AS posted_payment_activity_count,
            ft.status,
            ft.note,
            a.appointment_date,
            a.start_time,
            fp.payment_method_id,
            fpm.name AS payment_method_name,
            fp.paid_at,
            COALESCE(fti_summary.item_count, 0) AS item_count,
            COALESCE(fti_summary.items, '[]'::json) AS items,
            ft.created_at,
            ft.updated_at
       ${fromSql}
      ORDER BY ft.ticket_date DESC, ft.id DESC
      LIMIT $${listParams.length - 1}
     OFFSET $${listParams.length}`,
    listParams
  );
  return {
    items: result.rows.map(mapTicket),
    page,
    pageSize,
    total,
    summary: {
      subtotalAmountUzs: normalizeAmount(summaryRow.subtotal_amount_uzs, 0),
      discountAmountUzs: normalizeAmount(summaryRow.discount_amount_uzs, 0),
      totalAmountUzs: normalizeAmount(summaryRow.total_amount_uzs, 0),
      paidAmountUzs: normalizeAmount(summaryRow.paid_amount_uzs, 0),
      remainingAmountUzs: normalizeAmount(summaryRow.remaining_amount_uzs, 0)
    },
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export async function getFinanceTicketHistory({ organizationId, id }) {
  const ticketId = parsePositiveInteger(id);
  if (!ticketId) {
    const error = new Error("Ticket not found.");
    error.statusCode = 404;
    throw error;
  }
  const ticketResult = await pool.query(
    `SELECT id,
            note
       FROM finance_tickets
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1`,
    [organizationId, ticketId]
  );
  if (!ticketResult.rows[0]) {
    const error = new Error("Ticket not found.");
    error.statusCode = 404;
    throw error;
  }
  const result = await pool.query(
    `SELECT h.id,
            h.ticket_id,
            h.action,
            h.from_status,
            h.to_status,
            h.details,
            h.changed_by,
            COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), '') AS actor_name,
            h.changed_at AS created_at
      FROM finance_ticket_history h
       LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.organization_id = $1
        AND h.ticket_id = $2
      ORDER BY h.changed_at DESC, h.id DESC`,
    [organizationId, ticketId]
  );
  const ticketNote = normalizeText(ticketResult.rows[0]?.note);
  return result.rows.map((row) => {
    if (row.action !== "created" || !ticketNote) {
      return mapTicketHistory(row);
    }
    const details = row.details && typeof row.details === "object" ? row.details : {};
    return mapTicketHistory({
      ...row,
      details: details.note ? details : { ...details, note: ticketNote }
    });
  });
}

export async function getCurrentCashSession({ organizationId, actorUserId }) {
  const result = await pool.query(
    `SELECT s.*,
            COALESCE(s.opening_balance_uzs, 0)
              + COALESCE(SUM(
                  CASE
                    WHEN t.status = 'posted' AND t.direction = 'in' THEN t.amount_uzs
                    WHEN t.status = 'posted' AND t.direction = 'out' THEN -t.amount_uzs
                    ELSE 0
                  END
                ), 0) AS expected_balance_uzs,
            COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), '') AS cashier_name
       FROM finance_cash_sessions s
       JOIN users u ON u.id = s.cashier_user_id
       LEFT JOIN finance_transactions t
         ON t.organization_id = s.organization_id
        AND t.cash_session_id = s.id
      WHERE s.organization_id = $1
        AND s.cashier_user_id = $2
        AND s.status = 'open'
      GROUP BY s.id, u.full_name, u.username
      ORDER BY s.opened_at DESC, s.id DESC
      LIMIT 1`,
    [organizationId, actorUserId]
  );
  return mapCashSession(result.rows[0]);
}

export async function openCashSession({ organizationId, payload, actorUserId }) {
  const note = normalizeText(payload?.note);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const existing = await getOpenCashSession(db, { organizationId, cashierUserId: actorUserId, forUpdate: true });
    if (existing) {
      const error = new Error("Cash session is already open.");
      error.statusCode = 409;
      throw error;
    }
    const result = await db.query(
      `INSERT INTO finance_cash_sessions (
         organization_id, cashier_user_id, opening_balance_uzs, note, created_by
       )
       VALUES ($1, $2, $3, $4, $2)
       RETURNING *`,
      [organizationId, actorUserId, 0, note || null]
    );
    await db.query("COMMIT");
    return mapCashSession(result.rows[0]);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    if (error?.code === "23505") {
      const duplicate = new Error("Cash session is already open.");
      duplicate.statusCode = 409;
      throw duplicate;
    }
    throw error;
  } finally {
    db.release();
  }
}

export async function closeCashSession({ organizationId, payload, actorUserId }) {
  const requestedClosingBalance = payload?.closingBalanceUzs ?? payload?.closing_balance_uzs;
  const closingBalanceUzs = requestedClosingBalance === undefined
    ? null
    : normalizeAmount(requestedClosingBalance, -1);
  const closeNote = normalizeText(payload?.note ?? payload?.closeNote ?? payload?.close_note);
  if (closingBalanceUzs !== null && closingBalanceUzs < 0) {
    const error = new Error("Submitted cash is invalid.");
    error.statusCode = 400;
    throw error;
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const current = await getOpenCashSession(db, { organizationId, cashierUserId: actorUserId, forUpdate: true });
    if (!current) {
      const error = new Error("Cash session is required.");
      error.statusCode = 400;
      throw error;
    }
    const expectedBalanceUzs = await getCashSessionExpectedBalance(db, {
      organizationId,
      cashSessionId: current.id
    });
    const result = await db.query(
      `UPDATE finance_cash_sessions
          SET status = 'closed',
              closing_balance_uzs = $3,
              expected_balance_uzs = $4,
              closed_at = CURRENT_TIMESTAMP,
              close_note = $5,
              closed_by = $6,
              updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = $1
          AND id = $2
        RETURNING *`,
      [
        organizationId,
        current.id,
        closingBalanceUzs === null ? expectedBalanceUzs : closingBalanceUzs,
        expectedBalanceUzs,
        closeNote || null,
        actorUserId || null
      ]
    );
    await db.query("COMMIT");
    return mapCashSession(result.rows[0]);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export async function getFinanceTransactions({ organizationId, filters = {} }) {
  const today = getTodayYmdInTashkent();
  const dateFrom = normalizeDate(filters.dateFrom ?? filters.date_from) || today;
  const dateTo = normalizeDate(filters.dateTo ?? filters.date_to) || dateFrom;
  const ticketNumber = normalizeText(filters.ticketNumber ?? filters.ticket_number, 5);
  const client = normalizeText(filters.client, 96).toLowerCase();
  const paymentMethodId = parsePositiveInteger(filters.paymentMethodId ?? filters.payment_method_id);
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize ?? filters.page_size, 20);
  const offset = (page - 1) * pageSize;
  const params = [organizationId, dateFrom, dateTo];
  const where = [
    "t.organization_id = $1",
    "t.created_at::date >= $2::date",
    "t.created_at::date <= $3::date"
  ];
  if (client) {
    params.push(`%${client}%`);
    params.push(client);
    where.push(`(
      LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $${params.length - 1}
      OR c.id::text = $${params.length}
    )`);
  }
  if (/^\d{1,5}$/.test(ticketNumber)) {
    params.push(Number.parseInt(ticketNumber, 10));
    where.push(`ft.ticket_number = $${params.length}`);
  }
  if (paymentMethodId) {
    params.push(paymentMethodId);
    where.push(`t.payment_method_id = $${params.length}`);
  }
  const whereSql = where.join(" AND ");
  const fromSql = `
    FROM finance_transactions t
    JOIN finance_cash_sessions s ON s.organization_id = t.organization_id AND s.id = t.cash_session_id
    LEFT JOIN clients c ON c.organization_id = t.organization_id AND c.id = t.client_id
    LEFT JOIN finance_tickets ft ON ft.organization_id = t.organization_id AND ft.id = t.ticket_id
    LEFT JOIN finance_payment_methods fpm ON fpm.organization_id = t.organization_id AND fpm.id = t.payment_method_id
    LEFT JOIN users cu ON cu.id = s.cashier_user_id
   WHERE ${whereSql}`;
  const countResult = await pool.query(`SELECT COUNT(*) AS total ${fromSql}`, params);
  const total = Number.parseInt(String(countResult.rows[0]?.total || "0"), 10) || 0;
  const listParams = [...params, pageSize, offset];
  const result = await pool.query(
    `SELECT t.id,
            t.cash_session_id,
            t.transaction_type,
            t.direction,
            t.status,
            t.client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            t.ticket_id,
            ft.ticket_number,
            ft.service_name,
            t.ticket_payment_id,
            t.payment_method_id,
            fpm.name AS payment_method_name,
            t.amount_uzs,
            t.transaction_at,
            t.note,
            t.metadata,
            t.voided_at,
            t.voided_by,
            s.cashier_user_id,
            COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '') AS cashier_name,
            t.created_at
       ${fromSql}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $${listParams.length - 1}
     OFFSET $${listParams.length}`,
    listParams
  );
  return {
    items: result.rows.map(mapTransaction),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    dateFrom,
    dateTo
  };
}

async function refreshTicketPaymentStatus(db, { organizationId, ticketId, actorUserId }) {
  const id = parsePositiveInteger(ticketId);
  if (!id) return null;
  const result = await db.query(
    `WITH totals AS (
       SELECT ft.id,
              normalize_amount.total_uzs,
              COALESCE(SUM(CASE
                WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
                WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
                ELSE 0
              END), 0) AS paid_amount_uzs
         FROM finance_tickets ft
         CROSS JOIN LATERAL (
           SELECT COALESCE(ft.total_uzs, ft.amount_uzs, 0) AS total_uzs
         ) normalize_amount
         LEFT JOIN finance_transactions t
           ON t.organization_id = ft.organization_id
          AND t.ticket_id = ft.id
          AND t.status = 'posted'
          AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
        WHERE ft.organization_id = $1
          AND ft.id = $2
          AND ft.status <> 'voided'
        GROUP BY ft.id, normalize_amount.total_uzs
      )
      UPDATE finance_tickets ft
         SET status = CASE
               WHEN totals.paid_amount_uzs >= totals.total_uzs AND totals.total_uzs > 0 THEN 'paid'
               WHEN totals.paid_amount_uzs > 0 THEN 'unpaid'
               ELSE 'issued'
             END,
             updated_by = $3,
             updated_at = CURRENT_TIMESTAMP
        FROM totals
       WHERE ft.organization_id = $1
         AND ft.id = totals.id
       RETURNING ft.*`,
    [organizationId, id, actorUserId || null]
  );
  return result.rows[0] || null;
}

export async function voidFinanceTransaction({ organizationId, id, payload, actorUserId }) {
  const transactionId = parsePositiveInteger(id);
  const reason = normalizeText(payload?.reason);
  if (!transactionId) {
    const error = new Error("Transaction not found.");
    error.statusCode = 404;
    throw error;
  }
  if (reason.length < 3) {
    const error = new Error("Cancellation reason is required.");
    error.statusCode = 400;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const currentResult = await db.query(
      `SELECT t.*,
              s.status AS cash_session_status
         FROM finance_transactions t
         JOIN finance_cash_sessions s
           ON s.organization_id = t.organization_id
          AND s.id = t.cash_session_id
        WHERE t.organization_id = $1
          AND t.id = $2
        FOR UPDATE OF t, s`,
      [organizationId, transactionId]
    );
    const current = currentResult.rows[0];
    if (!current) {
      const error = new Error("Transaction not found.");
      error.statusCode = 404;
      throw error;
    }
    if (current.status !== "posted") {
      const error = new Error("Transaction is already cancelled.");
      error.statusCode = 400;
      throw error;
    }
    if (hasTransactionReversal(current)) {
      const error = new Error("Transaction is already corrected.");
      error.statusCode = 400;
      throw error;
    }

    if (
      ["ticket_payment", "deposit_ticket_payment"].includes(current.transaction_type)
      && current.ticket_payment_id
    ) {
      const refundResult = await db.query(
        `SELECT 1
           FROM finance_transactions
          WHERE organization_id = $1
            AND ticket_id = $2
            AND ticket_payment_id = $3
            AND status = 'posted'
            AND transaction_type IN ('refund', 'deposit_ticket_refund')
          LIMIT 1`,
        [organizationId, current.ticket_id, current.ticket_payment_id]
      );
      if (refundResult.rows[0]) {
        const error = new Error("Cancel the refund before cancelling the original payment.");
        error.statusCode = 400;
        throw error;
      }
    }

    const isClosedCashSession = current.cash_session_status === "closed";
    const reversalSpec = isClosedCashSession ? getTransactionReversalSpec(current) : null;
    if (isClosedCashSession && !reversalSpec) {
      const error = new Error("Transaction cannot be corrected.");
      error.statusCode = 400;
      throw error;
    }

    const depositBalanceImpact = isClosedCashSession
      ? getLedgerDepositChange({
          status: "posted",
          transaction_type: reversalSpec.transactionType,
          amount_uzs: current.amount_uzs
        })
      : getLedgerDepositChange(current);
    if (current.client_id && depositBalanceImpact !== 0) {
      await lockClientFinanceBalance(db, { organizationId, clientId: current.client_id });
      const currentDeposit = await getClientDepositBalance(db, {
        organizationId,
        clientId: current.client_id
      });
      const nextDeposit = isClosedCashSession
        ? currentDeposit + depositBalanceImpact
        : currentDeposit - depositBalanceImpact;
      if (nextDeposit < 0) {
        const error = new Error("Transaction cancellation would make client deposit negative.");
        error.statusCode = 400;
        throw error;
      }
    }

    let previousTicketStatus = null;
    if (current.ticket_id) {
      const ticketBeforeVoid = await getTicketById(db, {
        organizationId,
        id: current.ticket_id,
        forUpdate: true
      });
      previousTicketStatus = ticketBeforeVoid?.status || null;
    }

    let updatedResult = null;
    let reversalTransaction = null;
    if (isClosedCashSession) {
      const cashSession = await getOpenCashSession(db, {
        organizationId,
        cashierUserId: actorUserId,
        forUpdate: true
      });
      if (!cashSession) {
        const error = new Error("Cash session is required.");
        error.statusCode = 400;
        throw error;
      }
      reversalTransaction = await insertFinanceTransaction(db, {
        organizationId,
        cashSessionId: cashSession.id,
        paymentGroupId: current.payment_group_id || null,
        transactionType: reversalSpec.transactionType,
        direction: reversalSpec.direction,
        clientId: current.client_id,
        ticketId: current.ticket_id,
        ticketPaymentId: current.ticket_payment_id,
        paymentMethodId: reversalSpec.paymentMethodId,
        amountUzs: normalizeAmount(current.amount_uzs, 0),
        note: normalizeText(`Correction for transaction #${transactionId}: ${reason}`),
        metadata: {
          source: "closed_session_transaction_reversal",
          reversedTransactionId: transactionId,
          reversedTransactionType: current.transaction_type,
          reversedCashSessionId: current.cash_session_id,
          reason
        },
        actorUserId
      });
      updatedResult = await db.query(
        `UPDATE finance_transactions
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'reversalTransactionId', $3::bigint,
                  'reversalCashSessionId', $4::bigint,
                  'reversalReason', $5::text,
                  'reversedBy', $6::int,
                  'reversedAt', CURRENT_TIMESTAMP
                ),
                updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $1
            AND id = $2
          RETURNING *`,
        [
          organizationId,
          transactionId,
          reversalTransaction.id,
          cashSession.id,
          reason,
          actorUserId || null
        ]
      );
    } else {
      updatedResult = await db.query(
        `UPDATE finance_transactions
            SET status = 'voided',
                voided_by = $3,
                voided_at = CURRENT_TIMESTAMP,
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'voidReason', $4::text,
                  'voidedBy', $3::int,
                  'voidedAt', CURRENT_TIMESTAMP
                ),
                updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $1
            AND id = $2
          RETURNING *`,
        [organizationId, transactionId, actorUserId || null, reason]
      );
    }

    const refreshedTicket = current.ticket_id
      ? await refreshTicketPaymentStatus(db, {
          organizationId,
          ticketId: current.ticket_id,
          actorUserId
        })
      : null;

    if (refreshedTicket) {
      await insertHistory(db, {
        organizationId,
        ticketId: refreshedTicket.id,
        action: "transaction_voided",
        fromStatus: previousTicketStatus || current.transaction_type,
        toStatus: refreshedTicket.status,
        details: {
          transactionId,
          transactionType: current.transaction_type,
          amountUzs: current.amount_uzs,
          reason,
          reversalTransactionId: reversalTransaction?.id || undefined
        },
        actorUserId
      });
    }

    await db.query("COMMIT");
    return mapTransaction(updatedResult.rows[0]);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export async function getFinanceDailyCash({ organizationId, filters = {}, actorUserId = null }) {
  const today = getTodayYmdInTashkent();
  const dateFrom = normalizeDate(filters.dateFrom ?? filters.date_from) || today;
  const dateTo = normalizeDate(filters.dateTo ?? filters.date_to) || dateFrom;
  const cashier = normalizeText(filters.cashier, 96).toLowerCase();
  const client = normalizeText(filters.client, 96).toLowerCase();
  const service = normalizeText(filters.service, 128).toLowerCase();
  const paymentMethodId = parsePositiveInteger(filters.paymentMethodId ?? filters.payment_method_id);
  const sessionScope = normalizeText(filters.sessionScope ?? filters.session_scope, 32).toLowerCase();
  const useCurrentSession = sessionScope === "current";
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize ?? filters.page_size, 20);
  const offset = (page - 1) * pageSize;
  const params = [organizationId];
  const where = [
    "t.organization_id = $1",
    "t.status = 'posted'",
    "t.direction IN ('in', 'out')"
  ];
  if (useCurrentSession) {
    const currentSession = actorUserId
      ? await getOpenCashSession(pool, { organizationId, cashierUserId: actorUserId })
      : null;
    if (!currentSession) {
      return {
        items: [],
        summary: mapDailyCashSummary({}),
        paymentMethods: [],
        page,
        pageSize,
        total: 0,
        totalPages: 1,
        dateFrom,
        dateTo
      };
    }
    params.push(currentSession.id);
    where.push(`t.cash_session_id = $${params.length}`);
  } else {
    params.push(dateFrom);
    params.push(dateTo);
    where.push(`t.transaction_at::date >= $${params.length - 1}::date`);
    where.push(`t.transaction_at::date <= $${params.length}::date`);
  }
  if (cashier) {
    params.push(`%${cashier}%`);
    params.push(cashier);
    where.push(`(
      LOWER(COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '')) LIKE $${params.length - 1}
      OR s.cashier_user_id::text = $${params.length}
    )`);
  }
  if (client) {
    params.push(`%${client}%`);
    params.push(client);
    where.push(`(
      LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $${params.length - 1}
      OR c.id::text = $${params.length}
    )`);
  }
  if (service) {
    params.push(`%${service}%`);
    where.push(`(
      LOWER(COALESCE(ft.service_name, '')) LIKE $${params.length}
      OR EXISTS (
        SELECT 1
          FROM finance_ticket_items fti
         WHERE fti.organization_id = ft.organization_id
           AND fti.ticket_id = ft.id
           AND LOWER(COALESCE(fti.service_name, '')) LIKE $${params.length}
      )
    )`);
  }
  const paymentSummaryParams = [...params];
  const paymentSummaryWhereSql = where.join(" AND ");
  if (paymentMethodId) {
    params.push(paymentMethodId);
    where.push(`t.payment_method_id = $${params.length}`);
  }

  const whereSql = where.join(" AND ");
  const fromSql = `
    FROM finance_transactions t
    JOIN finance_cash_sessions s ON s.organization_id = t.organization_id AND s.id = t.cash_session_id
    LEFT JOIN clients c ON c.organization_id = t.organization_id AND c.id = t.client_id
    LEFT JOIN finance_tickets ft ON ft.organization_id = t.organization_id AND ft.id = t.ticket_id
    LEFT JOIN finance_payment_methods fpm ON fpm.organization_id = t.organization_id AND fpm.id = t.payment_method_id
    LEFT JOIN users cu ON cu.id = s.cashier_user_id
       WHERE ${whereSql}`;
  const paymentSummaryFromSql = `
    FROM finance_transactions t
    JOIN finance_cash_sessions s ON s.organization_id = t.organization_id AND s.id = t.cash_session_id
    LEFT JOIN clients c ON c.organization_id = t.organization_id AND c.id = t.client_id
    LEFT JOIN finance_tickets ft ON ft.organization_id = t.organization_id AND ft.id = t.ticket_id
    LEFT JOIN finance_payment_methods fpm ON fpm.organization_id = t.organization_id AND fpm.id = t.payment_method_id
    LEFT JOIN users cu ON cu.id = s.cashier_user_id
   WHERE ${paymentSummaryWhereSql}`;
  const countResult = await pool.query(`SELECT COUNT(*) AS total ${fromSql}`, params);
  const total = Number.parseInt(String(countResult.rows[0]?.total || "0"), 10) || 0;
  const summaryResult = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.amount_uzs ELSE 0 END), 0) AS total_in_uzs,
            COALESCE(SUM(CASE WHEN t.direction = 'out' THEN t.amount_uzs ELSE 0 END), 0) AS total_out_uzs,
            COUNT(*) AS transaction_count
       ${fromSql}`,
    params
  );
  const paymentSummaryResult = await pool.query(
    `SELECT COALESCE(fpm.name, 'No payment method') AS payment_method_name,
            t.payment_method_id,
            COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.amount_uzs ELSE 0 END), 0) AS total_in_uzs,
            COALESCE(SUM(CASE WHEN t.direction = 'out' THEN t.amount_uzs ELSE 0 END), 0) AS total_out_uzs,
            COUNT(*) AS transaction_count
       ${paymentSummaryFromSql}
      GROUP BY t.payment_method_id, fpm.name
      ORDER BY payment_method_name ASC`,
    paymentSummaryParams
  );
  const listParams = [...params, pageSize, offset];
  const result = await pool.query(
    `SELECT t.id,
            t.cash_session_id,
            t.transaction_type,
            t.direction,
            t.status,
            t.client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            t.ticket_id,
            ft.ticket_number,
            ft.service_name,
            t.ticket_payment_id,
            t.payment_method_id,
            fpm.name AS payment_method_name,
            t.amount_uzs,
            t.transaction_at,
            t.note,
            s.cashier_user_id,
            COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '') AS cashier_name,
            t.created_at
       ${fromSql}
      ORDER BY t.transaction_at DESC, t.id DESC
      LIMIT $${listParams.length - 1}
     OFFSET $${listParams.length}`,
    listParams
  );

  return {
    items: result.rows.map(mapTransaction),
    summary: mapDailyCashSummary(summaryResult.rows[0] || {}),
    paymentMethods: paymentSummaryResult.rows.map((row) => {
      const totalInUzs = normalizeAmount(row.total_in_uzs, 0);
      const totalOutUzs = normalizeAmount(row.total_out_uzs, 0);
      return {
        paymentMethodId: row.payment_method_id,
        paymentMethodName: row.payment_method_name || "",
        totalInUzs,
        totalOutUzs,
        netUzs: totalInUzs - totalOutUzs,
        transactionCount: Number.parseInt(String(row.transaction_count || 0), 10) || 0
      };
    }),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    dateFrom,
    dateTo
  };
}

export async function getFinanceReports({ organizationId, filters = {} }) {
  const ticketCreatedFrom = normalizeDate(filters.ticketCreatedFrom ?? filters.ticket_created_from);
  const ticketCreatedTo = normalizeDate(filters.ticketCreatedTo ?? filters.ticket_created_to);
  const ticketDateFrom = normalizeDate(filters.ticketDateFrom ?? filters.ticket_date_from);
  const ticketDateTo = normalizeDate(filters.ticketDateTo ?? filters.ticket_date_to);
  const paymentDateFrom = normalizeDate(filters.paymentDateFrom ?? filters.payment_date_from ?? filters.dateFrom ?? filters.date_from);
  const paymentDateTo = normalizeDate(filters.paymentDateTo ?? filters.payment_date_to ?? filters.dateTo ?? filters.date_to);
  const ticketNumber = normalizeText(filters.ticketNumber ?? filters.ticket_number, 12);
  const client = normalizeText(filters.client, 96).toLowerCase();
  const clientId = parsePositiveInteger(filters.clientId ?? filters.client_id);
  const clientBirthdayFrom = normalizeDate(filters.clientBirthdayFrom ?? filters.client_birthday_from);
  const clientBirthdayTo = normalizeDate(filters.clientBirthdayTo ?? filters.client_birthday_to);
  const clientGender = normalizeGender(filters.clientGender ?? filters.client_gender);
  const clientPhone = normalizeText(filters.clientPhone ?? filters.client_phone, 32);
  const serviceRaw = filters.service ?? filters.serviceName ?? filters.service_name;
  const service = normalizeText(serviceRaw, 128).toLowerCase();
  const serviceId = parsePositiveInteger(filters.serviceId ?? filters.service_id ?? serviceRaw);
  const serviceAmountFrom = normalizeOptionalAmount(filters.serviceAmountFrom ?? filters.service_amount_from);
  const serviceAmountTo = normalizeOptionalAmount(filters.serviceAmountTo ?? filters.service_amount_to);
  const discountFrom = normalizeOptionalAmount(filters.ticketDiscountFrom ?? filters.ticket_discount_from ?? filters.discountFrom ?? filters.discount_from);
  const discountTo = normalizeOptionalAmount(filters.ticketDiscountTo ?? filters.ticket_discount_to ?? filters.discountTo ?? filters.discount_to);
  const ticketToPayFrom = normalizeOptionalAmount(filters.ticketToPayFrom ?? filters.ticket_to_pay_from);
  const ticketToPayTo = normalizeOptionalAmount(filters.ticketToPayTo ?? filters.ticket_to_pay_to);
  const ticketPaidFrom = normalizeOptionalAmount(filters.ticketPaidFrom ?? filters.ticket_paid_from);
  const ticketPaidTo = normalizeOptionalAmount(filters.ticketPaidTo ?? filters.ticket_paid_to);
  const specialistRaw = filters.specialist ?? filters.specialistId ?? filters.specialist_id;
  const specialist = normalizeText(specialistRaw, 96).toLowerCase();
  const specialistId = parsePositiveInteger(filters.specialistId ?? filters.specialist_id ?? specialistRaw);
  const positionRaw = filters.position ?? filters.department ?? filters.positionId ?? filters.position_id;
  const position = normalizeText(positionRaw, 96).toLowerCase();
  const positionId = parsePositiveInteger(filters.positionId ?? filters.position_id ?? positionRaw);
  const cashierRaw = filters.cashier ?? filters.cashierId ?? filters.cashier_id;
  const cashier = normalizeText(cashierRaw, 96).toLowerCase();
  const cashierId = parsePositiveInteger(filters.cashierId ?? filters.cashier_id ?? cashierRaw);
  const paymentMethodId = parsePositiveInteger(filters.paymentMethodId ?? filters.payment_method_id);
  const transactionType = normalizeText(filters.transactionType ?? filters.transaction_type, 64).toLowerCase();
  const transactionStatus = normalizeText(filters.transactionStatus ?? filters.transaction_status, 32).toLowerCase();
  const ticketStatus = normalizeText(filters.ticketStatus ?? filters.ticket_status, 32).toLowerCase();
  const includeVoided = normalizeBooleanFlag(filters.includeVoided ?? filters.include_voided);
  const reportTransactionTypes = [
    "ticket_payment",
    "deposit_ticket_payment",
    "refund",
    "deposit_ticket_refund",
    "deposit_in",
    "deposit_out",
    "correction"
  ];
  const ticketMovementTypes = [
    "ticket_payment",
    "deposit_ticket_payment",
    "refund",
    "deposit_ticket_refund"
  ];
  const ticketStatuses = new Set(["issued", "unpaid", "paid", "voided"]);
  const transactionStatuses = new Set(["posted", "voided"]);
  const params = [organizationId];
  const commonWhere = [
    "t.organization_id = $1"
  ];
  const itemOnlyWhere = [];

  if (paymentDateFrom) {
    params.push(paymentDateFrom);
    commonWhere.push(`t.transaction_at::date >= $${params.length}::date`);
  }
  if (paymentDateTo) {
    params.push(paymentDateTo);
    commonWhere.push(`t.transaction_at::date <= $${params.length}::date`);
  }
  if (ticketCreatedFrom) {
    params.push(ticketCreatedFrom);
    commonWhere.push(`ft.created_at::date >= $${params.length}::date`);
  }
  if (ticketCreatedTo) {
    params.push(ticketCreatedTo);
    commonWhere.push(`ft.created_at::date <= $${params.length}::date`);
  }
  if (ticketDateFrom) {
    params.push(ticketDateFrom);
    commonWhere.push(`ft.ticket_date >= $${params.length}::date`);
  }
  if (ticketDateTo) {
    params.push(ticketDateTo);
    commonWhere.push(`ft.ticket_date <= $${params.length}::date`);
  }

  if (transactionStatuses.has(transactionStatus)) {
    params.push(transactionStatus);
    commonWhere.push(`t.status = $${params.length}`);
  } else if (includeVoided) {
    commonWhere.push("t.status IN ('posted', 'voided')");
  } else {
    commonWhere.push("t.status = 'posted'");
  }

  if (clientId) {
    params.push(clientId);
    commonWhere.push(`c.id = $${params.length}`);
  } else if (client) {
    if (/^\d+$/.test(client)) {
      params.push(Number.parseInt(client, 10));
      commonWhere.push(`c.id = $${params.length}`);
    } else {
      params.push(`%${client}%`);
      commonWhere.push(`LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $${params.length}`);
    }
  }

  if (clientBirthdayFrom) {
    params.push(clientBirthdayFrom);
    commonWhere.push(`c.birthday >= $${params.length}::date`);
  }
  if (clientBirthdayTo) {
    params.push(clientBirthdayTo);
    commonWhere.push(`c.birthday <= $${params.length}::date`);
  }
  if (clientGender) {
    params.push(clientGender);
    commonWhere.push(`LOWER(COALESCE(c.gender, '')) = $${params.length}`);
  }
  if (clientPhone) {
    params.push(`%${clientPhone}%`);
    commonWhere.push(`COALESCE(c.phone_number, '') LIKE $${params.length}`);
  }

  if (/^\d{1,8}$/.test(ticketNumber)) {
    params.push(Number.parseInt(ticketNumber, 10));
    commonWhere.push(`ft.ticket_number = $${params.length}`);
  }

  if (serviceId) {
    params.push(serviceId);
    commonWhere.push(`(
      ft.service_id = $${params.length}
      OR EXISTS (
        SELECT 1
          FROM finance_ticket_items fti_filter
         WHERE fti_filter.organization_id = ft.organization_id
           AND fti_filter.ticket_id = ft.id
          AND fti_filter.service_id = $${params.length}
      )
    )`);
    itemOnlyWhere.push(`fti.service_id = $${params.length}`);
  } else if (service) {
    params.push(`%${service}%`);
    commonWhere.push(`(
      LOWER(COALESCE(ft.service_name, '')) LIKE $${params.length}
      OR EXISTS (
        SELECT 1
          FROM finance_ticket_items fti_filter
         WHERE fti_filter.organization_id = ft.organization_id
           AND fti_filter.ticket_id = ft.id
           AND LOWER(COALESCE(fti_filter.service_name, '')) LIKE $${params.length}
      )
    )`);
    itemOnlyWhere.push(`LOWER(COALESCE(fti.service_name, '')) LIKE $${params.length}`);
  }

  if (specialistId) {
    params.push(specialistId);
    commonWhere.push(`(
      ft.specialist_id = $${params.length}
      OR EXISTS (
        SELECT 1
          FROM finance_ticket_items fti_filter
         WHERE fti_filter.organization_id = ft.organization_id
           AND fti_filter.ticket_id = ft.id
          AND fti_filter.specialist_id = $${params.length}
      )
    )`);
    itemOnlyWhere.push(`fti.specialist_id = $${params.length}`);
  } else if (specialist) {
    params.push(`%${specialist}%`);
    commonWhere.push(`(
      LOWER(COALESCE(NULLIF(TRIM(ts.full_name), ''), NULLIF(TRIM(ts.username), ''), '')) LIKE $${params.length}
      OR EXISTS (
        SELECT 1
          FROM finance_ticket_items fti_filter
          LEFT JOIN users iu ON iu.organization_id = fti_filter.organization_id AND iu.id = fti_filter.specialist_id
         WHERE fti_filter.organization_id = ft.organization_id
           AND fti_filter.ticket_id = ft.id
           AND LOWER(COALESCE(NULLIF(TRIM(iu.full_name), ''), NULLIF(TRIM(iu.username), ''), '')) LIKE $${params.length}
      )
    )`);
    itemOnlyWhere.push(`LOWER(COALESCE(NULLIF(TRIM(isu.full_name), ''), NULLIF(TRIM(isu.username), ''), '')) LIKE $${params.length}`);
  }

  if (positionId) {
    params.push(positionId);
    commonWhere.push(`(
      ts.position_id = $${params.length}
      OR EXISTS (
        SELECT 1
          FROM finance_ticket_items fti_filter
          LEFT JOIN users iu ON iu.organization_id = fti_filter.organization_id AND iu.id = fti_filter.specialist_id
         WHERE fti_filter.organization_id = ft.organization_id
           AND fti_filter.ticket_id = ft.id
           AND iu.position_id = $${params.length}
      )
    )`);
    itemOnlyWhere.push(`isu.position_id = $${params.length}`);
  } else if (position) {
    params.push(`%${position}%`);
    commonWhere.push(`(
      LOWER(COALESCE(tp.label, '')) LIKE $${params.length}
      OR EXISTS (
        SELECT 1
          FROM finance_ticket_items fti_filter
          LEFT JOIN users iu ON iu.organization_id = fti_filter.organization_id AND iu.id = fti_filter.specialist_id
          LEFT JOIN position_options ip ON ip.organization_id = iu.organization_id AND ip.id = iu.position_id
         WHERE fti_filter.organization_id = ft.organization_id
           AND fti_filter.ticket_id = ft.id
           AND LOWER(COALESCE(ip.label, '')) LIKE $${params.length}
      )
    )`);
    itemOnlyWhere.push(`LOWER(COALESCE(ip.label, '')) LIKE $${params.length}`);
  }

  if (cashierId) {
    params.push(cashierId);
    commonWhere.push(`s.cashier_user_id = $${params.length}`);
  } else if (cashier) {
    params.push(`%${cashier}%`);
    params.push(cashier);
    commonWhere.push(`(
      LOWER(COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '')) LIKE $${params.length - 1}
      OR s.cashier_user_id::text = $${params.length}
    )`);
  }

  if (paymentMethodId) {
    params.push(paymentMethodId);
    commonWhere.push(`t.payment_method_id = $${params.length}`);
  }

  if (serviceAmountFrom !== null) {
    params.push(serviceAmountFrom);
    commonWhere.push(`EXISTS (
      SELECT 1
        FROM finance_ticket_items fti_filter
       WHERE fti_filter.organization_id = ft.organization_id
         AND fti_filter.ticket_id = ft.id
         AND fti_filter.price_uzs >= $${params.length}
    )`);
    itemOnlyWhere.push(`fti.price_uzs >= $${params.length}`);
  }
  if (serviceAmountTo !== null) {
    params.push(serviceAmountTo);
    commonWhere.push(`EXISTS (
      SELECT 1
        FROM finance_ticket_items fti_filter
       WHERE fti_filter.organization_id = ft.organization_id
         AND fti_filter.ticket_id = ft.id
         AND fti_filter.price_uzs <= $${params.length}
    )`);
    itemOnlyWhere.push(`fti.price_uzs <= $${params.length}`);
  }
  if (discountFrom !== null) {
    params.push(discountFrom);
    commonWhere.push(`EXISTS (
      SELECT 1
        FROM finance_ticket_items fti_filter
       WHERE fti_filter.organization_id = ft.organization_id
         AND fti_filter.ticket_id = ft.id
         AND fti_filter.discount_uzs >= $${params.length}
    )`);
    itemOnlyWhere.push(`fti.discount_uzs >= $${params.length}`);
  }
  if (discountTo !== null) {
    params.push(discountTo);
    commonWhere.push(`EXISTS (
      SELECT 1
        FROM finance_ticket_items fti_filter
       WHERE fti_filter.organization_id = ft.organization_id
         AND fti_filter.ticket_id = ft.id
         AND fti_filter.discount_uzs <= $${params.length}
    )`);
    itemOnlyWhere.push(`fti.discount_uzs <= $${params.length}`);
  }
  if (ticketToPayFrom !== null) {
    params.push(ticketToPayFrom);
    commonWhere.push(`COALESCE(ft.total_uzs, ft.amount_uzs, 0) >= $${params.length}`);
  }
  if (ticketToPayTo !== null) {
    params.push(ticketToPayTo);
    commonWhere.push(`COALESCE(ft.total_uzs, ft.amount_uzs, 0) <= $${params.length}`);
  }
  if (ticketPaidFrom !== null) {
    params.push(ticketPaidFrom);
    commonWhere.push(`COALESCE(fpaid.paid_amount_uzs, 0) >= $${params.length}`);
  }
  if (ticketPaidTo !== null) {
    params.push(ticketPaidTo);
    commonWhere.push(`COALESCE(fpaid.paid_amount_uzs, 0) <= $${params.length}`);
  }

  if (ticketStatuses.has(ticketStatus)) {
    params.push(ticketStatus);
    commonWhere.push(`ft.status = $${params.length}`);
  }

  const reportWhere = [...commonWhere];
  let transactionTypeParam = "";
  if (reportTransactionTypes.includes(transactionType)) {
    params.push(transactionType);
    transactionTypeParam = `$${params.length}`;
    reportWhere.push(`t.transaction_type = ${transactionTypeParam}`);
  } else {
    reportWhere.push("t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund', 'deposit_in', 'deposit_out', 'correction')");
  }
  const ticketMovementWhereParts = [...commonWhere];
  if (transactionType && !ticketMovementTypes.includes(transactionType)) {
    ticketMovementWhereParts.push("FALSE");
  } else if (transactionTypeParam) {
    ticketMovementWhereParts.push(`t.transaction_type = ${transactionTypeParam}`);
  } else {
    ticketMovementWhereParts.push("t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')");
  }
  ticketMovementWhereParts.push(...itemOnlyWhere);

  const reportWhereSql = reportWhere.join("\n    AND ");
  const ticketMovementWhere = ticketMovementWhereParts.join("\n    AND ");
  const signedItemAmountSql = `
    CASE
      WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN
        ROUND((t.amount_uzs::numeric * fti.final_amount_uzs::numeric) / COALESCE(NULLIF(ft.total_uzs::numeric, 0), NULLIF(ft.amount_uzs::numeric, 0)))
      WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN
        -ROUND((t.amount_uzs::numeric * fti.final_amount_uzs::numeric) / COALESCE(NULLIF(ft.total_uzs::numeric, 0), NULLIF(ft.amount_uzs::numeric, 0)))
      ELSE 0
    END`;
  const signedTicketAmountSql = `
    CASE
      WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
      WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
      ELSE 0
    END`;
  const signedReportAmountSql = `
    CASE
      WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
      WHEN t.direction = 'out' THEN -t.amount_uzs
      ELSE t.amount_uzs
    END`;
  const reportBaseSql = `
    FROM finance_transactions t
    JOIN finance_cash_sessions s ON s.organization_id = t.organization_id AND s.id = t.cash_session_id
    LEFT JOIN clients c ON c.organization_id = t.organization_id AND c.id = t.client_id
    LEFT JOIN finance_tickets ft ON ft.organization_id = t.organization_id AND ft.id = t.ticket_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(CASE
               WHEN pt.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN pt.amount_uzs
               WHEN pt.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -pt.amount_uzs
               ELSE 0
             END), 0) AS paid_amount_uzs
        FROM finance_transactions pt
       WHERE pt.organization_id = ft.organization_id
         AND pt.ticket_id = ft.id
         AND pt.status = 'posted'
         AND pt.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
    ) fpaid ON TRUE
    LEFT JOIN finance_payment_methods fpm ON fpm.organization_id = t.organization_id AND fpm.id = t.payment_method_id
    LEFT JOIN users cu ON cu.id = s.cashier_user_id
    LEFT JOIN users ts ON ts.organization_id = ft.organization_id AND ts.id = ft.specialist_id
    LEFT JOIN position_options tp ON tp.organization_id = ts.organization_id AND tp.id = ts.position_id`;
  const reportFromSql = `
    ${reportBaseSql}
   WHERE ${reportWhereSql}`;
  const itemBaseSql = `
    FROM finance_transactions t
    JOIN finance_tickets ft ON ft.organization_id = t.organization_id AND ft.id = t.ticket_id
    JOIN finance_ticket_items fti ON fti.organization_id = ft.organization_id AND fti.ticket_id = ft.id
    JOIN finance_cash_sessions s ON s.organization_id = t.organization_id AND s.id = t.cash_session_id
    LEFT JOIN clients c ON c.organization_id = t.organization_id AND c.id = t.client_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(CASE
               WHEN pt.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN pt.amount_uzs
               WHEN pt.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -pt.amount_uzs
               ELSE 0
             END), 0) AS paid_amount_uzs
        FROM finance_transactions pt
       WHERE pt.organization_id = ft.organization_id
         AND pt.ticket_id = ft.id
         AND pt.status = 'posted'
         AND pt.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
    ) fpaid ON TRUE
    LEFT JOIN finance_payment_methods fpm ON fpm.organization_id = t.organization_id AND fpm.id = t.payment_method_id
    LEFT JOIN users cu ON cu.id = s.cashier_user_id
    LEFT JOIN users ts ON ts.organization_id = ft.organization_id AND ts.id = ft.specialist_id
    LEFT JOIN position_options tp ON tp.organization_id = ts.organization_id AND tp.id = ts.position_id
    LEFT JOIN users isu ON isu.organization_id = fti.organization_id AND isu.id = fti.specialist_id
    LEFT JOIN position_options ip ON ip.organization_id = isu.organization_id AND ip.id = isu.position_id`;
  const itemFromSql = `
    ${itemBaseSql}
   WHERE ${ticketMovementWhere}`;

  const summaryResult = await runFinanceReportQuery(
    `SELECT COALESCE(SUM(${signedReportAmountSql}), 0) AS net_amount_uzs,
            COALESCE(SUM(CASE
              WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
              WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
              ELSE 0
            END), 0) AS amount_uzs,
            COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.amount_uzs ELSE 0 END), 0) AS total_in_uzs,
            COALESCE(SUM(CASE WHEN t.direction = 'out' THEN t.amount_uzs ELSE 0 END), 0) AS total_out_uzs,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'deposit_in' THEN t.amount_uzs ELSE 0 END), 0) AS deposit_in_uzs,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'deposit_out' THEN t.amount_uzs ELSE 0 END), 0) AS deposit_out_uzs,
            COALESCE(SUM(CASE WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN t.amount_uzs ELSE 0 END), 0) AS refund_uzs,
            COUNT(*) AS transaction_count,
            COUNT(DISTINCT CASE WHEN t.ticket_id IS NOT NULL THEN t.ticket_id END) AS ticket_count
       ${reportFromSql}`,
    params,
    [{
      net_amount_uzs: 0,
      amount_uzs: 0,
      total_in_uzs: 0,
      total_out_uzs: 0,
      deposit_in_uzs: 0,
      deposit_out_uzs: 0,
      refund_uzs: 0,
      transaction_count: 0,
      ticket_count: 0
    }]
  );
  let byServiceResult;
  let bySpecialistResult;
  let byDepartmentResult;
  try {
    byServiceResult = await pool.query(
      `SELECT fti.service_id AS id,
              COALESCE(NULLIF(TRIM(fti.service_name), ''), 'No service') AS label,
              COALESCE(SUM(${signedItemAmountSql}), 0) AS amount_uzs,
              COUNT(DISTINCT fti.id) AS item_count
         ${itemFromSql}
        GROUP BY fti.service_id, fti.service_name
        ORDER BY amount_uzs DESC, label ASC
        LIMIT 100`,
      params
    );
    bySpecialistResult = await pool.query(
      `SELECT fti.specialist_id AS id,
              COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), 'No specialist') AS label,
              COALESCE(SUM(${signedItemAmountSql}), 0) AS amount_uzs,
              COUNT(DISTINCT fti.id) AS item_count
         ${itemBaseSql}
         LEFT JOIN users u ON u.organization_id = fti.organization_id AND u.id = fti.specialist_id
        WHERE ${ticketMovementWhere}
        GROUP BY fti.specialist_id, u.full_name, u.username
        ORDER BY amount_uzs DESC, label ASC
        LIMIT 100`,
      params
    );
    byDepartmentResult = await pool.query(
      `SELECT p.id,
              COALESCE(NULLIF(TRIM(p.label), ''), 'No department') AS label,
              COALESCE(SUM(${signedItemAmountSql}), 0) AS amount_uzs,
              COUNT(DISTINCT fti.id) AS item_count
         ${itemBaseSql}
         LEFT JOIN users u ON u.organization_id = fti.organization_id AND u.id = fti.specialist_id
         LEFT JOIN position_options p ON p.organization_id = u.organization_id AND p.id = u.position_id
        WHERE ${ticketMovementWhere}
        GROUP BY p.id, p.label
        ORDER BY amount_uzs DESC, label ASC
        LIMIT 100`,
      params
    );
  } catch (error) {
    if (!shouldUseLegacyReportFallback(error)) {
      throw error;
    }
    const legacyTicketBaseSql = `
      FROM finance_transactions t
      JOIN finance_tickets ft ON ft.organization_id = t.organization_id AND ft.id = t.ticket_id
      JOIN finance_cash_sessions s ON s.organization_id = t.organization_id AND s.id = t.cash_session_id
      LEFT JOIN clients c ON c.organization_id = t.organization_id AND c.id = t.client_id
      LEFT JOIN finance_payment_methods fpm ON fpm.organization_id = t.organization_id AND fpm.id = t.payment_method_id
      LEFT JOIN users cu ON cu.id = s.cashier_user_id
      LEFT JOIN users ts ON ts.organization_id = ft.organization_id AND ts.id = ft.specialist_id
      LEFT JOIN position_options tp ON tp.organization_id = ts.organization_id AND tp.id = ts.position_id`;
    const legacyTicketFromSql = `
      ${legacyTicketBaseSql}
     WHERE ${ticketMovementWhere}`;
    byServiceResult = await runFinanceReportQuery(
      `SELECT ft.service_id AS id,
              COALESCE(NULLIF(TRIM(ft.service_name), ''), 'No service') AS label,
              COALESCE(SUM(${signedTicketAmountSql}), 0) AS amount_uzs,
              COUNT(*) AS transaction_count
         ${legacyTicketFromSql}
        GROUP BY ft.service_id, ft.service_name
        ORDER BY amount_uzs DESC, label ASC
        LIMIT 100`,
      params
    );
    bySpecialistResult = await runFinanceReportQuery(
      `SELECT ft.specialist_id AS id,
              COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), 'No specialist') AS label,
              COALESCE(SUM(${signedTicketAmountSql}), 0) AS amount_uzs,
              COUNT(*) AS transaction_count
         ${legacyTicketBaseSql}
         LEFT JOIN users u ON u.organization_id = ft.organization_id AND u.id = ft.specialist_id
        WHERE ${ticketMovementWhere}
        GROUP BY ft.specialist_id, u.full_name, u.username
        ORDER BY amount_uzs DESC, label ASC
        LIMIT 100`,
      params
    );
    byDepartmentResult = await runFinanceReportQuery(
      `SELECT p.id,
              COALESCE(NULLIF(TRIM(p.label), ''), 'No department') AS label,
              COALESCE(SUM(${signedTicketAmountSql}), 0) AS amount_uzs,
              COUNT(*) AS transaction_count
         ${legacyTicketBaseSql}
         LEFT JOIN users u ON u.organization_id = ft.organization_id AND u.id = ft.specialist_id
         LEFT JOIN position_options p ON p.organization_id = u.organization_id AND p.id = u.position_id
        WHERE ${ticketMovementWhere}
        GROUP BY p.id, p.label
        ORDER BY amount_uzs DESC, label ASC
        LIMIT 100`,
      params
    );
  }
  const byClientResult = await runFinanceReportQuery(
    `SELECT c.id,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)), ''), 'No client') AS label,
            COALESCE(SUM(${signedReportAmountSql}), 0) AS amount_uzs,
            COUNT(*) AS transaction_count
       ${reportFromSql}
      GROUP BY c.id, c.last_name, c.first_name, c.middle_name
      ORDER BY amount_uzs DESC, label ASC
      LIMIT 100`,
    params
  );
  const byCashierResult = await runFinanceReportQuery(
    `SELECT s.cashier_user_id AS id,
            COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), 'No cashier') AS label,
            COALESCE(SUM(${signedReportAmountSql}), 0) AS amount_uzs,
            COUNT(*) AS transaction_count
       ${reportFromSql}
      GROUP BY s.cashier_user_id, cu.full_name, cu.username
      ORDER BY amount_uzs DESC, label ASC
      LIMIT 100`,
    params
  );
  const byPaymentMethodResult = await runFinanceReportQuery(
    `SELECT t.payment_method_id AS id,
            COALESCE(NULLIF(TRIM(fpm.name), ''), CASE WHEN t.direction = 'transfer' THEN 'Client Balance' ELSE 'No payment method' END) AS label,
            COALESCE(SUM(${signedReportAmountSql}), 0) AS amount_uzs,
            COUNT(*) AS transaction_count
       ${reportFromSql}
      GROUP BY t.payment_method_id, fpm.name, t.direction
      ORDER BY amount_uzs DESC, label ASC
      LIMIT 100`,
    params
  );
  const byDayResult = await runFinanceReportQuery(
    `SELECT to_char(t.transaction_at::date, 'YYYY-MM-DD') AS id,
            to_char(t.transaction_at::date, 'YYYY-MM-DD') AS label,
            COALESCE(SUM(${signedReportAmountSql}), 0) AS amount_uzs,
            COUNT(*) AS transaction_count
       ${reportFromSql}
      GROUP BY t.transaction_at::date
      ORDER BY t.transaction_at::date ASC`,
    params
  );
  const detailWhereSql = [...reportWhere, ...itemOnlyWhere].join("\n    AND ");
  const detailBaseSql = `
    FROM finance_transactions t
    JOIN finance_cash_sessions s ON s.organization_id = t.organization_id AND s.id = t.cash_session_id
    LEFT JOIN clients c ON c.organization_id = t.organization_id AND c.id = t.client_id
    LEFT JOIN finance_tickets ft ON ft.organization_id = t.organization_id AND ft.id = t.ticket_id
    LEFT JOIN finance_ticket_items fti ON fti.organization_id = ft.organization_id AND fti.ticket_id = ft.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(CASE
               WHEN pt.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN pt.amount_uzs
               WHEN pt.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -pt.amount_uzs
               ELSE 0
             END), 0) AS paid_amount_uzs
        FROM finance_transactions pt
       WHERE pt.organization_id = ft.organization_id
         AND pt.ticket_id = ft.id
         AND pt.status = 'posted'
         AND pt.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
    ) fpaid ON TRUE
    LEFT JOIN finance_payment_methods fpm ON fpm.organization_id = t.organization_id AND fpm.id = t.payment_method_id
    LEFT JOIN users cu ON cu.id = s.cashier_user_id
    LEFT JOIN users ts ON ts.organization_id = ft.organization_id AND ts.id = ft.specialist_id
    LEFT JOIN position_options tp ON tp.organization_id = ts.organization_id AND tp.id = ts.position_id
    LEFT JOIN users isu ON isu.organization_id = fti.organization_id AND isu.id = fti.specialist_id
    LEFT JOIN position_options ip ON ip.organization_id = isu.organization_id AND ip.id = isu.position_id
   WHERE ${detailWhereSql}`;
  const detailsResult = await runFinanceReportQuery(
    `SELECT t.id,
            t.transaction_type,
            t.direction,
            t.status,
            t.client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            c.birthday AS client_birthday,
            COALESCE(c.gender, '') AS client_gender,
            COALESCE(c.phone_number, '') AS client_phone,
            t.ticket_id,
            ft.ticket_number,
            ft.created_at AS ticket_created_at,
            ft.ticket_date,
            ft.status AS ticket_status,
            fti.id AS ticket_item_id,
            fti.line_number AS ticket_item_line_number,
            COALESCE(NULLIF(TRIM(fti.service_name), ''), NULLIF(TRIM(ft.service_name), ''), '') AS service_name,
            COALESCE(fti.price_uzs, ft.amount_uzs, 0) AS service_amount_uzs,
            COALESCE(fti.discount_uzs, ft.discount_uzs, 0) AS service_discount_uzs,
            COALESCE(fti.final_amount_uzs, ft.total_uzs, ft.amount_uzs, 0) AS service_final_amount_uzs,
            COALESCE(NULLIF(TRIM(isu.full_name), ''), NULLIF(TRIM(isu.username), ''), NULLIF(TRIM(ts.full_name), ''), NULLIF(TRIM(ts.username), ''), '') AS specialist_name,
            COALESCE(NULLIF(TRIM(ip.label), ''), NULLIF(TRIM(tp.label), ''), '') AS position_label,
            COALESCE(ft.subtotal_uzs, ft.amount_uzs, 0) AS ticket_subtotal_uzs,
            COALESCE(fti.discount_uzs, ft.discount_uzs, 0) AS ticket_discount_uzs,
            COALESCE(ft.total_uzs, ft.amount_uzs, 0) AS ticket_total_uzs,
            COALESCE(fpaid.paid_amount_uzs, 0) AS ticket_paid_uzs,
            t.payment_method_id,
            COALESCE(NULLIF(TRIM(fpm.name), ''), CASE WHEN t.direction = 'transfer' THEN 'Client Balance' ELSE '' END) AS payment_method_name,
            t.amount_uzs,
            ${signedReportAmountSql} AS signed_amount_uzs,
            t.transaction_at,
            t.note,
            s.cashier_user_id,
            COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '') AS cashier_name
       ${detailBaseSql}
      ORDER BY t.transaction_at DESC, t.id DESC, fti.line_number ASC NULLS LAST
      LIMIT 500`,
    params
  );

  const summaryRow = summaryResult.rows[0] || {};
  const totalInUzs = Number.parseInt(String(summaryRow.total_in_uzs || 0), 10) || 0;
  const totalOutUzs = Number.parseInt(String(summaryRow.total_out_uzs || 0), 10) || 0;

  return {
    dateFrom: paymentDateFrom,
    dateTo: paymentDateTo,
    filters: {
      ticketCreatedFrom,
      ticketCreatedTo,
      ticketDateFrom,
      ticketDateTo,
      paymentDateFrom,
      paymentDateTo,
      ticketNumber,
      client: clientId || client,
      clientId: clientId || "",
      clientBirthdayFrom,
      clientBirthdayTo,
      clientGender,
      clientPhone,
      service: serviceId || service,
      serviceAmountFrom: serviceAmountFrom ?? "",
      serviceAmountTo: serviceAmountTo ?? "",
      specialist: specialistId || specialist,
      position: positionId || position,
      cashier: cashierId || cashier,
      paymentMethodId: paymentMethodId || "",
      ticketDiscountFrom: discountFrom ?? "",
      ticketDiscountTo: discountTo ?? "",
      ticketToPayFrom: ticketToPayFrom ?? "",
      ticketToPayTo: ticketToPayTo ?? "",
      ticketPaidFrom: ticketPaidFrom ?? "",
      ticketPaidTo: ticketPaidTo ?? "",
      transactionType,
      transactionStatus,
      ticketStatus,
      includeVoided
    },
    summary: {
      amountUzs: Number.parseInt(String(summaryRow.amount_uzs || 0), 10) || 0,
      ticketRevenueUzs: Number.parseInt(String(summaryRow.amount_uzs || 0), 10) || 0,
      netTotalUzs: Number.parseInt(String(summaryRow.net_amount_uzs || 0), 10) || 0,
      cashInUzs: totalInUzs,
      cashOutUzs: totalOutUzs,
      cashNetUzs: totalInUzs - totalOutUzs,
      depositInUzs: Number.parseInt(String(summaryRow.deposit_in_uzs || 0), 10) || 0,
      depositOutUzs: Number.parseInt(String(summaryRow.deposit_out_uzs || 0), 10) || 0,
      refundUzs: Number.parseInt(String(summaryRow.refund_uzs || 0), 10) || 0,
      transactionCount: Number.parseInt(String(summaryRow.transaction_count || 0), 10) || 0,
      ticketCount: Number.parseInt(String(summaryRow.ticket_count || 0), 10) || 0
    },
    byService: byServiceResult.rows.map(mapReportRow),
    bySpecialist: bySpecialistResult.rows.map(mapReportRow),
    byDepartment: byDepartmentResult.rows.map(mapReportRow),
    byClient: byClientResult.rows.map(mapReportRow),
    byCashier: byCashierResult.rows.map(mapReportRow),
    byPaymentMethod: byPaymentMethodResult.rows.map(mapReportRow),
    byDay: byDayResult.rows.map(mapReportRow),
    details: detailsResult.rows.map(mapFinanceReportDetail)
  };
}

export async function getFinanceClientBalances({ organizationId, filters = {} }) {
  const client = normalizeText(filters.client, 96).toLowerCase();
  const clientIds = normalizeIdList(filters.clientIds ?? filters.client_ids, 100);
  const type = String(filters.type || "all").trim().toLowerCase();
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize ?? filters.page_size, 20);
  const offset = (page - 1) * pageSize;
  const params = [organizationId];
  const where = ["c.organization_id = $1"];

  if (clientIds.length > 0) {
    params.push(clientIds);
    where.push(`c.id = ANY($${params.length}::int[])`);
  }

  if (client) {
    params.push(`%${client}%`);
    params.push(client);
    where.push(`(
      LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $${params.length - 1}
      OR c.id::text = $${params.length}
      OR COALESCE(c.phone_number, '') LIKE $${params.length - 1}
    )`);
  }

  const hasExplicitClientLookup = Boolean(client) || clientIds.length > 0;
  const having = [];
  if (type === "debt") {
    having.push("COALESCE(debt_uzs, 0) > 0");
  } else if (type === "deposit") {
    having.push("COALESCE(deposit_uzs, 0) > 0");
  } else if (type === "active" && !hasExplicitClientLookup) {
    having.push("(COALESCE(debt_uzs, 0) > 0 OR COALESCE(deposit_uzs, 0) > 0)");
  } else if (!hasExplicitClientLookup) {
    having.push("(COALESCE(debt_uzs, 0) > 0 OR COALESCE(deposit_uzs, 0) > 0)");
  }

  const whereSql = where.join(" AND ");
  const havingSql = having.length > 0 ? `WHERE ${having.join(" AND ")}` : "";
  const baseSql = `
    FROM (
      SELECT c.id AS client_id,
             CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
             c.phone_number,
             COALESCE(debt.debt_uzs, 0) AS debt_uzs,
             COALESCE(deposit.deposit_uzs, 0) AS deposit_uzs
        FROM clients c
        LEFT JOIN (
          SELECT ft.client_id,
                 SUM(GREATEST(
                   COALESCE(ft.total_uzs, ft.amount_uzs, 0) - COALESCE(fpaid.paid_amount_uzs, 0),
                   0
                 )) AS debt_uzs
            FROM finance_tickets ft
            LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(CASE
                       WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
                       WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
                       ELSE 0
                     END), 0) AS paid_amount_uzs
                FROM finance_transactions t
               WHERE t.organization_id = ft.organization_id
                 AND t.ticket_id = ft.id
                 AND t.status = 'posted'
                 AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
            ) fpaid ON TRUE
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
       WHERE ${whereSql}
    ) balances
    ${havingSql}`;

  const countResult = await pool.query(`SELECT COUNT(*) AS total ${baseSql}`, params);
  const total = Number.parseInt(String(countResult.rows[0]?.total || "0"), 10) || 0;
  const listParams = [...params, pageSize, offset];
  const result = await pool.query(
    `SELECT *
       ${baseSql}
      ORDER BY debt_uzs DESC, deposit_uzs DESC, client_name ASC, client_id ASC
      LIMIT $${listParams.length - 1}
     OFFSET $${listParams.length}`,
    listParams
  );

  return {
    items: result.rows.map(mapClientBalance),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

async function getClientDepositBalance(db, { organizationId, clientId }) {
  const result = await db.query(
    `SELECT COALESCE(SUM(CASE
              WHEN transaction_type = 'deposit_in' AND direction = 'in' THEN amount_uzs
              WHEN transaction_type = 'deposit_out' AND direction = 'out' THEN -amount_uzs
              WHEN transaction_type = 'deposit_ticket_payment' AND direction = 'transfer' THEN -amount_uzs
              WHEN transaction_type = 'deposit_ticket_refund' AND direction = 'transfer' THEN amount_uzs
              ELSE 0
            END), 0) AS deposit_uzs
       FROM finance_transactions
      WHERE organization_id = $1
        AND client_id = $2
        AND status = 'posted'
        AND transaction_type IN ('deposit_in', 'deposit_out', 'deposit_ticket_payment', 'deposit_ticket_refund')`,
    [organizationId, clientId]
  );
  return parseIntegerAmount(result.rows[0]?.deposit_uzs, 0);
}

async function getActivePaymentMethod(db, { organizationId, paymentMethodId }) {
  const result = await db.query(
    `SELECT id, name
       FROM finance_payment_methods
      WHERE organization_id = $1
        AND id = $2
        AND is_active = TRUE
      LIMIT 1`,
    [organizationId, paymentMethodId]
  );
  return result.rows[0] || null;
}

async function assertFinanceClientExists(db, { organizationId, clientId }) {
  const result = await db.query(
    `SELECT id
       FROM clients
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1`,
    [organizationId, clientId]
  );
  if (!result.rows[0]) {
    const error = new Error("Client not found.");
    error.statusCode = 404;
    throw error;
  }
}

async function createFinanceDepositTransaction({
  organizationId,
  payload,
  actorUserId,
  transactionType,
  direction,
  metadataSource,
  requireReason = false
}) {
  const clientId = parsePositiveInteger(payload?.clientId ?? payload?.client_id);
  const paymentMethodId = parsePositiveInteger(payload?.paymentMethodId ?? payload?.payment_method_id);
  const amountUzs = normalizeAmount(payload?.amountUzs ?? payload?.amount_uzs, 0);
  const note = normalizeText(payload?.reason ?? payload?.note);
  if (!clientId) {
    const error = new Error("Client is required.");
    error.statusCode = 400;
    throw error;
  }
  if (!paymentMethodId) {
    const error = new Error("Payment method is required.");
    error.statusCode = 400;
    throw error;
  }
  if (amountUzs <= 0) {
    const error = new Error("Payment amount is required.");
    error.statusCode = 400;
    throw error;
  }
  if (requireReason && !note) {
    const error = new Error("Refund reason is required.");
    error.statusCode = 400;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await lockClientFinanceBalance(db, { organizationId, clientId });
    await assertFinanceClientExists(db, { organizationId, clientId });

    const method = await getActivePaymentMethod(db, { organizationId, paymentMethodId });
    if (!method) {
      const error = new Error("Payment method not found.");
      error.statusCode = 400;
      throw error;
    }

    if (transactionType === "deposit_out") {
      const currentDeposit = await getClientDepositBalance(db, { organizationId, clientId });
      if (amountUzs > currentDeposit) {
        const error = new Error("Refund amount exceeds client deposit.");
        error.statusCode = 400;
        throw error;
      }
    }

    const cashSession = await getOpenCashSession(db, {
      organizationId,
      cashierUserId: actorUserId,
      forUpdate: true
    });
    if (!cashSession) {
      const error = new Error("Cash session is required.");
      error.statusCode = 400;
      throw error;
    }

    const transaction = await insertFinanceTransaction(db, {
      organizationId,
      cashSessionId: cashSession.id,
      transactionType,
      direction,
      clientId,
      ticketId: null,
      ticketPaymentId: null,
      paymentMethodId,
      amountUzs,
      note,
      metadata: {
        source: metadataSource,
        paymentMethodName: method.name || ""
      },
      actorUserId
    });
    await db.query("COMMIT");
    return { item: mapTransaction(transaction) };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export async function topUpFinanceClientDeposit({ organizationId, payload, actorUserId }) {
  return createFinanceDepositTransaction({
    organizationId,
    payload,
    actorUserId,
    transactionType: "deposit_in",
    direction: "in",
    metadataSource: "client_deposit_top_up"
  });
}

export async function refundFinanceClientDeposit({ organizationId, payload, actorUserId }) {
  return createFinanceDepositTransaction({
    organizationId,
    payload,
    actorUserId,
    transactionType: "deposit_out",
    direction: "out",
    metadataSource: "client_deposit_refund",
    requireReason: true
  });
}

export async function getFinanceClientDebtTickets({ organizationId, clientId }) {
  const normalizedClientId = parsePositiveInteger(clientId);
  if (!normalizedClientId) {
    const error = new Error("Client is required.");
    error.statusCode = 400;
    throw error;
  }

  const result = await pool.query(
    `SELECT ft.id,
            ft.ticket_number,
            ft.ticket_date,
            ft.client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            ft.service_name,
            ft.amount_uzs,
            ft.total_uzs,
            COALESCE(fpaid.paid_amount_uzs, 0) AS paid_amount_uzs,
            ft.status
       FROM finance_tickets ft
       JOIN clients c ON c.organization_id = ft.organization_id AND c.id = ft.client_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(CASE
                  WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
                  WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
                  ELSE 0
                END), 0) AS paid_amount_uzs
           FROM finance_transactions t
          WHERE t.organization_id = ft.organization_id
            AND t.ticket_id = ft.id
            AND t.status = 'posted'
            AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
       ) fpaid ON TRUE
      WHERE ft.organization_id = $1
        AND ft.client_id = $2
        AND ft.status IN ('issued', 'unpaid')
      ORDER BY ft.ticket_date ASC, ft.id ASC`,
    [organizationId, normalizedClientId]
  );
  return { items: result.rows.map(mapClientDebtTicket) };
}

export async function getFinanceClientTransactions({ organizationId, clientId }) {
  const normalizedClientId = parsePositiveInteger(clientId);
  if (!normalizedClientId) {
    const error = new Error("Client is required.");
    error.statusCode = 400;
    throw error;
  }

  const clientResult = await pool.query(
    `SELECT id,
            CONCAT_WS(' ', last_name, first_name, middle_name) AS client_name,
            phone_number
       FROM clients
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1`,
    [organizationId, normalizedClientId]
  );
  const client = clientResult.rows[0];
  if (!client) {
    const error = new Error("Client not found.");
    error.statusCode = 404;
    throw error;
  }

  const transactionsResult = await pool.query(
    `SELECT t.id,
            t.cash_session_id,
            t.transaction_type,
            t.direction,
            t.status,
            t.client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            t.ticket_id,
            ft.ticket_number,
            COALESCE(NULLIF(TRIM(ticket_services.service_names), ''), ft.service_name) AS service_name,
            t.ticket_payment_id,
            t.payment_method_id,
            fpm.name AS payment_method_name,
            t.amount_uzs,
            t.transaction_at,
            t.note,
            t.metadata,
            t.voided_at,
            t.voided_by,
            s.cashier_user_id,
            COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '') AS cashier_name,
            t.created_at
       FROM finance_transactions t
       LEFT JOIN finance_cash_sessions s ON s.organization_id = t.organization_id AND s.id = t.cash_session_id
       LEFT JOIN clients c ON c.organization_id = t.organization_id AND c.id = t.client_id
       LEFT JOIN finance_tickets ft ON ft.organization_id = t.organization_id AND ft.id = t.ticket_id
       LEFT JOIN LATERAL (
         SELECT STRING_AGG(NULLIF(TRIM(fti.service_name), ''), ', ' ORDER BY fti.line_number, fti.id) AS service_names
           FROM finance_ticket_items fti
          WHERE fti.organization_id = ft.organization_id
            AND fti.ticket_id = ft.id
       ) ticket_services ON TRUE
       LEFT JOIN finance_payment_methods fpm ON fpm.organization_id = t.organization_id AND fpm.id = t.payment_method_id
       LEFT JOIN users cu ON cu.id = s.cashier_user_id
      WHERE t.organization_id = $1
        AND t.client_id = $2
      ORDER BY t.transaction_at ASC, t.id ASC`,
    [organizationId, normalizedClientId]
  );

  let runningDepositUzs = 0;
  const chronologicalItems = transactionsResult.rows.map((row) => {
    runningDepositUzs += getLedgerDepositChange(row);
    return mapClientLedgerTransaction(row, runningDepositUzs);
  });
  const postedItems = chronologicalItems.filter((item) => item.status === "posted");

  const debtResult = await pool.query(
    `SELECT COALESCE(SUM(GREATEST(
              COALESCE(ft.total_uzs, ft.amount_uzs, 0) - COALESCE(fpaid.paid_amount_uzs, 0),
              0
            )), 0) AS debt_uzs
       FROM finance_tickets ft
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(CASE
                  WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
                  WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
                  ELSE 0
                END), 0) AS paid_amount_uzs
           FROM finance_transactions t
          WHERE t.organization_id = ft.organization_id
            AND t.ticket_id = ft.id
            AND t.status = 'posted'
            AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
       ) fpaid ON TRUE
      WHERE ft.organization_id = $1
        AND ft.client_id = $2
        AND ft.status IN ('issued', 'unpaid')`,
    [organizationId, normalizedClientId]
  );

  const sumByType = (types) => postedItems.reduce((sum, item) => (
    types.includes(item.transactionType) ? sum + normalizeAmount(item.amountUzs, 0) : sum
  ), 0);

  return {
    client: {
      clientId: client.id,
      clientName: client.client_name || "",
      phone: client.phone_number || ""
    },
    summary: {
      transactionCount: chronologicalItems.length,
      postedTransactionCount: postedItems.length,
      cashInUzs: postedItems.reduce((sum, item) => sum + normalizeAmount(item.cashInUzs, 0), 0),
      cashOutUzs: postedItems.reduce((sum, item) => sum + normalizeAmount(item.cashOutUzs, 0), 0),
      depositInUzs: sumByType(["deposit_in"]),
      depositOutUzs: sumByType(["deposit_out"]),
      depositUsedUzs: sumByType(["deposit_ticket_payment"]),
      depositRefundUzs: sumByType(["deposit_ticket_refund"]),
      ticketPaidUzs: sumByType(["ticket_payment", "deposit_ticket_payment"]),
      refundUzs: sumByType(["refund", "deposit_ticket_refund"]),
      depositUzs: runningDepositUzs,
      debtUzs: normalizeAmount(debtResult.rows[0]?.debt_uzs, 0)
    },
    items: chronologicalItems.reverse()
  };
}

export async function payFinanceTicketsFromDeposit({ organizationId, payload, actorUserId }) {
  const clientId = parsePositiveInteger(payload?.clientId ?? payload?.client_id);
  const ticketIds = Array.from(new Set(
    (payload?.ticketIds ?? payload?.ticket_ids ?? [])
      .map((item) => parsePositiveInteger(item))
      .filter(Boolean)
  ));
  const note = normalizeText(payload?.note);
  if (!clientId) {
    const error = new Error("Client is required.");
    error.statusCode = 400;
    throw error;
  }
  if (ticketIds.length === 0) {
    const error = new Error("Select at least one ticket.");
    error.statusCode = 400;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await lockClientFinanceBalance(db, { organizationId, clientId });

    const cashSession = await getOpenCashSession(db, {
      organizationId,
      cashierUserId: actorUserId,
      forUpdate: true
    });
    if (!cashSession) {
      const error = new Error("Cash session is required.");
      error.statusCode = 400;
      throw error;
    }

    const ticketsResult = await db.query(
      `SELECT ft.*,
              COALESCE(fpaid.paid_amount_uzs, 0) AS paid_amount_uzs
         FROM finance_tickets ft
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(CASE
                    WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
                    WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
                    ELSE 0
                  END), 0) AS paid_amount_uzs
             FROM finance_transactions t
            WHERE t.organization_id = ft.organization_id
              AND t.ticket_id = ft.id
              AND t.status = 'posted'
              AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
         ) fpaid ON TRUE
        WHERE ft.organization_id = $1
          AND ft.client_id = $2
          AND ft.id = ANY($3::bigint[])
          AND ft.status IN ('issued', 'unpaid')
        ORDER BY ft.ticket_date ASC, ft.id ASC
        FOR UPDATE OF ft`,
      [organizationId, clientId, ticketIds]
    );
    if (ticketsResult.rows.length !== ticketIds.length) {
      const error = new Error("Selected tickets are not payable.");
      error.statusCode = 400;
      throw error;
    }

    const tickets = ticketsResult.rows.map((ticket) => ({
      ...ticket,
      totalAmountUzs: normalizeAmount(ticket.total_uzs ?? ticket.amount_uzs, 0),
      paidAmountUzs: normalizeAmount(ticket.paid_amount_uzs, 0),
      payableAmountUzs: Math.max(
        normalizeAmount(ticket.total_uzs ?? ticket.amount_uzs, 0) - normalizeAmount(ticket.paid_amount_uzs, 0),
        0
      )
    }));
    const totalAmountUzs = tickets.reduce((sum, ticket) => sum + ticket.payableAmountUzs, 0);
    if (totalAmountUzs <= 0) {
      const error = new Error("Payment amount is required.");
      error.statusCode = 400;
      throw error;
    }

    const currentDeposit = await getClientDepositBalance(db, { organizationId, clientId });
    if (totalAmountUzs > currentDeposit) {
      const error = new Error("Deposit balance is not enough.");
      error.statusCode = 400;
      throw error;
    }

    const paidTickets = [];
    for (const ticket of tickets) {
      const amountUzs = ticket.payableAmountUzs;
      const paymentResult = await db.query(
        `INSERT INTO finance_ticket_payments (
           organization_id, ticket_id, payment_method_id, amount_uzs, note, created_by
         )
         VALUES ($1, $2, NULL, $3, $4, $5)
         RETURNING id`,
        [organizationId, ticket.id, amountUzs, note || null, actorUserId || null]
      );
      const paymentId = paymentResult.rows[0]?.id || null;

      await insertFinanceTransaction(db, {
        organizationId,
        cashSessionId: cashSession.id,
        transactionType: "deposit_ticket_payment",
        direction: "transfer",
        clientId,
        ticketId: ticket.id,
        ticketPaymentId: paymentId,
        paymentMethodId: null,
        amountUzs,
        note,
        metadata: {
          ticketNumber: ticket.ticket_number,
          source: "deposit_ticket_payment"
        },
        actorUserId
      });

      const updatedResult = await db.query(
        `UPDATE finance_tickets
            SET status = 'paid',
                updated_by = $3,
                updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $1
            AND id = $2
          RETURNING *`,
        [organizationId, ticket.id, actorUserId || null]
      );
      await insertHistory(db, {
        organizationId,
        ticketId: ticket.id,
        action: "paid_from_deposit",
        fromStatus: ticket.status,
        toStatus: "paid",
        details: {
          amountUzs,
          paidAmountUzs: ticket.paidAmountUzs + amountUzs,
          remainingAmountUzs: 0,
          cashSessionId: cashSession.id,
          paymentId
        },
        actorUserId
      });
      paidTickets.push(updatedResult.rows[0]);
    }

    await db.query("COMMIT");
    return {
      items: paidTickets.map(mapTicket),
      totalAmountUzs
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

async function getAppointmentForTicket(db, { organizationId, appointmentScheduleId, forUpdate = false }) {
  const result = await db.query(
    `SELECT id,
            organization_id,
            specialist_id,
            client_id,
            service_id,
            service_name,
            service_price_uzs,
            appointment_date,
            start_time,
            end_time,
            duration_minutes,
            note,
            status
       FROM appointment_schedules
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [organizationId, appointmentScheduleId]
  );
  return result.rows[0] || null;
}

async function syncAppointmentTicketService(db, { organizationId, actorUserId, appointmentScheduleId, item }) {
  const appointment = await getAppointmentForTicket(db, {
    organizationId,
    appointmentScheduleId,
    forUpdate: true
  });
  if (!appointment) {
    const error = new Error("Appointment not found.");
    error.statusCode = 404;
    throw error;
  }

  const appointmentSpecialistId = parsePositiveInteger(appointment.specialist_id);
  const itemSpecialistId = parsePositiveInteger(item?.specialistId);
  if (appointmentSpecialistId !== itemSpecialistId) {
    const error = new Error("Appointment ticket specialist cannot be changed.");
    error.statusCode = 400;
    throw error;
  }

  const nextServiceId = parsePositiveInteger(item?.serviceId) || null;
  const nextServiceName = normalizeText(item?.serviceName, 128);
  const nextServicePriceUzs = normalizeAmount(item?.priceUzs, 0);
  const currentServiceId = parsePositiveInteger(appointment.service_id) || null;
  const currentServiceName = normalizeText(appointment.service_name, 128);
  const currentServicePriceUzs = normalizeAmount(appointment.service_price_uzs, 0);

  if (
    currentServiceId === nextServiceId
    && currentServiceName === nextServiceName
    && currentServicePriceUzs === nextServicePriceUzs
  ) {
    return;
  }

  await updateAppointmentSchedulesByIds({
    db,
    organizationId,
    actorUserId,
    ids: [appointment.id],
    specialistId: appointment.specialist_id,
    clientId: appointment.client_id,
    appointmentDate: normalizeDate(appointment.appointment_date),
    startTime: appointment.start_time,
    endTime: appointment.end_time,
    durationMinutes: appointment.duration_minutes,
    serviceId: nextServiceId,
    serviceName: nextServiceName,
    servicePriceUzs: nextServicePriceUzs,
    status: appointment.status,
    note: appointment.note || "",
    applyAppointmentDate: false,
    activateClient: false
  });
}

async function getTicketById(db, { organizationId, id, forUpdate = false }) {
  const result = await db.query(
    `SELECT *
       FROM finance_tickets
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [organizationId, id]
  );
  return result.rows[0] || null;
}

async function hydrateHistoryItems(db, { organizationId, items }) {
  const specialistIds = Array.from(new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => parsePositiveInteger(item?.specialistId ?? item?.specialist_id))
      .filter(Boolean)
  ));
  const specialists = new Map();
  if (specialistIds.length > 0) {
    const result = await db.query(
      `SELECT u.id,
              COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('User #', u.id::text)) AS specialist_name,
              p.label AS position_label
         FROM users u
         LEFT JOIN position_options p ON p.organization_id = u.organization_id AND p.id = u.position_id
        WHERE u.organization_id = $1
          AND u.id = ANY($2::int[])`,
      [organizationId, specialistIds]
    );
    result.rows.forEach((row) => {
      specialists.set(String(row.id), row);
    });
  }
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const specialistId = parsePositiveInteger(item?.specialistId ?? item?.specialist_id);
    const specialist = specialists.get(String(specialistId)) || {};
    return {
      lineNumber: Number.parseInt(String(item?.lineNumber ?? item?.line_number ?? index + 1), 10) || index + 1,
      specialistId: specialistId || null,
      specialistName: specialist.specialist_name || item?.specialistName || "",
      positionLabel: specialist.position_label || item?.positionLabel || "",
      serviceId: parsePositiveInteger(item?.serviceId ?? item?.service_id) || null,
      serviceName: item?.serviceName ?? item?.service_name ?? "",
      priceUzs: normalizeAmount(item?.priceUzs ?? item?.price_uzs, 0),
      discountType: normalizeDiscountType(item?.discountType ?? item?.discount_type),
      discountValue: normalizeAmount(item?.discountValue ?? item?.discount_value, 0),
      discountUzs: normalizeAmount(item?.discountUzs ?? item?.discount_uzs, 0),
      finalAmountUzs: normalizeAmount(item?.finalAmountUzs ?? item?.final_amount_uzs, 0)
    };
  });
}

async function getTicketHistorySnapshot(db, { organizationId, ticketId }) {
  const result = await db.query(
    `SELECT ft.id,
            ft.ticket_number,
            ft.ticket_date,
            ft.source,
            ft.appointment_schedule_id,
            ft.client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            ft.subtotal_uzs,
            ft.discount_uzs,
            ft.total_uzs,
            ft.amount_uzs,
            ft.status,
            ft.note,
            COALESCE(
              json_agg(
                json_build_object(
                  'lineNumber', fti.line_number,
                  'specialistId', fti.specialist_id,
                  'specialistName', COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), ''),
                  'positionLabel', p.label,
                  'serviceId', fti.service_id,
                  'serviceName', fti.service_name,
                  'priceUzs', fti.price_uzs,
                  'discountType', fti.discount_type,
                  'discountValue', fti.discount_value,
                  'discountUzs', fti.discount_uzs,
                  'finalAmountUzs', fti.final_amount_uzs
                )
                ORDER BY fti.line_number ASC, fti.id ASC
              ) FILTER (WHERE fti.id IS NOT NULL),
              '[]'::json
            ) AS items
       FROM finance_tickets ft
       JOIN clients c ON c.organization_id = ft.organization_id AND c.id = ft.client_id
       LEFT JOIN finance_ticket_items fti ON fti.organization_id = ft.organization_id AND fti.ticket_id = ft.id
       LEFT JOIN users u ON u.organization_id = fti.organization_id AND u.id = fti.specialist_id
       LEFT JOIN position_options p ON p.organization_id = u.organization_id AND p.id = u.position_id
      WHERE ft.organization_id = $1
        AND ft.id = $2
      GROUP BY ft.id, c.last_name, c.first_name, c.middle_name
      LIMIT 1`,
    [organizationId, ticketId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ticketNumber: row.ticket_number,
    ticketDate: normalizeDate(row.ticket_date),
    source: row.source,
    appointmentScheduleId: row.appointment_schedule_id,
    clientId: row.client_id,
    clientName: row.client_name,
    status: row.status,
    note: row.note || "",
    totals: {
      subtotalUzs: row.subtotal_uzs ?? row.amount_uzs,
      discountUzs: row.discount_uzs ?? 0,
      totalUzs: row.total_uzs ?? row.amount_uzs
    },
    items: Array.isArray(row.items) ? row.items : []
  };
}

async function getServiceById(db, { organizationId, serviceId }) {
  const result = await db.query(
    `SELECT sc.id,
            sc.name,
            sc.price_uzs,
            sc.position_id
       FROM service_catalog sc
      WHERE sc.organization_id = $1
        AND sc.id = $2
        AND sc.is_active = TRUE
      LIMIT 1`,
    [organizationId, serviceId]
  );
  return result.rows[0] || null;
}

async function buildTicketItems(db, { organizationId, payload, appointment, fallbackServiceName, fallbackAmount }) {
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  if (rawItems.length > 0) {
    const items = [];
    for (const rawItem of rawItems.slice(0, 20)) {
      const serviceId = parsePositiveInteger(rawItem?.serviceId ?? rawItem?.service_id);
      const specialistId = parsePositiveInteger(rawItem?.specialistId ?? rawItem?.specialist_id);
      if (!serviceId) {
        const error = new Error("Service is required.");
        error.statusCode = 400;
        throw error;
      }
      const service = await getServiceById(db, { organizationId, serviceId });
      if (!service) {
        const error = new Error("Service not found.");
        error.statusCode = 404;
        throw error;
      }
      const requestedPriceUzs = normalizeAmount(rawItem?.priceUzs ?? rawItem?.price_uzs ?? rawItem?.amountUzs ?? rawItem?.amount_uzs, 0);
      const priceUzs = requestedPriceUzs > 0 ? requestedPriceUzs : normalizeAmount(service.price_uzs, 0);
      if (priceUzs <= 0) {
        const error = new Error("Service price is required.");
        error.statusCode = 400;
        throw error;
      }
      const discountType = normalizeDiscountType(rawItem?.discountType ?? rawItem?.discount_type);
      const discountValue = normalizeAmount(rawItem?.discountValue ?? rawItem?.discount_value, 0);
      const requestedDiscountUzs = normalizeAmount(rawItem?.discountUzs ?? rawItem?.discount_uzs, -1);
      const discountUzs = requestedDiscountUzs >= 0
        ? Math.min(priceUzs, requestedDiscountUzs)
        : calculateDiscountUzs({ priceUzs, discountType, discountValue });
      const submittedServiceName = normalizeText(rawItem?.serviceName ?? rawItem?.service_name, 128);
      const itemServiceName = appointment
        ? (submittedServiceName || normalizeText(appointment.service_name, 128) || normalizeText(service.name, 128))
        : normalizeText(service.name, 128);
      items.push({
        specialistId: specialistId || null,
        serviceId,
        serviceName: itemServiceName,
        priceUzs,
        discountType,
        discountValue,
        discountUzs,
        finalAmountUzs: Math.max(priceUzs - discountUzs, 0)
      });
    }
    return items;
  }

  const serviceId = parsePositiveInteger(payload?.serviceId ?? payload?.service_id) || appointment?.service_id || null;
  const specialistId = appointment?.specialist_id || parsePositiveInteger(payload?.specialistId ?? payload?.specialist_id) || null;
  let serviceName = normalizeText(fallbackServiceName, 128);
  let priceUzs = normalizeAmount(fallbackAmount, 0);
  if (serviceId) {
    const service = await getServiceById(db, { organizationId, serviceId });
    if (service) {
      serviceName = normalizeText(service.name, 128);
      priceUzs = normalizeAmount(service.price_uzs, 0);
    } else if (!appointment) {
      const error = new Error("Service not found.");
      error.statusCode = 404;
      throw error;
    }
  }
  if (!serviceName) {
    const error = new Error("Service name is required.");
    error.statusCode = 400;
    throw error;
  }
  if (priceUzs <= 0) {
    const error = new Error("Ticket amount is required.");
    error.statusCode = 400;
    throw error;
  }

  return [{
    specialistId,
    serviceId,
    serviceName,
    priceUzs,
    discountType: "amount",
    discountValue: 0,
    discountUzs: 0,
    finalAmountUzs: priceUzs
  }];
}

function getTicketTotals(items) {
  const subtotalUzs = items.reduce((sum, item) => sum + normalizeAmount(item.priceUzs, 0), 0);
  const discountUzs = items.reduce((sum, item) => sum + normalizeAmount(item.discountUzs, 0), 0);
  const totalUzs = Math.max(subtotalUzs - discountUzs, 0);
  return { subtotalUzs, discountUzs, totalUzs };
}

async function insertTicketItems(db, { organizationId, ticketId, items }) {
  for (const [index, item] of items.entries()) {
    await db.query(
      `INSERT INTO finance_ticket_items (
         organization_id, ticket_id, line_number, specialist_id, service_id,
         service_name, price_uzs, discount_type, discount_value, discount_uzs, final_amount_uzs
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        organizationId,
        ticketId,
        index + 1,
        item.specialistId || null,
        item.serviceId || null,
        item.serviceName,
        item.priceUzs,
        item.discountType,
        item.discountValue,
        item.discountUzs,
        item.finalAmountUzs
      ]
    );
  }
}

export async function createFinanceTicket({ organizationId, payload, actorUserId }) {
  const appointmentScheduleId = parsePositiveInteger(payload?.appointmentScheduleId ?? payload?.appointment_schedule_id);
  const clientId = parsePositiveInteger(payload?.clientId ?? payload?.client_id);
  const requestedAmount = normalizeAmount(payload?.amountUzs ?? payload?.amount_uzs, 0);
  const ticketDateFromPayload = normalizeDate(payload?.ticketDate ?? payload?.ticket_date);
  const note = normalizeText(payload?.note);

  const db = await pool.connect();
  try {
    await db.query("BEGIN");

    let source = "manual";
    let appointment = null;
    let ticketClientId = clientId;
    let ticketSpecialistId = null;
    let ticketServiceId = parsePositiveInteger(payload?.serviceId ?? payload?.service_id) || null;
    let serviceName = normalizeText(payload?.serviceName ?? payload?.service_name, 128);
    let amountUzs = requestedAmount;
    let ticketDate = ticketDateFromPayload;

    if (appointmentScheduleId) {
      source = "appointment";
      appointment = await getAppointmentForTicket(db, { organizationId, appointmentScheduleId, forUpdate: true });
      if (!appointment) {
        const error = new Error("Appointment not found.");
        error.statusCode = 404;
        throw error;
      }
      if (!["pending", "confirmed"].includes(appointment.status)) {
        const error = new Error("Only pending or confirmed appointments can become tickets.");
        error.statusCode = 400;
        throw error;
      }
      const appointmentDate = normalizeDate(appointment.appointment_date);
      if (appointment.status === "pending" && appointmentDate && appointmentDate > getTodayYmdInTashkent()) {
        const error = new Error(`Future appointments cannot be confirmed. Requested date: ${appointmentDate}.`);
        error.statusCode = 400;
        throw error;
      }
      ticketClientId = appointment.client_id;
      ticketSpecialistId = appointment.specialist_id;
      ticketServiceId = appointment.service_id || null;
      serviceName = normalizeText(appointment.service_name, 128);
      amountUzs = requestedAmount > 0 ? requestedAmount : normalizeAmount(appointment.service_price_uzs, 0);
      ticketDate = appointmentDate || ticketDate;
    }
    ticketDate = ticketDate || getTodayYmdInTashkent();
    assertTicketDateIsNotFuture(ticketDate);

    if (!ticketClientId) {
      const error = new Error("Client is required.");
      error.statusCode = 400;
      throw error;
    }
    const clientResult = await db.query(
      `SELECT id
         FROM clients
        WHERE organization_id = $1
          AND id = $2
        LIMIT 1`,
      [organizationId, ticketClientId]
    );
    if (!clientResult.rows[0]) {
      const error = new Error("Client not found.");
      error.statusCode = 404;
      throw error;
    }
    const items = await buildTicketItems(db, {
      organizationId,
      payload,
      appointment,
      fallbackServiceName: serviceName,
      fallbackAmount: amountUzs
    });
    const totals = getTicketTotals(items);
    if (totals.totalUzs <= 0) {
      const error = new Error("Ticket amount is required.");
      error.statusCode = 400;
      throw error;
    }
    const firstItem = items[0];
    ticketSpecialistId = ticketSpecialistId || firstItem.specialistId || null;
    ticketServiceId = firstItem.serviceId || ticketServiceId || null;
    serviceName = firstItem.serviceName;
    amountUzs = totals.totalUzs;
    if (appointmentScheduleId && appointment) {
      const nextServiceId = parsePositiveInteger(firstItem.serviceId) || null;
      const nextServiceName = normalizeText(firstItem.serviceName, 128);
      const nextServicePriceUzs = normalizeAmount(firstItem.priceUzs, 0);
      const currentServiceId = parsePositiveInteger(appointment.service_id) || null;
      const currentServiceName = normalizeText(appointment.service_name, 128);
      const currentServicePriceUzs = normalizeAmount(appointment.service_price_uzs, 0);
      const shouldConfirmAppointment = appointment.status === "pending";
      const shouldSyncService = (
        currentServiceId !== nextServiceId
        || currentServiceName !== nextServiceName
        || currentServicePriceUzs !== nextServicePriceUzs
      );
      if (shouldConfirmAppointment || shouldSyncService) {
        await updateAppointmentSchedulesByIds({
          db,
          organizationId,
          actorUserId,
          ids: [appointment.id],
          specialistId: appointment.specialist_id,
          clientId: appointment.client_id,
          appointmentDate: normalizeDate(appointment.appointment_date),
          startTime: appointment.start_time,
          endTime: appointment.end_time,
          durationMinutes: appointment.duration_minutes,
          serviceId: nextServiceId,
          serviceName: nextServiceName,
          servicePriceUzs: nextServicePriceUzs,
          status: shouldConfirmAppointment ? "confirmed" : appointment.status,
          note: appointment.note || "",
          applyAppointmentDate: false,
          activateClient: false
        });
      }
    }
    const ticketNumber = await getNextTicketNumber(db, organizationId);

    const insertResult = await db.query(
      `INSERT INTO finance_tickets (
         organization_id, ticket_number, ticket_date, source, appointment_schedule_id,
         client_id, specialist_id, service_id, service_name, amount_uzs,
         subtotal_uzs, discount_uzs, total_uzs, status, note, created_by, updated_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'issued', $14, $15, $15)
       RETURNING *`,
      [
        organizationId,
        ticketNumber,
        ticketDate,
        source,
        appointmentScheduleId || null,
        ticketClientId,
        ticketSpecialistId,
        ticketServiceId,
        serviceName,
        amountUzs,
        totals.subtotalUzs,
        totals.discountUzs,
        totals.totalUzs,
        note || null,
        actorUserId || null
      ]
    );
    const ticket = insertResult.rows[0];
    await insertTicketItems(db, { organizationId, ticketId: ticket.id, items });
    const historyItems = await hydrateHistoryItems(db, { organizationId, items });
    await insertHistory(db, {
      organizationId,
      ticketId: ticket.id,
      action: "created",
      toStatus: ticket.status,
      details: {
        source,
        appointmentScheduleId: appointmentScheduleId || null,
        ticketNumber,
        ticketDate,
        note,
        totals,
        items: historyItems
      },
      actorUserId
    });
    await db.query("COMMIT");
    return ticket;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    if (error?.code === "23505") {
      const duplicate = new Error("Ticket already exists for this appointment.");
      duplicate.statusCode = 409;
      throw duplicate;
    }
    throw error;
  } finally {
    db.release();
  }
}

export async function updateFinanceTicket({ organizationId, id, payload, actorUserId }) {
  const ticketId = parsePositiveInteger(id);
  const hasTicketDate = payload?.ticketDate !== undefined || payload?.ticket_date !== undefined;
  const ticketDate = hasTicketDate ? normalizeDate(payload?.ticketDate ?? payload?.ticket_date) : null;
  const hasClientId = payload?.clientId !== undefined || payload?.client_id !== undefined;
  const clientId = hasClientId ? parsePositiveInteger(payload?.clientId ?? payload?.client_id) : null;
  const hasItems = Array.isArray(payload?.items);
  const amountUzs = payload?.amountUzs !== undefined || payload?.amount_uzs !== undefined
    ? normalizeAmount(payload?.amountUzs ?? payload?.amount_uzs, -1)
    : null;
  const note = payload?.note !== undefined ? normalizeText(payload.note) : null;
  const reason = normalizeText(payload?.reason ?? payload?.changeReason ?? payload?.change_reason);
  if (!ticketId) {
    const error = new Error("Ticket not found.");
    error.statusCode = 404;
    throw error;
  }
  if (!reason) {
    const error = new Error("Change reason is required.");
    error.statusCode = 400;
    throw error;
  }
  if (hasTicketDate && !ticketDate) {
    const error = new Error("Ticket date is required.");
    error.statusCode = 400;
    throw error;
  }
  if (hasTicketDate) {
    assertTicketDateIsNotFuture(ticketDate);
  }
  if (hasClientId && !clientId) {
    const error = new Error("Client is required.");
    error.statusCode = 400;
    throw error;
  }
  if (amountUzs !== null && amountUzs <= 0) {
    const error = new Error("Ticket amount is required.");
    error.statusCode = 400;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const current = await getTicketById(db, { organizationId, id: ticketId, forUpdate: true });
    if (!current) {
      const error = new Error("Ticket not found.");
      error.statusCode = 404;
      throw error;
    }
    if (current.status === "paid" || current.status === "voided") {
      const error = new Error("Paid or voided tickets cannot be edited.");
      error.statusCode = 400;
      throw error;
    }
    const paymentActivityCount = await getTicketPostedPaymentActivityCount(db, { organizationId, ticketId });
    if (paymentActivityCount > 0) {
      const error = new Error("Tickets with payments cannot be edited.");
      error.statusCode = 400;
      throw error;
    }
    const beforeSnapshot = await getTicketHistorySnapshot(db, { organizationId, ticketId });
    const nextClientId = hasClientId ? clientId : current.client_id;
    const isAppointmentTicket = current.source === "appointment" || Boolean(current.appointment_schedule_id);
    const currentClientId = parsePositiveInteger(current.client_id);
    if (hasClientId && clientId !== currentClientId) {
      const error = new Error("Ticket client cannot be changed.");
      error.statusCode = 400;
      throw error;
    }
    const currentTicketDate = normalizeDate(current.ticket_date);
    if (isAppointmentTicket && hasTicketDate && ticketDate !== currentTicketDate) {
      const error = new Error("Appointment ticket date cannot be changed.");
      error.statusCode = 400;
      throw error;
    }
    if (hasClientId) {
      const clientResult = await db.query(
        `SELECT id
           FROM clients
          WHERE organization_id = $1
            AND id = $2
          LIMIT 1`,
        [organizationId, nextClientId]
      );
      if (!clientResult.rows[0]) {
        const error = new Error("Client not found.");
        error.statusCode = 404;
        throw error;
      }
    }

    let nextItems = null;
    let nextTotals = null;
    let nextSpecialistId = current.specialist_id;
    let nextServiceId = current.service_id;
    let nextServiceName = current.service_name;
    let nextAmountUzs = normalizeAmount(current.amount_uzs, 0);
    let nextSubtotalUzs = normalizeAmount(current.subtotal_uzs ?? current.amount_uzs, 0);
    let nextDiscountUzs = normalizeAmount(current.discount_uzs, 0);
    let nextTotalUzs = normalizeAmount(current.total_uzs ?? current.amount_uzs, 0);

    if (hasItems) {
      nextItems = await buildTicketItems(db, {
        organizationId,
        payload,
        appointment: null,
        fallbackServiceName: current.service_name,
        fallbackAmount: current.total_uzs ?? current.amount_uzs
      });
      nextTotals = getTicketTotals(nextItems);
      if (nextTotals.totalUzs <= 0) {
        const error = new Error("Ticket amount is required.");
        error.statusCode = 400;
        throw error;
      }
      if (isAppointmentTicket) {
        const beforeItems = Array.isArray(beforeSnapshot?.items) ? beforeSnapshot.items : [];
        const expectedItemCount = beforeItems.length > 0 ? beforeItems.length : 1;
        if (nextItems.length !== expectedItemCount) {
          const error = new Error("Appointment ticket line count cannot be changed.");
          error.statusCode = 400;
          throw error;
        }
        nextItems.forEach((item, index) => {
          const beforeItem = beforeItems[index] || {};
          const previousSpecialistId = parsePositiveInteger(
            beforeItem.specialistId ?? beforeItem.specialist_id ?? current.specialist_id
          );
          const nextSpecialistId = parsePositiveInteger(item.specialistId);
          if (nextSpecialistId !== previousSpecialistId) {
            const error = new Error("Appointment ticket specialist cannot be changed.");
            error.statusCode = 400;
            throw error;
          }
        });
      }
      const firstItem = nextItems[0];
      nextSpecialistId = firstItem.specialistId || null;
      nextServiceId = firstItem.serviceId || null;
      nextServiceName = firstItem.serviceName;
      nextAmountUzs = nextTotals.totalUzs;
      nextSubtotalUzs = nextTotals.subtotalUzs;
      nextDiscountUzs = nextTotals.discountUzs;
      nextTotalUzs = nextTotals.totalUzs;
    } else if (amountUzs !== null) {
      nextAmountUzs = amountUzs;
      nextSubtotalUzs = amountUzs;
      nextDiscountUzs = 0;
      nextTotalUzs = amountUzs;
      nextItems = [{
        specialistId: current.specialist_id || null,
        serviceId: current.service_id || null,
        serviceName: normalizeText(current.service_name, 128) || "Manual service",
        priceUzs: amountUzs,
        discountType: "amount",
        discountValue: 0,
        discountUzs: 0,
        finalAmountUzs: amountUzs
      }];
      nextTotals = getTicketTotals(nextItems);
    }

    const result = await db.query(
      `UPDATE finance_tickets
          SET ticket_date = $3,
              client_id = $4,
              specialist_id = $5,
              service_id = $6,
              service_name = $7,
              amount_uzs = $8,
              subtotal_uzs = $9,
              discount_uzs = $10,
              total_uzs = $11,
              note = $12,
              updated_by = $13,
              updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = $1
          AND id = $2
        RETURNING *`,
      [
        organizationId,
        ticketId,
        hasTicketDate ? ticketDate : current.ticket_date,
        nextClientId,
        nextSpecialistId,
        nextServiceId,
        nextServiceName,
        nextAmountUzs,
        nextSubtotalUzs,
        nextDiscountUzs,
        nextTotalUzs,
        payload?.note !== undefined ? (note || null) : current.note,
        actorUserId || null
      ]
    );
    if (nextItems) {
      await db.query(
        `DELETE FROM finance_ticket_items
          WHERE organization_id = $1
            AND ticket_id = $2`,
        [organizationId, ticketId]
      );
      await insertTicketItems(db, { organizationId, ticketId, items: nextItems });
      if (isAppointmentTicket) {
        const appointmentScheduleId = parsePositiveInteger(current.appointment_schedule_id);
        if (!appointmentScheduleId) {
          const error = new Error("Appointment not found.");
          error.statusCode = 404;
          throw error;
        }
        await syncAppointmentTicketService(db, {
          organizationId,
          actorUserId,
          appointmentScheduleId,
          item: nextItems[0]
        });
      }
    }
    const paidAmountUzs = await getTicketPaidAmount(db, { organizationId, ticketId });
    if (paidAmountUzs > nextTotalUzs) {
      const error = new Error("Ticket total cannot be less than paid amount.");
      error.statusCode = 400;
      throw error;
    }
    if (paidAmountUzs > 0 && paidAmountUzs >= nextTotalUzs && current.status !== "paid") {
      await db.query(
        `UPDATE finance_tickets
            SET status = 'paid',
                updated_by = $3,
                updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $1
            AND id = $2`,
        [organizationId, ticketId, actorUserId || null]
      );
      result.rows[0].status = "paid";
    }
    const afterSnapshot = await getTicketHistorySnapshot(db, { organizationId, ticketId });
    await insertHistory(db, {
      organizationId,
      ticketId,
      action: "updated",
      fromStatus: current.status,
      toStatus: result.rows[0]?.status || current.status,
      details: {
        ticketDate: hasTicketDate ? ticketDate : undefined,
        clientId: hasClientId ? nextClientId : undefined,
        amountUzs: amountUzs !== null ? amountUzs : undefined,
        note: payload?.note !== undefined ? note : undefined,
        reason,
        totals: nextTotals || undefined,
        items: nextItems ? await hydrateHistoryItems(db, { organizationId, items: nextItems }) : undefined,
        before: beforeSnapshot || undefined,
        after: afterSnapshot || undefined
      },
      actorUserId
    });
    await db.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export async function markFinanceTicketUnpaid({ organizationId, id, actorUserId }) {
  return updateTicketStatus({ organizationId, id, status: "unpaid", action: "marked_unpaid", actorUserId });
}

export async function voidFinanceTicket({ organizationId, id, payload, actorUserId }) {
  const reason = normalizeText(payload?.reason);
  if (!reason) {
    const error = new Error("Delete reason is required.");
    error.statusCode = 400;
    throw error;
  }
  return updateTicketStatus({ organizationId, id, status: "voided", action: "voided", reason, actorUserId });
}

async function updateTicketStatus({ organizationId, id, status, action, reason = "", actorUserId }) {
  const ticketId = parsePositiveInteger(id);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const current = await getTicketById(db, { organizationId, id: ticketId, forUpdate: true });
    if (!current) {
      const error = new Error("Ticket not found.");
      error.statusCode = 404;
      throw error;
    }
    if (current.status === "paid") {
      const error = new Error("Paid tickets cannot be changed.");
      error.statusCode = 400;
      throw error;
    }
    if (action === "voided") {
      const paymentActivityCount = await getTicketPostedPaymentActivityCount(db, { organizationId, ticketId });
      if (paymentActivityCount > 0) {
        const error = new Error("Tickets with payments cannot be deleted.");
        error.statusCode = 400;
        throw error;
      }
    }
    const beforeSnapshot = await getTicketHistorySnapshot(db, { organizationId, ticketId });
    const result = await db.query(
      `UPDATE finance_tickets
          SET status = $3,
              updated_by = $4,
              updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = $1
          AND id = $2
        RETURNING *`,
      [organizationId, ticketId, status, actorUserId || null]
    );
    await insertHistory(db, {
      organizationId,
      ticketId,
      action,
      fromStatus: current.status,
      toStatus: status,
      details: {
        reason: reason || undefined,
        before: beforeSnapshot || undefined,
        after: await getTicketHistorySnapshot(db, { organizationId, ticketId }) || undefined
      },
      actorUserId
    });
    await db.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export async function payFinanceTicket({ organizationId, id, payload, actorUserId }) {
  const ticketId = parsePositiveInteger(id);
  const paymentMethodId = parsePositiveInteger(payload?.paymentMethodId ?? payload?.payment_method_id);
  const requestedAmount = normalizeAmount(payload?.amountUzs ?? payload?.amount_uzs, 0);
  const note = normalizeText(payload?.note);
  if (!paymentMethodId) {
    const error = new Error("Payment method is required.");
    error.statusCode = 400;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const current = await getTicketById(db, { organizationId, id: ticketId, forUpdate: true });
    if (!current) {
      const error = new Error("Ticket not found.");
      error.statusCode = 404;
      throw error;
    }
    if (current.status === "paid" || current.status === "voided") {
      const error = new Error("Ticket cannot be paid in the current status.");
      error.statusCode = 400;
      throw error;
    }
    const methodResult = await db.query(
      `SELECT id, name
         FROM finance_payment_methods
        WHERE organization_id = $1
          AND id = $2
          AND is_active = TRUE
        LIMIT 1`,
      [organizationId, paymentMethodId]
    );
    if (!methodResult.rows[0]) {
      const error = new Error("Payment method not found.");
      error.statusCode = 400;
      throw error;
    }
    const paidResult = await db.query(
      `SELECT COALESCE(SUM(CASE
                WHEN transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN amount_uzs
                WHEN transaction_type IN ('refund', 'deposit_ticket_refund') THEN -amount_uzs
                ELSE 0
              END), 0) AS paid_amount_uzs
         FROM finance_transactions
        WHERE organization_id = $1
          AND ticket_id = $2
          AND status = 'posted'
          AND transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')`,
      [organizationId, ticketId]
    );
    const totalAmountUzs = normalizeAmount(current.total_uzs ?? current.amount_uzs, 0);
    const paidAmountUzs = normalizeAmount(paidResult.rows[0]?.paid_amount_uzs, 0);
    const payableAmountUzs = Math.max(totalAmountUzs - paidAmountUzs, 0);
    const amountUzs = requestedAmount > 0 ? requestedAmount : payableAmountUzs;
    if (amountUzs <= 0) {
      const error = new Error("Payment amount is required.");
      error.statusCode = 400;
      throw error;
    }
    if (amountUzs > payableAmountUzs) {
      const error = new Error("Payment amount exceeds selected tickets total.");
      error.statusCode = 400;
      throw error;
    }
    const cashSession = await getOpenCashSession(db, {
      organizationId,
      cashierUserId: actorUserId,
      forUpdate: true
    });
    if (!cashSession) {
      const error = new Error("Cash session is required.");
      error.statusCode = 400;
      throw error;
    }

    const paymentResult = await db.query(
      `INSERT INTO finance_ticket_payments (
         organization_id, ticket_id, payment_method_id, amount_uzs, note, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [organizationId, ticketId, paymentMethodId, amountUzs, note || null, actorUserId || null]
    );
    const paymentId = paymentResult.rows[0]?.id || null;
    await insertFinanceTransaction(db, {
      organizationId,
      cashSessionId: cashSession.id,
      transactionType: "ticket_payment",
      direction: "in",
      clientId: current.client_id,
      ticketId,
      ticketPaymentId: paymentId,
      paymentMethodId,
      amountUzs,
      note,
      metadata: {
        ticketNumber: current.ticket_number,
        source: "ticket_payment"
      },
      actorUserId
    });
    const nextPaidAmountUzs = paidAmountUzs + amountUzs;
    const nextStatus = nextPaidAmountUzs >= totalAmountUzs ? "paid" : "unpaid";
    const result = await db.query(
      `UPDATE finance_tickets
          SET status = $3,
              updated_by = $4,
              updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = $1
          AND id = $2
        RETURNING *`,
      [organizationId, ticketId, nextStatus, actorUserId || null]
    );
    await insertHistory(db, {
      organizationId,
      ticketId,
      action: "paid",
      fromStatus: current.status,
      toStatus: nextStatus,
      details: {
        paymentMethodId,
        paymentMethodName: methodResult.rows[0]?.name || "",
        amountUzs,
        paidAmountUzs: nextPaidAmountUzs,
        remainingAmountUzs: Math.max(totalAmountUzs - nextPaidAmountUzs, 0),
        cashSessionId: cashSession.id,
        paymentId
      },
      actorUserId
    });
    await db.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

export async function payFinanceTicketsBatch({ organizationId, payload, actorUserId }) {
  const ticketIds = Array.from(new Set(
    (payload?.ticketIds ?? payload?.ticket_ids ?? [])
      .map((item) => parsePositiveInteger(item))
      .filter(Boolean)
  ));
  const rawPayments = Array.isArray(payload?.payments) ? payload.payments : [];
  const note = normalizeText(payload?.note);
  if (ticketIds.length === 0) {
    const error = new Error("Select at least one ticket.");
    error.statusCode = 400;
    throw error;
  }
  const paymentTotals = new Map();
  const depositTotals = new Map();
  for (const rawPayment of rawPayments.slice(0, 8)) {
    const source = String(rawPayment?.source ?? rawPayment?.paymentSource ?? rawPayment?.payment_source ?? "method").trim().toLowerCase();
    const paymentMethodId = parsePositiveInteger(rawPayment?.paymentMethodId ?? rawPayment?.payment_method_id);
    const clientId = parsePositiveInteger(rawPayment?.clientId ?? rawPayment?.client_id);
    const amountUzs = normalizeAmount(rawPayment?.amountUzs ?? rawPayment?.amount_uzs, 0);
    if (amountUzs <= 0) {
      continue;
    }
    if (source === "deposit") {
      if (!clientId) {
        continue;
      }
      depositTotals.set(clientId, (depositTotals.get(clientId) || 0) + amountUzs);
      continue;
    }
    if (!paymentMethodId) {
      continue;
    }
    paymentTotals.set(paymentMethodId, (paymentTotals.get(paymentMethodId) || 0) + amountUzs);
  }
  const payments = Array.from(paymentTotals.entries()).map(([paymentMethodId, amountUzs]) => ({
    paymentMethodId,
    amountUzs
  }));
  const depositPayments = Array.from(depositTotals.entries()).map(([clientId, amountUzs]) => ({
    clientId,
    amountUzs
  }));
  if (payments.length === 0 && depositPayments.length === 0) {
    const error = new Error("Payment method is required.");
    error.statusCode = 400;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const depositClientIds = depositPayments
      .map((payment) => payment.clientId)
      .sort((left, right) => left - right);
    for (const depositClientId of depositClientIds) {
      await lockClientFinanceBalance(db, { organizationId, clientId: depositClientId });
    }
    const cashSession = await getOpenCashSession(db, {
      organizationId,
      cashierUserId: actorUserId,
      forUpdate: true
    });
    if (!cashSession) {
      const error = new Error("Cash session is required.");
      error.statusCode = 400;
      throw error;
    }

    if (payments.length > 0) {
      const methodsResult = await db.query(
        `SELECT id
           FROM finance_payment_methods
          WHERE organization_id = $1
            AND id = ANY($2::int[])
            AND is_active = TRUE`,
        [organizationId, payments.map((payment) => payment.paymentMethodId)]
      );
      if (methodsResult.rows.length !== payments.length) {
        const error = new Error("Payment method not found.");
        error.statusCode = 400;
        throw error;
      }
    }

    const ticketsResult = await db.query(
      `SELECT ft.*,
              COALESCE(fpaid.paid_amount_uzs, 0) AS paid_amount_uzs
         FROM finance_tickets ft
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(CASE
                    WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
                    WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
                    ELSE 0
                  END), 0) AS paid_amount_uzs
             FROM finance_transactions t
            WHERE t.organization_id = ft.organization_id
              AND t.ticket_id = ft.id
              AND t.status = 'posted'
              AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')
         ) fpaid ON TRUE
        WHERE ft.organization_id = $1
          AND ft.id = ANY($2::bigint[])
          AND ft.status IN ('issued', 'unpaid')
        ORDER BY ft.ticket_date ASC, ft.id ASC
        FOR UPDATE OF ft`,
      [organizationId, ticketIds]
    );
    if (ticketsResult.rows.length !== ticketIds.length) {
      const error = new Error("Selected tickets are not payable.");
      error.statusCode = 400;
      throw error;
    }
    const tickets = ticketsResult.rows.map((ticket) => ({
      ...ticket,
      totalAmountUzs: normalizeAmount(ticket.total_uzs ?? ticket.amount_uzs, 0),
      paidAmountUzs: normalizeAmount(ticket.paid_amount_uzs, 0),
      payableAmountUzs: Math.max(
        normalizeAmount(ticket.total_uzs ?? ticket.amount_uzs, 0) - normalizeAmount(ticket.paid_amount_uzs, 0),
        0
      )
    }));
    const selectedClientIds = new Set(tickets.map((ticket) => parsePositiveInteger(ticket.client_id)).filter(Boolean));
    if (selectedClientIds.size !== 1) {
      const error = new Error("Select tickets from one client only.");
      error.statusCode = 400;
      throw error;
    }
    const totalAmountUzs = tickets.reduce((sum, ticket) => sum + ticket.payableAmountUzs, 0);
    const paidAmountUzs = payments.reduce((sum, payment) => sum + payment.amountUzs, 0)
      + depositPayments.reduce((sum, payment) => sum + payment.amountUzs, 0);
    if (totalAmountUzs <= 0) {
      const error = new Error("Payment amount is required.");
      error.statusCode = 400;
      throw error;
    }
    const selectedTotalByClient = new Map();
    tickets.forEach((ticket) => {
      selectedTotalByClient.set(
        ticket.client_id,
        (selectedTotalByClient.get(ticket.client_id) || 0) + ticket.payableAmountUzs
      );
    });
    for (const depositPayment of depositPayments) {
      const selectedClientTotal = selectedTotalByClient.get(depositPayment.clientId) || 0;
      if (depositPayment.amountUzs > selectedClientTotal) {
        const error = new Error("Deposit amount exceeds selected client tickets total.");
        error.statusCode = 400;
        throw error;
      }
      const currentDeposit = await getClientDepositBalance(db, {
        organizationId,
        clientId: depositPayment.clientId
      });
      if (depositPayment.amountUzs > currentDeposit) {
        const error = new Error("Deposit balance is not enough.");
        error.statusCode = 400;
        throw error;
      }
    }
    if (paidAmountUzs > totalAmountUzs) {
      const error = new Error("Payment amount exceeds selected tickets total.");
      error.statusCode = 400;
      throw error;
    }

    const groupResult = await db.query(
      `INSERT INTO finance_payment_groups (
         organization_id, cash_session_id, total_amount_uzs, note, created_by
      )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [organizationId, cashSession.id, paidAmountUzs, note || null, actorUserId || null]
    );
    const paymentGroupId = groupResult.rows[0]?.id || null;
    const paymentQueue = payments.map((payment) => ({ ...payment }));
    const depositQueueByClient = new Map(depositPayments.map((payment) => [payment.clientId, { ...payment }]));
    const paidTickets = [];

    for (const ticket of tickets) {
      let remainingTicketAmount = ticket.payableAmountUzs;
      const allocationIds = [];
      const currentDeposit = depositQueueByClient.get(ticket.client_id);
      if (currentDeposit?.amountUzs > 0 && remainingTicketAmount > 0) {
        const allocationAmount = Math.min(remainingTicketAmount, currentDeposit.amountUzs);
        const paymentResult = await db.query(
          `INSERT INTO finance_ticket_payments (
             organization_id, ticket_id, payment_group_id, payment_method_id, amount_uzs, note, created_by
           )
           VALUES ($1, $2, $3, NULL, $4, $5, $6)
           RETURNING id`,
          [
            organizationId,
            ticket.id,
            paymentGroupId,
            allocationAmount,
            note || null,
            actorUserId || null
          ]
        );
        const paymentId = paymentResult.rows[0]?.id || null;
        allocationIds.push(paymentId);
        await insertFinanceTransaction(db, {
          organizationId,
          cashSessionId: cashSession.id,
          paymentGroupId,
          transactionType: "deposit_ticket_payment",
          direction: "transfer",
          clientId: ticket.client_id,
          ticketId: ticket.id,
          ticketPaymentId: paymentId,
          paymentMethodId: null,
          amountUzs: allocationAmount,
          note,
          metadata: {
            ticketNumber: ticket.ticket_number,
            source: "ticket_batch_deposit_payment"
          },
          actorUserId
        });
        currentDeposit.amountUzs -= allocationAmount;
        remainingTicketAmount -= allocationAmount;
      }
      while (remainingTicketAmount > 0) {
        const currentPayment = paymentQueue.find((payment) => payment.amountUzs > 0);
        if (!currentPayment) {
          break;
        }
        const allocationAmount = Math.min(remainingTicketAmount, currentPayment.amountUzs);
        const paymentResult = await db.query(
          `INSERT INTO finance_ticket_payments (
             organization_id, ticket_id, payment_group_id, payment_method_id, amount_uzs, note, created_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            organizationId,
            ticket.id,
            paymentGroupId,
            currentPayment.paymentMethodId,
            allocationAmount,
            note || null,
            actorUserId || null
          ]
        );
        const paymentId = paymentResult.rows[0]?.id || null;
        allocationIds.push(paymentId);
        await insertFinanceTransaction(db, {
          organizationId,
          cashSessionId: cashSession.id,
          paymentGroupId,
          transactionType: "ticket_payment",
          direction: "in",
          clientId: ticket.client_id,
          ticketId: ticket.id,
          ticketPaymentId: paymentId,
          paymentMethodId: currentPayment.paymentMethodId,
          amountUzs: allocationAmount,
          note,
          metadata: {
            ticketNumber: ticket.ticket_number,
            source: "ticket_batch_payment"
          },
          actorUserId
        });
        currentPayment.amountUzs -= allocationAmount;
        remainingTicketAmount -= allocationAmount;
      }
      const allocatedAmountUzs = ticket.payableAmountUzs - remainingTicketAmount;
      if (allocatedAmountUzs <= 0) {
        continue;
      }
      const nextPaidAmountUzs = ticket.paidAmountUzs + allocatedAmountUzs;
      const nextStatus = nextPaidAmountUzs >= ticket.totalAmountUzs ? "paid" : "unpaid";

      const updatedResult = await db.query(
        `UPDATE finance_tickets
            SET status = $3,
                updated_by = $4,
                updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $1
            AND id = $2
          RETURNING *`,
        [organizationId, ticket.id, nextStatus, actorUserId || null]
      );
      await insertHistory(db, {
        organizationId,
        ticketId: ticket.id,
        action: "paid",
        fromStatus: ticket.status,
        toStatus: nextStatus,
        details: {
          amountUzs: allocatedAmountUzs,
          paidAmountUzs: nextPaidAmountUzs,
          remainingAmountUzs: Math.max(ticket.totalAmountUzs - nextPaidAmountUzs, 0),
          cashSessionId: cashSession.id,
          paymentGroupId,
          paymentIds: allocationIds.filter(Boolean)
        },
        actorUserId
      });
      paidTickets.push(updatedResult.rows[0]);
    }

    await db.query("COMMIT");
    return {
      items: paidTickets.map(mapTicket),
      paymentGroupId,
      totalAmountUzs: paidAmountUzs,
      selectedTotalAmountUzs: totalAmountUzs
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    if (isFinanceBatchPaymentSchemaError(error)) {
      throw createMigrationRequiredError("Finance payment migration is required before batch payments can be processed.", {
        code: error?.code,
        detail: error?.detail || error?.message || "",
        migration: "20260606_000001_finance_payment_method_nullable_safety.sql"
      });
    }
    throw error;
  } finally {
    db.release();
  }
}

export async function refundFinanceTicket({ organizationId, id, payload, actorUserId }) {
  const ticketId = parsePositiveInteger(id);
  const note = normalizeText(payload?.note);
  if (!ticketId) {
    const error = new Error("Ticket not found.");
    error.statusCode = 404;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const current = await getTicketById(db, { organizationId, id: ticketId, forUpdate: true });
    if (!current) {
      const error = new Error("Ticket not found.");
      error.statusCode = 404;
      throw error;
    }
    if (current.status !== "paid") {
      const error = new Error("Only paid tickets can be refunded.");
      error.statusCode = 400;
      throw error;
    }
    await lockClientFinanceBalance(db, { organizationId, clientId: current.client_id });

    const cashSession = await getOpenCashSession(db, {
      organizationId,
      cashierUserId: actorUserId,
      forUpdate: true
    });
    if (!cashSession) {
      const error = new Error("Cash session is required.");
      error.statusCode = 400;
      throw error;
    }

    const paymentsResult = await db.query(
      `SELECT p.id,
              p.payment_group_id,
              p.payment_method_id,
              p.amount_uzs,
              original.transaction_type AS original_transaction_type
         FROM finance_ticket_payments p
         JOIN LATERAL (
           SELECT t.transaction_type
             FROM finance_transactions t
            WHERE t.organization_id = p.organization_id
              AND t.ticket_id = p.ticket_id
              AND t.ticket_payment_id = p.id
              AND t.status = 'posted'
              AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment')
            ORDER BY t.transaction_at DESC, t.id DESC
            LIMIT 1
         ) original ON TRUE
        WHERE p.organization_id = $1
          AND p.ticket_id = $2
          AND NOT EXISTS (
            SELECT 1
              FROM finance_transactions refunded
             WHERE refunded.organization_id = p.organization_id
               AND refunded.ticket_id = p.ticket_id
               AND refunded.ticket_payment_id = p.id
               AND refunded.status = 'posted'
               AND refunded.transaction_type IN ('refund', 'deposit_ticket_refund')
          )
        ORDER BY p.paid_at ASC, p.id ASC`,
      [organizationId, ticketId]
    );
    const payments = paymentsResult.rows;
    if (payments.length === 0) {
      const error = new Error("Ticket payment not found.");
      error.statusCode = 400;
      throw error;
    }

    const refundedPaymentIds = [];
    let refundedAmountUzs = 0;
    for (const payment of payments) {
      const amountUzs = normalizeAmount(payment.amount_uzs, 0);
      if (amountUzs <= 0) {
        continue;
      }
      const isDepositTicketPayment = payment.original_transaction_type === "deposit_ticket_payment";
      await insertFinanceTransaction(db, {
        organizationId,
        cashSessionId: cashSession.id,
        paymentGroupId: payment.payment_group_id || null,
        transactionType: isDepositTicketPayment ? "deposit_ticket_refund" : "refund",
        direction: isDepositTicketPayment ? "transfer" : "out",
        clientId: current.client_id,
        ticketId,
        ticketPaymentId: payment.id,
        paymentMethodId: payment.payment_method_id,
        amountUzs,
        note,
        metadata: {
          ticketNumber: current.ticket_number,
          source: "ticket_refund"
        },
        actorUserId
      });
      refundedPaymentIds.push(payment.id);
      refundedAmountUzs += amountUzs;
    }
    if (refundedPaymentIds.length === 0) {
      const error = new Error("Ticket payment not found.");
      error.statusCode = 400;
      throw error;
    }

    const result = await db.query(
      `UPDATE finance_tickets
          SET status = 'issued',
              updated_by = $3,
              updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = $1
          AND id = $2
        RETURNING *`,
      [organizationId, ticketId, actorUserId || null]
    );
    await insertHistory(db, {
      organizationId,
      ticketId,
      action: "refunded",
      fromStatus: current.status,
      toStatus: "issued",
      details: {
        amountUzs: refundedAmountUzs,
        cashSessionId: cashSession.id,
        paymentIds: refundedPaymentIds
      },
      actorUserId
    });
    await db.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
