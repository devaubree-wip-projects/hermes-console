"use client";

import { Loader2Icon } from "lucide-react";
import type { AgentCreateProposal } from "@/lib/agents/agent-create-command";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AgentCreateResponse = {
  agent?: { id?: string; name?: string };
  runtimeState?: "ready" | "setup_required" | "error";
  runtimeError?: string | null;
  redirectTo?: string;
  reused?: boolean;
};

export type AgentCreateConfirmationState = {
  phase: "review" | "submitting" | "error" | "created";
  proposal: AgentCreateProposal;
  error?: string;
  result?: AgentCreateResponse;
};

export function agentCreateOutcome(result: AgentCreateResponse) {
  if (result.runtimeState === "ready") {
    return {
      title: result.reused ? "Agent déjà créé" : "Agent créé",
      description: result.reused
        ? "La proposition existante a été retrouvée. Son runtime est prêt."
        : "Le profil Hermes est prêt.",
      tone: "success" as const,
    };
  }
  if (result.runtimeState === "setup_required") {
    return {
      title: result.reused ? "Agent retrouvé — configuration requise" : "Agent créé — configuration requise",
      description: result.runtimeError || "Le profil existe, mais son runtime doit encore être configuré.",
      tone: "warning" as const,
    };
  }
  if (result.runtimeState === "error") {
    return {
      title: result.reused ? "Agent retrouvé — runtime en erreur" : "Agent créé — runtime en erreur",
      description: result.runtimeError || "Le profil existe, mais son runtime n’est pas opérationnel.",
      tone: "error" as const,
    };
  }
  return {
    title: "État de l’agent inconnu",
    description: result.runtimeError
      || "La réponse ne permet pas de confirmer l’état du profil ni de son runtime.",
    tone: "neutral" as const,
  };
}

export function AgentCreateConfirmation({
  state,
  onCancel,
  onConfirm,
}: {
  state: AgentCreateConfirmationState | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const submitting = state?.phase === "submitting";
  const created = state?.phase === "created";
  const outcome = state?.result ? agentCreateOutcome(state.result) : null;

  return (
    <Dialog
      open={state !== null}
      onOpenChange={(open) => {
        if (!open && !submitting) onCancel();
      }}
    >
      {state ? (
        <DialogContent
          aria-describedby="agent-create-confirmation-description"
          className="sm:max-w-lg"
          onEscapeKeyDown={(event) => {
            if (submitting) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (submitting) event.preventDefault();
          }}
          showCloseButton={!submitting}
        >
          <DialogHeader>
            <DialogTitle>
              {outcome?.title ?? "Confirmer la création de l’agent"}
            </DialogTitle>
            <DialogDescription id="agent-create-confirmation-description">
              {outcome?.description
                ?? "Vérifiez cette proposition. Aucun agent ne sera créé avant votre confirmation."}
            </DialogDescription>
          </DialogHeader>

          <dl className="grid gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="grid gap-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nom proposé
              </dt>
              <dd className="font-medium">{state.proposal.name}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Mission
              </dt>
              <dd className="whitespace-pre-wrap text-sm text-muted-foreground">
                {state.proposal.description}
              </dd>
            </div>
          </dl>

          {state.phase === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error || "La création a échoué. Vous pouvez réessayer sans créer de doublon."}
            </p>
          ) : null}
          {submitting ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2Icon aria-hidden="true" className="animate-spin" />
              Création du profil Hermes…
            </p>
          ) : null}
          {created && state.result?.redirectTo ? (
            <p className="text-sm text-muted-foreground" role="status">
              Ouverture de l’agent…
            </p>
          ) : null}

          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={onCancel}
              type="button"
              variant="outline"
            >
              {created ? "Fermer" : "Annuler"}
            </Button>
            {!created ? (
              <Button
                disabled={submitting}
                onClick={onConfirm}
                type="button"
              >
                {submitting ? (
                  <>
                    <Loader2Icon aria-hidden="true" className="animate-spin" />
                    Création…
                  </>
                ) : state.phase === "error" ? "Réessayer" : "Créer l’agent"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
