-- Use the same phone normalization and specialist access rules as the bot.
CREATE FUNCTION telegram_notification_phone(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN digits LIKE '00%' THEN SUBSTRING(digits FROM 3)
    WHEN LENGTH(digits) = 9 THEN '998' || digits
    WHEN LENGTH(digits) = 10 THEN '7' || digits
    WHEN LENGTH(digits) = 11 AND digits LIKE '8%' THEN '7' || SUBSTRING(digits FROM 2)
    ELSE digits END
  FROM (SELECT regexp_replace(COALESCE(value, ''), '\D', '', 'g') AS digits) p
$$;

CREATE INDEX idx_users_telegram_notification_phone
  ON users (organization_id, telegram_notification_phone(phone_number));
CREATE INDEX idx_sessions_specialist_notification_phone
  ON telegram_bot_sessions (organization_id, telegram_notification_phone(contacts->>'specialist'))
  WHERE contacts ? 'specialist';

CREATE VIEW telegram_specialist_notification_accounts AS
WITH specialists AS NOT MATERIALIZED (
  SELECT u.organization_id, u.id, telegram_notification_phone(u.phone_number) AS phone
  FROM users u JOIN role_options r ON r.id = u.role_id AND r.organization_id = u.organization_id
  LEFT JOIN position_options p ON p.id = u.position_id AND p.organization_id = u.organization_id
  WHERE COALESCE(u.is_active, TRUE) AND r.is_active
    AND LOWER(CONCAT_WS(' ', r.label, p.label)) LIKE ANY
      (ARRAY['%specialist%', '%spetsialist%', '%mutaxassis%', '%специалист%'])
)
SELECT s.organization_id, s.telegram_user_id, s.chat_id, u.id AS user_id, u.phone, b.bot_token, s.language
FROM telegram_bot_sessions s
JOIN specialists u ON u.organization_id = s.organization_id
  AND u.phone = telegram_notification_phone(s.contacts->>'specialist') AND u.phone <> ''
JOIN organizations o ON o.id = s.organization_id AND o.is_active
JOIN telegram_bot_settings b ON b.organization_id = s.organization_id AND b.is_active
  AND NULLIF(TRIM(b.bot_token), '') IS NOT NULL
WHERE s.contacts ? 'specialist' AND s.chat_id = s.telegram_user_id
  AND COALESCE(s.view->>'stopped', 'false') <> 'true'
  AND NOT EXISTS (SELECT 1 FROM specialists other WHERE other.organization_id = u.organization_id
    AND other.phone = u.phone AND other.id <> u.id);

CREATE TABLE telegram_specialist_notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL REFERENCES user_notifications(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL,
  telegram_user_id BIGINT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (notification_id, telegram_user_id),
  FOREIGN KEY (organization_id, telegram_user_id)
    REFERENCES telegram_bot_sessions(organization_id, telegram_user_id) ON DELETE CASCADE
);
CREATE INDEX idx_specialist_notification_delivery_pending
  ON telegram_specialist_notification_deliveries (available_at, id) WHERE status IN ('pending', 'sending');

CREATE FUNCTION enqueue_telegram_specialist_notification() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO telegram_specialist_notification_deliveries
    (notification_id, organization_id, telegram_user_id, phone)
  SELECT NEW.id, NEW.organization_id, a.telegram_user_id, a.phone
  FROM telegram_specialist_notification_accounts a
  WHERE a.organization_id = NEW.organization_id AND a.user_id = NEW.user_id
  ON CONFLICT (notification_id, telegram_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enqueue_telegram_specialist_notification
  AFTER INSERT ON user_notifications FOR EACH ROW
  EXECUTE FUNCTION enqueue_telegram_specialist_notification();
