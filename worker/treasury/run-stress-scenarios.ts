import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";

import {
  buildLiquidityForecast,
  type TreasuryDataset,
} from "./build-liquidity-forecast";

export type StressScenarioName =
  | "BASE"
  | "MODERATE"
  | "SEVERE"
  | "CUSTOM";

export type StressScenarioDefinition = {
  name: StressScenarioName;
  label: string;

  receivablesDelayDays: number;
  receivablesCollectionRate: number;

  payablesAccelerationDays: number;
  payablesAmountMultiplier: number;

  debtAmountMultiplier: number;

  openingLiquidityHaircutPercent: number;
};

export type StressScenarioInput = {
  datasets: TreasuryDataset[];

  currency: string;

  openingLiquidity: number;

  startDate: string;
  endDate: string;

  minimumLiquidityThreshold: number;

  scenarios: StressScenarioDefinition[];
};

export type StressCurvePoint = {
  date: string;
  closingLiquidity: number;
};

export type StressScenarioResult = {
  name: StressScenarioName;
  label: string;

  assumptions: StressScenarioDefinition;

  stressedOpeningLiquidity: number;

  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;

  minimumLiquidity: number;
  minimumLiquidityDate: string;

  fundingNeed: number;

  thresholdBreachDays: number;
  firstThresholdBreachDate: string | null;

  ignoredRecordCount: number;

  curve: StressCurvePoint[];
};

export type StressScenarioComparison = {
  currency: string;

  startDate: string;
  endDate: string;

  minimumLiquidityThreshold: number;

  scenarios: StressScenarioResult[];
};

export const DEFAULT_STRESS_SCENARIOS:
  StressScenarioDefinition[] = [
    {
      name: "BASE",
      label: "Base",

      receivablesDelayDays: 0,
      receivablesCollectionRate: 1,

      payablesAccelerationDays: 0,
      payablesAmountMultiplier: 1,

      debtAmountMultiplier: 1,

      openingLiquidityHaircutPercent: 0,
    },

    {
      name: "MODERATE",
      label: "Moderate",

      receivablesDelayDays: 7,
      receivablesCollectionRate: 0.9,

      payablesAccelerationDays: 3,
      payablesAmountMultiplier: 1.05,

      debtAmountMultiplier: 1,

      openingLiquidityHaircutPercent: 0.05,
    },

    {
      name: "SEVERE",
      label: "Severe",

      receivablesDelayDays: 15,
      receivablesCollectionRate: 0.75,

      payablesAccelerationDays: 7,
      payablesAmountMultiplier: 1.1,

      debtAmountMultiplier: 1.05,

      openingLiquidityHaircutPercent: 0.1,
    },
  ];

function roundMoney(
  value: number,
): number {
  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100;
}

function parseIsoDate(
  value: string,
): Date | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
    ),
  );

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatIsoDate(
  value: Date,
): string {
  return value
    .toISOString()
    .slice(0, 10);
}

function shiftIsoDate(
  value: string | null,
  days: number,
): string | null {
  if (!value) {
    return null;
  }

  const parsed =
    parseIsoDate(value);

  if (!parsed) {
    return value;
  }

  return formatIsoDate(
    new Date(
      parsed.getTime() +
        days * 86_400_000,
    ),
  );
}

function clampDateToStart(
  value: string | null,
  startDate: string,
): string | null {
  if (!value) {
    return null;
  }

  return value < startDate
    ? startDate
    : value;
}

function validateScenario(
  scenario: StressScenarioDefinition,
): void {
  if (
    !Number.isInteger(
      scenario.receivablesDelayDays,
    ) ||
    scenario.receivablesDelayDays < 0
  ) {
    throw new Error(
      "receivablesDelayDays must be a non-negative integer.",
    );
  }

  if (
    !Number.isFinite(
      scenario.receivablesCollectionRate,
    ) ||
    scenario.receivablesCollectionRate < 0 ||
    scenario.receivablesCollectionRate > 1
  ) {
    throw new Error(
      "receivablesCollectionRate must be between 0 and 1.",
    );
  }

  if (
    !Number.isInteger(
      scenario.payablesAccelerationDays,
    ) ||
    scenario.payablesAccelerationDays < 0
  ) {
    throw new Error(
      "payablesAccelerationDays must be a non-negative integer.",
    );
  }

  if (
    !Number.isFinite(
      scenario.payablesAmountMultiplier,
    ) ||
    scenario.payablesAmountMultiplier < 0
  ) {
    throw new Error(
      "payablesAmountMultiplier must be a non-negative finite number.",
    );
  }

  if (
    !Number.isFinite(
      scenario.debtAmountMultiplier,
    ) ||
    scenario.debtAmountMultiplier < 0
  ) {
    throw new Error(
      "debtAmountMultiplier must be a non-negative finite number.",
    );
  }

  if (
    !Number.isFinite(
      scenario.openingLiquidityHaircutPercent,
    ) ||
    scenario.openingLiquidityHaircutPercent < 0 ||
    scenario.openingLiquidityHaircutPercent > 1
  ) {
    throw new Error(
      "openingLiquidityHaircutPercent must be between 0 and 1.",
    );
  }
}

