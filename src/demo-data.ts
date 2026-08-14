import type {
  FundingPlan,
  FundingMaturityBucket,
  MaturityGapBucket,
  PolicyLimits,
  RepricingBucket,
  StressCurvePoint,
  StressScenario,
  TreasuryAnalysisResponse,
} from "./treasury-types";

const DAY_MS = 86_400_000;

function addDays(
  date: string,
  days: number,
): string {
  return new Date(
    Date.parse(
      `${date}T00:00:00Z`,
    ) +
      days * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
}

function addMonths(
  date: string,
  months: number,
): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDate();
  const target = new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth() + months,
      1,
    ),
  );
  const lastDay = new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function buildCurve(
  anchors: [number, number][],
): StressCurvePoint[] {
  const startDate = "2026-08-14";

  return Array.from(
    {
      length: 90,
    },
    (_, index) => {
      const nextAnchorIndex =
        anchors.findIndex(
          ([day]) =>
            day >= index,
        );

      const right =
        anchors[
          nextAnchorIndex < 0
            ? anchors.length - 1
            : nextAnchorIndex
        ];

      const left =
        anchors[
          Math.max(
            0,
            (
              nextAnchorIndex < 0
                ? anchors.length - 1
                : nextAnchorIndex
            ) - 1,
          )
        ];

      const distance =
        right[0] - left[0];

      const progress =
        distance === 0
          ? 0
          : (
              index - left[0]
            ) /
            distance;

      const amount =
        left[1] +
        (
          right[1] - left[1]
        ) *
          progress;

      return {
        date:
          addDays(
            startDate,
            index,
          ),

        closingLiquidity:
          Math.round(
            amount * 1_000_000,
          ),
      };
    },
  );
}

function buildScenario(
  name: StressScenario["name"],
  label: string,
  anchors: [number, number][],
): StressScenario {
  const curve =
    buildCurve(anchors);

  const minimum =
    curve.reduce(
      (current, point) =>
        point.closingLiquidity <
        current.closingLiquidity
          ? point
          : current,
      curve[0],
    );

  const breached =
    curve.filter(
      (point) =>
        point.closingLiquidity <
        15_000_000,
    );

  return {
    name,
    label,

    minimumLiquidity:
      minimum.closingLiquidity,

    minimumLiquidityDate:
      minimum.date,

    fundingNeed:
      Math.max(
        0,
        -minimum.closingLiquidity,
      ),

    thresholdBreachDays:
      breached.length,

    firstThresholdBreachDate:
      breached[0]?.date ??
      null,

    curve,
  };
}

const baseScenario =
  buildScenario(
    "BASE",
    "Base",
    [
      [0, 42],
      [7, 31],
      [14, 18],
      [20, -8.4],
      [29, 6],
      [43, 22],
      [58, 9],
      [72, 25],
      [89, 18],
    ],
  );

const moderateScenario =
  buildScenario(
    "MODERATE",
    "Moderate",
    [
      [0, 39.9],
      [8, 25],
      [16, 8],
      [24, -22.7],
      [33, -8],
      [48, 9],
      [62, -5],
      [76, 11],
      [89, 4],
    ],
  );

const severeScenario =
  buildScenario(
    "SEVERE",
    "Severe",
    [
      [0, 37.8],
      [8, 16],
      [17, -12],
      [26, -48.3],
      [38, -34],
      [53, -16],
      [67, -31],
      [79, -9],
      [89, -18],
    ],
  );

const forecastDays =
  baseScenario.curve.map(
    (point, index, curve) => {
      const openingLiquidity =
        index === 0
          ? 42_000_000
          : curve[index - 1]
              .closingLiquidity;

      const netFlow =
        point.closingLiquidity -
        openingLiquidity;

      return {
        date:
          point.date,

        inflow:
          netFlow > 0
            ? netFlow
            : 0,

        outflow:
          netFlow < 0
            ? -netFlow
            : 0,

        netFlow,
        openingLiquidity,

        closingLiquidity:
          point.closingLiquidity,
      };
    },
  );

