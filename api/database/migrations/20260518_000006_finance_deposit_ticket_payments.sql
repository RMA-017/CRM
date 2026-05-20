ALTER TABLE finance_ticket_payments
  ALTER COLUMN payment_method_id DROP NOT NULL;

ALTER TABLE finance_transactions
  ALTER COLUMN payment_method_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'finance_transactions_transaction_type_check'
       AND conrelid = 'finance_transactions'::regclass
  ) THEN
    ALTER TABLE finance_transactions
      DROP CONSTRAINT finance_transactions_transaction_type_check;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'finance_transactions_direction_check'
       AND conrelid = 'finance_transactions'::regclass
  ) THEN
    ALTER TABLE finance_transactions
      DROP CONSTRAINT finance_transactions_direction_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_finance_transactions_type'
       AND conrelid = 'finance_transactions'::regclass
  ) THEN
    ALTER TABLE finance_transactions
      ADD CONSTRAINT chk_finance_transactions_type
      CHECK (transaction_type IN ('ticket_payment', 'deposit_in', 'deposit_out', 'deposit_ticket_payment', 'deposit_ticket_refund', 'refund', 'correction'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_finance_transactions_direction'
       AND conrelid = 'finance_transactions'::regclass
  ) THEN
    ALTER TABLE finance_transactions
      ADD CONSTRAINT chk_finance_transactions_direction
      CHECK (direction IN ('in', 'out', 'transfer'));
  END IF;
END $$;
