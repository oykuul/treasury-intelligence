import { normalizeRecords } from "./canonical/normalize-records";
import { persistCanonicalRecords } from "./canonical/persist-records";
import { parseCsvText } from "./ingestion/csv";
import { detectColumns } from "./ingestion/detect-columns";
import { persistAnalysis } from "./ingestion/persist-analysis";
import { persistQualityIssues } from "./quality/persist-quality";
import { runDataQuality } from "./quality/run-quality";
import { reconcileImport } from "./reconciliation/reconcile-import";
import { persistReconciliation } from "./reconciliation/persist-reconciliation";

const DEV_ORG_ID = "org_demo";

type CreateImportBody = {
  fileName?: string;
  sourceType?: string;
  rowCount?: number;
  columnCount?: number;
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
        version: "0.5.0",
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

            sourceType:
              null,

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