ALTER TABLE finance_tickets
  ADD COLUMN IF NOT EXISTS ticket_number INTEGER,
  ADD COLUMN IF NOT EXISTS ticket_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS subtotal_uzs INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_uzs >= 0),
  ADD COLUMN IF NOT EXISTS discount_uzs INTEGER NOT NULL DEFAULT 0 CHECK (discount_uzs >= 0),
  ADD COLUMN IF NOT EXISTS total_uzs INTEGER NOT NULL DEFAULT 0 CHECK (total_uzs >= 0);

UPDATE finance_tickets
   SET subtotal_uzs = amount_uzs,
       discount_uzs = 0,
       total_uzs = amount_uzs
 WHERE subtotal_uzs = 0
   AND total_uzs = 0
   AND amount_uzs > 0;

WITH numbered AS (
  SELECT id,
         organization_id,
         9999 + ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY id ASC) AS next_number
    FROM finance_tickets
   WHERE ticket_number IS NULL
)
UPDATE finance_tickets ft
   SET ticket_number = numbered.next_number
  FROM numbered
 WHERE ft.id = numbered.id;

ALTER TABLE finance_tickets
  ALTER COLUMN ticket_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'uq_finance_tickets_org_number'
       AND conrelid = 'finance_tickets'::regclass
  ) THEN
    ALTER TABLE finance_tickets
      ADD CONSTRAINT uq_finance_tickets_org_number UNIQUE (organization_id, ticket_number);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_finance_tickets_ticket_number_range'
       AND conrelid = 'finance_tickets'::regclass
  ) THEN
    ALTER TABLE finance_tickets
      ADD CONSTRAINT chk_finance_tickets_ticket_number_range
      CHECK (ticket_number >= 10000 AND ticket_number <= 99999);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_finance_tickets_total_math'
       AND conrelid = 'finance_tickets'::regclass
  ) THEN
    ALTER TABLE finance_tickets
      ADD CONSTRAINT chk_finance_tickets_total_math
      CHECK (total_uzs = GREATEST(subtotal_uzs - discount_uzs, 0));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS finance_ticket_counters (
  organization_id INTEGER PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  next_ticket_number INTEGER NOT NULL DEFAULT 10000 CHECK (next_ticket_number >= 10000 AND next_ticket_number <= 100000)
);

INSERT INTO finance_ticket_counters (organization_id, next_ticket_number)
SELECT organization_id, LEAST(GREATEST(COALESCE(MAX(ticket_number), 9999) + 1, 10000), 100000)
  FROM finance_tickets
 GROUP BY organization_id
ON CONFLICT (organization_id) DO UPDATE
  SET next_ticket_number = GREATEST(
    finance_ticket_counters.next_ticket_number,
    EXCLUDED.next_ticket_number
  );

CREATE TABLE IF NOT EXISTS finance_ticket_items (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id BIGINT NOT NULL,
  line_number INTEGER NOT NULL DEFAULT 1 CHECK (line_number >= 1),
  specialist_id INTEGER,
  service_id INTEGER,
  service_name VARCHAR(128) NOT NULL,
  price_uzs INTEGER NOT NULL CHECK (price_uzs >= 0),
  discount_type VARCHAR(16) NOT NULL DEFAULT 'amount',
  discount_value INTEGER NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  discount_uzs INTEGER NOT NULL DEFAULT 0 CHECK (discount_uzs >= 0),
  final_amount_uzs INTEGER NOT NULL CHECK (final_amount_uzs >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_finance_ticket_items_ticket_org
    FOREIGN KEY (organization_id, ticket_id)
    REFERENCES finance_tickets(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_ticket_items_specialist_org
    FOREIGN KEY (organization_id, specialist_id)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_ticket_items_service_org
    FOREIGN KEY (organization_id, service_id)
    REFERENCES service_catalog(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, ticket_id, line_number),
  CHECK (discount_type IN ('amount', 'percent')),
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (discount_uzs <= price_uzs),
  CHECK (final_amount_uzs = GREATEST(price_uzs - discount_uzs, 0))
);

INSERT INTO finance_ticket_items (
  organization_id,
  ticket_id,
  line_number,
  specialist_id,
  service_id,
  service_name,
  price_uzs,
  discount_type,
  discount_value,
  discount_uzs,
  final_amount_uzs
)
SELECT organization_id,
       id,
       1,
       specialist_id,
       service_id,
       service_name,
       amount_uzs,
       'amount',
       0,
       0,
       amount_uzs
  FROM finance_tickets
 WHERE service_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM finance_ticket_items fti
      WHERE fti.organization_id = finance_tickets.organization_id
        AND fti.ticket_id = finance_tickets.id
   );

CREATE INDEX IF NOT EXISTS idx_finance_ticket_items_org_ticket
  ON finance_ticket_items (organization_id, ticket_id, line_number);
