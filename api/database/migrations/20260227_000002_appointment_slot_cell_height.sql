ALTER TABLE appointment_settings
  ADD COLUMN IF NOT EXISTS slot_cell_height_px INTEGER;

UPDATE appointment_settings
SET slot_cell_height_px = LEAST(72, GREATEST(12, COALESCE(slot_cell_height_px, 18)));

ALTER TABLE appointment_settings
  ALTER COLUMN slot_cell_height_px SET DEFAULT 18;

ALTER TABLE appointment_settings
  ALTER COLUMN slot_cell_height_px SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointment_settings_slot_cell_height_px_check'
  ) THEN
    ALTER TABLE appointment_settings
      ADD CONSTRAINT appointment_settings_slot_cell_height_px_check
      CHECK (slot_cell_height_px >= 12 AND slot_cell_height_px <= 72);
  END IF;
END $$;
