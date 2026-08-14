export type DatasetType =
  | "payables"
  | "receivables"
  | "debt";

export type UploadStatus =
  | "idle"
  | "uploading"
  | "ready"
  | "error";

export type MappingStatus =
  | "auto_matched"
  | "review"
  | "unmatched";

export type ImportAnalysisResponse = {
  import: {
    importId: string;
    status: "analyzed";
    mappingStatus:
      | "ready"
      | "review_required";
  };

  quality: {
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    totalIssues: number;
  };

  canonical: {
    recordsCreated: number;
  };

  reconciliation: {
    status:
      | "passed"
      | "warning"
      | "failed";
  };

  dataset: {
    sourceType: DatasetType;
    rowCount: number;
    columnCount: number;
  };

  summary: {
    autoMatched: number;
    reviewRequired: number;
    unmatched: number;
    parseIssues: number;
  };

  mappings: {
    sourceColumn: string;
    canonicalField: string | null;
    confidence: number;
    status: MappingStatus;
    evidence:
      | "exact_alias"
      | "similar_alias"
      | "value_profile"
      | "none";
    sampleValues: string[];
  }[];
};

export type UploadState = {
  status: UploadStatus;
  fileName: string | null;
  importId: string | null;
  result: ImportAnalysisResponse | null;
  error: string | null;
};

export type LiquidityDay = {
  date: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  openingLiquidity: number;
  closingLiquidity: number;
};

export type LiquidityForecast = {
  currency: string;
  startDate: string;
  endDate: string;
  openingLiquidity: number;
  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;
  minimumLiquidity: number;
  minimumLiquidityDate: string;
  fundingNeed: number;
  days: LiquidityDay[];
  ignoredRecords: unknown[];
};

export type CfoMetrics = {
  currency: string;
  asOfDate: string;
  availableLiquidity: number;
  minimumForecastCash: number;
  minimumForecastCashDate: string;
  liquidityHeadroom: number;
  fundingNeed30D: number;
  fundingNeed90D: number;
  receivablesAtRisk: number;
  debtDue90D: number;
  unusedCommittedFacilities: number;
};

export type CfoVerdict = {
  verdict:
    | "HEALTHY"
    | "WATCH"
    | "FUNDING_REQUIRED"
    | "CRITICAL";
  headline: string;
  reasons: string[];
  actions: string[];
};

export type StressCurvePoint = {
  date: string;
  closingLiquidity: number;
};

export type StressScenario = {
  name:
    | "BASE"
    | "MODERATE"
    | "SEVERE"
    | "CUSTOM";
  label: string;
  minimumLiquidity: number;
  minimumLiquidityDate: string;
  fundingNeed: number;
  thresholdBreachDays: number;
  firstThresholdBreachDate: string | null;
  curve: StressCurvePoint[];
};

export type StressComparison = {
  currency: string;
  startDate: string;
  endDate: string;
  minimumLiquidityThreshold: number;
  scenarios: StressScenario[];
};

export type GapDriverFlow = {
  datasetType: DatasetType;
  direction:
    | "INFLOW"
    | "OUTFLOW";
  counterpartyName: string;
  documentNo: string | null;
  debtId: string | null;
  date: string;
  currency: string;
  amount: number;
  signedImpact: number;
};

export type CounterpartyConcentration = {
  counterpartyName: string;
  grossAmount: number;
  netImpact: number;
  sharePercent: number;
};

export type GapDrivers = {
  currency: string;
  targetDate: string;
  openingLiquidity: number;
  receivablesInflows: number;
  payablesOutflows: number;
  debtOutflows: number;
  totalInflows: number;
  totalOutflows: number;
  netMovement: number;
  projectedCash: number;
  minimumLiquidityToDate: number;
  minimumLiquidityDate: string;
  flows: GapDriverFlow[];
  counterparties: CounterpartyConcentration[];
  top3CounterpartyConcentration: number;
  totalGrossFlow: number;
};

export type TreasuryChange = {
  stableId: string;
  changeType:
    | "AMOUNT_CHANGED"
    | "DATE_SHIFTED"
    | "NEW_ITEM"
    | "REMOVED_ITEM";
  datasetType: DatasetType;
  counterpartyName: string | null;
  documentNo: string | null;
  currency: string | null;
  previousAmount: number | null;
  currentAmount: number | null;
  amountDelta: number | null;
  previousDate: string | null;
  currentDate: string | null;
  dateShiftDays: number | null;
  liquidityImpact: number;
};

export type ChangeAnalysis = {
  comparison: {
    changes: TreasuryChange[];
    summary: {
      amountChanges: number;
      dateShifts: number;
      newItems: number;
      removedItems: number;
      totalLiquidityImpact: number;
      totalChanges: number;
    };
  };

  movement: {
    forecastMovement: number;
    identifiedDriverImpact: number;
    unexplainedMovement: number;
    status:
      | "RECONCILED"
      | "UNEXPLAINED";
  };

  forecastBridge: {
    actualClosingMovement: number;
    identifiedClosingMovement: number;
    unexplainedClosingMovement: number;
    actualMinimumMovement: number;
    identifiedMinimumMovement: number;
    unexplainedMinimumMovement: number;
    status:
      | "RECONCILED"
      | "UNEXPLAINED";
  };
};

export type TreasuryAnalysis = {
  currency: string;
  asOfDate: string;
  endDate: string;
  forecast: LiquidityForecast;
  metrics: CfoMetrics;
  verdict: CfoVerdict;
  stress: StressComparison;
  gapDrivers: GapDrivers;
};

export type TreasuryAnalysisResponse = {
  imports: {
    ids: string[];
    datasets: {
      sourceType: DatasetType;
      records: number;
    }[];
  };
  previousImports: {
    ids: string[];
    datasets: {
      sourceType: DatasetType;
      records: number;
    }[];
  } | null;
  analysis: TreasuryAnalysis;
  changes: ChangeAnalysis | null;
};

export type AnalysisParameters = {
  currency: string;
  asOfDate: string;
  openingLiquidity: number;
  unusedCommittedFacilities: number;
  minimumLiquidityBuffer: number;
};

export type TreasuryAnalysisRequest =
  AnalysisParameters & {
    importIds: string[];
    previousImportIds?: string[];
    gapTargetDate?: string;
  };
