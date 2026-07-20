ALTER TABLE finance_client_discount_rules
  ADD COLUMN IF NOT EXISTS disabled_reason VARCHAR(255),
  ADD COLUMN IF NOT EXISTS disabled_by INTEGER,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP;

UPDATE finance_client_discount_rules
   SET disabled_reason = 'Отключено ранее',
       disabled_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
 WHERE is_active = FALSE
   AND NULLIF(BTRIM(COALESCE(disabled_reason, '')), '') IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_finance_client_discount_rules_disabled_by'
  ) THEN
    ALTER TABLE finance_client_discount_rules
      ADD CONSTRAINT fk_finance_client_discount_rules_disabled_by
      FOREIGN KEY (disabled_by)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_finance_client_discount_rules_disabled_reason'
  ) THEN
    ALTER TABLE finance_client_discount_rules
      ADD CONSTRAINT chk_finance_client_discount_rules_disabled_reason
      CHECK (is_active = TRUE OR NULLIF(BTRIM(COALESCE(disabled_reason, '')), '') IS NOT NULL);
  END IF;
END $$;
