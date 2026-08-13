PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE imports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  source_type TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  row_count INTEGER NOT NULL DEFAULT 0,
  column_count INTEGER NOT NULL DEFAULT 0,
  mapping_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE
);

CREATE TABLE source_columns (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  source_column_name TEXT NOT NULL,
  detected_data_type TEXT,
  sample_values TEXT,
  ordinal_position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (import_id)
    REFERENCES imports(id)
    ON DELETE CASCADE
);

CREATE TABLE column_mappings (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  source_column_name TEXT NOT NULL,
  canonical_field TEXT,
  confidence REAL,
  mapping_method TEXT NOT NULL DEFAULT 'automatic',
  status TEXT NOT NULL DEFAULT 'suggested',
  approved_by_user INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (import_id)
    REFERENCES imports(id)
    ON DELETE CASCADE
);

CREATE TABLE data_quality_issues (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  row_number INTEGER,
  source_column_name TEXT,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  original_value TEXT,
  rule_code TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (import_id)
    REFERENCES imports(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_imports_org
  ON imports(organization_id);

CREATE INDEX idx_source_columns_import
  ON source_columns(import_id);

CREATE INDEX idx_column_mappings_import
  ON column_mappings(import_id);

CREATE INDEX idx_dq_issues_import
  ON data_quality_issues(import_id);