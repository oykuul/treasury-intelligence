PRAGMA foreign_keys = ON;

CREATE TABLE reconciliation_results (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL,

  source_row_count INTEGER NOT NULL,
  canonical_row_count INTEGER NOT NULL,
  row_count_difference INTEGER NOT NULL,

  source_amount_rows INTEGER NOT NULL,
  canonical_amount_rows INTEGER NOT NULL,
  amount_rows_difference INTEGER NOT NULL,

  currency_totals TEXT NOT NULL,
  issues TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (import_id)
    REFERENCES imports(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_reconciliation_results_import
  ON reconciliation_results(import_id);

CREATE INDEX idx_reconciliation_results_status
  ON reconciliation_results(status);
