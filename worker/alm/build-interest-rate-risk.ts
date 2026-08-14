import type {
  TreasuryDataset,
} from "../treasury/build-liquidity-forecast";

import type {
  AlmPosition,
} from "./positions";

export type NormalizedInterestType =
  | "FIXED"
  | "FLOATING"
  | "UNKNOWN";

export type InterestRateInstrument = {
  sourceType: "debt" | "facility";
  lender: string;
  referenceId: string;
  currency: string;
  outstandingAmount: number;
  interestType: string | null;
  normalizedInterestType: NormalizedInterestType;
  annualInterestRate: number | null;
  annualInterestExpense: number;
  maturityDate: string | null;
  repricingBucketId: string | null;
};

export type RepricingBucket = {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  floatingAmount: number;
  fixedRefinancingAmount: number;
  repricingAmount: number;
  instruments: InterestRateInstrument[];
};

export type InterestRateSensitivity = {
  shockBps: 100 | 200 | 300;
  annualizedInterestIncrease: number;
  shockedAnnualInterestExpense: number;
  effectiveWeightedAverageRatePercent: number;
};

export type LenderInterestRateExposure = {
  lender: string;
  totalDebt: number;
  fixedRateDebt: number;
  floatingRateDebt: number;
  repricingExposure12M: number;
  annualInterestExpense: number;
  rateCoveragePercent: number;
  instrumentCount: number;
};

export type InterestRateDataIssue = {
  sourceType: "debt" | "facility";
  referenceId: string | null;
  reason:
    | "CURRENCY_MISMATCH"
    | "MISSING_OUTSTANDING"
    | "MISSING_INTEREST_TYPE"
    | "MISSING_INTEREST_RATE"
    | "MISSING_MATURITY"
    | "DUPLICATE_DEBT_REFERENCE";
};

export type InterestRateRiskResult = {
  currency: string;
  asOfDate: string;
  horizonEndDate: string;
  totalInterestBearingDebt: number;
  fixedRateDebt: number;
  floatingRateDebt: number;
  unclassifiedRateDebt: number;
  fixedRateSharePercent: number;
  floatingRateSharePercent: number;
  knownRateDebt: number;
  rateCoveragePercent: number;
  weightedAverageRatePercent: number;
  currentAnnualInterestExpense: number;
  floatingExposure: number;
  fixedRefinancingExposure12M: number;
  repricingExposure12M: number;
  repricingGap12M: number;
  sensitivityScenarios: InterestRateSensitivity[];
  repricingBuckets: RepricingBucket[];
  lenders: LenderInterestRateExposure[];
  instruments: InterestRateInstrument[];
  dataIssues: InterestRateDataIssue[];
};

export type BuildInterestRateRiskInput = {
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
  const firstOfTarget = new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth() + months,
      1,
    ),
  );
  const lastDay = new Date(
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  firstOfTarget.setUTCDate(
    Math.min(value.getUTCDate(), lastDay),
  );
  return firstOfTarget;
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

function normalizeInterestType(
  value: string | null,
): NormalizedInterestType {
  const normalized = value
    ?.trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    normalized === "FIXED" ||
    normalized === "SABIT"
  ) {
    return "FIXED";
  }

  if (
    normalized === "FLOATING" ||
    normalized === "VARIABLE" ||
    normalized === "DEGISKEN"
  ) {
    return "FLOATING";
  }

  return "UNKNOWN";
}

function makeBuckets(asOfDate: Date): RepricingBucket[] {
  const quarters = Array.from(
    { length: 4 },
    (_, index): RepricingBucket => ({
      id: `Q${index + 1}`,
      label: `${index * 3}–${(index + 1) * 3} ay`,
      startDate: formatIsoDate(addMonths(asOfDate, index * 3)),
      endDate: formatIsoDate(
        addDays(addMonths(asOfDate, (index + 1) * 3), -1),
      ),
      floatingAmount: 0,
      fixedRefinancingAmount: 0,
      repricingAmount: 0,
      instruments: [],
    }),
  );

  return [
    ...quarters,
    {
      id: "over12m",
      label: ">12 ay",
      startDate: formatIsoDate(addMonths(asOfDate, 12)),
      endDate: null,
      floatingAmount: 0,
      fixedRefinancingAmount: 0,
      repricingAmount: 0,
      instruments: [],
    },
  ];
}

function fixedBucketIndex(
  maturityDate: Date,
  asOfDate: Date,
): number {
  if (maturityDate < asOfDate) return 0;

  for (let quarter = 1; quarter <= 4; quarter += 1) {
    if (maturityDate < addMonths(asOfDate, quarter * 3)) {
      return quarter - 1;
    }
  }

  return 4;
}

