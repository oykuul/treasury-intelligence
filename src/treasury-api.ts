import type {
  AlmPosition,
  AlmPositionInput,
  AlmPositionsResponse,
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

export async function listAlmPositions(
  currency: string,
): Promise<AlmPositionsResponse> {
  const response = await fetch(
    `/api/alm/positions?currency=${encodeURIComponent(currency)}`,
  );

  return readResponse<AlmPositionsResponse>(response);
}

export async function createAlmPosition(
  input: AlmPositionInput,
): Promise<AlmPosition> {
  const response = await fetch(
    "/api/alm/positions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  return readResponse<AlmPosition>(response);
}

export async function deleteAlmPosition(
  positionId: string,
): Promise<void> {
  const response = await fetch(
    `/api/alm/positions/${encodeURIComponent(positionId)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    const body =
      (await response.json()) as
        ApiError;
    throw new Error(
      body.error ??
        "ALM position could not be deleted.",
    );
  }
}
