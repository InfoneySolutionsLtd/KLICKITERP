"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useUsersLookup } from "@/features/approvals/hooks/use-users-lookup";
import { useRoles } from "@/features/roles/hooks/use-roles";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import {
  useLevels,
  useRoutingRules,
  useSetCurrentWorkflowVersion,
  useWorkflowVersion,
} from "@/features/approvals/hooks/use-workflow-versions";
import { EditLevelDialog } from "@/features/approvals/components/edit-level-dialog";
import { EditRoutingRuleDialog } from "@/features/approvals/components/edit-routing-rule-dialog";

const APPROVER_TYPE_LABEL_KEY: Record<string, string> = {
  ROLE: "approverTypeRole",
  USERS: "approverTypeUsers",
  DEPT_HEAD: "approverTypeDeptHead",
};
const MODE_LABEL_KEY: Record<string, string> = { SEQUENTIAL: "modeSequential", PARALLEL: "modeParallel" };

/**
 * Workflow version detail — read-only-plus-PATCH view of one version's real
 * levels/routing rules (no add/remove here — that only exists on the
 * "Publish New Version" page, per the backend's own deliberate design; see
 * that page's doc comment).
 */
export default function WorkflowVersionDetailPage() {
  const { id: defId, versionId } = useParams<{ id: string; versionId: string }>();
  const t = useTranslations("approvals.workflows");
  const versionQuery = useWorkflowVersion(versionId);
  const levelsQuery = useLevels(versionId);
  const rulesQuery = useRoutingRules(versionId);
  const setCurrentMutation = useSetCurrentWorkflowVersion(defId);
  const rolesQuery = useRoles();
  const usersQuery = useUsersLookup();
  const departmentsQuery = useDepartments();

  const roleNameById = new Map((rolesQuery.data ?? []).map((r) => [r.id, r.name]));
  const userNameById = new Map((usersQuery.data?.items ?? []).map((u) => [u.id, u.fullName]));
  const departmentNameById = new Map((departmentsQuery.data ?? []).map((d) => [d.id, d.name]));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/approvals/workflows/${defId}`}>
          <ArrowLeft className="size-4" />
          {t("detail.backToDefinition")}
        </Link>
      </Button>

      <QueryBoundary query={versionQuery}>
        {(version) => (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="text-base text-foreground">{t("versionDetail.title", { version: version.version })}</CardTitle>
                {version.isCurrent ? (
                  <Badge variant="soft-success">{t("detail.currentBadge")}</Badge>
                ) : (
                  <Badge variant="soft-secondary">{t("detail.supersededBadge")}</Badge>
                )}
              </div>
              {!version.isCurrent && (
                <Button type="button" size="sm" disabled={setCurrentMutation.isPending} onClick={() => setCurrentMutation.mutate(version.id)}>
                  {t("detail.setCurrentAction")}
                </Button>
              )}
            </CardHeader>
          </Card>
        )}
      </QueryBoundary>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("versionDetail.levelsTitle")}</CardTitle>
          <CardDescription>{t("versionDetail.levelsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={levelsQuery} isEmpty={(d) => d.length === 0}>
            {(levels) => (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">{t("levelEditor.seq")}</TableHead>
                      <TableHead>{t("levelEditor.approverType")}</TableHead>
                      <TableHead>{t("levelEditor.approver")}</TableHead>
                      <TableHead>{t("levelEditor.mode")}</TableHead>
                      <TableHead>{t("levelEditor.quorum")}</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...levels]
                      .sort((a, b) => a.seq - b.seq)
                      .map((level) => (
                        <TableRow key={level.id}>
                          <TableCell>{level.seq}</TableCell>
                          <TableCell>{t(`levelEditor.${APPROVER_TYPE_LABEL_KEY[level.approverType]}`)}</TableCell>
                          <TableCell>
                            {level.approverType === "ROLE" && (roleNameById.get(level.roleId ?? "") ?? level.roleId)}
                            {level.approverType === "USERS" && (level.userIds ?? []).map((uid) => userNameById.get(uid) ?? uid).join(", ")}
                            {level.approverType === "DEPT_HEAD" && t("levelEditor.deptHeadHint")}
                          </TableCell>
                          <TableCell>{t(`levelEditor.${MODE_LABEL_KEY[level.mode]}`)}</TableCell>
                          <TableCell>{level.mode === "PARALLEL" ? level.quorum : "—"}</TableCell>
                          <TableCell>
                            <EditLevelDialog level={level} versionId={versionId} />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </QueryBoundary>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("versionDetail.routingRulesTitle")}</CardTitle>
          <CardDescription>{t("versionDetail.routingRulesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {(rulesQuery.data ?? []).length === 0 && !rulesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("routingRuleEditor.noRulesHint")}</p>
          ) : (
            <QueryBoundary query={rulesQuery} isEmpty={(d) => d.length === 0}>
              {(rules) => (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("routingRuleEditor.minAmount")}</TableHead>
                        <TableHead>{t("routingRuleEditor.maxAmount")}</TableHead>
                        <TableHead>{t("routingRuleEditor.levelSubset")}</TableHead>
                        <TableHead>{t("routingRuleEditor.department")}</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell>{formatMoney(rule.minAmount)}</TableCell>
                          <TableCell>{rule.maxAmount ? formatMoney(rule.maxAmount) : t("routingRuleEditor.noUpperBound")}</TableCell>
                          <TableCell>
                            {rule.levelSubset && rule.levelSubset.length > 0
                              ? rule.levelSubset.join(", ")
                              : t("routingRuleEditor.allLevels")}
                          </TableCell>
                          <TableCell>{rule.departmentId ? (departmentNameById.get(rule.departmentId) ?? rule.departmentId) : t("routingRuleEditor.anyDepartment")}</TableCell>
                          <TableCell>
                            <EditRoutingRuleDialog rule={rule} versionId={versionId} levelCount={levelsQuery.data?.length ?? 0} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </QueryBoundary>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
