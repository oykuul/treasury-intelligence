import type {
  CanonicalTreasuryRecord,
} from "../canonical/normalize-records";

import type {
  TreasuryDataset,
  TreasuryDatasetType,
} from "../treasury/build-liquidity-forecast";

import type {
  AlmPosition,
} from "./positions";

export type MaturityGapSource =
  | TreasuryDatasetType
  | "facility";

export type MaturityGapDirection =
  | "ASSET"
  | "LIABILITY";

export type MaturityGapFlow = {
  sourceType: MaturityGapSource;
  direction: MaturityGapDirection;
  component:
    | "contractual"
    | "next_payment"
    | "principal"
    | "maturity"
    | "drawn_facility";
  date: string;
  currency: string;
  amount: number;
  counterpartyName: string | null;
  referenceId: string | null;
};

export type MaturityGapBucket = {
  id:
    | "overdue"
    | `M${string}`
    | "over12m";
  label: string;
  startDate: string | null;
  endDate: string | null;
  assets: number;
  liabilities: number;
  netGap: number;
  cumulativeGap: number;
  flows: MaturityGapFlow[];
};

export type MaturityGapIgnoredItem = {
  sourceType: MaturityGapSource;
  referenceId: string | null;
  reason:
    | "CURRENCY_MISMATCH"
    | "MISSING_DATE"
    | "MISSING_AMOUNT"
    | "DUPLICATE_DEBT_REFERENCE";
};

export type MaturityGapResult = {
  currency: string;
  asOfDate: string;
  horizonEndDate: string;
  openingLiquidity: number;
  availableFacilities: number;
  totalAssets12M: number;
  totalLiabilities12M: number;
  netGap12M: number;
  closingCumulativeGap12M: number;
  minimumCumulativeGap12M: number;
  minimumBucketId: string | null;
  fundingNeedBeforeFacilities: number;
  residualFundingNeed: number;
  buckets: MaturityGapBucket[];
  ignoredItems: MaturityGapIgnoredItem[];
};

export type BuildMaturityGapInput = {
  datasets: TreasuryDataset[];
  positions?: AlmPosition[];
  currency: string;
  asOfDate: string;
  openingLiquidity: number;
  availableFacilities: number;
};

function parseIsoDate(
  value: string,
): Date | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function addDays(
  value: Date,
  days: number,
): Date {
  return new Date(
    value.getTime() +
      days * 86_400_000,
  );
}

function formatIsoDate(
  value: Date,
): string {
  return value
    .toISOString()
    .slice(0, 10);
}

function normalizeCurrency(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase();
}

function absoluteFinite(
  value: number | null,
): number | null {
  return value !== null &&
    Number.isFinite(value)
    ? Math.abs(value)
    : null;
}

function referenceForRecord(
  type: TreasuryDatasetType,
  record: CanonicalTreasuryRecord,
): string | null {
  return type === "debt"
    ? record.debtId
    : record.documentNo;
}

function counterpartyForRecord(
  type: TreasuryDatasetType,
  record: CanonicalTreasuryRecord,
): string | null {
  return type === "debt"
    ? record.lender ??
        record.counterpartyName
    : record.counterpartyName;
}

function addContractualFlow(
  flows: MaturityGapFlow[],
  ignoredItems: MaturityGapIgnoredItem[],
  datasetType: "payables" | "receivables",
  record: CanonicalTreasuryRecord,
  currency: string,
): void {
  const referenceId =
    referenceForRecord(
      datasetType,
      record,
    );
  const recordCurrency =
    record.currency
      ? normalizeCurrency(
          record.currency,
        )
      : null;

  if (recordCurrency !== currency) {
    ignoredItems.push({
      sourceType: datasetType,
      referenceId,
      reason: "CURRENCY_MISMATCH",
    });
    return;
  }

  if (
    !record.dueDate ||
    !parseIsoDate(record.dueDate)
  ) {
    ignoredItems.push({
      sourceType: datasetType,
      referenceId,
      reason: "MISSING_DATE",
    });
    return;
  }

  const amount =
    absoluteFinite(record.amount);

  if (amount === null) {
    ignoredItems.push({
      sourceType: datasetType,
      referenceId,
      reason: "MISSING_AMOUNT",
    });
    return;
  }

  flows.push({
    sourceType: datasetType,
    direction:
      datasetType === "receivables"
        ? "ASSET"
        : "LIABILITY",
    component: "contractual",
    date: record.dueDate,
    currency,
    amount,
    counterpartyName:
      counterpartyForRecord(
        datasetType,
        record,
      ),
    referenceId,
  });
}

