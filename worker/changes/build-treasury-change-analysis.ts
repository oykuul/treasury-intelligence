import type {
  LiquidityForecastResult,
  TreasuryDataset,
} from "../treasury/build-liquidity-forecast";

import {
  buildForecastChangeBridge,
  type ForecastChangeBridgeResult,
} from "./build-forecast-change-bridge";
import {
  compareRecords,
  type ComparedTreasuryRecord,
  type CompareRecordsResult,
} from "./compare-records";
import {
  reconcileMovement,
  type MovementReconciliationResult,
} from "./reconcile-movement";

export type TreasuryChangeAnalysisInput = {
  previousDatasets: TreasuryDataset[];
  currentDatasets: TreasuryDataset[];

  previousForecast: LiquidityForecastResult;
  currentForecast: LiquidityForecastResult;

  tolerance?: number;
};

export type TreasuryChangeAnalysisResult = {
  comparison: CompareRecordsResult;

  movement:
    MovementReconciliationResult;

  forecastBridge:
    ForecastChangeBridgeResult;
};

function flattenDatasets(
  datasets: TreasuryDataset[],
): ComparedTreasuryRecord[] {
  return datasets.flatMap(
    (dataset) =>
      dataset.records.map(
        (record) => ({
          datasetType:
            dataset.type,

          record,
        }),
      ),
  );
}

function getClosingLiquidity(
  forecast: LiquidityForecastResult,
): number {
  return (
    forecast.days.at(-1)
      ?.closingLiquidity ??
    forecast.openingLiquidity
  );
}

function getDatasetTypeKey(
  datasets: TreasuryDataset[],
): string {
  return datasets
    .map(
      (dataset) =>
        dataset.type,
    )
    .sort()
    .join("|");
}

export function buildTreasuryChangeAnalysis(
  input: TreasuryChangeAnalysisInput,
): TreasuryChangeAnalysisResult {
  if (
    getDatasetTypeKey(
      input.previousDatasets,
    ) !==
    getDatasetTypeKey(
      input.currentDatasets,
    )
  ) {
    throw new Error(
      "Previous and current dataset source types must match.",
    );
  }

  const comparison =
    compareRecords(
      flattenDatasets(
        input.previousDatasets,
      ),
      flattenDatasets(
        input.currentDatasets,
      ),
    );

  const movement =
    reconcileMovement({
      currency:
        input.currentForecast.currency,

      previousClosingLiquidity:
        getClosingLiquidity(
          input.previousForecast,
        ),

      currentClosingLiquidity:
        getClosingLiquidity(
          input.currentForecast,
        ),

      comparison,

      tolerance:
        input.tolerance,
    });

  const forecastBridge =
    buildForecastChangeBridge({
      previousForecast:
        input.previousForecast,

      currentForecast:
        input.currentForecast,

      comparison,

      tolerance:
        input.tolerance,
    });

  return {
    comparison,
    movement,
    forecastBridge,
  };
}
