import { describe, expect, it } from "vitest";

import type { CanonicalTreasuryRecord } from "../canonical/normalize-records";
import type { TreasuryDataset } from "../treasury/build-liquidity-forecast";
import type { AlmPosition } from "./positions";
import { buildDebtFunding } from "./build-debt-funding";

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
    availableAmount: 300,
    restrictedAmount: 0,
    committedAmount: 500,
    drawnAmount: 200,
    maturityDate: "2027-01-31",
    interestType: "Fixed",
    annualInterestRate: 30,
    createdAt: "2026-08-14",
    ...overrides,
  };
}

const datasets: TreasuryDataset[] = [
  {
    type: "debt",
    records: [
      record({
        debtId: "DEBT-1",
        lender: "Bank A",
        outstandingPrincipal: 600,
        maturityDate: "2027-06-30",
      }),
      record({
        sourceRowNumber: 2,
        debtId: "DEBT-2",
        lender: "Bank B",
        outstandingPrincipal: 900,
        maturityDate: "2028-10-15",
      }),
    ],
  },
];

describe("buildDebtFunding", () => {
  it("builds debt, facility, and refinancing metrics", () => {
    const result = buildDebtFunding({
      datasets,
      positions: [facility()],
      currency: "try",
      asOfDate: "2026-08-14",
    });

    expect(result.currency).toBe("TRY");
    expect(result.debtOutstanding).toBe(1_700);
    expect(result.debtDue12M).toBe(800);
    expect(result.debtDue24M).toBe(800);
    expect(result.debtDue36M).toBe(1_700);
    expect(result.committedFacilities).toBe(500);
    expect(result.drawnFacilities).toBe(200);
    expect(result.availableFacilities).toBe(300);
    expect(result.facilityUtilizationPercent).toBe(40);
    expect(result.refinancingNeed12M).toBe(500);
    expect(result.largestMaturityWall).toBe(900);
  });

  it("does not double count a facility already represented as debt", () => {
    const result = buildDebtFunding({
      datasets,
      positions: [facility({ referenceId: "DEBT-1" })],
      currency: "TRY",
      asOfDate: "2026-08-14",
    });

    expect(result.debtOutstanding).toBe(1_500);
    expect(result.ignoredItems).toContainEqual({
      sourceType: "facility",
      referenceId: "DEBT-1",
      reason: "DUPLICATE_DEBT_REFERENCE",
    });
  });

  it("does not deduplicate against an unusable debt record", () => {
    const result = buildDebtFunding({
      datasets: [
        {
          type: "debt",
          records: [
            record({
              debtId: "FAC-1",
              maturityDate: "2027-01-31",
            }),
          ],
        },
      ],
      positions: [facility()],
      currency: "TRY",
      asOfDate: "2026-08-14",
    });

    expect(result.debtOutstanding).toBe(200);
    expect(result.debtDue12M).toBe(200);
    expect(result.ignoredItems).toContainEqual({
      sourceType: "debt",
      referenceId: "FAC-1",
      reason: "MISSING_OUTSTANDING",
    });
  });

  it("builds lender concentration from debt and available capacity", () => {
    const result = buildDebtFunding({
      datasets,
      positions: [facility()],
      currency: "TRY",
      asOfDate: "2026-08-14",
    });

    expect(result.lenders.map((lender) => lender.lender)).toEqual([
      "Bank B",
      "Bank A",
      "Bank C",
    ]);
    expect(result.lenders[2]).toMatchObject({
      debtOutstanding: 200,
      committedFacilities: 500,
      availableFacilities: 300,
      fundingCapacity: 500,
    });
    expect(result.top3LenderConcentration).toBeCloseTo(100);
  });

  it("places debt after 36 months in the tail bucket", () => {
    const result = buildDebtFunding({
      datasets: [
        {
          type: "debt",
          records: [
            record({
              debtId: "LONG-1",
              outstandingPrincipal: 250,
              maturityDate: "2030-01-01",
            }),
          ],
        },
      ],
      currency: "TRY",
      asOfDate: "2026-08-14",
    });

    expect(result.maturityBuckets.at(-1)).toMatchObject({
      id: "over36m",
      maturingDebt: 250,
    });
    expect(result.debtDue36M).toBe(0);
    expect(result.largestMaturityWallBucketId).toBeNull();
  });

  it("discloses records excluded for missing fields or currency", () => {
    const result = buildDebtFunding({
      datasets: [
        {
          type: "debt",
          records: [
            record({ debtId: "NO-AMOUNT", maturityDate: "2027-01-01" }),
            record({
              sourceRowNumber: 2,
              debtId: "NO-DATE",
              outstandingPrincipal: 100,
            }),
            record({
              sourceRowNumber: 3,
              debtId: "EUR-1",
              currency: "EUR",
              outstandingPrincipal: 100,
              maturityDate: "2027-01-01",
            }),
          ],
        },
      ],
      currency: "TRY",
      asOfDate: "2026-08-14",
    });

    expect(result.ignoredItems.map((item) => item.reason)).toEqual([
      "MISSING_OUTSTANDING",
      "MISSING_MATURITY",
      "CURRENCY_MISMATCH",
    ]);
    expect(result.debtOutstanding).toBe(100);
    expect(result.debtDue36M).toBe(0);
  });
});
