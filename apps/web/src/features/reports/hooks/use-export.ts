"use client";

import { useMutation } from "@tanstack/react-query";
import { createExportJob, getReportFileSignedUrl } from "../api/export.api";

export function useCreateExportJob() {
  return useMutation({
    meta: { toast: false },
    mutationFn: ({ reportCode, params, format }: { reportCode: string; params: Record<string, unknown>; format: "CSV" | "XLSX" | "PDF" }) =>
      createExportJob(reportCode, params, format),
  });
}

export function useReportFileSignedUrl() {
  return useMutation({
    meta: { toast: false },
    mutationFn: (fileId: string) => getReportFileSignedUrl(fileId),
  });
}
