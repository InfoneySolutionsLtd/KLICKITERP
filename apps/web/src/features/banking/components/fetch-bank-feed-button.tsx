"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { DownloadCloud } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { useFetchBankFeed } from "../hooks/use-statement-import";

/**
 * Complete the Integrations area, Part 4.2 — the manual "Fetch Now" trigger
 * for a real `BANK` integration feed. Follows this codebase's established
 * "one `useMutation` hook + `<Button>` + inline `<Alert>` result/error"
 * shape (no toast library anywhere in this app). A real `422` when no
 * enabled `BANK` config matches this account (`ValidationException`,
 * `BankFeedImportService.fetchAndImport()`) surfaces verbatim via
 * `ApiError.message`, never re-worded — the honest "not configured yet"
 * signal, distinct from an unexpected failure.
 */
export function FetchBankFeedButton({ accountId }: { accountId: string }) {
  const t = useTranslations("banking.statementImports.list");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ insertedCount: number; duplicateCount: number } | null>(null);
  const fetchMutation = useFetchBankFeed();

  async function handleFetch() {
    setError(null);
    setResult(null);
    try {
      const response = await fetchMutation.mutateAsync(accountId);
      setResult({ insertedCount: response.insertedCount, duplicateCount: response.duplicateCount });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("fetchFeedGenericError"));
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void handleFetch()} disabled={fetchMutation.isPending}>
        <DownloadCloud className="size-4" />
        {fetchMutation.isPending ? t("fetchingFeed") : t("fetchFeedTrigger")}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert variant="success">
          <AlertDescription>{t("fetchFeedResult", { inserted: result.insertedCount, duplicates: result.duplicateCount })}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
