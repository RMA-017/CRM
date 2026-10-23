CREATE TABLE internal_lesson_completions (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lesson_id INTEGER REFERENCES internal_lessons(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  specialist_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source_lesson_id INTEGER NOT NULL,
  source_client_id INTEGER NOT NULL,
  source_specialist_id INTEGER NOT NULL,
  schedule_date DATE NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  specialist_name VARCHAR(255) NOT NULL,
  position_name VARCHAR(255) NOT NULL DEFAULT '',
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (organization_id, source_lesson_id, source_client_id, source_specialist_id, schedule_date),
  UNIQUE (organization_id, id)
);

CREATE TABLE internal_lesson_journal_events (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  completion_id BIGINT NOT NULL,
  completed BOOLEAN NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_telegram_id BIGINT,
  actor_name VARCHAR(255) NOT NULL DEFAULT '',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (organization_id, completion_id) REFERENCES internal_lesson_completions(organization_id, id) ON DELETE CASCADE,
  UNIQUE (completion_id, version)
);

CREATE INDEX idx_internal_lesson_journal_org_recorded ON internal_lesson_journal_events (organization_id, recorded_at DESC, id DESC);

INSERT INTO permissions (code, label, sort_order, is_active) VALUES
  ('appointments.internal-journal.read', 'Read Internal Lesson Journal', 65, TRUE),
  ('appointments.internal-journal.update', 'Correct Internal Lesson Journal', 66, TRUE)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = TRUE;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM role_options r CROSS JOIN permissions p
WHERE r.is_admin = TRUE AND r.is_active = TRUE AND p.code IN ('appointments.internal-journal.read', 'appointments.internal-journal.update')
ON CONFLICT (role_id, permission_id) DO NOTHING;
