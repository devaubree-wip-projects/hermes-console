export const AGENT_TEMPLATES = [
  {
    id: "general",
    label: "Assistant général",
    description: "Organise, recherche et exécute les demandes du quotidien.",
    defaultName: "Assistant principal",
    mission: "Assistant principal de l'organisation, capable de traiter les demandes générales.",
  },
  {
    id: "research",
    label: "Recherche & analyse",
    description: "Explore des sources, synthétise et prépare des rapports fiables.",
    defaultName: "Analyste",
    mission: "Analyse des sources et produit des synthèses et rapports structurés.",
  },
  {
    id: "content",
    label: "Contenu",
    description: "Prépare des briefs, contenus et livrables éditoriaux.",
    defaultName: "Assistant contenu",
    mission: "Prépare des contenus et livrables éditoriaux à faire valider.",
  },
  {
    id: "operations",
    label: "Opérations",
    description: "Suit les tâches, documents et actions récurrentes de l'équipe.",
    defaultName: "Assistant opérations",
    mission: "Aide l'équipe à suivre et exécuter ses opérations récurrentes.",
  },
] as const;

export type AgentTemplateId = (typeof AGENT_TEMPLATES)[number]["id"];

export function getAgentTemplate(id: string) {
  return AGENT_TEMPLATES.find((template) => template.id === id);
}
