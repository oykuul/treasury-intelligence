import type {
  LiquidityForecastResult,
  TreasuryDatasetType,
} from "../treasury/build-liquidity-forecast";

import type {
  CompareRecordsResult,
  TreasuryChange,
} from "./compare-records";

export type ForecastChangeBridgeStatus =
  | "RECONCILED"
  | "UNEXPLAINED";

export type ForecastChangeBridgeDriver = {
  stableId: string;

  changeType:
    TreasuryChange["changeType"];

  datasetType:
    TreasuryDatasetType;

  counterpartyName:
    string | null;

  documentNo:
    string | null;

  previousDate:
    string | null;

  currentDate:
    string | null;

  nominalLiquidityImpact:
    number;

  closingLiquidityImpact:
    number;

  minimumLiquidityImpact:
    number;

  minimumLiquidityAfter:
    number;
};

export type ForecastChangeBridgeInput = {
  previousForecast:
    LiquidityForecastResult;

  currentForecast:
    LiquidityForecastResult;

  comparison:
    CompareRecordsResult;

  tolerance?: number;
};

export type ForecastChangeBridgeResult = {
  currency: string;

  startDate: string;
  endDate: string;

  previousClosingLiquidity:
    number;

  currentClosingLiquidity:
    number;

  syntheticClosingLiquidity:
    number;

  actualClosingMovement:
    number;

  identifiedClosingMovement:
    number;

  unexplainedClosingMovement:
    number;

  previousMinimumLiquidity:
    number;

  currentMinimumLiquidity:
    number;

  syntheticMinimumLiquidity:
    number;

  actualMinimumMovement:
    number;

  identifiedMinimumMovement:
    number;

  unexplainedMinimumMovement:
    number;

  tolerance: number;

  status:
    ForecastChangeBridgeStatus;

  drivers:
    ForecastChangeBridgeDriver[];
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

function normalizeCurrency(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase();
}

function getFlowSign(
  datasetType:
    TreasuryDatasetType,
): number {
  return datasetType ===
    "receivables"
    ? 1
    : -1;
}

function getSignedAmount(
  datasetType:
    TreasuryDatasetType,
  amount: number,
): number {
  return (
    Math.abs(amount) *
    getFlowSign(datasetType)
  );
}

function isInsideHorizon(
  date: string | null,
  startDate: string,
  endDate: string,
): date is string {
  if (!date) {
    return false;
  }

  return (
    date >= startDate &&
    date <= endDate
  );
}

function impactFromEvent(
  eventDate: string | null,
  amount: number,
  day: string,
  startDate: string,
  endDate: string,
): number {
  if (
    !isInsideHorizon(
      eventDate,
      startDate,
      endDate,
    )
  ) {
    return 0;
  }

  return day >= eventDate
    ? amount
    : 0;
}

function getChangeImpactForDay(
  change: TreasuryChange,
  day: string,
  startDate: string,
  endDate: string,
): number {
  const sign =
    getFlowSign(
      change.datasetType,
    );

  if (
    change.changeType ===
    "NEW_ITEM"
  ) {
    if (
      change.currentAmount ===
      null
    ) {
      return 0;
    }

    return impactFromEvent(
      change.currentDate,
      Math.abs(
        change.currentAmount,
      ) * sign,
      day,
      startDate,
      endDate,
    );
  }

  if (
    change.changeType ===
    "REMOVED_ITEM"
  ) {
    if (
      change.previousAmount ===
      null
    ) {
      return 0;
    }

    return impactFromEvent(
      change.previousDate,
      -Math.abs(
        change.previousAmount,
      ) * sign,
      day,
      startDate,
      endDate,
    );
  }

  if (
    change.changeType ===
    "AMOUNT_CHANGED"
  ) {
    if (
      change.previousAmount ===
        null ||
      change.currentAmount ===
        null
    ) {
      return 0;
    }

    const previousSigned =
      getSignedAmount(
        change.datasetType,
        change.previousAmount,
      );

    const currentSigned =
      getSignedAmount(
        change.datasetType,
        change.currentAmount,
      );

    const amountDifference =
      currentSigned -
      previousSigned;

    const anchorDate =
      change.previousDate ??
      change.currentDate;

    return impactFromEvent(
      anchorDate,
      amountDifference,
      day,
      startDate,
      endDate,
    );
  }

  if (
    change.changeType ===
    "DATE_SHIFTED"
  ) {
    const amount =
      change.currentAmount ??
      change.previousAmount;

    if (amount === null) {
      return 0;
    }

    const signedAmount =
      getSignedAmount(
        change.datasetType,
        amount,
      );

    const removePrevious =
      impactFromEvent(
        change.previousDate,
        -signedAmount,
        day,
        startDate,
        endDate,
      );

    const addCurrent =
      impactFromEvent(
        change.currentDate,
        signedAmount,
        day,
        startDate,
        endDate,
      );

    return (
      removePrevious +
      addCurrent
    );
  }

  return 0;
}

function getMinimumLiquidity(
  openingLiquidity: number,
  closingValues: number[],
): number {
  return roundMoney(
    Math.min(
      openingLiquidity,
      ...closingValues,
    ),
  );
}

function getClosingLiquidity(
  forecast:
    LiquidityForecastResult,
): number {
  const lastDay =
    forecast.days[
      forecast.days.length - 1
    ];

  return roundMoney(
    lastDay
      ? lastDay.closingLiquidity
      : forecast.openingLiquidity,
  );
}

const CHANGE_PRIORITY:
  Record<
    TreasuryChange["changeType"],
    number
  > = {
    AMOUNT_CHANGED: 0,
    DATE_SHIFTED: 1,
    NEW_ITEM: 2,
    REMOVED_ITEM: 3,
  };

export function buildForecastChangeBridge(
  input:
    ForecastChangeBridgeInput,
): ForecastChangeBridgeResult {
  const previous =
    input.previousForecast;

  const current =
    input.currentForecast;

  const tolerance =
    input.tolerance ?? 0.01;

  if (
    !Number.isFinite(tolerance) ||
    tolerance < 0
  ) {
    throw new Error(
      "tolerance must be a non-negative finite number.",
    );
  }

  const previousCurrency =
    normalizeCurrency(
      previous.currency,
    );

  const currentCurrency =
    normalizeCurrency(
      current.currency,
    );

  if (
    previousCurrency !==
    currentCurrency
  ) {
    throw new Error(
      "Forecast currencies must match.",
    );
  }

  if (
    previous.startDate !==
      current.startDate ||
    previous.endDate !==
      current.endDate
  ) {
    throw new Error(
      "Forecast horizons must match.",
    );
  }

  if (
    previous.days.length !==
    current.days.length
  ) {
    throw new Error(
      "Forecast day structures must match.",
    );
  }

  for (
    let index = 0;
    index <
    previous.days.length;
    index += 1
  ) {
    if (
      previous.days[index]
        .date !==
      current.days[index].date
    ) {
      throw new Error(
        "Forecast day structures must match.",
      );
    }
  }

  const relevantChanges =
    input.comparison.changes
      .filter(
        (change) =>
          normalizeCurrency(
            change.currency ?? "",
          ) ===
          previousCurrency,
      )
      .sort((left, right) => {
        const stableIdCompare =
          left.stableId.localeCompare(
            right.stableId,
          );

        if (
          stableIdCompare !== 0
        ) {
          return stableIdCompare;
        }

        return (
          CHANGE_PRIORITY[
            left.changeType
          ] -
          CHANGE_PRIORITY[
            right.changeType
          ]
        );
      });

  let syntheticClosingValues =
    previous.days.map(
      (day) =>
        day.closingLiquidity,
    );

  const drivers:
    ForecastChangeBridgeDriver[] =
      [];

  for (
    const change of
    relevantChanges
  ) {
    const beforeClosing =
      syntheticClosingValues[
        syntheticClosingValues.length -
          1
      ] ??
      previous.openingLiquidity;

    const beforeMinimum =
      getMinimumLiquidity(
        previous.openingLiquidity,
        syntheticClosingValues,
      );

    syntheticClosingValues =
      syntheticClosingValues.map(
        (closingLiquidity, index) =>
          roundMoney(
            closingLiquidity +
              getChangeImpactForDay(
                change,
                previous.days[index]
                  .date,
                previous.startDate,
                previous.endDate,
              ),
          ),
      );

    const afterClosing =
      syntheticClosingValues[
        syntheticClosingValues.length -
          1
      ] ??
      previous.openingLiquidity;

    const afterMinimum =
      getMinimumLiquidity(
        previous.openingLiquidity,
        syntheticClosingValues,
      );

    drivers.push({
      stableId:
        change.stableId,

      changeType:
        change.changeType,

      datasetType:
        change.datasetType,

      counterpartyName:
        change.counterpartyName,

      documentNo:
        change.documentNo,

      previousDate:
        change.previousDate,

      currentDate:
        change.currentDate,

      nominalLiquidityImpact:
        roundMoney(
          change.liquidityImpact,
        ),

      closingLiquidityImpact:
        roundMoney(
          afterClosing -
            beforeClosing,
        ),

      minimumLiquidityImpact:
        roundMoney(
          afterMinimum -
            beforeMinimum,
        ),

      minimumLiquidityAfter:
        afterMinimum,
    });
  }

  const previousClosingLiquidity =
    getClosingLiquidity(
      previous,
    );

  const currentClosingLiquidity =
    getClosingLiquidity(
      current,
    );

  const syntheticClosingLiquidity =
    roundMoney(
      syntheticClosingValues[
        syntheticClosingValues.length -
          1
      ] ??
        previous.openingLiquidity,
    );

  const previousMinimumLiquidity =
    roundMoney(
      previous.minimumLiquidity,
    );

  const currentMinimumLiquidity =
    roundMoney(
      current.minimumLiquidity,
    );

  const syntheticMinimumLiquidity =
    getMinimumLiquidity(
      previous.openingLiquidity,
      syntheticClosingValues,
    );

  const actualClosingMovement =
    roundMoney(
      currentClosingLiquidity -
        previousClosingLiquidity,
    );

  const identifiedClosingMovement =
    roundMoney(
      syntheticClosingLiquidity -
        previousClosingLiquidity,
    );

  const unexplainedClosingMovement =
    roundMoney(
      actualClosingMovement -
        identifiedClosingMovement,
    );

  const actualMinimumMovement =
    roundMoney(
      currentMinimumLiquidity -
        previousMinimumLiquidity,
    );

  const identifiedMinimumMovement =
    roundMoney(
      syntheticMinimumLiquidity -
        previousMinimumLiquidity,
    );

  const unexplainedMinimumMovement =
    roundMoney(
      actualMinimumMovement -
        identifiedMinimumMovement,
    );

  const status:
    ForecastChangeBridgeStatus =
      Math.abs(
        unexplainedClosingMovement,
      ) <= tolerance &&
      Math.abs(
        unexplainedMinimumMovement,
      ) <= tolerance
        ? "RECONCILED"
        : "UNEXPLAINED";

  return {
    currency:
      previousCurrency,

    startDate:
      previous.startDate,

    endDate:
      previous.endDate,

    previousClosingLiquidity,

    currentClosingLiquidity,

    syntheticClosingLiquidity,

    actualClosingMovement,

    identifiedClosingMovement,

    unexplainedClosingMovement,

    previousMinimumLiquidity,

    currentMinimumLiquidity,

    syntheticMinimumLiquidity,

    actualMinimumMovement,

    identifiedMinimumMovement,

    unexplainedMinimumMovement,

    tolerance,

    status,

    drivers,
  };
}
