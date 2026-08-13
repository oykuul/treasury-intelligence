import type { CfoMetricsResult } from "./build-cfo-metrics";

export type CfoVerdict =
  | "HEALTHY"
  | "WATCH"
  | "FUNDING_REQUIRED"
  | "CRITICAL";

export type CfoVerdictInput = {
  metrics: CfoMetricsResult;

  minimumLiquidityBuffer: number;
};

export type CfoVerdictResult = {
  verdict: CfoVerdict;

  headline: string;

  reasons: string[];

  actions: string[];
};

function formatAmount(
  amount: number,
  currency: string,
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      maximumFractionDigits: 0,
    },
  ).format(amount) +
    ` ${currency}`;
}

export function buildCfoVerdict(
  input: CfoVerdictInput,
): CfoVerdictResult {
  const {
    metrics,
    minimumLiquidityBuffer,
  } = input;

  if (
    !Number.isFinite(
      minimumLiquidityBuffer,
    ) ||
    minimumLiquidityBuffer < 0
  ) {
    throw new Error(
      "minimumLiquidityBuffer must be a non-negative finite number.",
    );
  }

  const reasons: string[] = [];
  const actions: string[] = [];

  if (
    metrics.fundingNeed30D > 0
  ) {
    reasons.push(
      `A ${formatAmount(
        metrics.fundingNeed30D,
        metrics.currency,
      )} funding shortfall is projected within 30 days.`,
    );

    reasons.push(
      `Minimum forecast cash reaches ${formatAmount(
        metrics.minimumForecastCash,
        metrics.currency,
      )} on ${metrics.minimumForecastCashDate}.`,
    );

    actions.push(
      "Secure short-term funding or accelerate cash inflows.",
    );

    actions.push(
      "Review the payment calendar around the minimum cash date.",
    );

    return {
      verdict: "CRITICAL",

      headline:
        "Near-term liquidity deficit requires immediate action.",

      reasons,

      actions,
    };
  }

  if (
    metrics.fundingNeed90D > 0
  ) {
    reasons.push(
      `Liquidity remains sufficient in the near term, but a ${formatAmount(
        metrics.fundingNeed90D,
        metrics.currency,
      )} funding shortfall is projected within 90 days.`,
    );

    reasons.push(
      `Minimum forecast cash reaches ${formatAmount(
        metrics.minimumForecastCash,
        metrics.currency,
      )} on ${metrics.minimumForecastCashDate}.`,
    );

    actions.push(
      "Prepare medium-term funding before the projected deficit date.",
    );

    actions.push(
      "Review large payments, debt maturities and expected collections in the 90-day horizon.",
    );

    return {
      verdict:
        "FUNDING_REQUIRED",

      headline:
        "Medium-term funding requirement detected.",

      reasons,

      actions,
    };
  }

  if (
    metrics.liquidityHeadroom <
    minimumLiquidityBuffer
  ) {
    reasons.push(
      `Projected liquidity headroom is ${formatAmount(
        metrics.liquidityHeadroom,
        metrics.currency,
      )}, below the required buffer of ${formatAmount(
        minimumLiquidityBuffer,
        metrics.currency,
      )}.`,
    );

    reasons.push(
      "No funding deficit is currently projected, but the liquidity cushion is below policy.",
    );

    actions.push(
      "Preserve available liquidity and review discretionary outflows.",
    );

    actions.push(
      "Monitor forecast changes and committed facility availability.",
    );

    return {
      verdict: "WATCH",

      headline:
        "Liquidity remains positive but the safety buffer is thin.",

      reasons,

      actions,
    };
  }

  reasons.push(
    `Projected liquidity headroom is ${formatAmount(
      metrics.liquidityHeadroom,
      metrics.currency,
    )}, above the required buffer of ${formatAmount(
      minimumLiquidityBuffer,
      metrics.currency,
    )}.`,
  );

  reasons.push(
    "No funding deficit is projected within either the 30-day or 90-day horizon.",
  );

  actions.push(
    "Continue monitoring forecast movements and material payment changes.",
  );

  return {
    verdict: "HEALTHY",

    headline:
      "Liquidity is sufficient across the forecast horizon.",

    reasons,

    actions,
  };
}