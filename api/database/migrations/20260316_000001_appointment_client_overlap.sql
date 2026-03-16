DO $$
DECLARE
  conflict_row RECORD;
BEGIN
  SELECT
    s1.organization_id,
    s1.client_id,
    s1.appointment_date,
    TO_CHAR(s1.start_time, 'HH24:MI') AS start_time,
    TO_CHAR(s1.end_time, 'HH24:MI') AS end_time,
    s1.id AS left_appointment_id,
    s2.id AS right_appointment_id,
    s1.specialist_id AS left_specialist_id,
    s2.specialist_id AS right_specialist_id
  INTO conflict_row
  FROM appointment_schedules s1
  JOIN appointment_schedules s2
    ON s2.organization_id = s1.organization_id
   AND s2.client_id = s1.client_id
   AND s2.id > s1.id
   AND s2.status IN ('pending', 'confirmed')
   AND tsrange(s2.appointment_date + s2.start_time, s2.appointment_date + s2.end_time, '[)') &&
       tsrange(s1.appointment_date + s1.start_time, s1.appointment_date + s1.end_time, '[)')
  WHERE s1.status IN ('pending', 'confirmed')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      USING
        MESSAGE = 'Cannot add appointment client overlap constraint because conflicting rows already exist.',
        DETAIL = format(
          'organization_id=%s, client_id=%s, appointment_date=%s, time=%s-%s, appointments=(%s,%s), specialists=(%s,%s)',
          conflict_row.organization_id,
          conflict_row.client_id,
          conflict_row.appointment_date,
          conflict_row.start_time,
          conflict_row.end_time,
          conflict_row.left_appointment_id,
          conflict_row.right_appointment_id,
          conflict_row.left_specialist_id,
          conflict_row.right_specialist_id
        ),
        HINT = 'Resolve overlapping pending/confirmed appointments for the same client first, then rerun migrations.';
  END IF;
END $$;

ALTER TABLE appointment_schedules
  ADD CONSTRAINT ex_appointment_schedules_active_client_overlap
    EXCLUDE USING gist (
      organization_id WITH =,
      client_id WITH =,
      tsrange(appointment_date + start_time, appointment_date + end_time, '[)') WITH &&
    )
    WHERE (status IN ('pending', 'confirmed'));
