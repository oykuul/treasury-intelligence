import { describe, expect, it } from "vitest";

import { normalizeRecords } from "../canonical/normalize-records";
import { parseCsvText } from "../ingestion/csv";
import { detectColumns } from "../ingestion/detect-columns";
import { reconcileImport } from "./reconcile-import";

const SAP_CSV = `BUKRS,LIFNR,NAME1,ZFBDT,DMBTR,WAERS,BELNR
1000,V10001,Atlas Otomotiv,20.08.2026,250000,TRY,190001
1000,V10002,Marmara Lojistik,22.08.2026,480000,TRY,190002
1000,V10003,Nova Teknoloji,25.08.2026,175000,TRY,190003`;

describe("Import Reconciliation", () => {
  it("passes when source and canonical records fully reconcile", () => {
    const parsed = parseCsvText(SAP_CSV);

    const mappings = detectColumns(
      parsed.headers,
      parsed.rows,
    );

    const canonicalRecords = normalizeRecords(
      parsed,
      mappings,
    );

    const result = reconcileImport(
      parsed,
      mappings,
      canonicalRecords,
    );

    expect(result.status).toBe("passed");

    expect(result.sourceRowCount).toBe(3);
    expect(result.canonicalRowCount).toBe(3);
    expect(result.rowCountDifference).toBe(0);

    expect(result.sourceAmountRows).toBe(3);
    expect(result.canonicalAmountRows).toBe(3);
    expect(result.amountRowsDifference).toBe(0);

    expect(result.currencyTotals).toEqual([
      {
        currency: "TRY",
        sourceAmount: 905000,
        canonicalAmount: 905000,
        difference: 0,
        matched: true,
      },
    ]);

    expect(result.issues).toHaveLength(0);
  });

  it("fails when a canonical record amount is changed", () => {
    const parsed = parseCsvText(SAP_CSV);

    const mappings = detectColumns(
      parsed.headers,
      parsed.rows,
    );

    const canonicalRecords = normalizeRecords(
      parsed,
      mappings,
    );

    canonicalRecords[0] = {
      ...canonicalRecords[0],
      amount: 999999,
    };

    const result = reconcileImport(
      parsed,
      mappings,
      canonicalRecords,
    );

    expect(result.status).toBe("failed");

    expect(result.currencyTotals).toEqual([
      {
        currency: "TRY",
        sourceAmount: 905000,
        canonicalAmount: 1654999,
        difference: 749999,
        matched: false,
      },
    ]);

    expect(
      result.issues.some((issue) =>
        issue.includes("Amount mismatch for TRY"),
      ),
    ).toBe(true);
  });

  it("fails when a canonical record is missing", () => {
    const parsed = parseCsvText(SAP_CSV);

    const mappings = detectColumns(
      parsed.headers,
      parsed.rows,
    );

    const canonicalRecords = normalizeRecords(
      parsed,
      mappings,
    ).slice(0, 2);

    const result = reconcileImport(
      parsed,
      mappings,
      canonicalRecords,
    );

    expect(result.status).toBe("failed");

    expect(result.sourceRowCount).toBe(3);
    expect(result.canonicalRowCount).toBe(2);
    expect(result.rowCountDifference).toBe(-1);

    expect(
      result.issues.some((issue) =>
        issue.includes("Row count mismatch"),
      ),
    ).toBe(true);
  });

  it("reconciles currencies independently", () => {
    const csv = `NAME1,DMBTR,WAERS
Supplier A,100000,TRY
Supplier B,200000,TRY
Supplier C,5000,EUR`;

    const parsed = parseCsvText(csv);

    const mappings = detectColumns(
      parsed.headers,
      parsed.rows,
    );

    const canonicalRecords = normalizeRecords(
      parsed,
      mappings,
    );

    const result = reconcileImport(
      parsed,
      mappings,
      canonicalRecords,
    );

    expect(result.status).toBe("passed");

    expect(result.currencyTotals).toEqual([
      {
        currency: "EUR",
        sourceAmount: 5000,
        canonicalAmount: 5000,
        difference: 0,
        matched: true,
      },
      {
        currency: "TRY",
        sourceAmount: 300000,
        canonicalAmount: 300000,
        difference: 0,
        matched: true,
      },
    ]);
  });
});