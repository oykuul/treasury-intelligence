import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";

export type TreasuryDatasetType =
  | "payables"
  | "receivables"
  | "debt";

export type TreasuryDataset = {
  type: TreasuryDatasetType;
  records: CanonicalTreasuryRecord[];
};

export type LiquidityFlowDirection =
  | "inflow"
  | "outflow";

export type LiquidityFlow = {
  sourceRowNumber: number;
  datasetType: TreasuryDatasetType;

  date: string;
  currency: string;
  amount: number;
  direction: LiquidityFlowDirection;

  counterpartyName: string | null;
  documentNo: string | null;
};

export type LiquidityDay = {
  date: string;

  inflow: number;
  outflow: number;
  netFlow: number;

  openingLiquidity: number;
  closingLiquidity: number;

  flows: LiquidityFlow[];
};

export type IgnoredTreasuryRecord = {
  sourceRowNumber: number;
  datasetType: TreasuryDatasetType;
  reason:
    | "MISSING_DATE"
    | "MISSING_AMOUNT"
    | "CURRENCY_MISMATCH";
};

export type LiquidityForecastResult = {
  currency: string;

  startDate: string;
  endDate: string;

  openingLiquidity: number;

  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;

  minimumLiquidity: number;
  minimumLiquidityDate: string;

  fundingNeed: number;

  days: LiquidityDay[];

  ignoredRecords: IgnoredTreasuryRecord[];
};

export type BuildLiquidityForecastInput = {
  datasets: TreasuryDataset[];

  currency: string;

  openingLiquidity: number;

  startDate: string;
  endDate: string;
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

function getFlowDirection(
  type: TreasuryDatasetType,
): LiquidityFlowDirection {
  if (type === "receivables") {
    return "inflow";
  }

  return "outflow";
}

function getFlowDate(
  type: TreasuryDatasetType,
  record: CanonicalTreasuryRecord,
): string | null {
  if (type === "debt") {
    return record.nextPaymentDate;
  }

  return record.dueDate;
}

function getFlowAmount(
  type: TreasuryDatasetType,
  record: CanonicalTreasuryRecord,
): number | null {
  if (type === "debt") {
    return record.nextPaymentAmount;
  }

  return record.amount;
}

function buildFlows(
  datasets: TreasuryDataset[],
  currency: string,
): {
  flows: LiquidityFlow[];
  ignoredRecords: IgnoredTreasuryRecord[];
} {
  const flows: LiquidityFlow[] = [];

  const ignoredRecords:
    IgnoredTreasuryRecord[] = [];

  for (const dataset of datasets) {
    for (const record of dataset.records) {
      const recordCurrency =
        record.currency
          ?.trim()
          .toUpperCase();

      if (
        !recordCurrency ||
        recordCurrency !== currency
      ) {
        ignoredRecords.push({
          sourceRowNumber:
            record.sourceRowNumber,

          datasetType:
            dataset.type,

          reason:
            "CURRENCY_MISMATCH",
        });

        continue;
      }

      const date =
        getFlowDate(
          dataset.type,
          record,
        );

      if (
        !date ||
        !parseIsoDate(date)
      ) {
        ignoredRecords.push({
          sourceRowNumber:
            record.sourceRowNumber,

          datasetType:
            dataset.type,

          reason:
            "MISSING_DATE",
        });

        continue;
      }

      const rawAmount =
        getFlowAmount(
          dataset.type,
          record,
        );

      if (
        rawAmount === null ||
        !Number.isFinite(rawAmount)
      ) {
        ignoredRecords.push({
          sourceRowNumber:
            record.sourceRowNumber,

          datasetType:
            dataset.type,

          reason:
            "MISSING_AMOUNT",
        });

        continue;
      }

      flows.push({
        sourceRowNumber:
          record.sourceRowNumber,

        datasetType:
          dataset.type,

        date,

        currency,

        amount:
          Math.abs(rawAmount),

        direction:
          getFlowDirection(
            dataset.type,
          ),

        counterpartyName:
          record.counterpartyName,

        documentNo:
          record.documentNo,
      });
    }
  }

  return {
    flows,
    ignoredRecords,
  };
}

export function buildLiquidityForecast(
  input: BuildLiquidityForecastInput,
): LiquidityForecastResult {
  const currency =
    normalizeCurrency(
      input.currency,
    );

  if (!currency) {
    throw new Error(
      "currency is required.",
    );
  }

  const start =
    parseIsoDate(
      input.startDate,
    );

  const end =
    parseIsoDate(
      input.endDate,
    );

  if (!start || !end) {
    throw new Error(
      "startDate and endDate must be valid ISO dates.",
    );
  }

  if (
    end.getTime() <
    start.getTime()
  ) {
    throw new Error(
      "endDate cannot be earlier than startDate.",
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

  const {
    flows,
    ignoredRecords,
  } = buildFlows(
    input.datasets,
    currency,
  );

  const flowsByDate =
    new Map<
      string,
      LiquidityFlow[]
    >();

  for (const flow of flows) {
    const existing =
      flowsByDate.get(
        flow.date,
      ) ?? [];

    existing.push(flow);

    flowsByDate.set(
      flow.date,
      existing,
    );
  }

  const days: LiquidityDay[] = [];

  let runningLiquidity =
    input.openingLiquidity;

  let totalInflows = 0;
  let totalOutflows = 0;

  // Opening liquidity is part of the
  // forecast horizon and can itself
  // be the minimum cash position.
  let minimumLiquidity =
    input.openingLiquidity;

  let minimumLiquidityDate =
    input.startDate;

  for (
    let current = start;
    current.getTime() <= end.getTime();
    current = addDays(current, 1)
  ) {
    const date =
      formatIsoDate(current);

    const dayFlows =
      flowsByDate.get(date) ?? [];

    let inflow = 0;
    let outflow = 0;

    for (const flow of dayFlows) {
      if (
        flow.direction === "inflow"
      ) {
        inflow += flow.amount;
      } else {
        outflow += flow.amount;
      }
    }

    const openingLiquidity =
      runningLiquidity;

    const netFlow =
      inflow - outflow;

    const closingLiquidity =
      openingLiquidity +
      netFlow;

    totalInflows += inflow;
    totalOutflows += outflow;

    runningLiquidity =
      closingLiquidity;

    if (
      closingLiquidity <
      minimumLiquidity
    ) {
      minimumLiquidity =
        closingLiquidity;

      minimumLiquidityDate =
        date;
    }

    days.push({
      date,

      inflow,
      outflow,
      netFlow,

      openingLiquidity,
      closingLiquidity,

      flows:
        dayFlows,
    });
  }

  const netCashFlow =
    totalInflows -
    totalOutflows;

  const fundingNeed =
    Math.max(
      0,
      -minimumLiquidity,
    );

  return {
    currency,

    startDate:
      input.startDate,

    endDate:
      input.endDate,

    openingLiquidity:
      input.openingLiquidity,

    totalInflows,
    totalOutflows,
    netCashFlow,

    minimumLiquidity,
    minimumLiquidityDate,

    fundingNeed,

    days,

    ignoredRecords,
  };
}