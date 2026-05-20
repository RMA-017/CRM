CREATE TABLE IF NOT EXISTS finance_cash_sessions (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cashier_user_id INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  opening_balance_uzs INTEGER NOT NULL DEFAULT 0 CHECK (opening_balance_uzs >= 0),
  closing_balance_uzs INTEGER CHECK (closing_balance_uzs >= 0),
  expected_balance_uzs INTEGER CHECK (expected_balance_uzs >= 0),
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  note VARCHAR(255),
  close_note VARCHAR(255),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_finance_cash_sessions_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_finance_cash_sessions_cashier_org
    FOREIGN KEY (organization_id, cashier_user_id)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CHECK (status IN ('open', 'closed')),
  CHECK (
    (status = 'open' AND closed_at IS NULL)
    OR
    (status = 'closed' AND closed_at IS NOT NULL)
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'uq_finance_ticket_payments_org_id'
       AND conrelid = 'finance_ticket_payments'::regclass
  ) THEN
    ALTER TABLE finance_ticket_payments
      ADD CONSTRAINT uq_finance_ticket_payments_org_id UNIQUE (organization_id, id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_cash_sessions_org_cashier_open
  ON finance_cash_sessions (organization_id, cashier_user_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_finance_cash_sessions_org_opened
  ON finance_cash_sessions (organization_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cash_session_id BIGINT NOT NULL,
  transaction_type VARCHAR(32) NOT NULL,
  direction VARCHAR(8) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'posted',
  client_id INTEGER,
  ticket_id BIGINT,
  ticket_payment_id BIGINT,
  payment_method_id INTEGER,
  amount_uzs INTEGER NOT NULL CHECK (amount_uzs > 0),
  transaction_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  voided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  voided_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_finance_transactions_session_org
    FOREIGN KEY (organization_id, cash_session_id)
    REFERENCES finance_cash_sessions(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_transactions_client_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES clients(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_transactions_ticket_org
    FOREIGN KEY (organization_id, ticket_id)
    REFERENCES finance_tickets(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_transactions_ticket_payment_org
    FOREIGN KEY (organization_id, ticket_payment_id)
    REFERENCES finance_ticket_payments(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_transactions_method_org
    FOREIGN KEY (organization_id, payment_method_id)
    REFERENCES finance_payment_methods(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_finance_transactions_type
    CHECK (transaction_type IN ('ticket_payment', 'deposit_in', 'deposit_out', 'deposit_ticket_payment', 'deposit_ticket_refund', 'refund', 'correction')),
  CONSTRAINT chk_finance_transactions_direction
    CHECK (direction IN ('in', 'out', 'transfer')),
  CHECK (status IN ('posted', 'voided')),
  CHECK (
    (status = 'posted' AND voided_at IS NULL)
    OR
    (status = 'voided' AND voided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_org_date
  ON finance_transactions (organization_id, transaction_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_org_session
  ON finance_transactions (organization_id, cash_session_id, transaction_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_org_client
  ON finance_transactions (organization_id, client_id, transaction_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_org_method
  ON finance_transactions (organization_id, payment_method_id, transaction_at DESC);