type MutableLender = Omit<
  LenderInterestRateExposure,
  "rateCoveragePercent"
> & {
  knownRateDebt: number;
};

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
    totalDebt: 0,
    fixedRateDebt: 0,
    floatingRateDebt: 0,
    repricingExposure12M: 0,
    annualInterestExpense: 0,
    instrumentCount: 0,
    knownRateDebt: 0,
  };
  lenders.set(key, created);
  return created;
}

type AddInstrumentInput = {
  sourceType: "debt" | "facility";
  lender: string | null;
  referenceId: string | null;
  outstandingAmount: number;
  interestType: string | null;
  annualInterestRate: number | null;
  maturityDate: string | null;
};

export function buildInterestRateRisk(
  input: BuildInterestRateRiskInput,
): InterestRateRiskResult {
  const asOfDate = parseIsoDate(input.asOfDate);
  if (!asOfDate) {
    throw new Error("asOfDate must be a valid ISO date.");
  }

  const currency = normalizeCurrency(input.currency);
  if (!currency) {
    throw new Error("currency is required.");
  }

  const buckets = makeBuckets(asOfDate);
  const instruments: InterestRateInstrument[] = [];
  const dataIssues: InterestRateDataIssue[] = [];
  const lenders = new Map<string, MutableLender>();
  const debtReferences = new Set<string>();

  let totalInterestBearingDebt = 0;
  let fixedRateDebt = 0;
  let floatingRateDebt = 0;
  let unclassifiedRateDebt = 0;
  let knownRateDebt = 0;
  let currentAnnualInterestExpense = 0;
  let fixedRefinancingExposure12M = 0;

  function addInstrument(value: AddInstrumentInput): void {
    const normalizedInterestType = normalizeInterestType(value.interestType);
    const parsedRate = finiteAmount(value.annualInterestRate);
    const annualInterestRate = parsedRate;
    const annualInterestExpense = annualInterestRate === null
      ? 0
      : value.outstandingAmount * annualInterestRate / 100;
    const lender = lenderEntry(lenders, value.lender);

    totalInterestBearingDebt += value.outstandingAmount;
    lender.totalDebt += value.outstandingAmount;
    lender.instrumentCount += 1;

    if (annualInterestRate === null) {
      dataIssues.push({
        sourceType: value.sourceType,
        referenceId: value.referenceId,
        reason: "MISSING_INTEREST_RATE",
      });
    } else {
      knownRateDebt += value.outstandingAmount;
      currentAnnualInterestExpense += annualInterestExpense;
      lender.knownRateDebt += value.outstandingAmount;
      lender.annualInterestExpense += annualInterestExpense;
    }

    let repricingBucketId: string | null = null;

    if (normalizedInterestType === "FLOATING") {
      floatingRateDebt += value.outstandingAmount;
      lender.floatingRateDebt += value.outstandingAmount;
      lender.repricingExposure12M += value.outstandingAmount;

      const bucket = buckets[0];
      repricingBucketId = bucket.id;
      bucket.floatingAmount += value.outstandingAmount;
      bucket.repricingAmount += value.outstandingAmount;
    } else if (normalizedInterestType === "FIXED") {
      fixedRateDebt += value.outstandingAmount;
      lender.fixedRateDebt += value.outstandingAmount;

      const maturity = value.maturityDate
        ? parseIsoDate(value.maturityDate)
        : null;
      if (!maturity || !value.maturityDate) {
        dataIssues.push({
          sourceType: value.sourceType,
          referenceId: value.referenceId,
          reason: "MISSING_MATURITY",
        });
      } else {
        const bucket = buckets[fixedBucketIndex(maturity, asOfDate)];
        repricingBucketId = bucket.id;
        bucket.fixedRefinancingAmount += value.outstandingAmount;
        bucket.repricingAmount += value.outstandingAmount;

        if (bucket.id !== "over12m") {
          fixedRefinancingExposure12M += value.outstandingAmount;
          lender.repricingExposure12M += value.outstandingAmount;
        }
      }
    } else {
      unclassifiedRateDebt += value.outstandingAmount;
      dataIssues.push({
        sourceType: value.sourceType,
        referenceId: value.referenceId,
        reason: "MISSING_INTEREST_TYPE",
      });
    }

    const instrument: InterestRateInstrument = {
      sourceType: value.sourceType,
      lender: value.lender?.trim() || "Tanımsız lender",
      referenceId: value.referenceId?.trim() || `${value.sourceType.toUpperCase()}-${instruments.length + 1}`,
      currency,
      outstandingAmount: value.outstandingAmount,
      interestType: value.interestType,
      normalizedInterestType,
      annualInterestRate,
      annualInterestExpense,
      maturityDate: value.maturityDate,
      repricingBucketId,
    };
    instruments.push(instrument);

    if (repricingBucketId) {
      const bucket = buckets.find(
        (candidate) => candidate.id === repricingBucketId,
      );
      bucket?.instruments.push(instrument);
    }
  }

  const debtDataset = input.datasets.find(
    (dataset) => dataset.type === "debt",
  );

  for (const record of debtDataset?.records ?? []) {
    if (normalizeCurrency(record.currency ?? "") !== currency) {
      dataIssues.push({
        sourceType: "debt",
        referenceId: record.debtId,
        reason: "CURRENCY_MISMATCH",
      });
      continue;
    }

    const outstandingAmount = finiteAmount(record.outstandingPrincipal);
    if (outstandingAmount === null) {
      dataIssues.push({
        sourceType: "debt",
        referenceId: record.debtId,
        reason: "MISSING_OUTSTANDING",
      });
      continue;
    }
    if (outstandingAmount === 0) continue;

    const reference = normalizeReference(record.debtId);
    if (reference) debtReferences.add(reference);

    addInstrument({
      sourceType: "debt",
      lender: record.lender,
      referenceId: record.debtId,
      outstandingAmount,
      interestType: record.interestType,
      annualInterestRate: record.annualInterestRate,
      maturityDate: record.maturityDate,
    });
  }

  for (const position of input.positions ?? []) {
    if (position.positionType !== "facility") continue;

    if (normalizeCurrency(position.currency) !== currency) {
      dataIssues.push({
        sourceType: "facility",
        referenceId: position.referenceId,
        reason: "CURRENCY_MISMATCH",
      });
      continue;
    }

    const drawnAmount = finiteAmount(position.drawnAmount);
    if (drawnAmount === null || drawnAmount === 0) continue;

    const reference = normalizeReference(position.referenceId);
    if (reference && debtReferences.has(reference)) {
      dataIssues.push({
        sourceType: "facility",
        referenceId: position.referenceId,
        reason: "DUPLICATE_DEBT_REFERENCE",
      });
      continue;
    }

    addInstrument({
      sourceType: "facility",
      lender: position.counterpartyName,
      referenceId: position.referenceId,
      outstandingAmount: drawnAmount,
      interestType: position.interestType,
      annualInterestRate: position.annualInterestRate,
      maturityDate: position.maturityDate,
    });
  }

  const repricingExposure12M =
    floatingRateDebt + fixedRefinancingExposure12M;
  const sensitivityScenarios = ([100, 200, 300] as const).map(
    (shockBps): InterestRateSensitivity => {
      const annualizedInterestIncrease =
        repricingExposure12M * shockBps / 10_000;
      const shockedAnnualInterestExpense =
        currentAnnualInterestExpense + annualizedInterestIncrease;

      return {
        shockBps,
        annualizedInterestIncrease,
        shockedAnnualInterestExpense,
        effectiveWeightedAverageRatePercent:
          totalInterestBearingDebt === 0
            ? 0
            : shockedAnnualInterestExpense / totalInterestBearingDebt * 100,
      };
    },
  );

  const lenderRows: LenderInterestRateExposure[] = Array.from(
    lenders.values(),
  )
    .map(({ knownRateDebt: lenderKnownRateDebt, ...lender }) => ({
      ...lender,
      rateCoveragePercent: lender.totalDebt === 0
        ? 0
        : lenderKnownRateDebt / lender.totalDebt * 100,
    }))
    .sort((left, right) => right.repricingExposure12M - left.repricingExposure12M || right.totalDebt - left.totalDebt);

  return {
    currency,
    asOfDate: input.asOfDate,
    horizonEndDate: formatIsoDate(addMonths(asOfDate, 12)),
    totalInterestBearingDebt,
    fixedRateDebt,
    floatingRateDebt,
    unclassifiedRateDebt,
    fixedRateSharePercent: totalInterestBearingDebt === 0
      ? 0
      : fixedRateDebt / totalInterestBearingDebt * 100,
    floatingRateSharePercent: totalInterestBearingDebt === 0
      ? 0
      : floatingRateDebt / totalInterestBearingDebt * 100,
    knownRateDebt,
    rateCoveragePercent: totalInterestBearingDebt === 0
      ? 100
      : knownRateDebt / totalInterestBearingDebt * 100,
    weightedAverageRatePercent: knownRateDebt === 0
      ? 0
      : currentAnnualInterestExpense / knownRateDebt * 100,
    currentAnnualInterestExpense,
    floatingExposure: floatingRateDebt,
    fixedRefinancingExposure12M,
    repricingExposure12M,
    repricingGap12M: -repricingExposure12M,
    sensitivityScenarios,
    repricingBuckets: buckets,
    lenders: lenderRows,
    instruments,
    dataIssues,
  };
}
