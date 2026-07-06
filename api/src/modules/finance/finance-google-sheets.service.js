import pool from "../../config/db.js";
import { createMigrationRequiredError } from "../../lib/schema-guard.js";

const SHEET_DEFINITIONS = Object.freeze([
  {
    key: "tickets",
    title: "Талоны",
    lastColumn: "N",
    headers: [
      "Номер талона",
      "Создано",
      "Клиент",
      "ID клиента",
      "Дата талона",
      "Услуга",
      "Отдел",
      "Специалист",
      "Статус",
      "Цена услуг",
      "Скидка",
      "К оплате",
      "Оплачено",
      "Осталось"
    ],
    moneyColumns: [9, 10, 11, 12, 13],
    dateColumns: [
      { columnIndex: 1, pattern: "dd.mm.yyyy hh:mm" },
      { columnIndex: 4, pattern: "dd.mm.yyyy" }
    ]
  },
  {
    key: "transactions",
    title: "Транзакции",
    lastColumn: "K",
    clearLastColumn: "L",
    headers: [
      "ID транзакции",
      "Дата",
      "Действие",
      "Номер талона",
      "Клиент",
      "ID клиента",
      "Способ оплаты",
      "Сумма",
      "Кассир",
      "Статус",
      "Примечание / Причина"
    ],
    moneyColumns: [7],
    dateColumns: [
      { columnIndex: 1, pattern: "dd.mm.yyyy hh:mm" }
    ]
  },
  {
    key: "balances",
    title: "Балансы клиентов",
    lastColumn: "D",
    clearLastColumn: "E",
    headers: [
      "ID клиента",
      "Клиент",
      "Долг",
      "Депозит"
    ],
    moneyColumns: [2, 3],
    dateColumns: []
  }
]);

const TICKET_BATCH_SIZE = 1000;
const TRANSACTION_BATCH_SIZE = 2500;
const BALANCE_BATCH_SIZE = 2500;
const SHEETS_WRITE_CHUNK_SIZE = 2500;
const GOOGLE_RETRY_ATTEMPTS = 5;
const WRITE_THROTTLE_MS = 1050;
const GOOGLE_SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const TICKET_STATUS_LABELS = Object.freeze({
  issued: "Выдан",
  unpaid: "Частично оплачен",
  paid: "Оплачен",
  voided: "Аннулирован"
});

const TRANSACTION_ACTION_LABELS = Object.freeze({
  ticket_payment: "Оплата талона",
  deposit_in: "Пополнение депозита",
  deposit_out: "Возврат депозита",
  deposit_ticket_payment: "Оплата талона с депозита",
  deposit_ticket_refund: "Возврат на депозит",
  refund: "Возврат оплаты",
  correction: "Корректировка"
});

