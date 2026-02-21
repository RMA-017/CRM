CREATE TABLE role_options (
  id SERIAL PRIMARY KEY,
  label VARCHAR(64) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (label),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE position_options (
  id SERIAL PRIMARY KEY,
  label VARCHAR(96) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (label),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(96) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES role_options(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  username VARCHAR(64) NOT NULL,
  email VARCHAR(64),
  full_name VARCHAR(64) NOT NULL,
  birthday DATE,
  password_hash VARCHAR(255) NOT NULL,
  phone_number VARCHAR(15),
  position_id INTEGER REFERENCES position_options(id),
  role_id INTEGER NOT NULL REFERENCES role_options(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, email)
);

CREATE UNIQUE INDEX users_username_unique_ci ON users (LOWER(username));
CREATE INDEX idx_users_organization_created_at ON users (organization_id, created_at DESC);

CREATE TABLE clients (
  id SERIAL PRIMARY KEY UNIQUE,
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
  note VARCHAR(255)
);

ALTER SEQUENCE clients_id_seq RESTART WITH 1000;

CREATE INDEX idx_clients_organization_created_at ON clients (organization_id, created_at DESC);
CREATE INDEX idx_clients_organization_name ON clients (organization_id, last_name, first_name);

CREATE TABLE appointment_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  slot_interval_minutes INTEGER NOT NULL CHECK (slot_interval_minutes > 0),
  break_time_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_time_minutes >= 0),
  buffer_time_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_time_minutes >= 0),
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
