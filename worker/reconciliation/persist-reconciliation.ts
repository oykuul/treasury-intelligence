import type { ReconciliationResult } from "./reconcile-import";

export type PersistReconciliationResult = {
  importId: string;
  reconciliationId: string;
  status: ReconciliationResult["status"];
};

export async function persistReconciliation(
  db: D1Database,
  importId: string,
  result: ReconciliationResult,
): Promise<PersistReconciliationResult> {
  const reconciliationId =
    crypto.randomUUID();

  await db
    .prepare(`
      INSERT INTO reconciliation_results (
        id,
        import_id,
        status,

        source_row_count,
        canonical_row_count,
        row_count_difference,

        source_amount_rows,
        canonical_amount_rows,
        amount_rows_difference,

        currency_totals,
        issues
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      reconciliationId,
      importId,
      result.status,

      result.sourceRowCount,
      result.canonicalRowCount,
      result.rowCountDifference,

      result.sourceAmountRows,
      result.canonicalAmountRows,
      result.amountRowsDifference,

      JSON.stringify(
        result.currencyTotals,
      ),

      JSON.stringify(
        result.issues,
      ),
    )
    .run();

  return {
    importId,
    reconciliationId,
    status: result.status,
  };
}
