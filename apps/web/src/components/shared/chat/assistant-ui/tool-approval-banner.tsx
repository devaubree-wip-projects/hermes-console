"use client";

import { useState } from "react";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import type { ApprovalChoice } from "@/lib/hermes/protocol";
import { Button } from "@/components/shared/chat/ui/button";
import { cn } from "@/lib/utils";

export type HermesApprovalRequest = {
  sessionId: string;
  command: string;
  description: string;
  allowPermanent: boolean;
};

export function ToolApprovalBanner({
  request,
  onRespond,
  className,
}: {
  request: HermesApprovalRequest;
  onRespond: (choice: ApprovalChoice) => Promise<void>;
  className?: string;
}) {
  const [submitting, setSubmitting] = useState<ApprovalChoice | null>(null);
  const busy = submitting !== null;

  const respond = async (choice: ApprovalChoice) => {
    if (busy) return;
    setSubmitting(choice);
    try {
      await onRespond(choice);
    } catch {
      setSubmitting(null);
    }
  };

  return (
    <div
      data-slot="tool-approval-banner"
      className={cn(
        "rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Approbation requise
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {request.description || "Commande dangereuse / exécution de code"}
          </p>
          {request.command.trim() ? (
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background/70 px-2.5 py-1.5 font-mono text-[11px] leading-snug">
              {request.command.trim()}
            </pre>
          ) : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              disabled={busy}
              onClick={() => void respond("once")}
            >
              {submitting === "once" ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : null}
              Exécuter
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={busy}
              onClick={() => void respond("session")}
            >
              {submitting === "session" ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : null}
              Autoriser (session)
            </Button>
            {request.allowPermanent ? (
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={busy}
                onClick={() => void respond("always")}
              >
                {submitting === "always" ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : null}
                Toujours
              </Button>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={busy}
              onClick={() => void respond("deny")}
            >
              {submitting === "deny" ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : null}
              Refuser
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
