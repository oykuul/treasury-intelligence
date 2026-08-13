import type { CanonicalField } from "../ingestion/aliases";
import type { ParsedCsv } from "../ingestion/csv";
import type { ColumnSuggestion } from "../ingestion/detect-columns";
import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";

export type ReconciliationStatus =
  | "passed"
  | "warning"
  | "failed";

export type CurrencyReconciliation = {
  currency: string;
  sourceAmount: number;
  canonicalAmount: number;
  difference: number;
  matched: boolean;
};

export type ReconciliationResult = {
  status: ReconciliationStatus;

  sourceRowCount: number;
  canonicalRowCount: number;
  rowCountDifference: number;

  sourceAmountRows: number;
  canonicalAmountRows: number;
  amountRowsDifference: number;

  currencyTotals: CurrencyReconciliation[];

  issues: string[];
};

const AMOUNT_TOLERANCE = 0.01;

function normalizeNumber(
  value: string,
): number | null {
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

  const parsed = Number(cleaned);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function getMappedColumnIndex(
  parsed: ParsedCsv,
  mappings: ColumnSuggestion[],
  field: CanonicalField,
): number | null {
  const mapping = mappings.find(
    (item) =>
      item.canonicalField === field &&
      item.status === "auto_matched",
  );

  if (!mapping) {
    return null;
  }

  const columnIndex =
    parsed.headers.indexOf(
      mapping.sourceColumn,
    );

  return columnIndex >= 0
    ? columnIndex
    : null;
}

function addToTotal(
  totals: Map<string, number>,
  currency: string,
  amount: number,
): void {
  totals.set(
    currency,
    (totals.get(currency) ?? 0) +
      amount,
  );
}

function normalizeCurrency(
  value: string | null | undefined,
): string {
  const normalized =
    value?.trim().toUpperCase();

  return normalized || "UNKNOWN";
}

export function reconcileImport(
  parsed: ParsedCsv,
  mappings: ColumnSuggestion[],
  canonicalRecords: CanonicalTreasuryRecord[],
): ReconciliationResult {
  const issues: string[] = [];

  const sourceRowCount =
    parsed.rows.length;

  const canonicalRowCount =
    canonicalRecords.length;

  const rowCountDifference =
    canonicalRowCount -
    sourceRowCount;

  if (rowCountDifference !== 0) {
    issues.push(
      `Row count mismatch: source=${sourceRowCount}, canonical=${canonicalRowCount}.`,
    );
  }

  const amountColumnIndex =
    getMappedColumnIndex(
      parsed,
      mappings,
      "Amount",
    );

  const currencyColumnIndex =
    getMappedColumnIndex(
      parsed,
      mappings,
      "Currency",
    );

  const sourceTotals =
    new Map<string, number>();

  const canonicalTotals =
    new Map<string, number>();

  let sourceAmountRows = 0;

  if (amountColumnIndex === null) {
    issues.push(
      "Amount mapping is unavailable. Amount reconciliation could not be completed.",
    );
  } else {
    for (const row of parsed.rows) {
      const amount =
        normalizeNumber(
          row[amountColumnIndex] ?? "",
        );

      if (amount === null) {
        continue;
      }

      sourceAmountRows += 1;

      const currency =
        currencyColumnIndex === null
          ? "UNKNOWN"
          : normalizeCurrency(
              row[currencyColumnIndex],
            );

      addToTotal(
        sourceTotals,
        currency,
        amount,
      );
    }
  }

  let canonicalAmountRows = 0;

  for (const record of canonicalRecords) {
    if (record.amount === null) {
      continue;
    }

    canonicalAmountRows += 1;

    const currency =
      normalizeCurrency(
        record.currency,
      );

    addToTotal(
      canonicalTotals,
      currency,
      record.amount,
    );
  }

  const amountRowsDifference =
    canonicalAmountRows -
    sourceAmountRows;

  if (
    amountColumnIndex !== null &&
    amountRowsDifference !== 0
  ) {
    issues.push(
      `Amount row mismatch: source=${sourceAmountRows}, canonical=${canonicalAmountRows}.`,
    );
  }

  const currencies = [
    ...new Set([
      ...sourceTotals.keys(),
      ...canonicalTotals.keys(),
    ]),
  ].sort();

  const currencyTotals =
    currencies.map(
      (
        currency,
      ): CurrencyReconciliation => {
        const sourceAmount =
          sourceTotals.get(currency) ?? 0;

        const canonicalAmount =
          canonicalTotals.get(currency) ??
          0;

        const difference =
          canonicalAmount -
          sourceAmount;

        const matched =
          Math.abs(difference) <=
          AMOUNT_TOLERANCE;

        if (!matched) {
          issues.push(
            `Amount mismatch for ${currency}: source=${sourceAmount}, canonical=${canonicalAmount}, difference=${difference}.`,
          );
        }

        return {
          currency,
          sourceAmount,
          canonicalAmount,
          difference,
          matched,
        };
      },
    );

  let status: ReconciliationStatus =
    "passed";

  const hasHardMismatch =
    rowCountDifference !== 0 ||
    amountRowsDifference !== 0 ||
    currencyTotals.some(
      (item) => !item.matched,
    );

  if (hasHardMismatch) {
    status = "failed";
  } else if (
    amountColumnIndex === null
  ) {
    status = "warning";
  }

  return {
    status,

    sourceRowCount,
    canonicalRowCount,
    rowCountDifference,

    sourceAmountRows,
    canonicalAmountRows,
    amountRowsDifference,

    currencyTotals,

    issues,
  };
}