CREATE TABLE appointment_breaks_work_history (
  id           BIGSERIAL    PRIMARY KEY,
  organization_id INTEGER    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type  VARCHAR(16)  NOT NULL CHECK (entity_type IN ('breaks', 'work_schedule')),
  entity_id    INTEGER      NOT NULL,
  changed_by   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  snapshot     JSONB        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_abwh_lookup
  ON appointment_breaks_work_history (organization_id, entity_type, entity_id, changed_at DESC, id DESC);
