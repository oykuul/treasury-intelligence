import {
  describe,
  expect,
  it,
} from "vitest";

import {
  loadTreasuryDatasets,
} from "./load-treasury-datasets";

function createDatabase(
  importRows:
    Record<string, unknown>[],
  recordRows:
    Record<string, unknown>[],
): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async all() {
              return {
                success: true,

                results:
                  sql.includes(
                    "FROM imports",
                  )
                    ? importRows
                    : recordRows,
              };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe(
  "loadTreasuryDatasets",
  () => {
    it(
      "loads canonical records in requested import order",
      async () => {
        const database =
          createDatabase(
            [
              {
                id: "rec-id",
                sourceType:
                  "receivables",
              },
              {
                id: "pay-id",
                sourceType:
                  "payables",
              },
            ],
            [
              {
                importId: "pay-id",
                sourceRowNumber: 2,
                currency: "TRY",
                amount: 100,
                dueDate:
                  "2026-08-15",
              },
              {
                importId: "rec-id",
                sourceRowNumber: 2,
                currency: "TRY",
                amount: 200,
                dueDate:
                  "2026-08-16",
              },
            ],
          );

        const result =
          await loadTreasuryDatasets(
            database,
            "org_demo",
            [
              "pay-id",
              "rec-id",
            ],
          );

        expect(
          result.map(
            (dataset) =>
              dataset.type,
          ),
        ).toEqual([
          "payables",
          "receivables",
        ]);

        expect(
          result[0].records[0]
            .amount,
        ).toBe(100);

        expect(
          result[1].records[0]
            .amount,
        ).toBe(200);
      },
    );

    it(
      "rejects duplicate source types",
      async () => {
        const database =
          createDatabase(
            [
              {
                id: "pay-id-1",
                sourceType:
                  "payables",
              },
              {
                id: "pay-id-2",
                sourceType:
                  "payables",
              },
            ],
            [],
          );

        await expect(
          loadTreasuryDatasets(
            database,
            "org_demo",
            [
              "pay-id-1",
              "pay-id-2",
            ],
          ),
        ).rejects.toThrow(
          "Only one import per sourceType is allowed: payables.",
        );
      },
    );
  },
);
