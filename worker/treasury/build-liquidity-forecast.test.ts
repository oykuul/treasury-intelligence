import { describe, expect, it } from "vitest";

import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";
import { buildLiquidityForecast } from "./build-liquidity-forecast";

function createRecord(
  overrides: Partial<CanonicalTreasuryRecord>,
): CanonicalTreasuryRecord {
  return {
    sourceRowNumber: 2,

    company: null,

    counterpartyId: null,
    counterpartyName: null,

    bank: null,
    account: null,

    currency: null,
    amount: null,
    debitCredit: null,

    documentNo: null,
    documentType: null,

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

describe("Liquidity Forecast Engine", () => {
  it("builds a daily liquidity curve from payables", () => {
    const records: CanonicalTreasuryRecord[] = [
      createRecord({
        sourceRowNumber: 2,
        counterpartyName: "Atlas Otomotiv",
        documentNo: "190001",
        currency: "TRY",
        amount: 250000,
        dueDate: "2026-08-20",
      }),

      createRecord({
        sourceRowNumber: 3,
        counterpartyName: "Marmara Lojistik",
        documentNo: "190002",
        currency: "TRY",
        amount: 480000,
        dueDate: "2026-08-22",
      }),

      createRecord({
        sourceRowNumber: 4,
        counterpartyName: "Nova Teknoloji",
        documentNo: "190003",
        currency: "TRY",
        amount: 175000,
        dueDate: "2026-08-25",
      }),
    ];

    const result = buildLiquidityForecast({
      datasets: [
        {
          type: "payables",
          records,
        },
      ],

      currency: "TRY",
      openingLiquidity: 1000000,

      startDate: "2026-08-20",
      endDate: "2026-08-25",
    });

    expect(result.currency).toBe("TRY");

    expect(result.totalInflows).toBe(0);
    expect(result.totalOutflows).toBe(905000);
    expect(result.netCashFlow).toBe(-905000);

    expect(result.minimumLiquidity).toBe(95000);

    expect(
      result.minimumLiquidityDate,
    ).toBe("2026-08-25");

    expect(result.fundingNeed).toBe(0);

    expect(result.days).toHaveLength(6);

    expect(result.days[0]).toMatchObject({
      date: "2026-08-20",
      inflow: 0,
      outflow: 250000,
      netFlow: -250000,
      openingLiquidity: 1000000,
      closingLiquidity: 750000,
    });

    expect(result.days[2]).toMatchObject({
      date: "2026-08-22",
      inflow: 0,
      outflow: 480000,
      netFlow: -480000,
      openingLiquidity: 750000,
      closingLiquidity: 270000,
    });

    expect(result.days[5]).toMatchObject({
      date: "2026-08-25",
      inflow: 0,
      outflow: 175000,
      netFlow: -175000,
      openingLiquidity: 270000,
      closingLiquidity: 95000,
    });

    expect(
      result.ignoredRecords,
    ).toHaveLength(0);
  });

  it("calculates funding need when liquidity becomes negative", () => {
    const records: CanonicalTreasuryRecord[] = [
      createRecord({
        currency: "TRY",
        amount: 700000,
        dueDate: "2026-08-20",
      }),

      createRecord({
        sourceRowNumber: 3,
        currency: "TRY",
        amount: 600000,
        dueDate: "2026-08-21",
      }),
    ];

    const result = buildLiquidityForecast({
      datasets: [
        {
          type: "payables",
          records,
        },
      ],

      currency: "TRY",
      openingLiquidity: 1000000,

      startDate: "2026-08-20",
      endDate: "2026-08-21",
    });

    expect(
      result.totalOutflows,
    ).toBe(1300000);

    expect(
      result.minimumLiquidity,
    ).toBe(-300000);

    expect(
      result.minimumLiquidityDate,
    ).toBe("2026-08-21");

    expect(
      result.fundingNeed,
    ).toBe(300000);
  });

  it("combines receivables and payables deterministically", () => {
    const payables: CanonicalTreasuryRecord[] = [
      createRecord({
        currency: "TRY",
        amount: 400000,
        dueDate: "2026-08-20",
      }),
    ];

    const receivables: CanonicalTreasuryRecord[] = [
      createRecord({
        sourceRowNumber: 10,
        currency: "TRY",
        amount: 250000,
        dueDate: "2026-08-20",
      }),
    ];

    const result = buildLiquidityForecast({
      datasets: [
        {
          type: "payables",
          records: payables,
        },

        {
          type: "receivables",
          records: receivables,
        },
      ],

      currency: "TRY",
      openingLiquidity: 500000,

      startDate: "2026-08-20",
      endDate: "2026-08-20",
    });

    expect(
      result.totalInflows,
    ).toBe(250000);

    expect(
      result.totalOutflows,
    ).toBe(400000);

    expect(
      result.netCashFlow,
    ).toBe(-150000);

    expect(result.days[0]).toMatchObject({
      date: "2026-08-20",

      inflow: 250000,
      outflow: 400000,

      netFlow: -150000,

      openingLiquidity: 500000,
      closingLiquidity: 350000,
    });
  });

  it("uses next payment fields for debt cash flows", () => {
    const debt: CanonicalTreasuryRecord[] = [
      createRecord({
        sourceRowNumber: 20,

        currency: "TRY",

        debtId: "LOAN-001",
        lender: "Example Bank",

        nextPaymentDate: "2026-08-24",
        nextPaymentAmount: 300000,
      }),
    ];

    const result = buildLiquidityForecast({
      datasets: [
        {
          type: "debt",
          records: debt,
        },
      ],

      currency: "TRY",
      openingLiquidity: 500000,

      startDate: "2026-08-24",
      endDate: "2026-08-24",
    });

    expect(
      result.totalInflows,
    ).toBe(0);

    expect(
      result.totalOutflows,
    ).toBe(300000);

    expect(result.days[0]).toMatchObject({
      date: "2026-08-24",

      outflow: 300000,
      netFlow: -300000,

      openingLiquidity: 500000,
      closingLiquidity: 200000,
    });

    expect(
      result.fundingNeed,
    ).toBe(0);
  });

  it("does not mix currencies into the same liquidity forecast", () => {
    const records: CanonicalTreasuryRecord[] = [
      createRecord({
        sourceRowNumber: 2,
        currency: "TRY",
        amount: 100000,
        dueDate: "2026-08-20",
      }),

      createRecord({
        sourceRowNumber: 3,
        currency: "EUR",
        amount: 50000,
        dueDate: "2026-08-20",
      }),
    ];

    const result = buildLiquidityForecast({
      datasets: [
        {
          type: "payables",
          records,
        },
      ],

      currency: "TRY",
      openingLiquidity: 500000,

      startDate: "2026-08-20",
      endDate: "2026-08-20",
    });

    expect(
      result.totalOutflows,
    ).toBe(100000);

    expect(
      result.days[0].closingLiquidity,
    ).toBe(400000);

    expect(
      result.ignoredRecords,
    ).toEqual([
      {
        sourceRowNumber: 3,
        datasetType: "payables",
        reason: "CURRENCY_MISMATCH",
      },
    ]);
  });

  it("includes opening liquidity when calculating the minimum cash position", () => {
    const receivables: CanonicalTreasuryRecord[] = [
      createRecord({
        currency: "TRY",
        amount: 50000,
        dueDate: "2026-08-20",
      }),
    ];

    const result = buildLiquidityForecast({
      datasets: [
        {
          type: "receivables",
          records: receivables,
        },
      ],

      currency: "TRY",
      openingLiquidity: 100000,

      startDate: "2026-08-20",
      endDate: "2026-08-20",
    });

    expect(
      result.days[0].closingLiquidity,
    ).toBe(150000);

    expect(
      result.minimumLiquidity,
    ).toBe(100000);

    expect(
      result.minimumLiquidityDate,
    ).toBe("2026-08-20");

    expect(
      result.fundingNeed,
    ).toBe(0);
  });
});