import type { ParsedCsv } from "../ingestion/csv";
import type { ColumnSuggestion } from "../ingestion/detect-columns";
import type { CanonicalField } from "../ingestion/aliases";

export type DataQualitySeverity =
  | "critical"
  | "warning"
  | "info";

export type DataQualityIssue = {
  rowNumber: number | null;
  sourceColumnName: string | null;
  canonicalField: CanonicalField | null;
  issueType:
    | "DUPLICATE"
    | "UNREADABLE_DATE"
    | "NEGATIVE_AMOUNT"
    | "TIME_SERIES_GAP"
    | "UNIT_ANOMALY";
  severity: DataQualitySeverity;
  originalValue: string | null;
  ruleCode: string;
  details: string;
};

export type DataQualitySummary = {
  duplicateCount: number;
  unreadableDateCount: number;
  negativeAmountCount: number;
  timeSeriesGapCount: number;
  unitAnomalyCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  totalIssues: number;
};

export type DataQualityResult = {
  issues: DataQualityIssue[];
  summary: DataQualitySummary;
};

const DATE_FIELDS = new Set<CanonicalField>([
  "PostingDate",
  "DocumentDate",
  "DueDate",
  "ValueDate",
  "NextPaymentDate",
  "MaturityDate",
]);

const UNSIGNED_AMOUNT_FIELDS = new Set<CanonicalField>([
  "Amount",
  "RestrictedAmount",
  "OutstandingPrincipal",
  "NextPaymentAmount",
]);

const GAP_DATE_PRIORITY: CanonicalField[] = [
  "DueDate",
  "PostingDate",
  "ValueDate",
  "DocumentDate",
  "NextPaymentDate",
  "MaturityDate",
];

function parseNumber(value: string): number | null {
  let cleaned = value
    .trim()
    .replace(/\s/g, "")
    .replace(/[₺€$£]/g, "");

  if (!cleaned) {
    return null;
  }

  if (
    cleaned.includes(",") &&
    cleaned.includes(".")
  ) {
    if (
      cleaned.lastIndexOf(",") >
      cleaned.lastIndexOf(".")
    ) {
      cleaned = cleaned
        .replace(/\./g, "")
        .replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (
    cleaned.includes(",") &&
    !cleaned.includes(".")
  ) {
    const parts = cleaned.split(",");

    if (
      parts.length === 2 &&
      parts[1].length <= 2
    ) {
      cleaned =
        parts[0].replace(/\./g, "") +
        "." +
        parts[1];
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  }

  const result = Number(cleaned);

  return Number.isFinite(result)
    ? result
    : null;
}

function parseStrictDate(
  value: string,
): Date | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  let year: number;
  let month: number;
  let day: number;

  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  );

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    const localMatch = trimmed.match(
      /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/,
    );

    if (!localMatch) {
      return null;
    }

    day = Number(localMatch[1]);
    month = Number(localMatch[2]);
    year = Number(localMatch[3]);
  }

  const parsed = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function quantile(
  values: number[],
  percentile: number,
): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort(
    (a, b) => a - b,
  );

  const position =
    (sorted.length - 1) * percentile;

  const base = Math.floor(position);
  const remainder = position - base;

  const next = sorted[base + 1];

  if (next === undefined) {
    return sorted[base];
  }

  return (
    sorted[base] +
    remainder * (next - sorted[base])
  );
}

function buildMappingIndex(
  mappings: ColumnSuggestion[],
): Map<
  CanonicalField,
  ColumnSuggestion
> {
  const result = new Map<
    CanonicalField,
    ColumnSuggestion
  >();

  for (const mapping of mappings) {
    if (!mapping.canonicalField) {
      continue;
    }

    if (!result.has(mapping.canonicalField)) {
      result.set(
        mapping.canonicalField,
        mapping,
      );
    }
  }

  return result;
}

function getColumnIndex(
  parsed: ParsedCsv,
  sourceColumn: string,
): number {
  return parsed.headers.indexOf(
    sourceColumn,
  );
}

