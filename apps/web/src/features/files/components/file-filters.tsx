"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface FileFiltersValue {
  entityType: string;
  entityId: string;
}

export const EMPTY_FILE_FILTERS: FileFiltersValue = { entityType: "", entityId: "" };

/** `entityType`/`entityId` are exact-match filters (mirrors `ListFilesParams`'s own real backend semantics — no partial match on either), distinct from the separate filename search box the list page owns directly (mirrors `q`, an ILIKE substring match). */
export function FileFilters({ value, onChange }: { value: FileFiltersValue; onChange: (value: FileFiltersValue) => void }) {
  const t = useTranslations("files.list.filters");

  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:max-w-md">
      <div className="space-y-1.5">
        <Label>{t("entityTypeLabel")}</Label>
        <Input
          value={value.entityType}
          onChange={(e) => onChange({ ...value, entityType: e.target.value })}
          placeholder={t("entityTypePlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("entityIdLabel")}</Label>
        <Input
          value={value.entityId}
          onChange={(e) => onChange({ ...value, entityId: e.target.value })}
          placeholder={t("entityIdPlaceholder")}
        />
      </div>
    </div>
  );
}
