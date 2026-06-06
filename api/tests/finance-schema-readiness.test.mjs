import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_FINANCE_CONSTRAINTS,
  REQUIRED_FINANCE_INDEXES,
  REQUIRED_FINANCE_NULLABLE_COLUMNS,
  REQUIRED_FINANCE_TABLE_COLUMNS,
  buildFinanceSchemaReadinessReport
} from "../src/config/finance-schema-readiness.js";

function isRequiredNullableColumn(tableName, columnName) {
  return (REQUIRED_FINANCE_NULLABLE_COLUMNS[tableName] || []).includes(columnName);
}

function buildCompleteSchemaSnapshot() {
  return {
    tables: Object.keys(REQUIRED_FINANCE_TABLE_COLUMNS),
    columns: Object.entries(REQUIRED_FINANCE_TABLE_COLUMNS).flatMap(([tableName, columnNames]) => (
      columnNames.map((columnName) => ({
        tableName,
        columnName,
        isNullable: isRequiredNullableColumn(tableName, columnName) ? "YES" : "NO"
      }))
    )),
    constraints: [...REQUIRED_FINANCE_CONSTRAINTS],
    indexes: [...REQUIRED_FINANCE_INDEXES]
  };
}

test("finance schema readiness passes when all required objects exist", () => {
  const report = buildFinanceSchemaReadinessReport(buildCompleteSchemaSnapshot());

  assert.deepEqual(report.errors, []);
  assert.equal(report.tableCount, Object.keys(REQUIRED_FINANCE_TABLE_COLUMNS).length);
  assert.equal(report.constraintCount, REQUIRED_FINANCE_CONSTRAINTS.length);
  assert.equal(report.indexCount, REQUIRED_FINANCE_INDEXES.length);
});

test("finance schema readiness reports missing tables, columns, constraints and indexes", () => {
  const snapshot = buildCompleteSchemaSnapshot();
  const report = buildFinanceSchemaReadinessReport({
    tables: snapshot.tables.filter((tableName) => tableName !== "finance_transactions"),
    columns: snapshot.columns.filter((column) => (
      !(column.tableName === "finance_tickets" && column.columnName === "total_uzs")
    )),
    constraints: snapshot.constraints.filter((constraintName) => (
      constraintName !== "chk_finance_transactions_type"
    )),
    indexes: snapshot.indexes.filter((indexName) => (
      indexName !== "uq_finance_tickets_org_appointment"
    ))
  });

  assert.ok(report.errors.includes("Missing finance table: finance_transactions"));
  assert.ok(report.errors.includes("Missing finance column: finance_tickets.total_uzs"));
  assert.ok(report.errors.includes("Missing finance constraint: chk_finance_transactions_type"));
  assert.ok(report.errors.includes("Missing finance index: uq_finance_tickets_org_appointment"));
});

test("finance schema readiness catches payment method columns that still block deposit transfers", () => {
  const snapshot = buildCompleteSchemaSnapshot();
  const report = buildFinanceSchemaReadinessReport({
    ...snapshot,
    columns: snapshot.columns.map((column) => (
      column.tableName === "finance_ticket_payments" && column.columnName === "payment_method_id"
        ? { ...column, isNullable: "NO" }
        : column
    ))
  });

  assert.ok(report.errors.includes("Finance column must be nullable: finance_ticket_payments.payment_method_id"));
});
