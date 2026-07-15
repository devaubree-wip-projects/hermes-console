export const AGENT_CREATE_COMMAND = "/agent-create";

export function parseAgentCreateCommand(text: string): string | null {
  const normalized = text.trim().replace(
    /^:command\[\/agent-create\](?:\{name=agent-create\})?/i,
    AGENT_CREATE_COMMAND,
  );
  const match = normalized.match(/^\/agent-create(?=$|\s|:)\s*:?\s*([\s\S]*)$/i);
  return match ? (match[1] ?? "").trim() : null;
}

function trimAtWord(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, maxLength + 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return (lastSpace > maxLength / 2 ? shortened.slice(0, lastSpace) : value.slice(0, maxLength)).trim();
}

export function agentCreatePayload(prompt: string) {
  const description = prompt.replace(/\s+/g, " ").trim().slice(0, 500);
  const nameSeed = description
    .replace(
      /^(?:(?:crée|cree|créer|creer)(?:-moi)?\s+)?(?:(?:un|une|le|la)\s+)?(?:agent|assistant)\s*(?:qui|pour|spécialisé(?:e)?\s+(?:dans|en))?\s*/i,
      "",
    )
    .trim() || description;
  const words = nameSeed.split(" ").slice(0, 10).join(" ");
  const conciseName = trimAtWord(words, 80);
  const name = conciseName
    ? `${conciseName.charAt(0).toLocaleUpperCase("fr-FR")}${conciseName.slice(1)}`
    : "Nouvel agent";

  return { name, description };
}
