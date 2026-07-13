export const PERMISSION_KEYS = [
  "read_files",
  "web_search",
  "generate_reports",
  "propose_changes",
  "edit_files",
  "send_emails",
  "open_prs",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type WorkspacePermissions = Record<PermissionKey, boolean>;

export const PERMISSION_LABELS: Record<
  PermissionKey,
  { label: string; description: string; sensitive: boolean }
> = {
  read_files: {
    label: "Lire mes fichiers",
    description: "L'agent peut consulter les fichiers déposés dans le workspace.",
    sensitive: false,
  },
  web_search: {
    label: "Chercher sur le web",
    description: "L'agent peut effectuer des recherches web pour enrichir ses réponses.",
    sensitive: false,
  },
  generate_reports: {
    label: "Générer des rapports",
    description: "L'agent peut produire des rapports et livrables structurés.",
    sensitive: false,
  },
  propose_changes: {
    label: "Proposer des modifications",
    description: "L'agent peut suggérer des modifications (code, contenu) sans les appliquer.",
    sensitive: false,
  },
  edit_files: {
    label: "Modifier directement mes fichiers",
    description: "L'agent peut appliquer des modifications sans validation préalable.",
    sensitive: true,
  },
  send_emails: {
    label: "Envoyer des emails",
    description: "L'agent peut rédiger et envoyer des emails en mon nom.",
    sensitive: true,
  },
  open_prs: {
    label: "Ouvrir des PR GitHub",
    description: "L'agent peut ouvrir des pull requests sur mes dépôts.",
    sensitive: true,
  },
};

export const DEFAULT_PERMISSIONS: WorkspacePermissions = {
  read_files: true,
  web_search: true,
  generate_reports: true,
  propose_changes: true,
  edit_files: false,
  send_emails: false,
  open_prs: false,
};

export function normalizePermissions(value: unknown): WorkspacePermissions {
  const raw = (value ?? {}) as Partial<Record<PermissionKey, unknown>>;
  const result = { ...DEFAULT_PERMISSIONS };
  for (const key of PERMISSION_KEYS) {
    if (typeof raw[key] === "boolean") result[key] = raw[key] as boolean;
  }
  return result;
}
