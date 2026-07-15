"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspacePermissions } from "@/lib/permissions";
import { TASK_TEMPLATES, type TaskKind } from "@/lib/task-templates";

export function TaskTemplateGrid({
  workspaceId,
  permissions,
  taskBase,
  chatBase,
  runImmediately = true,
}: {
  workspaceId: string;
  permissions: WorkspacePermissions;
  taskBase?: string;
  chatBase?: string;
  runImmediately?: boolean;
}) {
  const router = useRouter();
  const [openKind, setOpenKind] = useState<TaskKind | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const effectiveTaskBase = taskBase ?? `/tasks`;
  const effectiveChatBase = chatBase ?? `/d/chat`;

  const template = openKind ? TASK_TEMPLATES[openKind] : null;

  function openTemplate(kind: TaskKind) {
    setOpenKind(kind);
    setInput("");
  }

  async function submit() {
    if (!template) return;
    const trimmed = input.trim();
    if (!trimmed) {
      toast.error("Décrivez la tâche avant de la créer.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, kind: template.kind, input: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Impossible de créer la tâche.");
        return;
      }

      if (data.status === "waiting_approval") {
        toast.info("Tâche créée — validation requise avant exécution.");
        setOpenKind(null);
        if (runImmediately) router.push(`${effectiveTaskBase}/${data.taskId}`);
        else router.refresh();
        return;
      }

      if (!runImmediately) {
        setOpenKind(null);
        toast.success("Tâche créée.");
        router.refresh();
        return;
      }

      const runRes = await fetch(`/api/tasks/${data.taskId}/run`, { method: "POST" });
      const runData = await runRes.json();
      if (!runRes.ok) {
          toast.error(runData.error ?? "Impossible de lancer la tâche.");
        setOpenKind(null);
        router.push(`${effectiveTaskBase}/${data.taskId}`);
        return;
      }

      setOpenKind(null);
      router.push(`${effectiveChatBase}/${runData.sessionId}?autostart=1`);
    } catch {
      toast.error("Erreur réseau — réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Object.values(TASK_TEMPLATES).map((tpl) => {
          const needsApproval = Boolean(tpl.permission) && !permissions[tpl.permission!];
          return (
            <button
              key={tpl.kind}
              type="button"
              onClick={() => openTemplate(tpl.kind)}
              className="flex min-h-24 flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left text-sm ring-1 ring-foreground/10 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex w-full items-start justify-between gap-2">
                <span className="font-medium">{tpl.label}</span>
                {needsApproval && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  >
                    Validation requise
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground">{tpl.description}</span>
            </button>
          );
        })}
      </div>

      <Dialog
        open={openKind !== null}
        onOpenChange={(open) => {
          if (!open && !submitting) setOpenKind(null);
        }}
      >
        <DialogContent>
          {template && (
            <>
              <DialogHeader>
                <DialogTitle>{template.label}</DialogTitle>
                <DialogDescription>{template.description}</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2">
                <Label htmlFor="task-input">{template.inputLabel}</Label>
                <Textarea
                  id="task-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={template.inputPlaceholder}
                  disabled={submitting}
                  maxLength={4000}
                  rows={4}
                />
              </div>

              <DialogFooter>
                <Button type="button" className="h-11" disabled={submitting} onClick={submit}>
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  Créer la tâche
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
