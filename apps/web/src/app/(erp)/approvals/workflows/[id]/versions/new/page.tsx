"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { useWorkflowDefinition } from "@/features/approvals/hooks/use-workflow-definitions";
import { useLevels, usePublishWorkflowVersion, useRoutingRules, useWorkflowVersions } from "@/features/approvals/hooks/use-workflow-versions";
import { LevelRowEditor } from "@/features/approvals/components/level-row-editor";
import { RoutingRuleRowEditor } from "@/features/approvals/components/routing-rule-row-editor";
import {
  emptyLevelRow,
  isLevelRowComplete,
  isRuleRowComplete,
  levelRowsToDto,
  ruleRowsToDto,
  type LevelFormRow,
  type RoutingRuleFormRow,
} from "@/features/approvals/lib/workflow-version-lines";

/**
 * "Publish New Version" — a full page, not a dialog (too much dynamic row
 * content, same reasoning `journals/new/page.tsx` established for its own
 * line editor). The real backend has no incremental add/remove for an
 * individual level or routing rule — `POST .../versions/publish` always
 * creates a WHOLE new version with a complete new set, atomically, and
 * promotes it to current. So this page prefills from the CURRENT version's
 * own levels/rules (if one exists) — a 1-row tweak means editing the
 * prefilled set, not retyping everything from scratch.
 */
export default function PublishWorkflowVersionPage() {
  const { id: defId } = useParams<{ id: string }>();
  const t = useTranslations("approvals.workflows.publish");
  const router = useRouter();
  const defQuery = useWorkflowDefinition(defId);
  const versionsQuery = useWorkflowVersions(defId);
  const currentVersion = versionsQuery.data?.find((v) => v.isCurrent);
  const currentLevelsQuery = useLevels(currentVersion?.id);
  const currentRulesQuery = useRoutingRules(currentVersion?.id);
  const publishMutation = usePublishWorkflowVersion(defId);

  const [levelRows, setLevelRows] = React.useState<LevelFormRow[] | null>(null);
  const [ruleRows, setRuleRows] = React.useState<RoutingRuleFormRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Hydrate exactly once, from the current version's real levels/rules once
  // both have loaded (or immediately with one empty row each if this
  // definition has no current version yet — its very first publish).
  React.useEffect(() => {
    if (levelRows !== null) return; // already hydrated
    if (!currentVersion) {
      if (!versionsQuery.isLoading) {
        setLevelRows([emptyLevelRow()]);
        setRuleRows([]);
      }
      return;
    }
    if (currentLevelsQuery.data && currentRulesQuery.data) {
      setLevelRows(
        [...currentLevelsQuery.data]
          .sort((a, b) => a.seq - b.seq)
          .map((l) => ({
            key: crypto.randomUUID(),
            approverType: l.approverType,
            roleId: l.roleId ?? "",
            userIds: l.userIds ?? [],
            mode: l.mode,
            quorum: l.quorum,
          })),
      );
      setRuleRows(
        currentRulesQuery.data.map((r) => ({
          key: crypto.randomUUID(),
          minAmount: r.minAmount,
          maxAmount: r.maxAmount ?? "",
          levelSubset: r.levelSubset ?? [],
          departmentId: r.departmentId ?? "",
        })),
      );
    }
  }, [levelRows, currentVersion, versionsQuery.isLoading, currentLevelsQuery.data, currentRulesQuery.data]);

  const canSubmit = levelRows !== null && levelRows.length > 0 && levelRows.every(isLevelRowComplete) && (ruleRows ?? []).every(isRuleRowComplete);

  async function handleSubmit() {
    if (!levelRows || !canSubmit) return;
    setError(null);
    try {
      const created = await publishMutation.mutateAsync({
        levels: levelRowsToDto(levelRows),
        routingRules: ruleRowsToDto(ruleRows ?? []),
      });
      router.push(`/approvals/workflows/${defId}/versions/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/approvals/workflows/${defId}`}>
          <ArrowLeft className="size-4" />
          {t("backToDefinition")}
        </Link>
      </Button>

      <QueryBoundary query={defQuery}>
        {(workflowDef) => (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle", { name: workflowDef.name })}</h1>
            <p className="text-sm text-muted-foreground">{currentVersion ? t("pageSubtitleExisting", { version: currentVersion.version }) : t("pageSubtitleFirst")}</p>
          </div>
        )}
      </QueryBoundary>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {levelRows === null ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-foreground">{t("levelsTitle")}</CardTitle>
              <CardDescription>{t("levelsDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <LevelRowEditor rows={levelRows} onChange={setLevelRows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base text-foreground">{t("routingRulesTitle")}</CardTitle>
              <CardDescription>{t("routingRulesDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <RoutingRuleRowEditor rows={ruleRows ?? []} onChange={setRuleRows} levelCount={levelRows.length} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.push(`/approvals/workflows/${defId}`)}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || publishMutation.isPending}>
              {publishMutation.isPending ? t("publishing") : t("publishButton")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
