CREATE TABLE IF NOT EXISTS crm_leads (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name VARCHAR(180) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  phone_digits VARCHAR(15) NOT NULL,
  source VARCHAR(32) NOT NULL CHECK (source IN ('website', 'telegram')),
  status VARCHAR(24) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'lost')),
  note TEXT,
  telegram_user_id BIGINT,
  telegram_chat_id BIGINT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (LENGTH(TRIM(full_name)) > 0),
  CHECK (LENGTH(TRIM(phone_digits)) BETWEEN 7 AND 15),
  UNIQUE (organization_id, phone_digits)
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_org_status_updated
  ON crm_leads (organization_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_crm_leads_org_source_updated
  ON crm_leads (organization_id, source, updated_at DESC, id DESC);
