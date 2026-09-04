"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useCreateWorkflowDefinition } from "../hooks/use-workflow-definitions";

const DOMAIN_CODE_MAX_LENGTH = 30; // appr_workflow_def.domain_code — create-workflow-def.dto.ts.
const NAME_MAX_LENGTH = 80; // appr_workflow_def.name — create-workflow-def.dto.ts.

/**
 * Registers a new `appr_workflow_def` for a domain code. `domainCode` is
 * immutable after creation (not part of `UpdateWorkflowDefDto`) — the edit
 * dialog only ever touches name/isActive. After creating a definition, the
 * caller still has to publish a first version (no levels exist yet) before
 * anything can actually submit against this domain code — the detail page
 * makes that next step explicit via its own "Publish New Version" button.
 */
export function CreateWorkflowDefinitionDialog() {
  const t = useTranslations("approvals.workflows.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [domainCode, setDomainCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateWorkflowDefinition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDomainCode("");
      setName("");
      setError(null);
    }
  }

  const canSubmit = domainCode.trim().length > 0 && name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({ domainCode: domainCode.trim().toUpperCase(), name: name.trim() });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("domainCodeLabel")}</Label>
            <Input
              value={domainCode}
              maxLength={DOMAIN_CODE_MAX_LENGTH}
              onChange={(e) => setDomainCode(e.target.value)}
              placeholder={t("domainCodePlaceholder")}
              className="font-mono uppercase"
            />
            <p className="text-xs text-muted-foreground">{t("domainCodeHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
