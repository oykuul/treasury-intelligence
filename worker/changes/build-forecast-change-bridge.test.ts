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
} from "../treasury/build-liquidity-forecast";

import {
  compareRecords,
  type ComparedTreasuryRecord,
  type CompareRecordsResult,
} from "./compare-records";

import {
  buildForecastChangeBridge,
} from "./build-forecast-change-bridge";

function createRecord(
  overrides: Partial<CanonicalTreasuryRecord>,
): CanonicalTreasuryRecord {
  return {
    sourceRowNumber: 2,

    company: "1000",

    fiscalYear: "2026",
    lineItemNo: "001",

    counterpartyId: null,
    counterpartyName: null,

    bank: null,
    account: null,

    currency: "TRY",
    amount: null,
    debitCredit: null,

    documentNo: null,
    documentType: "KR",

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

function compared(
  datasetType:
    ComparedTreasuryRecord["datasetType"],
  record: CanonicalTreasuryRecord,
): ComparedTreasuryRecord {
  return {
    datasetType,
    record,
  };
}

describe(
  "Forecast Change Bridge",
  () => {
    it(
      "captures minimum liquidity timing impact when a payment shifts inside the same horizon",
      () => {
        const previousPayable =
          createRecord({
            documentNo: "190001",
            lineItemNo: "001",
            counterpartyId:
              "V10001",
            counterpartyName:
              "Atlas Otomotiv",
            amount: 400000,
            dueDate:
              "2026-08-20",
          });

        const currentPayable =
          createRecord({
            documentNo: "190001",
            lineItemNo: "001",
            counterpartyId:
              "V10001",
            counterpartyName:
              "Atlas Otomotiv",
            amount: 400000,
            dueDate:
              "2026-08-23",
          });

        const receivable =
          createRecord({
            documentNo: "AR-001",
            lineItemNo: "001",
            documentType: "DR",
            counterpartyId:
              "C10001",
            counterpartyName:
              "Customer A",
            amount: 300000,
            dueDate:
              "2026-08-22",
          });

        const previousForecast =
          buildLiquidityForecast({
            datasets: [
              {
                type: "payables",
                records: [
                  previousPayable,
                ],
              },
              {
                type: "receivables",
                records: [
                  receivable,
                ],
              },
            ],

            currency: "TRY",
            openingLiquidity:
              500000,

            startDate:
              "2026-08-20",
            endDate:
              "2026-08-24",
          });

        const currentForecast =
          buildLiquidityForecast({
            datasets: [
              {
                type: "payables",
                records: [
                  currentPayable,
                ],
              },
              {
                type: "receivables",
                records: [
                  receivable,
                ],
              },
            ],

            currency: "TRY",
            openingLiquidity:
              500000,

            startDate:
              "2026-08-20",
            endDate:
              "2026-08-24",
          });

        const comparison =
          compareRecords(
            [
              compared(
                "payables",
                previousPayable,
              ),
              compared(
                "receivables",
                receivable,
              ),
            ],
            [
              compared(
                "payables",
                currentPayable,
              ),
              compared(
                "receivables",
                receivable,
              ),
            ],
          );

        const result =
          buildForecastChangeBridge({
            previousForecast,
            currentForecast,
            comparison,
          });

        expect(
          previousForecast
            .minimumLiquidity,
        ).toBe(100000);

        expect(
          currentForecast
            .minimumLiquidity,
        ).toBe(400000);

        expect(
          result.actualClosingMovement,
        ).toBe(0);

        expect(
          result.identifiedClosingMovement,
        ).toBe(0);

        expect(
          result.actualMinimumMovement,
        ).toBe(300000);

        expect(
          result.identifiedMinimumMovement,
        ).toBe(300000);

        expect(
          result.unexplainedMinimumMovement,
        ).toBe(0);

        expect(
          result.status,
        ).toBe("RECONCILED");

        expect(
          result.drivers,
        ).toHaveLength(1);

        expect(
          result.drivers[0],
        ).toMatchObject({
          changeType:
            "DATE_SHIFTED",

          previousDate:
            "2026-08-20",

          currentDate:
            "2026-08-23",

          nominalLiquidityImpact:
            0,

          closingLiquidityImpact:
            0,

          minimumLiquidityImpact:
            300000,
        });
      },
    );

    it(
      "captures closing liquidity impact when a payment shifts outside the forecast horizon",
      () => {
        const previousPayable =
          createRecord({
            documentNo: "190002",
            lineItemNo: "001",
            counterpartyId:
              "V10002",
            amount: 300000,
            dueDate:
              "2026-08-20",
          });

        const currentPayable =
          createRecord({
            documentNo: "190002",
            lineItemNo: "001",
            counterpartyId:
              "V10002",
            amount: 300000,
            dueDate:
              "2026-08-25",
          });

        const previousForecast =
          buildLiquidityForecast({
            datasets: [
              {
                type: "payables",
                records: [
                  previousPayable,
                ],
              },
            ],

            currency: "TRY",
            openingLiquidity:
              500000,

            startDate:
              "2026-08-20",
            endDate:
              "2026-08-22",
          });

        const currentForecast =
          buildLiquidityForecast({
            datasets: [
              {
                type: "payables",
                records: [
                  currentPayable,
                ],
              },
            ],

            currency: "TRY",
            openingLiquidity:
              500000,

            startDate:
              "2026-08-20",
            endDate:
              "2026-08-22",
          });

        const comparison =
          compareRecords(
            [
              compared(
                "payables",
                previousPayable,
              ),
            ],
            [
              compared(
                "payables",
                currentPayable,
              ),
            ],
          );

        const result =
          buildForecastChangeBridge({
            previousForecast,
            currentForecast,
            comparison,
          });

        expect(
          result.previousClosingLiquidity,
        ).toBe(200000);

        expect(
          result.currentClosingLiquidity,
        ).toBe(500000);

        expect(
          result.actualClosingMovement,
        ).toBe(300000);

        expect(
          result.identifiedClosingMovement,
        ).toBe(300000);

        expect(
          result.unexplainedClosingMovement,
        ).toBe(0);

        expect(
          result.actualMinimumMovement,
        ).toBe(300000);

        expect(
          result.identifiedMinimumMovement,
        ).toBe(300000);

        expect(
          result.status,
        ).toBe("RECONCILED");
      },
    );

    it(
      "does not double count a record when both amount and date change",
      () => {
        const previousPayable =
          createRecord({
            documentNo: "190003",
            lineItemNo: "001",
            counterpartyId:
              "V10003",
            amount: 100000,
            dueDate:
              "2026-08-20",
          });

        const currentPayable =
          createRecord({
            documentNo: "190003",
            lineItemNo: "001",
            counterpartyId:
              "V10003",
            amount: 150000,
            dueDate:
              "2026-08-22",
          });

        const previousForecast =
          buildLiquidityForecast({
            datasets: [
              {
                type: "payables",
                records: [
                  previousPayable,
                ],
              },
            ],

            currency: "TRY",
            openingLiquidity:
              500000,

            startDate:
              "2026-08-20",
            endDate:
              "2026-08-23",
          });

        const currentForecast =
          buildLiquidityForecast({
            datasets: [
              {
                type: "payables",
                records: [
                  currentPayable,
                ],
              },
            ],

            currency: "TRY",
            openingLiquidity:
              500000,

            startDate:
              "2026-08-20",
            endDate:
              "2026-08-23",
          });

        const comparison =
          compareRecords(
            [
              compared(
                "payables",
                previousPayable,
              ),
            ],
            [
              compared(
                "payables",
                currentPayable,
              ),
            ],
          );

        expect(
          comparison.summary
            .amountChanges,
        ).toBe(1);

        expect(
          comparison.summary
            .dateShifts,
        ).toBe(1);

        const result =
          buildForecastChangeBridge({
            previousForecast,
            currentForecast,
            comparison,
          });

        expect(
          result.actualClosingMovement,
        ).toBe(-50000);

        expect(
          result.identifiedClosingMovement,
        ).toBe(-50000);

        expect(
          result.unexplainedClosingMovement,
        ).toBe(0);

        expect(
          result.actualMinimumMovement,
        ).toBe(-50000);

        expect(
          result.identifiedMinimumMovement,
        ).toBe(-50000);

        expect(
          result.drivers,
        ).toHaveLength(2);

        expect(
          result.status,
        ).toBe("RECONCILED");
      },
    );

    it(
      "flags forecast movement that is not explained by the supplied change drivers",
      () => {
        const previousPayable =
          createRecord({
            documentNo: "190004",
            lineItemNo: "001",
            counterpartyId:
              "V10004",
            amount: 100000,
            dueDate:
              "2026-08-20",
          });

        const currentPayable =
          createRecord({
            documentNo: "190004",
            lineItemNo: "001",
            counterpartyId:
              "V10004",
            amount: 200000,
            dueDate:
              "2026-08-20",
          });

        const previousForecast =
          buildLiquidityForecast({
            datasets: [
              {
                type: "payables",
                records: [
                  previousPayable,
                ],
              },
            ],

            currency: "TRY",
            openingLiquidity:
              500000,

            startDate:
              "2026-08-20",
            endDate:
              "2026-08-22",
          });

        const currentForecast =
          buildLiquidityForecast({
            datasets: [
              {
                type: "payables",
                records: [
                  currentPayable,
                ],
              },
            ],

            currency: "TRY",
            openingLiquidity:
              500000,

            startDate:
              "2026-08-20",
            endDate:
              "2026-08-22",
          });

        const emptyComparison:
          CompareRecordsResult = {
          changes: [],

          summary: {
            amountChanges: 0,
            dateShifts: 0,
            newItems: 0,
            removedItems: 0,
            totalLiquidityImpact:
              0,
            totalChanges: 0,
          },
        };

        const result =
          buildForecastChangeBridge({
            previousForecast,
            currentForecast,
            comparison:
              emptyComparison,
          });

        expect(
          result.actualClosingMovement,
        ).toBe(-100000);

        expect(
          result.identifiedClosingMovement,
        ).toBe(0);

        expect(
          result.unexplainedClosingMovement,
        ).toBe(-100000);

        expect(
          result.actualMinimumMovement,
        ).toBe(-100000);

        expect(
          result.identifiedMinimumMovement,
        ).toBe(0);

        expect(
          result.unexplainedMinimumMovement,
        ).toBe(-100000);

        expect(
          result.status,
        ).toBe("UNEXPLAINED");
      },
    );
  },
);
