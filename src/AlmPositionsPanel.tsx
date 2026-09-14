import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  createAlmPosition,
  deleteAlmPosition,
  listAlmPositions,
} from "./treasury-api";
import type {
  AlmPosition,
  AlmPositionSummary,
  AlmPositionType,
} from "./treasury-types";

type PositionForm = {
  positionType: AlmPositionType;
  entity: string;
  counterpartyName: string;
  referenceId: string;
  availableAmount: string;
  restrictedAmount: string;
  committedAmount: string;
  drawnAmount: string;
  maturityDate: string;
  interestType: string;
  annualInterestRate: string;
};

const EMPTY_FORM: PositionForm = {
  positionType: "cash",
  entity: "1000",
  counterpartyName: "",
  referenceId: "",
  availableAmount: "",
  restrictedAmount: "0",
  committedAmount: "",
  drawnAmount: "0",
  maturityDate: "",
  interestType: "Fixed",
  annualInterestRate: "",
};

function money(
  value: number,
  currency: string,
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    },
  ).format(value);
}

export default function AlmPositionsPanel({
  currency,
  asOfDate,
  onSummaryChange,
}: {
  currency: string;
  asOfDate: string;
  onSummaryChange: (
    summary: AlmPositionSummary,
  ) => void;
}) {
  const [positions, setPositions] =
    useState<AlmPosition[]>([]);
  const [summary, setSummary] =
    useState<AlmPositionSummary | null>(
      null,
    );
  const [form, setForm] =
    useState<PositionForm>(EMPTY_FORM);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const refresh = useCallback(
    async () => {
      const result =
        await listAlmPositions(
          currency,
        );
      setPositions(result.positions);
      setSummary(result.summary);
      onSummaryChange(
        result.summary,
      );
    },
    [currency, onSummaryChange],
  );

  useEffect(() => {
    void refresh().catch(
      (refreshError: unknown) =>
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : "Positions could not be loaded.",
        ),
    );
  }, [refresh]);

  function updateForm<
    Field extends keyof PositionForm,
  >(
    field: Field,
    value: PositionForm[Field],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await createAlmPosition(
        form.positionType === "cash"
          ? {
              positionType: "cash",
              entity: form.entity,
              counterpartyName:
                form.counterpartyName,
              referenceId:
                form.referenceId,
              currency,
              asOfDate,
              availableAmount:
                Number(
                  form.availableAmount,
                ) * 1_000_000,
              restrictedAmount:
                Number(
                  form.restrictedAmount,
                ) * 1_000_000,
            }
          : {
              positionType:
                "facility",
              entity: form.entity,
              counterpartyName:
                form.counterpartyName,
              referenceId:
                form.referenceId,
              currency,
              asOfDate,
              committedAmount:
                Number(
                  form.committedAmount,
                ) * 1_000_000,
              drawnAmount:
                Number(
                  form.drawnAmount,
                ) * 1_000_000,
              maturityDate:
                form.maturityDate ||
                null,
              interestType:
                form.interestType,
              annualInterestRate:
                form.annualInterestRate
                  ? Number(
                      form.annualInterestRate,
                    )
                  : null,
            },
      );

      setForm((current) => ({
        ...EMPTY_FORM,
        positionType:
          current.positionType,
        entity: current.entity,
      }));
      await refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Position could not be saved.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function remove(
    positionId: string,
  ) {
    setLoading(true);
    setError(null);

    try {
      await deleteAlmPosition(
        positionId,
      );
      await refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Position could not be deleted.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="panel positions-panel"
      id="positions"
    >
      <div className="positions-heading">
        <div>
          <span className="eyebrow">
            ALM POSITION INPUT
          </span>
          <h2>
            Cash & Credit Facilities
          </h2>
          <p>
            Enter bank positions manually; analysis parameters update automatically.
          </p>
        </div>
        <span className="position-count">
          {positions.length} positions
        </span>
      </div>

      {summary && (
        <div className="position-summary">
          <div>
            <span>Available cash</span>
            <strong>
              {money(
                summary.availableCash,
                currency,
              )}
            </strong>
          </div>
          <div>
            <span>Restricted cash</span>
            <strong>
              {money(
                summary.restrictedCash,
                currency,
              )}
            </strong>
          </div>
          <div>
            <span>Available facilities</span>
            <strong>
              {money(
                summary.availableFacilities,
                currency,
              )}
            </strong>
          </div>
          <div>
            <span>Total liquidity</span>
            <strong>
              {money(
                summary.availableLiquidity,
                currency,
              )}
            </strong>
          </div>
        </div>
      )}

      <details className="position-entry">
        <summary>
          Add manual position
        </summary>
        <form onSubmit={submit}>
          <label>
            Position type
            <select
              value={form.positionType}
              onChange={(event) =>
                updateForm(
                  "positionType",
                  event.target
                    .value as AlmPositionType,
                )
              }
            >
              <option value="cash">
                Cash account
              </option>
              <option value="facility">
                Credit facility
              </option>
            </select>
          </label>
          <label>
            Company / entity
            <input
              required
              value={form.entity}
              onChange={(event) =>
                updateForm(
                  "entity",
                  event.target.value,
                )
              }
            />
          </label>
          <label>
            {form.positionType === "cash"
              ? "Bank"
              : "Lender"}
            <input
              required
              value={
                form.counterpartyName
              }
              onChange={(event) =>
                updateForm(
                  "counterpartyName",
                  event.target.value,
                )
              }
            />
          </label>
          <label>
            {form.positionType === "cash"
              ? "Account ID"
              : "Limit ID"}
            <input
              required
              value={form.referenceId}
              onChange={(event) =>
                updateForm(
                  "referenceId",
                  event.target.value,
                )
              }
            />
          </label>

          {form.positionType === "cash" ? (
            <>
              <label>
                Available (mn)
                <input
                  required
                  min="0"
                  step="0.1"
                  type="number"
                  value={
                    form.availableAmount
                  }
                  onChange={(event) =>
                    updateForm(
                      "availableAmount",
                      event.target.value,
                    )
                  }
                />
              </label>
              <label>
                Restricted (mn)
                <input
                  required
                  min="0"
                  step="0.1"
                  type="number"
                  value={
                    form.restrictedAmount
                  }
                  onChange={(event) =>
                    updateForm(
                      "restrictedAmount",
                      event.target.value,
                    )
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Committed facility (mn)
                <input
                  required
                  min="0"
                  step="0.1"
                  type="number"
                  value={
                    form.committedAmount
                  }
                  onChange={(event) =>
                    updateForm(
                      "committedAmount",
                      event.target.value,
                    )
                  }
                />
              </label>
              <label>
                Drawn facility (mn)
                <input
                  required
                  min="0"
                  step="0.1"
                  type="number"
                  value={form.drawnAmount}
                  onChange={(event) =>
                    updateForm(
                      "drawnAmount",
                      event.target.value,
                    )
                  }
                />
              </label>
              <label>
                Maturity
                <input
                  type="date"
                  value={form.maturityDate}
                  onChange={(event) =>
                    updateForm(
                      "maturityDate",
                      event.target.value,
                    )
                  }
                />
              </label>
              <label>
                Rate type
                <select
                  value={form.interestType}
                  onChange={(event) =>
                    updateForm(
                      "interestType",
                      event.target.value,
                    )
                  }
                >
                  <option value="Fixed">
                    Fixed
                  </option>
                  <option value="Floating">
                    Floating
                  </option>
                </select>
              </label>
              <label>
                Annual interest rate (%)
                <input
                  min="0"
                  step="0.01"
                  type="number"
                  value={
                    form.annualInterestRate
                  }
                  onChange={(event) =>
                    updateForm(
                      "annualInterestRate",
                      event.target.value,
                    )
                  }
                />
              </label>
            </>
          )}

          <button
            className="button-primary"
            disabled={loading}
          >
            {loading
              ? "Saving…"
              : "Save position"}
          </button>
        </form>
      </details>

      {error && (
        <p className="analysis-error">
          {error}
        </p>
      )}

      {positions.length > 0 && (
        <div className="position-list">
          {positions.map((position) => (
            <div
              className="position-row"
              key={position.id}
            >
              <span
                className={`position-type type-${position.positionType}`}
              >
                {position.positionType ===
                "cash"
                  ? "CASH"
                  : "FACILITY"}
              </span>
              <div>
                <strong>
                  {position.counterpartyName}
                </strong>
                <small>
                  {position.entity} ·{" "}
                  {position.referenceId}
                </small>
              </div>
              <span>
                {money(
                  position.availableAmount,
                  position.currency,
                )}
                <small>
                  available
                </small>
              </span>
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  void remove(
                    position.id,
                  )
                }
                aria-label={`${position.counterpartyName} position`}
              >
                Sil
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
