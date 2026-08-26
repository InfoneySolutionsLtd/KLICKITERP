import type { ReportDefinitionResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

export async function listReports(): Promise<ReportDefinitionResponseDto[]> {
  return unwrapApiResult<ReportDefinitionResponseDto[]>(await apiClient.GET("/api/v1/reports"));
}

export async function getReport(code: string): Promise<ReportDefinitionResponseDto> {
  return unwrapApiResult<ReportDefinitionResponseDto>(
    await apiClient.GET("/api/v1/reports/{code}", { params: { path: { code } } }),
  );
}
