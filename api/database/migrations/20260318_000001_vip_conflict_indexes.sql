-- Index to speed up hasBreakConflictForVipRoutine:
-- filters by (organization_id, day_of_week) without a known specialist_id
CREATE INDEX IF NOT EXISTS idx_appointment_breaks_org_day
  ON appointment_breaks (organization_id, day_of_week)
  WHERE is_active = TRUE;
