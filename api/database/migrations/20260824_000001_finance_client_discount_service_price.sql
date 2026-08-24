ALTER TABLE finance_client_discount_rule_services
  ADD COLUMN IF NOT EXISTS service_price_uzs INTEGER NOT NULL DEFAULT 0;

UPDATE finance_client_discount_rule_services rs
   SET service_price_uzs = COALESCE(sc.price_uzs, 0)
  FROM service_catalog sc
 WHERE sc.organization_id = rs.organization_id
   AND sc.id = rs.service_id
   AND COALESCE(rs.service_price_uzs, 0) = 0;

DO $$
BEGIN
  ALTER TABLE finance_client_discount_rule_services
    ADD CONSTRAINT chk_finance_client_discount_rule_services_service_price
    CHECK (service_price_uzs >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
