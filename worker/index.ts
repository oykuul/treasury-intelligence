import { normalizeRecords } from "./canonical/normalize-records";
import {
  createAlmPosition,
  deleteAlmPosition,
  listAlmPositions,
} from "./alm/position-store";
import {
  summarizeAlmPositions,
  validateAlmPosition,
} from "./alm/positions";
import { persistCanonicalRecords } from "./canonical/persist-records";
import { buildTreasuryChangeAnalysis } from "./changes/build-treasury-change-analysis";
import { parseCsvText } from "./ingestion/csv";
import { detectColumns } from "./ingestion/detect-columns";
import { persistAnalysis } from "./ingestion/persist-analysis";
import { parseSourceType } from "./ingestion/source-type";
import { persistQualityIssues } from "./quality/persist-quality";
import { runDataQuality } from "./quality/run-quality";
import { reconcileImport } from "./reconciliation/reconcile-import";
import { persistReconciliation } from "./reconciliation/persist-reconciliation";
import { loadTreasuryDatasets } from "./treasury/load-treasury-datasets";
import { runTreasuryAnalysis } from "./treasury/run-treasury-analysis";
import { buildLiquidityForecast } from "./treasury/build-liquidity-forecast";

const DEV_ORG_ID = "org_demo";

type CreateImportBody = {
  fileName?: string;
  sourceType?: string;
  rowCount?: number;
  columnCount?: number;
};

