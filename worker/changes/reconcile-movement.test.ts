import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  CompareRecordsResult,
} from "./compare-records";

import {
  reconcileMovement,
} from "./reconcile-movement";

function createComparison():
  CompareRecordsResult {
  return {
    changes: [
      {
        stableId:
          "payables|DOCUMENT|1000|2026|KR|190002|V10002",

        changeType:
          "AMOUNT_CHANGED",

        datasetType:
          "payables",

        counterpartyName:
          "Marmara Lojistik",

        documentNo:
          "190002",

        currency:
          "TRY",

        previousAmount:
          480000,

        currentAmount:
          620000,

        amountDelta:
          140000,

        previousDate:
          "2026-08-22",

        currentDate:
          "2026-08-22",

        dateShiftDays:
          null,

        liquidityImpact:
          -140000,
      },

      {
        stableId:
          "payables|DOCUMENT|1000|2026|KR|190001|V10001",

        changeType:
          "DATE_SHIFTED",

        datasetType:
          "payables",

        counterpartyName:
          "Atlas Otomotiv",

        documentNo:
          "190001",

        currency:
          "TRY",

        previousAmount:
          250000,

        currentAmount:
          250000,

        amountDelta:
          null,

        previousDate:
          "2026-08-20",

        currentDate:
          "2026-08-27",

        dateShiftDays:
          7,

        liquidityImpact:
          0,
      },

      {
        stableId:
          "payables|DOCUMENT|1000|2026|KR|190004|V10004",

        changeType:
          "NEW_ITEM",

        datasetType:
          "payables",

        counterpartyName:
          "Yeni Supplier",

        documentNo:
          "190004",

        currency:
          "TRY",

        previousAmount:
          null,

        currentAmount:
          300000,

        amountDelta:
          300000,

        previousDate:
          null,

        currentDate:
          "2026-08-28",

        dateShiftDays:
          null,

        liquidityImpact:
          -300000,
      },

      {
        stableId:
          "payables|DOCUMENT|1000|2026|KR|190003|V10003",

        changeType:
          "REMOVED_ITEM",

        datasetType:
          "payables",

        counterpartyName:
          "Nova Teknoloji",

        documentNo:
          "190003",

        currency:
          "TRY",

        previousAmount:
          175000,

        currentAmount:
          null,

        amountDelta:
          -175000,

        previousDate:
          "2026-08-25",

        currentDate:
          null,

        dateShiftDays:
          null,

        liquidityImpact:
          175000,
      },
    ],

    summary: {
      amountChanges: 1,
      dateShifts: 1,
      newItems: 1,
      removedItems: 1,
      totalLiquidityImpact:
        -265000,
      totalChanges: 4,
    },
  };
}

describe(
  "Movement Reconciliation Engine",
  () => {
    it(
      "fully reconciles forecast movement when identified drivers explain the change",
      () => {
        const result =
          reconcileMovement({
            currency: "TRY",

            previousClosingLiquidity:
              1000000,

            currentClosingLiquidity:
              735000,

            comparison:
              createComparison(),
          });

        expect(
          result.forecastMovement,
        ).toBe(-265000);

        expect(
          result.identifiedDriverImpact,
        ).toBe(-265000);

        expect(
          result.unexplainedMovement,
        ).toBe(0);

        expect(
          result.status,
        ).toBe("RECONCILED");

        expect(
          result.drivers,
        ).toHaveLength(4);
      },
    );

    it(
      "flags unexplained movement when the forecast change does not reconcile",
      () => {
        const result =
          reconcileMovement({
            currency: "TRY",

            previousClosingLiquidity:
              1000000,

            currentClosingLiquidity:
              690000,

            comparison:
              createComparison(),
          });

        expect(
          result.forecastMovement,
        ).toBe(-310000);

        expect(
          result.identifiedDriverImpact,
        ).toBe(-265000);

        expect(
          result.unexplainedMovement,
        ).toBe(-45000);

        expect(
          result.status,
        ).toBe("UNEXPLAINED");
      },
    );

    it(
      "uses only drivers from the requested currency",
      () => {
        const comparison =
          createComparison();

        comparison.changes.push({
          stableId:
            "payables|EUR|TEST",

          changeType:
            "NEW_ITEM",

          datasetType:
            "payables",

          counterpartyName:
            "Euro Supplier",

          documentNo:
            "EUR-001",

          currency:
            "EUR",

          previousAmount:
            null,

          currentAmount:
            100000,

          amountDelta:
            100000,

          previousDate:
            null,

          currentDate:
            "2026-08-28",

          dateShiftDays:
            null,

          liquidityImpact:
            -100000,
        });

        const result =
          reconcileMovement({
            currency: "TRY",

            previousClosingLiquidity:
              1000000,

            currentClosingLiquidity:
              735000,

            comparison,
          });

        expect(
          result.identifiedDriverImpact,
        ).toBe(-265000);

        expect(
          result.status,
        ).toBe("RECONCILED");
      },
    );

    it(
      "respects the configured reconciliation tolerance",
      () => {
        const result =
          reconcileMovement({
            currency: "TRY",

            previousClosingLiquidity:
              1000000,

            currentClosingLiquidity:
              734999.99,

            comparison:
              createComparison(),

            tolerance: 0.01,
          });

        expect(
          result.unexplainedMovement,
        ).toBe(-0.01);

        expect(
          result.status,
        ).toBe("RECONCILED");
      },
    );

    it(
      "rejects an invalid tolerance",
      () => {
        expect(() =>
          reconcileMovement({
            currency: "TRY",

            previousClosingLiquidity:
              1000000,

            currentClosingLiquidity:
              735000,

            comparison:
              createComparison(),

            tolerance: -1,
          }),
        ).toThrow(
          "tolerance must be a non-negative finite number.",
        );
      },
    );
  },
);
