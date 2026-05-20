export const REQUIRED_FINANCE_TABLE_COLUMNS = Object.freeze({
  service_catalog: [
    "id",
    "organization_id",
    "position_id",
    "name",
    "price_uzs",
    "is_active",
    "created_by",
    "updated_by",
    "created_at",
    "updated_at"
  ],
  finance_payment_methods: [
    "id",
    "organization_id",
    "name",
    "sort_order",
    "is_active",
    "created_by",
    "updated_by",
    "created_at",
    "updated_at"
  ],
  appointment_schedules: [
    "service_id",
    "service_price_uzs"
  ],
  finance_tickets: [
    "id",
    "organization_id",
    "ticket_number",
    "ticket_date",
    "source",
    "appointment_schedule_id",
    "client_id",
    "specialist_id",
    "service_id",
    "service_name",
    "amount_uzs",
    "subtotal_uzs",
    "discount_uzs",
    "total_uzs",
    "status",
    "note",
    "created_by",
    "updated_by",
    "created_at",
    "updated_at"
  ],
  finance_ticket_counters: [
    "organization_id",
    "next_ticket_number"
  ],
  finance_ticket_items: [
    "id",
    "organization_id",
    "ticket_id",
    "line_number",
    "specialist_id",
    "service_id",
    "service_name",
    "price_uzs",
    "discount_type",
    "discount_value",
    "discount_uzs",
    "final_amount_uzs",
    "created_at"
  ],
  finance_ticket_payments: [
    "id",
    "organization_id",
    "ticket_id",
    "payment_method_id",
    "amount_uzs",
    "paid_at",
    "note",
    "created_by",
    "created_at"
  ],
  finance_ticket_history: [
    "id",
    "organization_id",
    "ticket_id",
    "action",
    "from_status",
    "to_status",
    "details",
    "changed_by",
    "changed_at"
  ],
  finance_cash_sessions: [
    "id",
    "organization_id",
    "cashier_user_id",
    "status",
    "opening_balance_uzs",
    "closing_balance_uzs",
    "expected_balance_uzs",
    "opened_at",
    "closed_at",
    "note",
    "close_note",
    "created_by",
    "closed_by",
    "created_at",
    "updated_at"
  ],
  finance_transactions: [
    "id",
    "organization_id",
    "cash_session_id",
    "transaction_type",
    "direction",
    "status",
    "client_id",
    "ticket_id",
    "ticket_payment_id",
    "payment_method_id",
    "amount_uzs",
    "transaction_at",
    "note",
    "metadata",
    "created_by",
    "voided_by",
    "voided_at",
    "created_at",
    "updated_at"
  ]
});

export const REQUIRED_FINANCE_CONSTRAINTS = Object.freeze([
  "uq_service_catalog_org_id",
  "fk_service_catalog_position_org",
  "uq_finance_payment_methods_org_id",
  "fk_appointment_schedules_service_org",
  "uq_finance_tickets_org_id",
  "uq_finance_tickets_org_number",
  "fk_finance_tickets_client_org",
  "fk_finance_tickets_specialist_org",
  "fk_finance_tickets_service_org",
  "fk_finance_ticket_items_ticket_org",
  "fk_finance_ticket_items_specialist_org",
  "fk_finance_ticket_items_service_org",
  "fk_finance_ticket_payments_ticket_org",
  "fk_finance_ticket_payments_method_org",
  "uq_finance_ticket_payments_org_id",
  "fk_finance_ticket_history_ticket_org",
  "uq_finance_cash_sessions_org_id",
  "fk_finance_cash_sessions_cashier_org",
  "fk_finance_transactions_session_org",
  "fk_finance_transactions_client_org",
  "fk_finance_transactions_ticket_org",
  "fk_finance_transactions_ticket_payment_org",
  "fk_finance_transactions_method_org",
  "chk_finance_transactions_type",
  "chk_finance_transactions_direction"
]);

