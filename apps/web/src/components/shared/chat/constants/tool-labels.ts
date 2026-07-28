/** Human-readable French labels for Hermes tool names. */

const TOOL_LABELS: Record<string, string> = {
  read: "Lecture de fichiers",
  write: "Écriture de fichiers",
  edit: "Modification de fichiers",
  list: "Liste de fichiers",
  glob: "Recherche de fichiers",
  grep: "Recherche dans le code",
  bash: "Commande shell",
  shell: "Commande shell",
  web_search: "Recherche web",
  web_fetch: "Lecture web",
  browser: "Navigation web",
  search: "Recherche",
};

export function toolDisplayLabel(toolName: string, count = 1) {
  const normalized = toolName.trim().toLowerCase();
  const label = TOOL_LABELS[normalized] ?? toolName;
  if (count <= 1) return label;
  return `${label} · ${count}`;
}
