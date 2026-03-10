-- Appointment Norms: per-position weekly session limit per client
CREATE TABLE appointment_norms (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  position_id INTEGER NOT NULL,
  max_per_week SMALLINT NOT NULL DEFAULT 2
    CHECK (max_per_week >= 1 AND max_per_week <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_appointment_norms_org_position
    UNIQUE (organization_id, position_id)
);

CREATE INDEX idx_appointment_norms_org_active
  ON appointment_norms (organization_id, is_active);
