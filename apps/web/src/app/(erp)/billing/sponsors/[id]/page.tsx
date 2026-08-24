"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { SponsorResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useSponsor } from "@/features/billing/hooks/use-sponsors";
import { useSignedUrl } from "@/features/billing/hooks/use-file-upload";
import { SponsorDialog } from "@/features/billing/components/sponsor-dialog";

/**
 * Part 1 (Billing sub-features batch) — a sponsor's detail page: header
 * (name, Edit) and a details grid (contacts rendered as key/value pairs, the
 * agreement document as an "open in new tab" link, allowsCashConversion) —
 * same `useParams<{id}>()` + `<QueryBoundary>` header-card shape
 * `fixed-assets/categories/[id]/page.tsx` establishes. **No status
 * badge/activate/deactivate here** — `SponsorsController` has no such route
 * at all (confirmed by reading it), a sponsor is permanent once created.
 */
export default function SponsorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("billing.sponsors.detail");
  const sponsorQuery = useSponsor(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/billing/sponsors">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={sponsorQuery}>{(sponsor) => <SponsorDetailCard sponsor={sponsor} />}</QueryBoundary>
    </div>
  );
}

function AgreementLink({ fileId }: { fileId: string }) {
  const t = useTranslations("billing.sponsors.detail");
  const signedUrlQuery = useSignedUrl(fileId);

  if (signedUrlQuery.isPending) return <p className="text-sm text-muted-foreground">{t("loadingAgreement")}</p>;
  if (signedUrlQuery.isError) return <p className="text-sm text-muted-foreground">{t("agreementLoadError")}</p>;

  return (
    <a
      href={signedUrlQuery.data?.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      <ExternalLink className="size-4" />
      {t("openAgreement")}
    </a>
  );
}

function SponsorDetailCard({ sponsor }: { sponsor: SponsorResponseDto }) {
  const t = useTranslations("billing.sponsors.detail");
  const tCommon = useTranslations("common");
  const [editOpen, setEditOpen] = React.useState(false);

  const contactEntries = Object.entries((sponsor.contacts ?? {}) as Record<string, unknown>);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <CardTitle className="text-base text-foreground">{sponsor.name}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          {tCommon("edit")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("contactsLabel")}</p>
          {contactEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noContacts")}</p>
          ) : (
            <dl className="mt-1 grid gap-2 sm:grid-cols-2">
              {contactEntries.map(([key, value]) => (
                <div key={key} className="rounded-lg border border-border p-2">
                  <dt className="text-xs text-muted-foreground">{key}</dt>
                  <dd className="text-sm text-foreground">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("agreementLabel")}</p>
          {sponsor.agreementFileId ? <AgreementLink fileId={sponsor.agreementFileId} /> : <p className="text-sm text-muted-foreground">{t("noAgreement")}</p>}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("allowsCashConversionLabel")}</p>
          <p className="text-sm text-foreground">{sponsor.allowsCashConversion ? tCommon("active") : "—"}</p>
        </div>
      </CardContent>

      <SponsorDialog mode="edit" sponsor={sponsor} open={editOpen} onOpenChange={setEditOpen} />
    </Card>
  );
}
