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
    "tr-TR",
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
            : "Pozisyonlar yüklenemedi.",
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
          : "Pozisyon kaydedilemedi.",
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
          : "Pozisyon silinemedi.",
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
            Nakit ve kredi limitleri
          </h2>
          <p>
            Banka pozisyonlarını manuel
            girin; analiz parametreleri
            otomatik güncellensin.
          </p>
        </div>
        <span className="position-count">
          {positions.length} pozisyon
        </span>
      </div>

      {summary && (
        <div className="position-summary">
          <div>
            <span>Kullanılabilir nakit</span>
            <strong>
              {money(
                summary.availableCash,
                currency,
              )}
            </strong>
          </div>
          <div>
            <span>Kısıtlı nakit</span>
            <strong>
              {money(
                summary.restrictedCash,
                currency,
              )}
            </strong>
          </div>
          <div>
            <span>Kalan limit</span>
            <strong>
              {money(
                summary.availableFacilities,
                currency,
              )}
            </strong>
          </div>
          <div>
            <span>Toplam likidite</span>
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
          Yeni manuel pozisyon ekle
        </summary>
        <form onSubmit={submit}>
          <label>
            Pozisyon tipi
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
                Nakit hesabı
              </option>
              <option value="facility">
                Kredi limiti
              </option>
            </select>
          </label>
          <label>
            Şirket / entity
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
              ? "Banka"
              : "Kredi veren"}
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
              ? "Hesap ID"
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
                Kullanılabilir (mn)
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
                Kısıtlı (mn)
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
                Taahhütlü limit (mn)
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
                Kullanılan limit (mn)
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
                Vade
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
                Faiz tipi
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
                    Sabit
                  </option>
                  <option value="Floating">
                    Değişken
                  </option>
                </select>
              </label>
              <label>
                Yıllık faiz (%)
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
              ? "Kaydediliyor…"
              : "Pozisyonu kaydet"}
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
                  ? "NAKİT"
                  : "LİMİT"}
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
                  kullanılabilir
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
                aria-label={`${position.counterpartyName} pozisyonunu sil`}
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
