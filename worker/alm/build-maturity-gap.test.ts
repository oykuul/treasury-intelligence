import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  CanonicalTreasuryRecord,
} from "../canonical/normalize-records";
import type {
  TreasuryDataset,
} from "../treasury/build-liquidity-forecast";

import type {
  AlmPosition,
} from "./positions";
import {
  buildMaturityGap,
} from "./build-maturity-gap";

function record(
  overrides:
    Partial<CanonicalTreasuryRecord>,
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
  overrides:
    Partial<AlmPosition> = {},
): AlmPosition {
  return {
    id: "position-1",
    organizationId: "org_demo",
    positionType: "facility",
    entity: "1000",
    counterpartyName: "Bank A",
    referenceId: "FAC-1",
    currency: "TRY",
    asOfDate: "2026-08-14",
    availableAmount: 300,
    restrictedAmount: 0,
    committedAmount: 500,
    drawnAmount: 200,
    maturityDate: "2027-02-14",
    interestType: "Fixed",
    annualInterestRate: 30,
    createdAt: "2026-08-14",
    ...overrides,
  };
}

const datasets:
  TreasuryDataset[] = [
    {
      type: "receivables",
      records: [
        record({
          documentNo: "REC-OVERDUE",
          amount: 100,
          dueDate: "2026-08-13",
        }),
        record({
          documentNo: "REC-1",
          amount: 500,
          dueDate: "2026-08-20",
        }),
      ],
    },
    {
      type: "payables",
      records: [
        record({
          documentNo: "PAY-1",
          amount: 900,
          dueDate: "2026-08-30",
        }),
      ],
    },
    {
      type: "debt",
      records: [
        record({
          debtId: "DEBT-1",
          lender: "Bank B",
          nextPaymentDate:
            "2026-09-20",
          nextPaymentAmount: 100,
          maturityDate:
            "2027-06-30",
          outstandingPrincipal: 600,
        }),
      ],
    },
  ];

describe(
  "buildMaturityGap",
  () => {
    it(
      "builds overdue and 12-month contractual buckets",
      () => {
        const result =
          buildMaturityGap({
            datasets,
            positions: [facility()],
            currency: "try",
            asOfDate: "2026-08-14",
            openingLiquidity: 1_000,
            availableFacilities: 300,
          });

        expect(result.currency)
          .toBe("TRY");
        expect(result.buckets)
          .toHaveLength(14);
        expect(result.buckets[0])
          .toMatchObject({
            id: "overdue",
            assets: 100,
            liabilities: 0,
            cumulativeGap: 1_100,
          });
        expect(result.buckets[1])
          .toMatchObject({
            id: "M01",
            assets: 500,
            liabilities: 900,
            netGap: -400,
            cumulativeGap: 700,
          });
        expect(result.buckets[2])
          .toMatchObject({
            id: "M02",
            liabilities: 100,
            cumulativeGap: 600,
          });
        expect(result.totalAssets12M)
          .toBe(600);
        expect(result.totalLiabilities12M)
          .toBe(1_800);
        expect(result.closingCumulativeGap12M)
          .toBe(-200);
        expect(result.fundingNeedBeforeFacilities)
          .toBe(200);
        expect(result.residualFundingNeed)
          .toBe(0);
      },
    );

    it(
      "places maturities after 12 months in a separate bucket",
      () => {
        const result =
          buildMaturityGap({
            datasets: [],
            positions: [
              facility({
                maturityDate:
                  "2027-08-15",
              }),
            ],
            currency: "TRY",
            asOfDate: "2026-08-14",
            openingLiquidity: 100,
            availableFacilities: 0,
          });

        expect(
          result.buckets.at(-1),
        ).toMatchObject({
          id: "over12m",
          liabilities: 200,
        });
        expect(
          result.totalLiabilities12M,
        ).toBe(0);
      },
    );

    it(
      "uses one amount when debt payment and maturity share a date",
      () => {
        const result =
          buildMaturityGap({
            datasets: [
              {
                type: "debt",
                records: [
                  record({
                    debtId: "DEBT-2",
                    nextPaymentDate:
                      "2026-09-01",
                    nextPaymentAmount: 80,
                    maturityDate:
                      "2026-09-01",
                    outstandingPrincipal: 500,
                  }),
                ],
              },
            ],
            currency: "TRY",
            asOfDate: "2026-08-14",
            openingLiquidity: 0,
            availableFacilities: 0,
          });

        expect(
          result.buckets[1]
            .liabilities,
        ).toBe(500);
        expect(
          result.buckets[1]
            .flows,
        ).toHaveLength(1);
      },
    );

    it(
      "does not double count a drawn facility already present as debt",
      () => {
        const result =
          buildMaturityGap({
            datasets: [
              {
                type: "debt",
                records: [
                  record({
                    debtId: "FAC-1",
                    maturityDate:
                      "2027-02-14",
                    outstandingPrincipal: 200,
                  }),
                ],
              },
            ],
            positions: [facility()],
            currency: "TRY",
            asOfDate: "2026-08-14",
            openingLiquidity: 0,
            availableFacilities: 0,
          });

        expect(
          result.buckets.flatMap(
            (bucket) =>
              bucket.flows,
          ),
        ).toHaveLength(1);
        expect(
          result.ignoredItems,
        ).toContainEqual({
          sourceType: "facility",
          referenceId: "FAC-1",
          reason:
            "DUPLICATE_DEBT_REFERENCE",
        });
      },
    );
  },
);
