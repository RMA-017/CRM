CREATE TABLE telegram_bot_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  bot_token TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_secret VARCHAR(64) NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
  webhook_url TEXT,
  default_language VARCHAR(2) NOT NULL DEFAULT 'uz' CHECK (default_language IN ('uz', 'ru')),
  cancel_lock_minutes INTEGER NOT NULL DEFAULT 60 CHECK (cancel_lock_minutes >= 0 AND cancel_lock_minutes <= 10080),
  reminder_24h_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_2h_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  manager_notification_permission_codes TEXT[] NOT NULL DEFAULT ARRAY['appointments.notifications.receive'],
  templates JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (bot_token IS NULL OR LENGTH(TRIM(bot_token)) >= 20),
  CHECK (array_length(manager_notification_permission_codes, 1) >= 1)
);

CREATE INDEX idx_telegram_bot_settings_active
  ON telegram_bot_settings (is_active, organization_id);

CREATE TABLE telegram_parent_accounts (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  phone_number VARCHAR(15) NOT NULL,
  phone_digits VARCHAR(15) NOT NULL,
  language VARCHAR(2) NOT NULL DEFAULT 'uz' CHECK (language IN ('uz', 'ru')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, telegram_user_id),
  UNIQUE (organization_id, chat_id),
  CHECK (LENGTH(TRIM(phone_digits)) BETWEEN 7 AND 15)
);

CREATE INDEX idx_telegram_parent_accounts_org_phone
  ON telegram_parent_accounts (organization_id, phone_digits)
  WHERE is_active = TRUE;

CREATE TABLE appointment_parent_responses (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_schedule_id INTEGER NOT NULL REFERENCES appointment_schedules(id) ON DELETE CASCADE,
  parent_account_id BIGINT NOT NULL REFERENCES telegram_parent_accounts(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  response_status VARCHAR(16) NOT NULL CHECK (response_status IN ('coming', 'not_coming')),
  reason VARCHAR(255),
  responded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, appointment_schedule_id, parent_account_id)
);

CREATE INDEX idx_appointment_parent_responses_org_schedule
  ON appointment_parent_responses (organization_id, appointment_schedule_id, responded_at DESC);

CREATE TABLE telegram_parent_messages (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_account_id BIGINT NOT NULL REFERENCES telegram_parent_accounts(id) ON DELETE CASCADE,
  appointment_schedule_id INTEGER REFERENCES appointment_schedules(id) ON DELETE SET NULL,
  event_type VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  dedupe_key VARCHAR(160),
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (LENGTH(TRIM(event_type)) > 0),
  CHECK (LENGTH(TRIM(message)) > 0),
  UNIQUE (organization_id, parent_account_id, dedupe_key)
);

CREATE INDEX idx_telegram_parent_messages_parent_sent
  ON telegram_parent_messages (organization_id, parent_account_id, sent_at DESC, id DESC);

CREATE TABLE telegram_parent_pending_actions (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_account_id BIGINT NOT NULL REFERENCES telegram_parent_accounts(id) ON DELETE CASCADE,
  action_type VARCHAR(32) NOT NULL CHECK (action_type IN ('cancel_reason')),
  appointment_schedule_id INTEGER NOT NULL REFERENCES appointment_schedules(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, parent_account_id, action_type)
);

CREATE INDEX idx_telegram_parent_pending_actions_expiry
  ON telegram_parent_pending_actions (expires_at);
