"use client";

import { useAuiState } from "@assistant-ui/react";
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  Loader2Icon,
  MessageCircleIcon,
  RadioIcon,
  ServerIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TooltipIconButton } from "@/components/shared/chat/assistant-ui/tooltip-icon-button";
import { useHermesComposer } from "@/components/shared/chat/runtime/hermes-composer-context";
import { Button } from "@/components/shared/chat/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shared/chat/ui/dialog";
import type { HandoffLifecycleState } from "@/lib/hermes/protocol";

type HandoffUiState = "idle" | Exclude<HandoffLifecycleState, "">;

const PROCESS_STEPS = [
  {
    title: "Préparer la session",
    description: "La Console crée ou reprend la session Hermes durable actuellement ouverte.",
    icon: ServerIcon,
  },
  {
    title: "Valider Telegram",
    description: "Hermes vérifie que le gateway Telegram et son canal d’accueil sont configurés.",
    icon: RadioIcon,
  },
  {
    title: "Relier le canal",
    description: "Le gateway associe la conversation Telegram au même identifiant de session.",
    icon: MessageCircleIcon,
  },
  {
    title: "Reprendre le contexte",
    description: "Le prochain message Telegram continue cette session, avec son contexte et ses outils.",
    icon: CheckCircle2Icon,
  },
] as const;

const STATE_COPY: Record<HandoffUiState, { label: string; detail: string }> = {
  idle: {
    label: "Prêt à transférer",
    detail: "La session restera disponible dans la Console.",
  },
  pending: {
    label: "Demande envoyée",
    detail: "Hermes prépare la session pour le gateway.",
  },
  running: {
    label: "Connexion à Telegram",
    detail: "Le gateway relie le canal à cette session.",
  },
  completed: {
    label: "Transfert terminé",
    detail: "Vous pouvez maintenant continuer depuis Telegram.",
  },
  failed: {
    label: "Transfert interrompu",
    detail: "La session Console est intacte. Vous pouvez réessayer.",
  },
};

function HandoffStatusIcon({ state }: { state: HandoffUiState }) {
  if (state === "pending" || state === "running") {
    return <Loader2Icon className="size-5 animate-spin" aria-hidden />;
  }
  if (state === "completed") {
    return <CheckCircle2Icon className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  }
  if (state === "failed") {
    return <TriangleAlertIcon className="size-5 text-destructive" aria-hidden />;
  }
  return <CircleDashedIcon className="size-5 text-muted-foreground" aria-hidden />;
}

