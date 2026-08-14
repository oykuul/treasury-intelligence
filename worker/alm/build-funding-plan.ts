import type { DebtFundingResult } from "./build-debt-funding";
import type { MaturityGapResult } from "./build-maturity-gap";

export type FundingPlanStatus =
  | "FUNDED"
  | "FACILITY_DRAW_REQUIRED"
  | "EXTERNAL_FUNDING_REQUIRED";

export type FundingPlanBucket = {
  bucketId: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  contractualLiquidity: number;
  targetLiquidity: number;
  incrementalFacilityDraw: number;
  cumulativeFacilityDraw: number;
  incrementalExternalFunding: number;
  cumulativeExternalFunding: number;
  liquidityAfterPlan: number;
  facilityHeadroomRemaining: number;
};

export type FundingPlanActionType =
  | "RAISE_EXTERNAL_FUNDING"
  | "RESERVE_COMMITTED_FACILITIES"
  | "REFINANCE_MATURITY_WALL"
  | "DIVERSIFY_LENDERS";

export type FundingPlanAction = {
  priority: number;
  actionType: FundingPlanActionType;
  severity: "WATCH" | "ACTION_REQUIRED" | "CRITICAL";
  amount: number | null;
  dueDate: string | null;
  bucketId: string | null;
  reason: string;
};

export type FundingPlanResult = {
  currency: string;
  asOfDate: string;
  horizonEndDate: string;
  status: FundingPlanStatus;
  policyBuffer: number;
  availableFacilities: number;
  totalFundingRequirement: number;
  plannedFacilityDraw: number;
  externalFundingNeed: number;
  firstActionDate: string | null;
  firstExternalFundingDate: string | null;
  peakFundingBucketId: string | null;
  minimumLiquidityAfterPlan: number;
  buckets: FundingPlanBucket[];
  actions: FundingPlanAction[];
};

export type BuildFundingPlanInput = {
  maturityGap: MaturityGapResult;
  debtFunding: DebtFundingResult;
  minimumLiquidityBuffer: number;
};

