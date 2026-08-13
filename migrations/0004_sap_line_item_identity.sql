ALTER TABLE canonical_records
ADD COLUMN fiscal_year TEXT;

ALTER TABLE canonical_records
ADD COLUMN line_item_no TEXT;

CREATE INDEX idx_canonical_records_sap_identity
ON canonical_records (
  company,
  fiscal_year,
  document_no,
  line_item_no
);
