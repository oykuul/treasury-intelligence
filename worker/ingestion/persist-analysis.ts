import type { TreasuryDatasetType } from "../treasury/build-liquidity-forecast";

import type { ParsedCsv } from "./csv";
import type { ColumnSuggestion } from "./detect-columns";

export type PersistAnalysisInput = {
  organizationId: string;
  fileName: string;
  sourceType: TreasuryDatasetType;
  parsed: ParsedCsv;
  mappings: ColumnSuggestion[];
};

export type PersistAnalysisResult = {
  importId: string;
  status: "analyzed";
  mappingStatus: "ready" | "review_required";
  sourceColumnsSaved: number;
  mappingsSaved: number;
};

function detectDataType(values: string[]): string {
  const nonEmpty = values
    .map((value) => value.trim())
    .filter(Boolean);

  if (nonEmpty.length === 0) {
    return "empty";
  }

  const numericCount = nonEmpty.filter((value) => {
    const normalized = value
      .replace(/\s/g, "")
      .replace(/[₺€$£]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

    return Number.isFinite(Number(normalized));
  }).length;

  if (numericCount / nonEmpty.length >= 0.9) {
    return "number";
  }

  const dateCount = nonEmpty.filter((value) => {
    return (
      /^\d{4}-\d{1,2}-\d{1,2}$/.test(value) ||
      /^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(value)
    );
  }).length;

  if (dateCount / nonEmpty.length >= 0.9) {
    return "date";
  }

  return "string";
}

export async function persistAnalysis(
  db: D1Database,
  input: PersistAnalysisInput,
): Promise<PersistAnalysisResult> {
  const importId = crypto.randomUUID();

  const reviewRequired = input.mappings.some(
    (mapping) =>
      mapping.status === "review" ||
      mapping.status === "unmatched",
  );

  const mappingStatus = reviewRequired
    ? "review_required"
    : "ready";

  const statements: D1PreparedStatement[] = [];

  statements.push(
    db
      .prepare(`
        INSERT OR IGNORE INTO organizations (
          id,
          name
        )
        VALUES (?, ?)
      `)
      .bind(
        input.organizationId,
        "Demo Organization",
      ),
  );

  statements.push(
    db
      .prepare(`
        INSERT INTO imports (
          id,
          organization_id,
          file_name,
          source_type,
          status,
          row_count,
          column_count,
          mapping_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        importId,
        input.organizationId,
        input.fileName,
        input.sourceType,
        "analyzed",
        input.parsed.rowCount,
        input.parsed.columnCount,
        mappingStatus,
      ),
  );

  input.parsed.headers.forEach(
    (sourceColumnName, columnIndex) => {
      const values = input.parsed.rows
        .slice(0, 100)
        .map(
          (row) =>
            row[columnIndex] ?? "",
        );

      const samples = values
        .filter(
          (value) =>
            value.trim() !== "",
        )
        .slice(0, 5);

      statements.push(
        db
          .prepare(`
            INSERT INTO source_columns (
              id,
              import_id,
              source_column_name,
              detected_data_type,
              sample_values,
              ordinal_position
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(
            crypto.randomUUID(),
            importId,
            sourceColumnName,
            detectDataType(values),
            JSON.stringify(samples),
            columnIndex + 1,
          ),
      );
    },
  );

  input.mappings.forEach((mapping) => {
    statements.push(
      db
        .prepare(`
          INSERT INTO column_mappings (
            id,
            import_id,
            source_column_name,
            canonical_field,
            confidence,
            mapping_method,
            status,
            approved_by_user
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          crypto.randomUUID(),
          importId,
          mapping.sourceColumn,
          mapping.canonicalField,
          mapping.confidence,
          mapping.evidence,
          mapping.status,
          0,
        ),
    );
  });

  await db.batch(statements);

  return {
    importId,
    status: "analyzed",
    mappingStatus,
    sourceColumnsSaved:
      input.parsed.headers.length,
    mappingsSaved:
      input.mappings.length,
  };
}