export function buildFundingPlan(
  input: BuildFundingPlanInput,
): FundingPlanResult {
  if (
    !Number.isFinite(input.minimumLiquidityBuffer) ||
    input.minimumLiquidityBuffer < 0
  ) {
    throw new Error(
      "minimumLiquidityBuffer must be a non-negative finite number.",
    );
  }

  if (input.maturityGap.currency !== input.debtFunding.currency) {
    throw new Error("ALM inputs must use the same currency.");
  }

  if (input.maturityGap.asOfDate !== input.debtFunding.asOfDate) {
    throw new Error("ALM inputs must use the same asOfDate.");
  }

  const availableFacilities = Math.max(
    0,
    input.maturityGap.availableFacilities,
    input.debtFunding.availableFacilities,
  );
  const sourceBuckets = input.maturityGap.buckets.filter(
    (bucket) => bucket.id !== "over12m",
  );
  const buckets: FundingPlanBucket[] = [];
  let cumulativeFacilityDraw = 0;
  let cumulativeExternalFunding = 0;
  let firstFacilityDate: string | null = null;
  let firstExternalFundingDate: string | null = null;
  let peakFundingBucketId: string | null = null;
  let peakFundingRequirement = 0;

  for (const source of sourceBuckets) {
    const supportBeforeBucket =
      cumulativeFacilityDraw + cumulativeExternalFunding;
    const gapAfterPriorSupport = Math.max(
      0,
      input.minimumLiquidityBuffer -
        (source.cumulativeGap + supportBeforeBucket),
    );
    const facilityHeadroom = Math.max(
      0,
      availableFacilities - cumulativeFacilityDraw,
    );
    const incrementalFacilityDraw = Math.min(
      gapAfterPriorSupport,
      facilityHeadroom,
    );
    const incrementalExternalFunding = Math.max(
      0,
      gapAfterPriorSupport - incrementalFacilityDraw,
    );

    cumulativeFacilityDraw += incrementalFacilityDraw;
    cumulativeExternalFunding += incrementalExternalFunding;

    const totalSupport =
      cumulativeFacilityDraw + cumulativeExternalFunding;
    if (totalSupport > peakFundingRequirement) {
      peakFundingRequirement = totalSupport;
      peakFundingBucketId = source.id;
    }

    const date = source.startDate ?? input.maturityGap.asOfDate;
    if (incrementalFacilityDraw > 0 && !firstFacilityDate) {
      firstFacilityDate = date;
    }
    if (incrementalExternalFunding > 0 && !firstExternalFundingDate) {
      firstExternalFundingDate = date;
    }

    buckets.push({
      bucketId: source.id,
      label: source.label,
      startDate: source.startDate,
      endDate: source.endDate,
      contractualLiquidity: source.cumulativeGap,
      targetLiquidity: input.minimumLiquidityBuffer,
      incrementalFacilityDraw,
      cumulativeFacilityDraw,
      incrementalExternalFunding,
      cumulativeExternalFunding,
      liquidityAfterPlan: source.cumulativeGap + totalSupport,
      facilityHeadroomRemaining: Math.max(
        0,
        availableFacilities - cumulativeFacilityDraw,
      ),
    });
  }

  const actionsWithoutPriority: Omit<FundingPlanAction, "priority">[] = [];

  if (cumulativeExternalFunding > 0) {
    actionsWithoutPriority.push({
      actionType: "RAISE_EXTERNAL_FUNDING",
      severity: "CRITICAL",
      amount: cumulativeExternalFunding,
      dueDate: firstExternalFundingDate,
      bucketId: peakFundingBucketId,
      reason:
        "Committed facilities are insufficient to preserve the policy liquidity buffer.",
    });
  }

  if (cumulativeFacilityDraw > 0) {
    actionsWithoutPriority.push({
      actionType: "RESERVE_COMMITTED_FACILITIES",
      severity: cumulativeExternalFunding > 0 ? "ACTION_REQUIRED" : "WATCH",
      amount: cumulativeFacilityDraw,
      dueDate: firstFacilityDate,
      bucketId: peakFundingBucketId,
      reason:
        "Committed capacity must be reserved to protect the minimum liquidity buffer.",
    });
  }

  const maturityWall = input.debtFunding.maturityBuckets.find(
    (bucket) => bucket.id === input.debtFunding.largestMaturityWallBucketId,
  );
  if (
    maturityWall &&
    maturityWall.maturingDebt > 0 &&
    maturityWall.startDate &&
    maturityWall.startDate <= input.maturityGap.horizonEndDate
  ) {
    actionsWithoutPriority.push({
      actionType: "REFINANCE_MATURITY_WALL",
      severity: "ACTION_REQUIRED",
      amount: maturityWall.maturingDebt,
      dueDate: maturityWall.startDate,
      bucketId: maturityWall.id,
      reason:
        "A material debt maturity wall falls inside the 12-month planning horizon.",
    });
  }

  if (input.debtFunding.top3LenderConcentration >= 75) {
    actionsWithoutPriority.push({
      actionType: "DIVERSIFY_LENDERS",
      severity: "WATCH",
      amount: null,
      dueDate: null,
      bucketId: null,
      reason:
        "The top three lenders represent at least 75% of modeled funding capacity.",
    });
  }

  const actions = actionsWithoutPriority.map(
    (action, index): FundingPlanAction => ({
      ...action,
      priority: index + 1,
    }),
  );
  const minimumLiquidityAfterPlan = buckets.length === 0
    ? input.maturityGap.openingLiquidity
    : Math.min(...buckets.map((bucket) => bucket.liquidityAfterPlan));
  const status: FundingPlanStatus =
    cumulativeExternalFunding > 0
      ? "EXTERNAL_FUNDING_REQUIRED"
      : cumulativeFacilityDraw > 0
        ? "FACILITY_DRAW_REQUIRED"
        : "FUNDED";

  return {
    currency: input.maturityGap.currency,
    asOfDate: input.maturityGap.asOfDate,
    horizonEndDate: input.maturityGap.horizonEndDate,
    status,
    policyBuffer: input.minimumLiquidityBuffer,
    availableFacilities,
    totalFundingRequirement: peakFundingRequirement,
    plannedFacilityDraw: cumulativeFacilityDraw,
    externalFundingNeed: cumulativeExternalFunding,
    firstActionDate: firstExternalFundingDate ?? firstFacilityDate,
    firstExternalFundingDate,
    peakFundingBucketId,
    minimumLiquidityAfterPlan,
    buckets,
    actions,
  };
}