function addDebtFlows(
  flows: MaturityGapFlow[],
  ignoredItems: MaturityGapIgnoredItem[],
  record: CanonicalTreasuryRecord,
  currency: string,
): void {
  const referenceId = record.debtId;
  const recordCurrency =
    record.currency
      ? normalizeCurrency(
          record.currency,
        )
      : null;

  if (recordCurrency !== currency) {
    ignoredItems.push({
      sourceType: "debt",
      referenceId,
      reason: "CURRENCY_MISMATCH",
    });
    return;
  }

  const paymentDate =
    record.nextPaymentDate &&
    parseIsoDate(
      record.nextPaymentDate,
    )
      ? record.nextPaymentDate
      : null;
  const paymentAmount =
    absoluteFinite(
      record.nextPaymentAmount,
    );
  const maturityDate =
    record.maturityDate &&
    parseIsoDate(
      record.maturityDate,
    )
      ? record.maturityDate
      : null;
  const principalAmount =
    absoluteFinite(
      record.outstandingPrincipal,
    );
  const common = {
    sourceType: "debt" as const,
    direction: "LIABILITY" as const,
    currency,
    counterpartyName:
      counterpartyForRecord(
        "debt",
        record,
      ),
    referenceId,
  };

  if (
    paymentDate &&
    maturityDate &&
    paymentDate === maturityDate &&
    (
      paymentAmount !== null ||
      principalAmount !== null
    )
  ) {
    flows.push({
      ...common,
      component: "maturity",
      date: maturityDate,
      amount: Math.max(
        paymentAmount ?? 0,
        principalAmount ?? 0,
      ),
    });
    return;
  }

  if (
    paymentDate &&
    paymentAmount !== null
  ) {
    flows.push({
      ...common,
      component: "next_payment",
      date: paymentDate,
      amount: paymentAmount,
    });
  }

  if (
    maturityDate &&
    principalAmount !== null
  ) {
    flows.push({
      ...common,
      component: "principal",
      date: maturityDate,
      amount: principalAmount,
    });
  }

  if (
    !paymentDate &&
    !maturityDate
  ) {
    ignoredItems.push({
      sourceType: "debt",
      referenceId,
      reason: "MISSING_DATE",
    });
  } else if (
    paymentAmount === null &&
    principalAmount === null
  ) {
    ignoredItems.push({
      sourceType: "debt",
      referenceId,
      reason: "MISSING_AMOUNT",
    });
  }
}

function buildFlows(
  datasets: TreasuryDataset[],
  positions: AlmPosition[],
  currency: string,
): {
  flows: MaturityGapFlow[];
  ignoredItems: MaturityGapIgnoredItem[];
} {
  const flows: MaturityGapFlow[] = [];
  const ignoredItems:
    MaturityGapIgnoredItem[] = [];
  const debtReferences = new Set<string>();

  for (const dataset of datasets) {
    for (const record of dataset.records) {
      if (dataset.type === "debt") {
        if (record.debtId) {
          debtReferences.add(
            record.debtId,
          );
        }
        addDebtFlows(
          flows,
          ignoredItems,
          record,
          currency,
        );
      } else {
        addContractualFlow(
          flows,
          ignoredItems,
          dataset.type,
          record,
          currency,
        );
      }
    }
  }

  for (const position of positions) {
    if (
      position.positionType !==
        "facility" ||
      (
        position.drawnAmount ?? 0
      ) <= 0
    ) {
      continue;
    }

    if (
      normalizeCurrency(
        position.currency,
      ) !== currency
    ) {
      ignoredItems.push({
        sourceType: "facility",
        referenceId:
          position.referenceId,
        reason: "CURRENCY_MISMATCH",
      });
      continue;
    }

    if (
      debtReferences.has(
        position.referenceId,
      )
    ) {
      ignoredItems.push({
        sourceType: "facility",
        referenceId:
          position.referenceId,
        reason:
          "DUPLICATE_DEBT_REFERENCE",
      });
      continue;
    }

    if (
      !position.maturityDate ||
      !parseIsoDate(
        position.maturityDate,
      )
    ) {
      ignoredItems.push({
        sourceType: "facility",
        referenceId:
          position.referenceId,
        reason: "MISSING_DATE",
      });
      continue;
    }

    flows.push({
      sourceType: "facility",
      direction: "LIABILITY",
      component: "drawn_facility",
      date: position.maturityDate,
      currency,
      amount: Math.abs(
        position.drawnAmount ?? 0,
      ),
      counterpartyName:
        position.counterpartyName,
      referenceId:
        position.referenceId,
    });
  }

  return {
    flows,
    ignoredItems,
  };
}

