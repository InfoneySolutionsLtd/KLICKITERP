"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { CompleteFirstRunSetupDtoSchema } from "@klickit/contracts";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Reveal } from "@/components/patterns/reveal";
import { AuthCard, authInputClass, authSubmitButtonClass } from "../_components/auth-card";
import { useStartFirstRunOnboarding, useVerifyFirstRunOnboarding } from "@/features/licensing/hooks/use-academy";
import type { AcademyOnboardingVerifyResult } from "@/features/licensing/api/academy.api";
import { useActivate2fa, useCompleteFirstRunSetup, useEnroll2fa } from "@/hooks/use-auth";
import { establishSession } from "@/lib/session-api";
import type { TwoFactorEnrollResult } from "@/lib/auth-types";
import { ApiError } from "@/lib/api-error";

type Step = "school-code" | "otp" | "review" | "two-factor";

/**
 * The pre-login first-run setup wizard — reached only via `<SetupStatusGate>`
 * ((auth)/layout.tsx) redirecting here whenever `GET /auth/setup-status`
 * reports this instance has never had its first System Admin provisioned.
 * Four steps, in order: school code -> OTP -> review school/admin details +
 * choose a password -> optional 2FA. School/administrator data from the
 * verify response lives ONLY in this component's own React state between
 * steps — nothing round-trips it to any other persistence, so a hard
 * refresh mid-wizard restarts from the school-code step (a documented,
 * accepted rough edge for a one-time setup flow).
 */