function stressRecord(
  record: CanonicalTreasuryRecord,
  datasetType: TreasuryDataset["type"],
  scenario: StressScenarioDefinition,
  startDate: string,
): CanonicalTreasuryRecord {
  if (datasetType === "receivables") {
    return {
      ...record,

      amount:
        record.amount === null
          ? null
          : roundMoney(
              Math.abs(record.amount) *
                scenario.receivablesCollectionRate,
            ),

      dueDate:
        shiftIsoDate(
          record.dueDate,
          scenario.receivablesDelayDays,
        ),
    };
  }

  if (datasetType === "payables") {
    const stressedDate =
      shiftIsoDate(
        record.dueDate,
        -scenario.payablesAccelerationDays,
      );

    return {
      ...record,

      amount:
        record.amount === null
          ? null
          : roundMoney(
              Math.abs(record.amount) *
                scenario.payablesAmountMultiplier,
            ),

      dueDate:
        clampDateToStart(
          stressedDate,
          startDate,
        ),
    };
  }

  return {
    ...record,

    nextPaymentAmount:
      record.nextPaymentAmount === null
        ? null
        : roundMoney(
            Math.abs(
              record.nextPaymentAmount,
            ) *
              scenario.debtAmountMultiplier,
          ),
  };
}

function stressDatasets(
  datasets: TreasuryDataset[],
  scenario: StressScenarioDefinition,
  startDate: string,
): TreasuryDataset[] {
  return datasets.map(
    (dataset) => ({
      type: dataset.type,

      records:
        dataset.records.map(
          (record) =>
            stressRecord(
              record,
              dataset.type,
              scenario,
              startDate,
            ),
        ),
    }),
  );
}

export function runStressScenarios(
  input: StressScenarioInput,
): StressScenarioComparison {
  if (
    !Number.isFinite(
      input.openingLiquidity,
    )
  ) {
    throw new Error(
      "openingLiquidity must be a finite number.",
    );
  }

  if (
    !Number.isFinite(
      input.minimumLiquidityThreshold,
    )
  ) {
    throw new Error(
      "minimumLiquidityThreshold must be a finite number.",
    );
  }

  if (
    input.scenarios.length === 0
  ) {
    throw new Error(
      "At least one stress scenario is required.",
    );
  }

  const scenarios =
    input.scenarios.map(
      (
        scenario,
      ): StressScenarioResult => {
        validateScenario(
          scenario,
        );

        const stressedOpeningLiquidity =
          roundMoney(
            input.openingLiquidity *
              (
                1 -
                scenario.openingLiquidityHaircutPercent
              ),
          );

        const stressedDatasets =
          stressDatasets(
            input.datasets,
            scenario,
            input.startDate,
          );

        const forecast =
          buildLiquidityForecast({
            datasets:
              stressedDatasets,

            currency:
              input.currency,

            openingLiquidity:
              stressedOpeningLiquidity,

            startDate:
              input.startDate,

            endDate:
              input.endDate,
          });

        const breachedDays =
          forecast.days.filter(
            (day) =>
              day.closingLiquidity <
              input.minimumLiquidityThreshold,
          );

        return {
          name:
            scenario.name,

          label:
            scenario.label,

          assumptions: {
            ...scenario,
          },

          stressedOpeningLiquidity,

          totalInflows:
            roundMoney(
              forecast.totalInflows,
            ),

          totalOutflows:
            roundMoney(
              forecast.totalOutflows,
            ),

          netCashFlow:
            roundMoney(
              forecast.netCashFlow,
            ),

          minimumLiquidity:
            roundMoney(
              forecast.minimumLiquidity,
            ),

          minimumLiquidityDate:
            forecast.minimumLiquidityDate,

          fundingNeed:
            roundMoney(
              forecast.fundingNeed,
            ),

          thresholdBreachDays:
            breachedDays.length,

          firstThresholdBreachDate:
            breachedDays[0]?.date ??
            null,

          ignoredRecordCount:
            forecast.ignoredRecords.length,

          curve:
            forecast.days.map(
              (day) => ({
                date:
                  day.date,

                closingLiquidity:
                  roundMoney(
                    day.closingLiquidity,
                  ),
              }),
            ),
        };
      },
    );

  return {
    currency:
      input.currency
        .trim()
        .toUpperCase(),

    startDate:
      input.startDate,

    endDate:
      input.endDate,

    minimumLiquidityThreshold:
      input.minimumLiquidityThreshold,

    scenarios,
  };
}