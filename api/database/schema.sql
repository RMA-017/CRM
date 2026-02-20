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
