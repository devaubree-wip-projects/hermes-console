import type { PermissionKey } from "@/lib/permissions";

export const TASK_KINDS = [
  "audit",
  "report",
  "content",
  "summary",
  "email",
  "code",
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_STATUSES = [
  "draft",
  "waiting_approval",
  "running",
  "done",
  "failed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskTemplate = {
  kind: TaskKind;
  label: string;
  description: string;
  inputLabel: string;
  inputPlaceholder: string;
  /**
   * If set and the workspace permission is disabled, creating the task
   * requires an approval before it can run.
   */
  permission?: PermissionKey;
  buildPrompt: (input: string) => string;
};

export const TASK_TEMPLATES: Record<TaskKind, TaskTemplate> = {
  audit: {
    kind: "audit",
    label: "Audit technique",
    description: "Analyser un site, un document ou un projet et produire un état des lieux.",
    inputLabel: "Quoi auditer ?",
    inputPlaceholder: "Ex. : mon site vitrine https://exemple.fr — vérifier SEO et performance",
    permission: "web_search",
    buildPrompt: (input) =>
      `Réalise un audit technique structuré sur le sujet suivant :\n\n${input}\n\nOrganise ta réponse en : constats, problèmes priorisés (critique / important / mineur), recommandations actionnables.`,
  },
  report: {
    kind: "report",
    label: "Rapport",
    description: "Générer un rapport structuré à partir du contexte de l’organisation.",
    inputLabel: "Sujet du rapport",
    inputPlaceholder: "Ex. : rapport SEO local du mois avec plan d'action",
    permission: "generate_reports",
    buildPrompt: (input) =>
      `Rédige un rapport professionnel structuré sur :\n\n${input}\n\nInclus un résumé exécutif, les points clés, et des recommandations concrètes.`,
  },
  content: {
    kind: "content",
    label: "Création de contenu",
    description: "Rédiger du contenu (pages, articles, fiches) prêt à relire.",
    inputLabel: "Contenu à produire",
    inputPlaceholder: "Ex. : 10 idées de pages locales SEO pour un garage à Lille",
    buildPrompt: (input) =>
      `Produis le contenu suivant, prêt à relire et publier :\n\n${input}\n\nRespecte un ton professionnel et propose une structure claire.`,
  },
  summary: {
    kind: "summary",
    label: "Résumé de documents",
    description: "Résumer les documents déposés dans l’organisation.",
    inputLabel: "Que résumer ?",
    inputPlaceholder: "Ex. : résumer le brief projet et lister les points ouverts",
    permission: "read_files",
    buildPrompt: (input) =>
      `Résume les documents de l’organisation selon la consigne suivante :\n\n${input}\n\nTermine par la liste des points ouverts ou ambigus.`,
  },
  email: {
    kind: "email",
    label: "Préparer un email",
    description: "Rédiger un email prêt à envoyer (l'envoi reste soumis à validation).",
    inputLabel: "Objet de l'email",
    inputPlaceholder: "Ex. : relance devis pour le client Martin, ton cordial",
    permission: "send_emails",
    buildPrompt: (input) =>
      `Rédige un email professionnel prêt à envoyer :\n\n${input}\n\nDonne l'objet, le corps, et une variante plus courte.`,
  },
  code: {
    kind: "code",
    label: "Correction / code",
    description: "Analyser un bug ou proposer une modification technique.",
    inputLabel: "Problème ou modification",
    inputPlaceholder: "Ex. : le formulaire de contact ne valide pas l'email, proposer un correctif",
    permission: "propose_changes",
    buildPrompt: (input) =>
      `Analyse le problème technique suivant et propose un correctif détaillé :\n\n${input}\n\nExplique la cause probable, la solution proposée, et les risques éventuels.`,
  },
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  draft: "Brouillon",
  waiting_approval: "En attente de validation",
  running: "En cours",
  done: "Terminée",
  failed: "Échouée",
};
