BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP INDEX IF EXISTS idx_appointment_schedules_org_date_specialist;
DROP INDEX IF EXISTS idx_appointment_schedules_active_slot_unique;

CREATE INDEX IF NOT EXISTS idx_appointment_schedules_org_specialist_date_time
  ON appointment_schedules (organization_id, specialist_id, appointment_date, start_time);

CREATE INDEX IF NOT EXISTS idx_appointment_schedules_org_client_no_show
  ON appointment_schedules (organization_id, client_id)
  WHERE status = 'no-show';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ex_appointment_schedules_active_overlap'
  ) THEN
    ALTER TABLE appointment_schedules
      ADD CONSTRAINT ex_appointment_schedules_active_overlap
      EXCLUDE USING gist (
        organization_id WITH =,
        specialist_id WITH =,
        tsrange(appointment_date + start_time, appointment_date + end_time, '[)') WITH &&
      )
      WHERE (status IN ('pending', 'confirmed'));
  END IF;
END $$;

COMMIT;
