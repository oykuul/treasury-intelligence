import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  CanonicalTreasuryRecord,
} from "../canonical/normalize-records";

import {
  buildLiquidityForecast,
  type TreasuryDataset,
} from "../treasury/build-liquidity-forecast";

import {
  buildTreasuryChangeAnalysis,
} from "./build-treasury-change-analysis";

function record(
  amount: number,
): CanonicalTreasuryRecord {
  return {
    sourceRowNumber: 1,

    company: "1000",
    fiscalYear: "2026",

    counterpartyId: "V10001",
    counterpartyName:
      "Atlas Otomotiv",

    bank: null,
    account: null,

    currency: "TRY",
    amount,
    debitCredit: null,

    documentNo: "190001",
    lineItemNo: "001",
    documentType: "KR",

    postingDate: null,
    documentDate: null,
    dueDate: "2026-08-15",
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
  };
}

function forecast(
  datasets: TreasuryDataset[],
) {
  return buildLiquidityForecast({
    datasets,
    currency: "TRY",
    openingLiquidity: 1_000,
    startDate: "2026-08-14",
    endDate: "2026-08-20",
  });
}

describe(
  "buildTreasuryChangeAnalysis",
  () => {
    it(
      "reconciles record changes to forecast movement",
      () => {
        const previousDatasets:
          TreasuryDataset[] = [
            {
              type: "payables",
              records: [
                record(100),
              ],
            },
          ];

        const currentDatasets:
          TreasuryDataset[] = [
            {
              type: "payables",
              records: [
                record(150),
              ],
            },
          ];

        const result =
          buildTreasuryChangeAnalysis({
            previousDatasets,
            currentDatasets,

            previousForecast:
              forecast(
                previousDatasets,
              ),

            currentForecast:
              forecast(
                currentDatasets,
              ),
          });

        expect(
          result.comparison.summary,
        ).toMatchObject({
          amountChanges: 1,
          totalLiquidityImpact: -50,
          totalChanges: 1,
        });

        expect(
          result.movement,
        ).toMatchObject({
          forecastMovement: -50,
          identifiedDriverImpact: -50,
          unexplainedMovement: 0,
          status: "RECONCILED",
        });

        expect(
          result.forecastBridge,
        ).toMatchObject({
          actualClosingMovement: -50,
          identifiedClosingMovement: -50,
          unexplainedClosingMovement: 0,
          status: "RECONCILED",
        });
      },
    );

    it(
      "rejects incomplete period comparisons",
      () => {
        const previousDatasets:
          TreasuryDataset[] = [
            {
              type: "payables",
              records: [
                record(100),
              ],
            },
          ];

        const currentDatasets:
          TreasuryDataset[] = [
            {
              type: "receivables",
              records: [
                record(100),
              ],
            },
          ];

        expect(() =>
          buildTreasuryChangeAnalysis({
            previousDatasets,
            currentDatasets,

            previousForecast:
              forecast(
                previousDatasets,
              ),

            currentForecast:
              forecast(
                currentDatasets,
              ),
          }),
        ).toThrow(
          "Previous and current dataset source types must match.",
        );
      },
    );
  },
);
