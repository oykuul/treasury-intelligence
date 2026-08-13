import { describe, expect, it } from "vitest";

import { parseCsvText } from "../ingestion/csv";
import { detectColumns } from "../ingestion/detect-columns";
import { normalizeRecords } from "./normalize-records";

const SAP_CSV = `BUKRS,LIFNR,NAME1,ZFBDT,DMBTR,WAERS,BELNR,BLART,SHKZG,HBKID,SGTXT,ZZ_UNUSED
1000,V10001,Atlas Otomotiv,20.08.2026,250000,TRY,190001,KR,H,HB01,Tedarikci odemesi,ABC
1000,V10002,Marmara Lojistik,22.08.2026,480000,TRY,190002,KR,H,HB02,Lojistik faturasi,XYZ
1000,V10003,Nova Teknoloji,25.08.2026,175000,TRY,190003,KR,H,HB01,Hizmet faturasi,TEST`;

describe("Canonical Treasury Records", () => {
  it("normalizes SAP payables into canonical records", () => {
    const parsed = parseCsvText(SAP_CSV);

    const mappings = detectColumns(
      parsed.headers,
      parsed.rows,
    );

    const records = normalizeRecords(
      parsed,
      mappings,
    );

    expect(records).toHaveLength(3);

    expect(records[0]).toMatchObject({
      sourceRowNumber: 2,

      company: "1000",

      counterpartyId: "V10001",
      counterpartyName: "Atlas Otomotiv",

      bank: "HB01",

      currency: "TRY",
      amount: 250000,
      debitCredit: "H",

      documentNo: "190001",
      documentType: "KR",

      dueDate: "2026-08-20",

      description: "Tedarikci odemesi",
    });

    expect(records[1]).toMatchObject({
      sourceRowNumber: 3,
      counterpartyId: "V10002",
      counterpartyName: "Marmara Lojistik",
      amount: 480000,
      currency: "TRY",
      dueDate: "2026-08-22",
      documentNo: "190002",
    });

    expect(records[2]).toMatchObject({
      sourceRowNumber: 4,
      counterpartyId: "V10003",
      counterpartyName: "Nova Teknoloji",
      amount: 175000,
      currency: "TRY",
      dueDate: "2026-08-25",
      documentNo: "190003",
    });
  });

  it("returns null for invalid canonical dates", () => {
    const csv = `BUKRS,NAME1,ZFBDT,DMBTR,WAERS
1000,Test Supplier,31.13.2026,100000,TRY`;

    const parsed = parseCsvText(csv);

    const mappings = detectColumns(
      parsed.headers,
      parsed.rows,
    );

    const records = normalizeRecords(
      parsed,
      mappings,
    );

    expect(records[0].dueDate).toBeNull();
  });

  it("keeps amount and debit credit indicator separate", () => {
    const csv = `DMBTR,SHKZG,WAERS
250000,H,TRY`;

    const parsed = parseCsvText(csv);

    const mappings = detectColumns(
      parsed.headers,
      parsed.rows,
    );

    const records = normalizeRecords(
      parsed,
      mappings,
    );

    expect(records[0].amount).toBe(250000);
    expect(records[0].debitCredit).toBe("H");
  });
});