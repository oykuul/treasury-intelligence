import type {
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
