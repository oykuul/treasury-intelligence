import { describe, expect, it } from "vitest";

import type { DebtFundingResult } from "./build-debt-funding";
import type { MaturityGapResult } from "./build-maturity-gap";
import { buildFundingPlan } from "./build-funding-plan";

function maturityGap(
  cumulativeGaps: number[],
): MaturityGapResult {
  return {
    currency: "TRY",
    asOfDate: "2026-08-14",
    horizonEndDate: "2027-08-14",
    openingLiquidity: 25,
    availableFacilities: 0,
    totalAssets12M: 0,
    totalLiabilities12M: 0,
    netGap12M: 0,
    closingCumulativeGap12M: cumulativeGaps.at(-1) ?? 25,
    minimumCumulativeGap12M: Math.min(...cumulativeGaps),
    minimumBucketId: "M02",
    fundingNeedBeforeFacilities: 0,
    residualFundingNeed: 0,
    buckets: cumulativeGaps.map((cumulativeGap, index) => ({
      id: `M${String(index + 1).padStart(2, "0")}`,
      label: `${index * 30}–${(index + 1) * 30} gün`,
      startDate: `2026-${String(8 + index).padStart(2, "0")}-14`,
      endDate: null,
      assets: 0,
      liabilities: 0,
      netGap: 0,
      cumulativeGap,
      flows: [],
    })),
    ignoredItems: [],
  };
}

function debtFunding(
  availableFacilities: number,
  overrides: Partial<DebtFundingResult> = {},
): DebtFundingResult {
  return {
    currency: "TRY",
    asOfDate: "2026-08-14",
    horizonEndDate: "2029-08-14",
    debtOutstanding: 0,
    debtDue12M: 0,
    debtDue24M: 0,
    debtDue36M: 0,
    committedFacilities: availableFacilities,
    drawnFacilities: 0,
    availableFacilities,
    facilityUtilizationPercent: 0,
    facilityCoverage12MPercent: 100,
    refinancingNeed12M: 0,
    largestMaturityWall: 0,
    largestMaturityWallBucketId: null,
    top3LenderConcentration: 0,
    maturityBuckets: [],
    lenders: [],
    instruments: [],
    ignoredItems: [],
    ...overrides,
  };
}

describe("buildFundingPlan", () => {
  it("returns funded when contractual liquidity stays above policy", () => {
    const result = buildFundingPlan({
      maturityGap: maturityGap([30, 24, 18]),
      debtFunding: debtFunding(20),
      minimumLiquidityBuffer: 15,
    });

    expect(result.status).toBe("FUNDED");
    expect(result.totalFundingRequirement).toBe(0);
    expect(result.actions).toEqual([]);
  });

  it("uses committed facilities before external funding", () => {
    const result = buildFundingPlan({
      maturityGap: maturityGap([20, 8, 5]),
      debtFunding: debtFunding(12),
      minimumLiquidityBuffer: 15,
    });

    expect(result.status).toBe("FACILITY_DRAW_REQUIRED");
    expect(result.plannedFacilityDraw).toBe(10);
    expect(result.externalFundingNeed).toBe(0);
    expect(result.buckets[1].incrementalFacilityDraw).toBe(7);
    expect(result.buckets[2].incrementalFacilityDraw).toBe(3);
  });

  it("calculates the residual external requirement after facilities", () => {
    const result = buildFundingPlan({
      maturityGap: maturityGap([10, -5, -12]),
      debtFunding: debtFunding(8),
      minimumLiquidityBuffer: 15,
    });

    expect(result.status).toBe("EXTERNAL_FUNDING_REQUIRED");
    expect(result.totalFundingRequirement).toBe(27);
    expect(result.plannedFacilityDraw).toBe(8);
    expect(result.externalFundingNeed).toBe(19);
    expect(result.minimumLiquidityAfterPlan).toBe(15);
    expect(result.actions[0]).toMatchObject({
      actionType: "RAISE_EXTERNAL_FUNDING",
      amount: 19,
    });
  });

  it("adds refinancing and lender-diversification actions", () => {
    const result = buildFundingPlan({
      maturityGap: maturityGap([30, 25]),
      debtFunding: debtFunding(20, {
        largestMaturityWall: 40,
        largestMaturityWallBucketId: "Q2",
        top3LenderConcentration: 82,
        maturityBuckets: [{
          id: "Q2",
          label: "3–6 ay",
          startDate: "2026-11-14",
          endDate: "2027-02-13",
          maturingDebt: 40,
          sharePercent: 50,
          instruments: [],
        }],
      }),
      minimumLiquidityBuffer: 15,
    });

    expect(result.actions.map((action) => action.actionType)).toEqual([
      "REFINANCE_MATURITY_WALL",
      "DIVERSIFY_LENDERS",
    ]);
  });

  it("rejects inconsistent currencies and invalid buffers", () => {
    expect(() => buildFundingPlan({
      maturityGap: maturityGap([10]),
      debtFunding: {
        ...debtFunding(10),
        currency: "EUR",
      },
      minimumLiquidityBuffer: 15,
    })).toThrow("same currency");

    expect(() => buildFundingPlan({
      maturityGap: maturityGap([10]),
      debtFunding: debtFunding(10),
      minimumLiquidityBuffer: -1,
    })).toThrow("minimumLiquidityBuffer");
  });
});
