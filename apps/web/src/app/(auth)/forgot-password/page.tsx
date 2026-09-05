"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ForgotPasswordDtoSchema } from "@klickit/contracts";
import { ArrowRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Reveal } from "@/components/patterns/reveal";
import { AuthCard, authInputClass, authSubmitButtonClass } from "../_components/auth-card";
import { useForgotPassword } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

/**
 * `PasswordService.forgotPassword()` gives a uniform response regardless of
 * whether `identifier` resolves to a real account (no user enumeration —
 * see that service's own doc comment) — this page mirrors that at the UI
 * layer too: submitting always flips to the same success message, never a
 * different one for "account not found".
 */
export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const mutation = useForgotPassword();

  const [identifier, setIdentifier] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = ForgotPasswordDtoSchema.safeParse({ identifier });
    if (!parsed.success) {
      setFormError(t("genericError"));
      return;
    }
    try {
      await mutation.mutateAsync(parsed.data);
      setSuccess(true);
    } catch {
      setFormError(t("genericError"));
    }
  }

  return (
    <Reveal>
      <AuthCard title={t("title")} description={t("subtitle")}>
        {success ? (
          <div className="space-y-5">
            <Alert>
              <AlertDescription>{t("successMessage")}</AlertDescription>
            </Alert>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/login">{t("backToLogin")}</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="identifier">{t("identifierLabel")}</Label>
              <div className="relative">
                <User aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="identifier"
                  autoComplete="username"
                  className={cn(authInputClass, "pl-10")}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button type="submit" className={authSubmitButtonClass} disabled={mutation.isPending}>
              {mutation.isPending ? t("submitting") : t("submit")}
              {!mutation.isPending && <ArrowRight className="size-4" />}
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/login">{t("backToLogin")}</Link>
            </Button>
          </form>
        )}
      </AuthCard>
    </Reveal>
  );
}
