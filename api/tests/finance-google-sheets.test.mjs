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
    "Кассовая сессия",
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
  const ticketRow = __financeGoogleSheetsContracts.makeTicketExportRow({
    ticket_number: 10001,
    created_at_text: "2026-07-05 09:00:00",
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
    transaction_at_text: "2026-07-05 09:05:00",
    transaction_type: "ticket_payment",
    direction: "in",
    status: "voided",
    ticket_number: 10001,
    client_name: "Test Client",
    client_id: 1000,
    payment_method_name: "Наличные",
    amount_uzs: 40000,
    cashier_name: "Cashier",
    cash_session_id: 12,
    cash_session_opened_at_text: "2026-07-05 08:00:00",
    note: "",
    metadata: { voidReason: "Ошибка кассира" }
  });
  assert.equal(transactionRow[2], "Оплата талона");
  assert.equal(transactionRow[9], "#12 / 2026-07-05 08:00:00");
  assert.equal(transactionRow[10], "Отменена");
  assert.equal(transactionRow[11], "Ошибка кассира");
});

test("Google Sheets export preserves formula columns and uses report access", () => {
  assert.match(
    serviceSource,
    /ranges: SHEET_DEFINITIONS\.map[\s\S]*definition\.clearLastColumn \|\| definition\.lastColumn/s,
    "Only CRM-owned columns should be cleared."
  );
  assert.match(
    serviceSource,
    /SHEET_DEFINITIONS[\s\S]*lastColumn: "N"[\s\S]*lastColumn: "L"[\s\S]*lastColumn: "D"[\s\S]*clearLastColumn: "E"/s,
    "Clear ranges should stop before user formula columns."
  );
  assert.match(
    routesSource,
    /"\/reports\/google-sheets\/config"[\s\S]*requireReportsAccess\(request, reply, "read"\)[\s\S]*"\/reports\/google-sheets\/export"[\s\S]*requireReportsAccess\(request, reply, "read"\)/s,
    "Both endpoints should use the existing finance reports permission."
  );
});
