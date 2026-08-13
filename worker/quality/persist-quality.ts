import type { DataQualityResult } from "./run-quality";

export type PersistQualityResult = {
  importId: string;
  issuesSaved: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
};

export async function persistQualityIssues(
  db: D1Database,
  importId: string,
  result: DataQualityResult,
): Promise<PersistQualityResult> {
  if (result.issues.length === 0) {
    return {
      importId,
      issuesSaved: 0,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
    };
  }

  const statements = result.issues.map((issue) =>
    db
      .prepare(`
        INSERT INTO data_quality_issues (
          id,
          import_id,
          row_number,
          source_column_name,
          issue_type,
          severity,
          original_value,
          rule_code,
          details
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        importId,
        issue.rowNumber,
        issue.sourceColumnName,
        issue.issueType,
        issue.severity,
        issue.originalValue,
        issue.ruleCode,
        issue.details,
      ),
  );

  await db.batch(statements);

  return {
    importId,
    issuesSaved: result.issues.length,
    criticalCount: result.summary.criticalCount,
    warningCount: result.summary.warningCount,
    infoCount: result.summary.infoCount,
  };
}