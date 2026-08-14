CREATE TABLE alm_positions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  position_type TEXT NOT NULL CHECK (position_type IN ('cash', 'facility')),
  entity TEXT NOT NULL,
  counterparty_name TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  available_amount REAL NOT NULL DEFAULT 0,
  restricted_amount REAL NOT NULL DEFAULT 0,
  committed_amount REAL,
  drawn_amount REAL,
  maturity_date TEXT,
  interest_type TEXT,
  annual_interest_rate REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_alm_positions_org_date
  ON alm_positions (
    organization_id,
    as_of_date
  );

CREATE INDEX idx_alm_positions_type
  ON alm_positions (
    position_type
  );
