import {
  FIELD_ALIASES,
  findExactAlias,
  normalizeHeader,
  type CanonicalField,
} from "./aliases";

export type MappingStatus =
  | "auto_matched"
  | "review"
  | "unmatched";

export type MappingEvidence =
  | "exact_alias"
  | "similar_alias"
  | "value_profile"
  | "none";

export type ColumnSuggestion = {
  sourceColumn: string;
  canonicalField: CanonicalField | null;
  confidence: number;
  status: MappingStatus;
  evidence: MappingEvidence;
  sampleValues: string[];
};

type ValueProfile = {
  nonEmptyCount: number;
  numericRatio: number;
  dateRatio: number;
  currencyRatio: number;
  debitCreditRatio: number;
};

const normalizedAliasEntries = Object.entries(
  FIELD_ALIASES,
).flatMap(([canonicalField, aliases]) =>
  aliases.map((alias) => ({
    canonicalField: canonicalField as CanonicalField,
    alias: normalizeHeader(alias),
  })),
);

function isNumericValue(value: string): boolean {
  const cleaned = value
    .trim()
    .replace(/\s/g, "")
    .replace(/[₺€$£]/g, "");

  if (!cleaned) {
    return false;
  }

  const normalized =
    cleaned.includes(",") && cleaned.includes(".")
      ? cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "")
      : cleaned.includes(",")
        ? cleaned.replace(",", ".")
        : cleaned;

  return Number.isFinite(Number(normalized));
}

function isDateValue(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  const commonPatterns = [
    /^\d{4}-\d{1,2}-\d{1,2}$/,
    /^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/,
  ];

  return commonPatterns.some((pattern) =>
    pattern.test(trimmed),
  );
}

function isCurrencyValue(value: string): boolean {
  const normalized = normalizeHeader(value);

  return [
    "TRY",
    "TL",
    "USD",
    "EUR",
    "GBP",
    "CHF",
    "JPY",
  ].includes(normalized);
}

function isDebitCreditValue(value: string): boolean {
  const normalized = normalizeHeader(value);

  return [
    "S",
    "H",
    "D",
    "C",
    "DEBIT",
    "CREDIT",
    "DR",
    "CR",
  ].includes(normalized);
}

function ratio(
  values: string[],
  predicate: (value: string) => boolean,
): number {
  const nonEmptyValues = values.filter(
    (value) => value.trim() !== "",
  );

  if (nonEmptyValues.length === 0) {
    return 0;
  }

  const matched = nonEmptyValues.filter(predicate).length;

  return matched / nonEmptyValues.length;
}

function buildValueProfile(
  values: string[],
): ValueProfile {
  const nonEmptyValues = values.filter(
    (value) => value.trim() !== "",
  );

  return {
    nonEmptyCount: nonEmptyValues.length,
    numericRatio: ratio(nonEmptyValues, isNumericValue),
    dateRatio: ratio(nonEmptyValues, isDateValue),
    currencyRatio: ratio(
      nonEmptyValues,
      isCurrencyValue,
    ),
    debitCreditRatio: ratio(
      nonEmptyValues,
      isDebitCreditValue,
    ),
  };
}

function similarityScore(
  sourceHeader: string,
  alias: string,
): number {
  const source = normalizeHeader(sourceHeader);
  const target = normalizeHeader(alias);

  if (!source || !target) {
    return 0;
  }

  if (source === target) {
    return 1;
  }

  if (
    source.length >= 4 &&
    target.length >= 4 &&
    (source.includes(target) ||
      target.includes(source))
  ) {
    return 0.82;
  }

  const sourceTokens = new Set(
    sourceHeader
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean),
  );

  const targetTokens = new Set(
    alias
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean),
  );

  if (
    sourceTokens.size === 0 ||
    targetTokens.size === 0
  ) {
    return 0;
  }

  const intersection = [...sourceTokens].filter(
    (token) => targetTokens.has(token),
  ).length;

  const union = new Set([
    ...sourceTokens,
    ...targetTokens,
  ]).size;

  return union === 0 ? 0 : intersection / union;
}