function makeBuckets(
  asOfDate: Date,
): MaturityGapBucket[] {
  const monthly = Array.from(
    { length: 12 },
    (_, index): MaturityGapBucket => {
      const startDay =
        index === 0
          ? 0
          : index * 30 + 1;
      const endDay =
        index === 11
          ? 365
          : (index + 1) * 30;

      return {
        id: `M${String(
          index + 1,
        ).padStart(2, "0")}`,
        label:
          index === 0
            ? "0–30 gün"
            : `${startDay}–${endDay} gün`,
        startDate:
          formatIsoDate(
            addDays(
              asOfDate,
              startDay,
            ),
          ),
        endDate:
          formatIsoDate(
            addDays(
              asOfDate,
              endDay,
            ),
          ),
        assets: 0,
        liabilities: 0,
        netGap: 0,
        cumulativeGap: 0,
        flows: [],
      };
    },
  );

  return [
    {
      id: "overdue",
      label: "Vadesi geçmiş",
      startDate: null,
      endDate:
        formatIsoDate(
          addDays(asOfDate, -1),
        ),
      assets: 0,
      liabilities: 0,
      netGap: 0,
      cumulativeGap: 0,
      flows: [],
    },
    ...monthly,
    {
      id: "over12m",
      label: ">12 ay",
      startDate:
        formatIsoDate(
          addDays(asOfDate, 366),
        ),
      endDate: null,
      assets: 0,
      liabilities: 0,
      netGap: 0,
      cumulativeGap: 0,
      flows: [],
    },
  ];
}

function bucketIndexForDate(
  flowDate: Date,
  asOfDate: Date,
): number {
  const difference = Math.floor(
    (
      flowDate.getTime() -
      asOfDate.getTime()
    ) /
      86_400_000,
  );

  if (difference < 0) {
    return 0;
  }

  if (difference <= 30) {
    return 1;
  }

  if (difference <= 330) {
    return Math.floor(
      (difference - 1) / 30,
    ) + 1;
  }

  if (difference <= 365) {
    return 12;
  }

  return 13;
}

export function buildMaturityGap(
  input: BuildMaturityGapInput,
): MaturityGapResult {
  const asOfDate =
    parseIsoDate(
      input.asOfDate,
    );

  if (!asOfDate) {
    throw new Error(
      "asOfDate must be a valid ISO date.",
    );
  }

  if (
    !Number.isFinite(
      input.openingLiquidity,
    ) ||
    input.openingLiquidity < 0
  ) {
    throw new Error(
      "openingLiquidity must be a non-negative finite number.",
    );
  }

  if (
    !Number.isFinite(
      input.availableFacilities,
    ) ||
    input.availableFacilities < 0
  ) {
    throw new Error(
      "availableFacilities must be a non-negative finite number.",
    );
  }

  const currency =
    normalizeCurrency(
      input.currency,
    );
  const buckets =
    makeBuckets(asOfDate);
  const {
    flows,
    ignoredItems,
  } = buildFlows(
    input.datasets,
    input.positions ?? [],
    currency,
  );

  for (const flow of flows) {
    const flowDate =
      parseIsoDate(flow.date);

    if (!flowDate) {
      continue;
    }

    const bucket =
      buckets[
        bucketIndexForDate(
          flowDate,
          asOfDate,
        )
      ];

    bucket.flows.push(flow);

    if (
      flow.direction === "ASSET"
    ) {
      bucket.assets += flow.amount;
    } else {
      bucket.liabilities +=
        flow.amount;
    }
  }

  let cumulativeGap =
    input.openingLiquidity;

  for (const bucket of buckets) {
    bucket.netGap =
      bucket.assets -
      bucket.liabilities;
    cumulativeGap += bucket.netGap;
    bucket.cumulativeGap =
      cumulativeGap;
  }

  const horizonBuckets =
    buckets.slice(0, 13);
  const totalAssets12M =
    horizonBuckets.reduce(
      (total, bucket) =>
        total + bucket.assets,
      0,
    );
  const totalLiabilities12M =
    horizonBuckets.reduce(
      (total, bucket) =>
        total +
        bucket.liabilities,
      0,
    );
  const closingCumulativeGap12M =
    horizonBuckets.at(-1)
      ?.cumulativeGap ??
    input.openingLiquidity;
  let minimumCumulativeGap12M =
    input.openingLiquidity;
  let minimumBucketId:
    string | null = null;

  for (const bucket of horizonBuckets) {
    if (
      bucket.cumulativeGap <
      minimumCumulativeGap12M
    ) {
      minimumCumulativeGap12M =
        bucket.cumulativeGap;
      minimumBucketId = bucket.id;
    }
  }

  const fundingNeedBeforeFacilities =
    Math.max(
      0,
      -minimumCumulativeGap12M,
    );

  return {
    currency,
    asOfDate: input.asOfDate,
    horizonEndDate:
      formatIsoDate(
        addDays(asOfDate, 365),
      ),
    openingLiquidity:
      input.openingLiquidity,
    availableFacilities:
      input.availableFacilities,
    totalAssets12M,
    totalLiabilities12M,
    netGap12M:
      totalAssets12M -
      totalLiabilities12M,
    closingCumulativeGap12M,
    minimumCumulativeGap12M,
    minimumBucketId,
    fundingNeedBeforeFacilities,
    residualFundingNeed:
      Math.max(
        0,
        fundingNeedBeforeFacilities -
          input.availableFacilities,
      ),
    buckets,
    ignoredItems,
  };
}
