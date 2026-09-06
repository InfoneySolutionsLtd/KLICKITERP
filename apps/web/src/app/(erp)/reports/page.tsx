"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { ReportDefinitionResponseDto } from "@klickit/contracts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useReportCatalogue } from "@/features/reports/hooks/use-catalogue";
import { cn } from "@/lib/utils";

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
 *
 * Domain sections are sorted alphabetically by their own translated
 * display name (not a hand-maintained order array — the previous
 * `DOMAIN_ORDER` list had already drifted stale, missing 3 real domains
 * the live i18n `domains.*` catalogue already had: `banking`/`inventory`/
 * `fixed-assets`) and each renders as a collapsible `Card`, all expanded by
 * default — plain local `Set<string>` state (domain keys currently
 * collapsed), the same "one small piece of client state, no new
 * dependency" shape `nav-links.tsx`'s own expand/collapse groups already
 * establish for an identical interaction, rather than pulling in a new
 * Radix accordion/collapsible package for a single page.
 */
export default function ReportsCataloguePage() {
  const t = useTranslations("reports.catalogue");
  const catalogueQuery = useReportCatalogue();
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  function toggle(domain: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>

      <QueryBoundary query={catalogueQuery} isEmpty={(d) => d.length === 0}>
        {(reports) => {
          const groups = groupByDomain(reports);
          const domains = Array.from(groups.keys()).sort((a, b) => t(`domains.${a}`).localeCompare(t(`domains.${b}`)));

          return (
            <div className="space-y-4">
              {domains.map((domain) => {
                const domainReports = groups.get(domain) ?? [];
                const isExpanded = !collapsed.has(domain);
                return (
                  <Card key={domain} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggle(domain)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-base text-foreground">{t(`domains.${domain}`)}</CardTitle>
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-tint-primary px-1.5 text-xs font-medium text-primary">
                          {domainReports.length}
                        </span>
                      </div>
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180")} />
                    </button>
                    {isExpanded && (
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                          {domainReports.map((report) => (
                            <Link key={report.code} href={`/reports/${report.code}`}>
                              <Card className="h-full transition-colors hover:bg-muted/50">
                                <CardHeader>
                                  <CardTitle className="text-base text-foreground">{report.name}</CardTitle>
                                </CardHeader>
                              </Card>
                            </Link>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
