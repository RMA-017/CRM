-- Enrollment is independent of current caregiver links, so unassigned children remain visible.
CREATE TABLE internal_lesson_clients (
  organization_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  PRIMARY KEY (organization_id, client_id),
  FOREIGN KEY (organization_id, client_id) REFERENCES clients(organization_id, id) ON DELETE CASCADE
);

INSERT INTO internal_lesson_clients (organization_id, client_id)
SELECT DISTINCT organization_id, client_id FROM caregiver_clients;

CREATE TABLE internal_lessons (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL,
  specialist_id INTEGER NOT NULL,
  week_days SMALLINT[] NOT NULL,
  FOREIGN KEY (organization_id, client_id) REFERENCES internal_lesson_clients(organization_id, client_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, specialist_id) REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CHECK (cardinality(week_days) BETWEEN 1 AND 7 AND week_days <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[])
);

CREATE INDEX idx_internal_lessons_client ON internal_lessons (organization_id, client_id, id);
CREATE INDEX idx_internal_lessons_specialist ON internal_lessons (organization_id, specialist_id, id);

INSERT INTO permissions (code, label, sort_order, is_active) VALUES
  ('appointments.internal-lessons.read', 'Read Internal Lessons', 61, TRUE),
  ('appointments.internal-lessons.create', 'Create Internal Lessons', 62, TRUE),
  ('appointments.internal-lessons.update', 'Update Internal Lessons', 63, TRUE),
  ('appointments.internal-lessons.delete', 'Delete Internal Lessons', 64, TRUE)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = TRUE;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM role_options r CROSS JOIN permissions p
WHERE r.is_admin = TRUE AND r.is_active = TRUE AND p.code LIKE 'appointments.internal-lessons.%'
ON CONFLICT (role_id, permission_id) DO NOTHING;
