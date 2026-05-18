CREATE TABLE IF NOT EXISTS service_catalog (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  position_id INTEGER NOT NULL,
  name VARCHAR(128) NOT NULL,
  price_uzs INTEGER NOT NULL DEFAULT 0 CHECK (price_uzs >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_service_catalog_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_service_catalog_position_org
    FOREIGN KEY (organization_id, position_id)
    REFERENCES position_options(organization_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_catalog_org_name
  ON service_catalog (organization_id, LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_service_catalog_org_active_position
  ON service_catalog (organization_id, is_active, position_id, name);

ALTER TABLE appointment_schedules
  ADD COLUMN IF NOT EXISTS service_id INTEGER,
  ADD COLUMN IF NOT EXISTS service_price_uzs INTEGER NOT NULL DEFAULT 0 CHECK (service_price_uzs >= 0);

ALTER TABLE appointment_schedules
  ADD CONSTRAINT fk_appointment_schedules_service_org
  FOREIGN KEY (organization_id, service_id)
  REFERENCES service_catalog(organization_id, id) ON DELETE RESTRICT;
