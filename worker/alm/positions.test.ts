import {
  describe,
  expect,
  it,
} from "vitest";

import {
  summarizeAlmPositions,
  validateAlmPosition,
  type AlmPosition,
} from "./positions";

function position(
  overrides:
    Partial<AlmPosition>,
): AlmPosition {
  return {
    id: "position-1",
    organizationId: "org_demo",
    positionType: "cash",
    entity: "1000",
    counterpartyName: "Bank A",
    referenceId: "TR-001",
    currency: "TRY",
    asOfDate: "2026-08-14",
    availableAmount: 100,
    restrictedAmount: 10,
    committedAmount: null,
    drawnAmount: null,
    maturityDate: null,
    interestType: null,
    annualInterestRate: null,
    createdAt: "2026-08-14",
    ...overrides,
  };
}

describe(
  "ALM positions",
  () => {
    it(
      "validates a cash position",
      () => {
        expect(
          validateAlmPosition({
            positionType: "cash",
            entity: "1000",
            counterpartyName:
              "Bank A",
            referenceId:
              "TR-001",
            currency: "try",
            asOfDate:
              "2026-08-14",
            availableAmount: 100,
          }),
        ).toMatchObject({
          positionType: "cash",
          currency: "TRY",
          availableAmount: 100,
          restrictedAmount: 0,
        });
      },
    );

    it(
      "derives available facility",
      () => {
        expect(
          validateAlmPosition({
            positionType:
              "facility",
            entity: "1000",
            counterpartyName:
              "Bank B",
            referenceId:
              "FAC-1",
            currency: "TRY",
            asOfDate:
              "2026-08-14",
            committedAmount: 500,
            drawnAmount: 125,
          }),
        ).toMatchObject({
          availableAmount: 375,
          committedAmount: 500,
          drawnAmount: 125,
        });
      },
    );

    it(
      "rejects facility overdraw",
      () => {
        expect(() =>
          validateAlmPosition({
            positionType:
              "facility",
            entity: "1000",
            counterpartyName:
              "Bank B",
            referenceId:
              "FAC-1",
            currency: "TRY",
            asOfDate:
              "2026-08-14",
            committedAmount: 100,
            drawnAmount: 125,
          }),
        ).toThrow(
          "drawnAmount cannot exceed committedAmount.",
        );
      },
    );

    it(
      "summarizes cash and facilities by currency",
      () => {
        const result =
          summarizeAlmPositions(
            [
              position({}),
              position({
                id: "facility-1",
                positionType:
                  "facility",
                availableAmount: 300,
                restrictedAmount: 0,
                committedAmount: 500,
                drawnAmount: 200,
              }),
              position({
                id: "eur-cash",
                currency: "EUR",
                availableAmount: 900,
              }),
            ],
            "try",
          );

        expect(result).toEqual({
          currency: "TRY",
          cashPositions: 1,
          facilityPositions: 1,
          availableCash: 100,
          restrictedCash: 10,
          committedFacilities: 500,
          drawnFacilities: 200,
          availableFacilities: 300,
          availableLiquidity: 400,
        });
      },
    );
  },
);
