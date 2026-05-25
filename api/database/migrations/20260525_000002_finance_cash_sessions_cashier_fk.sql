DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_finance_cash_sessions_cashier_org'
       AND conrelid = 'finance_cash_sessions'::regclass
  ) THEN
    ALTER TABLE finance_cash_sessions
      DROP CONSTRAINT fk_finance_cash_sessions_cashier_org;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_finance_cash_sessions_cashier_user'
       AND conrelid = 'finance_cash_sessions'::regclass
  ) THEN
    ALTER TABLE finance_cash_sessions
      ADD CONSTRAINT fk_finance_cash_sessions_cashier_user
      FOREIGN KEY (cashier_user_id)
      REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
END $$;
