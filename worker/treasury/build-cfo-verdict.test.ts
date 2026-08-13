import {
  describe,
  expect,
  it,
} from "vitest";

import type { CfoMetricsResult } from "./build-cfo-metrics";

import {
  buildCfoVerdict,
} from "./build-cfo-verdict";

function createMetrics(
  overrides: Partial<CfoMetricsResult>,
): CfoMetricsResult {
  return {
    currency: "TRY",

    asOfDate: "2026-08-20",

    availableLiquidity:
      1200000,

    minimumForecastCash:
      500000,

    minimumForecastCashDate:
      "2026-08-25",

    liquidityHeadroom:
      700000,

    fundingNeed30D: 0,
    fundingNeed90D: 0,

    receivablesAtRisk: 0,

    debtDue90D: 0,

    unusedCommittedFacilities:
      200000,

    ...overrides,
  };
}

describe(
  "CFO Verdict Engine",
  () => {
    it(
      "returns HEALTHY when liquidity is sufficient and above policy buffer",
      () => {
        const result =
          buildCfoVerdict({
            metrics:
              createMetrics({
                liquidityHeadroom:
                  700000,
              }),

            minimumLiquidityBuffer:
              500000,
          });

        expect(
          result.verdict,
        ).toBe("HEALTHY");

        expect(
          result.headline,
        ).toContain(
          "Liquidity is sufficient",
        );
      },
    );

    it(
      "returns WATCH when liquidity remains positive but headroom is below policy",
      () => {
        const result =
          buildCfoVerdict({
            metrics:
              createMetrics({
                liquidityHeadroom:
                  250000,
              }),

            minimumLiquidityBuffer:
              500000,
          });

        expect(
          result.verdict,
        ).toBe("WATCH");

        expect(
          result.reasons.some(
            (reason) =>
              reason.includes(
                "below the required buffer",
              ),
          ),
        ).toBe(true);
      },
    );

    it(
      "returns FUNDING_REQUIRED when a deficit appears inside 90 days",
      () => {
        const result =
          buildCfoVerdict({
            metrics:
              createMetrics({
                minimumForecastCash:
                  -300000,

                liquidityHeadroom:
                  -100000,

                fundingNeed30D:
                  0,

                fundingNeed90D:
                  100000,
              }),

            minimumLiquidityBuffer:
              0,
          });

        expect(
          result.verdict,
        ).toBe(
          "FUNDING_REQUIRED",
        );

        expect(
          result.reasons.some(
            (reason) =>
              reason.includes(
                "100,000 TRY",
              ),
          ),
        ).toBe(true);
      },
    );

    it(
      "returns CRITICAL when a funding deficit appears inside 30 days",
      () => {
        const result =
          buildCfoVerdict({
            metrics:
              createMetrics({
                minimumForecastCash:
                  -400000,

                liquidityHeadroom:
                  -200000,

                fundingNeed30D:
                  200000,

                fundingNeed90D:
                  200000,
              }),

            minimumLiquidityBuffer:
              0,
          });

        expect(
          result.verdict,
        ).toBe("CRITICAL");

        expect(
          result.reasons.some(
            (reason) =>
              reason.includes(
                "200,000 TRY",
              ),
          ),
        ).toBe(true);

        expect(
          result.actions.length,
        ).toBeGreaterThan(0);
      },
    );

    it(
      "prioritizes the 30D critical condition over the 90D condition",
      () => {
        const result =
          buildCfoVerdict({
            metrics:
              createMetrics({
                fundingNeed30D:
                  300000,

                fundingNeed90D:
                  900000,

                liquidityHeadroom:
                  -900000,
              }),

            minimumLiquidityBuffer:
              500000,
          });

        expect(
          result.verdict,
        ).toBe("CRITICAL");
      },
    );

    it(
      "rejects an invalid liquidity buffer",
      () => {
        expect(() =>
          buildCfoVerdict({
            metrics:
              createMetrics({}),

            minimumLiquidityBuffer:
              -1,
          }),
        ).toThrow(
          "minimumLiquidityBuffer must be a non-negative finite number.",
        );
      },
    );
  },
);