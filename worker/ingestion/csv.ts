import Papa from "papaparse";

export type CsvParseIssue = {
  row?: number;
  code: string;
  message: string;
};

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  rowCount: number;
  columnCount: number;
  delimiter: string;
  issues: CsvParseIssue[];
};

function cleanCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function removeBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

export function parseCsvText(csvText: string): ParsedCsv {
  const result = Papa.parse<string[]>(removeBom(csvText), {
    skipEmptyLines: "greedy",
  });

  const parsedRows = result.data.map((row) =>
    row.map((cell) => cleanCell(cell)),
  );

  if (parsedRows.length === 0) {
    return {
      headers: [],
      rows: [],
      rowCount: 0,
      columnCount: 0,
      delimiter: result.meta.delimiter ?? ",",
      issues: [
        {
          code: "EMPTY_FILE",
          message: "CSV file does not contain any rows.",
        },
      ],
    };
  }

  const headers = parsedRows[0];
  const rows = parsedRows.slice(1);

  const issues: CsvParseIssue[] = result.errors.map((error) => ({
    row:
      typeof error.row === "number"
        ? error.row + 1
        : undefined,
    code: error.code,
    message: error.message,
  }));

  if (headers.some((header) => header === "")) {
    issues.push({
      code: "EMPTY_HEADER",
      message: "One or more source columns have an empty header.",
    });
  }

  const normalizedHeaders = headers.map((header) =>
    header.toUpperCase().trim(),
  );

  const duplicateHeaders = normalizedHeaders.filter(
    (header, index) =>
      header !== "" &&
      normalizedHeaders.indexOf(header) !== index,
  );

  for (const duplicate of [...new Set(duplicateHeaders)]) {
    issues.push({
      code: "DUPLICATE_HEADER",
      message: `Duplicate source column detected: ${duplicate}`,
    });
  }

  rows.forEach((row, index) => {
    if (row.length !== headers.length) {
      issues.push({
        row: index + 2,
        code: "COLUMN_COUNT_MISMATCH",
        message:
          `Expected ${headers.length} columns but found ${row.length}.`,
      });
    }
  });

  return {
    headers,
    rows,
    rowCount: rows.length,
    columnCount: headers.length,
    delimiter: result.meta.delimiter ?? ",",
    issues,
  };
}