"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import type { AcademyLinkStatusDto } from "../api/academy-link.api";
import { useAcademyLink, useRegisterAcademyLink, useTestAcademyLink } from "../hooks/use-academy-link";

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function AcademyLinkCard({ status }: { status: AcademyLinkStatusDto }) {
  const t = useTranslations("academySync.link");
  const register = useRegisterAcademyLink();
  const test = useTestAcademyLink();
  const [address, setAddress] = React.useState(status.registeredBaseUrl ?? status.suggestedBaseUrl);

  const busy = register.isPending || test.isPending;
  const testState = status.lastVerifyOk === null ? "untested" : status.lastVerifyOk ? "passed" : "failed";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Badge variant={!status.registered ? "outline" : testState === "passed" ? "soft-success" : testState === "failed" ? "soft-destructive" : "soft-primary"}>
          {!status.registered ? t("badge.notSetUp") : t(`badge.${testState}`)}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="academy-link-address">{t("addressLabel")}</Label>
          <Input
            id="academy-link-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="https://erp.yourschool.ac.ke/api/v1"
            inputMode="url"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">{t("addressHint")}</p>
        </div>

        {status.registered && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("registeredAt")}</p>
              <p className="text-sm font-medium text-foreground">{formatDateTime(status.registeredAt)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("secretVersion")}</p>
              <p className="text-sm font-medium text-foreground">{status.secretVersion ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("lastCall")}</p>
              <p className="text-sm font-medium text-foreground">{formatDateTime(status.lastInboundAt)}</p>
            </div>
          </div>
        )}

        {status.registered && testState === "passed" && (
          <Alert>
            <AlertDescription>
              {t("testPassed", { when: formatDateTime(status.lastVerifiedAt) })}
              {status.lastVerifyMessage ? ` ${status.lastVerifyMessage}` : ""}
            </AlertDescription>
          </Alert>
        )}
        {status.registered && testState === "failed" && (
          <Alert variant="destructive">
            <AlertDescription>
              {t("testFailed", { when: formatDateTime(status.lastVerifiedAt) })} {status.lastVerifyMessage ?? ""}
              <span className="mt-1 block text-xs">{t("testFailedHint")}</span>
            </AlertDescription>
          </Alert>
        )}
        {status.registered && testState === "untested" && (
          <Alert>
            <AlertDescription>{t("testPending")}</AlertDescription>
          </Alert>
        )}
        {status.registered && <p className="text-xs text-muted-foreground">{t("rotateNote")}</p>}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        <Button disabled={busy || address.trim().length === 0} onClick={() => register.mutate(address.trim())}>
          {register.isPending ? t("registering") : status.registered ? t("registerAgain") : t("register")}
        </Button>
        <Button variant="outline" disabled={busy || !status.registered} onClick={() => test.mutate()}>
          {test.isPending ? t("testing") : t("test")}
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Lets the Klickit Academy call this ERP (it will ask the ERP to start an M-Pesa payment when a parent taps Pay in the
 * parent portal). The admin gives the ERP's public API address; the Academy answers with a secret that signs its
 * requests — it is stored encrypted on the server and never shown. "Test connection" proves the whole path end to end.
 * Shown on the Licence page once the ERP is connected to its Academy school.
 */
export function AcademyLinkSection({ connected }: { connected: boolean }) {
  const query = useAcademyLink();
  if (!connected) return null;
  return <QueryBoundary query={query}>{(status) => <AcademyLinkCard status={status} />}</QueryBoundary>;
}
