CREATE TABLE telegram_bot_sessions (
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  language VARCHAR(2) NOT NULL DEFAULT 'ru' CHECK (language IN ('uz', 'ru')),
  active_role VARCHAR(16) CHECK (active_role IN ('parent', 'caregiver', 'specialist')),
  awaiting_role VARCHAR(16) CHECK (awaiting_role IN ('parent', 'caregiver', 'specialist')),
  contacts JSONB NOT NULL DEFAULT '{}'::jsonb,
  view JSONB NOT NULL DEFAULT '{}'::jsonb,
  ui_message_id BIGINT,
  contact_prompt_id BIGINT,
  keyboard_cleared BOOLEAN NOT NULL DEFAULT FALSE,
  last_update_id BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, telegram_user_id),
  UNIQUE (organization_id, chat_id)
);

INSERT INTO telegram_bot_sessions (organization_id, telegram_user_id, chat_id, language, contacts)
SELECT organization_id, telegram_user_id, chat_id, language,
  CASE WHEN is_active THEN jsonb_build_object('parent', phone_number) ELSE '{}'::jsonb END
FROM telegram_parent_accounts;
