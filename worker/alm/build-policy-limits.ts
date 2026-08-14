import type { DebtFundingResult } from "./build-debt-funding";
import type { FundingPlanResult } from "./build-funding-plan";
import type { InterestRateRiskResult } from "./build-interest-rate-risk";
import type { CfoMetricsResult } from "../treasury/build-cfo-metrics";

export type PolicyLimitId =
  | "LIQUIDITY_BUFFER"
  | "FACILITY_UTILIZATION"
  | "LENDER_CONCENTRATION"
  | "FLOATING_RATE_SHARE"
  | "REFINANCING_COVERAGE"
  | "EXTERNAL_FUNDING_NEED";

export type PolicyLimitStatus = "PASS" | "WATCH" | "BREACH";

export type PolicyLimitThresholds = {
  minimumLiquidityBuffer: number;
  maximumFacilityUtilizationPercent: number;
  maximumTop3LenderConcentrationPercent: number;
  maximumFloatingRateSharePercent: number;
  minimumFacilityCoverage12MPercent: number;
  maximumExternalFundingNeed: number;
};

export type PolicyLimitCheck = {
  id: PolicyLimitId;
  category: "LIQUIDITY" | "FUNDING" | "CONCENTRATION" | "RATE";
  label: string;
  status: PolicyLimitStatus;
  operator: "MINIMUM" | "MAXIMUM";
  unit: "AMOUNT" | "PERCENT";
  actualValue: number;
  limitValue: number;
  headroom: number;
  reason: string;
  action: string;
};

export type PolicyLimitsResult = {
  currency: string;
  asOfDate: string;
  overallStatus: "COMPLIANT" | "WATCH" | "BREACH";
  counts: Record<PolicyLimitStatus, number>;
  thresholds: PolicyLimitThresholds;
  checks: PolicyLimitCheck[];
  breachedLimitIds: PolicyLimitId[];
  watchLimitIds: PolicyLimitId[];
};

export type BuildPolicyLimitsInput = {
  metrics: CfoMetricsResult;
  debtFunding: DebtFundingResult;
  interestRateRisk: InterestRateRiskResult;
  fundingPlan: FundingPlanResult;
  thresholds?: Partial<PolicyLimitThresholds>;
};

const DEFAULT_PERCENT_LIMITS: Omit<
  PolicyLimitThresholds,
  "minimumLiquidityBuffer" | "maximumExternalFundingNeed"
> = {
  maximumFacilityUtilizationPercent: 75,
  maximumTop3LenderConcentrationPercent: 75,
  maximumFloatingRateSharePercent: 50,
  minimumFacilityCoverage12MPercent: 100,
};

function finiteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number.`);
  }
  return value;
}

function checkStatus(
  operator: PolicyLimitCheck["operator"],
  actualValue: number,
  limitValue: number,
): PolicyLimitStatus {
  if (operator === "MAXIMUM") {
    if (actualValue > limitValue) return "BREACH";
    if (limitValue > 0 && actualValue >= limitValue * 0.9) return "WATCH";
    return "PASS";
  }

  if (actualValue < limitValue) return "BREACH";
  if (limitValue > 0 && actualValue <= limitValue * 1.1) return "WATCH";
  return "PASS";
}

function makeCheck(
  input: Omit<PolicyLimitCheck, "status" | "headroom">,
): PolicyLimitCheck {
  return {
    ...input,
    status: checkStatus(input.operator, input.actualValue, input.limitValue),
    headroom: input.operator === "MAXIMUM"
      ? input.limitValue - input.actualValue
      : input.actualValue - input.limitValue,
  };
}

export function buildPolicyLimits(
  input: BuildPolicyLimitsInput,
): PolicyLimitsResult {
  const currencies = new Set([
    input.metrics.currency,
    input.debtFunding.currency,
    input.interestRateRisk.currency,
    input.fundingPlan.currency,
  ]);
  if (currencies.size !== 1) {
    throw new Error("ALM inputs must use the same currency.");
  }

  const dates = new Set([
    input.metrics.asOfDate,
    input.debtFunding.asOfDate,
    input.interestRateRisk.asOfDate,
    input.fundingPlan.asOfDate,
  ]);
  if (dates.size !== 1) {
    throw new Error("ALM inputs must use the same asOfDate.");
  }

  const thresholds: PolicyLimitThresholds = {
    minimumLiquidityBuffer: finiteNonNegative(
      input.thresholds?.minimumLiquidityBuffer ?? input.fundingPlan.policyBuffer,
      "minimumLiquidityBuffer",
    ),
    maximumFacilityUtilizationPercent: finiteNonNegative(
      input.thresholds?.maximumFacilityUtilizationPercent ??
        DEFAULT_PERCENT_LIMITS.maximumFacilityUtilizationPercent,
      "maximumFacilityUtilizationPercent",
    ),
    maximumTop3LenderConcentrationPercent: finiteNonNegative(
      input.thresholds?.maximumTop3LenderConcentrationPercent ??
        DEFAULT_PERCENT_LIMITS.maximumTop3LenderConcentrationPercent,
      "maximumTop3LenderConcentrationPercent",
    ),
    maximumFloatingRateSharePercent: finiteNonNegative(
      input.thresholds?.maximumFloatingRateSharePercent ??
        DEFAULT_PERCENT_LIMITS.maximumFloatingRateSharePercent,
      "maximumFloatingRateSharePercent",
    ),
    minimumFacilityCoverage12MPercent: finiteNonNegative(
      input.thresholds?.minimumFacilityCoverage12MPercent ??
        DEFAULT_PERCENT_LIMITS.minimumFacilityCoverage12MPercent,
      "minimumFacilityCoverage12MPercent",
    ),
    maximumExternalFundingNeed: finiteNonNegative(
      input.thresholds?.maximumExternalFundingNeed ?? 0,
      "maximumExternalFundingNeed",
    ),
  };

  const checks: PolicyLimitCheck[] = [
    makeCheck({
      id: "LIQUIDITY_BUFFER",
      category: "LIQUIDITY",
      label: "90-day liquidity buffer",
      operator: "MINIMUM",
      unit: "AMOUNT",
      actualValue: input.metrics.liquidityHeadroom,
      limitValue: thresholds.minimumLiquidityBuffer,
      reason: "Minimum 90-day cash plus committed capacity is tested against policy.",
      action: "Protect cash and reserve committed liquidity before the breach date.",
    }),
    makeCheck({
      id: "FACILITY_UTILIZATION",
      category: "FUNDING",
      label: "Facility utilization",
      operator: "MAXIMUM",
      unit: "PERCENT",
      actualValue: input.debtFunding.facilityUtilizationPercent,
      limitValue: thresholds.maximumFacilityUtilizationPercent,
      reason: "Drawn committed facilities are compared with total committed capacity.",
      action: "Add committed headroom or reduce drawings before utilization exceeds policy.",
    }),
    makeCheck({
      id: "LENDER_CONCENTRATION",
      category: "CONCENTRATION",
      label: "Top-three lender concentration",
      operator: "MAXIMUM",
      unit: "PERCENT",
      actualValue: input.debtFunding.top3LenderConcentration,
      limitValue: thresholds.maximumTop3LenderConcentrationPercent,
      reason: "The top three lenders' share of modeled funding capacity is monitored.",
      action: "Open or expand alternative lender capacity.",
    }),
    makeCheck({
      id: "FLOATING_RATE_SHARE",
      category: "RATE",
      label: "Floating-rate debt share",
      operator: "MAXIMUM",
      unit: "PERCENT",
      actualValue: input.interestRateRisk.floatingRateSharePercent,
      limitValue: thresholds.maximumFloatingRateSharePercent,
      reason: "Floating-rate debt is compared with the total interest-bearing portfolio.",
      action: "Shift new funding toward fixed-rate debt or reduce floating exposure.",
    }),
    makeCheck({
      id: "REFINANCING_COVERAGE",
      category: "FUNDING",
      label: "12-month facility coverage",
      operator: "MINIMUM",
      unit: "PERCENT",
      actualValue: input.debtFunding.facilityCoverage12MPercent,
      limitValue: thresholds.minimumFacilityCoverage12MPercent,
      reason: "Available committed facilities are compared with debt due in 12 months.",
      action: "Secure refinancing capacity before the uncovered maturity wall enters the near term.",
    }),
    makeCheck({
      id: "EXTERNAL_FUNDING_NEED",
      category: "FUNDING",
      label: "Uncommitted external funding need",
      operator: "MAXIMUM",
      unit: "AMOUNT",
      actualValue: input.fundingPlan.externalFundingNeed,
      limitValue: thresholds.maximumExternalFundingNeed,
      reason: "Residual funding after committed facilities is tested against zero-tolerance policy.",
      action: "Obtain approved term funding before the first external-funding date.",
    }),
  ];

  const counts: Record<PolicyLimitStatus, number> = {
    PASS: 0,
    WATCH: 0,
    BREACH: 0,
  };
  for (const check of checks) counts[check.status] += 1;

  return {
    currency: input.metrics.currency,
    asOfDate: input.metrics.asOfDate,
    overallStatus: counts.BREACH > 0
      ? "BREACH"
      : counts.WATCH > 0
        ? "WATCH"
        : "COMPLIANT",
    counts,
    thresholds,
    checks,
    breachedLimitIds: checks
      .filter((check) => check.status === "BREACH")
      .map((check) => check.id),
    watchLimitIds: checks
      .filter((check) => check.status === "WATCH")
      .map((check) => check.id),
  };
}
