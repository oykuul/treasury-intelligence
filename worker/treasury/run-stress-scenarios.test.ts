import {
  describe,
  expect,
  it,
} from "vitest";

import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";

import {
  DEFAULT_STRESS_SCENARIOS,
  runStressScenarios,
} from "./run-stress-scenarios";

function createRecord(
  overrides: Partial<CanonicalTreasuryRecord>,
): CanonicalTreasuryRecord {
  return {
    sourceRowNumber: 2,

    company: null,

    counterpartyId: null,
    counterpartyName: null,

    bank: null,
    account: null,

    currency: null,
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
  "Stress Scenario Engine",
  () => {
    it(
      "compares Base, Moderate and Severe liquidity scenarios",
      () => {
        const payables = [
          createRecord({
            sourceRowNumber: 2,

            currency: "TRY",

            amount: 400000,

            dueDate:
              "2026-08-25",
          }),

          createRecord({
            sourceRowNumber: 3,

            currency: "TRY",

            amount: 300000,

            dueDate:
              "2026-09-05",
          }),
        ];

        const receivables = [
          createRecord({
            sourceRowNumber: 10,

            currency: "TRY",

            amount: 500000,

            dueDate:
              "2026-08-24",
          }),
        ];

        const result =
          runStressScenarios({
            datasets: [
              {
                type:
                  "payables",

                records:
                  payables,
              },

              {
                type:
                  "receivables",

                records:
                  receivables,
              },
            ],

            currency: "TRY",

            openingLiquidity:
              600000,

            startDate:
              "2026-08-20",

            endDate:
              "2026-09-10",

            minimumLiquidityThreshold:
              100000,

            scenarios:
              DEFAULT_STRESS_SCENARIOS,
          });

        expect(
          result.scenarios,
        ).toHaveLength(3);

        const base =
          result.scenarios[0];

        const moderate =
          result.scenarios[1];

        const severe =
          result.scenarios[2];

        expect(base.name).toBe(
          "BASE",
        );

        expect(
          base.minimumLiquidity,
        ).toBe(400000);

        expect(
          base.fundingNeed,
        ).toBe(0);

        expect(
          base.thresholdBreachDays,
        ).toBe(0);

        expect(
          base.firstThresholdBreachDate,
        ).toBeNull();

        expect(
          moderate.name,
        ).toBe("MODERATE");

        expect(
          moderate.stressedOpeningLiquidity,
        ).toBe(570000);

        expect(
          moderate.totalInflows,
        ).toBe(450000);

        expect(
          moderate.totalOutflows,
        ).toBe(735000);

        expect(
          moderate.minimumLiquidity,
        ).toBe(150000);

        expect(
          moderate.fundingNeed,
        ).toBe(0);

        expect(
          moderate.thresholdBreachDays,
        ).toBe(0);

        expect(
          severe.name,
        ).toBe("SEVERE");

        expect(
          severe.stressedOpeningLiquidity,
        ).toBe(540000);

        expect(
          severe.totalInflows,
        ).toBe(375000);

        expect(
          severe.totalOutflows,
        ).toBe(770000);

        expect(
          severe.minimumLiquidity,
        ).toBe(-230000);

        expect(
          severe.minimumLiquidityDate,
        ).toBe("2026-08-29");

        expect(
          severe.fundingNeed,
        ).toBe(230000);

        expect(
          severe.thresholdBreachDays,
        ).toBe(10);

        expect(
          severe.firstThresholdBreachDate,
        ).toBe("2026-08-29");
      },
    );

    it(
      "does not mutate the original treasury records",
      () => {
        const record =
          createRecord({
            currency: "TRY",

            amount: 100000,

            dueDate:
              "2026-08-25",
          });

        const original = {
          ...record,
        };

        runStressScenarios({
          datasets: [
            {
              type: "payables",
              records: [record],
            },
          ],

          currency: "TRY",

          openingLiquidity:
            500000,

          startDate:
            "2026-08-20",

          endDate:
            "2026-08-30",

          minimumLiquidityThreshold:
            0,

          scenarios: [
            DEFAULT_STRESS_SCENARIOS[2],
          ],
        });

        expect(record).toEqual(
          original,
        );
      },
    );

    it(
      "supports a custom stress scenario",
      () => {
        const result =
          runStressScenarios({
            datasets: [],

            currency: "TRY",

            openingLiquidity:
              1000000,

            startDate:
              "2026-08-20",

            endDate:
              "2026-08-20",

            minimumLiquidityThreshold:
              500000,

            scenarios: [
              {
                name: "CUSTOM",

                label:
                  "Custom Scenario",

                receivablesDelayDays:
                  0,

                receivablesCollectionRate:
                  1,

                payablesAccelerationDays:
                  0,

                payablesAmountMultiplier:
                  1,

                debtAmountMultiplier:
                  1,

                openingLiquidityHaircutPercent:
                  0.6,
              },
            ],
          });

        expect(
          result.scenarios[0]
            .stressedOpeningLiquidity,
        ).toBe(400000);

        expect(
          result.scenarios[0]
            .thresholdBreachDays,
        ).toBe(1);

        expect(
          result.scenarios[0]
            .firstThresholdBreachDate,
        ).toBe("2026-08-20");
      },
    );

    it(
      "rejects invalid scenario assumptions",
      () => {
        expect(() =>
          runStressScenarios({
            datasets: [],

            currency: "TRY",

            openingLiquidity:
              1000000,

            startDate:
              "2026-08-20",

            endDate:
              "2026-08-30",

            minimumLiquidityThreshold:
              0,

            scenarios: [
              {
                name: "CUSTOM",

                label: "Invalid",

                receivablesDelayDays:
                  0,

                receivablesCollectionRate:
                  1.2,

                payablesAccelerationDays:
                  0,

                payablesAmountMultiplier:
                  1,

                debtAmountMultiplier:
                  1,

                openingLiquidityHaircutPercent:
                  0,
              },
            ],
          }),
        ).toThrow(
          "receivablesCollectionRate must be between 0 and 1.",
        );
      },
    );
  },
);

it(
  "rounds monetary stress outputs to two decimal places",
  () => {
    const record =
      createRecord({
        currency: "TRY",
        amount: 100.01,
        dueDate: "2026-08-20",
      });

    const result =
      runStressScenarios({
        datasets: [
          {
            type: "payables",
            records: [record],
          },
        ],

        currency: "TRY",

        openingLiquidity: 1000,

        startDate: "2026-08-20",
        endDate: "2026-08-20",

        minimumLiquidityThreshold: 0,

        scenarios: [
          {
            name: "CUSTOM",
            label: "Decimal Test",

            receivablesDelayDays: 0,
            receivablesCollectionRate: 1,

            payablesAccelerationDays: 0,
            payablesAmountMultiplier: 1.05,

            debtAmountMultiplier: 1,

            openingLiquidityHaircutPercent: 0,
          },
        ],
      });

    const scenario =
      result.scenarios[0];

    expect(
      scenario.totalOutflows,
    ).toBe(105.01);

    expect(
      scenario.minimumLiquidity,
    ).toBe(894.99);

    expect(
      scenario.curve[0].closingLiquidity,
    ).toBe(894.99);
  },
);