function normalizeYear(value) {
  const year = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

function toInteger(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toGoogleSheetsDateValue(value) {
  const match = String(value || "").trim().match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) return "";
  const [, yearRaw, monthRaw, dayRaw, hourRaw = "0", minuteRaw = "0", secondRaw = "0"] = match;
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  const second = Number.parseInt(secondRaw, 10);
  const dateOnlyUtcMs = Date.UTC(year, month - 1, day);
  const parsedDate = new Date(dateOnlyUtcMs);
  if (
    parsedDate.getUTCFullYear() !== year
    || parsedDate.getUTCMonth() !== month - 1
    || parsedDate.getUTCDate() !== day
    || hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
    || second < 0
    || second > 59
  ) {
    return "";
  }
  return (
    (dateOnlyUtcMs - GOOGLE_SHEETS_EPOCH_UTC_MS) / DAY_IN_MILLISECONDS
    + hour / 24
    + minute / (24 * 60)
    + second / (24 * 60 * 60)
  );
}

function escapeA1SheetTitle(title) {
  return `'${String(title).replaceAll("'", "''")}'`;
}

function columnLetterToIndex(columnLetter) {
  return String(columnLetter || "")
    .trim()
    .toUpperCase()
    .split("")
    .reduce((index, character) => (
      (index * 26) + character.charCodeAt(0) - 64
    ), 0);
}

function columnIndexToLetter(columnIndex) {
  let index = Number.parseInt(String(columnIndex || ""), 10);
  if (!Number.isInteger(index) || index <= 0) return "";
  let output = "";
  while (index > 0) {
    const remainder = (index - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    index = Math.floor((index - 1) / 26);
  }
  return output;
}

function getSheetClearLastColumn(definition, gridColumnCount) {
  const exportedColumnCount = columnLetterToIndex(definition.lastColumn);
  const desiredColumnCount = columnLetterToIndex(
    definition.clearLastColumn || definition.lastColumn
  );
  const availableColumnCount = Number.parseInt(String(gridColumnCount || ""), 10);
  const safeColumnCount = Number.isInteger(availableColumnCount) && availableColumnCount > 0
    ? Math.max(exportedColumnCount, Math.min(desiredColumnCount, availableColumnCount))
    : exportedColumnCount;
  return columnIndexToLetter(safeColumnCount);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseServiceAccountJson(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    } catch {
      return null;
    }
  }
}

function getGoogleCredentials() {
  const jsonCredentials = parseServiceAccountJson(
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
      || process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  );
  const clientEmail = String(
    jsonCredentials?.client_email
      || process.env.GOOGLE_SHEETS_CLIENT_EMAIL
      || ""
  ).trim();
  const privateKey = String(
    jsonCredentials?.private_key
      || process.env.GOOGLE_SHEETS_PRIVATE_KEY
      || ""
  ).replaceAll("\\n", "\n").trim();
  return {
    clientEmail,
    privateKey,
    configured: Boolean(clientEmail && privateKey)
  };
}

export function parseGoogleSpreadsheetUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
      return null;
    }
    const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
    if (!match?.[1]) return null;
    return {
      spreadsheetId: match[1],
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${match[1]}/edit`
    };
  } catch {
    return null;
  }
}

function isMigrationMissingError(error) {
  return error?.code === "42P01"
    && String(error?.message || "").includes("finance_google_sheets_exports");
}

function migrationRequiredError() {
  return createMigrationRequiredError(
    "Google Sheets export database migration is required.",
    { migration: "20260705_000001_finance_google_sheets_exports.sql" }
  );
}

function makeGoogleApiError(error, clientEmail) {
  const status = Number(error?.response?.status || error?.code || 0);
  const sourceMessage = String(
    error?.response?.data?.error?.message
      || error?.message
      || ""
  );
  let message = "Google Sheets export failed.";
  let statusCode = 502;
  if (status === 403) {
    statusCode = 400;
    message = `Share the Google Sheet with ${clientEmail} as Editor.`;
  } else if (status === 404) {
    statusCode = 400;
    message = "Google Sheet was not found. Check its URL and sharing settings.";
  } else if (status === 400) {
    statusCode = 400;
    message = sourceMessage || "Google Sheet request is invalid.";
  } else if (status === 401) {
    statusCode = 503;
    message = "Google Sheets service account credentials are invalid.";
  }
  const wrapped = new Error(message);
  wrapped.statusCode = statusCode;
  wrapped.cause = error;
  return wrapped;
}

async function withGoogleRetry(operation) {
  let lastError = null;
  for (let attempt = 0; attempt < GOOGLE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = Number(error?.response?.status || error?.code || 0);
      if (status !== 429 && status < 500) {
        throw error;
      }
      if (attempt < GOOGLE_RETRY_ATTEMPTS - 1) {
        const backoff = Math.min(8000, (2 ** attempt) * 500) + Math.floor(Math.random() * 250);
        await sleep(backoff);
      }
    }
  }
  throw lastError;
}

async function createSheetsClient(credentials) {
  const { google } = await import("googleapis");
  const auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

function getExportYearBounds(year) {
  return [`${year}-01-01`, `${year + 1}-01-01`];
}

function makeTicketExportRow(row, allocatedPaid) {
  const finalAmount = Math.max(toInteger(row.final_amount_uzs), 0);
  const paid = Math.max(Math.min(toInteger(allocatedPaid), finalAmount), 0);
  return [
    toInteger(row.ticket_number),
    toGoogleSheetsDateValue(row.created_at_text),
    row.client_name || "",
    toInteger(row.client_id),
    toGoogleSheetsDateValue(row.ticket_date_text),
    row.service_name || "",
    row.position_label || "",
    row.specialist_name || "",
    TICKET_STATUS_LABELS[row.status] || row.status || "",
    Math.max(toInteger(row.price_uzs), 0),
    Math.max(toInteger(row.discount_uzs), 0),
    finalAmount,
    paid,
    Math.max(finalAmount - paid, 0)
  ];
}

function makeTransactionNote(row) {
  const note = String(row.note || "").trim();
  const reason = String(
    row.metadata?.voidReason
      || row.metadata?.reversalReason
      || row.metadata?.reason
      || ""
  ).trim();
  if (note && reason && !note.includes(reason)) {
    return `${note} | Причина: ${reason}`;
  }
  return note || reason;
}

function makeTransactionExportRow(row) {
  const isCorrected = Boolean(
    row.metadata?.reversalTransactionId
      || row.metadata?.reversedTransactionId
  );
  const status = row.status === "voided"
    ? "Отменена"
    : (isCorrected ? "Скорректирована" : "Активна");
  return [
    toInteger(row.id),
    toGoogleSheetsDateValue(row.transaction_at_text),
    TRANSACTION_ACTION_LABELS[row.transaction_type] || row.transaction_type || "",
    row.ticket_number ? toInteger(row.ticket_number) : "",
    row.client_name || "",
    row.client_id ? toInteger(row.client_id) : "",
    row.payment_method_name || (row.direction === "transfer" ? "Баланс клиента" : ""),
    Math.max(toInteger(row.amount_uzs), 0),
    row.cashier_name || "",
    status,
    makeTransactionNote(row)
  ];
}

async function fetchTicketRows({ organizationId, year, cursor }) {
  const [dateFrom, dateTo] = getExportYearBounds(year);
  const result = await pool.query(
    `WITH ticket_page AS (
       SELECT *
         FROM finance_tickets
        WHERE organization_id = $1
          AND ticket_date >= $2::date
          AND ticket_date < $3::date
          AND id > $4
        ORDER BY id ASC
        LIMIT $5
     )
     SELECT ft.id AS ticket_id,
            ft.ticket_number,
            TO_CHAR(ft.created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS created_at_text,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            ft.client_id,
            TO_CHAR(ft.ticket_date, 'YYYY-MM-DD') AS ticket_date_text,
            COALESCE(fti.service_name, ft.service_name, '') AS service_name,
            COALESCE(ip.label, tp.label, '') AS position_label,
            COALESCE(
              NULLIF(TRIM(iu.full_name), ''),
              NULLIF(TRIM(iu.username), ''),
              NULLIF(TRIM(tu.full_name), ''),
              NULLIF(TRIM(tu.username), ''),
              ''
            ) AS specialist_name,
            ft.status,
            COALESCE(fti.price_uzs, ft.subtotal_uzs, ft.amount_uzs, 0) AS price_uzs,
            COALESCE(fti.discount_uzs, ft.discount_uzs, 0) AS discount_uzs,
            COALESCE(fti.final_amount_uzs, ft.total_uzs, ft.amount_uzs, 0) AS final_amount_uzs,
            COALESCE(fpaid.paid_amount_uzs, 0) AS ticket_paid_amount_uzs,
            COALESCE(fti.line_number, 1) AS line_number,
            COALESCE(fti.id, 0) AS ticket_item_id
       FROM ticket_page ft
       JOIN clients c
         ON c.organization_id = ft.organization_id
        AND c.id = ft.client_id
       LEFT JOIN finance_ticket_items fti
         ON fti.organization_id = ft.organization_id
        AND fti.ticket_id = ft.id
       LEFT JOIN users iu
         ON iu.organization_id = fti.organization_id
        AND iu.id = fti.specialist_id
       LEFT JOIN position_options ip
         ON ip.organization_id = iu.organization_id
        AND ip.id = iu.position_id
       LEFT JOIN users tu
         ON tu.organization_id = ft.organization_id
        AND tu.id = ft.specialist_id
       LEFT JOIN position_options tp
         ON tp.organization_id = tu.organization_id
        AND tp.id = tu.position_id
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
            AND t.transaction_type IN (
              'ticket_payment',
              'deposit_ticket_payment',
              'refund',
              'deposit_ticket_refund'
            )
       ) fpaid ON TRUE
      ORDER BY ft.id ASC, COALESCE(fti.line_number, 1) ASC, COALESCE(fti.id, 0) ASC`,
    [organizationId, dateFrom, dateTo, cursor, TICKET_BATCH_SIZE]
  );
  return result.rows;
}

async function fetchTransactionRows({ organizationId, year, cursor }) {
  const [dateFrom, dateTo] = getExportYearBounds(year);
  const result = await pool.query(
    `SELECT t.id,
            TO_CHAR(t.transaction_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS transaction_at_text,
            t.transaction_type,
            t.direction,
            t.status,
            ft.ticket_number,
            t.client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
            pm.name AS payment_method_name,
            t.amount_uzs,
            COALESCE(NULLIF(TRIM(cu.full_name), ''), NULLIF(TRIM(cu.username), ''), '') AS cashier_name,
            t.note,
            t.metadata
       FROM finance_transactions t
       LEFT JOIN finance_tickets ft
         ON ft.organization_id = t.organization_id
        AND ft.id = t.ticket_id
       LEFT JOIN clients c
         ON c.organization_id = t.organization_id
        AND c.id = t.client_id
       LEFT JOIN finance_payment_methods pm
         ON pm.organization_id = t.organization_id
        AND pm.id = t.payment_method_id
       LEFT JOIN finance_cash_sessions cs
         ON cs.organization_id = t.organization_id
        AND cs.id = t.cash_session_id
       LEFT JOIN users cu
         ON cu.id = cs.cashier_user_id
      WHERE t.organization_id = $1
        AND t.transaction_at >= $2::date
        AND t.transaction_at < $3::date
        AND t.id > $4
      ORDER BY t.id ASC
      LIMIT $5`,
    [organizationId, dateFrom, dateTo, cursor, TRANSACTION_BATCH_SIZE]
  );
  return result.rows;
}

async function fetchBalanceRows({ organizationId, cursor }) {
  const result = await pool.query(
    `SELECT c.id AS client_id,
            CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) AS client_name,
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
                AND t.transaction_type IN (
                  'ticket_payment',
                  'deposit_ticket_payment',
                  'refund',
                  'deposit_ticket_refund'
                )
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
            AND transaction_type IN (
              'deposit_in',
              'deposit_out',
              'deposit_ticket_payment',
              'deposit_ticket_refund'
            )
          GROUP BY client_id
       ) deposit ON deposit.client_id = c.id
      WHERE c.organization_id = $1
        AND c.id > $2
        AND (
          COALESCE(debt.debt_uzs, 0) > 0
          OR COALESCE(deposit.deposit_uzs, 0) <> 0
        )
      ORDER BY c.id ASC
      LIMIT $3`,
    [organizationId, cursor, BALANCE_BATCH_SIZE]
  );
  return result.rows;
}

async function ensureSheets(sheets, spreadsheetId) {
  const metadata = await withGoogleRetry(() => sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title,gridProperties(columnCount))"
  }));
  const existing = new Map(
    (metadata.data.sheets || []).map((sheet) => [
      sheet.properties?.title,
      {
        sheetId: sheet.properties?.sheetId,
        columnCount: Number.parseInt(
          String(sheet.properties?.gridProperties?.columnCount || ""),
          10
        ) || 0
      }
    ])
  );
  const missing = SHEET_DEFINITIONS.filter((definition) => !existing.has(definition.title));
  if (missing.length > 0) {
    const response = await withGoogleRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missing.map((definition) => ({
          addSheet: { properties: { title: definition.title } }
        }))
      }
    }));
    (response.data.replies || []).forEach((reply, index) => {
      existing.set(
        missing[index].title,
        {
          sheetId: reply.addSheet?.properties?.sheetId,
          columnCount: Number.parseInt(
            String(reply.addSheet?.properties?.gridProperties?.columnCount || ""),
            10
          ) || 26
        }
      );
    });
  }
  const columnExpansionRequests = SHEET_DEFINITIONS.flatMap((definition) => {
    const properties = existing.get(definition.title);
    const requiredColumnCount = definition.headers.length;
    if (
      properties?.sheetId === undefined
      || properties?.sheetId === null
      || properties.columnCount >= requiredColumnCount
    ) {
      return [];
    }
    const missingColumnCount = requiredColumnCount - properties.columnCount;
    properties.columnCount = requiredColumnCount;
    return [{
      appendDimension: {
        sheetId: properties.sheetId,
        dimension: "COLUMNS",
        length: missingColumnCount
      }
    }];
  });
  if (columnExpansionRequests.length > 0) {
    await withGoogleRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: columnExpansionRequests }
    }));
  }
  return existing;
}

async function prepareSheets({ sheets, spreadsheetId }) {
  const sheetProperties = await ensureSheets(sheets, spreadsheetId);
  const sheetIds = new Map(
    Array.from(sheetProperties, ([title, properties]) => [title, properties.sheetId])
  );
  await withGoogleRetry(() => sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: {
      ranges: SHEET_DEFINITIONS.map((definition) => (
        `${escapeA1SheetTitle(definition.title)}!A:${getSheetClearLastColumn(
          definition,
          sheetProperties.get(definition.title)?.columnCount
        )}`
      ))
    }
  }));

  for (const definition of SHEET_DEFINITIONS) {
    await withGoogleRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${escapeA1SheetTitle(definition.title)}!A1:${definition.lastColumn}1`,
      valueInputOption: "RAW",
      requestBody: { values: [definition.headers] }
    }));
  }

  const formatRequests = [];
  SHEET_DEFINITIONS.forEach((definition) => {
    const sheetId = sheetIds.get(definition.title);
    formatRequests.push(
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { frozenRowCount: 1 }
          },
          fields: "gridProperties.frozenRowCount"
        }
      },
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: definition.headers.length
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.12, green: 0.47, blue: 0.27 },
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true
              },
              horizontalAlignment: "CENTER"
            }
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
        }
      }
    );
    definition.moneyColumns.forEach((columnIndex) => {
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          },
          cell: {
            userEnteredFormat: {
              numberFormat: { type: "NUMBER", pattern: "#,##0" }
            }
          },
          fields: "userEnteredFormat.numberFormat"
        }
      });
    });
    definition.dateColumns.forEach(({ columnIndex, pattern }) => {
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1
          },
          cell: {
            userEnteredFormat: {
              numberFormat: { type: "DATE_TIME", pattern }
            }
          },
          fields: "userEnteredFormat.numberFormat"
        }
      });
    });
    const clearedColumnCount = columnLetterToIndex(
      definition.clearLastColumn || definition.lastColumn
    );
    const availableColumnCount = sheetProperties.get(definition.title)?.columnCount || 0;
    const clearEndColumnIndex = Math.min(clearedColumnCount, availableColumnCount);
    if (clearEndColumnIndex > definition.headers.length) {
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: definition.headers.length,
            endColumnIndex: clearEndColumnIndex
          },
          cell: {
            userEnteredFormat: {}
          },
          fields: "userEnteredFormat"
        }
      });
    }
  });
  await withGoogleRetry(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: formatRequests }
  }));
  return sheetIds;
}

