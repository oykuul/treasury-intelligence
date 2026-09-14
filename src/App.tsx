import {
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import "./App.css";
import AlmPositionsPanel from "./AlmPositionsPanel";
import { DEMO_RESPONSE } from "./demo-data";
import {
  analyzeImport,
  analyzeTreasury,
} from "./treasury-api";
import type {
  AnalysisParameters,
  AlmPositionSummary,
  DatasetType,
  DebtFunding,
  ExecutivePillarId,
  ExecutiveStatus,
  FundingPlan,
  FundingPlanActionType,
  GapDrivers,
  InterestRateRisk,
  MaturityGap,
  PolicyLimitCheck,
  PolicyLimitId,
  PolicyLimits,
  StressScenario,
  TreasuryAnalysisResponse,
  UploadState,
} from "./treasury-types";

const DATASETS: DatasetType[] = ["payables", "receivables", "debt"];

const SAMPLE_IMPORTS: {
  period: UploadPeriod;
  dataset: DatasetType;
  path: string;
}[] = [
  { period: "current", dataset: "payables", path: "/samples/current-payables.csv" },
  { period: "current", dataset: "receivables", path: "/samples/current-receivables.csv" },
  { period: "current", dataset: "debt", path: "/samples/current-debt.csv" },
  { period: "previous", dataset: "payables", path: "/samples/previous-payables.csv" },
  { period: "previous", dataset: "receivables", path: "/samples/previous-receivables.csv" },
  { period: "previous", dataset: "debt", path: "/samples/previous-debt.csv" },
];

const DATASET_LABELS: Record<DatasetType, string> = {
  payables: "Payables",
  receivables: "Receivables",
  debt: "Financial Debt",
};

const EMPTY_UPLOAD: UploadState = {
  status: "idle",
  fileName: null,
  importId: null,
  result: null,
  error: null,
};

type UploadPeriod = "current" | "previous";
type UploadGroups = Record<UploadPeriod, Record<DatasetType, UploadState>>;

function makeUploadGroups(): UploadGroups {
  return {
    current: {
      payables: { ...EMPTY_UPLOAD },
      receivables: { ...EMPTY_UPLOAD },
      debt: { ...EMPTY_UPLOAD },
    },
    previous: {
      payables: { ...EMPTY_UPLOAD },
      receivables: { ...EMPTY_UPLOAD },
      debt: { ...EMPTY_UPLOAD },
    },
  };
}

function formatMoney(amount: number, currency = "TRY"): string {
  const compact = new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(Math.abs(amount));
  const symbol = currency === "TRY" ? "₺" : currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `;
  return `${amount < 0 ? "−" : ""}${symbol}${compact}`;
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

type IconName = "grid" | "upload" | "pulse" | "changes" | "settings" | "chevron" | "spark" | "calendar";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4"/></>,
    pulse: <path d="M3 12h4l2.2-6 4.1 12 2.2-6H21"/>,
    changes: <><path d="M7 7h11l-3-3m3 3l-3 3"/><path d="M17 17H6l3 3m-3-3l3-3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 .6 1.7 1.7 0 00-.4 1.1V21H10v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-.6-1 1.7 1.7 0 00-1.1-.4H3V10h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001-.6 1.7 1.7 0 00.4-1.1V3H14v.1a1.7 1.7 0 001.1 1.5 1.7 1.7 0 001.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0019.4 9c.15.38.37.72.66 1 .3.28.69.42 1.1.4H21V14h-.1a1.7 1.7 0 00-1.5 1z"/></>,
    chevron: <path d="M8 10l4 4 4-4"/>,
    spark: <path d="M12 3l1.25 4.75L18 9l-4.75 1.25L12 15l-1.25-4.75L6 9l4.75-1.25L12 3zm6 12l.65 2.35L21 18l-2.35.65L18 21l-.65-2.35L15 18l2.35-.65L18 15z"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function MetricCard({ label, value, detail, tone = "neutral" }: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
}) {
  return <article className={`metric-card metric-${tone}`}>
    <p>{label}</p><strong>{value}</strong>{detail && <span>{detail}</span>}
  </article>;
}

function ImportSlot({ dataset, period, state, onFile }: {
  dataset: DatasetType;
  period: UploadPeriod;
  state: UploadState;
  onFile: (period: UploadPeriod, dataset: DatasetType, file: File) => void;
}) {
  const inputId = `${period}-${dataset}`;
  const result = state.result;
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFile(period, dataset, file);
    event.target.value = "";
  }
  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file?.name.toLowerCase().endsWith(".csv")) onFile(period, dataset, file);
  }
  return <div className={`import-slot status-${state.status}`}>
    <div className="slot-heading">
      <span className="dataset-mark" data-type={dataset} />
      <div><strong>{DATASET_LABELS[dataset]}</strong><small>{dataset}.csv</small></div>
      {state.status === "ready" && <span className="ready-pill">Hazır</span>}
    </div>
    <label className="drop-zone" htmlFor={inputId} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <input id={inputId} type="file" accept=".csv,text/csv" onChange={handleChange} disabled={state.status === "uploading"} />
      <Icon name="upload" />
      <span>{state.status === "uploading" ? "Analyzing…" : state.fileName ?? "Choose a CSV or drop it here"}</span>
    </label>
    {result && <div className="import-result">
      <span>{result.dataset.rowCount.toLocaleString("en-GB")} rows</span>
      <span>{result.summary.autoMatched} auto-matched</span>
      <span className={result.summary.unmatched > 0 ? "text-warning" : ""}>{result.summary.unmatched} unmatched</span>
      <span className={result.quality.criticalCount > 0 ? "text-danger" : ""}>{result.quality.totalIssues} quality findings</span>
      <span>Reconciliation: {result.reconciliation.status}</span>
    </div>}
    {result && <details className="mapping-details">
      <summary>Mapping table ({result.mappings.length})</summary>
      <div className="mapping-table-wrap"><table><thead><tr><th>Source</th><th>Canonical</th><th>Confidence</th><th>Status</th></tr></thead><tbody>{result.mappings.map((mapping) => <tr key={mapping.sourceColumn} className={mapping.status === "unmatched" ? "mapping-unmatched" : ""}><td>{mapping.sourceColumn}</td><td>{mapping.canonicalField ?? "Unmatched"}</td><td>%{Math.round(mapping.confidence * 100)}</td><td><span>{mapping.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div>
    </details>}
    {state.error && <p className="inline-error">{state.error}</p>}
  </div>;
}

function Importer({ uploads, expanded, parameters, running, error, onToggle, onFile, onParameter, onAnalyze, onSamples, onDemo }: {
  uploads: UploadGroups;
  expanded: boolean;
  parameters: AnalysisParameters;
  running: boolean;
  error: string | null;
  onToggle: () => void;
  onFile: (period: UploadPeriod, dataset: DatasetType, file: File) => void;
  onParameter: (key: keyof AnalysisParameters, value: string) => void;
  onAnalyze: () => void;
  onSamples: () => void;
  onDemo: () => void;
}) {
  const currentCount = DATASETS.filter((dataset) => uploads.current[dataset].importId).length;
  return <section className="panel importer-panel" id="importer">
    <button className="panel-toggle" onClick={onToggle} aria-expanded={expanded}>
      <span className="panel-icon"><Icon name="upload" /></span>
      <span><strong>Universal Data Importer</strong><small>SAP-compatible CSV mapping, data-quality checks, and reconciliation</small></span>
      <span className="import-progress">{currentCount}/3 current datasets</span>
      <span className={expanded ? "chevron-up" : ""}><Icon name="chevron" /></span>
    </button>
    {expanded && <div className="importer-body">
      <div className="period-heading"><span>Current period</span><small>Files used in the analysis</small></div>
      <div className="import-grid">{DATASETS.map((dataset) => <ImportSlot key={`current-${dataset}`} dataset={dataset} period="current" state={uploads.current[dataset]} onFile={onFile} />)}</div>
      <details className="previous-imports">
        <summary>Add previous-period files <span>Optional for What Changed</span></summary>
        <div className="import-grid">{DATASETS.map((dataset) => <ImportSlot key={`previous-${dataset}`} dataset={dataset} period="previous" state={uploads.previous[dataset]} onFile={onFile} />)}</div>
      </details>
      <div className="analysis-settings">
        <label>Currency<select value={parameters.currency} onChange={(event) => onParameter("currency", event.target.value)}><option>TRY</option><option>EUR</option><option>USD</option></select></label>
        <label>As-of date<input type="date" value={parameters.asOfDate} onChange={(event) => onParameter("asOfDate", event.target.value)} /></label>
        <label>Opening cash (mn)<input type="number" value={parameters.openingLiquidity / 1_000_000} onChange={(event) => onParameter("openingLiquidity", event.target.value)} /></label>
        <label>Available facilities (mn)<input type="number" value={parameters.unusedCommittedFacilities / 1_000_000} onChange={(event) => onParameter("unusedCommittedFacilities", event.target.value)} /></label>
        <label>Policy buffer (mn)<input type="number" value={parameters.minimumLiquidityBuffer / 1_000_000} onChange={(event) => onParameter("minimumLiquidityBuffer", event.target.value)} /></label>
      </div>
      {error && <p className="analysis-error">{error}</p>}
      <div className="import-actions">
        <button className="button-secondary" onClick={onDemo}><Icon name="spark" /> Load demo data</button>
        <button className="button-secondary sample-button" onClick={onSamples} disabled={running}><Icon name="upload" /> Run with sample CSVs</button>
        <button className="button-primary" onClick={onAnalyze} disabled={running}>{running ? "Preparing analysis…" : "Run CFO analysis"}</button>
      </div>
    </div>}
  </section>;
}

function DataStatusBar({ uploads, demoMode, manualPositionCount, expanded, onToggle }: {
  uploads: UploadGroups;
  demoMode: boolean;
  manualPositionCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const readyCount = demoMode
    ? DATASETS.length
    : DATASETS.filter((dataset) => uploads.current[dataset].importId).length;

  return <button className="data-status-bar" type="button" onClick={onToggle} aria-expanded={expanded} aria-controls="data-workspace">
    <span className="data-status-title"><Icon name="upload" /><span><strong>Data &amp; Inputs</strong><small>Manage analysis scope and manual positions</small></span></span>
    <span className="dataset-statuses">{DATASETS.map((dataset) => {
      const ready = demoMode || Boolean(uploads.current[dataset].importId);
      return <span className={ready ? "is-ready" : "is-missing"} key={dataset}><i />{DATASET_LABELS[dataset]} {ready ? "✓" : "—"}</span>;
    })}</span>
    <span className="manual-position-status">{manualPositionCount} Manual Positions</span>
    <span className={`dataset-total ${readyCount === DATASETS.length ? "is-ready" : ""}`}>{readyCount}/3 datasets ready</span>
    <span className="data-update-cta">{expanded ? "Close Inputs" : "Update Files"}<Icon name="chevron" /></span>
  </button>;
}

function StressChart({ scenarios, threshold, selectedDate, onDateSelect }: {
  scenarios: StressScenario[];
  threshold: number;
  selectedDate: string;
  onDateSelect: (date: string) => void;
}) {
  const width = 920;
  const height = 300;
  const plot = { left: 64, right: 24, top: 22, bottom: 42 };
  const allPoints = scenarios.flatMap((scenario) => scenario.curve);
  const values = [...allPoints.map((point) => point.closingLiquidity), threshold, 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max(1, (max - min) * 0.08);
  const yMin = min - padding;
  const yMax = max + padding;
  const curveLength = scenarios[0]?.curve.length ?? 1;
  const x = (index: number) => plot.left + (index / Math.max(1, curveLength - 1)) * (width - plot.left - plot.right);
  const y = (value: number) => plot.top + ((yMax - value) / Math.max(1, yMax - yMin)) * (height - plot.top - plot.bottom);
  const colors: Record<StressScenario["name"], string> = { BASE: "#16a67a", MODERATE: "#d8942b", SEVERE: "#e15461", CUSTOM: "#6c73d9" };
  const foundSelectedIndex = scenarios[0]?.curve.findIndex((point) => point.date === selectedDate) ?? 0;
  const selectedIndex = Math.max(0, foundSelectedIndex);
  const tickIndexes = [0, Math.floor((curveLength - 1) / 3), Math.floor(((curveLength - 1) * 2) / 3), curveLength - 1];
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4).reverse();
  function makePath(scenario: StressScenario): string {
    return scenario.curve.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(point.closingLiquidity).toFixed(2)}`).join(" ");
  }
  function handleClick(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = (localX - plot.left) / (width - plot.left - plot.right);
    const index = Math.max(0, Math.min(curveLength - 1, Math.round(ratio * (curveLength - 1))));
    const date = scenarios[0]?.curve[index]?.date;
    if (date) onDateSelect(date);
  }
  return <div className="chart-wrap">
    <svg className="stress-chart" viewBox={`0 0 ${width} ${height}`} onClick={handleClick} role="img" aria-label="Liquidity curves for the Base, Moderate, and Severe stress scenarios. Click the chart to select a date.">
      {yTicks.map((tick) => <g key={tick}>
        <line x1={plot.left} x2={width - plot.right} y1={y(tick)} y2={y(tick)} className="grid-line" />
        <text x={plot.left - 12} y={y(tick) + 4} textAnchor="end" className="axis-label">{formatMoney(tick, "TRY")}</text>
      </g>)}
      <line x1={plot.left} x2={width - plot.right} y1={y(threshold)} y2={y(threshold)} className="threshold-line" />
      <text x={width - plot.right} y={y(threshold) - 7} textAnchor="end" className="threshold-label">Policy buffer</text>
      {scenarios.map((scenario) => <path key={scenario.name} d={makePath(scenario)} fill="none" stroke={colors[scenario.name]} className="scenario-path" />)}
      <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={plot.top} y2={height - plot.bottom} className="selected-line" />
      <circle cx={x(selectedIndex)} cy={y(scenarios[0]?.curve[selectedIndex]?.closingLiquidity ?? 0)} r="5" fill={colors.BASE} stroke="white" strokeWidth="3" />
      {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 12} textAnchor={index === 0 ? "start" : index === curveLength - 1 ? "end" : "middle"} className="axis-label">{formatDate(scenarios[0]?.curve[index]?.date ?? "")}</text>)}
    </svg>
    <div className="chart-accessible-control"><label htmlFor="gap-date"><Icon name="calendar" /> Gap Drivers date</label><input id="gap-date" lang="en-GB" type="date" value={selectedDate} min={scenarios[0]?.curve[0]?.date} max={scenarios[0]?.curve[curveLength - 1]?.date} onChange={(event) => onDateSelect(event.target.value)} /></div>
  </div>;
}

