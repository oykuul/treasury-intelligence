import type {
  CanonicalTreasuryRecord,
} from "../canonical/normalize-records";

import {
  buildLiquidityForecast,
  type TreasuryDataset,
  type TreasuryDatasetType,
} from "./build-liquidity-forecast";

export type GapDriverDirection =
  | "INFLOW"
  | "OUTFLOW";

export type GapDriverFlow = {
  datasetType:
    TreasuryDatasetType;

  direction:
    GapDriverDirection;

  counterpartyId:
    string | null;

  counterpartyName:
    string;

  documentNo:
    string | null;

  debtId:
    string | null;

  date: string;

  currency: string;

  amount: number;

  signedImpact: number;
};

export type CounterpartyConcentration = {
  counterpartyName: string;

  grossAmount: number;

  netImpact: number;

  sharePercent: number;
};

export type GapDriversInput = {
  datasets:
    TreasuryDataset[];

  currency: string;

  openingLiquidity:
    number;

  startDate: string;

  targetDate: string;
};

export type GapDriversResult = {
  currency: string;

  targetDate: string;

  openingLiquidity:
    number;

  receivablesInflows:
    number;

  payablesOutflows:
    number;

  debtOutflows:
    number;

  totalInflows:
    number;

  totalOutflows:
    number;

  netMovement:
    number;

  projectedCash:
    number;

  minimumLiquidityToDate:
    number;

  minimumLiquidityDate:
    string;

  flows:
    GapDriverFlow[];

  counterparties:
    CounterpartyConcentration[];

  top3CounterpartyConcentration:
    number;

  totalGrossFlow:
    number;
};

function roundMoney(
  value: number,
): number {
  return (
    Math.round(
      (value + Number.EPSILON) *
        100,
    ) / 100
  );
}

function roundPercent(
  value: number,
): number {
  return (
    Math.round(
      (value + Number.EPSILON) *
        100,
    ) / 100
  );
}

function normalizeCurrency(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase();
}

function getRecordDate(
  datasetType:
    TreasuryDatasetType,
  record:
    CanonicalTreasuryRecord,
): string | null {
  if (
    datasetType ===
    "debt"
  ) {
    return (
      record.nextPaymentDate
    );
  }

  return record.dueDate;
}

function getRecordAmount(
  datasetType:
    TreasuryDatasetType,
  record:
    CanonicalTreasuryRecord,
): number | null {
  if (
    datasetType ===
    "debt"
  ) {
    return (
      record.nextPaymentAmount
    );
  }

  return record.amount;
}

function getCounterpartyId(
  datasetType:
    TreasuryDatasetType,
  record:
    CanonicalTreasuryRecord,
): string | null {
  if (
    datasetType ===
    "debt"
  ) {
    return (
      record.debtId ??
      null
    );
  }

  return (
    record.counterpartyId ??
    null
  );
}

function getCounterpartyName(
  datasetType:
    TreasuryDatasetType,
  record:
    CanonicalTreasuryRecord,
): string {
  if (
    datasetType ===
    "debt"
  ) {
    return (
      record.lender ??
      record.debtId ??
      "Unknown Lender"
    );
  }

  return (
    record.counterpartyName ??
    record.counterpartyId ??
    "Unknown Counterparty"
  );
}

function getDirection(
  datasetType:
    TreasuryDatasetType,
): GapDriverDirection {
  return datasetType ===
    "receivables"
    ? "INFLOW"
    : "OUTFLOW";
}

function getSignedImpact(
  datasetType:
    TreasuryDatasetType,
  amount: number,
): number {
  return datasetType ===
    "receivables"
    ? Math.abs(amount)
    : -Math.abs(amount);
}

function buildDailyFlows(
  datasets:
    TreasuryDataset[],
  currency: string,
  targetDate: string,
): GapDriverFlow[] {
  const flows:
    GapDriverFlow[] = [];

  for (
    const dataset of
    datasets
  ) {
    for (
      const record of
      dataset.records
    ) {
      const recordCurrency =
        normalizeCurrency(
          record.currency ?? "",
        );

      if (
        recordCurrency !==
        currency
      ) {
        continue;
      }

      const date =
        getRecordDate(
          dataset.type,
          record,
        );

      if (
        date !== targetDate
      ) {
        continue;
      }

      const rawAmount =
        getRecordAmount(
          dataset.type,
          record,
        );

      if (
        rawAmount === null ||
        !Number.isFinite(
          rawAmount,
        )
      ) {
        continue;
      }

      const amount =
        roundMoney(
          Math.abs(
            rawAmount,
          ),
        );

      flows.push({
        datasetType:
          dataset.type,

        direction:
          getDirection(
            dataset.type,
          ),

        counterpartyId:
          getCounterpartyId(
            dataset.type,
            record,
          ),

        counterpartyName:
          getCounterpartyName(
            dataset.type,
            record,
          ),

        documentNo:
          record.documentNo,

        debtId:
          record.debtId,

        date,

        currency,

        amount,

        signedImpact:
          roundMoney(
            getSignedImpact(
              dataset.type,
              amount,
            ),
          ),
      });
    }
  }

  return flows.sort(
    (left, right) => {
      const amountDifference =
        Math.abs(
          right.signedImpact,
        ) -
        Math.abs(
          left.signedImpact,
        );

      if (
        amountDifference !== 0
      ) {
        return amountDifference;
      }

      return (
        left.counterpartyName.localeCompare(
          right.counterpartyName,
        )
      );
    },
  );
}

