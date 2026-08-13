import { describe, expect, it } from "vitest";

import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";

import { buildCfoMetrics } from "./build-cfo-metrics";

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

describe("CFO Metrics Engine", () => {
  it("calculates the core CFO liquidity metrics", () => {
    const payables = [
      createRecord({
        currency: "TRY",
        amount: 250000,
        dueDate: "2026-08-20",
      }),

      createRecord({
        sourceRowNumber: 3,
        currency: "TRY",
        amount: 480000,
        dueDate: "2026-08-22",
      }),

      createRecord({
        sourceRowNumber: 4,
        currency: "TRY",
        amount: 175000,
        dueDate: "2026-08-25",
      }),
    ];

    const result = buildCfoMetrics({
      datasets: [
        {
          type: "payables",
          records: payables,
        },
      ],

      currency: "TRY",

      asOfDate: "2026-08-20",

      openingLiquidity: 1000000,

      unusedCommittedFacilities: 200000,
    });

    expect(
      result.availableLiquidity,
    ).toBe(1200000);

    expect(
      result.minimumForecastCash,
    ).toBe(95000);

    expect(
      result.minimumForecastCashDate,
    ).toBe("2026-08-25");

    expect(
      result.liquidityHeadroom,
    ).toBe(295000);

    expect(
      result.fundingNeed30D,
    ).toBe(0);

    expect(
      result.fundingNeed90D,
    ).toBe(0);
  });

  it("distinguishes 30D funding need from 90D funding need", () => {
    const payables = [
      createRecord({
        currency: "TRY",
        amount: 400000,
        dueDate: "2026-09-28",
      }),
    ];

    const result = buildCfoMetrics({
      datasets: [
        {
          type: "payables",
          records: payables,
        },
      ],

      currency: "TRY",

      asOfDate: "2026-08-20",

      openingLiquidity: 100000,

      unusedCommittedFacilities: 100000,
    });

    expect(
      result.fundingNeed30D,
    ).toBe(0);

    expect(
      result.fundingNeed90D,
    ).toBe(200000);

    expect(
      result.liquidityHeadroom,
    ).toBe(-200000);
  });

  it("treats overdue receivables as receivables at risk", () => {
    const receivables = [
      createRecord({
        currency: "TRY",
        amount: 250000,
        dueDate: "2026-08-10",
      }),

      createRecord({
        sourceRowNumber: 3,
        currency: "TRY",
        amount: 175000,
        dueDate: "2026-08-20",
      }),

      createRecord({
        sourceRowNumber: 4,
        currency: "TRY",
        amount: 300000,
        dueDate: "2026-08-25",
      }),
    ];

    const result = buildCfoMetrics({
      datasets: [
        {
          type: "receivables",
          records: receivables,
        },
      ],

      currency: "TRY",

      asOfDate: "2026-08-20",

      openingLiquidity: 1000000,

      unusedCommittedFacilities: 0,
    });

    expect(
      result.receivablesAtRisk,
    ).toBe(250000);
  });

  it("calculates debt due inside the 90 day horizon", () => {
    const debt = [
      createRecord({
        currency: "TRY",
        nextPaymentDate: "2026-08-25",
        nextPaymentAmount: 300000,
      }),

      createRecord({
        sourceRowNumber: 3,
        currency: "TRY",
        nextPaymentDate: "2026-11-17",
        nextPaymentAmount: 450000,
      }),

      createRecord({
        sourceRowNumber: 4,
        currency: "TRY",
        nextPaymentDate: "2026-11-18",
        nextPaymentAmount: 900000,
      }),
    ];

    const result = buildCfoMetrics({
      datasets: [
        {
          type: "debt",
          records: debt,
        },
      ],

      currency: "TRY",

      asOfDate: "2026-08-20",

      openingLiquidity: 2000000,

      unusedCommittedFacilities: 0,
    });

    expect(
      result.debtDue90D,
    ).toBe(750000);
  });
});