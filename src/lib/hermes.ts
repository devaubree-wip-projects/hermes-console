import { PERMISSION_KEYS, PERMISSION_LABELS, type WorkspacePermissions } from "@/lib/permissions";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export function hermesModel(): string {
  return process.env.HERMES_MODEL ?? "hermes";
}

/**
 * Calls the Hermes gateway (OpenAI-compatible /v1) in streaming mode and
 * returns the upstream Response whose body is an SSE stream of
 * `data: {"choices":[{"delta":{"content":"..."}}]}` chunks ending with `data: [DONE]`.
 */
export async function streamHermesChat(opts: {
  baseUrl: string;
  apiKey?: string | null;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<Response> {
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: hermesModel(),
      messages: opts.messages,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Hermes gateway error ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res;
}

/** Extracts the text deltas from one raw SSE line ("data: {...}"). */
export function parseSseDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;
  try {
    const json = JSON.parse(payload) as {
      choices?: { delta?: { content?: string } }[];
    };
    return json.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

export function buildSystemPrompt(input: {
  workspaceName: string;
  permissions: WorkspacePermissions;
  memoryItems: string[];
  fileNames: string[];
}): string {
  const granted = PERMISSION_KEYS.filter((k) => input.permissions[k]).map(
    (k) => `- ${PERMISSION_LABELS[k].label}`,
  );
  const denied = PERMISSION_KEYS.filter((k) => !input.permissions[k]).map(
    (k) => `- ${PERMISSION_LABELS[k].label}`,
  );

  const sections = [
    `Tu es l'assistant métier du workspace « ${input.workspaceName} ». Tu réponds en français, de façon professionnelle et concrète, à un client non technique.`,
    `Capacités autorisées par le client :\n${granted.join("\n") || "- (aucune)"}`,
    `Capacités NON autorisées (ne jamais prétendre les exécuter ; proposer à la place une action à faire valider) :\n${denied.join("\n") || "- (aucune)"}`,
  ];

  if (input.memoryItems.length > 0) {
    sections.push(`Connaissances retenues sur ce client :\n${input.memoryItems.map((m) => `- ${m}`).join("\n")}`);
  }
  if (input.fileNames.length > 0) {
    sections.push(
      `Fichiers déposés dans le workspace (noms uniquement, contenu non inclus dans ce POC) :\n${input.fileNames.map((f) => `- ${f}`).join("\n")}`,
    );
  }
  return sections.join("\n\n");
}
