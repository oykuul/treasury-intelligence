import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";
import type { TreasuryDatasetType } from "../treasury/build-liquidity-forecast";

export type ChangeType =
  | "AMOUNT_CHANGED"
  | "DATE_SHIFTED"
  | "NEW_ITEM"
  | "REMOVED_ITEM";

export type ComparedTreasuryRecord = {
  datasetType: TreasuryDatasetType;
  record: CanonicalTreasuryRecord;
};

export type TreasuryChange = {
  stableId: string;

  changeType: ChangeType;

  datasetType: TreasuryDatasetType;

  counterpartyName: string | null;
  documentNo: string | null;

  currency: string | null;

  previousAmount: number | null;
  currentAmount: number | null;
  amountDelta: number | null;

  previousDate: string | null;
  currentDate: string | null;
  dateShiftDays: number | null;

  liquidityImpact: number;
};

export type CompareRecordsResult = {
  changes: TreasuryChange[];

  summary: {
    amountChanges: number;
    dateShifts: number;
    newItems: number;
    removedItems: number;

    totalLiquidityImpact: number;
    totalChanges: number;
  };
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

function normalizeKeyPart(
  value: string | null | undefined,
): string {
  return (
    value
      ?.trim()
      .toUpperCase() ?? ""
  );
}

function getStableId(
  item: ComparedTreasuryRecord,
): string {
  const record = item.record;

  if (record.debtId) {
    return [
      item.datasetType,
      "DEBT",
      normalizeKeyPart(
        record.company,
      ),
      normalizeKeyPart(
        record.debtId,
      ),
    ].join("|");
  }

  if (
    record.documentNo &&
    record.lineItemNo
  ) {
    return [
      item.datasetType,
      "SAP_ITEM",

      normalizeKeyPart(
        record.company,
      ),

      normalizeKeyPart(
        record.fiscalYear,
      ),

      normalizeKeyPart(
        record.documentNo,
      ),

      normalizeKeyPart(
        record.lineItemNo,
      ),
    ].join("|");
  }

  if (record.documentNo) {
    return [
      item.datasetType,
      "DOCUMENT",

      normalizeKeyPart(
        record.company,
      ),

      normalizeKeyPart(
        record.fiscalYear,
      ),

      normalizeKeyPart(
        record.documentType,
      ),

      normalizeKeyPart(
        record.documentNo,
      ),

      normalizeKeyPart(
        record.counterpartyId,
      ),
    ].join("|");
  }

  if (record.reference) {
    return [
      item.datasetType,
      "REFERENCE",

      normalizeKeyPart(
        record.company,
      ),

      normalizeKeyPart(
        record.reference,
      ),

      normalizeKeyPart(
        record.counterpartyId,
      ),
    ].join("|");
  }

  if (record.assignment) {
    return [
      item.datasetType,
      "ASSIGNMENT",

      normalizeKeyPart(
        record.company,
      ),

      normalizeKeyPart(
        record.assignment,
      ),

      normalizeKeyPart(
        record.counterpartyId,
      ),
    ].join("|");
  }

  return [
    item.datasetType,
    "FALLBACK",

    normalizeKeyPart(
      record.company,
    ),

    normalizeKeyPart(
      record.counterpartyId,
    ),

    normalizeKeyPart(
      record.counterpartyName,
    ),

    normalizeKeyPart(
      record.currency,
    ),

    String(
      record.sourceRowNumber,
    ),
  ].join("|");
}

function getAmount(
  item: ComparedTreasuryRecord,
): number | null {
  if (
    item.datasetType ===
    "debt"
  ) {
    return (
      item.record
        .nextPaymentAmount
    );
  }

  return item.record.amount;
}

function getDate(
  item: ComparedTreasuryRecord,
): string | null {
  if (
    item.datasetType ===
    "debt"
  ) {
    return (
      item.record
        .nextPaymentDate
    );
  }

  return item.record.dueDate;
}

function getLiquiditySign(
  datasetType: TreasuryDatasetType,
): number {
  if (
    datasetType ===
    "receivables"
  ) {
    return 1;
  }

  return -1;
}

function calculateDayDifference(
  previousDate: string,
  currentDate: string,
): number | null {
  const previous =
    Date.parse(
      `${previousDate}T00:00:00Z`,
    );

  const current =
    Date.parse(
      `${currentDate}T00:00:00Z`,
    );

  if (
    !Number.isFinite(previous) ||
    !Number.isFinite(current)
  ) {
    return null;
  }

  return Math.round(
    (current - previous) /
      86_400_000,
  );
}

export function compareRecords(
  previous: ComparedTreasuryRecord[],
  current: ComparedTreasuryRecord[],
): CompareRecordsResult {
  const changes:
    TreasuryChange[] = [];

  const previousMap =
    new Map<
      string,
      ComparedTreasuryRecord
    >();

  const currentMap =
    new Map<
      string,
      ComparedTreasuryRecord
    >();

  for (const item of previous) {
    previousMap.set(
      getStableId(item),
      item,
    );
  }

  for (const item of current) {
    currentMap.set(
      getStableId(item),
      item,
    );
  }

  const stableIds =
    new Set([
      ...previousMap.keys(),
      ...currentMap.keys(),
    ]);

  for (const stableId of stableIds) {
    const previousItem =
      previousMap.get(
        stableId,
      );

    const currentItem =
      currentMap.get(
        stableId,
      );

    if (
      !previousItem &&
      currentItem
    ) {
      const amount =
        getAmount(
          currentItem,
        );

      const liquidityImpact =
        amount === null
          ? 0
          : roundMoney(
              Math.abs(amount) *
                getLiquiditySign(
                  currentItem.datasetType,
                ),
            );

      changes.push({
        stableId,

        changeType:
          "NEW_ITEM",

        datasetType:
          currentItem.datasetType,

        counterpartyName:
          currentItem.record
            .counterpartyName,

        documentNo:
          currentItem.record
            .documentNo,

        currency:
          currentItem.record
            .currency,

        previousAmount:
          null,

        currentAmount:
          amount,

        amountDelta:
          amount,

        previousDate:
          null,

        currentDate:
          getDate(
            currentItem,
          ),

        dateShiftDays:
          null,

        liquidityImpact,
      });

      continue;
    }

    if (
      previousItem &&
      !currentItem
    ) {
      const amount =
        getAmount(
          previousItem,
        );

      const liquidityImpact =
        amount === null
          ? 0
          : roundMoney(
              -Math.abs(amount) *
                getLiquiditySign(
                  previousItem.datasetType,
                ),
            );

      changes.push({
        stableId,

        changeType:
          "REMOVED_ITEM",

        datasetType:
          previousItem.datasetType,

        counterpartyName:
          previousItem.record
            .counterpartyName,

        documentNo:
          previousItem.record
            .documentNo,

        currency:
          previousItem.record
            .currency,

        previousAmount:
          amount,

        currentAmount:
          null,

        amountDelta:
          amount === null
            ? null
            : -amount,

        previousDate:
          getDate(
            previousItem,
          ),

        currentDate:
          null,

        dateShiftDays:
          null,

        liquidityImpact,
      });

      continue;
    }

    if (
      !previousItem ||
      !currentItem
    ) {
      continue;
    }

    const previousAmount =
      getAmount(
        previousItem,
      );

    const currentAmount =
      getAmount(
        currentItem,
      );

    if (
      previousAmount !== null &&
      currentAmount !== null &&
      previousAmount !==
        currentAmount
    ) {
      const amountDelta =
        roundMoney(
          currentAmount -
            previousAmount,
        );

      const liquidityImpact =
        roundMoney(
          amountDelta *
            getLiquiditySign(
              currentItem.datasetType,
            ),
        );

      changes.push({
        stableId,

        changeType:
          "AMOUNT_CHANGED",

        datasetType:
          currentItem.datasetType,

        counterpartyName:
          currentItem.record
            .counterpartyName,

        documentNo:
          currentItem.record
            .documentNo,

        currency:
          currentItem.record
            .currency,

        previousAmount,

        currentAmount,

        amountDelta,

        previousDate:
          getDate(
            previousItem,
          ),

        currentDate:
          getDate(
            currentItem,
          ),

        dateShiftDays:
          null,

        liquidityImpact,
      });
    }

    const previousDate =
      getDate(
        previousItem,
      );

    const currentDate =
      getDate(
        currentItem,
      );

    if (
      previousDate &&
      currentDate &&
      previousDate !==
        currentDate
    ) {
      changes.push({
        stableId,

        changeType:
          "DATE_SHIFTED",

        datasetType:
          currentItem.datasetType,

        counterpartyName:
          currentItem.record
            .counterpartyName,

        documentNo:
          currentItem.record
            .documentNo,

        currency:
          currentItem.record
            .currency,

        previousAmount,

        currentAmount,

        amountDelta:
          null,

        previousDate,

        currentDate,

        dateShiftDays:
          calculateDayDifference(
            previousDate,
            currentDate,
          ),

        liquidityImpact: 0,
      });
    }
  }

  const summary = {
    amountChanges:
      changes.filter(
        (change) =>
          change.changeType ===
          "AMOUNT_CHANGED",
      ).length,

    dateShifts:
      changes.filter(
        (change) =>
          change.changeType ===
          "DATE_SHIFTED",
      ).length,

    newItems:
      changes.filter(
        (change) =>
          change.changeType ===
          "NEW_ITEM",
      ).length,

    removedItems:
      changes.filter(
        (change) =>
          change.changeType ===
          "REMOVED_ITEM",
      ).length,

    totalLiquidityImpact:
      roundMoney(
        changes.reduce(
          (
            total,
            change,
          ) =>
            total +
            change.liquidityImpact,
          0,
        ),
      ),

    totalChanges:
      changes.length,
  };

  return {
    changes,
    summary,
  };
}