ALTER TABLE vip_class_daily_routines
  ADD COLUMN IF NOT EXISTS mandatory_exercises VARCHAR(500);