function findSimilarAlias(
  sourceColumn: string,
): {
  canonicalField: CanonicalField | null;
  confidence: number;
} {
  let bestField: CanonicalField | null = null;
  let bestScore = 0;

  for (const entry of normalizedAliasEntries) {
    const score = similarityScore(
      sourceColumn,
      entry.alias,
    );

    if (score > bestScore) {
      bestScore = score;
      bestField = entry.canonicalField;
    }
  }

  return {
    canonicalField:
      bestScore >= 0.7 ? bestField : null,
    confidence: bestScore,
  };
}

function inferFromValues(
  profile: ValueProfile,
): {
  canonicalField: CanonicalField | null;
  confidence: number;
} {
  if (
    profile.nonEmptyCount >= 3 &&
    profile.currencyRatio >= 0.8
  ) {
    return {
      canonicalField: "Currency",
      confidence: 0.84,
    };
  }

  if (
    profile.nonEmptyCount >= 3 &&
    profile.debitCreditRatio >= 0.8
  ) {
    return {
      canonicalField: "DebitCredit",
      confidence: 0.86,
    };
  }

  // Sayısal kolonun yalnız değer profiline bakarak
  // Amount / Balance / Principal ayrımını güvenle yapamayız.
  // Bu yüzden otomatik eşleştirmiyoruz.
  if (
    profile.nonEmptyCount >= 3 &&
    profile.numericRatio >= 0.95
  ) {
    return {
      canonicalField: null,
      confidence: 0,
    };
  }

  // Aynı şekilde yalnız tarih değerlerine bakarak
  // DueDate / PostingDate / ValueDate ayrımı yapılamaz.
  if (
    profile.nonEmptyCount >= 3 &&
    profile.dateRatio >= 0.8
  ) {
    return {
      canonicalField: null,
      confidence: 0,
    };
  }

  return {
    canonicalField: null,
    confidence: 0,
  };
}

function getStatus(
  canonicalField: CanonicalField | null,
  confidence: number,
): MappingStatus {
  if (!canonicalField) {
    return "unmatched";
  }

  if (confidence >= 0.9) {
    return "auto_matched";
  }

  return "review";
}

export function detectColumns(
  headers: string[],
  rows: string[][],
): ColumnSuggestion[] {
  return headers.map((sourceColumn, columnIndex) => {
    const sampleValues = rows
      .slice(0, 50)
      .map((row) => row[columnIndex] ?? "")
      .filter((value) => value.trim() !== "")
      .slice(0, 5);

    const exactAlias =
      findExactAlias(sourceColumn);

    if (exactAlias) {
      return {
        sourceColumn,
        canonicalField: exactAlias,
        confidence: 0.99,
        status: "auto_matched",
        evidence: "exact_alias",
        sampleValues,
      };
    }

    const similarAlias =
      findSimilarAlias(sourceColumn);

    if (
      similarAlias.canonicalField &&
      similarAlias.confidence >= 0.7
    ) {
      return {
        sourceColumn,
        canonicalField:
          similarAlias.canonicalField,
        confidence:
          similarAlias.confidence,
        status: getStatus(
          similarAlias.canonicalField,
          similarAlias.confidence,
        ),
        evidence: "similar_alias",
        sampleValues,
      };
    }

    const profile = buildValueProfile(
      rows
        .slice(0, 100)
        .map((row) => row[columnIndex] ?? ""),
    );

    const valueInference =
      inferFromValues(profile);

    return {
      sourceColumn,
      canonicalField:
        valueInference.canonicalField,
      confidence:
        valueInference.confidence,
      status: getStatus(
        valueInference.canonicalField,
        valueInference.confidence,
      ),
      evidence: valueInference.canonicalField
        ? "value_profile"
        : "none",
      sampleValues,
    };
  });
}