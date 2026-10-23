CREATE TABLE caregivers (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL CHECK (length(trim(full_name)) > 0),
  phone_number VARCHAR(16) NOT NULL,
  phone_digits VARCHAR(15) NOT NULL CHECK (phone_digits ~ '^[0-9]{7,15}$'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, phone_digits),
  UNIQUE (organization_id, id)
);

CREATE TABLE caregiver_clients (
  organization_id INTEGER NOT NULL,
  caregiver_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  PRIMARY KEY (organization_id, caregiver_id, client_id),
  FOREIGN KEY (organization_id, caregiver_id)
    REFERENCES caregivers(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, client_id)
    REFERENCES clients(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_caregiver_clients_client ON caregiver_clients (organization_id, client_id);
