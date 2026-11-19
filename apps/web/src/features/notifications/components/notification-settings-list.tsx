"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { NotificationEventSettingDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useRoles } from "@/features/roles/hooks/use-roles";
import { useNotificationSettings, useUpdateNotificationSetting } from "../hooks/use-notifications";

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((id, index) => id === [...b].sort()[index]);
}

/** One notification: its on/off switch and, where the school may choose them, the roles that receive it. */
function SettingRow({ item, roles }: { item: NotificationEventSettingDto; roles: Array<{ id: string; name: string }> | undefined }) {
  const t = useTranslations("notifications");
  const save = useUpdateNotificationSetting();
  const [chosen, setChosen] = React.useState<string[]>(item.roleIds);
  React.useEffect(() => setChosen(item.roleIds), [item.roleIds]);
  const dirty = !sameIds(chosen, item.roleIds);
  const choosable = item.audienceKind === "permissions" && !item.audienceManagedElsewhere;
  const roleNames = new Map((roles ?? []).map((role) => [role.id, role.name]));

  let recipients: React.ReactNode;
  if (item.audienceManagedElsewhere) {
    recipients = (
      <span>
        {t("settings.managedElsewhere")}{" "}
        <Link href="/license" className="text-primary hover:underline">
          {t("settings.openLicence")}
        </Link>
      </span>
    );
  } else if (item.audienceKind === "explicit") {
    recipients = t("settings.explicit");
  } else if (item.roleIds.length > 0) {
    recipients = `${t("settings.chosenRoles")}: ${item.roleIds.map((id) => roleNames.get(id) ?? "…").join(", ")}`;
  } else {
    recipients = t("settings.defaultRecipients", { permissions: item.defaultPermissions.join(", ") });
  }

  return (
    <li className="space-y-2 py-4">
      <div className="flex items-start gap-3">
        <Checkbox
          id={`notification-setting-${item.code}`}
          checked={item.isEnabled}
          disabled={save.isPending}
          onChange={(event) => save.mutate({ eventCode: item.code, isEnabled: event.target.checked })}
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor={`notification-setting-${item.code}`} className="text-sm font-medium">
              {t(`types.${item.code}.title` as "types.APPROVAL_PENDING.title")}
            </Label>
            <Badge variant={item.isEnabled ? "soft-success" : "outline"}>{item.isEnabled ? t("settings.on") : t("settings.off")}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{recipients}</p>
        </div>
      </div>

      {choosable && (
        <details className="ml-7 rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-xs font-medium text-foreground">{t("settings.recipientsTitle")}</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">{t("settings.chooseRoles")}</p>
            {roles === undefined ? (
              <p className="text-xs text-muted-foreground">{t("settings.rolesUnavailable")}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {roles.map((role) => (
                  <div key={role.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`notification-role-${item.code}-${role.id}`}
                      checked={chosen.includes(role.id)}
                      disabled={save.isPending}
                      onChange={(event) => setChosen((current) => (event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id)))}
                    />
                    <Label htmlFor={`notification-role-${item.code}-${role.id}`} className="text-sm">
                      {role.name}
                    </Label>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate({ eventCode: item.code, roleIds: chosen })}>
              {save.isPending ? t("settings.saving") : t("settings.saveRoles")}
            </Button>
          </div>
        </details>
      )}
    </li>
  );
}

/**
 * The school's notification settings: every event the bell can send, grouped by category, each with an on/off switch and (where it
 * makes sense) the roles that receive it. Everything starts ON with its default recipients, so a notification is never silently
 * missing just because nobody opened this screen. Needs the Communications trigger-binding permissions (a 403 shows the usual
 * "not allowed" state).
 */
export function NotificationSettingsList() {
  const t = useTranslations("notifications");
  const query = useNotificationSettings();
  const rolesQuery = useRoles();
  const roles = rolesQuery.isError ? undefined : (rolesQuery.data ?? []);

  return (
    <QueryBoundary query={query} isEmpty={(data) => data.items.length === 0}>
      {(data) => {
        const categories = [...new Set(data.items.map((item) => item.category))];
        return (
          <div className="space-y-8">
            {categories.map((category) => {
              const inCategory = data.items.filter((item) => item.category === category);
              return (
                <section key={category} aria-label={t(`categories.${category}.name` as "categories.APPROVALS.name")}>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold text-foreground">{t(`categories.${category}.name` as "categories.APPROVALS.name")}</h3>
                    <p className="text-xs text-muted-foreground">{t(`categories.${category}.description` as "categories.APPROVALS.description")}</p>
                    {inCategory[0]?.essentialCategory && <p className="text-xs text-muted-foreground">{t("settings.essentialNote")}</p>}
                  </div>
                  <ul className="mt-1 divide-y divide-border">
                    {inCategory.map((item) => (
                      <SettingRow key={item.code} item={item} roles={roles} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        );
      }}
    </QueryBoundary>
  );
}
