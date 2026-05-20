CREATE TABLE IF NOT EXISTS finance_tickets (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_number INTEGER NOT NULL,
  ticket_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source VARCHAR(24) NOT NULL DEFAULT 'manual',
  appointment_schedule_id INTEGER REFERENCES appointment_schedules(id) ON DELETE RESTRICT,
  client_id INTEGER NOT NULL,
  specialist_id INTEGER,
  service_id INTEGER,
  service_name VARCHAR(128) NOT NULL,
  amount_uzs INTEGER NOT NULL DEFAULT 0 CHECK (amount_uzs >= 0),
  subtotal_uzs INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_uzs >= 0),
  discount_uzs INTEGER NOT NULL DEFAULT 0 CHECK (discount_uzs >= 0),
  total_uzs INTEGER NOT NULL DEFAULT 0 CHECK (total_uzs >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'issued',
  note VARCHAR(255),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_finance_tickets_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_finance_tickets_org_number UNIQUE (organization_id, ticket_number),
  CONSTRAINT fk_finance_tickets_client_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES clients(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_tickets_specialist_org
    FOREIGN KEY (organization_id, specialist_id)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_tickets_service_org
    FOREIGN KEY (organization_id, service_id)
    REFERENCES service_catalog(organization_id, id) ON DELETE RESTRICT,
  CHECK (source IN ('appointment', 'manual')),
  CHECK (status IN ('issued', 'paid', 'unpaid', 'voided')),
  CHECK (ticket_number >= 10000 AND ticket_number <= 99999),
  CHECK (total_uzs = GREATEST(subtotal_uzs - discount_uzs, 0)),
  CHECK (
    (source = 'appointment' AND appointment_schedule_id IS NOT NULL)
    OR
    (source = 'manual')
  )
);

CREATE TABLE IF NOT EXISTS finance_ticket_counters (
  organization_id INTEGER PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  next_ticket_number INTEGER NOT NULL DEFAULT 10000 CHECK (next_ticket_number >= 10000 AND next_ticket_number <= 100000)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_tickets_org_appointment
  ON finance_tickets (organization_id, appointment_schedule_id)
  WHERE appointment_schedule_id IS NOT NULL AND status <> 'voided';

CREATE INDEX IF NOT EXISTS idx_finance_tickets_org_status_created
  ON finance_tickets (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_tickets_org_client_created
  ON finance_tickets (organization_id, client_id, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_finance_ticket_items_org_ticket
  ON finance_ticket_items (organization_id, ticket_id, line_number);

CREATE TABLE IF NOT EXISTS finance_ticket_payments (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id BIGINT NOT NULL,
  payment_method_id INTEGER,
  amount_uzs INTEGER NOT NULL CHECK (amount_uzs > 0),
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(255),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_finance_ticket_payments_ticket_org
    FOREIGN KEY (organization_id, ticket_id)
    REFERENCES finance_tickets(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_ticket_payments_method_org
    FOREIGN KEY (organization_id, payment_method_id)
    REFERENCES finance_payment_methods(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_finance_ticket_payments_org_paid
  ON finance_ticket_payments (organization_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS finance_ticket_history (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id BIGINT NOT NULL,
  action VARCHAR(32) NOT NULL,
  from_status VARCHAR(24),
  to_status VARCHAR(24),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_finance_ticket_history_ticket_org
    FOREIGN KEY (organization_id, ticket_id)
    REFERENCES finance_tickets(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_finance_ticket_history_org_ticket
  ON finance_ticket_history (organization_id, ticket_id, changed_at DESC);