function ScenarioTable({ scenarios, currency }: { scenarios: StressScenario[]; currency: string }) {
  return <div className="table-scroll"><table className="scenario-table">
    <thead><tr><th>Scenario</th><th>Min. cash</th><th>Funding need</th><th>Buffer breach days</th><th>First breach</th></tr></thead>
    <tbody>{scenarios.map((scenario) => <tr key={scenario.name}>
      <td><span className={`scenario-dot scenario-${scenario.name.toLowerCase()}`} />{scenario.label}</td>
      <td className={scenario.minimumLiquidity < 0 ? "negative-value" : ""}>{formatMoney(scenario.minimumLiquidity, currency)}</td>
      <td>{formatMoney(scenario.fundingNeed, currency)}</td><td>{scenario.thresholdBreachDays} days</td><td>{formatDate(scenario.firstThresholdBreachDate)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function GapDriverPanel({ gap }: { gap: GapDrivers }) {
  const steps = [
    { label: "Opening", value: gap.openingLiquidity, tone: "opening" },
    { label: "Receivables", value: gap.receivablesInflows, tone: "inflow" },
    { label: "Payments", value: -gap.payablesOutflows, tone: "outflow" },
    { label: "Debt service", value: -gap.debtOutflows, tone: "outflow" },
    { label: "Closing", value: gap.projectedCash, tone: "closing" },
  ];
  const max = Math.max(...steps.map((step) => Math.abs(step.value)), 1);
  return <section className="panel gap-panel" id="gap-drivers">
    <div className="section-heading"><div><span className="eyebrow">Selected-day analysis</span><h2>Gap Drivers</h2><p>{formatDate(gap.targetDate)} cash-flow drivers</p></div><div className="concentration-score"><span>Top 3 concentration</span><strong>%{gap.top3CounterpartyConcentration.toFixed(1)}</strong></div></div>
    <div className="gap-layout">
      <div><h3>Daily cash bridge</h3><div className="waterfall">{steps.map((step) => <div className="waterfall-step" key={step.label}><div className="waterfall-track"><span className={`waterfall-bar ${step.tone}`} style={{ height: `${Math.max(14, (Math.abs(step.value) / max) * 100)}%` }} /></div><strong>{formatMoney(step.value, gap.currency)}</strong><span>{step.label}</span></div>)}</div></div>
      <div className="counterparties"><h3>Counterparty concentration</h3>{gap.counterparties.slice(0, 5).map((counterparty) => <div className="counterparty-row" key={counterparty.counterpartyName}><div><strong>{counterparty.counterpartyName}</strong><span>{formatMoney(counterparty.netImpact, gap.currency)} net impact</span></div><div className="share-bar"><span style={{ width: `${Math.min(100, counterparty.sharePercent)}%` }} /></div><b>%{counterparty.sharePercent.toFixed(1)}</b></div>)}</div>
    </div>
    <details className="flow-details"><summary>{gap.flows.length} cash flows</summary><div className="table-scroll"><table><thead><tr><th>Counterparty</th><th>Source</th><th>Document</th><th>Direction</th><th>Impact</th></tr></thead><tbody>{gap.flows.map((flow, index) => <tr key={`${flow.counterpartyName}-${flow.documentNo ?? flow.debtId}-${index}`}><td>{flow.counterpartyName}</td><td>{DATASET_LABELS[flow.datasetType]}</td><td>{flow.documentNo ?? flow.debtId ?? "—"}</td><td>{flow.direction === "INFLOW" ? "Inflow" : "Outflow"}</td><td className={flow.signedImpact < 0 ? "negative-value" : "positive-value"}>{formatMoney(flow.signedImpact, flow.currency)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

function MaturityGapChart({
  gap,
}: {
  gap: MaturityGap;
}) {
  const buckets = gap.buckets;
  const width = 1180;
  const height = 310;
  const plot = {
    left: 72,
    right: 22,
    top: 24,
    bottom: 58,
  };
  const values = buckets.flatMap(
    (bucket) => [
      bucket.assets,
      -bucket.liabilities,
      bucket.cumulativeGap,
    ],
  );
  const maxAbsolute = Math.max(
    ...values.map((value) =>
      Math.abs(value),
    ),
    1,
  );
  const chartMaximum =
    maxAbsolute * 1.12;
  const chartHeight =
    height - plot.top - plot.bottom;
  const y = (value: number) =>
    plot.top +
    (
      (chartMaximum - value) /
      (chartMaximum * 2)
    ) *
      chartHeight;
  const zeroY = y(0);
  const columnWidth =
    (
      width -
      plot.left -
      plot.right
    ) /
    buckets.length;
  const x = (index: number) =>
    plot.left +
    columnWidth *
      (index + 0.5);
  const cumulativePath =
    buckets
      .map(
        (bucket, index) =>
          `${index === 0 ? "M" : "L"}${x(index)},${y(bucket.cumulativeGap)}`,
      )
      .join(" ");
  const tickValues = [
    chartMaximum,
    0,
    -chartMaximum,
  ];

  return <div className="maturity-chart-wrap">
    <svg className="maturity-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Assets, liabilities, and cumulative gap by maturity bucket">
      {tickValues.map((tick) => <g key={tick}>
        <line x1={plot.left} x2={width - plot.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "maturity-zero" : "grid-line"} />
        <text x={plot.left - 12} y={y(tick) + 4} textAnchor="end" className="axis-label">{formatMoney(tick, gap.currency)}</text>
      </g>)}
      {buckets.map((bucket, index) => {
        const center = x(index);
        const barWidth = Math.min(18, columnWidth * .28);
        return <g key={bucket.id}>
          <rect className="maturity-asset-bar" x={center - barWidth - 1} y={y(bucket.assets)} width={barWidth} height={Math.max(0, zeroY - y(bucket.assets))} rx="2" />
          <rect className="maturity-liability-bar" x={center + 1} y={zeroY} width={barWidth} height={Math.max(0, y(-bucket.liabilities) - zeroY)} rx="2" />
          <text x={center} y={height - 28} textAnchor="middle" className="maturity-bucket-label">{bucket.id === "overdue" ? "Overdue" : bucket.id === "over12m" ? ">12A" : bucket.id}</text>
        </g>;
      })}
      <path d={cumulativePath} className="maturity-cumulative-line" />
      {buckets.map((bucket, index) => <circle key={`gap-${bucket.id}`} cx={x(index)} cy={y(bucket.cumulativeGap)} r="3" className={bucket.cumulativeGap < 0 ? "maturity-gap-point negative" : "maturity-gap-point"} />)}
    </svg>
  </div>;
}

function MaturityGapPanel({
  gap,
}: {
  gap: MaturityGap;
}) {
  const minimumBucket =
    gap.buckets.find(
      (bucket) =>
        bucket.id ===
        gap.minimumBucketId,
    );
  const statusSentence =
    gap.residualFundingNeed > 0
      ? `After available committed facilities, ${formatMoney(gap.residualFundingNeed, gap.currency)} of 12-month funding need remains uncovered.`
      : "Committed facilities fully cover the minimum 12-month cumulative gap.";

  return <section className="panel maturity-panel" id="maturity-gap">
    <div className="section-heading">
      <div><span className="eyebrow">12-month contractual view</span><h2>Maturity Gap</h2><p>Receivables, payables, debt service, and drawn facilities compared on a single maturity ladder</p></div>
      <div className="legend maturity-legend"><span><i className="legend-asset" />Assets</span><span><i className="legend-liability" />Liabilities</span><span><i className="legend-cumulative" />Cumulative gap</span></div>
    </div>
    <div className="maturity-summary">
      <MetricCard label="12M contractual assets" value={formatMoney(gap.totalAssets12M, gap.currency)} tone="positive" />
      <MetricCard label="12M contractual liabilities" value={formatMoney(gap.totalLiabilities12M, gap.currency)} tone="negative" />
      <MetricCard label="Minimum cumulative gap" value={formatMoney(gap.minimumCumulativeGap12M, gap.currency)} detail={minimumBucket?.label ?? "Opening"} tone={gap.minimumCumulativeGap12M < 0 ? "negative" : "positive"} />
      <MetricCard label="Residual funding gap" value={formatMoney(gap.residualFundingNeed, gap.currency)} tone={gap.residualFundingNeed > 0 ? "negative" : "positive"} />
    </div>
    <div className={`maturity-status ${gap.residualFundingNeed > 0 ? "status-negative" : "status-positive"}`}><strong>{gap.residualFundingNeed > 0 ? "Funding action required" : "Facility coverage sufficient"}</strong><span>{statusSentence}</span></div>
    <MaturityGapChart gap={gap} />
    <div className="table-scroll maturity-table-wrap"><table className="maturity-table">
      <thead><tr><th>Maturity bucket</th><th>Start</th><th>End</th><th>Assets</th><th>Liabilities</th><th>Net gap</th><th>Cumulative gap</th></tr></thead>
      <tbody>{gap.buckets.map((bucket) => <tr key={bucket.id}><td><strong>{bucket.label}</strong><small>{bucket.flows.length} flows</small></td><td>{formatDate(bucket.startDate)}</td><td>{formatDate(bucket.endDate)}</td><td className="positive-value">{formatMoney(bucket.assets, gap.currency)}</td><td className="negative-value">{formatMoney(bucket.liabilities, gap.currency)}</td><td className={bucket.netGap < 0 ? "negative-value" : "positive-value"}>{formatMoney(bucket.netGap, gap.currency)}</td><td className={bucket.cumulativeGap < 0 ? "negative-value" : "positive-value"}>{formatMoney(bucket.cumulativeGap, gap.currency)}</td></tr>)}</tbody>
    </table></div>
    {gap.ignoredItems.length > 0 && <p className="maturity-note">{gap.ignoredItems.length} records were excluded from the maturity gap because of missing maturity/amount data, currency mismatch, or duplicate debt references.</p>}
  </section>;
}

function DebtWallChart({
  funding,
}: {
  funding: DebtFunding;
}) {
  const buckets = funding.maturityBuckets;
  const maximum = Math.max(
    ...buckets.map(
      (bucket) =>
        bucket.maturingDebt,
    ),
    1,
  );

  return <div className="debt-wall-chart" role="img" aria-label="36-month debt maturity wall">
    {buckets.map((bucket) => {
      const isLargest =
        bucket.id ===
        funding.largestMaturityWallBucketId;
      return <div className={`debt-wall-column ${isLargest ? "largest" : ""}`} key={bucket.id}>
        <span className="debt-wall-value">{formatMoney(bucket.maturingDebt, funding.currency)}</span>
        <div className="debt-wall-track"><i style={{ height: `${Math.max(bucket.maturingDebt > 0 ? 8 : 0, bucket.maturingDebt / maximum * 100)}%` }} /></div>
        <strong>{bucket.id === "overdue" ? "Overdue" : bucket.id === "over36m" ? ">36A" : bucket.id}</strong>
        <small>{bucket.label}</small>
      </div>;
    })}
  </div>;
}

function DebtFundingPanel({
  funding,
}: {
  funding: DebtFunding;
}) {
  const largestBucket =
    funding.maturityBuckets.find(
      (bucket) =>
        bucket.id ===
        funding.largestMaturityWallBucketId,
    );
  const needsFunding =
    funding.refinancingNeed12M > 0;

  return <section className="panel debt-panel" id="debt-funding">
    <div className="section-heading">
      <div><span className="eyebrow">36-month funding view</span><h2>Debt &amp; Funding</h2><p>Debt maturity wall, refinancing capacity, and lender concentration</p></div>
      <div className="concentration-score"><span>Top 3 lenders</span><strong>%{funding.top3LenderConcentration.toFixed(1)}</strong></div>
    </div>
    <div className="debt-summary">
      <MetricCard label="Total financial debt" value={formatMoney(funding.debtOutstanding, funding.currency)} />
      <MetricCard label="Debt due in 12M" value={formatMoney(funding.debtDue12M, funding.currency)} tone="warning" />
      <MetricCard label="12M refinancing gap" value={formatMoney(funding.refinancingNeed12M, funding.currency)} tone={needsFunding ? "negative" : "positive"} />
      <MetricCard label="Available facilities" value={formatMoney(funding.availableFacilities, funding.currency)} tone="positive" />
      <MetricCard label="Facility utilization" value={`%${funding.facilityUtilizationPercent.toFixed(1)}`} detail={`${formatMoney(funding.drawnFacilities, funding.currency)} / ${formatMoney(funding.committedFacilities, funding.currency)}`} tone={funding.facilityUtilizationPercent > 75 ? "warning" : "neutral"} />
      <MetricCard label="Largest maturity wall" value={formatMoney(funding.largestMaturityWall, funding.currency)} detail={largestBucket?.label ?? "—"} tone="negative" />
    </div>
    <div className={`debt-status ${needsFunding ? "status-negative" : "status-positive"}`}><strong>{needsFunding ? "Refinancing plan required" : "Available facility capacity is sufficient"}</strong><span>{needsFunding ? `Over the next 12 months, ${formatMoney(funding.refinancingNeed12M, funding.currency)} remains uncovered after available facilities.` : "Available committed facilities cover debt maturities over the next 12 months."}</span></div>
    <div className="debt-layout">
      <div className="debt-wall-section"><h3>Quarterly debt maturity wall</h3><DebtWallChart funding={funding} /></div>
      <div className="lender-section"><h3>Lender concentration</h3>{funding.lenders.slice(0, 6).map((lender) => <div className="lender-row" key={lender.lender}>
        <div><strong>{lender.lender}</strong><span>{formatMoney(lender.debtOutstanding, funding.currency)} debt · {formatMoney(lender.availableFacilities, funding.currency)} available facilities</span></div>
        <div className="share-bar"><span style={{ width: `${Math.min(100, lender.sharePercent)}%` }} /></div>
        <b>%{lender.sharePercent.toFixed(1)}</b>
      </div>)}</div>
    </div>
    <div className="table-scroll debt-table-wrap"><table className="debt-table">
      <thead><tr><th>Lender</th><th>Financial debt</th><th>Committed facilities</th><th>Drawn facilities</th><th>Available facilities</th><th>Funding share</th></tr></thead>
      <tbody>{funding.lenders.map((lender) => <tr key={lender.lender}><td><strong>{lender.lender}</strong><small>{lender.debtCount} debt instruments · {lender.facilityCount} facilities</small></td><td>{formatMoney(lender.debtOutstanding, funding.currency)}</td><td>{formatMoney(lender.committedFacilities, funding.currency)}</td><td>{formatMoney(lender.drawnFacilities, funding.currency)}</td><td className="positive-value">{formatMoney(lender.availableFacilities, funding.currency)}</td><td>%{lender.sharePercent.toFixed(1)}</td></tr>)}</tbody>
    </table></div>
    {funding.ignoredItems.length > 0 && <p className="maturity-note">{funding.ignoredItems.length} debt/facility records were excluded fully or from the maturity wall because of missing maturity, missing principal, currency mismatch, or duplicate references.</p>}
  </section>;
}

function RepricingChart({
  risk,
}: {
  risk: InterestRateRisk;
}) {
  const maximum = Math.max(
    ...risk.repricingBuckets.map(
      (bucket) => bucket.repricingAmount,
    ),
    1,
  );

  return <div className="repricing-chart" role="img" aria-label="12 aylık faiz yeniden fiyatlama merdiveni">
    {risk.repricingBuckets.map((bucket) => {
      const floatingHeight = bucket.floatingAmount / maximum * 100;
      const fixedHeight = bucket.fixedRefinancingAmount / maximum * 100;
      return <div className="repricing-column" key={bucket.id}>
        <span>{formatMoney(bucket.repricingAmount, risk.currency)}</span>
        <div className="repricing-track">
          <i className="repricing-fixed" style={{ height: `${fixedHeight}%` }} />
          <i className="repricing-floating" style={{ height: `${floatingHeight}%` }} />
        </div>
        <strong>{bucket.id === "over12m" ? ">12A" : bucket.id}</strong>
        <small>{bucket.label}</small>
      </div>;
    })}
  </div>;
}

function InterestRateRiskPanel({
  risk,
}: {
  risk: InterestRateRisk;
}) {
  const repricingShare =
    risk.totalInterestBearingDebt === 0
      ? 0
      : risk.repricingExposure12M /
        risk.totalInterestBearingDebt * 100;
  const incompleteData =
    risk.rateCoveragePercent < 90 ||
    risk.unclassifiedRateDebt > 0;
  const elevatedRisk =
    repricingShare > 50;
  const status = incompleteData
    ? {
        tone: "status-warning",
        title: "Interest-rate data incomplete",
        sentence: `Interest rates are available for %${risk.rateCoveragePercent.toFixed(1)} of the portfolio; missing rate type or rate data limits the sensitivity analysis.`,
      }
    : elevatedRisk
      ? {
          tone: "status-negative",
          title: "Elevated interest-rate risk",
          sentence: `%${repricingShare.toFixed(1)} of the debt portfolio is exposed to floating rates or refinancing over the next 12 months.`,
        }
      : {
          tone: "status-positive",
          title: "Interest-rate risk controlled",
          sentence: `12-month repricing exposure represents %${repricingShare.toFixed(1)} of total debt.`,
        };

  return <section className="panel rate-panel" id="interest-rate-risk">
    <div className="section-heading">
      <div><span className="eyebrow">12-month repricing view</span><h2>Interest Rate Risk</h2><p>Fixed/floating debt mix, refinancing exposure, and annualized rate-shock impact</p></div>
      <div className="rate-coverage"><span>Rate-data coverage</span><strong>%{risk.rateCoveragePercent.toFixed(1)}</strong></div>
    </div>
    <div className="rate-summary">
      <MetricCard label="Interest-bearing debt" value={formatMoney(risk.totalInterestBearingDebt, risk.currency)} />
      <MetricCard label="Floating-rate debt" value={formatMoney(risk.floatingRateDebt, risk.currency)} detail={`%${risk.floatingRateSharePercent.toFixed(1)} portfolio share`} tone="warning" />
      <MetricCard label="12A repricing exposure" value={formatMoney(risk.repricingExposure12M, risk.currency)} detail={`%${repricingShare.toFixed(1)} portfolio share`} tone={elevatedRisk ? "negative" : "warning"} />
      <MetricCard label="12A repricing gap" value={formatMoney(risk.repricingGap12M, risk.currency)} tone="negative" />
      <MetricCard label="Weighted average rate" value={`%${risk.weightedAverageRatePercent.toFixed(1)}`} detail="Debt with known rate" />
      <MetricCard label="Annual interest expense" value={formatMoney(risk.currentAnnualInterestExpense, risk.currency)} />
    </div>
    <div className={`rate-status ${status.tone}`}><strong>{status.title}</strong><span>{status.sentence}</span></div>
    <div className="rate-layout">
      <div className="rate-profile">
        <h3>Debt-rate mix</h3>
        <div className="rate-mix-bar">
          <i className="mix-fixed" style={{ width: `${risk.fixedRateSharePercent}%` }} />
          <i className="mix-floating" style={{ width: `${risk.floatingRateSharePercent}%` }} />
          <i className="mix-unknown" style={{ width: `${Math.max(0, 100 - risk.fixedRateSharePercent - risk.floatingRateSharePercent)}%` }} />
        </div>
        <div className="rate-mix-legend">
          <span><i className="mix-fixed" />Fixed <strong>{formatMoney(risk.fixedRateDebt, risk.currency)}</strong></span>
          <span><i className="mix-floating" />Floating <strong>{formatMoney(risk.floatingRateDebt, risk.currency)}</strong></span>
          <span><i className="mix-unknown" />Unclassified <strong>{formatMoney(risk.unclassifiedRateDebt, risk.currency)}</strong></span>
        </div>
        <h3 className="repricing-title">Repricing ladder</h3>
        <div className="repricing-legend"><span><i className="repricing-floating" />Floating rate</span><span><i className="repricing-fixed" />Fixed-debt refinancing</span></div>
        <RepricingChart risk={risk} />
      </div>
      <div className="sensitivity-section">
        <h3>Rate-shock sensitivity</h3>
        <p>Annualized run-rate impact on 12-month repricing exposure</p>
        {risk.sensitivityScenarios.map((scenario) => <div className="sensitivity-card" key={scenario.shockBps}>
          <span>+{scenario.shockBps} bp</span>
          <div><strong>+{formatMoney(scenario.annualizedInterestIncrease, risk.currency)}</strong><small>additional annual interest expense</small></div>
          <div><b>{formatMoney(scenario.shockedAnnualInterestExpense, risk.currency)}</b><small>post-shock expense</small></div>
        </div>)}
        <div className="repricing-breakdown"><span>Floating-rate exposure <strong>{formatMoney(risk.floatingExposure, risk.currency)}</strong></span><span>12M fixed-rate refinancing <strong>{formatMoney(risk.fixedRefinancingExposure12M, risk.currency)}</strong></span></div>
      </div>
    </div>
    <div className="table-scroll rate-table-wrap"><table className="rate-table">
      <thead><tr><th>Lender</th><th>Total debt</th><th>Fixed</th><th>Floating</th><th>12A repricing</th><th>Annual interest expense</th><th>Data coverage</th></tr></thead>
      <tbody>{risk.lenders.map((lender) => <tr key={lender.lender}><td><strong>{lender.lender}</strong><small>{lender.instrumentCount} instruments</small></td><td>{formatMoney(lender.totalDebt, risk.currency)}</td><td>{formatMoney(lender.fixedRateDebt, risk.currency)}</td><td className="warning-value">{formatMoney(lender.floatingRateDebt, risk.currency)}</td><td className={lender.repricingExposure12M > lender.totalDebt / 2 ? "negative-value" : ""}>{formatMoney(lender.repricingExposure12M, risk.currency)}</td><td>{formatMoney(lender.annualInterestExpense, risk.currency)}</td><td>%{lender.rateCoveragePercent.toFixed(1)}</td></tr>)}</tbody>
    </table></div>
    {risk.dataIssues.length > 0 && <p className="maturity-note">{risk.dataIssues.length} rate-data findings remain: missing type/rate/maturity, currency mismatch, or duplicate debt references affect sensitivity coverage.</p>}
  </section>;
}

const FUNDING_ACTION_LABELS: Record<FundingPlanActionType, string> = {
  RAISE_EXTERNAL_FUNDING: "Raise term funding",
  RESERVE_COMMITTED_FACILITIES: "Reserve committed facilities",
  REFINANCE_MATURITY_WALL: "Refinance maturity wall",
  DIVERSIFY_LENDERS: "Diversify lender base",
};

const FUNDING_ACTION_DETAILS: Record<FundingPlanActionType, string> = {
  RAISE_EXTERNAL_FUNDING: "Secure external funding to protect the policy buffer.",
  RESERVE_COMMITTED_FACILITIES: "Reserve available facility capacity for the planned period.",
  REFINANCE_MATURITY_WALL: "Complete refinancing discussions before the concentrated maturity period.",
  DIVERSIFY_LENDERS: "Reduce top-three lender concentration with alternative capacity.",
};

function FundingPlanPanel({ plan }: { plan: FundingPlan }) {
  const externalRequired = plan.externalFundingNeed > 0;
  const facilityRequired = plan.plannedFacilityDraw > 0;
  const status = externalRequired
    ? {
        tone: "status-negative",
        title: "External funding action required",
        sentence: `${formatMoney(plan.plannedFacilityDraw, plan.currency)} after planned facility drawings, ${formatMoney(plan.externalFundingNeed, plan.currency)} of additional funding is required.`,
      }
    : facilityRequired
      ? {
          tone: "status-warning",
          title: "Committed facility reservation required",
          sentence: `${formatMoney(plan.plannedFacilityDraw, plan.currency)} of available facilities is reserved, the policy buffer is maintained.`,
        }
      : {
          tone: "status-positive",
          title: "Funding plan balanced",
          sentence: "Contractual cash flows preserve the policy buffer without additional funding.",
        };

  return <section className="panel funding-plan-panel" id="funding-plan">
    <div className="section-heading">
      <div><span className="eyebrow">12-month action plan</span><h2>Funding Plan &amp; Recommendations</h2><p>Timing of committed-facility drawings and external funding required to close contractual liquidity gaps</p></div>
      <span className={`funding-plan-badge plan-${plan.status.toLowerCase()}`}>{plan.status === "FUNDED" ? "Funded" : plan.status === "FACILITY_DRAW_REQUIRED" ? "Facility draw" : "External funding"}</span>
    </div>
    <div className="funding-plan-summary">
      <MetricCard label="Total funding requirement" value={formatMoney(plan.totalFundingRequirement, plan.currency)} tone={plan.totalFundingRequirement > 0 ? "warning" : "positive"} />
      <MetricCard label="Planned facility draw" value={formatMoney(plan.plannedFacilityDraw, plan.currency)} tone={plan.plannedFacilityDraw > 0 ? "warning" : "positive"} />
      <MetricCard label="External funding need" value={formatMoney(plan.externalFundingNeed, plan.currency)} tone={externalRequired ? "negative" : "positive"} />
      <MetricCard label="First action date" value={formatDate(plan.firstActionDate)} detail={plan.peakFundingBucketId ?? "No action"} tone={plan.firstActionDate ? "warning" : "positive"} />
    </div>
    <div className={`funding-plan-status ${status.tone}`}><strong>{status.title}</strong><span>{status.sentence}</span></div>
    <div className="funding-plan-layout">
      <div className="funding-plan-actions"><h3>Recommended actions</h3>{plan.actions.length > 0 ? <ol>{plan.actions.map((action) => <li key={`${action.priority}-${action.actionType}`}><b>{action.priority}</b><div><strong>{FUNDING_ACTION_LABELS[action.actionType]}</strong><p>{FUNDING_ACTION_DETAILS[action.actionType]}</p><small>{action.dueDate ? `${formatDate(action.dueDate)} by` : "During the management planning period"}</small></div>{action.amount !== null && <span>{formatMoney(action.amount, plan.currency)}</span>}</li>)}</ol> : <p className="command-empty">No open funding actions.</p>}</div>
      <div className="table-scroll funding-plan-table-wrap"><table className="funding-plan-table"><thead><tr><th>Period</th><th>Contractual liquidity</th><th>New facility draw</th><th>New external funding</th><th>Post-plan liquidity</th><th>Remaining facilities</th></tr></thead><tbody>{plan.buckets.map((bucket) => <tr key={bucket.bucketId}><td><strong>{bucket.label}</strong><small>{formatDate(bucket.startDate)}</small></td><td className={bucket.contractualLiquidity < plan.policyBuffer ? "negative-value" : "positive-value"}>{formatMoney(bucket.contractualLiquidity, plan.currency)}</td><td className="warning-value">{formatMoney(bucket.incrementalFacilityDraw, plan.currency)}</td><td className={bucket.incrementalExternalFunding > 0 ? "negative-value" : ""}>{formatMoney(bucket.incrementalExternalFunding, plan.currency)}</td><td className="positive-value">{formatMoney(bucket.liquidityAfterPlan, plan.currency)}</td><td>{formatMoney(bucket.facilityHeadroomRemaining, plan.currency)}</td></tr>)}</tbody></table></div>
    </div>
  </section>;
}

const POLICY_LIMIT_LABELS: Record<PolicyLimitId, string> = {
  LIQUIDITY_BUFFER: "Liquidity buffer",
  FACILITY_UTILIZATION: "Facility draw",
  LENDER_CONCENTRATION: "Lender concentration",
  FLOATING_RATE_SHARE: "Floating-rate share",
  REFINANCING_COVERAGE: "12M refinancing coverage",
  EXTERNAL_FUNDING_NEED: "External funding need",
};

const POLICY_LIMIT_ACTIONS: Record<PolicyLimitId, string> = {
  LIQUIDITY_BUFFER: "Activate the cash-protection and facility-reservation plan.",
  FACILITY_UTILIZATION: "Add committed capacity or reduce utilization.",
  LENDER_CONCENTRATION: "Build alternative lender capacity.",
  FLOATING_RATE_SHARE: "Increase the fixed-rate share of new funding.",
  REFINANCING_COVERAGE: "Secure refinancing capacity for maturing debt.",
  EXTERNAL_FUNDING_NEED: "Obtain term-funding approval before the first funding-need date.",
};

function formatPolicyValue(
  check: PolicyLimitCheck,
  currency: string,
): string {
  return check.unit === "PERCENT"
    ? `%${check.actualValue.toFixed(1)}`
    : formatMoney(check.actualValue, currency);
}

function formatPolicyLimit(
  check: PolicyLimitCheck,
  currency: string,
): string {
  const operator = check.operator === "MINIMUM" ? "≥" : "≤";
  const value = check.unit === "PERCENT"
    ? `%${check.limitValue.toFixed(1)}`
    : formatMoney(check.limitValue, currency);
  return `${operator} ${value}`;
}

function PolicyLimitsPanel({ limits }: { limits: PolicyLimits }) {
  return <section className="panel policy-limits-panel" id="policy-limits">
    <div className="section-heading">
      <div><span className="eyebrow">ALCO risk appetite</span><h2>Covenant &amp; Policy Limits</h2><p>Liquidity, funding, concentration, and rate limits measurable from the current ALM dataset</p></div>
      <span className={`policy-overall status-${limits.overallStatus.toLowerCase()}`}>{limits.overallStatus === "COMPLIANT" ? "Within limits" : limits.overallStatus === "WATCH" ? "Watch" : `${limits.counts.BREACH} limit breaches`}</span>
    </div>
    <div className="policy-summary">
      <MetricCard label="Total checks" value={String(limits.checks.length)} />
      <MetricCard label="Within limits" value={String(limits.counts.PASS)} tone="positive" />
      <MetricCard label="Watch" value={String(limits.counts.WATCH)} tone="warning" />
      <MetricCard label="Limit breaches" value={String(limits.counts.BREACH)} tone={limits.counts.BREACH > 0 ? "negative" : "positive"} />
    </div>
    <div className="table-scroll policy-table-wrap"><table className="policy-table"><thead><tr><th>Policy limit</th><th>Actual</th><th>Limit</th><th>Headroom</th><th>Status</th><th>Management action</th></tr></thead><tbody>{limits.checks.map((check) => <tr className={`policy-row status-${check.status.toLowerCase()}`} key={check.id}><td><strong>{POLICY_LIMIT_LABELS[check.id]}</strong><small>{check.category}</small></td><td>{formatPolicyValue(check, limits.currency)}</td><td>{formatPolicyLimit(check, limits.currency)}</td><td className={check.headroom < 0 ? "negative-value" : "positive-value"}>{check.unit === "PERCENT" ? `${check.headroom.toFixed(1)} pts` : formatMoney(check.headroom, limits.currency)}</td><td><span className="policy-status">{check.status === "PASS" ? "Pass" : check.status === "WATCH" ? "Watch" : "Breach"}</span></td><td>{check.status === "PASS" ? "No action required." : POLICY_LIMIT_ACTIONS[check.id]}</td></tr>)}</tbody></table></div>
    <p className="policy-scope-note">Financial covenants such as Net Debt/EBITDA and interest coverage can be added once balance-sheet and income-statement data are connected.</p>
  </section>;
}

function ChangesPanel({ response }: { response: TreasuryAnalysisResponse }) {
  const changes = response.changes;
  return <section className="panel changes-panel" id="what-changed">
    <div className="section-heading"><div><span className="eyebrow">Period comparison</span><h2>What Changed</h2><p>Liquidity movements between the previous and current datasets</p></div>{changes && <span className={`reconcile-badge ${changes.movement.status.toLowerCase()}`}>{changes.movement.status === "RECONCILED" ? "Movement reconciled" : "Unexplained movement"}</span>}</div>
    {!changes ? <div className="empty-state"><Icon name="changes" /><strong>Previous period required for comparison</strong><p>Add previous-period CSVs in the importer to identify date shifts, amount changes, new items, and removed items.</p></div> : <>
      <div className="change-summary">
        <MetricCard label="Amount changes" value={String(changes.comparison.summary.amountChanges)} />
        <MetricCard label="Date shifts" value={String(changes.comparison.summary.dateShifts)} />
        <MetricCard label="New items" value={String(changes.comparison.summary.newItems)} />
        <MetricCard label="Removed items" value={String(changes.comparison.summary.removedItems)} />
        <MetricCard label="Total liquidity impact" value={formatMoney(changes.comparison.summary.totalLiquidityImpact, response.analysis.currency)} tone={changes.comparison.summary.totalLiquidityImpact < 0 ? "negative" : "positive"} />
      </div>
      <div className="movement-bridge"><span>Forecast movement <strong>{formatMoney(changes.movement.forecastMovement, response.analysis.currency)}</strong></span><span>Identified drivers <strong>{formatMoney(changes.movement.identifiedDriverImpact, response.analysis.currency)}</strong></span><span>Unexplained <strong>{formatMoney(changes.movement.unexplainedMovement, response.analysis.currency)}</strong></span></div>
      <div className="table-scroll"><table className="changes-table"><thead><tr><th>Change</th><th>Counterparty / document</th><th>Previous</th><th>Current</th><th>Liquidity impact</th></tr></thead><tbody>{changes.comparison.changes.map((change) => <tr key={change.stableId}><td><span className={`change-type type-${change.changeType.toLowerCase()}`}>{change.changeType.replaceAll("_", " ")}</span></td><td><strong>{change.counterpartyName ?? "—"}</strong><small>{change.documentNo ?? change.datasetType}</small></td><td>{change.previousDate ? formatDate(change.previousDate) : "—"}<small>{change.previousAmount === null ? "" : formatMoney(change.previousAmount, change.currency ?? response.analysis.currency)}</small></td><td>{change.currentDate ? formatDate(change.currentDate) : "—"}<small>{change.currentAmount === null ? "" : formatMoney(change.currentAmount, change.currency ?? response.analysis.currency)}</small></td><td className={change.liquidityImpact < 0 ? "negative-value" : "positive-value"}>{formatMoney(change.liquidityImpact, change.currency ?? response.analysis.currency)}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}

const EXECUTIVE_STATUS_LABELS: Record<ExecutiveStatus, string> = {
  HEALTHY: "Healthy",
  WATCH: "Watch",
  ACTION_REQUIRED: "Action required",
  CRITICAL: "Critical",
};

const EXECUTIVE_PILLAR_LABELS: Record<ExecutivePillarId, string> = {
  LIQUIDITY: "Liquidity",
  STRESS: "Stress resilience",
  MATURITY: "Maturity profile",
  FUNDING: "Funding",
  RATE: "Interest-rate risk",
  DATA: "Data coverage",
};

function CommandKpi({ label, value, detail, tone }: {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "negative" | "warning" | "violet";
}) {
  return <article className={`command-kpi command-${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function ExecutiveOverviewPanel({ response }: { response: TreasuryAnalysisResponse }) {
  const { analysis } = response;
  const { executiveOverview: overview, metrics, maturityGap, debtFunding, interestRateRisk, fundingPlan, policyLimits, stress } = analysis;
  const plusTwoHundred = interestRateRisk.sensitivityScenarios.find((scenario) => scenario.shockBps === 200);
  const headline = overview.status === "CRITICAL"
    ? "Immediate ALM action is required."
    : overview.status === "ACTION_REQUIRED"
      ? "The 12-month ALM profile requires management action."
      : overview.status === "WATCH"
        ? "The position is funded, but key risk limits require monitoring."
        : "The ALM position remains within the modeled policy range.";
  const dominantRisk = overview.dominantRiskPillar ? EXECUTIVE_PILLAR_LABELS[overview.dominantRiskPillar] : "No dominant risk";
  const actions = fundingPlan.actions.slice(0, 4);
  const lenders = debtFunding.lenders.slice(0, 5);

  return <section className={`alco-command executive-${overview.status.toLowerCase()}`} aria-labelledby="executive-title">
    <div className="command-kpi-row">
      <article className="command-verdict">
        <div><span className="eyebrow">Management assessment</span><h2 id="executive-title">{headline}</h2><p>{overview.statusCounts.CRITICAL + overview.statusCounts.ACTION_REQUIRED} action areas · Dominant risk: <strong>{dominantRisk}</strong></p></div>
        <span className="executive-status">{EXECUTIVE_STATUS_LABELS[overview.status]}</span>
      </article>
      <CommandKpi label="Available liquidity" value={formatMoney(metrics.availableLiquidity, analysis.currency)} detail={`Minimum ${formatMoney(metrics.minimumForecastCash, analysis.currency)} · ${formatDate(metrics.minimumForecastCashDate)}`} tone="positive" />
      <CommandKpi label="12M refinancing gap" value={formatMoney(debtFunding.refinancingNeed12M, analysis.currency)} detail={`${formatMoney(debtFunding.debtDue12M, analysis.currency)} due within 12M`} tone={debtFunding.refinancingNeed12M > 0 ? "negative" : "positive"} />
      <CommandKpi label="Residual Funding Gap" value={formatMoney(maturityGap.residualFundingNeed, analysis.currency)} detail={`Minimum gap ${formatMoney(maturityGap.minimumCumulativeGap12M, analysis.currency)}`} tone={maturityGap.residualFundingNeed > 0 ? "negative" : "positive"} />
      <CommandKpi label="+200 bp rate impact" value={`+${formatMoney(plusTwoHundred?.annualizedInterestIncrease ?? 0, analysis.currency)}`} detail={`${formatMoney(interestRateRisk.repricingExposure12M, analysis.currency)} repricing exposure`} tone="warning" />
    </div>
    <div className="command-grid">
      <article className="command-panel command-maturity">
        <header><div><span>12-month maturity view</span><h3>Cumulative Maturity Gap</h3></div><div className="command-legend"><span><i className="asset" />Assets</span><span><i className="liability" />Liabilities</span><span><i className="cumulative" />Cumulative gap</span></div></header>
        <MaturityGapChart gap={maturityGap} />
        <div className="command-stat-strip"><span>12M assets<strong>{formatMoney(maturityGap.totalAssets12M, analysis.currency)}</strong></span><span>12M liabilities<strong>{formatMoney(maturityGap.totalLiabilities12M, analysis.currency)}</strong></span><span>Minimum gap<strong className={maturityGap.minimumCumulativeGap12M < 0 ? "risk" : "safe"}>{formatMoney(maturityGap.minimumCumulativeGap12M, analysis.currency)}</strong></span></div>
      </article>
      <div className="command-middle-column">
        <article className="command-panel command-funding"><header><div><span>36-month view</span><h3>Funding Wall</h3></div><strong className="risk">{formatMoney(debtFunding.largestMaturityWall, analysis.currency)}</strong></header><DebtWallChart funding={debtFunding} /></article>
        <article className="command-panel command-repricing"><header><div><span>Rate structure</span><h3>Repricing Profile</h3></div><strong className="warning">%{interestRateRisk.floatingRateSharePercent.toFixed(1)} floating</strong></header><RepricingChart risk={interestRateRisk} /></article>
      </div>
      <article className="command-panel command-actions"><header><div><span>12-month action plan</span><h3>Funding Plan</h3></div><b>{actions.length}</b></header>{actions.length > 0 ? <ol>{actions.map((action) => <li key={`${action.priority}-${action.actionType}`}><b>{action.priority}</b><div><strong>{FUNDING_ACTION_LABELS[action.actionType]}</strong><p>{FUNDING_ACTION_DETAILS[action.actionType]}{action.dueDate ? ` Due: ${formatDate(action.dueDate)}.` : ""}</p></div>{action.amount !== null && action.amount > 0 && <span>{formatMoney(action.amount, analysis.currency)}</span>}</li>)}</ol> : <p className="command-empty">No open funding actions.</p>}<a href="#funding-plan">View funding-plan details →</a></article>
      <article className="command-panel command-stress"><header><div><span>90-day resilience</span><h3>Stress Matrix</h3></div></header><div className="command-table"><div className="command-table-head"><span>Scenario</span><span>Minimum cash</span><span>Funding</span><span>Breach</span></div>{stress.scenarios.map((scenario) => <div className={`command-table-row command-scenario-${scenario.name.toLowerCase()}`} key={scenario.name}><strong><i />{scenario.label}</strong><span className={scenario.minimumLiquidity < 0 ? "risk" : "safe"}>{formatMoney(scenario.minimumLiquidity, analysis.currency)}</span><span>{formatMoney(scenario.fundingNeed, analysis.currency)}</span><span>{scenario.firstThresholdBreachDate ? formatDate(scenario.firstThresholdBreachDate) : "—"}</span></div>)}</div></article>
      <article className="command-panel command-lenders"><header><div><span>Funding sources</span><h3>Lender Concentration</h3></div><strong className={debtFunding.top3LenderConcentration > 70 ? "warning" : "safe"}>%{debtFunding.top3LenderConcentration.toFixed(1)}</strong></header>{lenders.map((lender) => <div className="command-lender-row" key={lender.lender}><div><strong>{lender.lender}</strong><small>{formatMoney(lender.debtOutstanding, analysis.currency)} debt · {formatMoney(lender.availableFacilities, analysis.currency)} available facilities</small></div><span><i style={{ width: `${Math.min(100, lender.sharePercent)}%` }} /></span><b>%{lender.sharePercent.toFixed(1)}</b></div>)}</article>
    </div>
    <article className="command-policy"><header><div><span>ALCO risk appetite</span><h3>Policy Limit Monitor</h3></div><strong className={policyLimits.counts.BREACH > 0 ? "risk" : policyLimits.counts.WATCH > 0 ? "warning" : "safe"}>{policyLimits.counts.BREACH > 0 ? `${policyLimits.counts.BREACH} breaches` : policyLimits.counts.WATCH > 0 ? `${policyLimits.counts.WATCH} watch` : "Within limits"}</strong></header><div className="command-policy-grid">{policyLimits.checks.map((check) => <a className={`command-policy-check status-${check.status.toLowerCase()}`} href="#policy-limits" key={check.id}><span>{POLICY_LIMIT_LABELS[check.id]}</span><strong>{formatPolicyValue(check, policyLimits.currency)}</strong><small>Limit {formatPolicyLimit(check, policyLimits.currency)}</small></a>)}</div></article>
    {overview.dataQualityFindings > 0 && <p className="command-data-note">Data coverage: {overview.dataQualityFindings} findings require review. Source records can be updated from the Data &amp; Inputs bar.</p>}
  </section>;
}

function Dashboard({ response, selectedDate, refreshingGap, onDateSelect }: { response: TreasuryAnalysisResponse; selectedDate: string; refreshingGap: boolean; onDateSelect: (date: string) => void }) {
  const { analysis } = response;
  const { stress, gapDrivers, maturityGap, debtFunding, interestRateRisk, fundingPlan, policyLimits } = analysis;
  return <>
    <ExecutiveOverviewPanel response={response} />
    <section className="detail-heading" id="detail-analyses"><div><span className="eyebrow">Analytical workspace</span><h2>Detailed Analyses</h2></div><p>Calculation layers behind the risks and actions in the executive overview</p></section>
    <section className="panel forecast-panel detail-panel" id="forecast">
      <div className="section-heading"><div><span className="eyebrow">90-day view</span><h2>Liquidity & Stress Scenarios</h2><p>Click a date on the chart to open its Gap Drivers analysis.</p></div><div className="legend">{stress.scenarios.map((scenario) => <span key={scenario.name}><i className={`scenario-${scenario.name.toLowerCase()}`} />{scenario.label}</span>)}</div></div>
      <StressChart scenarios={stress.scenarios} threshold={stress.minimumLiquidityThreshold} selectedDate={selectedDate} onDateSelect={onDateSelect} />
      {refreshingGap && <p className="refresh-note">Refreshing selected-day drivers…</p>}
      <ScenarioTable scenarios={stress.scenarios} currency={analysis.currency} />
    </section>
    <MaturityGapPanel gap={maturityGap} />
    <DebtFundingPanel funding={debtFunding} />
    <InterestRateRiskPanel risk={interestRateRisk} />
    <FundingPlanPanel plan={fundingPlan} />
    <PolicyLimitsPanel limits={policyLimits} />
    <GapDriverPanel gap={gapDrivers} />
    <ChangesPanel response={response} />
  </>;
}

function App() {
  const [uploads, setUploads] = useState<UploadGroups>(makeUploadGroups);
  const [importerExpanded, setImporterExpanded] = useState(true);
  const [dataWorkspaceOpen, setDataWorkspaceOpen] = useState(true);
  const [parameters, setParameters] = useState<AnalysisParameters>({ currency: "TRY", asOfDate: "2026-08-14", openingLiquidity: 42_000_000, unusedCommittedFacilities: 20_000_000, minimumLiquidityBuffer: 15_000_000 });
  const [response, setResponse] = useState<TreasuryAnalysisResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [refreshingGap, setRefreshingGap] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState("2026-09-03");
  const [manualPositionCount, setManualPositionCount] = useState(0);
  const currentIds = useMemo(() => DATASETS.flatMap((dataset) => uploads.current[dataset].importId ?? []), [uploads]);
  const previousIds = useMemo(() => DATASETS.flatMap((dataset) => uploads.previous[dataset].importId ?? []), [uploads]);
  const handlePositionSummary = useCallback((positionSummary: AlmPositionSummary) => {
    const count = positionSummary.cashPositions + positionSummary.facilityPositions;
    setManualPositionCount(count);
    if (count > 0) {
      setParameters((current) => ({ ...current, openingLiquidity: positionSummary.availableCash, unusedCommittedFacilities: positionSummary.availableFacilities }));
    }
  }, []);

  async function handleFile(period: UploadPeriod, dataset: DatasetType, file: File) {
    setUploads((current) => ({ ...current, [period]: { ...current[period], [dataset]: { ...EMPTY_UPLOAD, status: "uploading", fileName: file.name } } }));
    try {
      const result = await analyzeImport(file, dataset);
      setUploads((current) => ({ ...current, [period]: { ...current[period], [dataset]: { status: "ready", fileName: file.name, importId: result.import.importId, result, error: null } } }));
    } catch (error) {
      setUploads((current) => ({ ...current, [period]: { ...current[period], [dataset]: { ...EMPTY_UPLOAD, status: "error", fileName: file.name, error: error instanceof Error ? error.message : "Dosya analiz edilemedi." } } }));
    }
  }
  function handleParameter(key: keyof AnalysisParameters, value: string) {
    setParameters((current) => ({ ...current, [key]: key === "currency" || key === "asOfDate" ? value : (Number(value) || 0) * 1_000_000 }));
  }
  async function runAnalysis(gapTargetDate?: string) {
    if (currentIds.length === 0 && manualPositionCount === 0) { setAnalysisError("Add at least one current CSV or manual ALM position, or open the demo data."); return; }
    setRunning(true); setAnalysisError(null); setDemoMode(false);
    try {
      const next = await analyzeTreasury({ ...parameters, importIds: currentIds, ...(previousIds.length > 0 ? { previousImportIds: previousIds } : {}), ...(gapTargetDate ? { gapTargetDate } : {}) });
      setResponse(next); setSelectedDate(next.analysis.gapDrivers.targetDate); setImporterExpanded(false); setDataWorkspaceOpen(false);
    } catch (error) { setAnalysisError(error instanceof Error ? error.message : "CFO analysis could not be generated."); }
    finally { setRunning(false); }
  }
  function loadDemo() {
    setResponse(DEMO_RESPONSE); setDemoMode(true); setSelectedDate(DEMO_RESPONSE.analysis.gapDrivers.targetDate); setAnalysisError(null); setImporterExpanded(false); setDataWorkspaceOpen(false);
  }
  async function loadSamples() {
    setRunning(true); setAnalysisError(null); setDemoMode(false);
    setUploads(() => {
      const next = makeUploadGroups();
      for (const sample of SAMPLE_IMPORTS) {
        next[sample.period][sample.dataset] = { ...EMPTY_UPLOAD, status: "uploading", fileName: sample.path.split("/").at(-1) ?? null };
      }
      return next;
    });
    try {
      const imported = await Promise.all(SAMPLE_IMPORTS.map(async (sample) => {
        const fileResponse = await fetch(sample.path);
        if (!fileResponse.ok) throw new Error(`${sample.path} sample file could not be loaded.`);
        const fileName = sample.path.split("/").at(-1) ?? `${sample.dataset}.csv`;
        const file = new File([await fileResponse.blob()], fileName, { type: "text/csv" });
        const result = await analyzeImport(file, sample.dataset);
        return { ...sample, fileName, result };
      }));
      const nextUploads = makeUploadGroups();
      for (const item of imported) {
        nextUploads[item.period][item.dataset] = { status: "ready", fileName: item.fileName, importId: item.result.import.importId, result: item.result, error: null };
      }
      const sampleCurrentIds = imported.filter((item) => item.period === "current").map((item) => item.result.import.importId);
      const samplePreviousIds = imported.filter((item) => item.period === "previous").map((item) => item.result.import.importId);
      const nextResponse = await analyzeTreasury({ ...parameters, importIds: sampleCurrentIds, previousImportIds: samplePreviousIds });
      setUploads(nextUploads); setResponse(nextResponse); setSelectedDate(nextResponse.analysis.gapDrivers.targetDate); setImporterExpanded(false); setDataWorkspaceOpen(false);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Örnek dosyalar analiz edilemedi.");
      setImporterExpanded(true); setDataWorkspaceOpen(true);
    } finally {
      setRunning(false);
    }
  }
  async function selectGapDate(date: string) {
    if (!date || date === selectedDate) return;
    setSelectedDate(date);
    if (demoMode) {
      const point = DEMO_RESPONSE.analysis.stress.scenarios[0]?.curve.find((item) => item.date === date);
      setResponse((current) => current ? { ...current, analysis: { ...current.analysis, gapDrivers: { ...current.analysis.gapDrivers, targetDate: date, projectedCash: point?.closingLiquidity ?? current.analysis.gapDrivers.projectedCash } } } : current);
      return;
    }
    setRefreshingGap(true);
    try {
      const next = await analyzeTreasury({ ...parameters, importIds: currentIds, ...(previousIds.length > 0 ? { previousImportIds: previousIds } : {}), gapTargetDate: date });
      setResponse(next);
    } catch (error) { setAnalysisError(error instanceof Error ? error.message : "Gap Drivers yenilenemedi."); }
    finally { setRefreshingGap(false); }
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top" aria-label="Corporate ALM Intelligence home"><span className="brand-mark"><i /><i /><i /></span><span>ALM<strong>IQ</strong></span></a>
      <nav aria-label="Main navigation"><a className="active" href="#top" title="Overview"><Icon name="grid" /><span>Overview</span></a><a href="#data-status" title="Data & Inputs" onClick={() => setDataWorkspaceOpen(true)}><Icon name="upload" /><span>Data</span></a><a href="#forecast" title="Liquidity"><Icon name="pulse" /><span>Liquidity</span></a><a href="#maturity-gap" title="Maturity"><Icon name="changes" /><span>Maturity</span></a><a href="#debt-funding" title="Funding"><Icon name="pulse" /><span>Funding</span></a><a href="#interest-rate-risk" title="Faiz"><Icon name="settings" /><span>Rates</span></a></nav>
      <div className="sidebar-foot"><span><i /> API</span></div>
    </aside>
    <main id="top">
      <header className="topbar"><div className="topbar-title"><span className="eyebrow">Corporate Asset-Liability Management</span><h1>ALCO Command Center</h1></div><nav className="command-tabs" aria-label="ALM sections"><a className="active" href="#top">Overview</a><a href="#forecast">Liquidity</a><a href="#maturity-gap">Maturity</a><a href="#debt-funding">Funding</a><a href="#interest-rate-risk">Rates</a><a href="#data-status" onClick={() => setDataWorkspaceOpen(true)}>Data</a></nav><div className="report-context">{demoMode && <span className="demo-badge">DEMO</span>}<span><Icon name="calendar" />{response ? formatDate(response.analysis.asOfDate) : formatDate(parameters.asOfDate)}</span><span className="currency-badge">{response?.analysis.currency ?? parameters.currency}</span><span className="scope-badge">Consolidated</span></div></header>
      <div id="data-status"><DataStatusBar uploads={uploads} demoMode={demoMode} manualPositionCount={manualPositionCount} expanded={dataWorkspaceOpen} onToggle={() => setDataWorkspaceOpen((value) => !value)} /></div>
      {dataWorkspaceOpen && <section className="data-workspace" id="data-workspace" aria-label="Data and manual ALM inputs">
        <Importer uploads={uploads} expanded={importerExpanded} parameters={parameters} running={running} error={analysisError} onToggle={() => setImporterExpanded((value) => !value)} onFile={handleFile} onParameter={handleParameter} onAnalyze={() => void runAnalysis()} onSamples={() => void loadSamples()} onDemo={loadDemo} />
        <AlmPositionsPanel currency={parameters.currency} asOfDate={parameters.asOfDate} onSummaryChange={handlePositionSummary} />
      </section>}
      {response ? <Dashboard response={response} selectedDate={selectedDate} refreshingGap={refreshingGap} onDateSelect={(date) => void selectGapDate(date)} /> : <section className="welcome-state"><span className="welcome-icon"><Icon name="pulse" /></span><span className="eyebrow">LIQUIDITY MODULE</span><h2>Short-term liquidity layer of the ALM view</h2><p>Upload CSV files, run the real pipeline with sample files, or open the demo data to explore the interface.</p><button className="button-primary" onClick={loadDemo}><Icon name="spark" /> Open demo cockpit</button></section>}
      <footer><span>Corporate ALM Intelligence · Deterministic balance-sheet analytics</span><span>Active modules: liquidity + maturity + funding + interest rate risk</span></footer>
    </main>
  </div>;
}

export default App;
