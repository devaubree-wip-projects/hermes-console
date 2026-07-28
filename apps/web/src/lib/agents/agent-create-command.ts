export const AGENT_CREATE_COMMAND = "/agent-create";

export type AgentCreateRequest = {
  prompt: string;
  source: "slash" | "natural";
};

export type AgentCreateProposal = {
  name: string;
  description: string;
  sourceAgentId: string;
  idempotencyKey: string;
};

export function parseAgentCreateCommand(text: string): string | null {
  const normalized = text.trim().replace(
    /^:command\[\/agent-create\](?:\{name=agent-create\})?/i,
    AGENT_CREATE_COMMAND,
  );
  const match = normalized.match(/^\/agent-create(?=$|\s|:)\s*:?\s*([\s\S]*)$/i);
  return match ? (match[1] ?? "").trim() : null;
}

const NATURAL_AGENT_CREATE_PATTERNS = [
  /^(?:(?:s['’]il te pla[iî]t|stp|merci)[,\s]+)?(?:(?:(?:peux|pourrais)-tu)\s+|(?:(?:je (?:veux|souhaite|voudrais)|j['’]aimerais)\s+(?:(?:que tu|te voir)\s+)?))?(?:me\s+)?(?:cr[eé]e(?:r)?|con[cç]ois|configure|fais|ajoute)(?:-moi)?\s+(?:un|une)\s+(?:(?:nouvel|nouvelle)\s+)?(?:agent|assistant)\b/i,
  /^(?:please[,\s]+)?(?:(?:(?:can|could|would) you)\s+|(?:i (?:want|need|would like)\s+(?:(?:you to|to)\s+)?))?(?:create|build|configure|make|add)(?:\s+me)?\s+(?:an?|the)\s+(?:new\s+)?(?:agent|assistant)\b/i,
  /^(?:je (?:veux|souhaite|voudrais)|j['’]aimerais|il me faut)\s+(?:un|une)\s+(?:(?:nouvel|nouvelle)\s+)?(?:agent|assistant)\b/i,
  /^j['’]ai besoin d['’](?:un|une)\s+(?:(?:nouvel|nouvelle)\s+)?(?:agent|assistant)\b/i,
  /^(?:i (?:want|need|would like))\s+(?:an?|the)\s+(?:new\s+)?(?:agent|assistant)\b/i,
] as const;

export function parseAgentCreateRequest(text: string): AgentCreateRequest | null {
  const slashPrompt = parseAgentCreateCommand(text);
  if (slashPrompt !== null) {
    return { prompt: slashPrompt, source: "slash" };
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (!NATURAL_AGENT_CREATE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return null;
  }
  return { prompt: normalized, source: "natural" };
}

function trimAtWord(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, maxLength + 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return (lastSpace > maxLength / 2 ? shortened.slice(0, lastSpace) : value.slice(0, maxLength)).trim();
}

export function agentCreatePayload(prompt: string) {
  const description = prompt.replace(/\s+/g, " ").trim().slice(0, 500);
  const naturalPrefix = NATURAL_AGENT_CREATE_PATTERNS.find((pattern) =>
    pattern.test(description)
  );
  const withoutRequest = naturalPrefix
    ? description.replace(naturalPrefix, "")
    : description.replace(
      /^(?:(?:un|une|le|la|an?|the)\s+)?(?:(?:nouvel|nouvelle|new)\s+)?(?:agent|assistant)\b/i,
      "",
    );
  const nameSeed = withoutRequest
    .replace(
      /^\s*(?:qui|pour|spécialisé(?:e)?\s+(?:dans|en)|that|to|for|speciali[sz]ed\s+(?:in|for))?\s*/i,
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

export function agentCreateRequestPayload(
  prompt: string,
  context: { sourceAgentId: string; idempotencyKey: string },
): AgentCreateProposal {
  return {
    ...agentCreatePayload(prompt),
    sourceAgentId: context.sourceAgentId,
    idempotencyKey: context.idempotencyKey,
  };
}
