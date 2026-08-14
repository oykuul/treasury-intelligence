import { describe, expect, it } from "vitest";

import type { DebtFundingResult } from "./build-debt-funding";
import type { FundingPlanResult } from "./build-funding-plan";
import type { InterestRateRiskResult } from "./build-interest-rate-risk";
import type { CfoMetricsResult } from "../treasury/build-cfo-metrics";
import { buildPolicyLimits } from "./build-policy-limits";

const metrics: CfoMetricsResult = {
  currency: "TRY",
  asOfDate: "2026-08-14",
  availableLiquidity: 100,
  minimumForecastCash: 40,
  minimumForecastCashDate: "2026-09-01",
  liquidityHeadroom: 60,
  fundingNeed30D: 0,
  fundingNeed90D: 0,
  receivablesAtRisk: 0,
  debtDue90D: 0,
  unusedCommittedFacilities: 20,
};

const debtFunding = {
  currency: "TRY",
  asOfDate: "2026-08-14",
  facilityUtilizationPercent: 50,
  top3LenderConcentration: 55,
  facilityCoverage12MPercent: 125,
} as DebtFundingResult;

const interestRateRisk = {
  currency: "TRY",
  asOfDate: "2026-08-14",
  floatingRateSharePercent: 30,
} as InterestRateRiskResult;

const fundingPlan = {
  currency: "TRY",
  asOfDate: "2026-08-14",
  policyBuffer: 15,
  externalFundingNeed: 0,
} as FundingPlanResult;

describe("buildPolicyLimits", () => {
  it("returns compliant when every measure has sufficient headroom", () => {
    const result = buildPolicyLimits({
      metrics,
      debtFunding,
      interestRateRisk,
      fundingPlan,
    });

    expect(result.overallStatus).toBe("COMPLIANT");
    expect(result.counts).toEqual({ PASS: 6, WATCH: 0, BREACH: 0 });
  });

  it("identifies measures inside the ten-percent watch band", () => {
    const result = buildPolicyLimits({
      metrics: { ...metrics, liquidityHeadroom: 16 },
      debtFunding: {
        ...debtFunding,
        facilityUtilizationPercent: 70,
      },
      interestRateRisk,
      fundingPlan,
    });

    expect(result.overallStatus).toBe("WATCH");
    expect(result.watchLimitIds).toEqual([
      "LIQUIDITY_BUFFER",
      "FACILITY_UTILIZATION",
    ]);
  });

  it("reports breaches and signed headroom", () => {
    const result = buildPolicyLimits({
      metrics: { ...metrics, liquidityHeadroom: 10 },
      debtFunding: {
        ...debtFunding,
        top3LenderConcentration: 82,
        facilityCoverage12MPercent: 40,
      },
      interestRateRisk: {
        ...interestRateRisk,
        floatingRateSharePercent: 65,
      },
      fundingPlan: {
        ...fundingPlan,
        externalFundingNeed: 25,
      },
    });

    expect(result.overallStatus).toBe("BREACH");
    expect(result.counts.BREACH).toBe(5);
    expect(result.checks.find(
      (check) => check.id === "EXTERNAL_FUNDING_NEED",
    )?.headroom).toBe(-25);
  });

  it("supports explicit policy threshold overrides", () => {
    const result = buildPolicyLimits({
      metrics,
      debtFunding,
      interestRateRisk,
      fundingPlan,
      thresholds: {
        maximumFloatingRateSharePercent: 25,
      },
    });

    expect(result.breachedLimitIds).toContain("FLOATING_RATE_SHARE");
  });

  it("rejects inconsistent inputs and invalid thresholds", () => {
    expect(() => buildPolicyLimits({
      metrics,
      debtFunding: { ...debtFunding, currency: "EUR" },
      interestRateRisk,
      fundingPlan,
    })).toThrow("same currency");

    expect(() => buildPolicyLimits({
      metrics,
      debtFunding,
      interestRateRisk,
      fundingPlan,
      thresholds: { maximumFacilityUtilizationPercent: -1 },
    })).toThrow("maximumFacilityUtilizationPercent");
  });
});
