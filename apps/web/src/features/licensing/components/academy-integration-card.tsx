"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AcademyStartOnboardingResponse, AcademyStatusView } from "../api/academy.api";
import { useRecheckAcademyEntitlement, useStartAcademyOnboarding, useVerifyAcademyOnboarding } from "../hooks/use-academy";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

/**
 * The two-step school-code -> OTP onboarding form. Shown when not yet
 * connected, and again (as "Reconnect / Rotate Key") on an already-connected
 * instance — the server-side onboarding routes are `@ExemptFromLicenseGuard()`
 * specifically so this recovery path stays reachable even if the license has
 * since flipped to SUSPENDED/EXPIRED.
 */
function OnboardingForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("license.academy");
  const startMutation = useStartAcademyOnboarding();
  const verifyMutation = useVerifyAcademyOnboarding();

  const [schoolCode, setSchoolCode] = React.useState("");
  const [started, setStarted] = React.useState<AcademyStartOnboardingResponse | null>(null);
  const [code, setCode] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const response = await startMutation.mutateAsync(schoolCode);
      setStarted(response);
    } catch {
      setFormError(t("genericError"));
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!started) return;
    setFormError(null);
    try {
      await verifyMutation.mutateAsync({ schoolId: started.schoolId, refId: started.refId, code });
      onDone();
    } catch {
      setFormError(t("genericError"));
    }
  }

  if (!started) {
    return (
      <form onSubmit={handleStart} className="space-y-4">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="academy-school-code">{t("schoolCodeLabel")}</Label>
          <Input
            id="academy-school-code"
            value={schoolCode}
            onChange={(e) => setSchoolCode(e.target.value)}
            placeholder="ABC123"
            required
          />
        </div>
        <Button type="submit" disabled={startMutation.isPending}>
          {startMutation.isPending ? t("sendCodeSubmitting") : t("sendCodeSubmit")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Alert>
        <AlertDescription>{t("codeSentMessage", { email: started.email, phone: started.phoneNumber })}</AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label htmlFor="academy-otp-code">{t("otpCodeLabel")}</Label>
        <Input
          id="academy-otp-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="one-time-code"
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={verifyMutation.isPending}>
          {verifyMutation.isPending ? t("verifySubmitting") : t("verifySubmit")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setStarted(null)}>
          {t("startOver")}
        </Button>
      </div>
    </form>
  );
}

export function AcademyIntegrationCard({ status }: { status: AcademyStatusView }) {
  const t = useTranslations("license.academy");
  const recheckMutation = useRecheckAcademyEntitlement();
  const [reonboarding, setReonboarding] = React.useState(false);

  const showForm = !status.connected || reonboarding;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Badge variant={status.connected ? "soft-success" : "soft-primary"}>
          {status.connected ? t("connectedLabel") : t("notConnectedLabel")}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm ? (
          <OnboardingForm onDone={() => setReonboarding(false)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("schoolCodeLabel")}</p>
              <p className="text-sm font-medium text-foreground">{status.academySchoolCode ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("subscriptionLabel")}</p>
              <Badge variant={status.lastAllowed ? "soft-success" : "soft-destructive"}>
                {status.lastAllowed ? t("subscriptionAllowed") : t("subscriptionNotAllowed")}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("lastStatusLabel")}</p>
              <p className="text-sm font-medium text-foreground">{status.lastStatus ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("lastCheckedLabel")}</p>
              <p className="text-sm font-medium text-foreground">{formatDateTime(status.lastCheckedAt)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("lastSuccessLabel")}</p>
              <p className="text-sm font-medium text-foreground">{formatDateTime(status.lastSuccessAt)}</p>
            </div>
            {status.lastError && (
              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground">{t("lastErrorLabel")}</p>
                <p className="text-sm font-medium text-destructive">{status.lastError}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
      {!showForm && (
        <CardFooter className="flex gap-2">
          <Button variant="outline" onClick={() => recheckMutation.mutate()} disabled={recheckMutation.isPending}>
            {recheckMutation.isPending ? t("recheckSubmitting") : t("recheckButton")}
          </Button>
          <Button variant="ghost" onClick={() => setReonboarding(true)}>
            {t("reonboardButton")}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
