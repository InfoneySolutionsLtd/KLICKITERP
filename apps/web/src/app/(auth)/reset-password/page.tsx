"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ResetPasswordDtoSchema } from "@klickit/contracts";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Reveal } from "@/components/patterns/reveal";
import { AuthCard, authInputClass, authSubmitButtonClass } from "../_components/auth-card";
import { useResetPassword } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api-error";

/**
 * Link-only flow — the email `PasswordService.forgotPassword()` sends now
 * carries `?token=` directly (see that service's own doc comment), so this
 * page never shows a manual token-paste field: no `token` param means the
 * link itself is broken/incomplete, not something a user can fix by typing.
 *
 * `useSearchParams()` requires a `<Suspense>` boundary per Next.js App
 * Router — same split-into-a-child-component pattern
 * `app/(erp)/billing/collect/page.tsx` already established for the same API.
 */
function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const token = useSearchParams().get("token");
  const mutation = useResetPassword();

  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  if (!token) {
    return (
      <div className="space-y-5">
        <Alert variant="destructive">
          <AlertDescription>{t("invalidLinkMessage")}</AlertDescription>
        </Alert>
        <Button asChild className={authSubmitButtonClass}>
          <Link href="/forgot-password">
            {t("requestNewLink")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (newPassword !== confirmPassword) {
      setFormError(t("mismatch"));
      return;
    }
    const parsed = ResetPasswordDtoSchema.safeParse({ token, newPassword });
    if (!parsed.success) {
      setFormError(t("tooShort"));
      return;
    }
    try {
      await mutation.mutateAsync(parsed.data);
      setSuccess(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (success) {
    return (
      <div className="space-y-5">
        <Alert>
          <AlertDescription>{t("successMessage")}</AlertDescription>
        </Alert>
        <Button asChild className={authSubmitButtonClass}>
          <Link href="/login">
            {t("continueToLogin")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="newPassword">{t("newPasswordLabel")}</Label>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          minLength={10}
          className={authInputClass}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t("confirmPasswordLabel")}</Label>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          className={authInputClass}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className={authSubmitButtonClass} disabled={mutation.isPending}>
        {mutation.isPending ? t("submitting") : t("submit")}
        {!mutation.isPending && <ArrowRight className="size-4" />}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("auth.resetPassword");

  return (
    <Reveal>
      <AuthCard title={t("title")} description={t("subtitle")}>
        <React.Suspense fallback={null}>
          <ResetPasswordForm />
        </React.Suspense>
      </AuthCard>
    </Reveal>
  );
}
