import pool from "../../config/db.js";
import { parsePositiveInteger } from "../../lib/number.js";
import { getAppointmentHistoryLockDaysByOrganization } from "../appointments/appointment-settings.service.js";
import { updateAppointmentSchedulesByIds } from "../appointments/services/appointment-schedules.service.js";

const BOARD_LIMIT = 80;

function normalizeAmount(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const normalized = normalizeText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function getTodayYmdInTashkent() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
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
    ticketDate: row.ticket_date,
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
    status: row.status,
    note: row.note || "",
    appointmentDate: row.appointment_date,
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
    cashierUserId: row.cashier_user_id,
    cashierName: row.cashier_name || "",
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

function mapClientBalance(row) {
  if (!row) return null;
  const debtUzs = normalizeAmount(row.debt_uzs, 0);
  const depositUzs = normalizeAmount(row.deposit_uzs, 0);
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
    ticketDate: row.ticket_date,
    clientId: row.client_id,
    clientName: row.client_name || "",
    serviceName: row.service_name || "",
    totalUzs: row.total_uzs ?? row.amount_uzs,
    status: row.status
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
    appointmentDate: row.appointment_date,
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

function mapSpecialistOption(row) {
  return {
    id: row.id,
    fullName: row.full_name,
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

async function getOpenCashSession(db, { organizationId, cashierUserId, forUpdate = false }) {
  const result = await db.query(
    `SELECT s.*,
            COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), '') AS cashier_name
       FROM finance_cash_sessions s
       JOIN users u ON u.organization_id = s.organization_id AND u.id = s.cashier_user_id
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
       organization_id, cash_session_id, transaction_type, direction, client_id,
       ticket_id, ticket_payment_id, payment_method_id, amount_uzs, note, metadata, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
     RETURNING *`,
    [
      organizationId,
      cashSessionId,
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

  const ticketParams = [organizationId, boardDateFrom, boardDateTo];
  const ticketFilters = [
    "ft.organization_id = $1",
    "ft.status <> 'voided'",
    "COALESCE(a.appointment_date, ft.ticket_date) >= $2::date",
    "COALESCE(a.appointment_date, ft.ticket_date) <= $3::date"
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
              COALESCE(fti.item_count, 1) AS item_count,
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
           SELECT COUNT(*) AS item_count
             FROM finance_ticket_items
            WHERE organization_id = ft.organization_id AND ticket_id = ft.id
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
         LEFT JOIN position_options p
           ON p.organization_id = u.organization_id
          AND p.id = u.position_id
        WHERE u.organization_id = $1
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
    issuedTickets: tickets.filter((item) => item.status === "issued"),
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
  const params = [organizationId, `%${normalizedQuery.toLowerCase()}%`, `${normalizedQuery}%`, normalizedLimit];
  const result = await pool.query(
    `SELECT id,
            CONCAT_WS(' ', last_name, first_name, middle_name) AS full_name,
            phone_number
       FROM clients
      WHERE organization_id = $1
        AND (
          LOWER(CONCAT_WS(' ', last_name, first_name, middle_name)) LIKE $2
          OR phone_number LIKE $3
          OR id::text = $4
        )
      ORDER BY last_name ASC, first_name ASC, id ASC
      LIMIT $5`,
    [params[0], params[1], params[2], normalizedQuery, params[3]]
  );
  return result.rows.map(mapClientOption);
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
  const dateFrom = normalizeDate(filters.dateFrom ?? filters.date_from);
  const dateTo = normalizeDate(filters.dateTo ?? filters.date_to);
  const client = normalizeText(filters.client, 96).toLowerCase();
  const specialist = normalizeText(filters.specialist, 96).toLowerCase();
  const position = normalizeText(filters.position, 96).toLowerCase();
  const service = normalizeText(filters.service, 128).toLowerCase();
  const status = normalizeText(filters.status, 16);

  if (/^\d{1,5}$/.test(ticketNumber)) {
    params.push(Number.parseInt(ticketNumber, 10));
    where.push(`ft.ticket_number = $${params.length}`);
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
  if (["issued", "paid", "unpaid", "voided"].includes(status)) {
    params.push(status);
    where.push(`ft.status = $${params.length}`);
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
    `SELECT id
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
       LEFT JOIN users u ON u.organization_id = h.organization_id AND u.id = h.changed_by
      WHERE h.organization_id = $1
        AND h.ticket_id = $2
      ORDER BY h.created_at DESC, h.id DESC`,
    [organizationId, ticketId]
  );
  return result.rows.map(mapTicketHistory);
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
       JOIN users u ON u.organization_id = s.organization_id AND u.id = s.cashier_user_id
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
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = normalizeDate(filters.dateFrom ?? filters.date_from) || today;
  const dateTo = normalizeDate(filters.dateTo ?? filters.date_to) || dateFrom;
  const client = normalizeText(filters.client, 96).toLowerCase();
  const paymentMethodId = parsePositiveInteger(filters.paymentMethodId ?? filters.payment_method_id);
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize ?? filters.page_size, 20);
  const offset = (page - 1) * pageSize;
  const params = [organizationId, dateFrom, dateTo];
  const where = [
    "t.organization_id = $1",
    "t.transaction_at::date >= $2::date",
    "t.transaction_at::date <= $3::date"
  ];
  if (client) {
    params.push(`%${client}%`);
    params.push(client);
    where.push(`(
      LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $${params.length - 1}
      OR c.id::text = $${params.length}
    )`);
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
    LEFT JOIN users cu ON cu.organization_id = s.organization_id AND cu.id = s.cashier_user_id
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
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    dateFrom,
    dateTo
  };
}

export async function getFinanceDailyCash({ organizationId, filters = {} }) {
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = normalizeDate(filters.dateFrom ?? filters.date_from) || today;
  const dateTo = normalizeDate(filters.dateTo ?? filters.date_to) || dateFrom;
  const cashier = normalizeText(filters.cashier, 96).toLowerCase();
  const client = normalizeText(filters.client, 96).toLowerCase();
  const service = normalizeText(filters.service, 128).toLowerCase();
  const paymentMethodId = parsePositiveInteger(filters.paymentMethodId ?? filters.payment_method_id);
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize ?? filters.page_size, 20);
  const offset = (page - 1) * pageSize;
  const params = [organizationId, dateFrom, dateTo];
  const where = [
    "t.organization_id = $1",
    "t.status = 'posted'",
    "t.direction IN ('in', 'out')",
    "t.transaction_at::date >= $2::date",
    "t.transaction_at::date <= $3::date"
  ];
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
    LEFT JOIN users cu ON cu.organization_id = s.organization_id AND cu.id = s.cashier_user_id
   WHERE ${whereSql}`;
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
       ${fromSql}
      GROUP BY t.payment_method_id, fpm.name
      ORDER BY payment_method_name ASC`,
    params
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
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = normalizeDate(filters.dateFrom ?? filters.date_from) || today;
  const dateTo = normalizeDate(filters.dateTo ?? filters.date_to) || dateFrom;
  const params = [organizationId, dateFrom, dateTo];
  const ticketMovementWhere = `
    t.organization_id = $1
    AND t.status = 'posted'
    AND t.transaction_at::date >= $2::date
    AND t.transaction_at::date <= $3::date
    AND t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment', 'refund', 'deposit_ticket_refund')`;
  const signedItemAmountSql = `
    CASE
      WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN fti.final_amount_uzs
      WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -fti.final_amount_uzs
      ELSE 0
    END`;
  const itemFromSql = `
    FROM finance_transactions t
    JOIN finance_tickets ft ON ft.organization_id = t.organization_id AND ft.id = t.ticket_id
    JOIN finance_ticket_items fti ON fti.organization_id = ft.organization_id AND fti.ticket_id = ft.id
    WHERE ${ticketMovementWhere}`;

  const summaryResult = await pool.query(
    `SELECT COALESCE(SUM(CASE
              WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
              WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
              ELSE 0
            END), 0) AS amount_uzs,
            COUNT(*) AS transaction_count
       FROM finance_transactions t
      WHERE ${ticketMovementWhere}`,
    params
  );
  const byServiceResult = await pool.query(
    `SELECT fti.service_id AS id,
            COALESCE(NULLIF(TRIM(fti.service_name), ''), 'No service') AS label,
            COALESCE(SUM(${signedItemAmountSql}), 0) AS amount_uzs,
            COUNT(*) AS item_count
       ${itemFromSql}
      GROUP BY fti.service_id, fti.service_name
      ORDER BY amount_uzs DESC, label ASC
      LIMIT 100`,
    params
  );
  const bySpecialistResult = await pool.query(
    `SELECT fti.specialist_id AS id,
            COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), 'No specialist') AS label,
            COALESCE(SUM(${signedItemAmountSql}), 0) AS amount_uzs,
            COUNT(*) AS item_count
       ${itemFromSql}
       LEFT JOIN users u ON u.organization_id = fti.organization_id AND u.id = fti.specialist_id
      GROUP BY fti.specialist_id, u.full_name, u.username
      ORDER BY amount_uzs DESC, label ASC
      LIMIT 100`,
    params
  );
  const byDepartmentResult = await pool.query(
    `SELECT p.id,
            COALESCE(NULLIF(TRIM(p.label), ''), 'No department') AS label,
            COALESCE(SUM(${signedItemAmountSql}), 0) AS amount_uzs,
            COUNT(*) AS item_count
       ${itemFromSql}
       LEFT JOIN users u ON u.organization_id = fti.organization_id AND u.id = fti.specialist_id
       LEFT JOIN position_options p ON p.organization_id = u.organization_id AND p.id = u.position_id
      GROUP BY p.id, p.label
      ORDER BY amount_uzs DESC, label ASC
      LIMIT 100`,
    params
  );
  const byClientResult = await pool.query(
    `SELECT c.id,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)), ''), 'No client') AS label,
            COALESCE(SUM(CASE
              WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
              WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
              ELSE 0
            END), 0) AS amount_uzs,
            COUNT(*) AS transaction_count
       FROM finance_transactions t
       JOIN clients c ON c.organization_id = t.organization_id AND c.id = t.client_id
      WHERE ${ticketMovementWhere}
      GROUP BY c.id, c.last_name, c.first_name, c.middle_name
      ORDER BY amount_uzs DESC, label ASC
      LIMIT 100`,
    params
  );
  const byCashierResult = await pool.query(
    `SELECT s.cashier_user_id AS id,
            COALESCE(NULLIF(TRIM(u.full_name), ''), NULLIF(TRIM(u.username), ''), 'No cashier') AS label,
            COALESCE(SUM(CASE
              WHEN t.transaction_type IN ('ticket_payment', 'deposit_ticket_payment') THEN t.amount_uzs
              WHEN t.transaction_type IN ('refund', 'deposit_ticket_refund') THEN -t.amount_uzs
              ELSE 0
            END), 0) AS amount_uzs,
            COUNT(*) AS transaction_count
       FROM finance_transactions t
       JOIN finance_cash_sessions s ON s.organization_id = t.organization_id AND s.id = t.cash_session_id
       LEFT JOIN users u ON u.organization_id = s.organization_id AND u.id = s.cashier_user_id
      WHERE ${ticketMovementWhere}
      GROUP BY s.cashier_user_id, u.full_name, u.username
      ORDER BY amount_uzs DESC, label ASC
      LIMIT 100`,
    params
  );

  return {
    dateFrom,
    dateTo,
    summary: {
      amountUzs: Number.parseInt(String(summaryResult.rows[0]?.amount_uzs || 0), 10) || 0,
      transactionCount: Number.parseInt(String(summaryResult.rows[0]?.transaction_count || 0), 10) || 0
    },
    byService: byServiceResult.rows.map(mapReportRow),
    bySpecialist: bySpecialistResult.rows.map(mapReportRow),
    byDepartment: byDepartmentResult.rows.map(mapReportRow),
    byClient: byClientResult.rows.map(mapReportRow),
    byCashier: byCashierResult.rows.map(mapReportRow)
  };
}

export async function getFinanceClientBalances({ organizationId, filters = {} }) {
  const client = normalizeText(filters.client, 96).toLowerCase();
  const type = String(filters.type || "all").trim().toLowerCase();
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize ?? filters.page_size, 20);
  const offset = (page - 1) * pageSize;
  const params = [organizationId];
  const where = ["c.organization_id = $1"];

  if (client) {
    params.push(`%${client}%`);
    params.push(client);
    where.push(`(
      LOWER(CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name)) LIKE $${params.length - 1}
      OR c.id::text = $${params.length}
      OR COALESCE(c.phone_number, '') LIKE $${params.length - 1}
    )`);
  }

  const having = [];
  if (type === "debt") {
    having.push("COALESCE(debt.debt_uzs, 0) > 0");
  } else if (type === "deposit") {
    having.push("COALESCE(deposit.deposit_uzs, 0) > 0");
  } else if (!client) {
    having.push("(COALESCE(debt.debt_uzs, 0) > 0 OR COALESCE(deposit.deposit_uzs, 0) > 0)");
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
          SELECT client_id, SUM(total_uzs) AS debt_uzs
            FROM finance_tickets
           WHERE organization_id = $1
             AND status IN ('issued', 'unpaid')
           GROUP BY client_id
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
  return normalizeAmount(result.rows[0]?.deposit_uzs, 0);
}

export async function createFinanceDepositTransaction({ organizationId, payload, actorUserId }) {
  const clientId = parsePositiveInteger(payload?.clientId ?? payload?.client_id);
  const paymentMethodId = parsePositiveInteger(payload?.paymentMethodId ?? payload?.payment_method_id);
  const amountUzs = normalizeAmount(payload?.amountUzs ?? payload?.amount_uzs, 0);
  const operation = String(payload?.operation || "").trim().toLowerCase();
  const note = normalizeText(payload?.note);
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
  if (!["in", "out"].includes(operation)) {
    const error = new Error("Deposit operation is required.");
    error.statusCode = 400;
    throw error;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const clientResult = await db.query(
      `SELECT id
         FROM clients
        WHERE organization_id = $1
          AND id = $2
        LIMIT 1`,
      [organizationId, clientId]
    );
    if (!clientResult.rows[0]) {
      const error = new Error("Client not found.");
      error.statusCode = 404;
      throw error;
    }

    const methodResult = await db.query(
      `SELECT id
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

    if (operation === "out") {
      const currentDeposit = await getClientDepositBalance(db, { organizationId, clientId });
      if (amountUzs > currentDeposit) {
        const error = new Error("Deposit balance is not enough.");
        error.statusCode = 400;
        throw error;
      }
    }

    const transaction = await insertFinanceTransaction(db, {
      organizationId,
      cashSessionId: cashSession.id,
      transactionType: operation === "in" ? "deposit_in" : "deposit_out",
      direction: operation === "in" ? "in" : "out",
      clientId,
      ticketId: null,
      ticketPaymentId: null,
      paymentMethodId,
      amountUzs,
      note,
      metadata: { source: operation === "in" ? "deposit_topup" : "deposit_withdraw" },
      actorUserId
    });

    await db.query("COMMIT");
    return mapTransaction(transaction);
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
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
            ft.status
       FROM finance_tickets ft
       JOIN clients c ON c.organization_id = ft.organization_id AND c.id = ft.client_id
      WHERE ft.organization_id = $1
        AND ft.client_id = $2
        AND ft.status IN ('issued', 'unpaid')
      ORDER BY ft.ticket_date ASC, ft.id ASC`,
    [organizationId, normalizedClientId]
  );
  return { items: result.rows.map(mapClientDebtTicket) };
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
      `SELECT *
         FROM finance_tickets
        WHERE organization_id = $1
          AND client_id = $2
          AND id = ANY($3::bigint[])
          AND status IN ('issued', 'unpaid')
        ORDER BY ticket_date ASC, id ASC
        FOR UPDATE`,
      [organizationId, clientId, ticketIds]
    );
    if (ticketsResult.rows.length !== ticketIds.length) {
      const error = new Error("Selected tickets are not payable.");
      error.statusCode = 400;
      throw error;
    }

    const totalAmountUzs = ticketsResult.rows.reduce(
      (sum, ticket) => sum + normalizeAmount(ticket.total_uzs ?? ticket.amount_uzs, 0),
      0
    );
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
    for (const ticket of ticketsResult.rows) {
      const amountUzs = normalizeAmount(ticket.total_uzs ?? ticket.amount_uzs, 0);
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
                amount_uzs = $3,
                updated_by = $4,
                updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $1
            AND id = $2
          RETURNING *`,
        [organizationId, ticket.id, amountUzs, actorUserId || null]
      );
      await insertHistory(db, {
        organizationId,
        ticketId: ticket.id,
        action: "paid_from_deposit",
        fromStatus: ticket.status,
        toStatus: "paid",
        details: { amountUzs, cashSessionId: cashSession.id, paymentId },
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

async function getAppointmentForTicket(db, { organizationId, appointmentScheduleId }) {
  const result = await db.query(
    `SELECT id,
            organization_id,
            specialist_id,
            client_id,
            service_id,
            service_name,
            service_price_uzs,
            appointment_date,
            status
       FROM appointment_schedules
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1`,
    [organizationId, appointmentScheduleId]
  );
  return result.rows[0] || null;
}

async function getTicketById(db, { organizationId, id }) {
  const result = await db.query(
    `SELECT *
       FROM finance_tickets
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1`,
    [organizationId, id]
  );
  return result.rows[0] || null;
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
      const priceUzs = normalizeAmount(service.price_uzs, 0);
      if (priceUzs <= 0) {
        const error = new Error("Service price is required.");
        error.statusCode = 400;
        throw error;
      }
      const discountType = normalizeDiscountType(rawItem?.discountType ?? rawItem?.discount_type);
      const discountValue = normalizeAmount(rawItem?.discountValue ?? rawItem?.discount_value, 0);
      const discountUzs = calculateDiscountUzs({ priceUzs, discountType, discountValue });
      items.push({
        specialistId: specialistId || null,
        serviceId,
        serviceName: normalizeText(service.name, 128),
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
      appointment = await getAppointmentForTicket(db, { organizationId, appointmentScheduleId });
      if (!appointment) {
        const error = new Error("Appointment not found.");
        error.statusCode = 404;
        throw error;
      }
      if (appointment.status !== "confirmed") {
        const error = new Error("Only confirmed appointments can become tickets.");
        error.statusCode = 400;
        throw error;
      }
      ticketClientId = appointment.client_id;
      ticketSpecialistId = appointment.specialist_id;
      ticketServiceId = appointment.service_id || null;
      serviceName = normalizeText(appointment.service_name, 128);
      amountUzs = requestedAmount > 0 ? requestedAmount : normalizeAmount(appointment.service_price_uzs, 0);
      ticketDate = normalizeDate(appointment.appointment_date) || ticketDate;
    }
    ticketDate = ticketDate || new Date().toISOString().slice(0, 10);

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
        totals,
        items
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
  if (!ticketId) {
    const error = new Error("Ticket not found.");
    error.statusCode = 404;
    throw error;
  }
  if (hasTicketDate && !ticketDate) {
    const error = new Error("Ticket date is required.");
    error.statusCode = 400;
    throw error;
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
    const current = await getTicketById(db, { organizationId, id: ticketId });
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
    const nextClientId = hasClientId ? clientId : current.client_id;
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
    }
    await insertHistory(db, {
      organizationId,
      ticketId,
      action: "updated",
      fromStatus: current.status,
      toStatus: current.status,
      details: {
        ticketDate: hasTicketDate ? ticketDate : undefined,
        clientId: hasClientId ? nextClientId : undefined,
        amountUzs: amountUzs !== null ? amountUzs : undefined,
        note: payload?.note !== undefined ? note : undefined,
        totals: nextTotals || undefined,
        items: nextItems || undefined
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

export async function voidFinanceTicket({ organizationId, id, actorUserId }) {
  return updateTicketStatus({ organizationId, id, status: "voided", action: "voided", actorUserId });
}

async function updateTicketStatus({ organizationId, id, status, action, actorUserId }) {
  const ticketId = parsePositiveInteger(id);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const current = await getTicketById(db, { organizationId, id: ticketId });
    if (!current) {
      const error = new Error("Ticket not found.");
      error.statusCode = 404;
      throw error;
    }
    if (current.status === "paid" && status !== "voided") {
      const error = new Error("Paid tickets cannot be changed.");
      error.statusCode = 400;
      throw error;
    }
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
    const current = await getTicketById(db, { organizationId, id: ticketId });
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
      `SELECT id
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
    const amountUzs = requestedAmount > 0 ? requestedAmount : normalizeAmount(current.amount_uzs, 0);
    if (amountUzs <= 0) {
      const error = new Error("Payment amount is required.");
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
    const result = await db.query(
      `UPDATE finance_tickets
          SET status = 'paid',
              amount_uzs = $3,
              updated_by = $4,
              updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = $1
          AND id = $2
        RETURNING *`,
      [organizationId, ticketId, amountUzs, actorUserId || null]
    );
    await insertHistory(db, {
      organizationId,
      ticketId,
      action: "paid",
      fromStatus: current.status,
      toStatus: "paid",
      details: { paymentMethodId, amountUzs, cashSessionId: cashSession.id, paymentId },
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
    const current = await getTicketById(db, { organizationId, id: ticketId });
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
      `SELECT id, payment_method_id, amount_uzs
         FROM finance_ticket_payments
        WHERE organization_id = $1
          AND ticket_id = $2
        ORDER BY paid_at DESC, id DESC
        LIMIT 1`,
      [organizationId, ticketId]
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      const error = new Error("Ticket payment not found.");
      error.statusCode = 400;
      throw error;
    }

    const refundedResult = await db.query(
      `SELECT id
         FROM finance_transactions
        WHERE organization_id = $1
          AND ticket_id = $2
          AND ticket_payment_id = $3
          AND transaction_type = 'refund'
          AND status = 'posted'
        LIMIT 1`,
      [organizationId, ticketId, payment.id]
    );
    if (refundedResult.rows[0]) {
      const error = new Error("Ticket payment is already refunded.");
      error.statusCode = 400;
      throw error;
    }

    const originalTransactionResult = await db.query(
      `SELECT transaction_type
         FROM finance_transactions
        WHERE organization_id = $1
          AND ticket_id = $2
          AND ticket_payment_id = $3
          AND status = 'posted'
        ORDER BY transaction_at DESC, id DESC
        LIMIT 1`,
      [organizationId, ticketId, payment.id]
    );
    const isDepositTicketPayment = originalTransactionResult.rows[0]?.transaction_type === "deposit_ticket_payment";

    await insertFinanceTransaction(db, {
      organizationId,
      cashSessionId: cashSession.id,
      transactionType: isDepositTicketPayment ? "deposit_ticket_refund" : "refund",
      direction: isDepositTicketPayment ? "transfer" : "out",
      clientId: current.client_id,
      ticketId,
      ticketPaymentId: payment.id,
      paymentMethodId: payment.payment_method_id,
      amountUzs: normalizeAmount(payment.amount_uzs, 0),
      note,
      metadata: {
        ticketNumber: current.ticket_number,
        source: "ticket_refund"
      },
      actorUserId
    });

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
        paymentMethodId: payment.payment_method_id,
        amountUzs: normalizeAmount(payment.amount_uzs, 0),
        cashSessionId: cashSession.id,
        paymentId: payment.id
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
