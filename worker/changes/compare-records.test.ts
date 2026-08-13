import {
  describe,
  expect,
  it,
} from "vitest";

import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";

import {
  compareRecords,
  type ComparedTreasuryRecord,
} from "./compare-records";

function createRecord(
  overrides: Partial<CanonicalTreasuryRecord>,
): CanonicalTreasuryRecord {
  return {
    sourceRowNumber: 2,

    company: "1000",

    counterpartyId: null,
    counterpartyName: null,

    bank: null,
    account: null,

    currency: "TRY",
    amount: null,
    debitCredit: null,

    documentNo: null,
    documentType: "KR",

    postingDate: null,
    documentDate: null,
    dueDate: null,
    valueDate: null,

    description: null,
    assignment: null,
    reference: null,

    balance: null,
    restrictedAmount: null,

    debtId: null,
    lender: null,
    instrumentType: null,

    outstandingPrincipal: null,
    interestType: null,
    annualInterestRate: null,

    nextPaymentDate: null,
    nextPaymentAmount: null,
    maturityDate: null,

    ...overrides,
  };
}

describe(
  "What Changed Engine",
  () => {
    it(
      "detects amount, date, new and removed changes using stable IDs",
      () => {
        const previous: ComparedTreasuryRecord[] = [
          {
            datasetType: "payables",

            record: createRecord({
              sourceRowNumber: 2,

              counterpartyId:
                "V10001",

              counterpartyName:
                "Atlas Otomotiv",

              documentNo:
                "190001",

              amount:
                250000,

              dueDate:
                "2026-08-20",
            }),
          },

          {
            datasetType: "payables",

            record: createRecord({
              sourceRowNumber: 3,

              counterpartyId:
                "V10002",

              counterpartyName:
                "Marmara Lojistik",

              documentNo:
                "190002",

              amount:
                480000,

              dueDate:
                "2026-08-22",
            }),
          },

          {
            datasetType: "payables",

            record: createRecord({
              sourceRowNumber: 4,

              counterpartyId:
                "V10003",

              counterpartyName:
                "Nova Teknoloji",

              documentNo:
                "190003",

              amount:
                175000,

              dueDate:
                "2026-08-25",
            }),
          },
        ];

        const current: ComparedTreasuryRecord[] = [
          {
            datasetType: "payables",

            record: createRecord({
              sourceRowNumber: 20,

              counterpartyId:
                "V10001",

              counterpartyName:
                "Atlas Otomotiv",

              documentNo:
                "190001",

              amount:
                250000,

              dueDate:
                "2026-08-27",
            }),
          },

          {
            datasetType: "payables",

            record: createRecord({
              sourceRowNumber: 21,

              counterpartyId:
                "V10002",

              counterpartyName:
                "Marmara Lojistik",

              documentNo:
                "190002",

              amount:
                620000,

              dueDate:
                "2026-08-22",
            }),
          },

          {
            datasetType: "payables",

            record: createRecord({
              sourceRowNumber: 22,

              counterpartyId:
                "V10004",

              counterpartyName:
                "Yeni Supplier",

              documentNo:
                "190004",

              amount:
                300000,

              dueDate:
                "2026-08-28",
            }),
          },
        ];

        const result =
          compareRecords(
            previous,
            current,
          );

        expect(
          result.summary,
        ).toEqual({
          amountChanges: 1,
          dateShifts: 1,
          newItems: 1,
          removedItems: 1,

          totalLiquidityImpact:
            -265000,

          totalChanges: 4,
        });

        const amountChange =
          result.changes.find(
            (change) =>
              change.changeType ===
              "AMOUNT_CHANGED",
          );

        expect(
          amountChange,
        ).toMatchObject({
          changeType:
            "AMOUNT_CHANGED",

          counterpartyName:
            "Marmara Lojistik",

          documentNo:
            "190002",

          previousAmount:
            480000,

          currentAmount:
            620000,

          amountDelta:
            140000,

          liquidityImpact:
            -140000,
        });

        const dateShift =
          result.changes.find(
            (change) =>
              change.changeType ===
              "DATE_SHIFTED",
          );

        expect(
          dateShift,
        ).toMatchObject({
          changeType:
            "DATE_SHIFTED",

          counterpartyName:
            "Atlas Otomotiv",

          documentNo:
            "190001",

          previousDate:
            "2026-08-20",

          currentDate:
            "2026-08-27",

          dateShiftDays:
            7,

          liquidityImpact:
            0,
        });

        const newItem =
          result.changes.find(
            (change) =>
              change.changeType ===
              "NEW_ITEM",
          );

        expect(
          newItem,
        ).toMatchObject({
          changeType:
            "NEW_ITEM",

          counterpartyName:
            "Yeni Supplier",

          documentNo:
            "190004",

          previousAmount:
            null,

          currentAmount:
            300000,

          amountDelta:
            300000,

          liquidityImpact:
            -300000,
        });

        const removedItem =
          result.changes.find(
            (change) =>
              change.changeType ===
              "REMOVED_ITEM",
          );

        expect(
          removedItem,
        ).toMatchObject({
          changeType:
            "REMOVED_ITEM",

          counterpartyName:
            "Nova Teknoloji",

          documentNo:
            "190003",

          previousAmount:
            175000,

          currentAmount:
            null,

          amountDelta:
            -175000,

          liquidityImpact:
            175000,
        });
      },
    );

    it(
      "does not treat row number changes as new records when a stable document ID exists",
      () => {
        const previous: ComparedTreasuryRecord[] = [
          {
            datasetType: "payables",

            record: createRecord({
              sourceRowNumber: 2,

              counterpartyId:
                "V10001",

              counterpartyName:
                "Atlas Otomotiv",

              documentNo:
                "190001",

              amount:
                250000,

              dueDate:
                "2026-08-20",
            }),
          },
        ];

        const current: ComparedTreasuryRecord[] = [
          {
            datasetType: "payables",

            record: createRecord({
              sourceRowNumber: 900,

              counterpartyId:
                "V10001",

              counterpartyName:
                "Atlas Otomotiv",

              documentNo:
                "190001",

              amount:
                250000,

              dueDate:
                "2026-08-20",
            }),
          },
        ];

        const result =
          compareRecords(
            previous,
            current,
          );

        expect(
          result.summary.totalChanges,
        ).toBe(0);

        expect(
          result.changes,
        ).toEqual([]);
      },
    );

    it(
      "uses the opposite liquidity sign for receivables",
      () => {
        const previous: ComparedTreasuryRecord[] = [
          {
            datasetType:
              "receivables",

            record: createRecord({
              counterpartyId:
                "C10001",

              counterpartyName:
                "Customer A",

              documentNo:
                "AR-001",

              documentType:
                "DR",

              amount:
                100000,

              dueDate:
                "2026-08-25",
            }),
          },
        ];

        const current: ComparedTreasuryRecord[] = [
          {
            datasetType:
              "receivables",

            record: createRecord({
              counterpartyId:
                "C10001",

              counterpartyName:
                "Customer A",

              documentNo:
                "AR-001",

              documentType:
                "DR",

              amount:
                150000,

              dueDate:
                "2026-08-25",
            }),
          },
        ];

        const result =
          compareRecords(
            previous,
            current,
          );

        expect(
          result.summary
            .totalLiquidityImpact,
        ).toBe(50000);

        expect(
          result.changes[0],
        ).toMatchObject({
          changeType:
            "AMOUNT_CHANGED",

          amountDelta:
            50000,

          liquidityImpact:
            50000,
        });
      },
    );
  },
);

