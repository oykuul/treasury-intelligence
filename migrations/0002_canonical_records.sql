PRAGMA foreign_keys = ON;

CREATE TABLE canonical_records (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  source_row_number INTEGER NOT NULL,

  company TEXT,

  counterparty_id TEXT,
  counterparty_name TEXT,

  bank TEXT,
  account TEXT,

  currency TEXT,
  amount REAL,
  debit_credit TEXT,

  document_no TEXT,
  document_type TEXT,

  posting_date TEXT,
  document_date TEXT,
  due_date TEXT,
  value_date TEXT,

  description TEXT,
  assignment TEXT,
  reference TEXT,

  balance REAL,
  restricted_amount REAL,

  debt_id TEXT,
  lender TEXT,
  instrument_type TEXT,

  outstanding_principal REAL,
  interest_type TEXT,
  annual_interest_rate REAL,

  next_payment_date TEXT,
  next_payment_amount REAL,
  maturity_date TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (import_id)
    REFERENCES imports(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_canonical_records_import
  ON canonical_records(import_id);

CREATE INDEX idx_canonical_records_due_date
  ON canonical_records(due_date);

CREATE INDEX idx_canonical_records_counterparty
  ON canonical_records(counterparty_id);

CREATE INDEX idx_canonical_records_document
  ON canonical_records(document_no);