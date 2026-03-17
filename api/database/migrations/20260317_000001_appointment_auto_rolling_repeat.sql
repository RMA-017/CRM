ALTER TABLE appointment_schedules
  ADD COLUMN IF NOT EXISTS is_auto_rolling_repeat BOOLEAN NOT NULL DEFAULT FALSE;
