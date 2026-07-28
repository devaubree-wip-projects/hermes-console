export type ProductNavigationCategory =
  | "Principal"
  | "Travail"
  | "Ressources"
  | "Agents"
  | "Administration"
  | "Paramètres"

export type ProductNavigationPrimaryGroup = "main" | "work" | "utility"

type ProductNavigationDefinition = {
  id: string
  title: string
  category: ProductNavigationCategory
  keywords: readonly string[]
  path: `/${string}`
  searchable: boolean
  primary?: {
    group: ProductNavigationPrimaryGroup
    order: number
  }
  activePath?: `/${string}`
}

export const PRODUCT_NAVIGATION = [
  {
    id: "dashboard",
    title: "Dashboard",
    category: "Principal",
    keywords: ["accueil", "indicateurs", "activité", "kpi"],
    path: "/dashboard",
    searchable: true,
    primary: { group: "main", order: 1 },
  },
  {
    id: "sessions",
    title: "Sessions",
    category: "Principal",
    keywords: ["conversation", "conversations", "chat", "messages", "historique"],
    path: "/d/chat",
    searchable: true,
    primary: { group: "main", order: 2 },
  },
  {
    id: "agents",
    title: "Agents",
    category: "Agents",
    keywords: ["assistant", "équipe", "profil", "hermes"],
    path: "/agents",
    searchable: true,
  },
  {
    id: "agent-new",
    title: "Créer un agent",
    category: "Agents",
    keywords: ["nouveau", "assistant", "profil", "hermes"],
    path: "/agents/new",
    searchable: false,
  },
  {
    id: "inbox",
    title: "Inbox",
    category: "Travail",
    keywords: ["boîte de réception", "attention", "non lu", "assignation"],
    path: "/inbox",
    searchable: true,
    primary: { group: "work", order: 1 },
  },
  {
    id: "tasks",
    title: "Tâches",
    category: "Travail",
    keywords: ["tâche", "travail", "assignation", "à faire"],
    path: "/tasks",
    searchable: true,
    primary: { group: "work", order: 2 },
  },
  {
    id: "projects",
    title: "Projets",
    category: "Travail",
    keywords: ["projet", "planning", "livrables"],
    path: "/projects",
    searchable: true,
    primary: { group: "work", order: 3 },
  },
  {
    id: "automations",
    title: "Automatisations",
    category: "Travail",
    keywords: ["automatisation", "règle", "déclencheur", "workflow"],
    path: "/automations",
    searchable: true,
    primary: { group: "work", order: 4 },
  },
  {
    id: "approvals",
    title: "Validations",
    category: "Travail",
    keywords: ["approbation", "validation", "décision", "permission"],
    path: "/approvals",
    searchable: true,
    primary: { group: "work", order: 5 },
  },
  {
    id: "files",
    title: "Fichiers",
    category: "Ressources",
    keywords: ["fichier", "document", "pièce jointe", "ressource"],
    path: "/files",
    searchable: true,
    primary: { group: "utility", order: 1 },
  },
  {
    id: "knowledge",
    title: "Connaissances",
    category: "Ressources",
    keywords: ["mémoire", "base de connaissances", "documentation", "savoir"],
    path: "/knowledge",
    searchable: true,
  },
  {
    id: "skills",
    title: "Skills",
    category: "Agents",
    keywords: ["skill", "compétence", "capacité", "savoir-faire"],
    path: "/skills",
    searchable: true,
  },
  {
    id: "integrations",
    title: "Intégrations",
    category: "Administration",
    keywords: ["intégration", "messagerie", "telegram", "discord", "canal"],
    path: "/integrations",
    searchable: true,
  },
  {
    id: "installations",
    title: "Installations",
    category: "Administration",
    keywords: ["installation", "runtime", "relay", "serveur", "hermes"],
    path: "/installations",
    searchable: true,
  },
  {
    id: "event-logs",
    title: "Journal d’événements",
    category: "Administration",
    keywords: ["événement", "journal", "logs", "audit", "activité"],
    path: "/events",
    searchable: true,
  },
  {
    id: "settings-chat",
    title: "Paramètres",
    category: "Paramètres",
    keywords: ["chat", "conversation", "messages", "raisonnement", "réglages"],
    path: "/settings/chat",
    activePath: "/settings",
    searchable: true,
    primary: { group: "utility", order: 2 },
  },
  {
    id: "settings-models",
    title: "Modèles",
    category: "Paramètres",
    keywords: ["modèle", "provider", "fournisseur", "llm", "codex", "openai"],
    path: "/settings/models",
    searchable: true,
  },
  {
    id: "settings-tools",
    title: "Outils",
    category: "Paramètres",
    keywords: ["outil", "toolset", "runtime", "shell", "fichiers"],
    path: "/settings/tools",
    searchable: true,
  },
  {
    id: "settings-connectors",
    title: "Connecteurs",
    category: "Paramètres",
    keywords: ["mcp", "connecteur", "serveur", "catalogue", "externe"],
    path: "/settings/mcp",
    searchable: true,
  },
  {
    id: "settings-documents",
    title: "Documents",
    category: "Paramètres",
    keywords: ["export", "pdf", "word", "titre"],
    path: "/settings/documents",
    searchable: true,
  },
  {
    id: "settings-general",
    title: "Général",
    category: "Paramètres",
    keywords: ["espace de travail", "workspace", "nom", "organisation"],
    path: "/settings/general",
    searchable: true,
  },
  {
    id: "settings-permissions",
    title: "Permissions",
    category: "Paramètres",
    keywords: ["droits", "sécurité", "validation", "agents"],
    path: "/settings/permissions",
    searchable: true,
  },
  {
    id: "settings-members",
    title: "Membres",
    category: "Paramètres",
    keywords: ["équipe", "rôles", "accès", "utilisateurs"],
    path: "/settings/members",
    searchable: true,
  },
  {
    id: "settings-runtime",
    title: "Runtime",
    category: "Paramètres",
    keywords: ["hermes", "serveur", "bridge", "connexion"],
    path: "/settings/runtime",
    searchable: true,
  },
  {
    id: "settings-instance",
    title: "Instance",
    category: "Paramètres",
    keywords: ["env", "smtp", "email", "configuration", "déploiement"],
    path: "/settings/instance",
    searchable: true,
  },
] as const satisfies readonly ProductNavigationDefinition[]