const demoMaturityValues = [
  {
    id: "overdue",
    label: "Vadesi geçmiş",
    assets: 12_800_000,
    liabilities: 2_400_000,
  },
  ...[
    [38_000_000, 44_000_000],
    [24_000_000, 31_000_000],
    [18_000_000, 27_000_000],
    [22_000_000, 35_000_000],
    [16_000_000, 28_000_000],
    [19_000_000, 42_000_000],
    [14_000_000, 25_000_000],
    [20_000_000, 18_000_000],
    [24_000_000, 31_000_000],
    [21_000_000, 20_000_000],
    [25_000_000, 17_000_000],
    [30_000_000, 22_000_000],
  ].map(
    ([assets, liabilities], index) => ({
      id: `M${String(index + 1).padStart(2, "0")}`,
      label:
        index === 0
          ? "0–30 gün"
          : index === 11
            ? "331–365 gün"
            : `${index * 30 + 1}–${(index + 1) * 30} gün`,
      assets,
      liabilities,
    }),
  ),
  {
    id: "over12m",
    label: ">12 ay",
    assets: 45_000_000,
    liabilities: 90_000_000,
  },
];

let demoCumulativeGap =
  42_000_000;

const demoMaturityBuckets:
  MaturityGapBucket[] =
    demoMaturityValues.map(
      (
        {
          id,
          label,
          assets,
          liabilities,
        },
        index,
      ): MaturityGapBucket => {
        const netGap =
          assets - liabilities;
        demoCumulativeGap += netGap;

        return {
          id,
          label,
          startDate:
            index === 0
              ? null
              : addDays(
                  "2026-08-14",
                  index === 13
                    ? 366
                    : index === 1
                      ? 0
                      : (index - 1) * 30 + 1,
                ),
          endDate:
            index === 0
              ? "2026-08-13"
              : index === 13
                ? null
                : addDays(
                    "2026-08-14",
                    index === 12
                      ? 365
                      : index * 30,
                  ),
          assets,
          liabilities,
          netGap,
          cumulativeGap:
            demoCumulativeGap,
          flows: [],
        };
      },
    );

const demoFundingAmounts = [
  10_000_000,
  35_000_000,
  55_000_000,
  25_000_000,
  60_000_000,
  40_000_000,
  35_000_000,
  30_000_000,
  20_000_000,
  35_000_000,
  20_000_000,
  15_000_000,
  10_000_000,
  30_000_000,
];

const demoFundingBuckets:
  FundingMaturityBucket[] =
    demoFundingAmounts.map(
      (
        maturingDebt,
        index,
      ): FundingMaturityBucket => ({
        id:
          index === 0
            ? "overdue"
            : index === 13
              ? "over36m"
              : `Q${index}`,
        label:
          index === 0
            ? "Vadesi geçmiş"
            : index === 13
              ? ">36 ay"
              : `${(index - 1) * 3}–${index * 3} ay`,
        startDate:
          index === 0
            ? null
            : addMonths(
                "2026-08-14",
                index === 13
                  ? 36
                  : (index - 1) * 3,
              ),
        endDate:
          index === 0
            ? "2026-08-13"
            : index === 13
              ? null
              : addDays(
                  addMonths(
                    "2026-08-14",
                    index * 3,
                  ),
                  -1,
                ),
        maturingDebt,
        sharePercent:
          maturingDebt /
          420_000_000 *
          100,
        instruments: [],
      }),
    );

