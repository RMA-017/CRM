ALTER TABLE internal_lessons ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
CREATE FUNCTION advance_internal_lesson_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.revision = OLD.revision + 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER advance_internal_lesson_revision BEFORE UPDATE ON internal_lessons
  FOR EACH ROW EXECUTE FUNCTION advance_internal_lesson_revision();

CREATE TABLE internal_lesson_actions (
  token UUID PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  changes JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '45 seconds'
);
CREATE INDEX idx_internal_lesson_actions_owner ON internal_lesson_actions(organization_id, user_id);
CREATE INDEX idx_internal_lesson_actions_expiry ON internal_lesson_actions(expires_at);