function checkDuplicates(
  parsed: ParsedCsv,
  issues: DataQualityIssue[],
): void {
  const seen = new Map<string, number>();

  parsed.rows.forEach((row, index) => {
    const signature = JSON.stringify(row);

    const existingRow =
      seen.get(signature);

    if (existingRow !== undefined) {
      issues.push({
        rowNumber: index + 2,
        sourceColumnName: null,
        canonicalField: null,
        issueType: "DUPLICATE",
        severity: "critical",
        originalValue: null,
        ruleCode: "DQ_DUPLICATE_EXACT",
        details:
          `Row ${index + 2} is an exact duplicate of row ${existingRow}.`,
      });

      return;
    }

    seen.set(
      signature,
      index + 2,
    );
  });
}

function checkDates(
  parsed: ParsedCsv,
  mappingIndex: Map<
    CanonicalField,
    ColumnSuggestion
  >,
  issues: DataQualityIssue[],
): void {
  for (const canonicalField of DATE_FIELDS) {
    const mapping =
      mappingIndex.get(canonicalField);

    if (!mapping) {
      continue;
    }

    const columnIndex = getColumnIndex(
      parsed,
      mapping.sourceColumn,
    );

    if (columnIndex < 0) {
      continue;
    }

    parsed.rows.forEach((row, index) => {
      const value =
        row[columnIndex] ?? "";

      if (!value.trim()) {
        return;
      }

      if (!parseStrictDate(value)) {
        issues.push({
          rowNumber: index + 2,
          sourceColumnName:
            mapping.sourceColumn,
          canonicalField,
          issueType: "UNREADABLE_DATE",
          severity: "critical",
          originalValue: value,
          ruleCode:
            "DQ_DATE_UNREADABLE",
          details:
            `Value "${value}" cannot be parsed as a valid ${canonicalField}.`,
        });
      }
    });
  }
}

function checkNegativeAmounts(
  parsed: ParsedCsv,
  mappingIndex: Map<
    CanonicalField,
    ColumnSuggestion
  >,
  issues: DataQualityIssue[],
): void {
  for (
    const canonicalField
    of UNSIGNED_AMOUNT_FIELDS
  ) {
    const mapping =
      mappingIndex.get(canonicalField);

    if (!mapping) {
      continue;
    }

    const columnIndex = getColumnIndex(
      parsed,
      mapping.sourceColumn,
    );

    if (columnIndex < 0) {
      continue;
    }

    parsed.rows.forEach((row, index) => {
      const value =
        row[columnIndex] ?? "";

      const parsedNumber =
        parseNumber(value);

      if (
        parsedNumber !== null &&
        parsedNumber < 0
      ) {
        issues.push({
          rowNumber: index + 2,
          sourceColumnName:
            mapping.sourceColumn,
          canonicalField,
          issueType: "NEGATIVE_AMOUNT",
          severity: "warning",
          originalValue: value,
          ruleCode:
            "DQ_NEGATIVE_AMOUNT",
          details:
            `Negative value detected in ${canonicalField}. Review whether this is a valid credit/reversal or a data issue.`,
        });
      }
    });
  }
}

function checkTimeSeriesGap(
  parsed: ParsedCsv,
  mappingIndex: Map<
    CanonicalField,
    ColumnSuggestion
  >,
  issues: DataQualityIssue[],
): void {
  const selectedField =
    GAP_DATE_PRIORITY.find(
      (field) => mappingIndex.has(field),
    );

  if (!selectedField) {
    return;
  }

  const mapping =
    mappingIndex.get(selectedField);

  if (!mapping) {
    return;
  }

  const columnIndex = getColumnIndex(
    parsed,
    mapping.sourceColumn,
  );

  if (columnIndex < 0) {
    return;
  }

  const uniqueDates = [
    ...new Set(
      parsed.rows
        .map(
          (row) =>
            row[columnIndex] ?? "",
        )
        .map(parseStrictDate)
        .filter(
          (value): value is Date =>
            value !== null,
        )
        .map((value) =>
          value.toISOString().slice(0, 10),
        ),
    ),
  ].sort();

  for (
    let index = 1;
    index < uniqueDates.length;
    index += 1
  ) {
    const previous = new Date(
      `${uniqueDates[index - 1]}T00:00:00Z`,
    );

    const current = new Date(
      `${uniqueDates[index]}T00:00:00Z`,
    );

    const differenceDays =
      Math.round(
        (current.getTime() -
          previous.getTime()) /
          86_400_000,
      );

    if (differenceDays > 7) {
      issues.push({
        rowNumber: null,
        sourceColumnName:
          mapping.sourceColumn,
        canonicalField: selectedField,
        issueType: "TIME_SERIES_GAP",
        severity: "info",
        originalValue: null,
        ruleCode:
          "DQ_TIME_SERIES_GAP_7D",
        details:
          `No activity dates detected between ${uniqueDates[index - 1]} and ${uniqueDates[index]} (${differenceDays - 1} missing calendar days).`,
      });
    }
  }
}

