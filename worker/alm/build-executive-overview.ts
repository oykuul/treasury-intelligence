import type {
  DebtFundingResult,
} from "./build-debt-funding";
import type {
  InterestRateRiskResult,
} from "./build-interest-rate-risk";
import type {
  MaturityGapResult,
} from "./build-maturity-gap";
import type {
  CfoMetricsResult,
} from "../treasury/build-cfo-metrics";
import type {
  CfoVerdictResult,
} from "../treasury/build-cfo-verdict";
import type {
  StressScenarioComparison,
} from "../treasury/run-stress-scenarios";

export type ExecutiveStatus =
  | "HEALTHY"
  | "WATCH"
  | "ACTION_REQUIRED"
  | "CRITICAL";

export type ExecutivePillarId =
  | "LIQUIDITY"
  | "STRESS"
  | "MATURITY"
  | "FUNDING"
  | "RATE"
  | "DATA";

export type ExecutivePillar = {
  id: ExecutivePillarId;
  label: string;
  status: ExecutiveStatus;
  headline: string;
  reason: string;
  action: string;
  impactAmount: number | null;
};

export type ExecutivePriorityAction = {
  priority: number;
  pillarId: ExecutivePillarId;
  status: ExecutiveStatus;
  action: string;
  impactAmount: number | null;
};

export type AlmExecutiveOverviewResult = {
  currency: string;
  asOfDate: string;
  status: ExecutiveStatus;
  headline: string;
  summary: string;
  dominantRiskPillar: ExecutivePillarId | null;
  pillars: ExecutivePillar[];
  priorityActions: ExecutivePriorityAction[];
  statusCounts: Record<ExecutiveStatus, number>;
  dataQualityFindings: number;
};

export type BuildAlmExecutiveOverviewInput = {
  currency: string;
  asOfDate: string;
  metrics: CfoMetricsResult;
  liquidityVerdict: CfoVerdictResult;
  stress: StressScenarioComparison;
  maturityGap: MaturityGapResult;
  debtFunding: DebtFundingResult;
  interestRateRisk: InterestRateRiskResult;
};

const STATUS_RANK: Record<ExecutiveStatus, number> = {
  HEALTHY: 0,
  WATCH: 1,
  ACTION_REQUIRED: 2,
  CRITICAL: 3,
};

