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
import { useRoles } from "@/features/roles/hooks/use-roles";
import type { AcademyParentInvoicingStatusDto } from "../api/academy-parent-invoicing.api";
import { useAcademyParentInvoicing, useSetAcademyParentInvoicing } from "../hooks/use-academy-parent-invoicing";

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((id, index) => id === [...b].sort()[index]);
}

function AcademyParentInvoicingCard({ status }: { status: AcademyParentInvoicingStatusDto }) {
  const t = useTranslations("academySync.parentInvoicing");
  const save = useSetAcademyParentInvoicing();
  const roles = useRoles();
  // The roles the admin has ticked but not saved yet; follows the server's list whenever that changes.
  const [chosen, setChosen] = React.useState<string[]>(status.notifyRoleIds);
  React.useEffect(() => setChosen(status.notifyRoleIds), [status.notifyRoleIds]);

  // Widened to plain strings: the generated zod type for an enum array is a single odd literal (a known quirk of the
  // codegen, the same one `AcademyPublishStatusDto.receiptSetup.issues` has), which `includes()` cannot compare against.
  const issues: string[] = status.issues;
  const blocked = issues.includes("NOT_CONNECTED") || issues.includes("PUBLISHING_OFF");
  const dirty = !sameIds(chosen, status.notifyRoleIds);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Badge variant={!status.enabled ? "outline" : status.issues.length > 0 ? "soft-destructive" : "soft-success"}>
          {!status.enabled ? t("badge.off") : status.issues.length > 0 ? t("badge.needsSetup") : t("badge.on")}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>{t("rules")}</AlertDescription>
        </Alert>

        {status.issues.length > 0 && (
          <Alert variant={blocked ? "destructive" : undefined}>
            <AlertDescription>
              <span className="font-medium">{t("issuesTitle")}</span>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {status.issues.map((issue) => (
                  <li key={issue}>{t(`issue.${issue}`)}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-start gap-2">
          <Checkbox
            id="academy-parent-invoicing-enabled"
            checked={status.enabled}
            disabled={save.isPending || (!status.enabled && blocked)}
            onChange={(e) => save.mutate({ enabled: e.target.checked })}
          />
          <div className="space-y-0.5">
            <Label htmlFor="academy-parent-invoicing-enabled" className="text-sm font-medium leading-snug">
              {t("switchLabel")}
            </Label>
            <p className="text-xs text-muted-foreground">{t("switchHint")}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{t("notifyTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("notifyHint")}</p>
          {roles.isError ? (
            <p className="text-xs text-muted-foreground">{t("rolesUnavailable")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {(roles.data ?? []).map((role) => (
                <div key={role.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`academy-parent-invoicing-role-${role.id}`}
                    checked={chosen.includes(role.id)}
                    disabled={save.isPending}
                    onChange={(e) => setChosen((current) => (e.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id)))}
                  />
                  <Label htmlFor={`academy-parent-invoicing-role-${role.id}`} className="text-sm">
                    {role.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={save.isPending || !dirty} onClick={() => save.mutate({ enabled: status.enabled, notifyRoleIds: chosen })}>
          {save.isPending ? t("savingRoles") : t("saveRoles")}
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * The school's switch for parents customising and generating their own fee invoices in the Klickit Academy parent portal,
 * plus who is notified when one does. Off by default. Parents only ever choose what the school marked optional, plus a
 * transport route; amounts always come from the school's own fee structure and routes.
 */
export function AcademyParentInvoicingSection({ connected }: { connected: boolean }) {
  const query = useAcademyParentInvoicing();
  if (!connected) return null;
  return <QueryBoundary query={query}>{(status) => <AcademyParentInvoicingCard status={status} />}</QueryBoundary>;
}
