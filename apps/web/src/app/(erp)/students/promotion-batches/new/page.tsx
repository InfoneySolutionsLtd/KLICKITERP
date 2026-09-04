"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromoteStudentsForm } from "@/features/students/components/promote-students-form";

export default function NewPromotionBatchPage() {
  const t = useTranslations("students.promotionBatches.newForm");

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/students/promotion-batches">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <PromoteStudentsForm />
    </div>
  );
}