export const REQUIRED_FINANCE_INDEXES = Object.freeze([
  "uq_service_catalog_org_name",
  "idx_service_catalog_org_active_position",
  "uq_finance_payment_methods_org_name",
  "idx_finance_payment_methods_org_active_sort",
  "uq_finance_tickets_org_appointment",
  "idx_finance_tickets_org_status_created",
  "idx_finance_tickets_org_client_created",
  "idx_finance_ticket_items_org_ticket",
  "idx_finance_ticket_payments_org_paid",
  "idx_finance_ticket_history_org_ticket",
  "uq_finance_cash_sessions_org_cashier_open",
  "idx_finance_cash_sessions_org_opened",
  "idx_finance_transactions_org_date",
  "idx_finance_transactions_org_session",
  "idx_finance_transactions_org_client",
  "idx_finance_transactions_org_method"
]);

function toNameSet(values) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
}

function buildColumnSet(columns) {
  const result = new Set();
  for (const column of Array.isArray(columns) ? columns : []) {
    const tableName = String(column?.tableName || column?.table_name || "").trim();
    const columnName = String(column?.columnName || column?.column_name || "").trim();
    if (tableName && columnName) {
      result.add(`${tableName}.${columnName}`);
    }
  }
  return result;
}

export function buildFinanceSchemaReadinessReport({
  tables = [],
  columns = [],
  constraints = [],
  indexes = []
} = {}) {
  const errors = [];
  const warnings = [];
  const tableSet = toNameSet(tables);
  const constraintSet = toNameSet(constraints);
  const indexSet = toNameSet(indexes);
  const columnSet = buildColumnSet(columns);

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_FINANCE_TABLE_COLUMNS)) {
    if (!tableSet.has(tableName)) {
      errors.push(`Missing finance table: ${tableName}`);
      continue;
    }
    for (const columnName of requiredColumns) {
      if (!columnSet.has(`${tableName}.${columnName}`)) {
        errors.push(`Missing finance column: ${tableName}.${columnName}`);
      }
    }
  }

  for (const constraintName of REQUIRED_FINANCE_CONSTRAINTS) {
    if (!constraintSet.has(constraintName)) {
      errors.push(`Missing finance constraint: ${constraintName}`);
    }
  }

  for (const indexName of REQUIRED_FINANCE_INDEXES) {
    if (!indexSet.has(indexName)) {
      errors.push(`Missing finance index: ${indexName}`);
    }
  }

  return {
    errors,
    warnings,
    tableCount: tableSet.size,
    constraintCount: constraintSet.size,
    indexCount: indexSet.size,
    requiredTableCount: Object.keys(REQUIRED_FINANCE_TABLE_COLUMNS).length,
    requiredConstraintCount: REQUIRED_FINANCE_CONSTRAINTS.length,
    requiredIndexCount: REQUIRED_FINANCE_INDEXES.length
  };
}

export async function getFinanceSchemaReadiness({ db } = {}) {
  const requiredTables = Object.keys(REQUIRED_FINANCE_TABLE_COLUMNS);
  const [tablesResult, columnsResult, constraintsResult, indexesResult] = await Promise.all([
    db.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = ANY($1::text[])`,
      [requiredTables]
    ),
    db.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = ANY($1::text[])`,
      [requiredTables]
    ),
    db.query(
      `SELECT conname AS constraint_name
         FROM pg_constraint
        WHERE conname = ANY($1::text[])`,
      [REQUIRED_FINANCE_CONSTRAINTS]
    ),
    db.query(
      `SELECT indexname AS index_name
         FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = ANY($1::text[])`,
      [REQUIRED_FINANCE_INDEXES]
    )
  ]);

  return buildFinanceSchemaReadinessReport({
    tables: (tablesResult.rows || []).map((row) => row.table_name),
    columns: (columnsResult.rows || []).map((row) => ({
      tableName: row.table_name,
      columnName: row.column_name
    })),
    constraints: (constraintsResult.rows || []).map((row) => row.constraint_name),
    indexes: (indexesResult.rows || []).map((row) => row.index_name)
  });
}
