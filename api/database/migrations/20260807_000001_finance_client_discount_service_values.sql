ALTER TABLE finance_client_discount_rule_services
  ADD COLUMN IF NOT EXISTS discount_value INTEGER;

UPDATE finance_client_discount_rule_services rs
   SET discount_value = CASE
     WHEN r.discount_type = 'amount'
      AND rs.limit_count IS NOT NULL
      AND rs.per_use_discount_uzs IS NOT NULL
       THEN COALESCE(rs.per_use_discount_uzs, 0) * rs.limit_count
     WHEN r.discount_type = 'amount'
       THEN COALESCE(rs.per_use_discount_uzs, r.discount_value, 0)
     ELSE COALESCE(r.discount_value, 0)
   END
  FROM finance_client_discount_rules r
 WHERE r.organization_id = rs.organization_id
   AND r.id = rs.rule_id
   AND rs.discount_value IS NULL;

ALTER TABLE finance_client_discount_rule_services
  ALTER COLUMN discount_value SET DEFAULT 0;

ALTER TABLE finance_client_discount_rule_services
  ALTER COLUMN discount_value SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE finance_client_discount_rule_services
    ADD CONSTRAINT chk_finance_client_discount_rule_services_discount_value
    CHECK (discount_value >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
