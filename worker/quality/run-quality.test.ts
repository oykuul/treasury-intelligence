import { describe, expect, it } from "vitest";

import { parseCsvText } from "../ingestion/csv";
import { detectColumns } from "../ingestion/detect-columns";
import { runDataQuality } from "./run-quality";

function buildTestCsv(): string {
  const rows: string[] = [
    "BUKRS,LIFNR,NAME1,ZFBDT,DMBTR,WAERS,BELNR",
  ];

  for (let index = 0; index < 120; index += 1) {
    let dayOffset: number;

    // Bilerek 11–20 Ağustos arasını boş bırakıyoruz.
    if (index < 10) {
      dayOffset = index;
    } else {
      dayOffset = index + 10;
    }

    const date = new Date(
      Date.UTC(2026, 7, 1 + dayOffset),
    );

    const formattedDate = [
      String(date.getUTCDate()).padStart(2, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      date.getUTCFullYear(),
    ].join(".");

    let dueDate = formattedDate;
    let amount = String(
      100_000 + (index % 25) * 10_000,
    );

    // Unreadable date
    if (index === 20) {
      dueDate = "31.13.2026";
    }

    // Negative amount
    if (index === 30) {
      amount = "-250000";
    }

    // Extreme unit anomaly
    if (index === 110) {
      amount = "950000000";
    }

    rows.push(
      [
        "1000",
        `V${10000 + index}`,
        `Supplier ${index}`,
        dueDate,
        amount,
        "TRY",
        `19${100000 + index}`,
      ].join(","),
    );
  }

  // Exact duplicate:
  // row 6'yı tekrar ekliyoruz.
  rows.push(rows[5]);

  return rows.join("\n");
}

describe("Data Quality Engine", () => {
  it("detects all five core quality rules", () => {
    const csv = buildTestCsv();

    const parsed = parseCsvText(csv);

    const mappings = detectColumns(
      parsed.headers,
      parsed.rows,
    );

    const result = runDataQuality(
      parsed,
      mappings,
    );

    expect(result.summary.duplicateCount).toBe(1);

    expect(
      result.summary.unreadableDateCount,
    ).toBe(1);

    expect(
      result.summary.negativeAmountCount,
    ).toBe(1);

    expect(
      result.summary.timeSeriesGapCount,
    ).toBeGreaterThanOrEqual(1);

    expect(
      result.summary.unitAnomalyCount,
    ).toBe(1);

    expect(
      result.summary.criticalCount,
    ).toBe(2);

    expect(
      result.summary.warningCount,
    ).toBe(2);

    expect(
      result.summary.infoCount,
    ).toBeGreaterThanOrEqual(1);

    expect(
      result.issues.some(
        (issue) =>
          issue.issueType === "DUPLICATE",
      ),
    ).toBe(true);

    expect(
      result.issues.some(
        (issue) =>
          issue.issueType ===
          "UNREADABLE_DATE",
      ),
    ).toBe(true);

    expect(
      result.issues.some(
        (issue) =>
          issue.issueType ===
          "NEGATIVE_AMOUNT",
      ),
    ).toBe(true);

    expect(
      result.issues.some(
        (issue) =>
          issue.issueType ===
          "TIME_SERIES_GAP",
      ),
    ).toBe(true);

    expect(
      result.issues.some(
        (issue) =>
          issue.issueType ===
          "UNIT_ANOMALY",
      ),
    ).toBe(true);
  });
});