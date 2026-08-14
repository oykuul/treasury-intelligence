import type {
  CanonicalTreasuryRecord,
} from "../canonical/normalize-records";

import type {
  TreasuryDataset,
  TreasuryDatasetType,
} from "./build-liquidity-forecast";

type ImportRow = {
  id: string;
  sourceType: string | null;
};

type CanonicalRecordRow =
  CanonicalTreasuryRecord & {
    importId: string;
  };

function isTreasuryDatasetType(
  value: string | null,
): value is TreasuryDatasetType {
  return (
    value === "payables" ||
    value === "receivables" ||
    value === "debt"
  );
}

export async function loadTreasuryDatasets(
  db: D1Database,
  organizationId: string,
  importIds: string[],
): Promise<TreasuryDataset[]> {
  const normalizedImportIds =
    importIds.map(
      (importId) =>
        importId.trim(),
    );

  if (
    normalizedImportIds.length === 0 ||
    normalizedImportIds.some(
      (importId) => !importId,
    )
  ) {
    throw new Error(
      "At least one importId is required.",
    );
  }

  if (
    new Set(
      normalizedImportIds,
    ).size !==
    normalizedImportIds.length
  ) {
    throw new Error(
      "importIds must be unique.",
    );
  }

  const placeholders =
    normalizedImportIds
      .map(() => "?")
      .join(", ");

  const importResult =
    await db
      .prepare(`
        SELECT
          id,
          source_type AS sourceType
        FROM imports
        WHERE organization_id = ?
          AND id IN (${placeholders})
      `)
      .bind(
        organizationId,
        ...normalizedImportIds,
      )
      .all<ImportRow>();

  const importsById =
    new Map(
      importResult.results.map(
        (item) => [
          item.id,
          item,
        ],
      ),
    );

  const missingImportIds =
    normalizedImportIds.filter(
      (importId) =>
        !importsById.has(importId),
    );

  if (missingImportIds.length > 0) {
    throw new Error(
      `Imports not found: ${missingImportIds.join(", ")}.`,
    );
  }

  const seenTypes =
    new Set<TreasuryDatasetType>();

  for (const importId of normalizedImportIds) {
    const sourceType =
      importsById.get(importId)
        ?.sourceType ??
      null;

    if (
      !isTreasuryDatasetType(
        sourceType,
      )
    ) {
      throw new Error(
        `Import ${importId} does not have a valid treasury sourceType.`,
      );
    }

    if (seenTypes.has(sourceType)) {
      throw new Error(
        `Only one import per sourceType is allowed: ${sourceType}.`,
      );
    }

    seenTypes.add(sourceType);
  }

  const recordResult =
    await db
      .prepare(`
        SELECT
          import_id AS importId,
          source_row_number AS sourceRowNumber,

          company,
          fiscal_year AS fiscalYear,

          counterparty_id AS counterpartyId,
          counterparty_name AS counterpartyName,

          bank,
          account,

          currency,
          amount,
          debit_credit AS debitCredit,

          document_no AS documentNo,
          line_item_no AS lineItemNo,
          document_type AS documentType,

          posting_date AS postingDate,
          document_date AS documentDate,
          due_date AS dueDate,
          value_date AS valueDate,

          description,
          assignment,
          reference,

          balance,
          restricted_amount AS restrictedAmount,

          debt_id AS debtId,
          lender,
          instrument_type AS instrumentType,

          outstanding_principal AS outstandingPrincipal,
          interest_type AS interestType,
          annual_interest_rate AS annualInterestRate,

          next_payment_date AS nextPaymentDate,
          next_payment_amount AS nextPaymentAmount,
          maturity_date AS maturityDate
        FROM canonical_records
        WHERE import_id IN (${placeholders})
        ORDER BY
          import_id,
          source_row_number
      `)
      .bind(
        ...normalizedImportIds,
      )
      .all<CanonicalRecordRow>();

  const recordsByImportId =
    new Map<
      string,
      CanonicalTreasuryRecord[]
    >();

  for (const row of recordResult.results) {
    const {
      importId,
      ...record
    } = row;

    const records =
      recordsByImportId.get(
        importId,
      ) ?? [];

    records.push(record);

    recordsByImportId.set(
      importId,
      records,
    );
  }

  return normalizedImportIds.map(
    (importId) => ({
      type:
        importsById.get(importId)
          ?.sourceType as TreasuryDatasetType,

      records:
        recordsByImportId.get(
          importId,
        ) ?? [],
    }),
  );
}