type TreasuryAnalysisBody = {
  importIds?: string[];
  previousImportIds?: string[];

  currency?: string;
  asOfDate?: string;

  openingLiquidity?: number;
  previousOpeningLiquidity?: number;
  unusedCommittedFacilities?: number;

  minimumLiquidityBuffer?: number;
  minimumLiquidityThreshold?: number;

  gapTargetDate?: string;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // HEALTH CHECK
    if (
      url.pathname === "/api/health" &&
      request.method === "GET"
    ) {
      return Response.json({
        status: "ok",
        service: "treasury-intelligence-api",
        version: "0.8.0",
        database: "connected",
      });
    }

    // ANALYZE IMPORT
    if (
      url.pathname === "/api/imports/analyze" &&
      request.method === "POST"
    ) {
      const formData = await request.formData();

      const uploadedFile =
        formData.get("file");

      const sourceTypeResult =
        parseSourceType(
          formData.get("sourceType"),
        );

      if (!sourceTypeResult.valid) {
        return Response.json(
          {
            error:
              sourceTypeResult.error,
          },
          {
            status: 400,
          },
        );
      }

      const sourceType =
        sourceTypeResult.sourceType;

      if (!(uploadedFile instanceof File)) {
        return Response.json(
          {
            error: "CSV file is required",
          },
          {
            status: 400,
          },
        );
      }

      if (
        !uploadedFile.name
          .toLowerCase()
          .endsWith(".csv")
      ) {
        return Response.json(
          {
            error:
              "Only CSV files are supported in this version",
          },
          {
            status: 400,
          },
        );
      }

      // 1. Read CSV
      const csvText =
        await uploadedFile.text();

      // 2. Parse CSV
      const parsed =
        parseCsvText(csvText);

      if (parsed.headers.length === 0) {
        return Response.json(
          {
            error:
              "CSV could not be parsed",
            issues:
              parsed.issues,
          },
          {
            status: 400,
          },
        );
      }

      // 3. Detect and map source columns
      const mappings =
        detectColumns(
          parsed.headers,
          parsed.rows,
        );

      // 4. Persist import metadata,
      // source columns and mappings
      const persisted =
        await persistAnalysis(
          env.DB,
          {
            organizationId:
              DEV_ORG_ID,

            fileName:
              uploadedFile.name,

            sourceType,

            parsed,
            mappings,
          },
        );

      // 5. Run deterministic
      // data quality checks
      const quality =
        runDataQuality(
          parsed,
          mappings,
        );

      // 6. Persist data quality issues
      const persistedQuality =
        await persistQualityIssues(
          env.DB,
          persisted.importId,
          quality,
        );

      // 7. Normalize source rows
      // into canonical treasury records
      const canonicalRecords =
        normalizeRecords(
          parsed,
          mappings,
        );

      // 8. Persist canonical records
      const persistedCanonical =
        await persistCanonicalRecords(
          env.DB,
          persisted.importId,
          canonicalRecords,
        );

      // 9. Reconcile source data
      // against canonical records
      const reconciliation =
        reconcileImport(
          parsed,
          mappings,
          canonicalRecords,
        );

      // 10. Persist reconciliation result
      const persistedReconciliation =
        await persistReconciliation(
          env.DB,
          persisted.importId,
          reconciliation,
        );

      return Response.json({
        import: persisted,

        quality: {
          ...quality.summary,

          persisted:
            persistedQuality,

          issues:
            quality.issues,
        },

        canonical: {
          recordsCreated:
            canonicalRecords.length,

          persisted:
            persistedCanonical,
        },

        reconciliation: {
          ...reconciliation,

          persisted:
            persistedReconciliation,
        },

        file: {
          name:
            uploadedFile.name,

          size:
            uploadedFile.size,

          type:
            uploadedFile.type,
        },

        dataset: {
          sourceType,

          rowCount:
            parsed.rowCount,

          columnCount:
            parsed.columnCount,

          delimiter:
            parsed.delimiter,
        },

        summary: {
          autoMatched:
            mappings.filter(
              (item) =>
                item.status ===
                "auto_matched",
            ).length,

          reviewRequired:
            mappings.filter(
              (item) =>
                item.status ===
                "review",
            ).length,

          unmatched:
            mappings.filter(
              (item) =>
                item.status ===
                "unmatched",
            ).length,

          parseIssues:
            parsed.issues.length,
        },

        mappings,

        parseIssues:
          parsed.issues,
      });
    }

    // Ensure demo organization exists
    await env.DB
      .prepare(`
        INSERT OR IGNORE INTO organizations (
          id,
          name
        )
        VALUES (?, ?)
      `)
      .bind(
        DEV_ORG_ID,
        "Demo Organization",
      )
      .run();

    // LIST MANUAL ALM POSITIONS
    if (
      url.pathname ===
        "/api/alm/positions" &&
      request.method === "GET"
    ) {
      const positions =
        await listAlmPositions(
          env.DB,
          DEV_ORG_ID,
        );

      const currency =
        url.searchParams.get(
          "currency",
        ) ?? "TRY";

      return Response.json({
        positions,
        summary:
          summarizeAlmPositions(
            positions,
            currency,
          ),
      });
    }

    // CREATE MANUAL ALM POSITION
    if (
      url.pathname ===
        "/api/alm/positions" &&
      request.method === "POST"
    ) {
      try {
        const input =
          validateAlmPosition(
            await request.json(),
          );

        const position =
          await createAlmPosition(
            env.DB,
            DEV_ORG_ID,
            input,
          );

        return Response.json(
          position,
          {
            status: 201,
          },
        );
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "ALM position could not be created.",
          },
          {
            status: 400,
          },
        );
      }
    }

    // DELETE MANUAL ALM POSITION
    const almPositionMatch =
      url.pathname.match(
        /^\/api\/alm\/positions\/([^/]+)$/,
      );

    if (
      almPositionMatch &&
      request.method === "DELETE"
    ) {
      const deleted =
        await deleteAlmPosition(
          env.DB,
          DEV_ORG_ID,
          almPositionMatch[1],
        );

      if (!deleted) {
        return Response.json(
          {
            error:
              "ALM position not found.",
          },
          {
            status: 404,
          },
        );
      }

      return new Response(null, {
        status: 204,
      });
    }

    // CREATE IMPORT MANUALLY
    if (
      url.pathname === "/api/imports" &&
      request.method === "POST"
    ) {
      try {
        const body =
          (await request.json()) as CreateImportBody;

        if (!body.fileName?.trim()) {
          return Response.json(
            {
              error:
                "fileName is required",
            },
            {
              status: 400,
            },
          );
        }

        const importId =
          crypto.randomUUID();

        await env.DB
          .prepare(`
            INSERT INTO imports (
              id,
              organization_id,
              file_name,
              source_type,
              status,
              row_count,
              column_count,
              mapping_status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            importId,
            DEV_ORG_ID,
            body.fileName.trim(),
            body.sourceType ?? null,
            "uploaded",
            body.rowCount ?? 0,
            body.columnCount ?? 0,
            "pending",
          )
          .run();

        const createdImport =
          await env.DB
            .prepare(`
              SELECT *
              FROM imports
              WHERE id = ?
            `)
            .bind(importId)
            .first();

        return Response.json(
          createdImport,
          {
            status: 201,
          },
        );
      } catch {
        return Response.json(
          {
            error:
              "Invalid JSON body",
          },
          {
            status: 400,
          },
        );
      }
    }

    // LIST IMPORTS
    if (
      url.pathname === "/api/imports" &&
      request.method === "GET"
    ) {
      const result =
        await env.DB
          .prepare(`
            SELECT *
            FROM imports
            WHERE organization_id = ?
            ORDER BY created_at DESC
          `)
          .bind(
            DEV_ORG_ID,
          )
          .all();

      return Response.json({
        imports:
          result.results,
      });
    }

    // BUILD COMPLETE CFO ANALYSIS
    // FROM PERSISTED TREASURY IMPORTS
    if (
      url.pathname ===
        "/api/treasury/analyze" &&
      request.method === "POST"
    ) {
      try {
        const body =
          (await request.json()) as
            TreasuryAnalysisBody;

        if (
          !Array.isArray(
            body.importIds,
          ) ||
          body.importIds.some(
            (importId) =>
              typeof importId !==
              "string",
          )
        ) {
          throw new Error(
            "importIds must be an array of strings.",
          );
        }

        if (
          body.previousImportIds !==
            undefined &&
          (
            !Array.isArray(
              body.previousImportIds,
            ) ||
            body.previousImportIds.some(
              (importId) =>
                typeof importId !==
                "string",
            )
          )
        ) {
          throw new Error(
            "previousImportIds must be an array of strings.",
          );
        }

        if (
          typeof body.currency !==
          "string"
        ) {
          throw new Error(
            "currency is required.",
          );
        }

        if (
          typeof body.asOfDate !==
          "string"
        ) {
          throw new Error(
            "asOfDate is required.",
          );
        }

        if (
          typeof body.openingLiquidity !==
          "number"
        ) {
          throw new Error(
            "openingLiquidity is required.",
          );
        }

        if (
          typeof body.unusedCommittedFacilities !==
          "number"
        ) {
          throw new Error(
            "unusedCommittedFacilities is required.",
          );
        }

        if (
          typeof body.minimumLiquidityBuffer !==
          "number"
        ) {
          throw new Error(
            "minimumLiquidityBuffer is required.",
          );
        }

        const datasets =
          body.importIds.length === 0
            ? []
            : await loadTreasuryDatasets(
                env.DB,
                DEV_ORG_ID,
                body.importIds,
              );

        const allPositions =
          await listAlmPositions(
            env.DB,
            DEV_ORG_ID,
          );
        const eligiblePositions =
          allPositions.filter(
            (position) =>
              position.currency
                .trim()
                .toUpperCase() ===
                body.currency
                  .trim()
                  .toUpperCase() &&
              position.asOfDate <=
                body.asOfDate,
          );
        const latestPositionDate =
          eligiblePositions.reduce(
            (latest, position) =>
              position.asOfDate > latest
                ? position.asOfDate
                : latest,
            "",
          );
        const positions =
          latestPositionDate
            ? eligiblePositions.filter(
                (position) =>
                  position.asOfDate ===
                  latestPositionDate,
              )
            : [];
        const positionSummary =
          summarizeAlmPositions(
            positions,
            body.currency,
          );
        const hasManualPositions =
          positions.length > 0;
        const openingLiquidity =
          hasManualPositions
            ? positionSummary.availableCash
            : body.openingLiquidity;
        const availableFacilities =
          hasManualPositions
            ? positionSummary.availableFacilities
            : body.unusedCommittedFacilities;

        const analysis =
          runTreasuryAnalysis({
            datasets,

            positions,

            currency:
              body.currency,

            asOfDate:
              body.asOfDate,

            openingLiquidity:
              openingLiquidity,

            unusedCommittedFacilities:
              availableFacilities,

            minimumLiquidityBuffer:
              body.minimumLiquidityBuffer,

            minimumLiquidityThreshold:
              body.minimumLiquidityThreshold,

            gapTargetDate:
              body.gapTargetDate,
          });

        let previousImports:
          {
            ids: string[];
            datasets: {
              sourceType: string;
              records: number;
            }[];
          } |
          null = null;

        let changes:
          ReturnType<
            typeof buildTreasuryChangeAnalysis
          > |
          null = null;

        if (
          body.previousImportIds
        ) {
          const previousDatasets =
            await loadTreasuryDatasets(
              env.DB,
              DEV_ORG_ID,
              body.previousImportIds,
            );

          const previousForecast =
            buildLiquidityForecast({
              datasets:
                previousDatasets,

              currency:
                body.currency,

              openingLiquidity:
                body.previousOpeningLiquidity ??
                body.openingLiquidity,

              startDate:
                analysis.asOfDate,

              endDate:
                analysis.endDate,
            });

          changes =
            buildTreasuryChangeAnalysis({
              previousDatasets,
              currentDatasets:
                datasets,

              previousForecast,
              currentForecast:
                analysis.forecast,
            });

          previousImports = {
            ids:
              body.previousImportIds,

            datasets:
              previousDatasets.map(
                (dataset) => ({
                  sourceType:
                    dataset.type,

                  records:
                    dataset.records.length,
                }),
              ),
          };
        }

        return Response.json({
          imports: {
            ids:
              body.importIds,

            datasets:
              datasets.map(
                (dataset) => ({
                  sourceType:
                    dataset.type,

                  records:
                    dataset.records.length,
                }),
              ),
          },

          previousImports,

          analysis,
          changes,
        });
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Treasury analysis failed.",
          },
          {
            status: 400,
          },
        );
      }
    }

    // GET SINGLE IMPORT
    const importMatch =
      url.pathname.match(
        /^\/api\/imports\/([^/]+)$/,
      );

    if (
      importMatch &&
      request.method === "GET"
    ) {
      const importId =
        importMatch[1];

      const item =
        await env.DB
          .prepare(`
            SELECT *
            FROM imports
            WHERE id = ?
              AND organization_id = ?
          `)
          .bind(
            importId,
            DEV_ORG_ID,
          )
          .first();

      if (!item) {
        return Response.json(
          {
            error:
              "Import not found",
          },
          {
            status: 404,
          },
        );
      }

      return Response.json(
        item,
      );
    }

    // NOT FOUND
    return Response.json(
      {
        error: "Not Found",
      },
      {
        status: 404,
      },
    );
  },
} satisfies ExportedHandler<Env>;
