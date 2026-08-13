import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";

import {
  buildLiquidityForecast,
  type TreasuryDataset,
} from "./build-liquidity-forecast";

export type CfoMetricsInput = {
  datasets: TreasuryDataset[];

  currency: string;

  asOfDate: string;

  openingLiquidity: number;

  unusedCommittedFacilities: number;
};

export type CfoMetricsResult = {
  currency: string;
  asOfDate: string;

  availableLiquidity: number;

  minimumForecastCash: number;
  minimumForecastCashDate: string;

  liquidityHeadroom: number;

  fundingNeed30D: number;
  fundingNeed90D: number;

  receivablesAtRisk: number;

  debtDue90D: number;

  unusedCommittedFacilities: number;
};

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

function addDays(
  value: Date,
  days: number,
): Date {
  return new Date(
    value.getTime() +
      days * 86_400_000,
  );
}

function normalizeCurrency(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase();
}

function isSameCurrency(
  record: CanonicalTreasuryRecord,
  currency: string,
): boolean {
  return (
    record.currency
      ?.trim()
      .toUpperCase() === currency
  );
}

function getReceivablesAtRisk(
  datasets: TreasuryDataset[],
  currency: string,
  asOfDate: string,
): number {
  let total = 0;

  for (const dataset of datasets) {
    if (dataset.type !== "receivables") {
      continue;
    }

    for (const record of dataset.records) {
      if (
        !isSameCurrency(
          record,
          currency,
        )
      ) {
        continue;
      }

      if (
        record.amount === null ||
        !Number.isFinite(record.amount)
      ) {
        continue;
      }

      if (!record.dueDate) {
        continue;
      }

      const dueDate =
        parseIsoDate(
          record.dueDate,
        );

      if (!dueDate) {
        continue;
      }

      if (
        record.dueDate < asOfDate
      ) {
        total +=
          Math.abs(record.amount);
      }
    }
  }

  return total;
}

function getDebtDue90D(
  datasets: TreasuryDataset[],
  currency: string,
  asOfDate: string,
  endDate90D: string,
): number {
  let total = 0;

  for (const dataset of datasets) {
    if (dataset.type !== "debt") {
      continue;
    }

    for (const record of dataset.records) {
      if (
        !isSameCurrency(
          record,
          currency,
        )
      ) {
        continue;
      }

      if (
        record.nextPaymentAmount === null ||
        !Number.isFinite(
          record.nextPaymentAmount,
        )
      ) {
        continue;
      }

      if (!record.nextPaymentDate) {
        continue;
      }

      const paymentDate =
        parseIsoDate(
          record.nextPaymentDate,
        );

      if (!paymentDate) {
        continue;
      }

      if (
        record.nextPaymentDate >= asOfDate &&
        record.nextPaymentDate <= endDate90D
      ) {
        total += Math.abs(
          record.nextPaymentAmount,
        );
      }
    }
  }

  return total;
}

export function buildCfoMetrics(
  input: CfoMetricsInput,
): CfoMetricsResult {
  const currency =
    normalizeCurrency(
      input.currency,
    );

  if (!currency) {
    throw new Error(
      "currency is required.",
    );
  }

  const asOf =
    parseIsoDate(
      input.asOfDate,
    );

  if (!asOf) {
    throw new Error(
      "asOfDate must be a valid ISO date.",
    );
  }

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
      input.unusedCommittedFacilities,
    ) ||
    input.unusedCommittedFacilities < 0
  ) {
    throw new Error(
      "unusedCommittedFacilities must be a non-negative finite number.",
    );
  }

  // Inclusive horizons:
  // asOfDate + 29 days = 30 calendar days
  // asOfDate + 89 days = 90 calendar days
  const endDate30D =
    formatIsoDate(
      addDays(
        asOf,
        29,
      ),
    );

  const endDate90D =
    formatIsoDate(
      addDays(
        asOf,
        89,
      ),
    );

  const forecast30D =
    buildLiquidityForecast({
      datasets:
        input.datasets,

      currency,

      openingLiquidity:
        input.openingLiquidity,

      startDate:
        input.asOfDate,

      endDate:
        endDate30D,
    });

  const forecast90D =
    buildLiquidityForecast({
      datasets:
        input.datasets,

      currency,

      openingLiquidity:
        input.openingLiquidity,

      startDate:
        input.asOfDate,

      endDate:
        endDate90D,
    });

  const availableLiquidity =
    input.openingLiquidity +
    input.unusedCommittedFacilities;

  const liquidityHeadroom =
    forecast90D.minimumLiquidity +
    input.unusedCommittedFacilities;

  const fundingNeed30D =
    Math.max(
      0,
      -(
        forecast30D.minimumLiquidity +
        input.unusedCommittedFacilities
      ),
    );

  const fundingNeed90D =
    Math.max(
      0,
      -(
        forecast90D.minimumLiquidity +
        input.unusedCommittedFacilities
      ),
    );

  const receivablesAtRisk =
    getReceivablesAtRisk(
      input.datasets,
      currency,
      input.asOfDate,
    );

  const debtDue90D =
    getDebtDue90D(
      input.datasets,
      currency,
      input.asOfDate,
      endDate90D,
    );

  return {
    currency,

    asOfDate:
      input.asOfDate,

    availableLiquidity,

    minimumForecastCash:
      forecast90D.minimumLiquidity,

    minimumForecastCashDate:
      forecast90D.minimumLiquidityDate,

    liquidityHeadroom,

    fundingNeed30D,
    fundingNeed90D,

    receivablesAtRisk,

    debtDue90D,

    unusedCommittedFacilities:
      input.unusedCommittedFacilities,
  };
}