ALTER TABLE finance_client_discount_rule_services
  ADD COLUMN IF NOT EXISTS per_use_discount_uzs INTEGER;

WITH eligible_rules AS (
  SELECT r.organization_id,
         r.id AS rule_id,
         LEAST(r.discount_value::numeric, SUM(sc.price_uzs * rs.limit_count)::numeric) AS total_discount_uzs,
         SUM(sc.price_uzs * rs.limit_count)::numeric AS package_amount_uzs
    FROM finance_client_discount_rules r
    JOIN finance_client_discount_rule_services rs
      ON rs.organization_id = r.organization_id
     AND rs.rule_id = r.id
    JOIN service_catalog sc
      ON sc.organization_id = rs.organization_id
     AND sc.id = rs.service_id
   WHERE r.discount_type = 'amount'
   GROUP BY r.organization_id, r.id, r.discount_value
  HAVING COUNT(*) FILTER (
           WHERE rs.limit_count IS NULL
              OR COALESCE(sc.price_uzs, 0) <= 0
         ) = 0
     AND SUM(sc.price_uzs * rs.limit_count) > 0
),
calculated_discounts AS (
  SELECT rs.organization_id,
         rs.id AS rule_service_id,
         LEAST(
           sc.price_uzs,
           GREATEST(0, ROUND(er.total_discount_uzs * sc.price_uzs / er.package_amount_uzs)::integer)
         ) AS per_use_discount_uzs
    FROM finance_client_discount_rule_services rs
    JOIN eligible_rules er
      ON er.organization_id = rs.organization_id
     AND er.rule_id = rs.rule_id
    JOIN service_catalog sc
      ON sc.organization_id = rs.organization_id
     AND sc.id = rs.service_id
)
UPDATE finance_client_discount_rule_services rs
   SET per_use_discount_uzs = calculated_discounts.per_use_discount_uzs
  FROM calculated_discounts
 WHERE rs.organization_id = calculated_discounts.organization_id
   AND rs.id = calculated_discounts.rule_service_id
   AND rs.per_use_discount_uzs IS NULL;

DO $$
BEGIN
  ALTER TABLE finance_client_discount_rule_services
    ADD CONSTRAINT chk_finance_client_discount_rule_services_per_use_discount
    CHECK (per_use_discount_uzs IS NULL OR per_use_discount_uzs >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
