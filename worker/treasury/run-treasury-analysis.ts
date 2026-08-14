import {
  buildCfoMetrics,
  type CfoMetricsResult,
} from "./build-cfo-metrics";
import {
  buildCfoVerdict,
  type CfoVerdictResult,
} from "./build-cfo-verdict";
import {
  buildGapDrivers,
  type GapDriversResult,
} from "./build-gap-drivers";
import {
  buildLiquidityForecast,
  type LiquidityForecastResult,
  type TreasuryDataset,
} from "./build-liquidity-forecast";
import {
  DEFAULT_STRESS_SCENARIOS,
  runStressScenarios,
  type StressScenarioComparison,
  type StressScenarioDefinition,
} from "./run-stress-scenarios";
import {
  buildMaturityGap,
  type MaturityGapResult,
} from "../alm/build-maturity-gap";
import {
  buildDebtFunding,
  type DebtFundingResult,
} from "../alm/build-debt-funding";
import {
  buildInterestRateRisk,
  type InterestRateRiskResult,
} from "../alm/build-interest-rate-risk";
import {
  buildAlmExecutiveOverview,
  type AlmExecutiveOverviewResult,
} from "../alm/build-executive-overview";
import {
  buildFundingPlan,
  type FundingPlanResult,
} from "../alm/build-funding-plan";
import type {
  AlmPosition,
} from "../alm/positions";

export type TreasuryAnalysisInput = {
  datasets: TreasuryDataset[];
  positions?: AlmPosition[];

  currency: string;
  asOfDate: string;

  openingLiquidity: number;
  unusedCommittedFacilities: number;

  minimumLiquidityBuffer: number;
  minimumLiquidityThreshold?: number;

  gapTargetDate?: string;

  scenarios?: StressScenarioDefinition[];
};

export type TreasuryAnalysisResult = {
  currency: string;
  asOfDate: string;
  endDate: string;

  forecast: LiquidityForecastResult;
  metrics: CfoMetricsResult;
  verdict: CfoVerdictResult;
  stress: StressScenarioComparison;
  gapDrivers: GapDriversResult;
  maturityGap: MaturityGapResult;
  debtFunding: DebtFundingResult;
  interestRateRisk: InterestRateRiskResult;
  fundingPlan: FundingPlanResult;
  executiveOverview: AlmExecutiveOverviewResult;
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

export function runTreasuryAnalysis(
  input: TreasuryAnalysisInput,
): TreasuryAnalysisResult {
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
      input.minimumLiquidityBuffer,
    ) ||
    input.minimumLiquidityBuffer < 0
  ) {
    throw new Error(
      "minimumLiquidityBuffer must be a non-negative finite number.",
    );
  }

  const endDate =
    formatIsoDate(
      addDays(
        asOf,
        89,
      ),
    );

  const forecast =
    buildLiquidityForecast({
      datasets:
        input.datasets,

      currency:
        input.currency,

      openingLiquidity:
        input.openingLiquidity,

      startDate:
        input.asOfDate,

      endDate,
    });

  const metrics =
    buildCfoMetrics({
      datasets:
        input.datasets,

      currency:
        input.currency,

      asOfDate:
        input.asOfDate,

      openingLiquidity:
        input.openingLiquidity,

      unusedCommittedFacilities:
        input.unusedCommittedFacilities,
    });

  const verdict =
    buildCfoVerdict({
      metrics,

      minimumLiquidityBuffer:
        input.minimumLiquidityBuffer,
    });

  const minimumLiquidityThreshold =
    input.minimumLiquidityThreshold ??
    input.minimumLiquidityBuffer;

  const stress =
    runStressScenarios({
      datasets:
        input.datasets,

      currency:
        input.currency,

      openingLiquidity:
        input.openingLiquidity,

      startDate:
        input.asOfDate,

      endDate,

      minimumLiquidityThreshold,

      scenarios:
        input.scenarios ??
        DEFAULT_STRESS_SCENARIOS,
    });

  const gapTargetDate =
    input.gapTargetDate ??
    forecast.minimumLiquidityDate;

  if (
    gapTargetDate < input.asOfDate ||
    gapTargetDate > endDate
  ) {
    throw new Error(
      "gapTargetDate must be inside the 90-day forecast horizon.",
    );
  }

  const gapDrivers =
    buildGapDrivers({
      datasets:
        input.datasets,

      currency:
        input.currency,

      openingLiquidity:
        input.openingLiquidity,

      startDate:
        input.asOfDate,

      targetDate:
        gapTargetDate,
    });

  const maturityGap =
    buildMaturityGap({
      datasets:
        input.datasets,

      positions:
        input.positions,

      currency:
        input.currency,

      asOfDate:
        input.asOfDate,

      openingLiquidity:
        input.openingLiquidity,

      availableFacilities:
        input.unusedCommittedFacilities,
    });

  const debtFunding =
    buildDebtFunding({
      datasets:
        input.datasets,

      positions:
        input.positions,

      currency:
        input.currency,

      asOfDate:
        input.asOfDate,
    });

  const interestRateRisk =
    buildInterestRateRisk({
      datasets:
        input.datasets,

      positions:
        input.positions,

      currency:
        input.currency,

      asOfDate:
        input.asOfDate,
    });

  const fundingPlan =
    buildFundingPlan({
      maturityGap,
      debtFunding,
      minimumLiquidityBuffer:
        input.minimumLiquidityBuffer,
    });

  const executiveOverview =
    buildAlmExecutiveOverview({
      currency:
        input.currency,

      asOfDate:
        input.asOfDate,

      metrics,

      liquidityVerdict:
        verdict,

      stress,

      maturityGap,

      debtFunding,

      interestRateRisk,
    });

  return {
    currency:
      forecast.currency,

    asOfDate:
      input.asOfDate,

    endDate,

    forecast,
    metrics,
    verdict,
    stress,
    gapDrivers,
    maturityGap,
    debtFunding,
    interestRateRisk,
    fundingPlan,
    executiveOverview,
  };
}
