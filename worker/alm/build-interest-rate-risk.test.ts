import { describe, expect, it } from "vitest";

import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";
import type { TreasuryDataset } from "../treasury/build-liquidity-forecast";
import type { AlmPosition } from "./positions";
import { buildInterestRateRisk } from "./build-interest-rate-risk";

function record(
  overrides: Partial<CanonicalTreasuryRecord>,
): CanonicalTreasuryRecord {
  return {
    sourceRowNumber: 1,
    company: "1000",
    fiscalYear: null,
    counterpartyId: null,
    counterpartyName: null,
    bank: null,
    account: null,
    currency: "TRY",
    amount: null,
    debitCredit: null,
    documentNo: null,
    lineItemNo: null,
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

function facility(
  overrides: Partial<AlmPosition> = {},
): AlmPosition {
  return {
    id: "position-1",
    organizationId: "org_demo",
    positionType: "facility",
    entity: "1000",
    counterpartyName: "Bank C",
    referenceId: "FAC-1",
    currency: "TRY",
    asOfDate: "2026-08-14",
    availableAmount: 50,
    restrictedAmount: 0,
    committedAmount: 100,
    drawnAmount: 50,
    maturityDate: "2027-01-31",
    interestType: "Floating",
    annualInterestRate: 24,
    createdAt: "2026-08-14",
    ...overrides,
  };
}

const datasets: TreasuryDataset[] = [
  {
    type: "debt",
    records: [
      record({
        debtId: "FIXED-12M",
        lender: "Bank A",
        outstandingPrincipal: 100,
        interestType: "Fixed",
        annualInterestRate: 20,
        maturityDate: "2027-02-01",
      }),
      record({
        sourceRowNumber: 2,
        debtId: "FLOATING",
        lender: "Bank B",
        outstandingPrincipal: 200,
        interestType: "Variable",
        annualInterestRate: 25,
        maturityDate: "2028-01-01",
      }),
      record({
        sourceRowNumber: 3,
        debtId: "FIXED-LONG",
        lender: "Bank A",
        outstandingPrincipal: 300,
        interestType: "Sabit",
        annualInterestRate: 30,
        maturityDate: "2028-10-15",
      }),
    ],
  },
];

describe("buildInterestRateRisk", () => {
  it("builds the fixed, floating, repricing, and sensitivity metrics", () => {
    const result = buildInterestRateRisk({
      datasets,
      positions: [facility()],
      currency: "try",
      asOfDate: "2026-08-14",
    });

    expect(result.totalInterestBearingDebt).toBe(650);
    expect(result.fixedRateDebt).toBe(400);
    expect(result.floatingRateDebt).toBe(250);
    expect(result.fixedRefinancingExposure12M).toBe(100);
    expect(result.repricingExposure12M).toBe(350);
    expect(result.repricingGap12M).toBe(-350);
    expect(result.currentAnnualInterestExpense).toBe(172);
    expect(result.weightedAverageRatePercent).toBeCloseTo(26.4615);
    expect(result.sensitivityScenarios[0]).toMatchObject({
      shockBps: 100,
      annualizedInterestIncrease: 3.5,
      shockedAnnualInterestExpense: 175.5,
    });
  });

  it("does not double count a drawn facility already represented as debt", () => {
    const result = buildInterestRateRisk({
      datasets,
      positions: [facility({ referenceId: "FIXED-12M" })],
      currency: "TRY",
      asOfDate: "2026-08-14",
    });

    expect(result.totalInterestBearingDebt).toBe(600);
    expect(result.dataIssues).toContainEqual({
      sourceType: "facility",
      referenceId: "FIXED-12M",
      reason: "DUPLICATE_DEBT_REFERENCE",
    });
  });

  it("keeps missing-rate debt in exposure while disclosing coverage", () => {
    const result = buildInterestRateRisk({
      datasets: [
        {
          type: "debt",
          records: [
            record({
              debtId: "NO-RATE",
              lender: "Bank A",
              outstandingPrincipal: 100,
              interestType: "Değişken",
              maturityDate: "2027-01-01",
            }),
          ],
        },
      ],
      currency: "TRY",
      asOfDate: "2026-08-14",
    });

    expect(result.floatingRateDebt).toBe(100);
    expect(result.repricingExposure12M).toBe(100);
    expect(result.rateCoveragePercent).toBe(0);
    expect(result.currentAnnualInterestExpense).toBe(0);
    expect(result.dataIssues[0].reason).toBe("MISSING_INTEREST_RATE");
  });

  it("separates debt with an unknown interest type", () => {
    const result = buildInterestRateRisk({
      datasets: [
        {
          type: "debt",
          records: [
            record({
              debtId: "UNKNOWN",
              outstandingPrincipal: 80,
              annualInterestRate: 18,
              maturityDate: "2027-01-01",
            }),
          ],
        },
      ],
      currency: "TRY",
      asOfDate: "2026-08-14",
    });

    expect(result.unclassifiedRateDebt).toBe(80);
    expect(result.repricingExposure12M).toBe(0);
    expect(result.currentAnnualInterestExpense).toBe(14.4);
    expect(result.dataIssues[0].reason).toBe("MISSING_INTEREST_TYPE");
  });

  it("places long fixed debt after the 12-month repricing horizon", () => {
    const result = buildInterestRateRisk({
      datasets: [
        {
          type: "debt",
          records: [
            record({
              debtId: "LONG-FIXED",
              outstandingPrincipal: 250,
              interestType: "Fixed",
              annualInterestRate: 20,
              maturityDate: "2030-01-01",
            }),
          ],
        },
      ],
      currency: "TRY",
      asOfDate: "2026-08-14",
    });

    expect(result.repricingBuckets.at(-1)).toMatchObject({
      id: "over12m",
      fixedRefinancingAmount: 250,
      repricingAmount: 250,
    });
    expect(result.repricingExposure12M).toBe(0);
  });

  it("discloses excluded currency and missing-outstanding records", () => {
    const result = buildInterestRateRisk({
      datasets: [
        {
          type: "debt",
          records: [
            record({
              debtId: "NO-AMOUNT",
              interestType: "Fixed",
            }),
            record({
              sourceRowNumber: 2,
              debtId: "EUR-1",
              currency: "EUR",
              outstandingPrincipal: 100,
              interestType: "Floating",
            }),
          ],
        },
      ],
      currency: "TRY",
      asOfDate: "2026-08-14",
    });

    expect(result.totalInterestBearingDebt).toBe(0);
    expect(result.dataIssues.map((issue) => issue.reason)).toEqual([
      "MISSING_OUTSTANDING",
      "CURRENCY_MISMATCH",
    ]);
  });
});
