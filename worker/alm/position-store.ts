import type {
  AlmPosition,
  AlmPositionInput,
} from "./positions";

const POSITION_SELECT = `
  SELECT
    id,
    organization_id AS organizationId,
    position_type AS positionType,
    entity,
    counterparty_name AS counterpartyName,
    reference_id AS referenceId,
    currency,
    as_of_date AS asOfDate,
    available_amount AS availableAmount,
    restricted_amount AS restrictedAmount,
    committed_amount AS committedAmount,
    drawn_amount AS drawnAmount,
    maturity_date AS maturityDate,
    interest_type AS interestType,
    annual_interest_rate AS annualInterestRate,
    created_at AS createdAt
  FROM alm_positions
`;

export async function createAlmPosition(
  db: D1Database,
  organizationId: string,
  input: AlmPositionInput,
): Promise<AlmPosition> {
  const id = crypto.randomUUID();

  await db
    .prepare(`
      INSERT INTO alm_positions (
        id,
        organization_id,
        position_type,
        entity,
        counterparty_name,
        reference_id,
        currency,
        as_of_date,
        available_amount,
        restricted_amount,
        committed_amount,
        drawn_amount,
        maturity_date,
        interest_type,
        annual_interest_rate
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      organizationId,
      input.positionType,
      input.entity,
      input.counterpartyName,
      input.referenceId,
      input.currency,
      input.asOfDate,
      input.availableAmount ?? 0,
      input.restrictedAmount ?? 0,
      input.committedAmount ?? null,
      input.drawnAmount ?? null,
      input.maturityDate ?? null,
      input.interestType ?? null,
      input.annualInterestRate ?? null,
    )
    .run();

  const created = await db
    .prepare(`
      ${POSITION_SELECT}
      WHERE id = ?
        AND organization_id = ?
    `)
    .bind(
      id,
      organizationId,
    )
    .first<AlmPosition>();

  if (!created) {
    throw new Error(
      "ALM position could not be created.",
    );
  }

  return created;
}

export async function listAlmPositions(
  db: D1Database,
  organizationId: string,
): Promise<AlmPosition[]> {
  const result = await db
    .prepare(`
      ${POSITION_SELECT}
      WHERE organization_id = ?
      ORDER BY
        as_of_date DESC,
        created_at DESC
    `)
    .bind(organizationId)
    .all<AlmPosition>();

  return result.results;
}

export async function deleteAlmPosition(
  db: D1Database,
  organizationId: string,
  positionId: string,
): Promise<boolean> {
  const result = await db
    .prepare(`
      DELETE FROM alm_positions
      WHERE id = ?
        AND organization_id = ?
    `)
    .bind(
      positionId,
      organizationId,
    )
    .run();

  return (
    result.meta.changes ?? 0
  ) > 0;
}
