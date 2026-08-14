import type {
  DatasetType,
  ImportAnalysisResponse,
  TreasuryAnalysisRequest,
  TreasuryAnalysisResponse,
} from "./treasury-types";

type ApiError = {
  error?: string;
};

async function readResponse<T>(
  response: Response,
): Promise<T> {
  const body = (await response.json()) as T & ApiError;

  if (!response.ok) {
    throw new Error(
      body.error ??
        `Request failed with status ${response.status}.`,
    );
  }

  return body;
}

export async function analyzeImport(
  file: File,
  sourceType: DatasetType,
): Promise<ImportAnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sourceType", sourceType);

  const response = await fetch(
    "/api/imports/analyze",
    {
      method: "POST",
      body: formData,
    },
  );

  return readResponse<ImportAnalysisResponse>(response);
}

export async function analyzeTreasury(
  request: TreasuryAnalysisRequest,
): Promise<TreasuryAnalysisResponse> {
  const response = await fetch(
    "/api/treasury/analyze",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  return readResponse<TreasuryAnalysisResponse>(response);
}
