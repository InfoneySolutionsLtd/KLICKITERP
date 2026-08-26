"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReportDefinitionResponseDto } from "@klickit/contracts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useReportCatalogue } from "@/features/reports/hooks/use-catalogue";

/** Sensible, fixed display order for the 10 real domain values found in the live registry — anything unexpected still renders, just sorted after these. */
const DOMAIN_ORDER = ["accounting", "billing", "payments", "expenses", "payroll", "procurement", "students", "wallet", "dashboard", "audit"];

function groupByDomain(reports: ReportDefinitionResponseDto[]) {
  const groups = new Map<string, ReportDefinitionResponseDto[]>();
  for (const report of reports) {
    const list = groups.get(report.domain) ?? [];
    list.push(report);
    groups.set(report.domain, list);
  }
  return groups;
}

/**
 * Groups the live catalogue (`GET /reports`) by its own real `domain` field
 * — not a hardcoded/guessed report list. No card-grid catalogue precedent
 * exists elsewhere in this codebase; grid utility classes are lifted from
 * the dashboard KPI grid, the only existing card-grid shape.
 */
export default function ReportsCataloguePage() {
  const t = useTranslations("reports.catalogue");
  const catalogueQuery = useReportCatalogue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <QueryBoundary query={catalogueQuery} isEmpty={(d) => d.length === 0}>
        {(reports) => {
          const groups = groupByDomain(reports);
          const domains = Array.from(groups.keys()).sort((a, b) => {
            const aIndex = DOMAIN_ORDER.indexOf(a);
            const bIndex = DOMAIN_ORDER.indexOf(b);
            return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
          });

          return (
            <div className="space-y-8">
              {domains.map((domain) => (
                <section key={domain} className="space-y-3">
                  <h2 className="text-base font-semibold text-foreground">{t(`domains.${domain}`)}</h2>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {(groups.get(domain) ?? []).map((report) => (
                      <Link key={report.code} href={`/reports/${report.code}`}>
                        <Card className="h-full transition-colors hover:bg-muted/50">
                          <CardHeader>
                            <CardTitle className="text-base text-foreground">{report.name}</CardTitle>
                          </CardHeader>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
