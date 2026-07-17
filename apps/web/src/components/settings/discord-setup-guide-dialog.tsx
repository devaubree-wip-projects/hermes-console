"use client";

import { BookOpen, ExternalLink, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Step = {
  title: string;
  detail: React.ReactNode;
};

const STEPS: Step[] = [
  {
    title: "Ouvrir le Developer Portal et se connecter",
    detail: (
      <>
        Va sur <strong>discord.com/developers/applications</strong> (bouton en bas de cette fenêtre)
        et connecte-toi avec ton compte Discord. Tu arrives sur la liste de tes applications.
      </>
    ),
  },
  {
    title: "Créer une nouvelle application",
    detail: (
      <ul className="list-disc space-y-1 pl-4">
        <li>En haut à droite, clique sur <strong>New Application</strong>.</li>
        <li>Donne un nom (ex. <em>Hermes Bot</em>) — c’est le nom qui s’affichera sur ton serveur.</li>
        <li>Coche les conditions d’utilisation puis clique sur <strong>Create</strong>.</li>
      </ul>
    ),
  },
  {
    title: "Ouvrir l’onglet Bot",
    detail: (
      <>
        Dans le menu de gauche, clique sur <strong>Bot</strong>. Le bot est déjà rattaché à ton
        application. Tu peux au passage lui donner un avatar et un nom d’affichage.
      </>
    ),
  },
  {
    title: "Réinitialiser et copier le token",
    detail: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Dans la section <strong>Token</strong>, clique sur <strong>Reset Token</strong> puis confirme.</li>
        <li>Clique sur <strong>Copy</strong> pour copier le token <strong>tout de suite</strong>.</li>
        <li>
          Discord ne réaffiche jamais un token : garde-le de côté, tu le colleras dans le champ
          <strong> « Token du bot »</strong> de cette page.
        </li>
      </ul>
    ),
  },
  {
    title: "Activer Message Content Intent",
    detail: (
      <ul className="list-disc space-y-1 pl-4">
        <li>
          Toujours dans <strong>Bot</strong>, descends jusqu’à <strong>Privileged Gateway Intents</strong>.
        </li>
        <li>
          Active <strong>MESSAGE CONTENT INTENT</strong> — <strong>obligatoire</strong> pour qu’Hermes lise
          le contenu des messages.
        </li>
        <li>Clique sur <strong>Save Changes</strong> en bas pour enregistrer.</li>
      </ul>
    ),
  },
  {
    title: "Générer l’URL d’invitation (OAuth2)",
    detail: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Dans le menu de gauche, ouvre <strong>OAuth2 → URL Generator</strong>.</li>
        <li>Dans <strong>Scopes</strong>, coche <code>bot</code>.</li>
        <li>
          Dans <strong>Bot Permissions</strong>, coche au minimum <em>View Channels</em>,
          <em> Send Messages</em> et <em>Read Message History</em>.
        </li>
        <li>Copie l’URL générée tout en bas de la page.</li>
      </ul>
    ),
  },
  {
    title: "Inviter le bot sur ton serveur",
    detail: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Ouvre l’URL copiée dans un nouvel onglet.</li>
        <li>
          Choisis le serveur (tu dois y être <strong>administrateur</strong>) puis clique sur
          <strong> Authorize</strong>.
        </li>
        <li>Le bot apparaît alors dans la liste des membres du serveur (hors ligne pour l’instant).</li>
      </ul>
    ),
  },
  {
    title: "Finaliser dans Hermes",
    detail: (
      <>
        Reviens sur cette page, colle le token dans le champ <strong>« Token du bot »</strong>, puis
        clique sur <strong>Enregistrer et connecter</strong>. Hermes démarre le gateway et le bot
        passe en ligne.
      </>
    ),
  },
];

export function DiscordSetupGuideDialog({ portalUrl }: { portalUrl?: string }) {
  const developerPortalUrl = portalUrl || "https://discord.com/developers/applications";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <BookOpen />
          Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[92vw] max-w-[92vw] max-h-[85dvh] overflow-y-auto sm:w-[75vw] sm:max-w-[75vw]">
        <DialogHeader>
          <DialogTitle>Créer un bot Discord pour Hermes</DialogTitle>
          <DialogDescription>
            Le parcours complet dans le Discord Developer Portal, étape par étape, pour créer ton bot,
            récupérer son token et le connecter à Hermes.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="warning" title="Le token est un secret">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            Ne partage jamais ton token et ne le publie nulle part. S’il fuite, réinitialise-le depuis
            l’onglet Bot.
          </span>
        </Alert>

        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="text-sm font-medium">{step.title}</h3>
                <div className="text-sm leading-6 text-muted-foreground">{step.detail}</div>
              </div>
            </li>
          ))}
        </ol>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Fermer</Button>
          </DialogClose>
          <Button asChild>
            <a href={developerPortalUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              Ouvrir le Developer Portal
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
