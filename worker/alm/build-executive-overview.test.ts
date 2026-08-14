import { describe, expect, it } from "vitest";

import type { DebtFundingResult } from "./build-debt-funding";
import type { InterestRateRiskResult } from "./build-interest-rate-risk";
import type { MaturityGapResult } from "./build-maturity-gap";
import type { CfoMetricsResult } from "../treasury/build-cfo-metrics";
import type { CfoVerdictResult } from "../treasury/build-cfo-verdict";
import type { StressScenarioComparison } from "../treasury/run-stress-scenarios";
import { buildAlmExecutiveOverview } from "./build-executive-overview";

function buildInput() {
  const metrics: CfoMetricsResult = {
    currency: "TRY",
    asOfDate: "2026-08-14",
    availableLiquidity: 50,
    minimumForecastCash: 20,
    minimumForecastCashDate: "2026-09-01",
    liquidityHeadroom: 10,
    fundingNeed30D: 0,
    fundingNeed90D: 0,
    receivablesAtRisk: 0,
    debtDue90D: 0,
    unusedCommittedFacilities: 25,
  };
  const liquidityVerdict: CfoVerdictResult = {
    verdict: "HEALTHY",
    headline: "Healthy",
    reasons: [],
    actions: [],
  };
  const scenario = (
    name: "BASE" | "MODERATE" | "SEVERE",
    fundingNeed = 0,
    breachDays = 0,
  ): StressScenarioComparison["scenarios"][number] => ({
    name,
    label: name,
    assumptions: {
      name,
      label: name,
      receivablesDelayDays: 0,
      receivablesCollectionRate: 1,
      payablesAccelerationDays: 0,
      payablesAmountMultiplier: 1,
      debtAmountMultiplier: 1,
      openingLiquidityHaircutPercent: 0,
    },
    stressedOpeningLiquidity: 25,
    totalInflows: 0,
    totalOutflows: 0,
    netCashFlow: 0,
    minimumLiquidity: fundingNeed > 0 ? -fundingNeed : 20,
    minimumLiquidityDate: "2026-09-01",
    fundingNeed,
    thresholdBreachDays: breachDays,
    firstThresholdBreachDate: breachDays > 0 ? "2026-09-01" : null,
    ignoredRecordCount: 0,
    curve: [],
  });
  const stress: StressScenarioComparison = {
    currency: "TRY",
    startDate: "2026-08-14",
    endDate: "2026-11-11",
    minimumLiquidityThreshold: 15,
    scenarios: [
      scenario("BASE"),
      scenario("MODERATE"),
      scenario("SEVERE"),
    ],
  };
  const maturityGap = {
    residualFundingNeed: 0,
    fundingNeedBeforeFacilities: 0,
    minimumCumulativeGap12M: 5,
    ignoredItems: [],
  } as unknown as MaturityGapResult;
  const debtFunding = {
    debtDue12M: 0,
    refinancingNeed12M: 0,
    top3LenderConcentration: 50,
    facilityUtilizationPercent: 20,
    ignoredItems: [],
  } as unknown as DebtFundingResult;
  const interestRateRisk = {
    totalInterestBearingDebt: 100,
    repricingExposure12M: 20,
    rateCoveragePercent: 100,
    unclassifiedRateDebt: 0,
    sensitivityScenarios: [
      {
        shockBps: 200,
        annualizedInterestIncrease: 2,
        shockedAnnualInterestExpense: 20,
        effectiveWeightedAverageRatePercent: 20,
      },
    ],
    dataIssues: [],
  } as unknown as InterestRateRiskResult;

  return {
    currency: "TRY",
    asOfDate: "2026-08-14",
    metrics,
    liquidityVerdict,
    stress,
    maturityGap,
    debtFunding,
    interestRateRisk,
  };
}

describe("buildAlmExecutiveOverview", () => {
  it("returns healthy when every ALM pillar is within threshold", () => {
    const result = buildAlmExecutiveOverview(buildInput());

    expect(result.status).toBe("HEALTHY");
    expect(result.pillars).toHaveLength(6);
    expect(result.priorityActions).toEqual([]);
    expect(result.dominantRiskPillar).toBeNull();
  });

  it("makes near-term liquidity critical and dominant", () => {
    const input = buildInput();
    input.liquidityVerdict.verdict = "CRITICAL";
    input.metrics.fundingNeed90D = 30;

    const result = buildAlmExecutiveOverview(input);

    expect(result.status).toBe("CRITICAL");
    expect(result.dominantRiskPillar).toBe("LIQUIDITY");
    expect(result.priorityActions[0]).toMatchObject({
      pillarId: "LIQUIDITY",
      status: "CRITICAL",
      impactAmount: 30,
    });
  });

  it("flags residual maturity and refinancing gaps for action", () => {
    const input = buildInput();
    input.maturityGap.residualFundingNeed = 40;
    input.maturityGap.minimumCumulativeGap12M = -65;
    input.debtFunding.debtDue12M = 100;
    input.debtFunding.refinancingNeed12M = 60;

    const result = buildAlmExecutiveOverview(input);

    expect(result.status).toBe("ACTION_REQUIRED");
    expect(result.statusCounts.ACTION_REQUIRED).toBe(2);
    expect(result.dominantRiskPillar).toBe("FUNDING");
    expect(result.priorityActions.map((action) => action.pillarId)).toEqual([
      "FUNDING",
      "MATURITY",
    ]);
  });

  it("uses committed facilities when grading stress capacity", () => {
    const input = buildInput();
    input.stress.scenarios[1].fundingNeed = 30;
    input.stress.scenarios[2].fundingNeed = 40;

    const result = buildAlmExecutiveOverview(input);
    const stress = result.pillars.find((pillar) => pillar.id === "STRESS");

    expect(stress?.status).toBe("ACTION_REQUIRED");
    expect(stress?.impactAmount).toBe(15);
  });

  it("flags material repricing exposure as watch", () => {
    const input = buildInput();
    input.interestRateRisk.repricingExposure12M = 60;

    const result = buildAlmExecutiveOverview(input);
    const rate = result.pillars.find((pillar) => pillar.id === "RATE");

    expect(rate?.status).toBe("WATCH");
    expect(result.status).toBe("WATCH");
  });

  it("converts disclosed data findings into a data pillar", () => {
    const input = buildInput();
    input.interestRateRisk.dataIssues = [
      {
        sourceType: "debt",
        referenceId: "DEBT-1",
        reason: "MISSING_INTEREST_RATE",
      },
    ];

    const result = buildAlmExecutiveOverview(input);
    const data = result.pillars.find((pillar) => pillar.id === "DATA");

    expect(data?.status).toBe("WATCH");
    expect(result.dataQualityFindings).toBe(1);
  });
});
