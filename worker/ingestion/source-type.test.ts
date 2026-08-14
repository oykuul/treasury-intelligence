import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseSourceType,
  TREASURY_DATASET_TYPES,
} from "./source-type";

describe(
  "Treasury source type",
  () => {
    it(
      "accepts payables",
      () => {
        expect(
          parseSourceType(
            "payables",
          ),
        ).toEqual({
          valid: true,
          sourceType:
            "payables",
        });
      },
    );

    it(
      "normalizes whitespace and case",
      () => {
        expect(
          parseSourceType(
            " Receivables ",
          ),
        ).toEqual({
          valid: true,
          sourceType:
            "receivables",
        });
      },
    );

    it(
      "accepts debt",
      () => {
        expect(
          parseSourceType(
            "debt",
          ),
        ).toEqual({
          valid: true,
          sourceType:
            "debt",
        });
      },
    );

    it(
      "rejects a missing source type",
      () => {
        expect(
          parseSourceType(
            null,
          ),
        ).toEqual({
          valid: false,
          sourceType: null,
          error:
            "sourceType is required.",
        });
      },
    );

    it(
      "rejects non-string form values",
      () => {
        expect(
          parseSourceType({}),
        ).toEqual({
          valid: false,
          sourceType: null,
          error:
            "sourceType is required.",
        });
      },
    );

    it(
      "rejects unknown dataset types",
      () => {
        expect(
          parseSourceType(
            "cashflow",
          ),
        ).toEqual({
          valid: false,
          sourceType: null,
          error:
            "sourceType must be payables, receivables, or debt.",
        });
      },
    );

    it(
      "exposes exactly the supported treasury dataset types",
      () => {
        expect(
          TREASURY_DATASET_TYPES,
        ).toEqual([
          "payables",
          "receivables",
          "debt",
        ]);
      },
    );
  },
);