function buildDemoFundingPlan(): FundingPlan {
  const policyBuffer = 15_000_000;
  const availableFacilities = 70_000_000;
  let cumulativeFacilityDraw = 0;
  let firstActionDate: string | null = null;
  let peakFundingBucketId: string | null = null;

  const buckets = demoMaturityBuckets
    .filter((bucket) => bucket.id !== "over12m")
    .map((bucket) => {
      const incrementalFacilityDraw = Math.min(
        Math.max(
          0,
          policyBuffer -
            (bucket.cumulativeGap + cumulativeFacilityDraw),
        ),
        availableFacilities - cumulativeFacilityDraw,
      );
      cumulativeFacilityDraw += incrementalFacilityDraw;
      if (incrementalFacilityDraw > 0) {
        firstActionDate ??= bucket.startDate ?? "2026-08-14";
        peakFundingBucketId = bucket.id;
      }

      return {
        bucketId: bucket.id,
        label: bucket.label,
        startDate: bucket.startDate,
        endDate: bucket.endDate,
        contractualLiquidity: bucket.cumulativeGap,
        targetLiquidity: policyBuffer,
        incrementalFacilityDraw,
        cumulativeFacilityDraw,
        incrementalExternalFunding: 0,
        cumulativeExternalFunding: 0,
        liquidityAfterPlan:
          bucket.cumulativeGap + cumulativeFacilityDraw,
        facilityHeadroomRemaining:
          availableFacilities - cumulativeFacilityDraw,
      };
    });

  return {
    currency: "TRY",
    asOfDate: "2026-08-14",
    horizonEndDate: "2027-08-14",
    status: "FACILITY_DRAW_REQUIRED",
    policyBuffer,
    availableFacilities,
    totalFundingRequirement: cumulativeFacilityDraw,
    plannedFacilityDraw: cumulativeFacilityDraw,
    externalFundingNeed: 0,
    firstActionDate,
    firstExternalFundingDate: null,
    peakFundingBucketId,
    minimumLiquidityAfterPlan: Math.min(
      ...buckets.map((bucket) => bucket.liquidityAfterPlan),
    ),
    buckets,
    actions: [
      {
        priority: 1,
        actionType: "RESERVE_COMMITTED_FACILITIES",
        severity: "WATCH",
        amount: cumulativeFacilityDraw,
        dueDate: firstActionDate,
        bucketId: peakFundingBucketId,
        reason: "Committed capacity must be reserved to protect the minimum liquidity buffer.",
      },
      {
        priority: 2,
        actionType: "REFINANCE_MATURITY_WALL",
        severity: "ACTION_REQUIRED",
        amount: 60_000_000,
        dueDate: "2027-05-14",
        bucketId: "Q4",
        reason: "A material debt maturity wall falls inside the 12-month planning horizon.",
      },
      {
        priority: 3,
        actionType: "DIVERSIFY_LENDERS",
        severity: "WATCH",
        amount: null,
        dueDate: null,
        bucketId: null,
        reason: "The top three lenders represent at least 75% of modeled funding capacity.",
      },
    ],
  };
}

const demoFundingPlan = buildDemoFundingPlan();

const demoPolicyLimits: PolicyLimits = {
  currency: "TRY",
  asOfDate: "2026-08-14",
  overallStatus: "BREACH",
  counts: { PASS: 3, WATCH: 0, BREACH: 3 },
  thresholds: {
    minimumLiquidityBuffer: 15_000_000,
    maximumFacilityUtilizationPercent: 75,
    maximumTop3LenderConcentrationPercent: 75,
    maximumFloatingRateSharePercent: 50,
    minimumFacilityCoverage12MPercent: 100,
    maximumExternalFundingNeed: 0,
  },
  breachedLimitIds: [
    "LIQUIDITY_BUFFER",
    "LENDER_CONCENTRATION",
    "REFINANCING_COVERAGE",
  ],
  watchLimitIds: [],
  checks: [
    {
      id: "LIQUIDITY_BUFFER",
      category: "LIQUIDITY",
      label: "90-day liquidity buffer",
      status: "BREACH",
      operator: "MINIMUM",
      unit: "AMOUNT",
      actualValue: 11_600_000,
      limitValue: 15_000_000,
      headroom: -3_400_000,
      reason: "Minimum 90-day cash plus committed capacity is tested against policy.",
      action: "Protect cash and reserve committed liquidity before the breach date.",
    },
    {
      id: "FACILITY_UTILIZATION",
      category: "FUNDING",
      label: "Facility utilization",
      status: "PASS",
      operator: "MAXIMUM",
      unit: "PERCENT",
      actualValue: 61.1,
      limitValue: 75,
      headroom: 13.9,
      reason: "Drawn committed facilities are compared with total committed capacity.",
      action: "Add committed headroom or reduce drawings before utilization exceeds policy.",
    },
    {
      id: "LENDER_CONCENTRATION",
      category: "CONCENTRATION",
      label: "Top-three lender concentration",
      status: "BREACH",
      operator: "MAXIMUM",
      unit: "PERCENT",
      actualValue: 75.5,
      limitValue: 75,
      headroom: -0.5,
      reason: "The top three lenders' share of modeled funding capacity is monitored.",
      action: "Open or expand alternative lender capacity.",
    },
    {
      id: "FLOATING_RATE_SHARE",
      category: "RATE",
      label: "Floating-rate debt share",
      status: "PASS",
      operator: "MAXIMUM",
      unit: "PERCENT",
      actualValue: 31,
      limitValue: 50,
      headroom: 19,
      reason: "Floating-rate debt is compared with the total interest-bearing portfolio.",
      action: "Shift new funding toward fixed-rate debt or reduce floating exposure.",
    },
    {
      id: "REFINANCING_COVERAGE",
      category: "FUNDING",
      label: "12-month facility coverage",
      status: "BREACH",
      operator: "MINIMUM",
      unit: "PERCENT",
      actualValue: 37.8,
      limitValue: 100,
      headroom: -62.2,
      reason: "Available committed facilities are compared with debt due in 12 months.",
      action: "Secure refinancing capacity before the uncovered maturity wall enters the near term.",
    },
    {
      id: "EXTERNAL_FUNDING_NEED",
      category: "FUNDING",
      label: "Uncommitted external funding need",
      status: "PASS",
      operator: "MAXIMUM",
      unit: "AMOUNT",
      actualValue: 0,
      limitValue: 0,
      headroom: 0,
      reason: "Residual funding after committed facilities is tested against zero-tolerance policy.",
      action: "Obtain approved term funding before the first external-funding date.",
    },
  ],
};

