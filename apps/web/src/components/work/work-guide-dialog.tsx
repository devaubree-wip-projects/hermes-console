"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  BriefcaseBusinessIcon,
  CheckCircle2Icon,
  InboxIcon,
  ListTodoIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  WorkflowIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type GuideSectionId =
  | "overview"
  | "inbox"
  | "tasks"
  | "projects"
  | "automations"
  | "approvals"
  | "testing";

type GuideSection = {
  id: GuideSectionId;
  title: string;
  icon: ReactNode;
};

const SECTIONS: GuideSection[] = [
  { id: "overview", title: "Vue d'ensemble", icon: <BriefcaseBusinessIcon className="size-4" /> },
  { id: "inbox", title: "Inbox", icon: <InboxIcon className="size-4" /> },
  { id: "tasks", title: "Tâches", icon: <ListTodoIcon className="size-4" /> },
  { id: "projects", title: "Projets", icon: <WorkflowIcon className="size-4" /> },
  { id: "automations", title: "Automatisations", icon: <PlayCircleIcon className="size-4" /> },
  { id: "approvals", title: "Validations", icon: <ShieldCheckIcon className="size-4" /> },
  { id: "testing", title: "Tester pour de vrai", icon: <CheckCircle2Icon className="size-4" /> },
];

function GuideLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
    >
      {children}
    </Link>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function GuideBody({
  section,
  workspaceBase,
}: {
  section: GuideSectionId;
  workspaceBase: string;
}) {
  const inbox = `${workspaceBase}/inbox`;
  const tasks = `${workspaceBase}/tasks`;
  const projects = `${workspaceBase}/projects`;
  const automations = `${workspaceBase}/automations`;
  const approvals = `${workspaceBase}/approvals`;
  const agents = `${workspaceBase}/agents`;

  if (section === "overview") {
    return (
      <div className="space-y-6">
        <SectionBlock title="Ce qu'est le Travail">
          <p>
            Le Travail est le <strong className="font-medium text-foreground">control plane métier</strong> de
            Hermes Console : tâches durables, assignation, exécution par agents, interventions humaines et
            livrables. Ce n&apos;est pas un chat — c&apos;est du travail traçable de bout en bout.
          </p>
        </SectionBlock>

        <SectionBlock title="Boucle métier">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              Vous créez ou assignez une tâche dans la Console (<GuideLink href={tasks}>Tâches</GuideLink>).
            </li>
            <li>
              La Console enregistre le travail et, si un agent ou une équipe est assigné, met un run en file
              d&apos;attente.
            </li>
            <li>
              L&apos;Edge (worker Go) réclame le run, ouvre une session Hermes et exécute l&apos;inférence et les
              outils.
            </li>
            <li>
              Si l&apos;agent a besoin de vous, le run passe en pause → <GuideLink href={inbox}>Inbox</GuideLink>{" "}
              et <GuideLink href={approvals}>Validations</GuideLink>.
            </li>
            <li>
              Sinon le run se termine ; la tâche peut passer en revue ou en <em>done</em> selon la politique de
              validation du livrable.
            </li>
          </ol>
        </SectionBlock>

        <SectionBlock title="Les cinq surfaces">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <GuideLink href={inbox}>Inbox</GuideLink> — ce qui requiert votre attention (in-app).
            </li>
            <li>
              <GuideLink href={tasks}>Tâches</GuideLink> — board kanban, création, détail, runs.
            </li>
            <li>
              <GuideLink href={projects}>Projets</GuideLink> — regroupement et progression.
            </li>
            <li>
              <GuideLink href={automations}>Automatisations</GuideLink> — déclencheurs qui créent des tâches.
            </li>
            <li>
              <GuideLink href={approvals}>Validations</GuideLink> — décisions quand un agent est bloqué.
            </li>
          </ul>
        </SectionBlock>

        <SectionBlock title="Ce qui n'est pas le Travail">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="font-medium text-foreground">Sessions / Chat</strong> — conversation libre avec un
              agent, sans objet métier durable.
            </li>
            <li>
              <strong className="font-medium text-foreground">Telegram / Discord (intégrations agent)</strong> —
              canaux de messagerie pour parler à l&apos;agent ; ils ne pilotent pas le board Travail.
            </li>
            <li>
              <strong className="font-medium text-foreground">Telegram (push Console)</strong> — alerte optionnelle
              quand une intervention attend ; la décision se prend toujours dans la Console.
            </li>
            <li>
              <strong className="font-medium text-foreground">Discord</strong> — aucune notification Travail ; chat
              agent uniquement.
            </li>
          </ul>
        </SectionBlock>
      </div>
    );
  }

  if (section === "inbox") {
    return (
      <div className="space-y-6">
        <SectionBlock title="Rôle">
          <p>
            Votre fil personnel d&apos;attention dans l&apos;organisation. Chaque item pointe vers l&apos;endroit où
            agir. Ouvrez <GuideLink href={inbox}>Inbox</GuideLink>.
          </p>
        </SectionBlock>

        <SectionBlock title="Types d'items">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="font-medium text-foreground">Tâche assignée</strong> — quelqu&apos;un vous a assigné
              une tâche (humain → humain).
            </li>
            <li>
              <strong className="font-medium text-foreground">Intervention</strong> — un agent attend une décision
              (validation, clarification, secret…).
            </li>
            <li>
              <strong className="font-medium text-foreground">Run en échec</strong> — l&apos;exécution a échoué ;
              relancez ou corrigez depuis la tâche.
            </li>
            <li>
              <strong className="font-medium text-foreground">Revue de livrable</strong> — run réussi avec politique{" "}
              <em>review required</em> ; approuvez sur la fiche tâche.
            </li>
            <li>
              <strong className="font-medium text-foreground">Automatisation en échec</strong> — un déclencheur a
              échoué ; voir <GuideLink href={automations}>Automatisations</GuideLink>.
            </li>
          </ul>
        </SectionBlock>

        <SectionBlock title="Actions">
          <p>
            Le badge ambre sur Inbox dans la sidebar indique le nombre de non-lus. Marquez un item lu ou tout lire en
            masse. La page se rafraîchit en temps réel (SSE).
          </p>
        </SectionBlock>
      </div>
    );
  }

  if (section === "tasks") {
    return (
      <div className="space-y-6">
        <SectionBlock title="Créer une tâche">
          <p>
            Membre ou owner : bouton <strong className="font-medium text-foreground">Nouvelle tâche</strong> sur{" "}
            <GuideLink href={tasks}>Tâches</GuideLink>. Renseignez le résultat attendu, le contexte, la priorité, le
            projet optionnel et l&apos;assignation.
          </p>
        </SectionBlock>

        <SectionBlock title="Les 4 façons de lancer le Travail">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="font-medium text-foreground">Assigner</strong> un agent ou une équipe → ownership +
              run en file (sauf Backlog explicite).
            </li>
            <li>
              <strong className="font-medium text-foreground">Mentionner</strong> un agent dans un commentaire → run
              léger, contexte = le commentaire ; l&apos;assignation ne change pas.
            </li>
            <li>
              <strong className="font-medium text-foreground">Chat</strong> (Sessions) → conversation hors tâche,
              aucun run sur le board.
            </li>
            <li>
              <strong className="font-medium text-foreground">Automatisation</strong> → crée la tâche et l&apos;assigne
              ; met en file si l&apos;assignee est un agent.
            </li>
          </ul>
          <p className="mt-2">
            Assigner à un <strong className="font-medium text-foreground">humain</strong> notifie l&apos;Inbox sans
            lancer Hermes. Réorganiser une carte sur le kanban ne lance jamais un run.
          </p>
        </SectionBlock>

        <SectionBlock title="Colonnes et livraison">
          <p>
            Colonnes : <em>Backlog → Prêt → Actif ↔ Bloquée → En revue → Terminée</em> (ou <em>Annulée</em>). La
            colonne est l&apos;organisation humaine ; le badge sur la carte dit si Hermes travaille (en file, en
            cours, intervention requise…).
          </p>
          <p className="mt-2">
            <strong className="font-medium text-foreground">Livré ≠ run réussi</strong> : un run techniquement réussi
            mais sans livrable ne passe pas en <em>Terminée</em> — il part en <em>Bloquée</em> (sans livrable). Et pas
            de run sans matière : une tâche sans brief ni ressource est refusée à la mise en file.
          </p>
        </SectionBlock>

        <SectionBlock title="Détail et runs">
          <p>
            Clic sur une carte ou URL <code className="rounded bg-muted px-1 py-0.5 text-xs">?task=&lt;id&gt;</code>{" "}
            ouvre le panneau latéral : plan agent, timeline, commentaires, interventions, ressources. Un{" "}
            <strong className="font-medium text-foreground">run</strong> est une exécution Hermes (queued → running →
            succeeded/failed). Relancez ou annulez depuis le détail. Mentionner un agent ou une équipe dans un
            commentaire peut déclencher un run supplémentaire.
          </p>
        </SectionBlock>

        <SectionBlock title="Revue livrable (niveau tâche)">
          <p>
            Si <em>reviewPolicy = required</em>, un run réussi met la tâche en <em>review</em> (pas directement{" "}
            <em>done</em>). Boutons <strong className="font-medium text-foreground">Approuver</strong> /{" "}
            <strong className="font-medium text-foreground">Renvoyer</strong> sur la fiche — distinct des
            interventions dans Validations.
          </p>
        </SectionBlock>
      </div>
    );
  }

  if (section === "projects") {
    return (
      <div className="space-y-6">
        <SectionBlock title="Rôle">
          <p>
            Conteneur métier pour regrouper tâches, ressources (fichiers, connaissances, artefacts) et automatisations
            liées. Liste sur <GuideLink href={projects}>Projets</GuideLink>.
          </p>
        </SectionBlock>

        <SectionBlock title="Statuts et progression">
          <p>
            Statuts projet : <em>planned, active, paused, completed, cancelled</em>. La fiche projet affiche la barre{" "}
            <em>X/Y terminées</em> et les liens vers les tâches (<code className="rounded bg-muted px-1 py-0.5 text-xs">?task=</code>
            ).
          </p>
        </SectionBlock>

        <SectionBlock title="Cycle de vie">
          <p>
            Supprimer un projet détache les tâches (elles restent sur le board). Les ressources strictement liées au
            projet peuvent être supprimées en cascade.
          </p>
        </SectionBlock>
      </div>
    );
  }

  if (section === "automations") {
    return (
      <div className="space-y-6">
        <SectionBlock title="Rôle">
          <p>
            Créer des tâches (et lancer des runs si agent/équipe assigné) sans action manuelle à chaque fois. Gérez
            sur <GuideLink href={automations}>Automatisations</GuideLink> (création réservée au owner).
          </p>
        </SectionBlock>

        <SectionBlock title="Déclencheurs">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="font-medium text-foreground">Manuel</strong> — bouton Exécuter dans l&apos;UI.
            </li>
            <li>
              <strong className="font-medium text-foreground">Cron</strong> — planificateur externe → endpoint interne
              signé.
            </li>
            <li>
              <strong className="font-medium text-foreground">Webhook</strong> — POST avec secret d&apos;en-tête.
            </li>
            <li>
              <strong className="font-medium text-foreground">Événement</strong> — ex. une tâche passe en{" "}
              <em>done</em> (<code className="rounded bg-muted px-1 py-0.5 text-xs">work_item.done</code>).
            </li>
          </ul>
        </SectionBlock>

        <SectionBlock title="Comportement">
          <p>
            Chaque déclenchement crée une <strong className="font-medium text-foreground">tâche visible</strong> à
            partir du modèle configuré, puis enfile un run si l&apos;assigné est un agent ou une équipe. L&apos;historique
            sur la page lie chaque exécution à la tâche créée. Échec → Inbox pour le créateur.
          </p>
        </SectionBlock>
      </div>
    );
  }

  if (section === "approvals") {
    return (
      <div className="space-y-6">
        <SectionBlock title="Rôle">
          <p>
            Quand Hermes bloque un run, vous décidez ici (<GuideLink href={approvals}>Validations</GuideLink>). Le run
            reste en <em>waiting_input</em> jusqu&apos;à votre réponse ; l&apos;Edge reprend ensuite la même session.
          </p>
        </SectionBlock>

        <SectionBlock title="Types d'intervention">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>
              <strong className="font-medium text-foreground">approval</strong> — Approuver / Rejeter.
            </li>
            <li>
              <strong className="font-medium text-foreground">clarification</strong> — réponse texte libre.
            </li>
            <li>
              <strong className="font-medium text-foreground">secret / sudo</strong> — valeur éphémère (non stockée en
              base, TTL court).
            </li>
            <li>
              <strong className="font-medium text-foreground">launch_review / deliverable_review</strong> — portes dans
              le run (≠ revue livrable au niveau tâche).
            </li>
          </ul>
        </SectionBlock>

        <SectionBlock title="Notifications hors app">
          <p>
            À la création d&apos;une intervention, email (SMTP / Mailpit en dev) et Telegram push (si{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">TELEGRAM_BOT_TOKEN</code> configuré) alertent les
            responsables — la décision reste dans la Console. Discord n&apos;intervient pas.
          </p>
        </SectionBlock>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionBlock title="Parcours minimal (sans Telegram ni Discord)">
        <ol className="list-decimal space-y-2 pl-4">
          <li>
            Stack locale : <code className="rounded bg-muted px-1 py-0.5 text-xs">make dev</code> + inférence
            configurée sur le profil Hermes (<code className="rounded bg-muted px-1 py-0.5 text-xs">OPENAI_API_KEY</code>
            , etc.).
          </li>
          <li>
            Connectez-vous, ouvrez <GuideLink href={tasks}>Tâches</GuideLink>, créez une tâche assignée à un agent{" "}
            <em>ready</em> (voir <GuideLink href={agents}>Agents et équipes</GuideLink>).
          </li>
          <li>
            Fermez le navigateur si vous voulez : l&apos;Edge continue. Revenez sur le détail : statut, plan, timeline.
          </li>
          <li>
            Pour forcer une pause humaine, formulez un contexte qui nécessite validation ou clarification ; traitez dans{" "}
            <GuideLink href={approvals}>Validations</GuideLink> puis vérifiez la reprise du run.
          </li>
        </ol>
      </SectionBlock>

      <SectionBlock title="Optionnel : alertes">
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            <strong className="font-medium text-foreground">Mailpit</strong> —{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">localhost:8025</code> si SMTP dev actif.
          </li>
          <li>
            <strong className="font-medium text-foreground">Telegram push</strong> —{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">TELEGRAM_BOT_TOKEN</code> +{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">TELEGRAM_CHAT_ID</code> ; preview via{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">scripts/preview-telegram-intervention.ts</code>.
            En local le bouton URL peut être omis (localhost non public).
          </li>
        </ul>
      </SectionBlock>

      <SectionBlock title="Test automatisé réel">
        <p>
          <code className="rounded bg-muted px-1 py-0.5 text-xs">E2E_REAL_WORK=1 bun run test:e2e:real</code> depuis{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">apps/web</code> — crée une tâche, ferme le navigateur,
          attend la fin du run Docker Edge + Hermes.
        </p>
      </SectionBlock>
    </div>
  );
}

export function WorkGuideDialog({
  open,
  onOpenChange,
  workspaceBase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceBase: string;
}) {
  const [activeSection, setActiveSection] = useState<GuideSectionId>("overview");
  const activeMeta = SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] min-w-0 max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[75dvh] sm:w-[75vw] sm:max-w-[75vw]"
        aria-describedby="work-guide-description"
      >
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-7 sm:py-6">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-md border bg-muted px-2 py-1 text-xs font-medium text-foreground/80">
              Guide fonctionnel
            </span>
          </div>
          <DialogTitle className="text-xl leading-tight sm:text-2xl">
            Travail — piloter les agents sur du travail durable
          </DialogTitle>
          <DialogDescription id="work-guide-description" className="max-w-3xl leading-relaxed">
            Inbox, tâches, projets, automatisations et validations : comment la Console, l&apos;Edge et Hermes
            collaborent, et ce qui relève du chat ou des intégrations messagerie.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <div
            className="min-h-0 overflow-y-auto px-5 py-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-7 sm:py-7"
            tabIndex={0}
            aria-labelledby="work-guide-section-title"
          >
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {activeMeta.title}
            </p>
            <h2 id="work-guide-section-title" className="mt-1 text-base font-semibold">
              {activeMeta.title}
            </h2>
            <div className="mt-5">
              <GuideBody section={activeSection} workspaceBase={workspaceBase} />
            </div>
          </div>

          <nav
            className="hidden min-h-0 shrink-0 overflow-y-auto border-l bg-muted/20 px-3 py-4 lg:block"
            aria-label="Sections du guide Travail"
          >
            <ul role="tablist" className="space-y-0.5">
              {SECTIONS.map((section) => {
                const selected = activeSection === section.id;
                return (
                  <li key={section.id} role="presentation">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls="work-guide-section-title"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                        selected
                          ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-foreground/10"
                          : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                      )}
                      onClick={() => setActiveSection(section.id)}
                    >
                      {section.icon}
                      <span className="min-w-0 truncate">{section.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="shrink-0 border-t bg-muted/40">
          <nav
            className="flex gap-1 overflow-x-auto border-b border-border/60 px-5 py-2.5 lg:hidden"
            aria-label="Sections du guide Travail (mobile)"
          >
            {SECTIONS.map((section) => {
              const selected = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    selected
                      ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                  )}
                  onClick={() => setActiveSection(section.id)}
                >
                  {section.title}
                </button>
              );
            })}
          </nav>
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-7">
            <p className="hidden text-xs text-muted-foreground sm:block">
              Section {SECTIONS.findIndex((s) => s.id === activeSection) + 1} / {SECTIONS.length} — {activeMeta.title}
            </p>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Fermer
                </Button>
              </DialogClose>
              <Button type="button" asChild>
                <Link href={`${workspaceBase}/tasks`} onClick={() => onOpenChange(false)}>
                  Ouvrir Tâches
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