it(
  "keeps SAP line items separate when document number is shared",
  () => {
    const previous: ComparedTreasuryRecord[] = [
      {
        datasetType: "payables",

        record: createRecord({
          sourceRowNumber: 2,

          fiscalYear: "2026",
          documentNo: "190001",
          lineItemNo: "001",

          counterpartyId: "V10001",
          amount: 250000,
          dueDate: "2026-08-20",
        }),
      },

      {
        datasetType: "payables",

        record: createRecord({
          sourceRowNumber: 3,

          fiscalYear: "2026",
          documentNo: "190001",
          lineItemNo: "002",

          counterpartyId: "V10001",
          amount: 50000,
          dueDate: "2026-08-20",
        }),
      },
    ];

    const current: ComparedTreasuryRecord[] = [
      {
        datasetType: "payables",

        record: createRecord({
          sourceRowNumber: 500,

          fiscalYear: "2026",
          documentNo: "190001",
          lineItemNo: "001",

          counterpartyId: "V10001",
          amount: 275000,
          dueDate: "2026-08-20",
        }),
      },

      {
        datasetType: "payables",

        record: createRecord({
          sourceRowNumber: 501,

          fiscalYear: "2026",
          documentNo: "190001",
          lineItemNo: "002",

          counterpartyId: "V10001",
          amount: 50000,
          dueDate: "2026-08-20",
        }),
      },
    ];

    const result =
      compareRecords(
        previous,
        current,
      );

    expect(
      result.summary,
    ).toMatchObject({
      amountChanges: 1,
      newItems: 0,
      removedItems: 0,
      totalChanges: 1,
      totalLiquidityImpact: -25000,
    });

    expect(
      result.changes[0],
    ).toMatchObject({
      changeType: "AMOUNT_CHANGED",

      documentNo: "190001",

      previousAmount: 250000,
      currentAmount: 275000,

      amountDelta: 25000,

      liquidityImpact: -25000,
    });

    expect(
      result.changes[0].stableId,
    ).toContain(
      "SAP_ITEM|1000|2026|190001|001",
    );
  },
);