export function TelegramHandoffDialog() {
  const hermes = useHermesComposer();
  const threadId = useAuiState((state) => state.threadListItem.id);
  const remoteId = useAuiState((state) => state.threadListItem.remoteId);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const [open, setOpen] = useState(false);
  const [handoffState, setHandoffState] = useState<HandoffUiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const isTransferring = handoffState === "pending" || handoffState === "running";
  const unavailable = !threadId || isRunning || isTransferring || handoffState === "completed";
  const stateCopy = STATE_COPY[handoffState];

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && handoffState === "failed") {
      setHandoffState("idle");
      setError(null);
    }
  };

  const handoff = async () => {
    if (!threadId || unavailable) return;
    setError(null);
    setHandoffState("pending");
    try {
      await hermes.handoffTelegram(threadId, remoteId, (state) => {
        if (state) setHandoffState(state);
      });
      setHandoffState("completed");
      toast.success("Session reliée à Telegram", {
        description: "Continuez la conversation depuis votre canal Telegram.",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setHandoffState("failed");
      setError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <TooltipIconButton
          tooltip="Comprendre le transfert vers Telegram"
          className="size-8 text-sm font-semibold"
        >
          <span aria-hidden>?</span>
        </TooltipIconButton>
      </DialogTrigger>
      <DialogContent
        className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] min-w-0 max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[75dvh] sm:w-[75vw] sm:max-w-[75vw]"
      >
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-7 sm:py-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-md border bg-muted px-2 py-1 text-xs font-medium text-foreground/80">
              Même session, nouveau canal
            </span>
          </div>
          <DialogTitle className="text-xl leading-tight sm:text-2xl">
            Continuer cette session sur Telegram
          </DialogTitle>
          <DialogDescription className="max-w-3xl leading-relaxed">
            Hermes ne copie pas une conversation vers un autre bot. Il relie Telegram à la session durable déjà utilisée ici.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div
            className="min-h-0 overflow-y-auto px-5 py-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-7 sm:py-7"
            tabIndex={0}
            aria-label="Détails du transfert vers Telegram"
          >
            <section aria-labelledby="handoff-process-title">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Le processus réel</p>
              <h2 id="handoff-process-title" className="mt-1 text-base font-semibold">
                De la Console au gateway Telegram
              </h2>
              <ol className="mt-5 divide-y border-y">
                {PROCESS_STEPS.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-3 py-4 sm:grid-cols-[2.25rem_1fr]">
                      <div className="flex size-8 items-center justify-center rounded-md border bg-muted/50" aria-hidden>
                        <Icon className="size-4" />
                      </div>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-muted-foreground">0{index + 1}</span>
                          <h3 className="font-medium">{step.title}</h3>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <div className="mt-8 grid gap-7 md:grid-cols-2">
              <section aria-labelledby="handoff-keeps-title">
                <h2 id="handoff-keeps-title" className="text-sm font-semibold">Ce qui est conservé</h2>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                  <li>• le même identifiant de session Hermes ;</li>
                  <li>• le contexte, les décisions et les outils déjà chargés ;</li>
                  <li>• l’accès à la session depuis la Console.</li>
                </ul>
              </section>
              <section aria-labelledby="handoff-visible-title">
                <h2 id="handoff-visible-title" className="text-sm font-semibold">Ce que vous verrez</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Telegram reçoit un message de reprise, pas une copie de toutes les bulles. Les prochains messages continuent le même contexte.
                </p>
              </section>
            </div>

            <section className="mt-8 border-y py-5" aria-labelledby="handoff-bot-model-title">
              <h2 id="handoff-bot-model-title" className="text-sm font-semibold">Un bot, plusieurs sessions</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Un seul bot Telegram suffit pour ce profil Hermes. Avec les Topics activés, chaque transfert ouvre un sujet dédié et plusieurs sessions restent utilisables en parallèle.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Sans Topics, Hermes utilise le canal d’accueil commun : le dernier transfert remplace alors la session active de cette conversation Telegram, sans supprimer les précédentes.
              </p>
            </section>

            <section className="mt-8 border-l-2 border-foreground/20 pl-4" aria-labelledby="handoff-distinction-title">
              <h2 id="handoff-distinction-title" className="text-sm font-semibold">À ne pas confondre avec une nouvelle session</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Une commande de réinitialisation ouvre un nouveau contexte. Ce transfert préserve la session actuelle et change uniquement son canal de reprise.
              </p>
            </section>
          </div>

          <aside className="flex min-h-0 flex-col border-t bg-muted/20 p-5 lg:border-t-0 lg:border-l lg:p-6" aria-label="État du transfert">
            <div className="flex items-start gap-3" role="status" aria-live="polite">
              <HandoffStatusIcon state={handoffState} />
              <div>
                <p className="text-sm font-semibold">{stateCopy.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{stateCopy.detail}</p>
              </div>
            </div>

            <div className="mt-6 border-y py-4 text-xs leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">Avant de lancer</p>
              <p className="mt-2">Le bot Telegram doit être connecté et un canal d’accueil doit avoir été défini avec <code className="font-mono text-foreground">/sethome</code>.</p>
              <p className="mt-2">Les sujets Telegram sont recommandés pour isoler proprement chaque session.</p>
            </div>

            {isRunning ? (
              <p className="mt-4 text-sm leading-relaxed text-amber-700 dark:text-amber-300">
                Attendez la fin de la réponse Hermes en cours avant de transférer.
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 text-sm leading-relaxed text-destructive" role="alert">{error}</p>
            ) : null}

            <div className="mt-auto pt-6">
              <Button
                type="button"
                className="w-full"
                disabled={unavailable}
                onClick={() => void handoff()}
              >
                {isTransferring ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
                {handoffState === "completed" ? "Transfert terminé" : "Continuer sur Telegram"}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Aucune réponse en cours ne sera interrompue.
              </p>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
