CREATE TABLE IF NOT EXISTS finance_payment_groups (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cash_session_id BIGINT NOT NULL,
  total_amount_uzs INTEGER NOT NULL CHECK (total_amount_uzs > 0),
  note VARCHAR(255),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_finance_payment_groups_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_finance_payment_groups_session_org
    FOREIGN KEY (organization_id, cash_session_id)
    REFERENCES finance_cash_sessions(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE finance_ticket_payments
  ADD COLUMN IF NOT EXISTS payment_group_id BIGINT;

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS payment_group_id BIGINT;

ALTER TABLE finance_ticket_payments
  ALTER COLUMN payment_method_id DROP NOT NULL;

ALTER TABLE finance_transactions
  ALTER COLUMN payment_method_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_finance_ticket_payments_group_org'
       AND conrelid = 'finance_ticket_payments'::regclass
  ) THEN
    ALTER TABLE finance_ticket_payments
      ADD CONSTRAINT fk_finance_ticket_payments_group_org
      FOREIGN KEY (organization_id, payment_group_id)
      REFERENCES finance_payment_groups(organization_id, id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_finance_transactions_group_org'
       AND conrelid = 'finance_transactions'::regclass
  ) THEN
    ALTER TABLE finance_transactions
      ADD CONSTRAINT fk_finance_transactions_group_org
      FOREIGN KEY (organization_id, payment_group_id)
      REFERENCES finance_payment_groups(organization_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_finance_payment_groups_org_session
  ON finance_payment_groups (organization_id, cash_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_ticket_payments_org_group
  ON finance_ticket_payments (organization_id, payment_group_id);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_org_group
  ON finance_transactions (organization_id, payment_group_id);
