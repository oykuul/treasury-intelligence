import type {
  TreasuryDataset,
} from "../treasury/build-liquidity-forecast";

import type {
  AlmPosition,
} from "./positions";

export type FundingInstrument = {
  sourceType: "debt" | "facility";
  lender: string;
  referenceId: string;
  currency: string;
  outstandingAmount: number;
  maturityDate: string;
  interestType: string | null;
  annualInterestRate: number | null;
  bucketId: string;
};

export type FundingMaturityBucket = {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  maturingDebt: number;
  sharePercent: number;
  instruments: FundingInstrument[];
};

export type LenderExposure = {
  lender: string;
  debtOutstanding: number;
  committedFacilities: number;
  drawnFacilities: number;
  availableFacilities: number;
  fundingCapacity: number;
  sharePercent: number;
  debtCount: number;
  facilityCount: number;
};

export type DebtFundingIgnoredItem = {
  sourceType: "debt" | "facility";
  referenceId: string | null;
  reason:
    | "CURRENCY_MISMATCH"
    | "MISSING_MATURITY"
    | "MISSING_OUTSTANDING"
    | "DUPLICATE_DEBT_REFERENCE";
};

export type DebtFundingResult = {
  currency: string;
  asOfDate: string;
  horizonEndDate: string;
  debtOutstanding: number;
  debtDue12M: number;
  debtDue24M: number;
  debtDue36M: number;
  committedFacilities: number;
  drawnFacilities: number;
  availableFacilities: number;
  facilityUtilizationPercent: number;
  facilityCoverage12MPercent: number;
  refinancingNeed12M: number;
  largestMaturityWall: number;
  largestMaturityWallBucketId: string | null;
  top3LenderConcentration: number;
  maturityBuckets: FundingMaturityBucket[];
  lenders: LenderExposure[];
  instruments: FundingInstrument[];
  ignoredItems: DebtFundingIgnoredItem[];
};

export type BuildDebtFundingInput = {
  datasets: TreasuryDataset[];
  positions?: AlmPosition[];
  currency: string;
  asOfDate: string;
};

function parseIsoDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? parsed
    : null;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

function addMonths(value: Date, months: number): Date {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + months;
  const day = value.getUTCDate();
  const firstOfTarget = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth(),
      Math.min(day, lastDay),
    ),
  );
}

