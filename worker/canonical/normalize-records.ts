import type { CanonicalField } from "../ingestion/aliases";
import type { ParsedCsv } from "../ingestion/csv";
import type { ColumnSuggestion } from "../ingestion/detect-columns";

export type CanonicalTreasuryRecord = {
  sourceRowNumber: number;

  company: string | null;

  counterpartyId: string | null;
  counterpartyName: string | null;

  bank: string | null;
  account: string | null;

  currency: string | null;
  amount: number | null;
  debitCredit: string | null;

  documentNo: string | null;
  documentType: string | null;

  postingDate: string | null;
  documentDate: string | null;
  dueDate: string | null;
  valueDate: string | null;

  description: string | null;
  assignment: string | null;
  reference: string | null;

  balance: number | null;
  restrictedAmount: number | null;

  debtId: string | null;
  lender: string | null;
  instrumentType: string | null;

  outstandingPrincipal: number | null;
  interestType: string | null;
  annualInterestRate: number | null;

  nextPaymentDate: string | null;
  nextPaymentAmount: number | null;
  maturityDate: string | null;
};

const STRING_FIELDS = new Set<CanonicalField>([
  "Company",
  "CounterpartyId",
  "CounterpartyName",
  "Bank",
  "Account",
  "Currency",
  "DebitCredit",
  "DocumentNo",
  "DocumentType",
  "Description",
  "Assignment",
  "Reference",
  "DebtId",
  "Lender",
  "InstrumentType",
  "InterestType",
]);

const NUMBER_FIELDS = new Set<CanonicalField>([
  "Amount",
  "Balance",
  "RestrictedAmount",
  "OutstandingPrincipal",
  "AnnualInterestRate",
  "NextPaymentAmount",
]);

const DATE_FIELDS = new Set<CanonicalField>([
  "PostingDate",
  "DocumentDate",
  "DueDate",
  "ValueDate",
  "NextPaymentDate",
  "MaturityDate",
]);

function normalizeString(
  value: string,
): string | null {
  const trimmed = value.trim();

  return trimmed || null;
}

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

function normalizeDate(
  value: string,
): string | null {
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

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function buildSourceIndex(
  parsed: ParsedCsv,
  mappings: ColumnSuggestion[],
): Map<CanonicalField, number> {
  const result =
    new Map<CanonicalField, number>();

  for (const mapping of mappings) {
    if (!mapping.canonicalField) {
      continue;
    }

    // Review veya unmatched alanları kullanıcı
    // onayı olmadan treasury engine'e sokmuyoruz.
    if (mapping.status !== "auto_matched") {
      continue;
    }

    const columnIndex =
      parsed.headers.indexOf(
        mapping.sourceColumn,
      );

    if (columnIndex < 0) {
      continue;
    }

    if (!result.has(mapping.canonicalField)) {
      result.set(
        mapping.canonicalField,
        columnIndex,
      );
    }
  }

  return result;
}

function getRawValue(
  row: string[],
  sourceIndex: Map<CanonicalField, number>,
  field: CanonicalField,
): string {
  const index = sourceIndex.get(field);

  if (index === undefined) {
    return "";
  }

  return row[index] ?? "";
}

function getString(
  row: string[],
  sourceIndex: Map<CanonicalField, number>,
  field: CanonicalField,
): string | null {
  if (!STRING_FIELDS.has(field)) {
    return null;
  }

  return normalizeString(
    getRawValue(
      row,
      sourceIndex,
      field,
    ),
  );
}

function getNumber(
  row: string[],
  sourceIndex: Map<CanonicalField, number>,
  field: CanonicalField,
): number | null {
  if (!NUMBER_FIELDS.has(field)) {
    return null;
  }

  return normalizeNumber(
    getRawValue(
      row,
      sourceIndex,
      field,
    ),
  );
}

function getDate(
  row: string[],
  sourceIndex: Map<CanonicalField, number>,
  field: CanonicalField,
): string | null {
  if (!DATE_FIELDS.has(field)) {
    return null;
  }

  return normalizeDate(
    getRawValue(
      row,
      sourceIndex,
      field,
    ),
  );
}

function normalizeRecord(
  row: string[],
  sourceRowNumber: number,
  sourceIndex: Map<CanonicalField, number>,
): CanonicalTreasuryRecord {
  return {
    sourceRowNumber,

    company: getString(
      row,
      sourceIndex,
      "Company",
    ),

    counterpartyId: getString(
      row,
      sourceIndex,
      "CounterpartyId",
    ),

    counterpartyName: getString(
      row,
      sourceIndex,
      "CounterpartyName",
    ),

    bank: getString(
      row,
      sourceIndex,
      "Bank",
    ),

    account: getString(
      row,
      sourceIndex,
      "Account",
    ),

    currency: getString(
      row,
      sourceIndex,
      "Currency",
    ),

    amount: getNumber(
      row,
      sourceIndex,
      "Amount",
    ),

    debitCredit: getString(
      row,
      sourceIndex,
      "DebitCredit",
    ),

    documentNo: getString(
      row,
      sourceIndex,
      "DocumentNo",
    ),

    documentType: getString(
      row,
      sourceIndex,
      "DocumentType",
    ),

    postingDate: getDate(
      row,
      sourceIndex,
      "PostingDate",
    ),

    documentDate: getDate(
      row,
      sourceIndex,
      "DocumentDate",
    ),

    dueDate: getDate(
      row,
      sourceIndex,
      "DueDate",
    ),

    valueDate: getDate(
      row,
      sourceIndex,
      "ValueDate",
    ),

    description: getString(
      row,
      sourceIndex,
      "Description",
    ),

    assignment: getString(
      row,
      sourceIndex,
      "Assignment",
    ),

    reference: getString(
      row,
      sourceIndex,
      "Reference",
    ),

    balance: getNumber(
      row,
      sourceIndex,
      "Balance",
    ),

    restrictedAmount: getNumber(
      row,
      sourceIndex,
      "RestrictedAmount",
    ),

    debtId: getString(
      row,
      sourceIndex,
      "DebtId",
    ),

    lender: getString(
      row,
      sourceIndex,
      "Lender",
    ),

    instrumentType: getString(
      row,
      sourceIndex,
      "InstrumentType",
    ),

    outstandingPrincipal: getNumber(
      row,
      sourceIndex,
      "OutstandingPrincipal",
    ),

    interestType: getString(
      row,
      sourceIndex,
      "InterestType",
    ),

    annualInterestRate: getNumber(
      row,
      sourceIndex,
      "AnnualInterestRate",
    ),

    nextPaymentDate: getDate(
      row,
      sourceIndex,
      "NextPaymentDate",
    ),

    nextPaymentAmount: getNumber(
      row,
      sourceIndex,
      "NextPaymentAmount",
    ),

    maturityDate: getDate(
      row,
      sourceIndex,
      "MaturityDate",
    ),
  };
}

export function normalizeRecords(
  parsed: ParsedCsv,
  mappings: ColumnSuggestion[],
): CanonicalTreasuryRecord[] {
  const sourceIndex =
    buildSourceIndex(
      parsed,
      mappings,
    );

  return parsed.rows.map(
    (row, index) =>
      normalizeRecord(
        row,
        index + 2,
        sourceIndex,
      ),
  );
}