function formatAmount(
  amount: number,
  currency: string,
): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount)} ${currency}`;
}

function liquidityStatus(
  verdict: CfoVerdictResult["verdict"],
): ExecutiveStatus {
  if (verdict === "CRITICAL") return "CRITICAL";
  if (verdict === "FUNDING_REQUIRED") return "ACTION_REQUIRED";
  if (verdict === "WATCH") return "WATCH";
  return "HEALTHY";
}

function highestStatus(
  pillars: ExecutivePillar[],
): ExecutiveStatus {
  return pillars.reduce<ExecutiveStatus>(
    (highest, pillar) =>
      STATUS_RANK[pillar.status] > STATUS_RANK[highest]
        ? pillar.status
        : highest,
    "HEALTHY",
  );
}

export function buildAlmExecutiveOverview(
  input: BuildAlmExecutiveOverviewInput,
): AlmExecutiveOverviewResult {
  const currency = input.currency.trim().toUpperCase();
  if (!currency) {
    throw new Error("currency is required.");
  }

  const base = input.stress.scenarios.find(
    (scenario) => scenario.name === "BASE",
  );
  const moderate = input.stress.scenarios.find(
    (scenario) => scenario.name === "MODERATE",
  );
  const severe = input.stress.scenarios.find(
    (scenario) => scenario.name === "SEVERE",
  );
  const availableFacilities = input.metrics.unusedCommittedFacilities;
  const liquidityPillarStatus = liquidityStatus(
    input.liquidityVerdict.verdict,
  );

  const liquidityPillar: ExecutivePillar = {
    id: "LIQUIDITY",
    label: "Liquidity",
    status: liquidityPillarStatus,
    headline:
      liquidityPillarStatus === "HEALTHY"
        ? "Short-term liquidity is within policy."
        : liquidityPillarStatus === "WATCH"
          ? "Liquidity remains available but the policy cushion is thin."
          : liquidityPillarStatus === "ACTION_REQUIRED"
            ? "A 90-day funding requirement is projected."
            : "A near-term liquidity deficit requires immediate action.",
    reason: `Minimum forecast cash is ${formatAmount(
      input.metrics.minimumForecastCash,
      currency,
    )} on ${input.metrics.minimumForecastCashDate}.`,
    action:
      liquidityPillarStatus === "HEALTHY"
        ? "Continue monitoring forecast movements and material payments."
        : "Protect available liquidity and close the forecast shortfall before the breach date.",
    impactAmount:
      input.metrics.fundingNeed90D > 0
        ? input.metrics.fundingNeed90D
        : Math.max(0, -input.metrics.liquidityHeadroom),
  };

  let stressStatus: ExecutiveStatus = "HEALTHY";
  if ((base?.fundingNeed ?? 0) > availableFacilities) {
    stressStatus = "CRITICAL";
  } else if ((moderate?.fundingNeed ?? 0) > availableFacilities) {
    stressStatus = "ACTION_REQUIRED";
  } else if (
    (severe?.fundingNeed ?? 0) > availableFacilities ||
    (severe?.thresholdBreachDays ?? 0) > 0
  ) {
    stressStatus = "WATCH";
  }
  const severeUncovered = Math.max(
    0,
    (severe?.fundingNeed ?? 0) - availableFacilities,
  );
  const stressPillar: ExecutivePillar = {
    id: "STRESS",
    label: "Stress",
    status: stressStatus,
    headline:
      stressStatus === "HEALTHY"
        ? "Committed liquidity withstands the severe scenario."
        : stressStatus === "WATCH"
          ? "Stress scenarios breach the policy threshold."
          : stressStatus === "ACTION_REQUIRED"
            ? "Moderate stress exceeds committed liquidity capacity."
            : "Base stress exceeds committed liquidity capacity.",
    reason: `Severe minimum cash is ${formatAmount(
      severe?.minimumLiquidity ?? 0,
      currency,
    )} with ${severe?.thresholdBreachDays ?? 0} policy-breach days.`,
    action:
      stressStatus === "HEALTHY"
        ? "Retain scenario monitoring as assumptions change."
        : "Pre-agree contingency funding and collection acceleration triggers.",
    impactAmount: severeUncovered,
  };

  const maturityStatus: ExecutiveStatus =
    input.maturityGap.residualFundingNeed > 0
      ? "ACTION_REQUIRED"
      : input.maturityGap.fundingNeedBeforeFacilities > 0
        ? "WATCH"
        : "HEALTHY";
  const maturityPillar: ExecutivePillar = {
    id: "MATURITY",
    label: "Maturity",
    status: maturityStatus,
    headline:
      maturityStatus === "HEALTHY"
        ? "The 12-month contractual ladder remains funded."
        : maturityStatus === "WATCH"
          ? "Committed facilities cover the contractual maturity gap."
          : "A residual contractual maturity gap remains after facilities.",
    reason: `Minimum cumulative gap is ${formatAmount(
      input.maturityGap.minimumCumulativeGap12M,
      currency,
    )}; residual need is ${formatAmount(
      input.maturityGap.residualFundingNeed,
      currency,
    )}.`,
    action:
      maturityStatus === "ACTION_REQUIRED"
        ? "Close the residual maturity gap with term funding or cash-flow actions."
        : "Monitor the maturity ladder and preserve facility availability.",
    impactAmount: input.maturityGap.residualFundingNeed,
  };

  const refinancingShare = input.debtFunding.debtDue12M === 0
    ? 0
    : input.debtFunding.refinancingNeed12M /
      input.debtFunding.debtDue12M * 100;
  const fundingStatus: ExecutiveStatus =
    input.debtFunding.refinancingNeed12M > 0
      ? "ACTION_REQUIRED"
      : input.debtFunding.top3LenderConcentration >= 75 ||
          input.debtFunding.facilityUtilizationPercent >= 75
        ? "WATCH"
        : "HEALTHY";
  const fundingPillar: ExecutivePillar = {
    id: "FUNDING",
    label: "Funding",
    status: fundingStatus,
    headline:
      fundingStatus === "HEALTHY"
        ? "Debt maturities are covered by available capacity."
        : fundingStatus === "WATCH"
          ? "Funding capacity is concentrated or highly utilized."
          : "The 12-month refinancing wall is not fully covered.",
    reason: `${formatAmount(
      input.debtFunding.debtDue12M,
      currency,
    )} matures in 12 months; ${refinancingShare.toFixed(1)}% remains uncovered.`,
    action:
      fundingStatus === "ACTION_REQUIRED"
        ? "Launch the 12-month refinancing plan and diversify lender capacity."
        : "Maintain lender diversification and committed headroom.",
    impactAmount: input.debtFunding.refinancingNeed12M,
  };

  const repricingShare =
    input.interestRateRisk.totalInterestBearingDebt === 0
      ? 0
      : input.interestRateRisk.repricingExposure12M /
        input.interestRateRisk.totalInterestBearingDebt * 100;
  const rateStatus: ExecutiveStatus =
    input.interestRateRisk.rateCoveragePercent < 75 ||
    repricingShare >= 75
      ? "ACTION_REQUIRED"
      : input.interestRateRisk.rateCoveragePercent < 95 ||
          input.interestRateRisk.unclassifiedRateDebt > 0 ||
          repricingShare >= 50
        ? "WATCH"
        : "HEALTHY";
  const plusTwoHundred = input.interestRateRisk.sensitivityScenarios.find(
    (scenario) => scenario.shockBps === 200,
  );
  const ratePillar: ExecutivePillar = {
    id: "RATE",
    label: "Interest rate",
    status: rateStatus,
    headline:
      rateStatus === "HEALTHY"
        ? "Interest-rate exposure is within the monitoring range."
        : rateStatus === "WATCH"
          ? "A material share of debt reprices within 12 months."
          : "Repricing exposure or rate-data gaps require action.",
    reason: `${repricingShare.toFixed(1)}% of debt reprices within 12 months; +200 bp adds ${formatAmount(
      plusTwoHundred?.annualizedInterestIncrease ?? 0,
      currency,
    )} annualized cost.`,
    action:
      rateStatus === "HEALTHY"
        ? "Continue monitoring the fixed-floating mix and refinancing dates."
        : "Set a target fixed-floating mix and reduce near-term repricing exposure.",
    impactAmount: plusTwoHundred?.annualizedInterestIncrease ?? 0,
  };

  const dataQualityFindings =
    input.maturityGap.ignoredItems.length +
    input.debtFunding.ignoredItems.length +
    input.interestRateRisk.dataIssues.length;
  const dataStatus: ExecutiveStatus =
    dataQualityFindings >= 5
      ? "ACTION_REQUIRED"
      : dataQualityFindings > 0
        ? "WATCH"
        : "HEALTHY";
  const dataPillar: ExecutivePillar = {
    id: "DATA",
    label: "Data",
    status: dataStatus,
    headline:
      dataStatus === "HEALTHY"
        ? "Core ALM data is complete for the selected currency."
        : dataStatus === "WATCH"
          ? "Some records limit the completeness of ALM analysis."
          : "Material data gaps reduce confidence in the ALM view.",
    reason: `${dataQualityFindings} maturity, funding, or rate-data findings are disclosed.`,
    action:
      dataStatus === "HEALTHY"
        ? "Maintain reconciliation and mapping controls."
        : "Complete missing amount, maturity, interest-type, and rate fields.",
    impactAmount: null,
  };

  const pillars = [
    liquidityPillar,
    stressPillar,
    maturityPillar,
    fundingPillar,
    ratePillar,
    dataPillar,
  ];
  const status = highestStatus(pillars);
  const rankedPillars = [...pillars].sort(
    (left, right) =>
      STATUS_RANK[right.status] - STATUS_RANK[left.status] ||
      (right.impactAmount ?? 0) - (left.impactAmount ?? 0),
  );
  const dominantRiskPillar =
    status === "HEALTHY"
      ? null
      : rankedPillars[0].id;
  const priorityActions = rankedPillars
    .filter((pillar) => pillar.status !== "HEALTHY")
    .slice(0, 3)
    .map((pillar, index): ExecutivePriorityAction => ({
      priority: index + 1,
      pillarId: pillar.id,
      status: pillar.status,
      action: pillar.action,
      impactAmount: pillar.impactAmount,
    }));
  const statusCounts: Record<ExecutiveStatus, number> = {
    HEALTHY: 0,
    WATCH: 0,
    ACTION_REQUIRED: 0,
    CRITICAL: 0,
  };
  for (const pillar of pillars) {
    statusCounts[pillar.status] += 1;
  }

  const headline =
    status === "CRITICAL"
      ? "Immediate ALM action is required."
      : status === "ACTION_REQUIRED"
        ? "The 12-month ALM profile requires management action."
        : status === "WATCH"
          ? "The ALM position is funded but key risk limits need monitoring."
          : "The ALM position is within the modeled policy range.";
  const summary =
    status === "HEALTHY"
      ? "Liquidity, maturity, funding, rate, stress, and data pillars are within the modeled thresholds."
      : `${statusCounts.CRITICAL + statusCounts.ACTION_REQUIRED} action pillar(s) and ${statusCounts.WATCH} watch pillar(s) are identified.`;

  return {
    currency,
    asOfDate: input.asOfDate,
    status,
    headline,
    summary,
    dominantRiskPillar,
    pillars,
    priorityActions,
    statusCounts,
    dataQualityFindings,
  };
}