const demoRepricingValues = [
  {
    floatingAmount: 130_000_000,
    fixedRefinancingAmount: 20_000_000,
  },
  {
    floatingAmount: 0,
    fixedRefinancingAmount: 15_000_000,
  },
  {
    floatingAmount: 0,
    fixedRefinancingAmount: 10_000_000,
  },
  {
    floatingAmount: 0,
    fixedRefinancingAmount: 10_000_000,
  },
  {
    floatingAmount: 0,
    fixedRefinancingAmount: 215_000_000,
  },
];

const demoRepricingBuckets:
  RepricingBucket[] =
    demoRepricingValues.map(
      (
        {
          floatingAmount,
          fixedRefinancingAmount,
        },
        index,
      ): RepricingBucket => ({
        id:
          index === 4
            ? "over12m"
            : `Q${index + 1}`,
        label:
          index === 4
            ? ">12 ay"
            : `${index * 3}–${(index + 1) * 3} ay`,
        startDate:
          addMonths(
            "2026-08-14",
            index * 3,
          ),
        endDate:
          index === 4
            ? null
            : addDays(
                addMonths(
                  "2026-08-14",
                  (index + 1) * 3,
                ),
                -1,
              ),
        floatingAmount,
        fixedRefinancingAmount,
        repricingAmount:
          floatingAmount +
          fixedRefinancingAmount,
        instruments: [],
      }),
    );

