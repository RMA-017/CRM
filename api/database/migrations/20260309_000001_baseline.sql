CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION is_smallint_array_within_bounds(
  arr SMALLINT[],
  min_value INTEGER,
  max_value INTEGER
)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT COALESCE(bool_and(v BETWEEN min_value AND max_value), FALSE)
  FROM unnest(arr) AS v;
$$;

CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_features TEXT[] DEFAULT NULL,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_options (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  label VARCHAR(64) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_role_options_org_id UNIQUE (organization_id, id)
);

CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(96) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES role_options(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE position_options (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  label VARCHAR(96) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_position_options_org_id UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX uq_role_options_org_label_ci
  ON role_options (COALESCE(organization_id, 0), LOWER(label));

CREATE UNIQUE INDEX uq_position_options_org_label_ci
  ON position_options (COALESCE(organization_id, 0), LOWER(label));

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(64) DEFAULT NULL,
  full_name VARCHAR(64) NOT NULL,
  birthday DATE,
  password_hash VARCHAR(255) NOT NULL,
  phone_number VARCHAR(15),
  position_id INTEGER,
  role_id INTEGER NOT NULL,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_position_org
    FOREIGN KEY (organization_id, position_id)
    REFERENCES position_options(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_users_role_org
    FOREIGN KEY (organization_id, role_id)
    REFERENCES role_options(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX users_username_unique_ci ON users (LOWER(username));
CREATE UNIQUE INDEX users_email_unique_ci ON users (LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX idx_users_organization_created_at ON users (organization_id, created_at DESC);

CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  first_name VARCHAR(64) NOT NULL,
  last_name VARCHAR(64) NOT NULL,
  middle_name VARCHAR(64),
  birthday DATE NOT NULL,
  phone_number VARCHAR(15),
  tg_mail VARCHAR(96),
  tg_chat_id BIGINT,
  is_vip BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(255),
  UNIQUE (organization_id, id)
);

SELECT setval(
  pg_get_serial_sequence('clients', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM clients), 999), 999),
  true
);

CREATE INDEX idx_clients_organization_created_at ON clients (organization_id, created_at DESC);
CREATE INDEX idx_clients_organization_name ON clients (organization_id, last_name, first_name);
CREATE INDEX idx_clients_org_first_name_prefix
  ON clients (organization_id, LOWER(first_name) text_pattern_ops);
CREATE INDEX idx_clients_org_last_name_prefix
  ON clients (organization_id, LOWER(last_name) text_pattern_ops);
CREATE INDEX idx_clients_org_middle_name_prefix
  ON clients (organization_id, LOWER(middle_name) text_pattern_ops);
CREATE INDEX idx_clients_org_phone_prefix
  ON clients (organization_id, phone_number text_pattern_ops);

CREATE TABLE client_medical_history_entries (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL,
  entry_date DATE NOT NULL,
  condition_name VARCHAR(160) NOT NULL,
  symptoms TEXT,
  diagnosis TEXT,
  treatment_plan TEXT,
  note TEXT,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_client_medical_history_entries_client_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES clients(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_client_medical_history_entries_org_client_entry
  ON client_medical_history_entries (organization_id, client_id, entry_date DESC, id DESC);

CREATE INDEX idx_client_medical_history_entries_org_author_entry
  ON client_medical_history_entries (organization_id, author_user_id, entry_date DESC, id DESC);

CREATE TABLE vip_client_attendance (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL,
  attendance_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'absent'
    CHECK (status IN ('present', 'absent')),
  arrived_at TIMESTAMP,
  left_at TIMESTAMP,
  note VARCHAR(255),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vip_client_attendance_client_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES clients(organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, client_id, attendance_date),
  CHECK (
    (status = 'present' AND arrived_at IS NOT NULL)
    OR
    (status = 'absent' AND arrived_at IS NULL AND left_at IS NULL)
  ),
  CHECK (left_at IS NULL OR arrived_at IS NULL OR left_at >= arrived_at)
);

CREATE INDEX idx_vip_client_attendance_org_date_client
  ON vip_client_attendance (organization_id, attendance_date, client_id);

CREATE TABLE vip_class_teacher_assignments (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_name VARCHAR(64) NOT NULL,
  teacher_user_id INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vip_class_teacher_assignments_teacher_org
    FOREIGN KEY (organization_id, teacher_user_id)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_vip_class_teacher_assignments_class_org
    UNIQUE (organization_id, class_name),
  CONSTRAINT uq_vip_class_teacher_assignments_org_id
    UNIQUE (organization_id, id)
);

CREATE INDEX idx_vip_class_teacher_assignments_org_class
  ON vip_class_teacher_assignments (organization_id, class_name, id);

CREATE INDEX idx_vip_class_teacher_assignments_org_teacher
  ON vip_class_teacher_assignments (organization_id, teacher_user_id);

CREATE TABLE vip_class_teacher_assignment_history (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_assignment_id BIGINT,
  class_name VARCHAR(64) NOT NULL,
  teacher_user_id INTEGER,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vip_class_teacher_assignment_history_class_org
    FOREIGN KEY (organization_id, class_assignment_id)
    REFERENCES vip_class_teacher_assignments(organization_id, id) ON DELETE SET NULL,
  CONSTRAINT fk_vip_class_teacher_assignment_history_teacher_org
    FOREIGN KEY (organization_id, teacher_user_id)
    REFERENCES users(organization_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_vip_class_teacher_assignment_history_org_assignment_changed
  ON vip_class_teacher_assignment_history (organization_id, class_assignment_id, changed_at DESC, id DESC);

CREATE INDEX idx_vip_class_teacher_assignment_history_org_class_changed
  ON vip_class_teacher_assignment_history (organization_id, class_name, changed_at DESC, id DESC);

CREATE TABLE vip_client_tutor_assignments (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL,
  class_assignment_id BIGINT NOT NULL,
  tutor_user_id INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vip_client_tutor_assignments_client_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES clients(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_vip_client_tutor_assignments_class_org
    FOREIGN KEY (organization_id, class_assignment_id)
    REFERENCES vip_class_teacher_assignments(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_vip_client_tutor_assignments_tutor_org
    FOREIGN KEY (organization_id, tutor_user_id)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_vip_client_tutor_assignments_client_org
    UNIQUE (organization_id, client_id)
);

CREATE INDEX idx_vip_client_tutor_assignments_org_class
  ON vip_client_tutor_assignments (organization_id, class_assignment_id, client_id);

CREATE INDEX idx_vip_client_tutor_assignments_org_tutor
  ON vip_client_tutor_assignments (organization_id, tutor_user_id, client_id);

CREATE TABLE vip_client_tutor_assignment_history (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL,
  class_assignment_id BIGINT,
  tutor_user_id INTEGER NOT NULL,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vip_client_tutor_assignment_history_client_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES clients(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_vip_client_tutor_assignment_history_class_org
    FOREIGN KEY (organization_id, class_assignment_id)
    REFERENCES vip_class_teacher_assignments(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_vip_client_tutor_assignment_history_tutor_org
    FOREIGN KEY (organization_id, tutor_user_id)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_vip_client_tutor_assignment_history_org_client_changed
  ON vip_client_tutor_assignment_history (organization_id, client_id, changed_at DESC, id DESC);

CREATE INDEX idx_vip_client_tutor_assignment_history_org_class_changed
  ON vip_client_tutor_assignment_history (organization_id, class_assignment_id, changed_at DESC, id DESC);

CREATE TABLE vip_class_daily_routines (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_assignment_id BIGINT NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  activity_type VARCHAR(16) NOT NULL CHECK (activity_type IN ('lesson', 'sleep', 'meal', 'other')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  note VARCHAR(255),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vip_class_daily_routines_class_org
    FOREIGN KEY (organization_id, class_assignment_id)
    REFERENCES vip_class_teacher_assignments(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_vip_class_daily_routines_exact_slot
    UNIQUE (organization_id, class_assignment_id, day_of_week, start_time, end_time, activity_type),
  CONSTRAINT ex_vip_class_daily_routines_no_overlap
    EXCLUDE USING gist (
      organization_id WITH =,
      class_assignment_id WITH =,
      day_of_week WITH =,
      tsrange(DATE '2000-01-01' + start_time, DATE '2000-01-01' + end_time, '[)') WITH &&
    ),
  CHECK (start_time < end_time)
);

CREATE INDEX idx_vip_class_daily_routines_org_class_day_time
  ON vip_class_daily_routines (organization_id, class_assignment_id, day_of_week, start_time, id);

CREATE INDEX idx_vip_class_daily_routines_org_day_time
  ON vip_class_daily_routines (organization_id, day_of_week, start_time, id);

CREATE TABLE appointment_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  slot_interval_minutes INTEGER NOT NULL CHECK (slot_interval_minutes > 0),
  slot_sub_divisions SMALLINT NOT NULL DEFAULT 1 CHECK (slot_sub_divisions >= 1 AND slot_sub_divisions <= 60),
  appointment_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (appointment_duration_minutes > 0),
  appointment_duration_options_minutes SMALLINT[] NOT NULL DEFAULT ARRAY[30],
  no_show_threshold INTEGER NOT NULL DEFAULT 1 CHECK (no_show_threshold >= 1),
  reminder_hours INTEGER NOT NULL DEFAULT 24 CHECK (reminder_hours >= 1),
  history_lock_days INTEGER NOT NULL DEFAULT 10 CHECK (history_lock_days >= 0 AND history_lock_days <= 3650),
  slot_cell_height_px INTEGER NOT NULL DEFAULT 18 CHECK (slot_cell_height_px >= 12 AND slot_cell_height_px <= 72),
  outbox_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (outbox_retention_days >= 0 AND outbox_retention_days <= 3650),
  user_notifications_retention_days INTEGER NOT NULL DEFAULT 0 CHECK (user_notifications_retention_days >= 0 AND user_notifications_retention_days <= 3650),
  reminder_channels TEXT[] NOT NULL DEFAULT ARRAY['sms','email','telegram'],
  visible_week_days SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6],
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    array_length(visible_week_days, 1) >= 1
    AND visible_week_days <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
  ),
  CHECK (
    array_length(appointment_duration_options_minutes, 1) >= 1
  ),
  CHECK (
    is_smallint_array_within_bounds(appointment_duration_options_minutes, 1, 1440)
  ),
  CHECK (
    array_length(reminder_channels, 1) >= 1
    AND reminder_channels <@ ARRAY['sms','email','telegram']::TEXT[]
  )
);

CREATE TABLE appointment_working_hours (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER,
  rule_scope VARCHAR(16) NOT NULL DEFAULT 'weekly'
    CHECK (rule_scope IN ('weekly', 'exception')),
  day_of_week SMALLINT CHECK (day_of_week BETWEEN 1 AND 7),
  work_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  start_time TIME,
  end_time TIME,
  reason VARCHAR(120),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appointment_working_hours_user_org
    FOREIGN KEY (organization_id, user_id)
    REFERENCES users(organization_id, id) ON DELETE CASCADE,
  CHECK (
    (rule_scope = 'weekly' AND day_of_week IS NOT NULL AND work_date IS NULL)
    OR
    (rule_scope = 'exception' AND work_date IS NOT NULL AND day_of_week IS NULL)
  ),
  CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR
    (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
  )
);

CREATE INDEX idx_appointment_working_hours_org
  ON appointment_working_hours (organization_id);

CREATE INDEX idx_appointment_working_hours_org_scope_user_day_date
  ON appointment_working_hours (organization_id, rule_scope, user_id, day_of_week, work_date);

CREATE UNIQUE INDEX uq_appointment_working_hours_default_weekly
  ON appointment_working_hours (organization_id, day_of_week)
  WHERE rule_scope = 'weekly' AND user_id IS NULL;

CREATE UNIQUE INDEX uq_appointment_working_hours_user_weekly
  ON appointment_working_hours (organization_id, user_id, day_of_week)
  WHERE rule_scope = 'weekly' AND user_id IS NOT NULL;

CREATE UNIQUE INDEX uq_appointment_working_hours_default_exception
  ON appointment_working_hours (organization_id, work_date)
  WHERE rule_scope = 'exception' AND user_id IS NULL;

CREATE UNIQUE INDEX uq_appointment_working_hours_user_exception
  ON appointment_working_hours (organization_id, user_id, work_date)
  WHERE rule_scope = 'exception' AND user_id IS NOT NULL;

CREATE TABLE appointment_breaks (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  specialist_id INTEGER NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  break_type VARCHAR(24) NOT NULL DEFAULT 'lunch'
    CHECK (break_type IN ('lunch', 'meeting', 'training', 'other')),
  title VARCHAR(120),
  note VARCHAR(255),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (start_time < end_time),
  CONSTRAINT fk_appointment_breaks_specialist_org
    FOREIGN KEY (organization_id, specialist_id)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT ex_appointment_breaks_no_overlap
    EXCLUDE USING gist (
      organization_id WITH =,
      specialist_id WITH =,
      day_of_week WITH =,
      tsrange(DATE '2000-01-01' + start_time, DATE '2000-01-01' + end_time, '[)') WITH &&
    )
    WHERE (is_active)
);

CREATE INDEX idx_appointment_breaks_specialist_week
  ON appointment_breaks (organization_id, specialist_id, day_of_week, is_active, start_time);

CREATE UNIQUE INDEX uq_appointment_breaks_exact_slot
  ON appointment_breaks (organization_id, specialist_id, day_of_week, start_time, end_time, break_type);

CREATE TABLE appointment_schedules (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  specialist_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  service_name VARCHAR(128) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  note VARCHAR(255),
  repeat_group_key UUID,
  repeat_type VARCHAR(16) NOT NULL DEFAULT 'none',
  repeat_until_date DATE,
  repeat_days SMALLINT[],
  repeat_anchor_date DATE,
  is_repeat_root BOOLEAN NOT NULL DEFAULT FALSE,
  is_auto_rolling_repeat BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appointment_schedules_specialist_org
    FOREIGN KEY (organization_id, specialist_id)
    REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_appointment_schedules_client_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES clients(organization_id, id) ON DELETE RESTRICT,
  CHECK (start_time < end_time),
  CHECK (duration_minutes = ((EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::integer)),
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'no-show')),
  CHECK (repeat_type IN ('none', 'weekly')),
  CHECK (
    (repeat_type = 'none'
      AND repeat_group_key IS NULL
      AND repeat_until_date IS NULL
      AND repeat_days IS NULL
      AND repeat_anchor_date IS NULL
      AND is_repeat_root = FALSE)
    OR
    (repeat_type = 'weekly'
      AND repeat_group_key IS NOT NULL
      AND repeat_until_date IS NOT NULL
      AND repeat_days IS NOT NULL
      AND repeat_anchor_date IS NOT NULL
      AND array_length(repeat_days, 1) >= 1
      AND repeat_days <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
      AND repeat_anchor_date <= repeat_until_date)
  ),
  CONSTRAINT ex_appointment_schedules_active_overlap
    EXCLUDE USING gist (
      organization_id WITH =,
      specialist_id WITH =,
      tsrange(appointment_date + start_time, appointment_date + end_time, '[)') WITH &&
    )
    WHERE (status IN ('pending', 'confirmed'))
);

CREATE INDEX idx_appointment_schedules_org_specialist_date_time
  ON appointment_schedules (organization_id, specialist_id, appointment_date, start_time);

CREATE INDEX idx_appointment_schedules_org_date_specialist
  ON appointment_schedules (organization_id, appointment_date, specialist_id);

CREATE INDEX idx_appointment_schedules_org_created_at
  ON appointment_schedules (organization_id, created_at DESC);

CREATE INDEX idx_appointment_schedules_org_client_date
  ON appointment_schedules (organization_id, client_id, appointment_date DESC);

CREATE INDEX idx_appointment_schedules_org_client_no_show
  ON appointment_schedules (organization_id, client_id)
  WHERE status = 'no-show';

CREATE INDEX idx_appointment_schedules_org_repeat_group_date
  ON appointment_schedules (organization_id, repeat_group_key, appointment_date);

CREATE UNIQUE INDEX uq_appointment_schedules_repeat_group_root
  ON appointment_schedules (organization_id, repeat_group_key)
  WHERE repeat_group_key IS NOT NULL
    AND is_repeat_root = TRUE;

CREATE TABLE user_notifications (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  source_user_id INTEGER,
  event_type VARCHAR(64) NOT NULL,
  message VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_notifications_user_org
    FOREIGN KEY (organization_id, user_id)
    REFERENCES users(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_user_notifications_source_user_org
    FOREIGN KEY (organization_id, source_user_id)
    REFERENCES users(organization_id, id) ON DELETE SET NULL,
  CHECK (LENGTH(TRIM(event_type)) > 0),
  CHECK (LENGTH(TRIM(message)) > 0)
);

CREATE INDEX idx_user_notifications_org_user_created
  ON user_notifications (organization_id, user_id, created_at DESC);

CREATE INDEX idx_user_notifications_org_user_unread
  ON user_notifications (organization_id, user_id, created_at DESC)
  WHERE is_read = FALSE;

CREATE TABLE outbox_events (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(64),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0 AND retry_count <= 1000),
  max_retries INTEGER NOT NULL DEFAULT 5 CHECK (max_retries >= 0 AND max_retries <= 100),
  next_retry_at TIMESTAMP,
  error_message TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  CHECK (LENGTH(TRIM(event_type)) > 0),
  CHECK (LENGTH(TRIM(aggregate_type)) > 0)
);

CREATE INDEX idx_outbox_events_pending_created
  ON outbox_events (status, created_at ASC);

CREATE INDEX idx_outbox_events_pending_retry
  ON outbox_events (status, next_retry_at ASC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX idx_outbox_events_org_created
  ON outbox_events (organization_id, created_at DESC);

CREATE TABLE appointment_status_history (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_schedule_id INTEGER NOT NULL,
  event_type VARCHAR(24) NOT NULL DEFAULT 'updated'
    CHECK (event_type IN ('created', 'updated', 'status-changed', 'deleted')),
  previous_status VARCHAR(24),
  next_status VARCHAR(24),
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (appointment_schedule_id > 0),
  CHECK (previous_status IS NULL OR previous_status IN ('pending', 'confirmed', 'cancelled', 'no-show')),
  CHECK (next_status IS NULL OR next_status IN ('pending', 'confirmed', 'cancelled', 'no-show'))
);

CREATE INDEX idx_appointment_status_history_org_schedule_changed
  ON appointment_status_history (organization_id, appointment_schedule_id, changed_at DESC, id DESC);

CREATE INDEX idx_appointment_status_history_org_changed
  ON appointment_status_history (organization_id, changed_at DESC, id DESC);
