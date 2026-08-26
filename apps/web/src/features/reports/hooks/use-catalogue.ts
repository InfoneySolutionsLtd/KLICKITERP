"use client";

import { useQuery } from "@tanstack/react-query";
import { getReport, listReports } from "../api/catalogue.api";

export const REPORTS_QUERY_KEY = ["reports"] as const;

function detailKey(code: string | undefined) {
  return [...REPORTS_QUERY_KEY, "detail", code] as const;
}

export function useReportCatalogue() {
  return useQuery({ queryKey: [...REPORTS_QUERY_KEY, "list"], queryFn: listReports });
}

export function useReportDefinition(code: string | undefined) {
  return useQuery({ queryKey: detailKey(code), queryFn: () => getReport(code as string), enabled: !!code });
}