export const DEMO_RESPONSE:
  TreasuryAnalysisResponse = {
    imports: {
      ids: [
        "demo-payables",
        "demo-receivables",
        "demo-debt",
      ],

      datasets: [
        {
          sourceType:
            "payables",
          records: 2_846,
        },
        {
          sourceType:
            "receivables",
          records: 1_932,
        },
        {
          sourceType:
            "debt",
          records: 68,
        },
      ],
    },

    previousImports: {
      ids: [
        "demo-previous-payables",
        "demo-previous-receivables",
        "demo-previous-debt",
      ],

      datasets: [
        {
          sourceType:
            "payables",
          records: 2_811,
        },
        {
          sourceType:
            "receivables",
          records: 1_901,
        },
        {
          sourceType:
            "debt",
          records: 68,
        },
      ],
    },

    analysis: {
      currency: "TRY",
      asOfDate: "2026-08-14",
      endDate: "2026-11-11",

      forecast: {
        currency: "TRY",
        startDate: "2026-08-14",
        endDate: "2026-11-11",
        openingLiquidity: 42_000_000,
        totalInflows: 118_400_000,
        totalOutflows: 142_400_000,
        netCashFlow: -24_000_000,
        minimumLiquidity: -8_400_000,
        minimumLiquidityDate:
          "2026-09-03",
        fundingNeed: 8_400_000,
        days: forecastDays,
        ignoredRecords: [],
      },

      metrics: {
        currency: "TRY",
        asOfDate: "2026-08-14",
        availableLiquidity: 62_000_000,
        minimumForecastCash: -8_400_000,
        minimumForecastCashDate:
          "2026-09-03",
        liquidityHeadroom: 11_600_000,
        fundingNeed30D: 0,
        fundingNeed90D: 0,
        receivablesAtRisk: 12_800_000,
        debtDue90D: 18_600_000,
        unusedCommittedFacilities: 20_000_000,
      },

      verdict: {
        verdict: "WATCH",
        headline:
          "Liquidity remains positive after committed facilities, but the policy buffer is thin.",
        reasons: [
          "Minimum forecast cash falls below zero on 2026-09-03.",
          "Committed facilities cover the modeled shortfall.",
        ],
        actions: [
          "Review the payment calendar around the minimum cash date.",
          "Accelerate material receivables where possible.",
        ],
      },

      stress: {
        currency: "TRY",
        startDate: "2026-08-14",
        endDate: "2026-11-11",
        minimumLiquidityThreshold: 15_000_000,
        scenarios: [
          baseScenario,
          moderateScenario,
          severeScenario,
        ],
      },

      gapDrivers: {
        currency: "TRY",
        targetDate: "2026-09-03",
        openingLiquidity: 7_800_000,
        receivablesInflows: 3_400_000,
        payablesOutflows: 14_200_000,
        debtOutflows: 5_400_000,
        totalInflows: 3_400_000,
        totalOutflows: 19_600_000,
        netMovement: -16_200_000,
        projectedCash: -8_400_000,
        minimumLiquidityToDate: -8_400_000,
        minimumLiquidityDate:
          "2026-09-03",
        top3CounterpartyConcentration: 67.4,
        totalGrossFlow: 23_000_000,

        flows: [
          {
            datasetType: "payables",
            direction: "OUTFLOW",
            counterpartyName:
              "Atlas Otomotiv",
            documentNo: "190001",
            debtId: null,
            date: "2026-09-03",
            currency: "TRY",
            amount: 7_200_000,
            signedImpact: -7_200_000,
          },
          {
            datasetType: "debt",
            direction: "OUTFLOW",
            counterpartyName:
              "Anadolu Bankası",
            documentNo: null,
            debtId: "DEBT-024",
            date: "2026-09-03",
            currency: "TRY",
            amount: 5_400_000,
            signedImpact: -5_400_000,
          },
          {
            datasetType: "receivables",
            direction: "INFLOW",
            counterpartyName:
              "Marmara Filo",
            documentNo: "180922",
            debtId: null,
            date: "2026-09-03",
            currency: "TRY",
            amount: 3_400_000,
            signedImpact: 3_400_000,
          },
          {
            datasetType: "payables",
            direction: "OUTFLOW",
            counterpartyName:
              "Nova Teknoloji",
            documentNo: "190044",
            debtId: null,
            date: "2026-09-03",
            currency: "TRY",
            amount: 3_100_000,
            signedImpact: -3_100_000,
          },
        ],

        counterparties: [
          {
            counterpartyName:
              "Atlas Otomotiv",
            grossAmount: 7_200_000,
            netImpact: -7_200_000,
            sharePercent: 31.3,
          },
          {
            counterpartyName:
              "Anadolu Bankası",
            grossAmount: 5_400_000,
            netImpact: -5_400_000,
            sharePercent: 23.5,
          },
          {
            counterpartyName:
              "Nova Teknoloji",
            grossAmount: 2_900_000,
            netImpact: -2_900_000,
            sharePercent: 12.6,
          },
          {
            counterpartyName:
              "Marmara Filo",
            grossAmount: 3_400_000,
            netImpact: 3_400_000,
            sharePercent: 14.8,
          },
        ],
      },

      maturityGap: {
        currency: "TRY",
        asOfDate: "2026-08-14",
        horizonEndDate:
          "2027-08-14",
        openingLiquidity: 42_000_000,
        availableFacilities: 20_000_000,
        totalAssets12M: 283_800_000,
        totalLiabilities12M:
          342_400_000,
        netGap12M: -58_600_000,
        closingCumulativeGap12M:
          -16_600_000,
        minimumCumulativeGap12M:
          -33_600_000,
        minimumBucketId: "M09",
        fundingNeedBeforeFacilities:
          33_600_000,
        residualFundingNeed:
          13_600_000,
        buckets:
          demoMaturityBuckets,
        ignoredItems: [],
      },

      debtFunding: {
        currency: "TRY",
        asOfDate: "2026-08-14",
        horizonEndDate:
          "2029-08-14",
        debtOutstanding: 420_000_000,
        debtDue12M: 185_000_000,
        debtDue24M: 310_000_000,
        debtDue36M: 390_000_000,
        committedFacilities:
          180_000_000,
        drawnFacilities: 110_000_000,
        availableFacilities: 70_000_000,
        facilityUtilizationPercent: 61.1,
        facilityCoverage12MPercent: 37.8,
        refinancingNeed12M: 115_000_000,
        largestMaturityWall: 60_000_000,
        largestMaturityWallBucketId: "Q4",
        top3LenderConcentration: 75.5,
        maturityBuckets:
          demoFundingBuckets,
        lenders: [
          {
            lender: "Anadolu Bankası",
            debtOutstanding: 120_000_000,
            committedFacilities: 50_000_000,
            drawnFacilities: 30_000_000,
            availableFacilities: 20_000_000,
            fundingCapacity: 140_000_000,
            sharePercent: 28.6,
            debtCount: 3,
            facilityCount: 1,
          },
          {
            lender: "Kuzey Bank",
            debtOutstanding: 105_000_000,
            committedFacilities: 40_000_000,
            drawnFacilities: 25_000_000,
            availableFacilities: 15_000_000,
            fundingCapacity: 120_000_000,
            sharePercent: 24.5,
            debtCount: 2,
            facilityCount: 1,
          },
          {
            lender: "Birlik Finans",
            debtOutstanding: 90_000_000,
            committedFacilities: 50_000_000,
            drawnFacilities: 30_000_000,
            availableFacilities: 20_000_000,
            fundingCapacity: 110_000_000,
            sharePercent: 22.4,
            debtCount: 2,
            facilityCount: 1,
          },
          {
            lender: "Garanti BBVA",
            debtOutstanding: 60_000_000,
            committedFacilities: 40_000_000,
            drawnFacilities: 25_000_000,
            availableFacilities: 15_000_000,
            fundingCapacity: 75_000_000,
            sharePercent: 15.3,
            debtCount: 1,
            facilityCount: 1,
          },
          {
            lender: "Diğer",
            debtOutstanding: 45_000_000,
            committedFacilities: 0,
            drawnFacilities: 0,
            availableFacilities: 0,
            fundingCapacity: 45_000_000,
            sharePercent: 9.2,
            debtCount: 2,
            facilityCount: 0,
          },
        ],
        instruments: [],
        ignoredItems: [],
      },

      interestRateRisk: {
        currency: "TRY",
        asOfDate: "2026-08-14",
        horizonEndDate: "2027-08-14",
        totalInterestBearingDebt: 420_000_000,
        fixedRateDebt: 270_000_000,
        floatingRateDebt: 130_000_000,
        unclassifiedRateDebt: 20_000_000,
        fixedRateSharePercent: 64.3,
        floatingRateSharePercent: 31,
        knownRateDebt: 400_000_000,
        rateCoveragePercent: 95.2,
        weightedAverageRatePercent: 28.4,
        currentAnnualInterestExpense: 113_600_000,
        floatingExposure: 130_000_000,
        fixedRefinancingExposure12M: 55_000_000,
        repricingExposure12M: 185_000_000,
        repricingGap12M: -185_000_000,
        sensitivityScenarios: [
          {
            shockBps: 100,
            annualizedInterestIncrease: 1_850_000,
            shockedAnnualInterestExpense: 115_450_000,
            effectiveWeightedAverageRatePercent: 27.49,
          },
          {
            shockBps: 200,
            annualizedInterestIncrease: 3_700_000,
            shockedAnnualInterestExpense: 117_300_000,
            effectiveWeightedAverageRatePercent: 27.93,
          },
          {
            shockBps: 300,
            annualizedInterestIncrease: 5_550_000,
            shockedAnnualInterestExpense: 119_150_000,
            effectiveWeightedAverageRatePercent: 28.37,
          },
        ],
        repricingBuckets: demoRepricingBuckets,
        lenders: [
          {
            lender: "Anadolu Bankası",
            totalDebt: 120_000_000,
            fixedRateDebt: 48_000_000,
            floatingRateDebt: 72_000_000,
            repricingExposure12M: 87_000_000,
            annualInterestExpense: 34_400_000,
            rateCoveragePercent: 100,
            instrumentCount: 3,
          },
          {
            lender: "Kuzey Bank",
            totalDebt: 105_000_000,
            fixedRateDebt: 75_000_000,
            floatingRateDebt: 30_000_000,
            repricingExposure12M: 50_000_000,
            annualInterestExpense: 29_800_000,
            rateCoveragePercent: 100,
            instrumentCount: 2,
          },
          {
            lender: "Garanti BBVA",
            totalDebt: 60_000_000,
            fixedRateDebt: 35_000_000,
            floatingRateDebt: 25_000_000,
            repricingExposure12M: 25_000_000,
            annualInterestExpense: 17_100_000,
            rateCoveragePercent: 100,
            instrumentCount: 1,
          },
          {
            lender: "Birlik Finans",
            totalDebt: 90_000_000,
            fixedRateDebt: 90_000_000,
            floatingRateDebt: 0,
            repricingExposure12M: 20_000_000,
            annualInterestExpense: 24_700_000,
            rateCoveragePercent: 100,
            instrumentCount: 2,
          },
          {
            lender: "Diğer",
            totalDebt: 45_000_000,
            fixedRateDebt: 22_000_000,
            floatingRateDebt: 3_000_000,
            repricingExposure12M: 3_000_000,
            annualInterestExpense: 7_600_000,
            rateCoveragePercent: 55.6,
            instrumentCount: 2,
          },
        ],
        instruments: [],
        dataIssues: [
          {
            sourceType: "debt",
            referenceId: "DEMO-UNKNOWN-RATE",
            reason: "MISSING_INTEREST_TYPE",
          },
        ],
      },

      fundingPlan: demoFundingPlan,

      policyLimits: demoPolicyLimits,

      executiveOverview: {
        currency: "TRY",
        asOfDate: "2026-08-14",
        status: "ACTION_REQUIRED",
        headline: "The 12-month ALM profile requires management action.",
        summary: "3 action pillar(s) and 3 watch pillar(s) are identified.",
        dominantRiskPillar: "FUNDING",
        statusCounts: {
          HEALTHY: 0,
          WATCH: 3,
          ACTION_REQUIRED: 3,
          CRITICAL: 0,
        },
        dataQualityFindings: 1,
        pillars: [
          {
            id: "LIQUIDITY",
            label: "Liquidity",
            status: "WATCH",
            headline: "Liquidity remains available but the policy cushion is thin.",
            reason: "Minimum forecast cash is -8,400,000 TRY on 2026-09-03.",
            action: "Protect available liquidity and close the forecast shortfall before the breach date.",
            impactAmount: 0,
          },
          {
            id: "STRESS",
            label: "Stress",
            status: "ACTION_REQUIRED",
            headline: "Moderate stress exceeds committed liquidity capacity.",
            reason: "Severe minimum cash is -48,300,000 TRY with 84 policy-breach days.",
            action: "Pre-agree contingency funding and collection acceleration triggers.",
            impactAmount: 28_300_000,
          },
          {
            id: "MATURITY",
            label: "Maturity",
            status: "ACTION_REQUIRED",
            headline: "A residual contractual maturity gap remains after facilities.",
            reason: "Minimum cumulative gap is -33,600,000 TRY; residual need is 13,600,000 TRY.",
            action: "Close the residual maturity gap with term funding or cash-flow actions.",
            impactAmount: 13_600_000,
          },
          {
            id: "FUNDING",
            label: "Funding",
            status: "ACTION_REQUIRED",
            headline: "The 12-month refinancing wall is not fully covered.",
            reason: "185,000,000 TRY matures in 12 months; 62.2% remains uncovered.",
            action: "Launch the 12-month refinancing plan and diversify lender capacity.",
            impactAmount: 115_000_000,
          },
          {
            id: "RATE",
            label: "Interest rate",
            status: "WATCH",
            headline: "A material share of debt reprices within 12 months.",
            reason: "44.0% of debt reprices within 12 months; +200 bp adds 3,700,000 TRY annualized cost.",
            action: "Set a target fixed-floating mix and reduce near-term repricing exposure.",
            impactAmount: 3_700_000,
          },
          {
            id: "DATA",
            label: "Data",
            status: "WATCH",
            headline: "Some records limit the completeness of ALM analysis.",
            reason: "1 maturity, funding, or rate-data findings are disclosed.",
            action: "Complete missing amount, maturity, interest-type, and rate fields.",
            impactAmount: null,
          },
        ],
        priorityActions: [
          {
            priority: 1,
            pillarId: "FUNDING",
            status: "ACTION_REQUIRED",
            action: "Launch the 12-month refinancing plan and diversify lender capacity.",
            impactAmount: 115_000_000,
          },
          {
            priority: 2,
            pillarId: "STRESS",
            status: "ACTION_REQUIRED",
            action: "Pre-agree contingency funding and collection acceleration triggers.",
            impactAmount: 28_300_000,
          },
          {
            priority: 3,
            pillarId: "MATURITY",
            status: "ACTION_REQUIRED",
            action: "Close the residual maturity gap with term funding or cash-flow actions.",
            impactAmount: 13_600_000,
          },
        ],
      },
    },

    changes: {
      comparison: {
        summary: {
          amountChanges: 1,
          dateShifts: 1,
          newItems: 1,
          removedItems: 1,
          totalLiquidityImpact: -5_100_000,
          totalChanges: 4,
        },

        changes: [
          {
            stableId:
              "payables|SAP_ITEM|1000|2026|190002|001",
            changeType:
              "AMOUNT_CHANGED",
            datasetType:
              "payables",
            counterpartyName:
              "Marmara Lojistik",
            documentNo: "190002",
            currency: "TRY",
            previousAmount: 4_800_000,
            currentAmount: 6_200_000,
            amountDelta: 1_400_000,
            previousDate: "2026-08-22",
            currentDate: "2026-08-22",
            dateShiftDays: null,
            liquidityImpact: -1_400_000,
          },
          {
            stableId:
              "receivables|DOCUMENT|1000|2026|DR|180701|C1044",
            changeType:
              "DATE_SHIFTED",
            datasetType:
              "receivables",
            counterpartyName:
              "Marmara Filo",
            documentNo: "180701",
            currency: "TRY",
            previousAmount: 3_400_000,
            currentAmount: 3_400_000,
            amountDelta: 0,
            previousDate: "2026-08-27",
            currentDate: "2026-09-03",
            dateShiftDays: 7,
            liquidityImpact: 0,
          },
          {
            stableId:
              "payables|DOCUMENT|1000|2026|KR|190044|V1098",
            changeType:
              "NEW_ITEM",
            datasetType:
              "payables",
            counterpartyName:
              "Nova Teknoloji",
            documentNo: "190044",
            currency: "TRY",
            previousAmount: null,
            currentAmount: 3_100_000,
            amountDelta: 3_100_000,
            previousDate: null,
            currentDate: "2026-09-03",
            dateShiftDays: null,
            liquidityImpact: -3_100_000,
          },
          {
            stableId:
              "receivables|DOCUMENT|1000|2026|DR|180340|C1020",
            changeType:
              "REMOVED_ITEM",
            datasetType:
              "receivables",
            counterpartyName:
              "Ege Servis",
            documentNo: "180340",
            currency: "TRY",
            previousAmount: 600_000,
            currentAmount: null,
            amountDelta: -600_000,
            previousDate: "2026-08-30",
            currentDate: null,
            dateShiftDays: null,
            liquidityImpact: -600_000,
          },
        ],
      },

      movement: {
        forecastMovement: -5_100_000,
        identifiedDriverImpact: -5_100_000,
        unexplainedMovement: 0,
        status: "RECONCILED",
      },

      forecastBridge: {
        actualClosingMovement: -5_100_000,
        identifiedClosingMovement: -5_100_000,
        unexplainedClosingMovement: 0,
        actualMinimumMovement: -7_300_000,
        identifiedMinimumMovement: -7_300_000,
        unexplainedMinimumMovement: 0,
        status: "RECONCILED",
      },
    },
  };
