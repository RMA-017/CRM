CREATE TABLE IF NOT EXISTS finance_client_discount_rules (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL,
  discount_type VARCHAR(16) NOT NULL DEFAULT 'amount',
  discount_value INTEGER NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  note VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_finance_client_discount_rules_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_finance_client_discount_rules_client_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES clients(organization_id, id) ON DELETE RESTRICT,
  CHECK (discount_type IN ('amount', 'percent')),
  CHECK (discount_type <> 'percent' OR discount_value <= 100)
);

CREATE TABLE IF NOT EXISTS finance_client_discount_rule_services (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id BIGINT NOT NULL,
  service_id INTEGER NOT NULL,
  service_name VARCHAR(128) NOT NULL,
  limit_count INTEGER CHECK (limit_count IS NULL OR limit_count > 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_finance_client_discount_rule_services_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_finance_client_discount_rule_services_rule_org
    FOREIGN KEY (organization_id, rule_id)
    REFERENCES finance_client_discount_rules(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_client_discount_rule_services_service_org
    FOREIGN KEY (organization_id, service_id)
    REFERENCES service_catalog(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, rule_id, service_id)
);

CREATE TABLE IF NOT EXISTS finance_client_discount_usages (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id BIGINT NOT NULL,
  rule_service_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  ticket_item_id BIGINT,
  appointment_schedule_id INTEGER,
  client_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  discount_uzs INTEGER NOT NULL DEFAULT 0 CHECK (discount_uzs >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  reversed_at TIMESTAMP,
  reversed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_finance_client_discount_usages_rule_org
    FOREIGN KEY (organization_id, rule_id)
    REFERENCES finance_client_discount_rules(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_client_discount_usages_rule_service_org
    FOREIGN KEY (organization_id, rule_service_id)
    REFERENCES finance_client_discount_rule_services(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_client_discount_usages_ticket_org
    FOREIGN KEY (organization_id, ticket_id)
    REFERENCES finance_tickets(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_finance_client_discount_usages_ticket_item_org
    FOREIGN KEY (organization_id, ticket_item_id)
    REFERENCES finance_ticket_items(organization_id, id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_client_discount_usages_appointment_org
    FOREIGN KEY (appointment_schedule_id)
    REFERENCES appointment_schedules(id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_client_discount_usages_client_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES clients(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_finance_client_discount_usages_service_org
    FOREIGN KEY (organization_id, service_id)
    REFERENCES service_catalog(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_finance_client_discount_rules_org_client
  ON finance_client_discount_rules (organization_id, client_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_client_discount_rule_services_org_service
  ON finance_client_discount_rule_services (organization_id, service_id, rule_id);

CREATE INDEX IF NOT EXISTS idx_finance_client_discount_usages_org_rule_service
  ON finance_client_discount_usages (organization_id, rule_service_id, reversed_at);

CREATE INDEX IF NOT EXISTS idx_finance_client_discount_usages_org_ticket
  ON finance_client_discount_usages (organization_id, ticket_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_client_discount_usages_active_ticket_item
  ON finance_client_discount_usages (organization_id, ticket_item_id)
  WHERE ticket_item_id IS NOT NULL AND reversed_at IS NULL;
