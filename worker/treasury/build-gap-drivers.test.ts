import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  CanonicalTreasuryRecord,
} from "../canonical/normalize-records";

import {
  buildGapDrivers,
} from "./build-gap-drivers";

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

describe(
  "Gap Drivers Engine",
  () => {
    it(
      "builds the daily liquidity waterfall and counterparty concentration",
      () => {
        const result =
          buildGapDrivers({
            datasets: [
              {
                type: "payables",

                records: [
                  createRecord({
                    counterpartyId:
                      "V10001",

                    counterpartyName:
                      "Marmara Lojistik",

                    documentNo:
                      "AP-001",

                    amount:
                      480000,

                    dueDate:
                      "2026-08-22",
                  }),

                  createRecord({
                    counterpartyId:
                      "V10002",

                    counterpartyName:
                      "Atlas Otomotiv",

                    documentNo:
                      "AP-002",

                    amount:
                      300000,

                    dueDate:
                      "2026-08-22",
                  }),
                ],
              },

              {
                type: "receivables",

                records: [
                  createRecord({
                    counterpartyId:
                      "C10001",

                    counterpartyName:
                      "Customer A",

                    documentNo:
                      "AR-001",

                    amount:
                      250000,

                    dueDate:
                      "2026-08-22",
                  }),

                  createRecord({
                    counterpartyId:
                      "C10001",

                    counterpartyName:
                      "Customer A",

                    documentNo:
                      "AR-002",

                    amount:
                      200000,

                    dueDate:
                      "2026-08-22",
                  }),
                ],
              },

              {
                type: "debt",

                records: [
                  createRecord({
                    debtId:
                      "DEBT-001",

                    lender:
                      "Bank A",

                    nextPaymentAmount:
                      120000,

                    nextPaymentDate:
                      "2026-08-22",
                  }),
                ],
              },
            ],

            currency: "TRY",

            openingLiquidity:
              1200000,

            startDate:
              "2026-08-22",

            targetDate:
              "2026-08-22",
          });

        expect(
          result.openingLiquidity,
        ).toBe(1200000);

        expect(
          result.receivablesInflows,
        ).toBe(450000);

        expect(
          result.payablesOutflows,
        ).toBe(780000);

        expect(
          result.debtOutflows,
        ).toBe(120000);

        expect(
          result.totalInflows,
        ).toBe(450000);

        expect(
          result.totalOutflows,
        ).toBe(900000);

        expect(
          result.netMovement,
        ).toBe(-450000);

        expect(
          result.projectedCash,
        ).toBe(750000);

        expect(
          result.minimumLiquidityToDate,
        ).toBe(750000);

        expect(
          result.minimumLiquidityDate,
        ).toBe("2026-08-22");

        expect(
          result.totalGrossFlow,
        ).toBe(1350000);

        expect(
          result.top3CounterpartyConcentration,
        ).toBe(91.11);

        expect(
          result.counterparties,
        ).toEqual([
          {
            counterpartyName:
              "Marmara Lojistik",

            grossAmount:
              480000,

            netImpact:
              -480000,

            sharePercent:
              35.56,
          },

          {
            counterpartyName:
              "Customer A",

            grossAmount:
              450000,

            netImpact:
              450000,

            sharePercent:
              33.33,
          },

          {
            counterpartyName:
              "Atlas Otomotiv",

            grossAmount:
              300000,

            netImpact:
              -300000,

            sharePercent:
              22.22,
          },

          {
            counterpartyName:
              "Bank A",

            grossAmount:
              120000,

            netImpact:
              -120000,

            sharePercent:
              8.89,
          },
        ]);

        expect(
          result.flows[0],
        ).toMatchObject({
          counterpartyName:
            "Marmara Lojistik",

          datasetType:
            "payables",

          direction:
            "OUTFLOW",

          amount:
            480000,

          signedImpact:
            -480000,
        });
      },
    );

    it(
      "uses the opening liquidity of the selected target day",
      () => {
        const result =
          buildGapDrivers({
            datasets: [
              {
                type: "payables",

                records: [
                  createRecord({
                    counterpartyName:
                      "Supplier A",

                    amount:
                      200000,

                    dueDate:
                      "2026-08-20",
                  }),

                  createRecord({
                    counterpartyName:
                      "Supplier B",

                    amount:
                      100000,

                    dueDate:
                      "2026-08-22",
                  }),
                ],
              },

              {
                type: "receivables",

                records: [
                  createRecord({
                    counterpartyName:
                      "Customer A",

                    amount:
                      50000,

                    dueDate:
                      "2026-08-21",
                  }),
                ],
              },
            ],

            currency:
              "TRY",

            openingLiquidity:
              1000000,

            startDate:
              "2026-08-20",

            targetDate:
              "2026-08-22",
          });

        expect(
          result.openingLiquidity,
        ).toBe(850000);

        expect(
          result.totalOutflows,
        ).toBe(100000);

        expect(
          result.totalInflows,
        ).toBe(0);

        expect(
          result.projectedCash,
        ).toBe(750000);
      },
    );

    it(
      "isolates the requested currency",
      () => {
        const result =
          buildGapDrivers({
            datasets: [
              {
                type: "payables",

                records: [
                  createRecord({
                    counterpartyName:
                      "TRY Supplier",

                    currency:
                      "TRY",

                    amount:
                      100000,

                    dueDate:
                      "2026-08-22",
                  }),

                  createRecord({
                    counterpartyName:
                      "EUR Supplier",

                    currency:
                      "EUR",

                    amount:
                      900000,

                    dueDate:
                      "2026-08-22",
                  }),
                ],
              },
            ],

            currency:
              "TRY",

            openingLiquidity:
              500000,

            startDate:
              "2026-08-22",

            targetDate:
              "2026-08-22",
          });

        expect(
          result.totalOutflows,
        ).toBe(100000);

        expect(
          result.projectedCash,
        ).toBe(400000);

        expect(
          result.flows,
        ).toHaveLength(1);

        expect(
          result.flows[0]
            .counterpartyName,
        ).toBe("TRY Supplier");
      },
    );

    it(
      "returns zero concentration when there are no flows on the selected day",
      () => {
        const result =
          buildGapDrivers({
            datasets: [],

            currency:
              "TRY",

            openingLiquidity:
              500000,

            startDate:
              "2026-08-22",

            targetDate:
              "2026-08-22",
          });

        expect(
          result.totalGrossFlow,
        ).toBe(0);

        expect(
          result.top3CounterpartyConcentration,
        ).toBe(0);

        expect(
          result.counterparties,
        ).toEqual([]);

        expect(
          result.flows,
        ).toEqual([]);

        expect(
          result.projectedCash,
        ).toBe(500000);
      },
    );

    it(
      "rejects a target date before the forecast start date",
      () => {
        expect(() =>
          buildGapDrivers({
            datasets: [],

            currency:
              "TRY",

            openingLiquidity:
              500000,

            startDate:
              "2026-08-22",

            targetDate:
              "2026-08-21",
          }),
        ).toThrow(
          "targetDate must be on or after startDate.",
        );
      },
    );
  },
);
