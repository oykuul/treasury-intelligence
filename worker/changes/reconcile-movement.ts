import type {
  CompareRecordsResult,
  TreasuryChange,
} from "./compare-records";

export type MovementReconciliationStatus =
  | "RECONCILED"
  | "UNEXPLAINED";

export type MovementDriver = {
  stableId: string;

  changeType:
    TreasuryChange["changeType"];

  counterpartyName:
    string | null;

  documentNo:
    string | null;

  currency:
    string | null;

  liquidityImpact:
    number;
};

export type MovementReconciliationInput = {
  currency: string;

  previousClosingLiquidity:
    number;

  currentClosingLiquidity:
    number;

  comparison:
    CompareRecordsResult;

  tolerance?: number;
};

export type MovementReconciliationResult = {
  currency: string;

  previousClosingLiquidity:
    number;

  currentClosingLiquidity:
    number;

  forecastMovement:
    number;

  identifiedDriverImpact:
    number;

  unexplainedMovement:
    number;

  tolerance:
    number;

  status:
    MovementReconciliationStatus;

  drivers:
    MovementDriver[];
};

function roundMoney(
  value: number,
): number {
  return (
    Math.round(
      (value + Number.EPSILON) *
        100,
    ) / 100
  );
}

export function reconcileMovement(
  input: MovementReconciliationInput,
): MovementReconciliationResult {
  if (
    !Number.isFinite(
      input.previousClosingLiquidity,
    ) ||
    !Number.isFinite(
      input.currentClosingLiquidity,
    )
  ) {
    throw new Error(
      "Closing liquidity values must be finite numbers.",
    );
  }

  const tolerance =
    input.tolerance ?? 0.01;

  if (
    !Number.isFinite(tolerance) ||
    tolerance < 0
  ) {
    throw new Error(
      "tolerance must be a non-negative finite number.",
    );
  }

  const currency =
    input.currency
      .trim()
      .toUpperCase();

  if (!currency) {
    throw new Error(
      "currency is required.",
    );
  }

  const drivers =
    input.comparison.changes
      .filter(
        (change) =>
          change.currency
            ?.trim()
            .toUpperCase() ===
          currency,
      )
      .map(
        (
          change,
        ): MovementDriver => ({
          stableId:
            change.stableId,

          changeType:
            change.changeType,

          counterpartyName:
            change.counterpartyName,

          documentNo:
            change.documentNo,

          currency:
            change.currency,

          liquidityImpact:
            roundMoney(
              change.liquidityImpact,
            ),
        }),
      );

  const forecastMovement =
    roundMoney(
      input.currentClosingLiquidity -
        input.previousClosingLiquidity,
    );

  const identifiedDriverImpact =
    roundMoney(
      drivers.reduce(
        (
          total,
          driver,
        ) =>
          total +
          driver.liquidityImpact,
        0,
      ),
    );

  const unexplainedMovement =
    roundMoney(
      forecastMovement -
        identifiedDriverImpact,
    );

  const status:
    MovementReconciliationStatus =
      Math.abs(
        unexplainedMovement,
      ) <= tolerance
        ? "RECONCILED"
        : "UNEXPLAINED";

  return {
    currency,

    previousClosingLiquidity:
      roundMoney(
        input.previousClosingLiquidity,
      ),

    currentClosingLiquidity:
      roundMoney(
        input.currentClosingLiquidity,
      ),

    forecastMovement,

    identifiedDriverImpact,

    unexplainedMovement,

    tolerance,

    status,

    drivers,
  };
}