export type ProductRouteId = (typeof PRODUCT_NAVIGATION)[number]["id"]
export type ProductNavigationEntry = (typeof PRODUCT_NAVIGATION)[number]
type PrimaryProductNavigationEntry = Extract<
  ProductNavigationEntry,
  { readonly primary: { readonly group: ProductNavigationPrimaryGroup } }
>

export type ResolvedProductNavigationEntry = ProductNavigationEntry & {
  href: string
}

function normalizeWorkspaceBase(workspaceBase: string) {
  const normalized = workspaceBase.trim().replace(/\/+$/, "")
  return normalized || "/"
}

export function productRouteHref(
  workspaceBase: string,
  routeId: ProductRouteId,
) {
  const route = PRODUCT_NAVIGATION.find((candidate) => candidate.id === routeId)
  if (!route) {
    throw new Error(`Unknown product route: ${routeId}`)
  }
  const base = normalizeWorkspaceBase(workspaceBase)
  return base === "/" ? route.path : `${base}${route.path}`
}

export function withAgentContext(
  href: string,
  activeAgentId?: string,
  defaultAgentId?: string,
) {
  if (!activeAgentId || activeAgentId === defaultAgentId) return href
  const separator = href.includes("?") ? "&" : "?"
  return `${href}${separator}agentId=${encodeURIComponent(activeAgentId)}`
}

export function getProductNavigationEntry(
  workspaceBase: string,
  routeId: ProductRouteId,
): ResolvedProductNavigationEntry {
  const route = PRODUCT_NAVIGATION.find((candidate) => candidate.id === routeId)
  if (!route) {
    throw new Error(`Unknown product route: ${routeId}`)
  }
  return {
    ...route,
    href: productRouteHref(workspaceBase, routeId),
  }
}

export function getPrimaryProductNavigation(
  workspaceBase: string,
  group: ProductNavigationPrimaryGroup,
) {
  return PRODUCT_NAVIGATION
    .filter((route): route is PrimaryProductNavigationEntry => (
      "primary" in route && route.primary.group === group
    ))
    .sort((left, right) => left.primary.order - right.primary.order)
    .map((route) => getProductNavigationEntry(workspaceBase, route.id))
}

export function getSearchableProductNavigation(workspaceBase: string) {
  return PRODUCT_NAVIGATION
    .filter((route) => route.searchable)
    .map((route) => getProductNavigationEntry(workspaceBase, route.id))
}

export function isProductRouteActive(
  pathname: string,
  workspaceBase: string,
  routeId: ProductRouteId,
) {
  const route = getProductNavigationEntry(workspaceBase, routeId)
  const activeHref = "activePath" in route && route.activePath
    ? normalizeWorkspaceBase(workspaceBase) === "/"
      ? route.activePath
      : `${normalizeWorkspaceBase(workspaceBase)}${route.activePath}`
    : route.href
  return pathname === activeHref || pathname.startsWith(`${activeHref}/`)
}

export function resolveProductRouteTitle(
  pathname: string,
  workspaceBase: string,
) {
  const base = normalizeWorkspaceBase(workspaceBase)
  if (
    base !== "/"
    && pathname !== base
    && !pathname.startsWith(`${base}/`)
  ) {
    return "Hermes Console"
  }

  const relativePath = pathname
    .slice(base === "/" ? 0 : base.length)
    .replace(/\/+$/, "") || "/"

  if (/^\/tasks\/[^/]+/.test(relativePath)) return "Détail de la tâche"
  if (/^\/projects\/[^/]+/.test(relativePath)) return "Détail du projet"
  if (/^\/installations\/[^/]+/.test(relativePath)) {
    return "Détail de l’installation"
  }

  const match = [...PRODUCT_NAVIGATION]
    .sort((left, right) => right.path.length - left.path.length)
    .find((route) => (
      relativePath === route.path || relativePath.startsWith(`${route.path}/`)
    ))

  if (match) return match.title
  if (relativePath === "/settings" || relativePath.startsWith("/settings/")) {
    return "Paramètres"
  }
  return "Hermes Console"
}
