export type AlmPositionType =
  | "cash"
  | "facility";

export type AlmPositionInput = {
  positionType: AlmPositionType;
  entity: string;
  counterpartyName: string;
  referenceId: string;
  currency: string;
  asOfDate: string;
  availableAmount?: number;
  restrictedAmount?: number;
  committedAmount?: number | null;
  drawnAmount?: number | null;
  maturityDate?: string | null;
  interestType?: string | null;
  annualInterestRate?: number | null;
};

export type AlmPosition = {
  id: string;
  organizationId: string;
  positionType: AlmPositionType;
  entity: string;
  counterpartyName: string;
  referenceId: string;
  currency: string;
  asOfDate: string;
  availableAmount: number;
  restrictedAmount: number;
  committedAmount: number | null;
  drawnAmount: number | null;
  maturityDate: string | null;
  interestType: string | null;
  annualInterestRate: number | null;
  createdAt: string;
};

export type AlmPositionSummary = {
  currency: string;
  cashPositions: number;
  facilityPositions: number;
  availableCash: number;
  restrictedCash: number;
  committedFacilities: number;
  drawnFacilities: number;
  availableFacilities: number;
  availableLiquidity: number;
};

function isIsoDate(
  value: string,
): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );

  if (!match) {
    return false;
  }

  const parsed = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    ),
  );

  return (
    parsed.getUTCFullYear() ===
      Number(match[1]) &&
    parsed.getUTCMonth() ===
      Number(match[2]) - 1 &&
    parsed.getUTCDate() ===
      Number(match[3])
  );
}

function requireText(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${field} is required.`,
    );
  }

  return value.trim();
}

function optionalText(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : null;
}

function nonNegativeNumber(
  value: unknown,
  field: string,
  fallback?: number,
): number {
  if (
    value === undefined &&
    fallback !== undefined
  ) {
    return fallback;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${field} must be a non-negative finite number.`,
    );
  }

  return value;
}

export function validateAlmPosition(
  value: unknown,
): AlmPositionInput {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    throw new Error(
      "Position body is required.",
    );
  }

  const body = value as
    Record<string, unknown>;

  const positionType =
    body.positionType;

  if (
    positionType !== "cash" &&
    positionType !== "facility"
  ) {
    throw new Error(
      "positionType must be cash or facility.",
    );
  }

  const asOfDate =
    requireText(
      body.asOfDate,
      "asOfDate",
    );

  if (!isIsoDate(asOfDate)) {
    throw new Error(
      "asOfDate must be a valid ISO date.",
    );
  }

  const maturityDate =
    optionalText(
      body.maturityDate,
    );

  if (
    maturityDate &&
    !isIsoDate(maturityDate)
  ) {
    throw new Error(
      "maturityDate must be a valid ISO date.",
    );
  }

  const common = {
    positionType,
    entity:
      requireText(
        body.entity,
        "entity",
      ),
    counterpartyName:
      requireText(
        body.counterpartyName,
        "counterpartyName",
      ),
    referenceId:
      requireText(
        body.referenceId,
        "referenceId",
      ),
    currency:
      requireText(
        body.currency,
        "currency",
      ).toUpperCase(),
    asOfDate,
  };

  if (positionType === "cash") {
    return {
      ...common,
      availableAmount:
        nonNegativeNumber(
          body.availableAmount,
          "availableAmount",
        ),
      restrictedAmount:
        nonNegativeNumber(
          body.restrictedAmount,
          "restrictedAmount",
          0,
        ),
      committedAmount: null,
      drawnAmount: null,
      maturityDate: null,
      interestType: null,
      annualInterestRate: null,
    };
  }

  const committedAmount =
    nonNegativeNumber(
      body.committedAmount,
      "committedAmount",
    );
  const drawnAmount =
    nonNegativeNumber(
      body.drawnAmount,
      "drawnAmount",
      0,
    );

  if (drawnAmount > committedAmount) {
    throw new Error(
      "drawnAmount cannot exceed committedAmount.",
    );
  }

  const annualInterestRate =
    body.annualInterestRate ===
      undefined ||
    body.annualInterestRate === null
      ? null
      : nonNegativeNumber(
          body.annualInterestRate,
          "annualInterestRate",
        );

  return {
    ...common,
    availableAmount:
      committedAmount -
      drawnAmount,
    restrictedAmount: 0,
    committedAmount,
    drawnAmount,
    maturityDate,
    interestType:
      optionalText(
        body.interestType,
      ),
    annualInterestRate,
  };
}

export function summarizeAlmPositions(
  positions: AlmPosition[],
  currency: string,
): AlmPositionSummary {
  const normalizedCurrency =
    currency.trim().toUpperCase();

  const matching =
    positions.filter(
      (position) =>
        position.currency ===
        normalizedCurrency,
    );

  const cash = matching.filter(
    (position) =>
      position.positionType ===
      "cash",
  );
  const facilities =
    matching.filter(
      (position) =>
        position.positionType ===
        "facility",
    );

  const sum = (
    values: number[],
  ) =>
    values.reduce(
      (total, value) =>
        total + value,
      0,
    );

  const availableCash = sum(
    cash.map(
      (position) =>
        position.availableAmount,
    ),
  );
  const restrictedCash = sum(
    cash.map(
      (position) =>
        position.restrictedAmount,
    ),
  );
  const committedFacilities =
    sum(
      facilities.map(
        (position) =>
          position.committedAmount ??
          0,
      ),
    );
  const drawnFacilities = sum(
    facilities.map(
      (position) =>
        position.drawnAmount ?? 0,
    ),
  );
  const availableFacilities =
    sum(
      facilities.map(
        (position) =>
          position.availableAmount,
      ),
    );

  return {
    currency: normalizedCurrency,
    cashPositions: cash.length,
    facilityPositions:
      facilities.length,
    availableCash,
    restrictedCash,
    committedFacilities,
    drawnFacilities,
    availableFacilities,
    availableLiquidity:
      availableCash +
      availableFacilities,
  };
}