function buildCounterpartyConcentration(
  flows:
    GapDriverFlow[],
): {
  counterparties:
    CounterpartyConcentration[];

  top3CounterpartyConcentration:
    number;

  totalGrossFlow:
    number;
} {
  const grouped =
    new Map<
      string,
      {
        grossAmount: number;
        netImpact: number;
      }
    >();

  for (const flow of flows) {
    const existing =
      grouped.get(
        flow.counterpartyName,
      ) ?? {
        grossAmount: 0,
        netImpact: 0,
      };

    existing.grossAmount =
      roundMoney(
        existing.grossAmount +
          flow.amount,
      );

    existing.netImpact =
      roundMoney(
        existing.netImpact +
          flow.signedImpact,
      );

    grouped.set(
      flow.counterpartyName,
      existing,
    );
  }

  const totalGrossFlow =
    roundMoney(
      flows.reduce(
        (
          total,
          flow,
        ) =>
          total +
          flow.amount,
        0,
      ),
    );

  const counterparties =
    Array.from(
      grouped.entries(),
    )
      .map(
        ([
          counterpartyName,
          values,
        ]): CounterpartyConcentration => ({
          counterpartyName,

          grossAmount:
            values.grossAmount,

          netImpact:
            values.netImpact,

          sharePercent:
            totalGrossFlow === 0
              ? 0
              : roundPercent(
                  (
                    values.grossAmount /
                    totalGrossFlow
                  ) * 100,
                ),
        }),
      )
      .sort(
        (left, right) =>
          right.grossAmount -
          left.grossAmount,
      );

  const top3GrossAmount =
    counterparties
      .slice(0, 3)
      .reduce(
        (
          total,
          counterparty,
        ) =>
          total +
          counterparty.grossAmount,
        0,
      );

  const top3CounterpartyConcentration =
    totalGrossFlow === 0
      ? 0
      : roundPercent(
          (
            top3GrossAmount /
            totalGrossFlow
          ) * 100,
        );

  return {
    counterparties,

    top3CounterpartyConcentration,

    totalGrossFlow,
  };
}

export function buildGapDrivers(
  input:
    GapDriversInput,
): GapDriversResult {
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
    input.startDate >
    input.targetDate
  ) {
    throw new Error(
      "targetDate must be on or after startDate.",
    );
  }

  const currency =
    normalizeCurrency(
      input.currency,
    );

  if (!currency) {
    throw new Error(
      "currency is required.",
    );
  }

  const forecast =
    buildLiquidityForecast({
      datasets:
        input.datasets,

      currency,

      openingLiquidity:
        input.openingLiquidity,

      startDate:
        input.startDate,

      endDate:
        input.targetDate,
    });

  const targetDay =
    forecast.days.find(
      (day) =>
        day.date ===
        input.targetDate,
    );

  if (!targetDay) {
    throw new Error(
      "Target date was not found in the liquidity forecast.",
    );
  }

  const flows =
    buildDailyFlows(
      input.datasets,
      currency,
      input.targetDate,
    );

  const receivablesInflows =
    roundMoney(
      flows
        .filter(
          (flow) =>
            flow.datasetType ===
            "receivables",
        )
        .reduce(
          (
            total,
            flow,
          ) =>
            total +
            flow.amount,
          0,
        ),
    );

  const payablesOutflows =
    roundMoney(
      flows
        .filter(
          (flow) =>
            flow.datasetType ===
            "payables",
        )
        .reduce(
          (
            total,
            flow,
          ) =>
            total +
            flow.amount,
          0,
        ),
    );

  const debtOutflows =
    roundMoney(
      flows
        .filter(
          (flow) =>
            flow.datasetType ===
            "debt",
        )
        .reduce(
          (
            total,
            flow,
          ) =>
            total +
            flow.amount,
          0,
        ),
    );

  const totalInflows =
    receivablesInflows;

  const totalOutflows =
    roundMoney(
      payablesOutflows +
        debtOutflows,
    );

  const netMovement =
    roundMoney(
      totalInflows -
        totalOutflows,
    );

  const concentration =
    buildCounterpartyConcentration(
      flows,
    );

  return {
    currency,

    targetDate:
      input.targetDate,

    openingLiquidity:
      roundMoney(
        targetDay.openingLiquidity,
      ),

    receivablesInflows,

    payablesOutflows,

    debtOutflows,

    totalInflows,

    totalOutflows,

    netMovement,

    projectedCash:
      roundMoney(
        targetDay.closingLiquidity,
      ),

    minimumLiquidityToDate:
      roundMoney(
        forecast.minimumLiquidity,
      ),

    minimumLiquidityDate:
      forecast.minimumLiquidityDate,

    flows,

    counterparties:
      concentration.counterparties,

    top3CounterpartyConcentration:
      concentration
        .top3CounterpartyConcentration,

    totalGrossFlow:
      concentration.totalGrossFlow,
  };
}
