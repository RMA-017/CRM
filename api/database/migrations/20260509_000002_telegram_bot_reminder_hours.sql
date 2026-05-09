ALTER TABLE telegram_bot_settings
  ADD COLUMN IF NOT EXISTS reminder_24h_hours INTEGER NOT NULL DEFAULT 24 CHECK (reminder_24h_hours >= 0 AND reminder_24h_hours <= 168),
  ADD COLUMN IF NOT EXISTS reminder_2h_hours INTEGER NOT NULL DEFAULT 2 CHECK (reminder_2h_hours >= 0 AND reminder_2h_hours <= 168);

ALTER TABLE telegram_bot_settings
  ALTER COLUMN default_language SET DEFAULT 'ru';

UPDATE telegram_bot_settings
   SET default_language = 'ru',
       updated_at = CURRENT_TIMESTAMP
 WHERE default_language = 'uz';

ALTER TABLE telegram_parent_accounts
  ALTER COLUMN language SET DEFAULT 'ru';