async function resizeSheetColumns({ sheets, spreadsheetId, sheetIds }) {
  await withGoogleRetry(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: SHEET_DEFINITIONS.map((definition) => ({
        autoResizeDimensions: {
          dimensions: {
            sheetId: sheetIds.get(definition.title),
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: definition.headers.length
          }
        }
      }))
    }
  }));
}

function createSheetWriter({ sheets, spreadsheetId }) {
  let nextWriteAt = 0;
  return async function writeRows(definition, startRow, rows) {
    let offset = 0;
    while (offset < rows.length) {
      const chunk = rows.slice(offset, offset + SHEETS_WRITE_CHUNK_SIZE);
      const waitMs = Math.max(0, nextWriteAt - Date.now());
      if (waitMs > 0) await sleep(waitMs);
      await withGoogleRetry(() => sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${escapeA1SheetTitle(definition.title)}!A${startRow + offset}`,
        valueInputOption: "RAW",
        requestBody: { values: chunk }
      }));
      nextWriteAt = Date.now() + WRITE_THROTTLE_MS;
      offset += chunk.length;
    }
  };
}

async function exportTickets({ organizationId, year, writeRows }) {
  const definition = SHEET_DEFINITIONS[0];
  let cursor = 0;
  let outputRow = 2;
  let totalRows = 0;
  while (true) {
    const sourceRows = await fetchTicketRows({ organizationId, year, cursor });
    if (sourceRows.length === 0) break;
    const paidAllocatedByTicket = new Map();
    const rows = sourceRows.map((row) => {
      const alreadyAllocated = paidAllocatedByTicket.get(row.ticket_id) || 0;
      const available = Math.max(toInteger(row.ticket_paid_amount_uzs) - alreadyAllocated, 0);
      const allocated = Math.min(available, Math.max(toInteger(row.final_amount_uzs), 0));
      paidAllocatedByTicket.set(row.ticket_id, alreadyAllocated + allocated);
      return makeTicketExportRow(row, allocated);
    });
    await writeRows(definition, outputRow, rows);
    outputRow += rows.length;
    totalRows += rows.length;
    cursor = Math.max(...sourceRows.map((row) => toInteger(row.ticket_id)));
  }
  return totalRows;
}

async function exportTransactions({ organizationId, year, writeRows }) {
  const definition = SHEET_DEFINITIONS[1];
  let cursor = 0;
  let outputRow = 2;
  let totalRows = 0;
  while (true) {
    const sourceRows = await fetchTransactionRows({ organizationId, year, cursor });
    if (sourceRows.length === 0) break;
    const rows = sourceRows.map(makeTransactionExportRow);
    await writeRows(definition, outputRow, rows);
    outputRow += rows.length;
    totalRows += rows.length;
    cursor = toInteger(sourceRows[sourceRows.length - 1]?.id);
  }
  return totalRows;
}

async function exportBalances({ organizationId, writeRows }) {
  const definition = SHEET_DEFINITIONS[2];
  let cursor = 0;
  let outputRow = 2;
  let totalRows = 0;
  while (true) {
    const sourceRows = await fetchBalanceRows({ organizationId, cursor });
    if (sourceRows.length === 0) break;
    const rows = sourceRows.map((row) => [
      toInteger(row.client_id),
      row.client_name || "",
      Math.max(toInteger(row.debt_uzs), 0),
      toInteger(row.deposit_uzs)
    ]);
    await writeRows(definition, outputRow, rows);
    outputRow += rows.length;
    totalRows += rows.length;
    cursor = toInteger(sourceRows[sourceRows.length - 1]?.client_id);
  }
  return totalRows;
}

async function saveExportSuccess({
  organizationId,
  year,
  spreadsheetId,
  spreadsheetUrl,
  actorUserId,
  counts
}) {
  try {
    await pool.query(
      `INSERT INTO finance_google_sheets_exports (
         organization_id,
         export_year,
         spreadsheet_id,
         spreadsheet_url,
         last_exported_at,
         last_exported_by,
         last_export_status,
         last_export_error,
         last_export_counts,
         created_by,
         updated_by
       )
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, 'success', NULL, $6::jsonb, $5, $5)
       ON CONFLICT (organization_id, export_year)
       DO UPDATE SET spreadsheet_id = EXCLUDED.spreadsheet_id,
                     spreadsheet_url = EXCLUDED.spreadsheet_url,
                     last_exported_at = CURRENT_TIMESTAMP,
                     last_exported_by = EXCLUDED.last_exported_by,
                     last_export_status = 'success',
                     last_export_error = NULL,
                     last_export_counts = EXCLUDED.last_export_counts,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = CURRENT_TIMESTAMP`,
      [
        organizationId,
        year,
        spreadsheetId,
        spreadsheetUrl,
        actorUserId || null,
        JSON.stringify(counts)
      ]
    );
  } catch (error) {
    if (isMigrationMissingError(error)) throw migrationRequiredError();
    throw error;
  }
}

export async function getFinanceGoogleSheetsConfig({ organizationId, year }) {
  const exportYear = normalizeYear(year);
  if (!exportYear) {
    const error = new Error("Export year is invalid.");
    error.statusCode = 400;
    throw error;
  }
  const credentials = getGoogleCredentials();
  try {
    const result = await pool.query(
      `SELECT export_year,
              spreadsheet_url,
              last_exported_at,
              last_export_status,
              last_export_error,
              last_export_counts
         FROM finance_google_sheets_exports
        WHERE organization_id = $1
          AND export_year = $2
        LIMIT 1`,
      [organizationId, exportYear]
    );
    const row = result.rows[0] || {};
    return {
      year: exportYear,
      configured: credentials.configured,
      serviceAccountEmail: credentials.clientEmail,
      spreadsheetUrl: row.spreadsheet_url || "",
      lastExportedAt: row.last_exported_at || null,
      lastExportStatus: row.last_export_status || "",
      lastExportError: row.last_export_error || "",
      lastExportCounts: row.last_export_counts || {}
    };
  } catch (error) {
    if (isMigrationMissingError(error)) throw migrationRequiredError();
    throw error;
  }
}

export async function exportFinanceToGoogleSheets({
  organizationId,
  year,
  spreadsheetUrl,
  actorUserId
}) {
  const exportYear = normalizeYear(year);
  if (!exportYear) {
    const error = new Error("Export year is invalid.");
    error.statusCode = 400;
    throw error;
  }
  const spreadsheet = parseGoogleSpreadsheetUrl(spreadsheetUrl);
  if (!spreadsheet) {
    const error = new Error("Enter a valid Google Sheets URL.");
    error.statusCode = 400;
    throw error;
  }
  const credentials = getGoogleCredentials();
  if (!credentials.configured) {
    const error = new Error("Google Sheets service account is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const sheets = await createSheetsClient(credentials);
  try {
    const sheetIds = await prepareSheets({ sheets, spreadsheetId: spreadsheet.spreadsheetId });
    const writeRows = createSheetWriter({
      sheets,
      spreadsheetId: spreadsheet.spreadsheetId
    });
    const tickets = await exportTickets({ organizationId, year: exportYear, writeRows });
    const transactions = await exportTransactions({ organizationId, year: exportYear, writeRows });
    const balances = await exportBalances({ organizationId, writeRows });
    await resizeSheetColumns({
      sheets,
      spreadsheetId: spreadsheet.spreadsheetId,
      sheetIds
    });
    const counts = { tickets, transactions, balances };
    await saveExportSuccess({
      organizationId,
      year: exportYear,
      spreadsheetId: spreadsheet.spreadsheetId,
      spreadsheetUrl: spreadsheet.spreadsheetUrl,
      actorUserId,
      counts
    });
    return {
      year: exportYear,
      spreadsheetUrl: spreadsheet.spreadsheetUrl,
      serviceAccountEmail: credentials.clientEmail,
      counts
    };
  } catch (error) {
    if (
      error?.statusCode
      || error?.code === "MIGRATION_REQUIRED"
      || String(error?.code || "").startsWith("23")
      || String(error?.code || "").startsWith("42")
    ) {
      throw error;
    }
    throw makeGoogleApiError(error, credentials.clientEmail);
  }
}

export const __financeGoogleSheetsContracts = Object.freeze({
  SHEET_DEFINITIONS,
  makeTicketExportRow,
  makeTransactionExportRow,
  normalizeYear,
  parseGoogleSpreadsheetUrl,
  toGoogleSheetsDateValue,
  getSheetClearLastColumn
});
