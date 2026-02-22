CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE role_options (
  id SERIAL PRIMARY KEY,
  label VARCHAR(64) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (label),
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  label VARCHAR(96) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (label),
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(64) DEFAULT NULL,
  full_name VARCHAR(64) NOT NULL,
  birthday DATE,
  password_hash VARCHAR(255) NOT NULL,
  phone_number VARCHAR(15),
  position_id INTEGER REFERENCES position_options(id),
  role_id INTEGER NOT NULL REFERENCES role_options(id),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  is_vip BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(255),
  UNIQUE (organization_id, id)
);

ALTER SEQUENCE clients_id_seq RESTART WITH 1000;

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

CREATE TABLE appointment_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  slot_interval_minutes INTEGER NOT NULL CHECK (slot_interval_minutes > 0),
  no_show_threshold INTEGER NOT NULL DEFAULT 1 CHECK (no_show_threshold >= 1),
  reminder_hours INTEGER NOT NULL DEFAULT 24 CHECK (reminder_hours >= 1),
  visible_week_days SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6],
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    array_length(visible_week_days, 1) >= 1
    AND visible_week_days <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
  )
);

CREATE TABLE appointment_working_hours (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  start_time TIME,
  end_time TIME,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR
    (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
  ),
  UNIQUE (organization_id, day_of_week)
);

CREATE INDEX idx_appointment_working_hours_org
  ON appointment_working_hours (organization_id);

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
    REFERENCES users(organization_id, id) ON DELETE RESTRICT
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
  service_name VARCHAR(128) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  note VARCHAR(255),
  repeat_group_key UUID,
  repeat_type VARCHAR(16) NOT NULL DEFAULT 'none',
  repeat_until_date DATE,
  repeat_days SMALLINT[],
  repeat_anchor_date DATE,
  is_repeat_root BOOLEAN NOT NULL DEFAULT FALSE,
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
  )
);

CREATE INDEX idx_appointment_schedules_org_specialist_date_time
  ON appointment_schedules (organization_id, specialist_id, appointment_date, start_time);

CREATE INDEX idx_appointment_schedules_org_client_date
  ON appointment_schedules (organization_id, client_id, appointment_date DESC);

CREATE INDEX idx_appointment_schedules_org_client_no_show
  ON appointment_schedules (organization_id, client_id)
  WHERE status = 'no-show';

CREATE INDEX idx_appointment_schedules_org_repeat_group_date
  ON appointment_schedules (organization_id, repeat_group_key, appointment_date);

ALTER TABLE appointment_schedules
  ADD CONSTRAINT ex_appointment_schedules_active_overlap
  EXCLUDE USING gist (
    organization_id WITH =,
    specialist_id WITH =,
    tsrange(appointment_date + start_time, appointment_date + end_time, '[)') WITH &&
  )
  WHERE (status IN ('pending', 'confirmed'));

CREATE UNIQUE INDEX uq_appointment_schedules_repeat_group_root
  ON appointment_schedules (organization_id, repeat_group_key)
  WHERE repeat_group_key IS NOT NULL
    AND is_repeat_root = TRUE;
