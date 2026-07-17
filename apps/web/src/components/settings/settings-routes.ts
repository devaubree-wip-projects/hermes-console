import {
  BotIcon,
  Building2Icon,
  CpuIcon,
  FileTextIcon,
  ServerIcon,
  ShieldCheckIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react"

export const SETTINGS_PANELS = [
  {
    id: "chat",
    label: "Chat",
    icon: BotIcon,
    section: "Conversation",
    keywords: ["messages", "affichage", "raisonnement", "outils"],
  },
  {
    id: "models",
    label: "Modèles",
    icon: CpuIcon,
    section: "Conversation",
    keywords: ["provider", "fournisseur", "llm", "codex", "openai"],
  },
  {
    id: "tools",
    label: "Outils intégrés",
    icon: WrenchIcon,
    section: "Conversation",
    keywords: ["tools", "capacités", "toolsets", "mcp", "runtime", "shell", "fichiers"],
  },
  {
    id: "documents",
    label: "Documents",
    icon: FileTextIcon,
    section: "Conversation",
    keywords: ["export", "pdf", "word", "titre"],
  },
  {
    id: "general",
    label: "Général",
    icon: Building2Icon,
    section: "Espace de travail",
    keywords: ["workspace", "nom", "organisation"],
  },
  {
    id: "permissions",
    label: "Permissions",
    icon: ShieldCheckIcon,
    section: "Espace de travail",
    keywords: ["droits", "sécurité", "validation", "agents"],
  },
  {
    id: "members",
    label: "Membres",
    icon: UsersIcon,
    section: "Espace de travail",
    keywords: ["équipe", "rôles", "accès", "utilisateurs"],
  },
  {
    id: "runtime",
    label: "Runtime",
    icon: ServerIcon,
    section: "Espace de travail",
    keywords: ["hermes", "serveur", "bridge", "connexion"],
  },
] as const

export type SettingsPanelId = (typeof SETTINGS_PANELS)[number]["id"]

export const SETTINGS_PANEL_BY_ID = Object.fromEntries(
  SETTINGS_PANELS.map((panel) => [panel.id, panel]),
) as Record<SettingsPanelId, (typeof SETTINGS_PANELS)[number]>

export function settingsPanelHref(workspaceBase: string, panel: SettingsPanelId) {
  return `${workspaceBase}/settings/${panel}`
}

export function resolveSettingsPanel(segments: string[] | undefined): SettingsPanelId | null {
  const [panel, extra] = segments ?? []
  if (!panel || extra) return null
  return SETTINGS_PANELS.some((candidate) => candidate.id === panel)
    ? panel as SettingsPanelId
    : null
}

export function isWideSettingsPanel(panel: SettingsPanelId) {
  return panel === "models" || panel === "tools"
}
