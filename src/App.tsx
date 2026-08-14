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
  CfoMetrics,
  DatasetType,
  GapDrivers,
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
  payables: "Borçlar",
  receivables: "Alacaklar",
  debt: "Finansal Borç",
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
  const compact = new Intl.NumberFormat("tr-TR", {
    notation: "compact",
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(Math.abs(amount));
  const symbol = currency === "TRY" ? "₺" : currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `;
  return `${amount < 0 ? "−" : ""}${symbol}${compact}`;
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

function getVerdictSentence(metrics: CfoMetrics): string {
  if (metrics.fundingNeed90D > 0) {
    return `90 günlük görünümde ${formatMoney(metrics.fundingNeed90D, metrics.currency)} ek fonlama gerekiyor; aksiyon planı bugün devreye alınmalı.`;
  }
  if (metrics.minimumForecastCash < 0) {
    return "Likidite açığı var; taahhütlü limitler açığı karşılıyor, ancak tampon politika seviyesinin altında.";
  }
  if (metrics.liquidityHeadroom <= 0) {
    return "Nakit pozitif kalıyor, ancak politika tamponu aşılıyor; tahsilat ve ödeme takvimi yakından izlenmeli.";
  }
  return "Likidite görünümü sağlıklı; taahhütlü limitler kullanılmadan politika tamponunun üzerinde kalınıyor.";
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
      <span>{state.status === "uploading" ? "Analiz ediliyor…" : state.fileName ?? "CSV seç veya buraya bırak"}</span>
    </label>
    {result && <div className="import-result">
      <span>{result.dataset.rowCount.toLocaleString("tr-TR")} satır</span>
      <span>{result.summary.autoMatched} otomatik eşleşme</span>
      <span className={result.summary.unmatched > 0 ? "text-warning" : ""}>{result.summary.unmatched} eşleşmeyen</span>
      <span className={result.quality.criticalCount > 0 ? "text-danger" : ""}>{result.quality.totalIssues} kalite bulgusu</span>
      <span>Mutabakat: {result.reconciliation.status}</span>
    </div>}
    {result && <details className="mapping-details">
      <summary>Eşleştirme tablosu ({result.mappings.length})</summary>
      <div className="mapping-table-wrap"><table><thead><tr><th>Kaynak</th><th>Canonical</th><th>Güven</th><th>Durum</th></tr></thead><tbody>{result.mappings.map((mapping) => <tr key={mapping.sourceColumn} className={mapping.status === "unmatched" ? "mapping-unmatched" : ""}><td>{mapping.sourceColumn}</td><td>{mapping.canonicalField ?? "Eşleşmedi"}</td><td>%{Math.round(mapping.confidence * 100)}</td><td><span>{mapping.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div>
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
      <span><strong>Universal Data Importer</strong><small>SAP uyumlu CSV eşleştirme, kalite kontrolü ve mutabakat</small></span>
      <span className="import-progress">{currentCount}/3 güncel veri seti</span>
      <span className={expanded ? "chevron-up" : ""}><Icon name="chevron" /></span>
    </button>
    {expanded && <div className="importer-body">
      <div className="period-heading"><span>Güncel dönem</span><small>Analizde kullanılacak dosyalar</small></div>
      <div className="import-grid">{DATASETS.map((dataset) => <ImportSlot key={`current-${dataset}`} dataset={dataset} period="current" state={uploads.current[dataset]} onFile={onFile} />)}</div>
      <details className="previous-imports">
        <summary>Önceki dönem dosyalarını ekle <span>What Changed için opsiyonel</span></summary>
        <div className="import-grid">{DATASETS.map((dataset) => <ImportSlot key={`previous-${dataset}`} dataset={dataset} period="previous" state={uploads.previous[dataset]} onFile={onFile} />)}</div>
      </details>
      <div className="analysis-settings">
        <label>Para birimi<select value={parameters.currency} onChange={(event) => onParameter("currency", event.target.value)}><option>TRY</option><option>EUR</option><option>USD</option></select></label>
        <label>Rapor tarihi<input type="date" value={parameters.asOfDate} onChange={(event) => onParameter("asOfDate", event.target.value)} /></label>
        <label>Açılış nakdi (mn)<input type="number" value={parameters.openingLiquidity / 1_000_000} onChange={(event) => onParameter("openingLiquidity", event.target.value)} /></label>
        <label>Kullanılabilir limit (mn)<input type="number" value={parameters.unusedCommittedFacilities / 1_000_000} onChange={(event) => onParameter("unusedCommittedFacilities", event.target.value)} /></label>
        <label>Politika tamponu (mn)<input type="number" value={parameters.minimumLiquidityBuffer / 1_000_000} onChange={(event) => onParameter("minimumLiquidityBuffer", event.target.value)} /></label>
      </div>
      {error && <p className="analysis-error">{error}</p>}
      <div className="import-actions">
        <button className="button-secondary" onClick={onDemo}><Icon name="spark" /> Demo veriyi yükle</button>
        <button className="button-secondary sample-button" onClick={onSamples} disabled={running}><Icon name="upload" /> Örnek CSV’lerle çalıştır</button>
        <button className="button-primary" onClick={onAnalyze} disabled={running}>{running ? "Analiz hazırlanıyor…" : "CFO analizini çalıştır"}</button>
      </div>
    </div>}
  </section>;
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
    <svg className="stress-chart" viewBox={`0 0 ${width} ${height}`} onClick={handleClick} role="img" aria-label="Base, Moderate ve Severe stres senaryoları likidite eğrisi. Bir tarih seçmek için grafiğe tıklayın.">
      {yTicks.map((tick) => <g key={tick}>
        <line x1={plot.left} x2={width - plot.right} y1={y(tick)} y2={y(tick)} className="grid-line" />
        <text x={plot.left - 12} y={y(tick) + 4} textAnchor="end" className="axis-label">{formatMoney(tick, "TRY")}</text>
      </g>)}
      <line x1={plot.left} x2={width - plot.right} y1={y(threshold)} y2={y(threshold)} className="threshold-line" />
      <text x={width - plot.right} y={y(threshold) - 7} textAnchor="end" className="threshold-label">Politika tamponu</text>
      {scenarios.map((scenario) => <path key={scenario.name} d={makePath(scenario)} fill="none" stroke={colors[scenario.name]} className="scenario-path" />)}
      <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={plot.top} y2={height - plot.bottom} className="selected-line" />
      <circle cx={x(selectedIndex)} cy={y(scenarios[0]?.curve[selectedIndex]?.closingLiquidity ?? 0)} r="5" fill={colors.BASE} stroke="white" strokeWidth="3" />
      {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 12} textAnchor={index === 0 ? "start" : index === curveLength - 1 ? "end" : "middle"} className="axis-label">{formatDate(scenarios[0]?.curve[index]?.date ?? "")}</text>)}
    </svg>
    <div className="chart-accessible-control"><label htmlFor="gap-date"><Icon name="calendar" /> Gap Drivers tarihi</label><input id="gap-date" type="date" value={selectedDate} min={scenarios[0]?.curve[0]?.date} max={scenarios[0]?.curve[curveLength - 1]?.date} onChange={(event) => onDateSelect(event.target.value)} /></div>
  </div>;
}

function ScenarioTable({ scenarios, currency }: { scenarios: StressScenario[]; currency: string }) {
  return <div className="table-scroll"><table className="scenario-table">
    <thead><tr><th>Senaryo</th><th>Min. nakit</th><th>Fonlama ihtiyacı</th><th>Tampon ihlal günü</th><th>İlk ihlal</th></tr></thead>
    <tbody>{scenarios.map((scenario) => <tr key={scenario.name}>
      <td><span className={`scenario-dot scenario-${scenario.name.toLowerCase()}`} />{scenario.label}</td>
      <td className={scenario.minimumLiquidity < 0 ? "negative-value" : ""}>{formatMoney(scenario.minimumLiquidity, currency)}</td>
      <td>{formatMoney(scenario.fundingNeed, currency)}</td><td>{scenario.thresholdBreachDays} gün</td><td>{formatDate(scenario.firstThresholdBreachDate)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function GapDriverPanel({ gap }: { gap: GapDrivers }) {
  const steps = [
    { label: "Açılış", value: gap.openingLiquidity, tone: "opening" },
    { label: "Tahsilatlar", value: gap.receivablesInflows, tone: "inflow" },
    { label: "Ödemeler", value: -gap.payablesOutflows, tone: "outflow" },
    { label: "Borç servisi", value: -gap.debtOutflows, tone: "outflow" },
    { label: "Kapanış", value: gap.projectedCash, tone: "closing" },
  ];
  const max = Math.max(...steps.map((step) => Math.abs(step.value)), 1);
  return <section className="panel gap-panel" id="gap-drivers">
    <div className="section-heading"><div><span className="eyebrow">Seçili gün analizi</span><h2>Gap Drivers</h2><p>{formatDate(gap.targetDate)} tarihinde nakdi hareket ettiren unsurlar</p></div><div className="concentration-score"><span>İlk 3 yoğunlaşma</span><strong>%{gap.top3CounterpartyConcentration.toFixed(1)}</strong></div></div>
    <div className="gap-layout">
      <div><h3>Günlük nakit köprüsü</h3><div className="waterfall">{steps.map((step) => <div className="waterfall-step" key={step.label}><div className="waterfall-track"><span className={`waterfall-bar ${step.tone}`} style={{ height: `${Math.max(14, (Math.abs(step.value) / max) * 100)}%` }} /></div><strong>{formatMoney(step.value, gap.currency)}</strong><span>{step.label}</span></div>)}</div></div>
      <div className="counterparties"><h3>Karşı taraf yoğunlaşması</h3>{gap.counterparties.slice(0, 5).map((counterparty) => <div className="counterparty-row" key={counterparty.counterpartyName}><div><strong>{counterparty.counterpartyName}</strong><span>{formatMoney(counterparty.netImpact, gap.currency)} net etki</span></div><div className="share-bar"><span style={{ width: `${Math.min(100, counterparty.sharePercent)}%` }} /></div><b>%{counterparty.sharePercent.toFixed(1)}</b></div>)}</div>
    </div>
    <details className="flow-details"><summary>{gap.flows.length} nakit hareketini göster</summary><div className="table-scroll"><table><thead><tr><th>Karşı taraf</th><th>Kaynak</th><th>Belge</th><th>Yön</th><th>Etki</th></tr></thead><tbody>{gap.flows.map((flow, index) => <tr key={`${flow.counterpartyName}-${flow.documentNo ?? flow.debtId}-${index}`}><td>{flow.counterpartyName}</td><td>{DATASET_LABELS[flow.datasetType]}</td><td>{flow.documentNo ?? flow.debtId ?? "—"}</td><td>{flow.direction === "INFLOW" ? "Giriş" : "Çıkış"}</td><td className={flow.signedImpact < 0 ? "negative-value" : "positive-value"}>{formatMoney(flow.signedImpact, flow.currency)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

function ChangesPanel({ response }: { response: TreasuryAnalysisResponse }) {
  const changes = response.changes;
  return <section className="panel changes-panel" id="what-changed">
    <div className="section-heading"><div><span className="eyebrow">Dönem karşılaştırması</span><h2>What Changed</h2><p>Önceki yükleme ile güncel veri arasındaki likidite hareketleri</p></div>{changes && <span className={`reconcile-badge ${changes.movement.status.toLowerCase()}`}>{changes.movement.status === "RECONCILED" ? "Hareket mutabık" : "Açıklanamayan hareket"}</span>}</div>
    {!changes ? <div className="empty-state"><Icon name="changes" /><strong>Karşılaştırma için önceki dönem gerekli</strong><p>Importer içinden önceki dönem CSV’lerini ekleyerek tarih, tutar, yeni ve kaldırılan kayıt etkilerini görün.</p></div> : <>
      <div className="change-summary">
        <MetricCard label="Tutar değişikliği" value={String(changes.comparison.summary.amountChanges)} />
        <MetricCard label="Tarih kayması" value={String(changes.comparison.summary.dateShifts)} />
        <MetricCard label="Yeni kayıt" value={String(changes.comparison.summary.newItems)} />
        <MetricCard label="Kaldırılan" value={String(changes.comparison.summary.removedItems)} />
        <MetricCard label="Toplam likidite etkisi" value={formatMoney(changes.comparison.summary.totalLiquidityImpact, response.analysis.currency)} tone={changes.comparison.summary.totalLiquidityImpact < 0 ? "negative" : "positive"} />
      </div>
      <div className="movement-bridge"><span>Forecast hareketi <strong>{formatMoney(changes.movement.forecastMovement, response.analysis.currency)}</strong></span><span>Tanımlanan sürücüler <strong>{formatMoney(changes.movement.identifiedDriverImpact, response.analysis.currency)}</strong></span><span>Açıklanamayan <strong>{formatMoney(changes.movement.unexplainedMovement, response.analysis.currency)}</strong></span></div>
      <div className="table-scroll"><table className="changes-table"><thead><tr><th>Değişiklik</th><th>Karşı taraf / belge</th><th>Önceki</th><th>Güncel</th><th>Likidite etkisi</th></tr></thead><tbody>{changes.comparison.changes.map((change) => <tr key={change.stableId}><td><span className={`change-type type-${change.changeType.toLowerCase()}`}>{change.changeType.replaceAll("_", " ")}</span></td><td><strong>{change.counterpartyName ?? "—"}</strong><small>{change.documentNo ?? change.datasetType}</small></td><td>{change.previousDate ? formatDate(change.previousDate) : "—"}<small>{change.previousAmount === null ? "" : formatMoney(change.previousAmount, change.currency ?? response.analysis.currency)}</small></td><td>{change.currentDate ? formatDate(change.currentDate) : "—"}<small>{change.currentAmount === null ? "" : formatMoney(change.currentAmount, change.currency ?? response.analysis.currency)}</small></td><td className={change.liquidityImpact < 0 ? "negative-value" : "positive-value"}>{formatMoney(change.liquidityImpact, change.currency ?? response.analysis.currency)}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}

function Dashboard({ response, selectedDate, refreshingGap, onDateSelect }: { response: TreasuryAnalysisResponse; selectedDate: string; refreshingGap: boolean; onDateSelect: (date: string) => void }) {
  const { analysis } = response;
  const { metrics, stress, gapDrivers } = analysis;
  const metricsList = [
    { label: "Kullanılabilir likidite", value: metrics.availableLiquidity, tone: "positive" as const },
    { label: "Minimum tahmini nakit", value: metrics.minimumForecastCash, detail: formatDate(metrics.minimumForecastCashDate), tone: metrics.minimumForecastCash < 0 ? "negative" as const : "neutral" as const },
    { label: "Likidite headroom", value: metrics.liquidityHeadroom, tone: metrics.liquidityHeadroom < 0 ? "negative" as const : "positive" as const },
    { label: "30G fonlama ihtiyacı", value: metrics.fundingNeed30D, tone: metrics.fundingNeed30D > 0 ? "negative" as const : "neutral" as const },
    { label: "90G fonlama ihtiyacı", value: metrics.fundingNeed90D, tone: metrics.fundingNeed90D > 0 ? "negative" as const : "neutral" as const },
    { label: "Riskli alacaklar", value: metrics.receivablesAtRisk, tone: "warning" as const },
    { label: "90G vadesi gelen borç", value: metrics.debtDue90D, tone: "neutral" as const },
  ];
  return <>
    <section className="metrics-grid" aria-label="CFO temel metrikleri">{metricsList.map((metric) => <MetricCard key={metric.label} label={metric.label} value={formatMoney(metric.value, metrics.currency)} detail={metric.detail} tone={metric.tone} />)}</section>
    <section className={`verdict-strip verdict-${analysis.verdict.verdict.toLowerCase()}`}><span className="verdict-label">CFO VERDICT</span><p>{getVerdictSentence(metrics)}</p><span className="verdict-status">{analysis.verdict.verdict.replaceAll("_", " ")}</span></section>
    <section className="panel forecast-panel" id="forecast">
      <div className="section-heading"><div><span className="eyebrow">90 günlük görünüm</span><h2>Likidite ve stres senaryoları</h2><p>Grafikte bir güne tıklayarak o günün Gap Drivers analizini açın.</p></div><div className="legend">{stress.scenarios.map((scenario) => <span key={scenario.name}><i className={`scenario-${scenario.name.toLowerCase()}`} />{scenario.label}</span>)}</div></div>
      <StressChart scenarios={stress.scenarios} threshold={stress.minimumLiquidityThreshold} selectedDate={selectedDate} onDateSelect={onDateSelect} />
      {refreshingGap && <p className="refresh-note">Seçili günün sürücüleri yenileniyor…</p>}
      <ScenarioTable scenarios={stress.scenarios} currency={analysis.currency} />
    </section>
    <GapDriverPanel gap={gapDrivers} />
    <ChangesPanel response={response} />
  </>;
}

function App() {
  const [uploads, setUploads] = useState<UploadGroups>(makeUploadGroups);
  const [importerExpanded, setImporterExpanded] = useState(true);
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
    if (currentIds.length === 0 && manualPositionCount === 0) { setAnalysisError("En az bir güncel CSV veya manuel ALM pozisyonu ekleyin; alternatif olarak demo veriyi açın."); return; }
    setRunning(true); setAnalysisError(null); setDemoMode(false);
    try {
      const next = await analyzeTreasury({ ...parameters, importIds: currentIds, ...(previousIds.length > 0 ? { previousImportIds: previousIds } : {}), ...(gapTargetDate ? { gapTargetDate } : {}) });
      setResponse(next); setSelectedDate(next.analysis.gapDrivers.targetDate); setImporterExpanded(false);
    } catch (error) { setAnalysisError(error instanceof Error ? error.message : "CFO analizi oluşturulamadı."); }
    finally { setRunning(false); }
  }
  function loadDemo() {
    setResponse(DEMO_RESPONSE); setDemoMode(true); setSelectedDate(DEMO_RESPONSE.analysis.gapDrivers.targetDate); setAnalysisError(null); setImporterExpanded(false);
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
        if (!fileResponse.ok) throw new Error(`${sample.path} örnek dosyası alınamadı.`);
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
      setUploads(nextUploads); setResponse(nextResponse); setSelectedDate(nextResponse.analysis.gapDrivers.targetDate); setImporterExpanded(false);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Örnek dosyalar analiz edilemedi.");
      setImporterExpanded(true);
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
      <a className="brand" href="#top" aria-label="Corporate ALM Intelligence ana sayfa"><span className="brand-mark"><i /><i /><i /></span><span>Corporate<strong>ALM Intelligence</strong></span></a>
      <nav aria-label="Ana navigasyon"><span className="nav-label">Aktif ALM modülü</span><a className="active" href="#top"><Icon name="grid" /> ALM Overview</a><a href="#importer"><Icon name="upload" /> Data & Positions</a><a href="#forecast"><Icon name="pulse" /> Liquidity Forecast</a><a href="#gap-drivers"><Icon name="calendar" /> Gap Drivers</a><a href="#what-changed"><Icon name="changes" /> What Changed</a><span className="nav-label nav-label-next">Sonraki ALM katmanları</span><span className="nav-placeholder"><Icon name="changes" /> Maturity Gap <small>Next</small></span><span className="nav-placeholder"><Icon name="pulse" /> Debt & Funding <small>Next</small></span><span className="nav-placeholder"><Icon name="settings" /> Interest Rate Risk <small>Next</small></span></nav>
      <div className="sidebar-foot"><a href="#importer"><Icon name="settings" /> Analiz ayarları</a><span><i /> API bağlı</span></div>
    </aside>
    <main id="top">
      <header className="topbar"><div><span className="eyebrow">CORPORATE LIQUIDITY & ASSET-LIABILITY MANAGEMENT</span><h1>ALM Intelligence</h1><span className="module-badge">Liquidity module · Phase 1</span></div><div className="report-context">{demoMode && <span className="demo-badge">DEMO</span>}<span><Icon name="calendar" />{response ? formatDate(response.analysis.asOfDate) : formatDate(parameters.asOfDate)}</span><span className="currency-badge">{response?.analysis.currency ?? parameters.currency}</span></div></header>
      <Importer uploads={uploads} expanded={importerExpanded} parameters={parameters} running={running} error={analysisError} onToggle={() => setImporterExpanded((value) => !value)} onFile={handleFile} onParameter={handleParameter} onAnalyze={() => void runAnalysis()} onSamples={() => void loadSamples()} onDemo={loadDemo} />
      <AlmPositionsPanel currency={parameters.currency} asOfDate={parameters.asOfDate} onSummaryChange={handlePositionSummary} />
      {response ? <Dashboard response={response} selectedDate={selectedDate} refreshingGap={refreshingGap} onDateSelect={(date) => void selectGapDate(date)} /> : <section className="welcome-state"><span className="welcome-icon"><Icon name="pulse" /></span><span className="eyebrow">LIQUIDITY MODULE</span><h2>ALM görünümünün kısa vadeli likidite katmanı</h2><p>CSV dosyalarınızı yükleyin, örnek dosyalarla gerçek pipeline’ı çalıştırın veya arayüzü görmek için demo veriyi açın.</p><button className="button-primary" onClick={loadDemo}><Icon name="spark" /> Demo cockpit’i aç</button></section>}
      <footer><span>Corporate ALM Intelligence · Deterministic balance-sheet analytics</span><span>Active module: 90-day liquidity</span></footer>
    </main>
  </div>;
}

export default App;
