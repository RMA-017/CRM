CREATE TABLE IF NOT EXISTS finance_payment_methods (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(96) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_finance_payment_methods_org_id UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_payment_methods_org_name
  ON finance_payment_methods (organization_id, LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_finance_payment_methods_org_active_sort
  ON finance_payment_methods (organization_id, is_active, sort_order, name);
