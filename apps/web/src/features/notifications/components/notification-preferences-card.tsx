"use client";

import { useTranslations } from "next-intl";
import type { UpdateNotificationPreferenceDto } from "@klickit/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useNotificationPreferences, useSetNotificationPreference } from "../hooks/use-notifications";

/**
 * Each person's own filter on their bell: one switch per category. Approvals and security are always on (the server refuses to
 * switch them off, and the switch is shown locked), so nobody can miss a request waiting for them or an alert about their account.
 */
export function NotificationPreferencesCard() {
  const t = useTranslations("notifications");
  const query = useNotificationPreferences();
  const save = useSetNotificationPreference();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("preferences.title")}</CardTitle>
        <CardDescription>{t("preferences.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryBoundary query={query}>
          {(data) => (
            <ul className="divide-y divide-border">
              {data.items.map((item) => {
                const id = `notification-preference-${item.category}`;
                return (
                  <li key={item.category} className="flex items-start gap-3 py-3">
                    <Checkbox
                      id={id}
                      checked={item.isEnabled}
                      disabled={item.essential || save.isPending}
                      onChange={(event) => save.mutate({ category: item.category as UpdateNotificationPreferenceDto["category"], isEnabled: event.target.checked })}
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor={id} className="text-sm font-medium">
                          {t(`categories.${item.category}.name` as "categories.APPROVALS.name")}
                        </Label>
                        {item.essential && <Badge variant="outline">{t("preferences.alwaysOn")}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{t(`categories.${item.category}.description` as "categories.APPROVALS.description")}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
