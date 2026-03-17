ALTER TABLE vip_class_daily_routines
  DROP CONSTRAINT IF EXISTS vip_class_daily_routines_activity_type_check;

ALTER TABLE vip_class_daily_routines
  ADD CONSTRAINT vip_class_daily_routines_activity_type_check
  CHECK (
    activity_type IN (
      'lesson',
      'breakfast',
      'lunch',
      'afternoon-snack',
      'sleep',
      'meal',
      'other'
    )
  );
