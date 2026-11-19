"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationSettingsList } from "@/features/notifications/components/notification-settings-list";

/**
 * Communications -> In-app notifications: the school's on/off and receiving roles for every notification the bell can send
 * (`GET/PUT /notifications/settings`, `comms:trigger-binding:view`/`:manage`). The older "Trigger Bindings" page next to it is for
 * the external channels (SMS, email, push); this one is for the in-app bell.
 */
export default function NotificationSettingsPage() {
  const t = useTranslations("notifications.settings");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationSettingsList />
        </CardContent>
      </Card>
    </div>
  );
}
