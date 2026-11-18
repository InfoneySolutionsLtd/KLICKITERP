"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import type { AcademyPublishStatusDto } from "../api/academy-publish.api";
import { useAcademyPublish, useRunAcademyPublish, useSetAcademyPublish } from "../hooks/use-academy-publish";

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function AcademyPublishCard({ status }: { status: AcademyPublishStatusDto }) {
  const t = useTranslations("academySync.publish");
  const setEnabled = useSetAcademyPublish();
  const run = useRunAcademyPublish();
  const busy = setEnabled.isPending || run.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Badge variant={!status.enabled ? "outline" : status.lastPublishOk === false ? "soft-destructive" : "soft-success"}>
          {!status.enabled ? t("badge.off") : status.lastPublishOk === false ? t("badge.problem") : t("badge.on")}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>{t("privacy")}</AlertDescription>
        </Alert>

        <div className="flex items-start gap-2">
          <Checkbox
            id="academy-publish-enabled"
            checked={status.enabled}
            disabled={busy || (!status.enabled && !status.connected)}
            onChange={(e) => setEnabled.mutate(e.target.checked)}
          />
          <div className="space-y-0.5">
            <Label htmlFor="academy-publish-enabled" className="text-sm font-medium leading-snug">
              {t("switchLabel")}
            </Label>
            <p className="text-xs text-muted-foreground">{t("switchHint")}</p>
          </div>
        </div>

        {status.enabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("published")}</p>
                <p className="text-sm font-medium text-foreground">{status.published}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("waiting")}</p>
                <p className="text-sm font-medium text-foreground">{status.pending - status.rejected}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("notAccepted")}</p>
                <p className="text-sm font-medium text-foreground">{status.rejected}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("lastRun")}</p>
                <p className="text-sm font-medium text-foreground">{formatDateTime(status.lastPublishAt)}</p>
              </div>
            </div>

            {status.lastPublishMessage && (
              <p className={status.lastPublishOk === false ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{status.lastPublishMessage}</p>
            )}

            {status.recentRejections.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <span className="font-medium">{t("rejectedTitle")}</span>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                    {status.recentRejections.map((rejection) => (
                      <li key={rejection.invoiceNumber}>
                        {rejection.invoiceNumber}: {rejection.reason}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-1 block text-xs">{t("rejectedHint")}</span>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {!status.connected && <p className="text-xs text-muted-foreground">{t("notConnected")}</p>}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !status.enabled} onClick={() => run.mutate()}>
          {run.isPending ? t("publishing") : t("publishNow")}
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Switch for showing this school's invoices in the Klickit Academy parent portal. Off by default. When on, invoices of
 * learners linked to the Academy are published automatically (a new invoice or a payment goes out within moments; anything
 * else within a few minutes). Each parent sees only their own children's invoices — that link is decided by the Academy.
 */
export function AcademyPublishSection({ connected }: { connected: boolean }) {
  const query = useAcademyPublish();
  if (!connected) return null;
  return <QueryBoundary query={query}>{(status) => <AcademyPublishCard status={status} />}</QueryBoundary>;
}
