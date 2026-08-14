import type {
  TreasuryDatasetType,
} from "../treasury/build-liquidity-forecast";

export const TREASURY_DATASET_TYPES =
  [
    "payables",
    "receivables",
    "debt",
  ] as const satisfies readonly TreasuryDatasetType[];

export type SourceTypeValidationResult =
  | {
      valid: true;
      sourceType:
        TreasuryDatasetType;
    }
  | {
      valid: false;
      sourceType: null;
      error: string;
    };

export function parseSourceType(
  value: unknown,
): SourceTypeValidationResult {
  if (
    typeof value !== "string"
  ) {
    return {
      valid: false,
      sourceType: null,
      error:
        "sourceType is required.",
    };
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    normalized === "payables" ||
    normalized ===
      "receivables" ||
    normalized === "debt"
  ) {
    return {
      valid: true,
      sourceType:
        normalized,
    };
  }

  return {
    valid: false,
    sourceType: null,
    error:
      "sourceType must be payables, receivables, or debt.",
  };
}
