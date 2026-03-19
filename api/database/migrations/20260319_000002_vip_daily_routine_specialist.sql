ALTER TABLE vip_class_daily_routines
  ADD COLUMN IF NOT EXISTS specialist_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

UPDATE vip_class_daily_routines vdr
   SET specialist_user_id = vcta.teacher_user_id
  FROM vip_class_teacher_assignments vcta
 WHERE vdr.organization_id = vcta.organization_id
   AND vdr.class_assignment_id = vcta.id
   AND vdr.specialist_user_id IS NULL
   AND vcta.teacher_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vip_class_daily_routines_org_specialist_day_time
  ON vip_class_daily_routines (organization_id, specialist_user_id, day_of_week, start_time, id);
