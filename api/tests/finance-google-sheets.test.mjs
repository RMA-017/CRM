import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  __financeGoogleSheetsContracts,
  parseGoogleSpreadsheetUrl
} from "../src/modules/finance/finance-google-sheets.service.js";

const serviceSource = await readFile(
  new URL("../src/modules/finance/finance-google-sheets.service.js", import.meta.url),
  "utf8"
);
const routesSource = await readFile(
  new URL("../src/modules/finance/finance.routes.js", import.meta.url),
  "utf8"
);

test("finance Google Sheets export accepts only canonical spreadsheet links", () => {
  assert.deepEqual(
    parseGoogleSpreadsheetUrl("https://docs.google.com/spreadsheets/d/sheet_ID-123/edit#gid=0"),
    {
      spreadsheetId: "sheet_ID-123",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet_ID-123/edit"
    }
  );
  assert.equal(parseGoogleSpreadsheetUrl("https://example.com/spreadsheets/d/sheet_ID-123"), null);
  assert.equal(parseGoogleSpreadsheetUrl("http://docs.google.com/spreadsheets/d/sheet_ID-123"), null);
  assert.equal(parseGoogleSpreadsheetUrl("not-a-url"), null);
});

test("finance Google Sheets export owns the agreed Russian tabs and columns", () => {
  const definitions = __financeGoogleSheetsContracts.SHEET_DEFINITIONS;
  assert.deepEqual(definitions.map((item) => item.title), [
    "Талоны",
    "Транзакции",
    "Балансы клиентов"
  ]);
  assert.deepEqual(definitions[0].headers, [
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
  ]);
  assert.deepEqual(definitions[1].headers, [
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
  ]);
  assert.deepEqual(definitions[2].headers, [
    "ID клиента",
    "Клиент",
    "Долг",
    "Депозит"
  ]);
});

test("ticket and transaction export rows preserve finance audit values", () => {
  const expectedTicketDate = __financeGoogleSheetsContracts.toGoogleSheetsDateValue("2026-07-05");
  const expectedTicketCreatedAt = __financeGoogleSheetsContracts.toGoogleSheetsDateValue("2026-07-05 09:00");
  const ticketRow = __financeGoogleSheetsContracts.makeTicketExportRow({
    ticket_number: 10001,
    created_at_text: "2026-07-05 09:00",
    client_name: "Test Client",
    client_id: 1000,
    ticket_date_text: "2026-07-05",
    service_name: "Service",
    position_label: "Department",
    specialist_name: "Specialist",
    status: "unpaid",
    price_uzs: 100000,
    discount_uzs: 10000,
    final_amount_uzs: 90000
  }, 40000);
  assert.equal(ticketRow[1], expectedTicketCreatedAt);
  assert.equal(ticketRow[4], expectedTicketDate);
  assert.deepEqual(ticketRow.slice(8), [
    "Частично оплачен",
    100000,
    10000,
    90000,
    40000,
    50000
  ]);

  const transactionRow = __financeGoogleSheetsContracts.makeTransactionExportRow({
    id: 77,
    transaction_at_text: "2026-07-05 09:05",
    transaction_type: "ticket_payment",
    direction: "in",
    status: "voided",
    ticket_number: 10001,
    client_name: "Test Client",
    client_id: 1000,
    payment_method_name: "Наличные",
    amount_uzs: 40000,
    cashier_name: "Cashier",
    note: "",
    metadata: { voidReason: "Ошибка кассира" }
  });
  assert.equal(
    transactionRow[1],
    __financeGoogleSheetsContracts.toGoogleSheetsDateValue("2026-07-05 09:05")
  );
  assert.equal(transactionRow[2], "Оплата талона");
  assert.equal(transactionRow[9], "Отменена");
  assert.equal(transactionRow[10], "Ошибка кассира");
});

test("Google Sheets export stores real dates with the unified day-month-year format", () => {
  assert.equal(__financeGoogleSheetsContracts.toGoogleSheetsDateValue("invalid"), "");
  assert.equal(__financeGoogleSheetsContracts.toGoogleSheetsDateValue("2026-02-30"), "");
  assert.deepEqual(__financeGoogleSheetsContracts.SHEET_DEFINITIONS[0].dateColumns, [
    { columnIndex: 1, pattern: "dd.mm.yyyy hh:mm" },
    { columnIndex: 4, pattern: "dd.mm.yyyy" }
  ]);
  assert.deepEqual(__financeGoogleSheetsContracts.SHEET_DEFINITIONS[1].dateColumns, [
    { columnIndex: 1, pattern: "dd.mm.yyyy hh:mm" }
  ]);
  assert.match(
    serviceSource,
    /AT TIME ZONE 'Asia\/Tashkent'[\s\S]*definition\.dateColumns\.forEach[\s\S]*numberFormat: \{ type: "DATE_TIME", pattern \}/s,
    "Timestamp exports should use Tashkent time and Google Sheets date formatting."
  );
});

test("Google Sheets export preserves formula columns and uses report access", () => {
  assert.match(
    serviceSource,
    /ranges: SHEET_DEFINITIONS\.map[\s\S]*definition\.clearLastColumn \|\| definition\.lastColumn/s,
    "Only CRM-owned columns should be cleared."
  );
  assert.match(
    serviceSource,
    /SHEET_DEFINITIONS[\s\S]*lastColumn: "N"[\s\S]*lastColumn: "K"[\s\S]*clearLastColumn: "L"[\s\S]*lastColumn: "D"[\s\S]*clearLastColumn: "E"/s,
    "Clear ranges should stop before user formula columns."
  );
  assert.match(
    serviceSource,
    /clearedColumnCount > definition\.headers\.length[\s\S]*startColumnIndex: definition\.headers\.length[\s\S]*cell: \{[\s\S]*userEnteredFormat: \{\}[\s\S]*fields: "userEnteredFormat"/s,
    "Retired exported columns should lose their old header formatting."
  );
  assert.match(
    routesSource,
    /"\/reports\/google-sheets\/config"[\s\S]*requireReportsAccess\(request, reply, "read"\)[\s\S]*"\/reports\/google-sheets\/export"[\s\S]*requireReportsAccess\(request, reply, "read"\)/s,
    "Both endpoints should use the existing finance reports permission."
  );
});
