import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  CanonicalTreasuryRecord,
} from "../canonical/normalize-records";

import type {
  TreasuryDataset,
} from "./build-liquidity-forecast";

import {
  runTreasuryAnalysis,
} from "./run-treasury-analysis";

function record(
  overrides:
    Partial<CanonicalTreasuryRecord>,
): CanonicalTreasuryRecord {
  return {
    sourceRowNumber: 1,

    company: null,
    fiscalYear: null,

    counterpartyId: null,
    counterpartyName: null,

    bank: null,
    account: null,

    currency: "TRY",
    amount: null,
    debitCredit: null,

    documentNo: null,
    lineItemNo: null,
    documentType: null,

    postingDate: null,
    documentDate: null,
    dueDate: null,
    valueDate: null,

    description: null,
    assignment: null,
    reference: null,

    balance: null,
    restrictedAmount: null,

    debtId: null,
    lender: null,
    instrumentType: null,

    outstandingPrincipal: null,
    interestType: null,
    annualInterestRate: null,

    nextPaymentDate: null,
    nextPaymentAmount: null,
    maturityDate: null,

    ...overrides,
  };
}

const datasets: TreasuryDataset[] = [
  {
    type: "payables",
    records: [
      record({
        sourceRowNumber: 1,
        counterpartyName:
          "Supplier A",
        documentNo: "PAY-1",
        amount: 1_200,
        dueDate: "2026-08-15",
      }),
    ],
  },
  {
    type: "receivables",
    records: [
      record({
        sourceRowNumber: 2,
        counterpartyName:
          "Customer A",
        documentNo: "REC-1",
        amount: 500,
        dueDate: "2026-08-16",
      }),
    ],
  },
  {
    type: "debt",
    records: [
      record({
        sourceRowNumber: 3,
        lender: "Bank A",
        debtId: "DEBT-1",
        nextPaymentAmount: 400,
        nextPaymentDate:
          "2026-08-17",
      }),
    ],
  },
];

describe(
  "runTreasuryAnalysis",
  () => {
    it(
      "builds the complete CFO analysis package",
      () => {
        const result =
          runTreasuryAnalysis({
            datasets,
            currency: "try",
            asOfDate: "2026-08-14",
            openingLiquidity: 1_000,
            unusedCommittedFacilities: 0,
            minimumLiquidityBuffer: 100,
          });

        expect(result.currency)
          .toBe("TRY");

        expect(result.endDate)
          .toBe("2026-11-11");

        expect(
          result.forecast.minimumLiquidity,
        ).toBe(-200);

        expect(
          result.forecast.minimumLiquidityDate,
        ).toBe("2026-08-15");

        expect(
          result.metrics.fundingNeed30D,
        ).toBe(200);

        expect(
          result.verdict.verdict,
        ).toBe("CRITICAL");

        expect(
          result.stress.scenarios.map(
            (scenario) =>
              scenario.name,
          ),
        ).toEqual([
          "BASE",
          "MODERATE",
          "SEVERE",
        ]);

        expect(
          result.gapDrivers.targetDate,
        ).toBe("2026-08-15");

        expect(
          result.gapDrivers.payablesOutflows,
        ).toBe(1_200);

        expect(
          result.gapDrivers.projectedCash,
        ).toBe(-200);

        expect(
          result.maturityGap.buckets,
        ).toHaveLength(14);

        expect(
          result.maturityGap.totalLiabilities12M,
        ).toBe(1_600);

        expect(
          result.debtFunding.debtOutstanding,
        ).toBe(0);
      },
    );

    it(
      "supports a selected gap date inside the horizon",
      () => {
        const result =
          runTreasuryAnalysis({
            datasets,
            currency: "TRY",
            asOfDate: "2026-08-14",
            openingLiquidity: 1_000,
            unusedCommittedFacilities: 0,
            minimumLiquidityBuffer: 100,
            gapTargetDate: "2026-08-17",
          });

        expect(
          result.gapDrivers.targetDate,
        ).toBe("2026-08-17");

        expect(
          result.gapDrivers.debtOutflows,
        ).toBe(400);
      },
    );

    it(
      "rejects gap dates outside the forecast horizon",
      () => {
        expect(() =>
          runTreasuryAnalysis({
            datasets,
            currency: "TRY",
            asOfDate: "2026-08-14",
            openingLiquidity: 1_000,
            unusedCommittedFacilities: 0,
            minimumLiquidityBuffer: 100,
            gapTargetDate: "2026-11-12",
          }),
        ).toThrow(
          "gapTargetDate must be inside the 90-day forecast horizon.",
        );
      },
    );
  },
);
