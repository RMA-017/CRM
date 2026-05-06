CREATE TABLE IF NOT EXISTS site_content_items (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_key VARCHAR(32) NOT NULL
    CHECK (section_key IN ('kids', 'team', 'partners')),
  image_data TEXT NOT NULL,
  author VARCHAR(128),
  name VARCHAR(128),
  role VARCHAR(128),
  description VARCHAR(512) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (section_key = 'kids' AND author IS NOT NULL AND name IS NULL)
    OR
    (section_key IN ('team', 'partners') AND name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_site_content_items_public
  ON site_content_items (section_key, is_active, sort_order ASC, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_site_content_items_org_section
  ON site_content_items (organization_id, section_key, sort_order ASC, created_at DESC, id DESC);