function checkUnitAnomalies(
  parsed: ParsedCsv,
  mappingIndex: Map<
    CanonicalField,
    ColumnSuggestion
  >,
  issues: DataQualityIssue[],
): void {
  for (
    const canonicalField
    of UNSIGNED_AMOUNT_FIELDS
  ) {
    const mapping =
      mappingIndex.get(canonicalField);

    if (!mapping) {
      continue;
    }

    const columnIndex = getColumnIndex(
      parsed,
      mapping.sourceColumn,
    );

    if (columnIndex < 0) {
      continue;
    }

    const numericRows = parsed.rows
      .map((row, index) => ({
        rowNumber: index + 2,
        originalValue:
          row[columnIndex] ?? "",
        value: parseNumber(
          row[columnIndex] ?? "",
        ),
      }))
      .filter(
        (
          item,
        ): item is {
          rowNumber: number;
          originalValue: string;
          value: number;
        } =>
          item.value !== null &&
          item.value >= 0,
      );

    // P99 is unstable on tiny datasets.
    // We only activate this rule when
    // there is enough data to profile.
    if (numericRows.length < 20) {
      continue;
    }

    const absoluteValues =
      numericRows.map(
        (item) => Math.abs(item.value),
      );

    const p99 = quantile(
      absoluteValues,
      0.99,
    );

    if (
      p99 === null ||
      p99 <= 0
    ) {
      continue;
    }

    const threshold = p99 * 3;

    for (const item of numericRows) {
      if (
        Math.abs(item.value) >
        threshold
      ) {
        issues.push({
          rowNumber:
            item.rowNumber,
          sourceColumnName:
            mapping.sourceColumn,
          canonicalField,
          issueType:
            "UNIT_ANOMALY",
          severity: "warning",
          originalValue:
            item.originalValue,
          ruleCode:
            "DQ_UNIT_ANOMALY_3X_P99",
          details:
            `Value ${item.originalValue} exceeds 3×P99 threshold (${threshold.toFixed(2)}). Possible unit or scale error.`,
        });
      }
    }
  }
}

function buildSummary(
  issues: DataQualityIssue[],
): DataQualitySummary {
  return {
    duplicateCount:
      issues.filter(
        (issue) =>
          issue.issueType ===
          "DUPLICATE",
      ).length,

    unreadableDateCount:
      issues.filter(
        (issue) =>
          issue.issueType ===
          "UNREADABLE_DATE",
      ).length,

    negativeAmountCount:
      issues.filter(
        (issue) =>
          issue.issueType ===
          "NEGATIVE_AMOUNT",
      ).length,

    timeSeriesGapCount:
      issues.filter(
        (issue) =>
          issue.issueType ===
          "TIME_SERIES_GAP",
      ).length,

    unitAnomalyCount:
      issues.filter(
        (issue) =>
          issue.issueType ===
          "UNIT_ANOMALY",
      ).length,

    criticalCount:
      issues.filter(
        (issue) =>
          issue.severity === "critical",
      ).length,

    warningCount:
      issues.filter(
        (issue) =>
          issue.severity === "warning",
      ).length,

    infoCount:
      issues.filter(
        (issue) =>
          issue.severity === "info",
      ).length,

    totalIssues: issues.length,
  };
}

export function runDataQuality(
  parsed: ParsedCsv,
  mappings: ColumnSuggestion[],
): DataQualityResult {
  const issues: DataQualityIssue[] = [];

  const mappingIndex =
    buildMappingIndex(mappings);

  checkDuplicates(
    parsed,
    issues,
  );

  checkDates(
    parsed,
    mappingIndex,
    issues,
  );

  checkNegativeAmounts(
    parsed,
    mappingIndex,
    issues,
  );

  checkTimeSeriesGap(
    parsed,
    mappingIndex,
    issues,
  );

  checkUnitAnomalies(
    parsed,
    mappingIndex,
    issues,
  );

  return {
    issues,
    summary:
      buildSummary(issues),
  };
}