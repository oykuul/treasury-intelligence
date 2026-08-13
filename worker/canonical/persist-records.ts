import type { CanonicalTreasuryRecord } from "./normalize-records";

export type PersistCanonicalRecordsResult = {
  importId: string;
  recordsSaved: number;
};

export async function persistCanonicalRecords(
  db: D1Database,
  importId: string,
  records: CanonicalTreasuryRecord[],
): Promise<PersistCanonicalRecordsResult> {
  if (records.length === 0) {
    return {
      importId,
      recordsSaved: 0,
    };
  }

  const statements = records.map((record) =>
    db
      .prepare(`
        INSERT INTO canonical_records (
          id,
          import_id,
          source_row_number,

          company,

          counterparty_id,
          counterparty_name,

          bank,
          account,

          currency,
          amount,
          debit_credit,

          document_no,
          document_type,

          posting_date,
          document_date,
          due_date,
          value_date,

          description,
          assignment,
          reference,

          balance,
          restricted_amount,

          debt_id,
          lender,
          instrument_type,

          outstanding_principal,
          interest_type,
          annual_interest_rate,

          next_payment_date,
          next_payment_amount,
          maturity_date
        )
        VALUES (
          ?, ?, ?,
          ?,
          ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
      `)
      .bind(
        crypto.randomUUID(),
        importId,
        record.sourceRowNumber,

        record.company,

        record.counterpartyId,
        record.counterpartyName,

        record.bank,
        record.account,

        record.currency,
        record.amount,
        record.debitCredit,

        record.documentNo,
        record.documentType,

        record.postingDate,
        record.documentDate,
        record.dueDate,
        record.valueDate,

        record.description,
        record.assignment,
        record.reference,

        record.balance,
        record.restrictedAmount,

        record.debtId,
        record.lender,
        record.instrumentType,

        record.outstandingPrincipal,
        record.interestType,
        record.annualInterestRate,

        record.nextPaymentDate,
        record.nextPaymentAmount,
        record.maturityDate,
      ),
  );

  await db.batch(statements);

  return {
    importId,
    recordsSaved: records.length,
  };
}