const LOCAL_SOURCES = new Set(["", "web", "local"]);

const SOURCE_LABELS: Record<string, string> = {
  acp: "ACP",
  cli: "CLI",
  cron: "Cron",
  discord: "Discord",
  signal: "Signal",
  slack: "Slack",
  teams: "Teams",
  telegram: "Telegram",
  tui: "TUI",
  webhook: "Webhook",
  whatsapp: "WhatsApp",
};

export type SessionOrigin = {
  id: string;
  label: string;
};

export function sessionOrigin(source: unknown): SessionOrigin | null {
  if (typeof source !== "string") return null;

  const id = source.trim().toLowerCase();
  if (LOCAL_SOURCES.has(id)) return null;

  const label = SOURCE_LABELS[id]
    ?? id
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .slice(0, 24);

  return label ? { id, label } : null;
}