function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeReference(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function finiteAmount(value: number | null): number | null {
  return value !== null && Number.isFinite(value)
    ? Math.abs(value)
    : null;
}

function makeBuckets(asOfDate: Date): FundingMaturityBucket[] {
  const quarters = Array.from(
    { length: 12 },
    (_, index): FundingMaturityBucket => {
      const start = addMonths(asOfDate, index * 3);
      const end = addDays(addMonths(asOfDate, (index + 1) * 3), -1);

      return {
        id: `Q${index + 1}`,
        label: `${index * 3}–${(index + 1) * 3} ay`,
        startDate: formatIsoDate(start),
        endDate: formatIsoDate(end),
        maturingDebt: 0,
        sharePercent: 0,
        instruments: [],
      };
    },
  );

  return [
    {
      id: "overdue",
      label: "Vadesi geçmiş",
      startDate: null,
      endDate: formatIsoDate(addDays(asOfDate, -1)),
      maturingDebt: 0,
      sharePercent: 0,
      instruments: [],
    },
    ...quarters,
    {
      id: "over36m",
      label: ">36 ay",
      startDate: formatIsoDate(addMonths(asOfDate, 36)),
      endDate: null,
      maturingDebt: 0,
      sharePercent: 0,
      instruments: [],
    },
  ];
}

function bucketIndexForDate(
  maturityDate: Date,
  asOfDate: Date,
): number {
  if (maturityDate < asOfDate) return 0;

  for (let quarter = 1; quarter <= 12; quarter += 1) {
    if (maturityDate < addMonths(asOfDate, quarter * 3)) {
      return quarter;
    }
  }

  return 13;
}

type MutableLender = Omit<LenderExposure, "fundingCapacity" | "sharePercent">;

function lenderEntry(
  lenders: Map<string, MutableLender>,
  lenderName: string | null,
): MutableLender {
  const display = lenderName?.trim() || "Tanımsız lender";
  const key = display.toLocaleUpperCase("en-US");
  const existing = lenders.get(key);
  if (existing) return existing;

  const created: MutableLender = {
    lender: display,
    debtOutstanding: 0,
    committedFacilities: 0,
    drawnFacilities: 0,
    availableFacilities: 0,
    debtCount: 0,
    facilityCount: 0,
  };
  lenders.set(key, created);
  return created;
}

export function buildDebtFunding(
  input: BuildDebtFundingInput,
): DebtFundingResult {
  const asOfDate = parseIsoDate(input.asOfDate);
  if (!asOfDate) {
    throw new Error("asOfDate must be a valid ISO date.");
  }

  const currency = normalizeCurrency(input.currency);
  if (!currency) {
    throw new Error("currency is required.");
  }

  const positions = input.positions ?? [];
  const buckets = makeBuckets(asOfDate);
  const instruments: FundingInstrument[] = [];
  const ignoredItems: DebtFundingIgnoredItem[] = [];
  const lenders = new Map<string, MutableLender>();
  const debtReferences = new Set<string>();
  let debtOutstanding = 0;

  const debtDataset = input.datasets.find(
    (dataset) => dataset.type === "debt",
  );

  for (const record of debtDataset?.records ?? []) {
    const referenceId = normalizeReference(record.debtId);

    if (normalizeCurrency(record.currency ?? "") !== currency) {
      ignoredItems.push({
        sourceType: "debt",
        referenceId: record.debtId,
        reason: "CURRENCY_MISMATCH",
      });
      continue;
    }

    const outstandingAmount = finiteAmount(record.outstandingPrincipal);
    if (outstandingAmount === null) {
      ignoredItems.push({
        sourceType: "debt",
        referenceId: record.debtId,
        reason: "MISSING_OUTSTANDING",
      });
      continue;
    }

    if (outstandingAmount === 0) continue;

    if (referenceId) debtReferences.add(referenceId);

    const lender = lenderEntry(lenders, record.lender);
    debtOutstanding += outstandingAmount;
    lender.debtOutstanding += outstandingAmount;
    lender.debtCount += 1;

    const maturity = record.maturityDate
      ? parseIsoDate(record.maturityDate)
      : null;
    if (!maturity || !record.maturityDate) {
      ignoredItems.push({
        sourceType: "debt",
        referenceId: record.debtId,
        reason: "MISSING_MATURITY",
      });
      continue;
    }

    const bucket = buckets[bucketIndexForDate(maturity, asOfDate)];
    const instrument: FundingInstrument = {
      sourceType: "debt",
      lender: record.lender?.trim() || "Tanımsız lender",
      referenceId: record.debtId?.trim() || `DEBT-ROW-${record.sourceRowNumber}`,
      currency,
      outstandingAmount,
      maturityDate: record.maturityDate,
      interestType: record.interestType,
      annualInterestRate: record.annualInterestRate,
      bucketId: bucket.id,
    };

    instruments.push(instrument);
    bucket.instruments.push(instrument);
    bucket.maturingDebt += outstandingAmount;
  }

  let committedFacilities = 0;
  let drawnFacilities = 0;
  let availableFacilities = 0;

  for (const position of positions) {
    if (position.positionType !== "facility") continue;

    if (normalizeCurrency(position.currency) !== currency) {
      ignoredItems.push({
        sourceType: "facility",
        referenceId: position.referenceId,
        reason: "CURRENCY_MISMATCH",
      });
      continue;
    }

    const committed = Math.abs(position.committedAmount ?? 0);
    const drawn = Math.abs(position.drawnAmount ?? 0);
    const available = Math.abs(position.availableAmount);
    committedFacilities += committed;
    drawnFacilities += drawn;
    availableFacilities += available;

    const lender = lenderEntry(lenders, position.counterpartyName);
    lender.committedFacilities += committed;
    lender.drawnFacilities += drawn;
    lender.availableFacilities += available;
    lender.facilityCount += 1;

    if (drawn === 0) continue;

    const normalizedReference = normalizeReference(position.referenceId);
    if (normalizedReference && debtReferences.has(normalizedReference)) {
      ignoredItems.push({
        sourceType: "facility",
        referenceId: position.referenceId,
        reason: "DUPLICATE_DEBT_REFERENCE",
      });
      continue;
    }

    debtOutstanding += drawn;
    lender.debtOutstanding += drawn;
    lender.debtCount += 1;

    const maturity = position.maturityDate
      ? parseIsoDate(position.maturityDate)
      : null;
    if (!maturity || !position.maturityDate) {
      ignoredItems.push({
        sourceType: "facility",
        referenceId: position.referenceId,
        reason: "MISSING_MATURITY",
      });
      continue;
    }

    const bucket = buckets[bucketIndexForDate(maturity, asOfDate)];
    const instrument: FundingInstrument = {
      sourceType: "facility",
      lender: position.counterpartyName,
      referenceId: position.referenceId,
      currency,
      outstandingAmount: drawn,
      maturityDate: position.maturityDate,
      interestType: position.interestType,
      annualInterestRate: position.annualInterestRate,
      bucketId: bucket.id,
    };

    instruments.push(instrument);
    bucket.instruments.push(instrument);
    bucket.maturingDebt += drawn;
  }

  for (const bucket of buckets) {
    bucket.sharePercent = debtOutstanding === 0
      ? 0
      : bucket.maturingDebt / debtOutstanding * 100;
  }

  const dueThroughQuarter = (quarter: number) => buckets
    .slice(0, quarter + 1)
    .reduce((total, bucket) => total + bucket.maturingDebt, 0);
  const debtDue12M = dueThroughQuarter(4);
  const debtDue24M = dueThroughQuarter(8);
  const debtDue36M = dueThroughQuarter(12);
  const futureBuckets = buckets.slice(1, 13);
  const largestBucket = futureBuckets.reduce<FundingMaturityBucket | null>(
    (largest, bucket) =>
      !largest || bucket.maturingDebt > largest.maturingDebt
        ? bucket
        : largest,
    null,
  );
  const materialLargestBucket =
    largestBucket && largestBucket.maturingDebt > 0
      ? largestBucket
      : null;

  const lenderRowsWithoutShare = Array.from(lenders.values()).map(
    (lender) => ({
      ...lender,
      fundingCapacity: lender.debtOutstanding + lender.availableFacilities,
    }),
  );
  const totalFundingCapacity = lenderRowsWithoutShare.reduce(
    (total, lender) => total + lender.fundingCapacity,
    0,
  );
  const lenderRows: LenderExposure[] = lenderRowsWithoutShare
    .map((lender) => ({
      ...lender,
      sharePercent: totalFundingCapacity === 0
        ? 0
        : lender.fundingCapacity / totalFundingCapacity * 100,
    }))
    .sort((left, right) => right.fundingCapacity - left.fundingCapacity);
  const top3LenderConcentration = lenderRows
    .slice(0, 3)
    .reduce((total, lender) => total + lender.sharePercent, 0);
  const refinancingNeed12M = Math.max(0, debtDue12M - availableFacilities);

  return {
    currency,
    asOfDate: input.asOfDate,
    horizonEndDate: formatIsoDate(addMonths(asOfDate, 36)),
    debtOutstanding,
    debtDue12M,
    debtDue24M,
    debtDue36M,
    committedFacilities,
    drawnFacilities,
    availableFacilities,
    facilityUtilizationPercent: committedFacilities === 0
      ? 0
      : drawnFacilities / committedFacilities * 100,
    facilityCoverage12MPercent: debtDue12M === 0
      ? 100
      : Math.min(100, availableFacilities / debtDue12M * 100),
    refinancingNeed12M,
    largestMaturityWall: materialLargestBucket?.maturingDebt ?? 0,
    largestMaturityWallBucketId: materialLargestBucket?.id ?? null,
    top3LenderConcentration,
    maturityBuckets: buckets,
    lenders: lenderRows,
    instruments: instruments.sort(
      (left, right) => left.maturityDate.localeCompare(right.maturityDate),
    ),
    ignoredItems,
  };
}
