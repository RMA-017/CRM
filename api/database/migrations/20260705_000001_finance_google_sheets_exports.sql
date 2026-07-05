CREATE TABLE IF NOT EXISTS finance_google_sheets_exports (
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  export_year SMALLINT NOT NULL CHECK (export_year BETWEEN 2000 AND 2100),
  spreadsheet_id VARCHAR(128) NOT NULL,
  spreadsheet_url TEXT NOT NULL,
  last_exported_at TIMESTAMP,
  last_exported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_export_status VARCHAR(16) NOT NULL DEFAULT 'success',
  last_export_error TEXT,
  last_export_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, export_year),
  CHECK (last_export_status IN ('success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_finance_google_sheets_exports_updated
  ON finance_google_sheets_exports (organization_id, updated_at DESC);