export default function FirstRunSetupPage() {
  const t = useTranslations("setup");
  const router = useRouter();

  const startMutation = useStartFirstRunOnboarding();
  const verifyMutation = useVerifyFirstRunOnboarding();
  const completeSetupMutation = useCompleteFirstRunSetup();
  const enroll2faMutation = useEnroll2fa();
  const activate2faMutation = useActivate2fa();

  const [step, setStep] = React.useState<Step>("school-code");
  const [formError, setFormError] = React.useState<string | null>(null);

  const [schoolCode, setSchoolCode] = React.useState("");
  const [started, setStarted] = React.useState<{ schoolId: string; refId: string; email: string; phoneNumber: string } | null>(null);
  const [otpCode, setOtpCode] = React.useState("");

  const [verified, setVerified] = React.useState<AcademyOnboardingVerifyResult | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const [enrollment, setEnrollment] = React.useState<TwoFactorEnrollResult | null>(null);
  const [twoFactorCode, setTwoFactorCode] = React.useState("");
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(null);

  async function handleSchoolCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const result = await startMutation.mutateAsync(schoolCode);
      setStarted({ schoolId: result.schoolId, refId: result.refId, email: result.email, phoneNumber: result.phoneNumber });
      setStep("otp");
    } catch {
      setFormError(t("genericError"));
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!started) return;
    setFormError(null);
    try {
      const result = await verifyMutation.mutateAsync({ schoolId: started.schoolId, refId: started.refId, code: otpCode });
      setVerified(result);
      setStep("review");
    } catch {
      setFormError(t("otp.invalidCode"));
    }
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!verified) return;
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError(t("review.passwordMismatch"));
      return;
    }

    const parsed = CompleteFirstRunSetupDtoSchema.safeParse({
      schoolName: verified.school.schoolName,
      administratorEmail: verified.administrator.email,
      administratorFirstName: verified.administrator.firstName,
      administratorLastName: verified.administrator.lastName,
      password,
    });
    if (!parsed.success) {
      setFormError(t("review.genericError"));
      return;
    }

    try {
      const outcome = await completeSetupMutation.mutateAsync(parsed.data);
      if (!outcome.user || !outcome.accessToken || !outcome.refreshToken) {
        setFormError(t("review.genericError"));
        return;
      }
      await establishSession({
        accessToken: outcome.accessToken,
        refreshToken: outcome.refreshToken,
        user: outcome.user,
        mustChangePassword: false,
      });
      setStep("two-factor");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError(t("review.alreadySetUp"));
      } else {
        setFormError(t("review.genericError"));
      }
    }
  }

  async function handleSetUpTwoFactor() {
    setFormError(null);
    try {
      const result = await enroll2faMutation.mutateAsync();
      setEnrollment(result);
    } catch {
      setFormError(t("twoFactor.genericError"));
    }
  }

  async function handleActivateTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const result = await activate2faMutation.mutateAsync({ code: twoFactorCode });
      setRecoveryCodes(result.recoveryCodes);
    } catch {
      setFormError(t("twoFactor.invalidCode"));
    }
  }

  function goToDashboard() {
    router.push("/dashboard");
  }

  if (step === "school-code") {
    return (
      <Reveal>
        <AuthCard title={t("schoolCode.title")} description={t("schoolCode.subtitle")}>
          <form onSubmit={handleSchoolCodeSubmit} className="space-y-5">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="school-code">{t("schoolCode.label")}</Label>
              <Input id="school-code" className={authInputClass} value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} required />
            </div>
            <Button type="submit" className={authSubmitButtonClass} disabled={startMutation.isPending}>
              {startMutation.isPending ? t("schoolCode.submitting") : t("schoolCode.submit")}
              {!startMutation.isPending && <ArrowRight className="size-4" />}
            </Button>
          </form>
        </AuthCard>
      </Reveal>
    );
  }

  if (step === "otp") {
    return (
      <Reveal>
        <AuthCard title={t("otp.title")} description={t("otp.subtitle")}>
          <form onSubmit={handleOtpSubmit} className="space-y-5">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            {started && (
              <Alert>
                <AlertDescription>{t("otp.codeSentMessage", { email: started.email, phone: started.phoneNumber })}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="otp-code">{t("otp.codeLabel")}</Label>
              <Input
                id="otp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                className={authInputClass}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className={authSubmitButtonClass} disabled={verifyMutation.isPending}>
                {verifyMutation.isPending ? t("otp.submitting") : t("otp.submit")}
                {!verifyMutation.isPending && <ArrowRight className="size-4" />}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep("school-code")}>
                {t("otp.startOver")}
              </Button>
            </div>
          </form>
        </AuthCard>
      </Reveal>
    );
  }

  if (step === "review" && verified) {
    return (
      <Reveal>
        <AuthCard title={t("review.title")} description={t("review.subtitle")}>
          <form onSubmit={handleReviewSubmit} className="space-y-5">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("review.schoolLabel")}</p>
                <p className="text-sm font-medium text-foreground">{verified.school.schoolName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("review.adminLabel")}</p>
                <p className="text-sm font-medium text-foreground">
                  {verified.administrator.firstName} {verified.administrator.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{verified.administrator.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-password">{t("review.passwordLabel")}</Label>
              <PasswordInput id="setup-password" autoComplete="new-password" className={authInputClass} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-confirm-password">{t("review.confirmPasswordLabel")}</Label>
              <PasswordInput
                id="setup-confirm-password"
                autoComplete="new-password"
                className={authInputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className={authSubmitButtonClass} disabled={completeSetupMutation.isPending}>
              {completeSetupMutation.isPending ? t("review.submitting") : t("review.submit")}
              {!completeSetupMutation.isPending && <ArrowRight className="size-4" />}
            </Button>
          </form>
        </AuthCard>
      </Reveal>
    );
  }

  if (step === "two-factor") {
    if (recoveryCodes) {
      return (
        <Reveal>
          <AuthCard title={t("twoFactor.recoveryCodesTitle")} description={t("twoFactor.recoveryCodesWarning")}>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-4 font-mono text-sm">
                {recoveryCodes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
              <Button type="button" className={authSubmitButtonClass} onClick={goToDashboard}>
                {t("twoFactor.continueToDashboard")}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </AuthCard>
        </Reveal>
      );
    }

    if (enrollment) {
      return (
        <Reveal>
          <AuthCard title={t("twoFactor.title")} description={t("twoFactor.qrInstructions")}>
            <form onSubmit={handleActivateTwoFactor} className="space-y-5">
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-lg bg-white p-3">
                  <QRCodeSVG value={enrollment.otpauthUri} size={160} />
                </div>
                <p className="text-xs text-muted-foreground">{t("twoFactor.manualKeyLabel")}</p>
                <code className="rounded bg-muted px-2 py-1 text-xs">{enrollment.manualKey}</code>
              </div>
              <div className="space-y-2">
                <Label htmlFor="twofactor-code">{t("twoFactor.codeLabel")}</Label>
                <Input
                  id="twofactor-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className={authInputClass}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>
              <Button type="submit" className={authSubmitButtonClass} disabled={activate2faMutation.isPending}>
                {activate2faMutation.isPending ? t("twoFactor.activateSubmitting") : t("twoFactor.activateSubmit")}
              </Button>
            </form>
          </AuthCard>
        </Reveal>
      );
    }

    return (
      <Reveal>
        <AuthCard title={t("twoFactor.title")} description={t("twoFactor.subtitle")}>
          <div className="space-y-5">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <ShieldCheck className="size-10 text-primary" />
            </div>
            <Button type="button" className={authSubmitButtonClass} onClick={handleSetUpTwoFactor} disabled={enroll2faMutation.isPending}>
              {enroll2faMutation.isPending ? t("twoFactor.enrollSubmitting") : t("twoFactor.setUpNow")}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={goToDashboard}>
              {t("twoFactor.skip")}
            </Button>
          </div>
        </AuthCard>
      </Reveal>
    );
  }

  return null;
}
